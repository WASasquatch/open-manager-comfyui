"""Where the access keys live, and what may be said about them.

A key typed into ComfyUI's own settings is stored in ``comfy.settings.json``, returned in full
by ``GET /settings`` to anything that asks, and shown back in the input box that set it. That
is three ways to leak a credential for the convenience of one text field, so keys are kept
here instead: written by this module, read by this module, and never sent back out.

What this does not do is encrypt them. A key the server has to use while nobody is watching
cannot be hidden from the account the server runs as, and a file that decrypts itself is not
encrypted, it is obfuscated. The protection is the file's permissions, and where the platform
will not honour those this says so rather than implying a safety it has not got.

Nor does it load a ``.env`` into the environment, which is the usual way to do this and the
wrong way here. ComfyUI loads third-party code into this process, and ``os.environ`` is a
namespace every one of those packs can read without trying. Worse, this pack runs ``pip`` to
install a pack's requirements, and that subprocess inherits the environment -- so a key placed
there would be handed to pip, and to the build backend of whatever package is being installed,
which is arbitrary code from the internet. The environment is therefore read where a
deployment has chosen to inject a key, and never written to.
"""

from __future__ import annotations

import json
import os
import stat
import sys
from pathlib import Path

from . import log

__all__ = ["ENV_NAMES", "NAMES", "forget", "hint", "listing", "path", "secret",
           "source", "store"]

logger = log.get_logger("keys")

#: The keys this knows about: what each is called, what a value looks like, and what it is
#: for. Anything else is refused, so a caller cannot invent a name and have it written to
#: disk. The panel renders this rather than keeping its own copy, so a key added here appears
#: there without anybody remembering to add it twice.
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

#: Longest value accepted. Tokens are well under this; the cap is a guard against a caller
#: writing a file rather than a key.
MAX_LENGTH = 512

#: The environment variables consulted for each key, in the order they are tried. This is for
#: a deployment that would rather inject its secrets than have anything write them: a
#: container, a service unit, a launcher script.
#:
#: The conventional names are read as well as ours, because someone who has already told
#: huggingface-cli who they are should not have to say it again under a different name. Which
#: variable supplied a key is reported rather than assumed, so picking one up is visible.
#:
#: Read only. Nothing here ever puts a key *into* the environment, which is the part of the
#: dotenv pattern that does not suit this process; the reason is in the module docstring.
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
    try:
        import folder_paths

        base = Path(folder_paths.get_user_directory()) / "open_manager"
    except Exception:  # noqa: BLE001 - running outside ComfyUI
        base = Path(__file__).resolve().parent.parent / "_cache"
    base.mkdir(parents=True, exist_ok=True)
    return base / "keys.json"


def _harden(target: Path) -> str:
    """Restrict a file to its owner, and say plainly where that could not be done.

    Returns:
        An empty string where the file is now owner-only, or a sentence describing what
        could not be arranged. The caller is expected to show it rather than swallow it.
    """
    try:
        os.chmod(target, stat.S_IRUSR | stat.S_IWUSR)
    except OSError as error:
        return f"the file's permissions could not be set ({error.strerror or error})"
    if sys.platform != "win32":
        return ""
    # chmod on Windows only toggles the read-only flag; it says nothing about who may read
    # the file. Inherited permissions are what actually decide that, so they are removed and
    # the owner granted explicitly.
    try:
        import getpass
        import subprocess

        who = os.environ.get("USERNAME") or getpass.getuser()
        done = subprocess.run(  # noqa: S603 - fixed program, no shell
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
        value: The key. Whitespace around it is dropped, because pasting picks it up.

    Returns:
        ``{ok, reason, name, set, hint, warning}``. ``warning`` is non-empty where the file
        could be written but not restricted, which the reader should be told about.
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
    """The key itself, for this server's own use.

    Never returned over HTTP. Every route that needs a key reads it here rather than taking
    one from the request, so a key is not carried in a query string, a body, or a log.

    The environment is consulted first, so a deployment that injects its secrets is not
    overridden by something typed in a browser months ago.
    """
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
    # A key held in the file while the environment also has one is not the key in use, and
    # saying so is the difference between a setting that works and one that quietly does not.
    shadowed = where == "environment" and isinstance(_read().get(name), str)
    return {"set": bool(value), "hint": _hint_for(value) if value else "",
            "source": where,
            # Which variable actually supplied it, or the one to set if none did.
            "env": variable or ENV_NAMES[name][0],
            "env_names": list(ENV_NAMES[name]),
            "shadowed": shadowed}


def listing() -> dict:
    """Every key this knows about: what it is for, and whether one is held.

    Deliberately without values. There is no route that returns a key, because there is no
    question a reader can ask that needs one.
    """
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
