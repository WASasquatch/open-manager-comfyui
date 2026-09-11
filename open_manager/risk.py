"""Findings about an install, ordered by severity.

``critical`` is a documented compromise carrying a reference, ``caution`` is a material
change to the environment, and ``note`` is context. No function here grants or withholds
permission.
"""

from __future__ import annotations

import posixpath
import zipfile
from dataclasses import dataclass, field
from typing import Iterable

from . import advisories

__all__ = [
    "Finding",
    "Assessment",
    "assess_resolution",
    "assess_version",
    "inspect_artifact",
    "SEVERITY_ORDER",
]

#: Severities, most serious first.
SEVERITY_ORDER = ("critical", "caution", "note")

_RANK = {name: index for index, name in enumerate(SEVERITY_ORDER)}


@dataclass(frozen=True)
class Finding:
    """One thing worth saying before an install.

    Attributes:
        severity: One of :data:`SEVERITY_ORDER`.
        title: Short label, shown in the list.
        detail: One or two sentences of plain description.
        evidence: Facts backing the finding, each a short ``label: value`` string.
        reference: URL supporting the finding, empty where there is none.
    """

    severity: str
    title: str
    detail: str
    evidence: tuple[str, ...] = ()
    reference: str = ""


@dataclass(frozen=True)
class Assessment:
    """Everything known about one install, with no verdict attached.

    Attributes:
        findings: Findings, most serious first.
        acknowledgement: Sentence a confirmation dialog should show, empty where the
            install is unremarkable.
    """

    findings: tuple[Finding, ...] = ()
    acknowledgement: str = ""

    @property
    def severity(self) -> str:
        """The most serious severity present, or an empty string for a clean assessment."""
        return self.findings[0].severity if self.findings else ""

    @property
    def is_clean(self) -> bool:
        """Whether nothing was found worth saying."""
        return not self.findings


def _ordered(findings: Iterable[Finding]) -> tuple[Finding, ...]:
    """Sort findings by severity, keeping insertion order within a severity."""
    return tuple(sorted(findings, key=lambda item: _RANK.get(item.severity, len(SEVERITY_ORDER))))


_STATUS_TEXT = {
    "flagged": (
        "caution",
        "Flagged by the registry's automated scan",
        "The registry marked this version flagged. It publishes no reason, no category and "
        "no report, so what the scan objected to is not knowable from the registry.",
    ),
    "banned": (
        "critical",
        "Withdrawn by the registry",
        "The registry banned this version. A ban is applied to versions believed harmful, "
        "and unlike a flag it is not routine.",
    ),
    "deleted": (
        "caution",
        "Deleted by the publisher",
        "The publisher removed this version from the registry.",
    ),
    "pending": (
        "note",
        "Published, not yet scanned",
        "The registry has not finished processing this version.",
    ),
}


def assess_version(
    pack_id: str,
    version: str,
    status: str,
    dependencies: Iterable[str] = (),
    deprecated: bool = False,
) -> Assessment:
    """Everything worth saying about installing one published version.

    Args:
        pack_id: Registry identifier of the pack.
        version: Exact version being installed.
        status: Short registry status, as :mod:`.registry` reports it.
        dependencies: Requirement lines the version declares.
        deprecated: Whether the publisher marked the version deprecated.

    Returns:
        An :class:`Assessment`.
    """
    findings: list[Finding] = []

    for entry in advisories.for_pack(pack_id, version):
        findings.append(
            Finding(
                severity="critical",
                title="Known compromised release",
                detail=entry.summary,
                evidence=(f"pack: {entry.subject}", f"version: {version or 'any'}"),
                reference=entry.reference,
            )
        )

    known = _STATUS_TEXT.get(status)
    if known is not None:
        severity, title, detail = known
        findings.append(
            Finding(
                severity=severity,
                title=title,
                detail=detail,
                evidence=(f"registry status: {status}", f"version: {version}"),
            )
        )
    elif status and status != "active":
        findings.append(
            Finding(
                severity="caution",
                title=f"Unrecognised registry status: {status}",
                detail="The registry reported a status this client does not know. It is "
                       "shown rather than hidden.",
                evidence=(f"registry status: {status}",),
            )
        )

    for requirement in dependencies:
        for entry in advisories.for_requirement(requirement):
            findings.append(
                Finding(
                    severity="critical",
                    title=f"Requires a compromised package: {entry.subject}",
                    detail=entry.summary,
                    evidence=(f"requirement: {requirement}",),
                    reference=entry.reference,
                )
            )
        text = requirement.strip()
        if text.startswith(("git+", "-e ", "--editable")) or "git+" in text:
            findings.append(
                Finding(
                    severity="caution",
                    title="Installs a package straight from a git URL",
                    detail="The requirement is fetched from a repository rather than an "
                           "index, so what arrives is whatever that branch holds at install "
                           "time and is not pinned to a reviewed release.",
                    evidence=(f"requirement: {text}",),
                )
            )

    if deprecated:
        findings.append(
            Finding(
                severity="note",
                title="Marked deprecated by the publisher",
                detail="The publisher no longer recommends this version.",
                evidence=(f"version: {version}",),
            )
        )

    ordered = _ordered(findings)
    return Assessment(findings=ordered, acknowledgement=_acknowledgement(ordered))


def assess_resolution(
    advertised: str, newest: str, newest_status: str, withheld: Iterable[str] = ()
) -> Assessment:
    """What an install with no version named would fetch.

    Args:
        advertised: Version the registry names as latest.
        newest: Most recently published version that was not withdrawn.
        newest_status: Registry status of ``newest``.
        withheld: Versions the registry banned or deleted.

    Returns:
        An :class:`Assessment` describing the gap, clean where there is none.
    """
    findings: list[Finding] = []
    if newest and advertised and newest != advertised:
        findings.append(
            Finding(
                severity="caution",
                title=f"An unqualified install gives {advertised}, not {newest}",
                detail="The advertised version is older than the newest published version.",
                evidence=(
                    f"registry advertises: {advertised}",
                    f"newest published: {newest} ({newest_status})",
                ),
            )
        )
    held = tuple(withheld)
    if held:
        findings.append(
            Finding(
                severity="note",
                title=f"{len(held)} version(s) withdrawn by the registry",
                detail="These are listed but are not offered by any automatic resolution.",
                evidence=tuple(f"version: {item}" for item in held),
            )
        )
    ordered = _ordered(findings)
    return Assessment(findings=ordered, acknowledgement=_acknowledgement(ordered))


def _acknowledgement(findings: tuple[Finding, ...]) -> str:
    """The sentence a confirmation should carry for a set of findings."""
    if not findings:
        return ""
    if findings[0].severity == "critical":
        return (
            "This install is recorded as harmful. Installing it can compromise credentials "
            "and files reachable by the account ComfyUI runs under. Continue only if the "
            "reason is understood."
        )
    if findings[0].severity == "caution":
        return (
            "A custom node runs with the same privileges as ComfyUI itself, so it can read "
            "and write any file that account can reach. Continue if the source is trusted."
        )
    return "Nothing here blocks the install."


#: Archive members that mean code runs at install or import time.
_EXECUTES_ON_INSTALL = ("install.py", "prestartup_script.py")

#: Extensions that hold pickled objects. Reading one runs whatever it was built to run,
#: because unpickling calls back into the interpreter; this is a property of the format, not
#: a claim about any particular file.
_PICKLE_FORMATS = (".pkl", ".pickle", ".pt", ".pth", ".ckpt", ".joblib", ".dill")

#: Extensions holding compiled native code. It executes with the interpreter's privileges
#: and cannot be read before it does.
_NATIVE_FORMATS = (".pyd", ".so", ".dylib", ".dll")

#: The weights format that carries no code, named as the alternative when a pickle one turns
#: up. Never itself reported.
_SAFE_WEIGHTS = ".safetensors"

#: A prebuilt Python package carried in the repository rather than fetched from an index.
_WHEEL = ".whl"

#: Compatibility tags named before the rest are summarised. A pack shipping a wheel per
#: platform would otherwise fill the block it is meant to fit in.
_TAG_CAP = 4

def _detected(paths: list[str]) -> tuple[str, ...]:
    """Evidence as a tally of what turned up rather than a list of where.

    The reader is deciding whether the kind of thing is expected, not auditing paths, and a
    long pack would otherwise print a directory listing into the dialog.

    Args:
        paths: Archive members that matched.

    Returns:
        A single evidence line naming each extension and how many of it there are.
    """
    counts: dict[str, int] = {}
    for path in paths:
        ext = posixpath.splitext(path)[1].lower()
        counts[ext] = counts.get(ext, 0) + 1
    kinds = ", ".join(
        f"{ext} ({count})"
        for ext, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    )
    return (f"detected: {kinds}",)


def _sourceless_bytecode(names: list[str]) -> list[str]:
    """Compiled Python in the archive with no matching source beside it.

    ``__pycache__`` beside its own sources is ordinary build residue. Bytecode whose source
    is absent is not: it is Python that cannot be read.

    Args:
        names: Every member path in the archive.

    Returns:
        The paths of bytecode files with no corresponding ``.py``.
    """
    sources = {name for name in names if name.endswith(".py")}
    orphans = []
    for name in names:
        if not name.endswith((".pyc", ".pyo")):
            continue
        stem = posixpath.basename(name).split(".")[0]
        parent = posixpath.dirname(name)
        # __pycache__/x.cpython-311.pyc belongs to ../x.py
        if posixpath.basename(parent) == "__pycache__":
            parent = posixpath.dirname(parent)
        expected = posixpath.join(parent, f"{stem}.py") if parent else f"{stem}.py"
        if expected not in sources:
            orphans.append(name)
    return orphans


def _wheel_tags(paths: list[str]) -> tuple[str, ...]:
    """The compatibility tags the bundled wheels are built for.

    A wheel filename ends in ``python-abi-platform``, which is what decides whether it fits
    the interpreter it is being installed into. Surfacing it lets the reader answer that
    without unpacking anything.

    Args:
        paths: Archive members ending in ``.whl``.

    Returns:
        The distinct tag triples found, in the order first seen.
    """
    tags: list[str] = []
    for path in paths:
        stem = posixpath.basename(path)[: -len(_WHEEL)]
        parts = stem.split("-")
        tag = "-".join(parts[-3:]) if len(parts) >= 3 else stem
        if tag not in tags:
            tags.append(tag)
    if len(tags) > _TAG_CAP:
        return tuple(tags[:_TAG_CAP]) + (f"and {len(tags) - _TAG_CAP} more",)
    return tuple(tags)


def _uncommon_payloads(names: list[str]) -> list[Finding]:
    """Findings for files a custom node does not usually carry.

    A custom node is ordinarily Python and web assets. Compiled binaries, pickle-format data
    and compiled Python without its source each run or conceal code that cannot be read
    beforehand. None of this proves ill intent, and plenty of honest packs ship a model
    file; it is reported so the decision is an informed one rather than a blind one.

    Args:
        names: Every member path in the archive.

    Returns:
        Findings, empty where the archive holds none of these.
    """
    findings: list[Finding] = []
    lower = [(name, name.lower()) for name in names if not name.endswith("/")]

    native = sorted(n for n, low in lower if low.endswith(_NATIVE_FORMATS))
    if native:
        findings.append(
            Finding(
                severity="caution",
                title="Ships compiled binaries",
                detail="Native code, which runs unreviewed with ComfyUI's privileges. "
                       "Uncommon in a custom node. False positives possible.",
                evidence=_detected(native),
            )
        )

    pickles = sorted(n for n, low in lower if low.endswith(_PICKLE_FORMATS))
    if pickles:
        findings.append(
            Finding(
                severity="caution",
                title="Ships pickle-format data",
                detail="Loading one of these runs code stored inside it. "
                       f"{_SAFE_WEIGHTS} carries none. False positives possible.",
                evidence=_detected(pickles),
            )
        )

    wheels = sorted(n for n, low in lower if low.endswith(_WHEEL))
    if wheels:
        tags = _wheel_tags(wheels)
        findings.append(
            Finding(
                severity="note",
                title="Bundles a Python wheel",
                detail="A prebuilt package, not fetched from an index. Check the tags fit "
                       "this machine and that you trust the author. False positives possible.",
                evidence=_detected(wheels) + (f"built for: {', '.join(tags)}",),
            )
        )

    orphans = sorted(_sourceless_bytecode(names))
    if orphans:
        findings.append(
            Finding(
                severity="caution",
                title="Ships compiled Python without its source",
                detail="Bytecode with no matching .py, so it cannot be read. Often just a "
                       "careless build. False positives possible.",
                evidence=_detected(orphans),
            )
        )
    return findings


def inspect_artifact(path: str) -> Assessment:
    """Read a downloaded pack archive and report what it will do on arrival.

    Args:
        path: Path to a ``.zip`` artifact.

    Returns:
        An :class:`Assessment`. An unreadable archive is reported as a finding.
    """
    findings: list[Finding] = []
    try:
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            requirements = _read_requirements(archive, names)
    except (OSError, zipfile.BadZipFile) as error:
        return Assessment(
            findings=(
                Finding(
                    severity="caution",
                    title="Archive could not be read",
                    detail="The downloaded artifact is not a readable zip.",
                    evidence=(f"{type(error).__name__}: {error}",),
                ),
            ),
            acknowledgement="The artifact could not be inspected.",
        )

    scripted = sorted(
        {
            posixpath.basename(name)
            for name in names
            if posixpath.basename(name) in _EXECUTES_ON_INSTALL
        }
    )
    if scripted:
        findings.append(
            Finding(
                severity="caution",
                title="Runs code on install",
                detail="The pack carries a script ComfyUI executes when the pack is "
                       "installed or started, before any node is used.",
                evidence=tuple(f"file: {name}" for name in scripted),
            )
        )

    findings.extend(_uncommon_payloads(names))

    for requirement in requirements:
        for entry in advisories.for_requirement(requirement):
            findings.append(
                Finding(
                    severity="critical",
                    title=f"Requires a compromised package: {entry.subject}",
                    detail=entry.summary,
                    evidence=(f"requirement: {requirement}",),
                    reference=entry.reference,
                )
            )
        stripped = requirement.strip()
        lowered = stripped.lower()
        if "git+" in lowered:
            findings.append(
                Finding(
                    severity="caution",
                    title="Installs a package straight from a git URL",
                    detail="The requirement is fetched from a repository rather than an "
                           "index, so it is not pinned to a reviewed release.",
                    evidence=(f"requirement: {stripped}",),
                )
            )
        elif stripped.startswith("-"):
            # A pip option in requirements.txt, e.g. --index-url or --find-links, can point
            # the install at an index or location the author chose. The dependency preview
            # does not act on these, so they are named here instead of silently ignored.
            findings.append(
                Finding(
                    severity="caution",
                    title="Requirements set a pip option",
                    detail="A requirements line is a pip option rather than a package. "
                           "Options such as --index-url or --find-links redirect where pip "
                           "fetches from, and are not evaluated by the dependency preview.",
                    evidence=(f"requirement: {stripped}",),
                )
            )
        elif ("://" in lowered or lowered.startswith("file:")
                or ("@" in stripped and "://" in lowered)):
            findings.append(
                Finding(
                    severity="caution",
                    title="Installs a package from a URL or path",
                    detail="The requirement points at a URL, archive or local path rather "
                           "than a named package on an index, so it is not a reviewed, "
                           "pinned release. The dependency preview does not resolve it.",
                    evidence=(f"requirement: {stripped}",),
                )
            )

    findings.append(
        Finding(
            severity="note",
            title="Archive contents",
            detail="What the artifact holds.",
            evidence=(
                f"files: {len(names)}",
                f"requirements: {len(requirements)}",
            ),
        )
    )

    ordered = _ordered(findings)
    return Assessment(findings=ordered, acknowledgement=_acknowledgement(ordered))


def _read_requirements(archive: zipfile.ZipFile, names: list[str]) -> list[str]:
    """Requirement lines declared anywhere in a pack archive.

    Args:
        archive: Open archive.
        names: Its member names.

    Returns:
        Every non-comment requirement line found.
    """
    lines: list[str] = []
    for name in names:
        if posixpath.basename(name) != "requirements.txt":
            continue
        try:
            body = archive.read(name).decode("utf-8", errors="replace")
        except (OSError, KeyError):
            continue
        lines.extend(
            line.strip()
            for line in body.splitlines()
            if line.strip() and not line.strip().startswith("#")
        )
    return lines
