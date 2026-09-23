"""What a reader has pinned to a folder: an icon and a colour, for any folder anywhere."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from . import paths

__all__ = ["CAP", "KINDS", "LIMIT", "clear", "icon", "read", "set_colour", "set_icon"]

KINDS = {".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon"}

LIMIT = 1_000_000

CAP = 2_000

STORE = "marks.json"

_COLOUR_LEN = 7


def folder() -> Path:
    """Where the icons live."""
    return paths.store("marks")


def _store() -> Path:
    return paths.store_file(STORE)


def _key(place: str, path: str) -> str:
    """One folder's name in the store. Never used as a file name."""
    return f"{str(place or '').strip()}|{str(path or '').strip().strip('/')}"


def _held() -> dict:
    """Every mark, or an empty store where there is none or it cannot be read."""
    try:
        held = json.loads(_store().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return held if isinstance(held, dict) else {}


def _sweep(held: dict) -> None:
    """Drop icons no mark points at any more."""
    wanted = {str((one or {}).get("icon") or "") for one in held.values()}
    try:
        for one in folder().iterdir():
            if one.is_file() and one.suffix.lower() in KINDS and one.name not in wanted:
                one.unlink(missing_ok=True)
    except OSError:
        pass


def _keep(held: dict) -> bool:
    """Write the store back, ASCII and whole, and let go of what it no longer names."""
    try:
        _store().write_text(json.dumps(held, indent=1), encoding="ascii")
    except (OSError, UnicodeEncodeError):
        return False
    _sweep(held)
    return True


def read() -> dict:
    """Every mark, for a navigator that draws them.

    Returns:
        ``{ok, marks}`` where marks maps ``place|path`` to ``{colour, icon}``.
    """
    return {"ok": True, "marks": _held()}


def _colour_ok(value: str) -> bool:
    text = str(value or "")
    if len(text) != _COLOUR_LEN or not text.startswith("#"):
        return False
    return all(one in "0123456789abcdefABCDEF" for one in text[1:])


def set_colour(place: str, path: str, colour: str) -> dict:
    """Give one folder a colour, or take it away with an empty one."""
    key = _key(place, path)
    if not place:
        return {"ok": False, "reason": "no folder named"}
    held = _held()
    if colour and not _colour_ok(colour):
        return {"ok": False, "reason": "is not a colour"}
    mark = dict(held.get(key) or {})
    if colour:
        mark["colour"] = str(colour).lower()
    else:
        mark.pop("colour", None)
    if mark:
        if key not in held and len(held) >= CAP:
            return {"ok": False, "reason": f"more than {CAP} folders are already marked"}
        held[key] = mark
    else:
        held.pop(key, None)
    if not _keep(held):
        return {"ok": False, "reason": "the colour could not be kept"}
    return {"ok": True, "reason": ""}


def set_icon(place: str, path: str, data: bytes, suffix: str) -> dict:
    """Give one folder an icon.

    Args:
        place: Which place the folder is in.
        path: Where inside it.
        data: The image bytes.
        suffix: What kind it is, one of :data:`KINDS`.

    Returns:
        ``{ok, icon, reason}``.
    """
    if not place:
        return {"ok": False, "icon": "", "reason": "no folder named"}
    tail = str(suffix or "").lower()
    if tail not in KINDS:
        return {"ok": False, "icon": "", "reason": "is not an icon this keeps"}
    if not data:
        return {"ok": False, "icon": "", "reason": "carried no image"}
    if len(data) > LIMIT:
        return {"ok": False, "icon": "",
                "reason": f"is larger than {LIMIT // 1_000_000}MB"}
    name = f"{hashlib.sha256(data).hexdigest()[:16]}{tail}"
    base = folder().resolve()
    target = base / name
    part = target.with_name(f"{name}.part")
    try:
        part.write_bytes(data)
        part.replace(target)
    except OSError as error:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "icon": "", "reason": str(error)[:120]}

    key = _key(place, path)
    held = _held()
    if key not in held and len(held) >= CAP:
        return {"ok": False, "icon": "", "reason": f"more than {CAP} folders are already marked"}
    mark = dict(held.get(key) or {})
    mark["icon"] = name
    held[key] = mark
    if not _keep(held):
        return {"ok": False, "icon": "", "reason": "the icon could not be kept"}
    return {"ok": True, "icon": name, "reason": ""}


def clear(place: str, path: str) -> dict:
    """Take a folder's mark off entirely."""
    held = _held()
    if held.pop(_key(place, path), None) is None:
        return {"ok": True, "reason": ""}
    if not _keep(held):
        return {"ok": False, "reason": "the marks could not be written"}
    return {"ok": True, "reason": ""}


def icon(name: str) -> tuple[bytes | None, str]:
    """One stored icon's bytes and media type."""
    text = str(name or "")
    tail = Path(text).suffix.lower()
    stem = text[: -len(tail)] if tail else text
    if tail not in KINDS or len(stem) != 16 or any(
            one not in "0123456789abcdef" for one in stem):
        return None, ""
    found = folder() / f"{stem}{tail}"
    try:
        return found.read_bytes(), KINDS[tail]
    except OSError:
        return None, ""
