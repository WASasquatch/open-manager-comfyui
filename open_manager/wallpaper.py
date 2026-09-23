"""Wallpapers for the desktop: the ones a reader keeps, and the ones packaged with this."""

from __future__ import annotations

import re
from pathlib import Path

from . import paths

__all__ = ["KINDS", "LIMIT", "asset", "folder", "listing", "remove", "save"]

KINDS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
}

LIMIT = 12_000_000

_NAME = re.compile(r"^[A-Za-z0-9._ -]+$")


def folder() -> Path:
    """Where a reader's wallpapers live, created if it is not there yet."""
    return paths.store("wallpapers")


def _shipped() -> Path:
    """Where the wallpapers packaged with Open Manager live."""
    return Path(__file__).resolve().parent / "wallpapers"


def _named(raw: str) -> tuple[str, str, str]:
    """A requested name, refused unless it is one plain image file.

    Args:
        raw: The name as the browser sent it.

    Returns:
        ``(name, content_type, problem)``. ``problem`` names what was wrong where ``name`` is
        empty.
    """
    text = str(raw or "").strip().replace("\\", "/")
    if not text or "/" in text or ".." in text or len(text) > 160:
        return "", "", "not a name inside the wallpapers directory"
    if not _NAME.match(text) or text.startswith("."):
        return "", "", "not a name inside the wallpapers directory"
    kind = KINDS.get(Path(text).suffix.lower())
    if kind is None:
        return "", "", "not an image this serves"
    return text, kind, ""


def _inside(base: Path, name: str) -> tuple[Path | None, str]:
    """The file a name points at within one directory, or the reason it does not."""
    try:
        root = base.resolve()
        found = (root / name).resolve(strict=True)
    except OSError:
        return None, "no such wallpaper"
    if found.parent != root:
        return None, "sits outside the wallpapers directory"
    if not found.is_file():
        return None, "is not a file"
    return found, ""


def _target(name: str) -> tuple[Path | None, str]:
    """The file a name points at, the reader's own before the packaged one."""
    found, problem = _inside(folder(), name)
    if found is not None:
        return found, ""
    packaged, _ = _inside(_shipped(), name)
    if packaged is not None:
        return packaged, ""
    return None, problem


def _images(base: Path, builtin: bool) -> list[dict]:
    """Every image one directory holds, as listing entries."""
    found = []
    for entry in base.iterdir():
        if not entry.is_file():
            continue
        if Path(entry.name).suffix.lower() not in KINDS:
            continue
        try:
            stat = entry.stat()
        except OSError:
            continue
        found.append({"name": entry.name, "size": stat.st_size,
                      "at": 0 if builtin else int(stat.st_mtime), "builtin": builtin})
    return found


def listing() -> dict:
    """Every wallpaper on offer: the reader's own newest first, then the packaged ones.

    Returns:
        ``{ok, wallpapers}`` where each entry carries ``name``, ``size``, ``at`` and
        ``builtin``. A packaged wallpaper a reader has shadowed with one of their own is
        left out.
    """
    try:
        mine = _images(folder(), False)
    except OSError as error:
        return {"ok": False, "wallpapers": [], "reason": str(error)[:120]}
    mine.sort(key=lambda one: one["at"], reverse=True)
    try:
        packaged = _images(_shipped(), True)
    except OSError:
        packaged = []
    taken = {one["name"] for one in mine}
    packaged = [one for one in packaged if one["name"] not in taken]
    packaged.sort(key=lambda one: one["name"])
    return {"ok": True, "wallpapers": mine + packaged}


def asset(name: str) -> tuple[bytes, str, str]:
    """One wallpaper's bytes.

    Args:
        name: A plain file name inside the wallpapers directory.

    Returns:
        ``(payload, content_type, problem)``. ``problem`` names what was wrong where the
        payload is empty.
    """
    safe, kind, problem = _named(name)
    if problem:
        return b"", "", problem
    found, problem = _target(safe)
    if problem or found is None:
        return b"", "", problem
    try:
        if found.stat().st_size > LIMIT:
            return b"", "", f"is larger than {LIMIT // 1_000_000}MB"
        return found.read_bytes(), kind, ""
    except OSError:
        return b"", "", "could not be read"


def save(name: str, payload: bytes) -> dict:
    """Keep a wallpaper the reader chose.

    Args:
        name: What to call it, a plain file name.
        payload: The image bytes.

    Returns:
        ``{ok, name, size, reason}``.
    """
    safe, _kind, problem = _named(name)
    if problem:
        return {"ok": False, "name": "", "size": 0, "reason": problem}
    if not payload:
        return {"ok": False, "name": "", "size": 0, "reason": "carried no image"}
    if len(payload) > LIMIT:
        return {"ok": False, "name": "", "size": 0,
                "reason": f"is larger than {LIMIT // 1_000_000}MB"}
    base = folder().resolve()
    target = base / safe
    if target.parent.resolve() != base:
        return {"ok": False, "name": "", "size": 0,
                "reason": "sits outside the wallpapers directory"}
    part = target.with_name(f"{target.name}.part")
    try:
        part.write_bytes(payload)
        part.replace(target)
    except OSError as error:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "name": "", "size": 0, "reason": str(error)[:120]}
    return {"ok": True, "name": safe, "size": len(payload), "reason": ""}


def remove(name: str) -> dict:
    """Take a wallpaper off disk.

    Args:
        name: A plain file name inside the wallpapers directory.

    Returns:
        ``{ok, reason}``.
    """
    safe, _kind, problem = _named(name)
    if problem:
        return {"ok": False, "reason": problem}
    found, problem = _inside(folder(), safe)
    if found is None:
        packaged, _ = _inside(_shipped(), safe)
        if packaged is not None:
            return {"ok": False, "reason": "came with Open Manager"}
        return {"ok": False, "reason": problem}
    try:
        found.unlink()
    except OSError as error:
        return {"ok": False, "reason": str(error)[:120]}
    return {"ok": True, "reason": ""}
