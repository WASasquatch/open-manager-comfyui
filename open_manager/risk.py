"""Findings about an install, ordered by severity."""

from __future__ import annotations

import posixpath
import zipfile
from dataclasses import dataclass
from typing import Iterable

from . import advisories, installer

__all__ = [
    "Finding",
    "Assessment",
    "assess_resolution",
    "assess_version",
    "inspect_artifact",
    "repository_findings",
    "SEVERITY_ORDER",
]

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


CORE_REPOS = frozenset({
    ("comfyanonymous", "comfyui"),
    ("comfy-org", "comfyui"),
    ("comfy-org", "comfyui_frontend"),
    ("comfy-org", "comfyui-frontend"),
    ("comfy-org", "comfyui-desktop"),
})

MANAGER_REPOS = frozenset({
    ("ltdrdata", "comfyui-manager"),
    ("comfy-org", "comfyui-manager"),
})


def repository_findings(owner: str, repo: str) -> list[Finding]:
    """What is worth saying about the repository an install would come from.

    Args:
        owner: Repository owner.
        repo: Repository name.

    Returns:
        Findings, empty where the repository is an ordinary pack.
    """
    pair = ((owner or "").strip().lower(), (repo or "").strip().lower().removesuffix(".git"))
    if pair in CORE_REPOS:
        return [
            Finding(
                severity="caution",
                title="This is ComfyUI itself, not a node pack",
                detail="The repository is ComfyUI or part of its tooling. Installing it "
                       "places a second copy inside custom_nodes, where it is not a pack "
                       "and will not load. A registry entry sometimes names it by mistake.",
                evidence=(f"repository: {pair[0]}/{pair[1]}",),
            )
        ]
    if pair in MANAGER_REPOS:
        return [
            Finding(
                severity="note",
                title="This is another package manager",
                detail="Each manager keeps its own record of what it installed.",
                evidence=(f"repository: {pair[0]}/{pair[1]}",),
            )
        ]
    return []


_BANNED_TITLE = "Withdrawn by the registry"

_SCANNER_NOTE = (
    "The registry's automated scanner also issues bans, and a ban is not a confirmed "
    "compromise."
)

_STATUS_TEXT = {
    "flagged": (
        "caution",
        "Flagged by the registry's automated scan",
        "The registry marked this version flagged and publishes no reason, category or "
        "report for it.",
    ),
    "banned": (
        "critical",
        _BANNED_TITLE,
        "The registry banned this version. Bans are meant for harmful versions and carry no "
        "published reason, category or report.\n\n"
        + _SCANNER_NOTE,
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
    compatibility: dict | None = None,
) -> Assessment:
    """Everything worth saying about installing one published version.

    Args:
        pack_id: Registry identifier of the pack.
        version: Exact version being installed.
        status: Short registry status, as :mod:`.registry` reports it.
        dependencies: Requirement lines the version declares.
        deprecated: Whether the publisher marked the version deprecated.
        compatibility: The result of :func:`.compat.check` for this version, where the
            version declared anything.

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
                detail="The registry reported a status Open Manager does not recognise.",
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
        option, why = installer.requirement_redirect(text)
        if option:
            findings.append(
                Finding(
                    severity="caution",
                    title=f"Requirements file carries {option}, which {why}",
                    detail="Open Manager holds it back and installs the packages "
                           "without it.",
                    evidence=(f"requirement: {text}",),
                )
            )
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

    for note in (compatibility or {}).get("notes", ()):
        if note.get("state") != "differs":
            continue
        findings.append(
            Finding(
                severity="note",
                title=f"Declared {note['label']} does not match this install",
                detail=f"The publisher declared {note['declared']} for this version. "
                       f"This install reports {note['yours']}.",
                evidence=(f"declared: {note['declared']}", f"installed: {note['yours']}"),
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
        if findings[0].title == _BANNED_TITLE:
            return (
                "Open Manager has not checked whether the ban is right and cannot undo what "
                "the code does once it runs. A custom node reads and writes anything the "
                "account running ComfyUI can reach."
            )
        return (
            "This install is recorded as harmful. Installing it can compromise credentials "
            "and files reachable by the account ComfyUI runs under."
        )
    if findings[0].severity == "caution":
        return (
            "A custom node runs with ComfyUI's privileges and can read and write any file "
            "the account running ComfyUI can reach."
        )
    return ""


_EXECUTES_ON_INSTALL = ("install.py", "prestartup_script.py")

_PICKLE_FORMATS = (".pkl", ".pickle", ".pt", ".pth", ".ckpt", ".joblib", ".dill")

_NATIVE_FORMATS = (".pyd", ".so", ".dylib", ".dll")

_SAFE_WEIGHTS = ".safetensors"

_WHEEL = ".whl"

_TAG_CAP = 4

def _detected(paths: list[str]) -> tuple[str, ...]:
    """Evidence as a tally of what turned up rather than a list of where.

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
        if posixpath.basename(parent) == "__pycache__":
            parent = posixpath.dirname(parent)
        expected = posixpath.join(parent, f"{stem}.py") if parent else f"{stem}.py"
        if expected not in sources:
            orphans.append(name)
    return orphans


def _wheel_tags(paths: list[str]) -> tuple[str, ...]:
    """The compatibility tags the bundled wheels are built for.

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
                detail="A prebuilt package, not fetched from an index.",
                evidence=_detected(wheels) + (f"built for: {', '.join(tags)}",),
            )
        )

    orphans = sorted(_sourceless_bytecode(names))
    if orphans:
        findings.append(
            Finding(
                severity="caution",
                title="Ships compiled Python without its source",
                detail="Bytecode with no matching .py, so it cannot be read.",
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
            findings.append(
                Finding(
                    severity="caution",
                    title="Requirements set a pip option",
                    detail="A requirements line is a pip option rather than a package. "
                           "Options such as --index-url or --find-links change where pip "
                           "fetches from, and the dependency preview does not act on them.",
                    evidence=(f"requirement: {stripped}",),
                )
            )
        elif "://" in lowered or lowered.startswith("file:"):
            findings.append(
                Finding(
                    severity="caution",
                    title="Installs a package from a URL or path",
                    detail="The requirement names a URL, archive or path rather than a "
                           "package on an index, so it is not a pinned release. The "
                           "dependency preview does not resolve it.",
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
