"""Keeps ComfyUI's settings file readable by ComfyUI."""

from __future__ import annotations

import json
import locale
import shutil
from pathlib import Path

from . import log, paths

__all__ = ["NAME", "ensure", "found", "readable", "repair", "status"]

NAME = "comfy.settings.json"

logger = log.get_logger("settings")

_SEEN: dict[str, tuple[int, int]] = {}


def found(user_dir: Path | str | None = None) -> list[Path]:
    """Every settings file under ComfyUI's user directory.

    Args:
        user_dir: ComfyUI's user directory. Located through :mod:`.paths` when not given.

    Returns:
        The files, per-user directories first. Empty where there is no user directory.
    """
    root = Path(user_dir) if user_dir is not None else paths.user_root()
    if root is None or not root.is_dir():
        return []
    here = []
    try:
        for child in sorted(root.iterdir()):
            if child.is_dir() and (child / NAME).is_file():
                here.append(child / NAME)
    except OSError:
        return []
    if (root / NAME).is_file():
        here.append(root / NAME)
    return here


def readable(path: Path) -> bool:
    """Whether ComfyUI's reader would get settings out of this file."""
    try:
        with path.open(encoding=locale.getpreferredencoding(False)) as reading:
            return isinstance(json.load(reading), dict)
    except (OSError, ValueError, LookupError):
        return False


def status(user_dir: Path | str | None = None) -> dict:
    """What is on disk, so a caller can tell a fresh install from a failed read.

    Args:
        user_dir: ComfyUI's user directory. Located through :mod:`.paths` when not given.

    Returns:
        ``{ok, present, readable, keys}``, worst case across the files found. ``keys`` is -1
        where any of them cannot be read.
    """
    here = found(user_dir)
    if not here:
        return {"ok": True, "present": False, "readable": False, "keys": 0}
    keys = 0
    for path in here:
        if not readable(path):
            return {"ok": True, "present": True, "readable": False, "keys": -1}
        try:
            with path.open(encoding=locale.getpreferredencoding(False)) as reading:
                keys += len(json.load(reading))
        except (OSError, ValueError, LookupError):
            return {"ok": True, "present": True, "readable": False, "keys": -1}
    return {"ok": True, "present": True, "readable": True, "keys": keys}


def _repair_one(path: Path) -> dict:
    """Rewrites one file, or reports why it was left alone."""
    if readable(path):
        return {"ok": True, "repaired": False, "keys": 0, "reason": ""}
    try:
        held = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        logger.warning("%s unreadable, not repaired: %s", path.name, str(error)[:120])
        return {"ok": False, "repaired": False, "keys": 0, "reason": str(error)[:120]}
    if not isinstance(held, dict):
        return {"ok": False, "repaired": False, "keys": 0, "reason": "not an object"}

    keep = path.with_suffix(".json.unreadable")
    try:
        shutil.copy2(path, keep)
        path.write_text(json.dumps(held, indent=4), encoding="ascii")
    except (OSError, UnicodeEncodeError) as error:
        logger.warning("%s not repaired: %s", path.name, str(error)[:120])
        return {"ok": False, "repaired": False, "keys": 0, "reason": str(error)[:120]}

    logger.warning("%s rewritten ascii, %d keys, original at %s",
                   path.name, len(held), keep.name)
    return {"ok": True, "repaired": True, "keys": len(held), "reason": ""}


def ensure(user_dir: Path | str | None = None) -> bool:
    """Repairs the settings files if they need it, cheaply enough to call before every save.

    Args:
        user_dir: ComfyUI's user directory. Located through :mod:`.paths` when not given.

    Returns:
        Whether anything was rewritten.
    """
    done = False
    for path in found(user_dir):
        key = str(path)
        try:
            stat = path.stat()
            stamp = (stat.st_mtime_ns, stat.st_size)
        except OSError:
            continue
        if _SEEN.get(key) == stamp:
            continue
        if readable(path):
            _SEEN[key] = stamp
            continue
        done = _repair_one(path)["repaired"] or done
        try:
            stat = path.stat()
            _SEEN[key] = (stat.st_mtime_ns, stat.st_size)
        except OSError:
            _SEEN.pop(key, None)
    return done


def repair(user_dir: Path | str | None = None) -> dict:
    """Rewrites each settings file in ComfyUI's format where its reader would refuse it.

    Args:
        user_dir: ComfyUI's user directory. Located through :mod:`.paths` when not given.

    Returns:
        ``{ok, repaired, keys, reason}`` summed over the files found.
    """
    here = found(user_dir)
    if not here:
        return {"ok": True, "repaired": False, "keys": 0, "reason": "no settings file"}
    whole = {"ok": True, "repaired": False, "keys": 0, "reason": ""}
    for path in here:
        one = _repair_one(path)
        whole["ok"] = whole["ok"] and one["ok"]
        whole["repaired"] = whole["repaired"] or one["repaired"]
        whole["keys"] += one["keys"]
        whole["reason"] = whole["reason"] or one["reason"]
    return whole
