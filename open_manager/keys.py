"""Where the access keys live, and what may be said about them."""

from __future__ import annotations

import json
import os
import stat
import sys
from pathlib import Path

from . import log, paths

__all__ = ["ENV_NAMES", "NAMES", "forget", "hint", "listing", "path", "secret",
           "source", "store"]

logger = log.get_logger("keys")

NAMES = {
    "huggingface": {
        "label": "Hugging Face",
        "placeholder": "hf_...",
        "purpose": "Gated and private models, and a higher download limit. Sent only to "
                   "huggingface.co, never to the CDN a download is redirected to.",
    },
    "github": {
        "label": "GitHub",
        "placeholder": "ghp_...",
        "purpose": "One-click starring, and a higher rate limit when reading pack pages "
                   "and licences.",
    },
    "virustotal": {
        "label": "VirusTotal",
        "placeholder": "",
        "purpose": "Scanning an install. Must not be used in business workflows, commercial "
                   "products or services.",
    },
}

MAX_LENGTH = 512

ENV_NAMES = {
    "huggingface": ("HF_TOKEN", "HUGGING_FACE_HUB_TOKEN", "OPEN_MANAGER_HF_TOKEN"),
    "github": ("GITHUB_TOKEN", "GH_TOKEN", "OPEN_MANAGER_GITHUB_TOKEN"),
    "virustotal": ("VIRUS_TOTAL_KEY", "VIRUSTOTAL_API_KEY", "OPEN_MANAGER_VIRUSTOTAL_KEY"),
}


def _from_env(name: str) -> tuple:
    """The first environment variable that has a value for this key, and its value."""
    for variable in ENV_NAMES.get(name, ()):
        value = os.environ.get(variable, "").strip()
        if value:
            return variable, value
    return "", ""


def path() -> Path:
    """Where the keys are written."""
    return paths.store_file("keys.json")


def _harden(target: Path) -> str:
    """Restrict a file to its owner, and say plainly where that could not be done.

    Returns:
        An empty string where the file is now owner-only, or a sentence describing what
        could not be arranged.
    """
    try:
        os.chmod(target, stat.S_IRUSR | stat.S_IWUSR)
    except OSError as error:
        return f"the file's permissions could not be set ({error.strerror or error})"
    if sys.platform != "win32":
        return ""
    try:
        import getpass
        import subprocess

        who = os.environ.get("USERNAME") or getpass.getuser()
        done = subprocess.run(  # noqa: S603
            ["icacls", str(target), "/inheritance:r", "/grant:r", f"{who}:F"],
            capture_output=True, text=True, timeout=20, check=False,
        )
        if done.returncode != 0:
            return ("the folder's inherited permissions could not be removed, so anyone who "
                    "can read this ComfyUI install can read this file")
    except Exception as error:  # noqa: BLE001
        logger.debug("icacls failed (%s: %s)", type(error).__name__, error)
        return ("the folder's inherited permissions could not be removed, so anyone who can "
                "read this ComfyUI install can read this file")
    return ""


def _read() -> dict:
    """Everything stored, or an empty map where nothing is."""
    try:
        data = json.loads(path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _write(data: dict) -> str:
    """Persist the map and restrict it. Returns what could not be arranged, if anything."""
    target = path()
    try:
        target.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
    except OSError as error:
        return f"the file could not be written ({error.strerror or error})"
    return _harden(target)


def _hint_for(value: str) -> str:
    """What may be shown of a key: enough to tell two apart, not enough to use."""
    tail = value[-4:] if len(value) >= 8 else ""
    return f"****{tail}" if tail else "****"


def store(name: str, value: str) -> dict:
    """Keep a key under one of the names this knows.

    Args:
        name: One of :data:`NAMES`.
        value: The key, with surrounding whitespace dropped.

    Returns:
        ``{ok, reason, name, set, hint, warning}``. ``warning`` is non-empty where the file
        could be written but not restricted.
    """
    if name not in NAMES:
        return {"ok": False, "reason": "no such key", "name": name, "set": False,
                "hint": "", "warning": ""}
    value = (value or "").strip()
    if not value:
        return forget(name)
    if len(value) > MAX_LENGTH:
        return {"ok": False, "reason": "that is too long to be a key", "name": name,
                "set": False, "hint": "", "warning": ""}
    data = _read()
    data[name] = value
    warning = _write(data)
    if warning.startswith("the file could not be written"):
        return {"ok": False, "reason": warning, "name": name, "set": False,
                "hint": "", "warning": ""}
    return {"ok": True, "reason": "", "name": name, "set": True,
            "hint": _hint_for(value), "warning": warning}


def forget(name: str) -> dict:
    """Remove a key."""
    if name not in NAMES:
        return {"ok": False, "reason": "no such key", "name": name, "set": False,
                "hint": "", "warning": ""}
    data = _read()
    data.pop(name, None)
    warning = _write(data)
    return {"ok": True, "reason": "", "name": name, "set": False, "hint": "",
            "warning": "" if warning.startswith("the file could not") else warning}


def secret(name: str) -> str:
    """The key itself, for this server's own use."""
    if name not in NAMES:
        return ""
    _, from_env = _from_env(name)
    if from_env:
        return from_env
    value = _read().get(name)
    return value.strip() if isinstance(value, str) else ""


def source(name: str) -> str:
    """Where the key in use came from: ``environment``, ``file``, or nothing."""
    if name not in NAMES:
        return ""
    if _from_env(name)[1]:
        return "environment"
    value = _read().get(name)
    return "file" if isinstance(value, str) and value.strip() else ""


def hint(name: str) -> dict:
    """Whether a key is set, where it came from, and the little of it that may be shown."""
    value = secret(name)
    where = source(name)
    variable, _ = _from_env(name)
    shadowed = where == "environment" and isinstance(_read().get(name), str)
    return {"set": bool(value), "hint": _hint_for(value) if value else "",
            "source": where,
            "env": variable or ENV_NAMES[name][0],
            "env_names": list(ENV_NAMES[name]),
            "shadowed": shadowed}


def listing() -> dict:
    """Every key this knows about: what it is for, and whether one is held."""
    held = _read()
    where = path()
    readable = ""
    if held:
        try:
            mode = where.stat().st_mode
            if sys.platform != "win32" and mode & (stat.S_IRGRP | stat.S_IROTH):
                readable = "this file is readable by other accounts on this machine"
        except OSError:
            pass
    return {
        "ok": True,
        "keys": {name: {**described, **hint(name)} for name, described in NAMES.items()},
        "path": str(where),
        "warning": readable,
    }
