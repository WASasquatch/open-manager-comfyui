"""What installing a version would do to the packages already present.

The resolve runs ``pip install --dry-run --report -``, which reports what a requirement set
would add and what it would replace. Nothing here installs.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

__all__ = ["CORE_PACKAGES", "Impact", "Replacement", "analyse", "findings_from"]

#: Seconds a resolve may take before it is abandoned.
TIMEOUT = 180

#: Packages the host manager refuses to downgrade. A requirement needing one of these moved
#: is dropped, and the install still reports success.
HOST_PROTECTED = frozenset(
    {"torch", "torchaudio", "torchsde", "torchvision", "transformers", "safetensors", "kornia"}
)

#: Packages a running ComfyUI depends on, where a replacement is reported prominently.
CORE_PACKAGES = frozenset(
    {
        "torch", "torchaudio", "torchvision", "torchsde", "transformers", "safetensors",
        "kornia", "numpy", "scipy", "pillow", "opencv-python", "opencv-python-headless",
        "opencv-contrib-python", "scikit-image", "scikit-learn", "huggingface-hub",
        "tokenizers", "accelerate", "aiohttp", "pyyaml", "einops", "tqdm",
    }
)


@dataclass(frozen=True)
class Replacement:
    """One installed distribution that would be replaced.

    Attributes:
        name: Distribution name as pip spells it.
        have: Version installed now.
        want: Version that would take its place.
        direction: ``downgrade``, ``upgrade`` or ``change``.
        is_core: Whether a running ComfyUI depends on this package.
        host_skips: Whether the host manager would drop this requirement instead of
            applying it.
        abi_break: Whether this crosses a major version of an ABI-sensitive package.
    """

    name: str
    have: str
    want: str
    direction: str
    is_core: bool
    host_skips: bool = False
    abi_break: bool = False


@dataclass(frozen=True)
class Impact:
    """What a requirement set would do to this environment.

    Attributes:
        additions: ``name==version`` for each distribution that is not installed.
        replacements: One :class:`Replacement` per installed distribution that would move.
        failure: Why pip could not answer, empty where it did.
        checked: Whether a resolve actually ran.
    """

    additions: tuple[str, ...] = ()
    replacements: tuple[Replacement, ...] = ()
    failure: str = ""
    checked: bool = False

    @property
    def is_additive(self) -> bool:
        """Whether nothing already installed would move."""
        return self.checked and not self.failure and not self.replacements

    @property
    def core_replacements(self) -> tuple[Replacement, ...]:
        """Replacements that touch a package a running ComfyUI depends on."""
        return tuple(entry for entry in self.replacements if entry.is_core)

    @property
    def downgrades(self) -> tuple[Replacement, ...]:
        """Replacements that move a package backwards."""
        return tuple(entry for entry in self.replacements if entry.direction == "downgrade")

    @property
    def host_skipped(self) -> tuple[Replacement, ...]:
        """Requirements the host manager would drop rather than apply."""
        return tuple(entry for entry in self.replacements if entry.host_skips)


def _normalise(name: str) -> str:
    """Fold a distribution name to its comparison form."""
    return (name or "").strip().lower().replace("_", "-")


def _parse_version(text: str) -> tuple:
    """A version as a comparable tuple, falling back to string order.

    Args:
        text: A version string.

    Returns:
        A tuple of integers where the version is numeric, otherwise a one-element tuple
        holding the original string.
    """
    parts = []
    for chunk in (text or "").split("."):
        digits = ""
        for character in chunk:
            if not character.isdigit():
                break
            digits += character
        if digits == "":
            break
        parts.append(int(digits))
    return tuple(parts) if parts else (text,)


#: Packages whose major version is an ABI boundary.
_ABI_SENSITIVE = frozenset({"numpy"})


def _major(text: str) -> int | None:
    """The major version number, or ``None`` where it cannot be read."""
    parsed = _parse_version(text)
    return parsed[0] if parsed and isinstance(parsed[0], int) else None


def _abi_break(name: str, have: str, want: str) -> bool:
    """Whether replacing an ABI-sensitive package crosses a major version."""
    if _normalise(name) not in _ABI_SENSITIVE:
        return False
    a, b = _major(have), _major(want)
    return a is not None and b is not None and a != b


def _direction(have: str, want: str) -> str:
    """Whether a move goes backwards, forwards or cannot be ordered."""
    left, right = _parse_version(have), _parse_version(want)
    try:
        if right < left:
            return "downgrade"
        if right > left:
            return "upgrade"
    except TypeError:
        return "change"
    return "change"


def _installed(python: str) -> dict[str, str]:
    """Every distribution installed in an interpreter, keyed by folded name.

    Args:
        python: Interpreter to inspect.

    Returns:
        ``{name: version}``, empty where the listing failed.
    """
    command = [python, "-m", "pip", "list", "--format=json", "--disable-pip-version-check"]
    try:
        finished = subprocess.run(
            command, capture_output=True, timeout=TIMEOUT, check=False,
            encoding="utf-8", errors="replace",
        )
        if finished.returncode != 0:
            return {}
        return {
            _normalise(row.get("name", "")): row.get("version", "")
            for row in json.loads(finished.stdout or "[]")
        }
    except (OSError, subprocess.SubprocessError, ValueError):
        return {}


def analyse(requirements: Sequence[str], python: str = "") -> Impact:
    """Report what installing a requirement set would change, without installing it.

    Args:
        requirements: Requirement lines the version declares.
        python: Interpreter the install would target. Defaults to the running one.

    Returns:
        An :class:`Impact`. A resolve that fails carries its reason in ``failure`` rather
        than raising.
    """
    wanted = [
        line.strip()
        for line in requirements
        if line.strip() and not line.strip().startswith("#")
    ]
    if not wanted:
        return Impact(checked=True)

    interpreter = python or sys.executable
    if not interpreter:
        return Impact(failure="no interpreter to resolve against")

    handle = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", suffix=".txt", delete=False, encoding="utf-8"
        ) as handle:
            handle.write("\n".join(wanted) + "\n")
        report = _resolve(interpreter, handle.name)
    finally:
        if handle is not None:
            Path(handle.name).unlink(missing_ok=True)

    if isinstance(report, str):
        return Impact(failure=report, checked=True)

    present = _installed(interpreter)
    additions: list[str] = []
    replacements: list[Replacement] = []
    for entry in report:
        info = entry.get("metadata") or {}
        name = info.get("name", "")
        version = info.get("version", "")
        folded = _normalise(name)
        have = present.get(folded)
        if have is None:
            additions.append(f"{name}=={version}")
        elif have != version:
            direction = _direction(have, version)
            replacements.append(
                Replacement(
                    name=name,
                    have=have,
                    want=version,
                    direction=direction,
                    is_core=folded in CORE_PACKAGES,
                    host_skips=folded in HOST_PROTECTED and direction == "downgrade",
                    abi_break=_abi_break(name, have, version),
                )
            )
    return Impact(
        additions=tuple(sorted(additions)),
        replacements=tuple(sorted(replacements, key=lambda item: (not item.is_core, item.name))),
        checked=True,
    )


def _resolve(python: str, path: str) -> list | str:
    """Ask pip what it would install, without installing.

    Args:
        python: Interpreter to resolve against.
        path: Requirements file.

    Returns:
        The report's ``install`` list, or a sentence saying why pip could not answer.
    """
    command = [
        python, "-m", "pip", "install",
        "--dry-run", "--no-input", "--disable-pip-version-check", "--quiet",
        "--report", "-", "-r", path,
    ]
    try:
        finished = subprocess.run(
            command, capture_output=True, timeout=TIMEOUT, check=False,
            encoding="utf-8", errors="replace",
        )
    except (OSError, subprocess.SubprocessError) as error:
        return f"pip could not be run ({type(error).__name__}: {error})"

    if finished.returncode != 0:
        detail = (finished.stderr or finished.stdout or "").strip().splitlines()
        return f"pip could not resolve these requirements: {detail[-1] if detail else 'no reason given'}"

    try:
        return json.loads(finished.stdout or "").get("install", [])
    except ValueError as error:
        return f"pip's report could not be read ({error})"


def findings_from(impact: Impact) -> list[dict]:
    """Turn an impact report into finding payloads.

    Args:
        impact: A report from :func:`analyse`.

    Returns:
        Finding dictionaries, most serious first, shaped for :mod:`.risk`.
    """
    found: list[dict] = []
    if impact.failure:
        found.append(
            {
                "severity": "caution",
                "title": "Dependency impact could not be determined",
                "detail": "pip could not resolve what this version requires, so what it "
                          "would change is unknown.",
                "evidence": (impact.failure,),
            }
        )
        return found

    abi = tuple(entry for entry in impact.replacements if entry.abi_break)
    if abi:
        found.append(
            {
                "severity": "critical",
                "title": "Changes a package major version that breaks binary builds",
                "detail": "This crosses a major version of a package other packages are "
                          "compiled against. Packages built for the current major (torch, "
                          "opencv, scipy and others) can stop importing until they are "
                          "reinstalled.",
                "evidence": tuple(
                    f"{entry.name}: {entry.have} -> {entry.want} (major {_major(entry.have)} -> {_major(entry.want)})"
                    for entry in abi
                ),
            }
        )

    skipped = impact.host_skipped
    if skipped:
        found.append(
            {
                "severity": "critical",
                "title": f"{len(skipped)} requirement(s) would be dropped, not installed",
                "detail": "The host manager refuses to downgrade these packages. It drops "
                          "the requirement and reports the install as successful, so the "
                          "pack arrives with a dependency it asked for and did not get.",
                "evidence": tuple(
                    f"{entry.name}: needs {entry.want}, install keeps {entry.have}"
                    for entry in skipped
                ),
            }
        )

    core = tuple(entry for entry in impact.core_replacements if not entry.host_skips)
    if core:
        found.append(
            {
                "severity": "critical",
                "title": f"Replaces {len(core)} package(s) ComfyUI depends on",
                "detail": "Installing this version moves packages the running ComfyUI uses. "
                          "This is the change most likely to break an install.",
                "evidence": tuple(
                    f"{entry.name}: {entry.have} -> {entry.want} ({entry.direction})"
                    for entry in core
                ),
            }
        )

    other = tuple(
        entry for entry in impact.replacements if not entry.is_core and not entry.host_skips
    )
    if other:
        found.append(
            {
                "severity": "caution",
                "title": f"Replaces {len(other)} installed package(s)",
                "detail": "Versions already present would be replaced.",
                "evidence": tuple(
                    f"{entry.name}: {entry.have} -> {entry.want} ({entry.direction})"
                    for entry in other
                ),
            }
        )

    if impact.additions:
        found.append(
            {
                "severity": "note",
                "title": f"Adds {len(impact.additions)} new package(s)",
                "detail": "Nothing already installed is touched by these.",
                "evidence": tuple(impact.additions[:12]),
            }
        )
    return found
