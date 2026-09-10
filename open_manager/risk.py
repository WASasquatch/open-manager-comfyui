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
        if "git+" in requirement:
            findings.append(
                Finding(
                    severity="caution",
                    title="Installs a package straight from a git URL",
                    detail="The requirement is fetched from a repository rather than an "
                           "index, so it is not pinned to a reviewed release.",
                    evidence=(f"requirement: {requirement.strip()}",),
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
