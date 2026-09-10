"""Published supply-chain compromises, recorded so a warning can cite one.

Each entry names a package or pack version confirmed compromised and shipped to users, with
a reference to the published incident.
"""

from __future__ import annotations

from dataclasses import dataclass

__all__ = ["Advisory", "for_pack", "for_requirement", "PACK_ADVISORIES", "PIP_ADVISORIES"]


@dataclass(frozen=True)
class Advisory:
    """A confirmed compromise.

    Attributes:
        subject: Pack identifier or pip requirement the advisory concerns.
        versions: Affected versions, empty where every version is affected.
        summary: What the compromised build did.
        reference: URL describing the incident.
    """

    subject: str
    versions: tuple[str, ...]
    summary: str
    reference: str


#: Node packs published in a compromised state.
PACK_ADVISORIES: tuple[Advisory, ...] = (
    Advisory(
        subject="ComfyUI_LLMVISION",
        versions=(),
        summary="Shipped code that collected browser credentials and wallet data and sent "
                "them to an attacker-controlled endpoint.",
        reference="https://github.com/comfyanonymous/ComfyUI/issues/3815",
    ),
)

#: Python distributions published in a compromised state.
PIP_ADVISORIES: tuple[Advisory, ...] = (
    Advisory(
        subject="ultralytics",
        versions=("8.3.41", "8.3.42", "8.3.45", "8.3.46"),
        summary="Release artifacts carried a cryptominer injected through a compromised "
                "build workflow.",
        reference="https://github.com/ultralytics/ultralytics/issues/18027",
    ),
    Advisory(
        subject="litellm",
        versions=("1.82.7", "1.82.8"),
        summary="Release artifacts carried code that exfiltrated environment variables.",
        reference="https://github.com/BerriAI/litellm/issues",
    ),
)


def _matches(advisory: Advisory, version: str) -> bool:
    """Whether an advisory covers a version.

    Args:
        advisory: The advisory under test.
        version: Version string, which may be empty.

    Returns:
        True where the advisory names this version or names none at all.
    """
    return not advisory.versions or version in advisory.versions


def for_pack(pack_id: str, version: str = "") -> tuple[Advisory, ...]:
    """Advisories covering a node pack.

    Args:
        pack_id: Registry identifier or directory name.
        version: Exact version, where known.

    Returns:
        Every advisory that applies, empty where none does.
    """
    folded = (pack_id or "").strip().lower()
    return tuple(
        entry
        for entry in PACK_ADVISORIES
        if entry.subject.lower() == folded and _matches(entry, version)
    )


def for_requirement(requirement: str) -> tuple[Advisory, ...]:
    """Advisories covering a pip requirement line.

    Args:
        requirement: A line such as ``ultralytics==8.3.41`` or ``ultralytics``.

    Returns:
        Every advisory that applies, empty where none does.
    """
    text = (requirement or "").strip()
    if not text or text.startswith("#"):
        return ()
    name = text
    version = ""
    for separator in ("==", ">=", "<=", "~=", ">", "<", "!="):
        if separator in text:
            name, _, version = text.partition(separator)
            break
    folded = name.strip().lower()
    return tuple(
        entry
        for entry in PIP_ADVISORIES
        if entry.subject.lower() == folded and _matches(entry, version.strip())
    )
