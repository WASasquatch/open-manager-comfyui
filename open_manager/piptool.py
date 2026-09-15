"""Whichever installer the running environment actually has.

A ``uv venv`` ships no ``pip``, so ``python -m pip`` answers "No module named pip" and every
install, listing and preview fails. uv installs into that environment through ``uv pip``.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

__all__ = ["available", "command", "describe", "forget", "kind", "run"]

TIMEOUT = 30

PIP_ONLY = ("--no-input", "--yes", "--disable-pip-version-check")

_seen: dict[str, tuple[str, str]] = {}


def _interpreter(python: str = "") -> str:
    return python or sys.executable


def _has_pip(python: str) -> bool:
    try:
        done = subprocess.run(
            [python, "-m", "pip", "--version"],
            capture_output=True, timeout=TIMEOUT, check=False,
            encoding="utf-8", errors="replace",
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return done.returncode == 0


def _find_uv(python: str) -> str:
    beside = Path(python).parent
    for name in ("uv", "uv.exe"):
        candidate = beside / name
        if candidate.is_file():
            return str(candidate)
    found = shutil.which("uv")
    if found:
        return found
    for name in ("UV", "UV_PATH"):
        value = os.environ.get(name, "").strip()
        if value and Path(value).is_file():
            return value
    return ""


def _detect(python: str) -> tuple[str, str]:
    if _has_pip(python):
        return "pip", ""
    uv = _find_uv(python)
    if uv:
        return "uv", uv
    return "none", ""


def kind(python: str = "") -> str:
    """Which installer serves an interpreter: ``pip``, ``uv`` or ``none``.

    Args:
        python: Interpreter to inspect. Defaults to the running one.

    Returns:
        The installer name.
    """
    exe = _interpreter(python)
    if exe not in _seen:
        _seen[exe] = _detect(exe)
    return _seen[exe][0]


def available(python: str = "") -> bool:
    """Whether anything can install into this environment."""
    return kind(python) != "none"


def forget(python: str = "") -> None:
    """Drop what was detected for an interpreter, so the next call looks again."""
    _seen.pop(_interpreter(python), None)


def describe(python: str = "") -> str:
    """A sentence naming the installer, for a message that has to explain itself."""
    exe = _interpreter(python)
    found = kind(exe)
    if found == "pip":
        return "pip"
    if found == "uv":
        return f"uv ({_seen[exe][1]})"
    return (
        f"neither pip nor uv is available for {exe}. A uv-managed environment has no pip; "
        "install uv, or add pip with `python -m ensurepip`."
    )


def command(python: str, subcommand: str, args: list[str]) -> list[str] | None:
    """The argv that runs one pip subcommand in an environment.

    Args:
        python: Interpreter to act on.
        subcommand: ``install``, ``list``, ``uninstall`` and so on.
        args: Arguments after the subcommand.

    Returns:
        The argv, or ``None`` where the environment has no installer.
    """
    exe = _interpreter(python)
    found = kind(exe)
    if found == "pip":
        return [exe, "-m", "pip", subcommand, "--disable-pip-version-check", *args]
    if found == "uv":
        kept = [one for one in args if one not in PIP_ONLY]
        return [_seen[exe][1], "pip", subcommand, "--python", exe, *kept]
    return None


def run(
    python: str, subcommand: str, args: list[str], timeout: int = 600, cwd: str | None = None
) -> subprocess.CompletedProcess | None:
    """Run one pip subcommand, or answer ``None`` where nothing can run it.

    Args:
        python: Interpreter to act on.
        subcommand: ``install``, ``list``, ``uninstall`` and so on.
        args: Arguments after the subcommand.
        timeout: Seconds before the call is abandoned.
        cwd: Directory to run in.

    Returns:
        The finished process, or ``None``.

    Raises:
        OSError: Where the installer could not be started.
        subprocess.SubprocessError: Where it did not finish.
    """
    argv = command(python, subcommand, args)
    if argv is None:
        return None
    surroundings = dict(os.environ)
    surroundings["PYTHONIOENCODING"] = "utf-8"
    return subprocess.run(
        argv, capture_output=True, timeout=timeout, check=False,
        encoding="utf-8", errors="replace", cwd=cwd, env=surroundings,
    )
