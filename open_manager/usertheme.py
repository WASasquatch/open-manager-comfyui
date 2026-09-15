"""Themes a reader keeps in their own directory, rather than in a pack.

``user/open_manager/themes/*.json``. The file is the source of truth: it is read at startup
and again on request, and nothing here writes to it.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import paths

__all__ = ["ASSET_LIMIT", "ASSET_TYPES", "CAP", "FILE_LIMIT", "PREFIX", "asset",
           "asset_parts", "folder", "listing", "read_one"]

PREFIX = "user_"

CAP = 60

FILE_LIMIT = 2_000_000

_ID = re.compile(r"[^A-Za-z0-9_-]+")


def folder() -> Path:
    """Where a reader's own themes live, created if it is not there yet."""
    return paths.store("themes")


def _safe_id(raw: str, fallback: str) -> str:
    cleaned = _ID.sub("-", str(raw or "").strip())[:64].strip("-")
    return f"{PREFIX}{cleaned or fallback}"


def _shaped(data: object, stem: str) -> dict | None:
    if not isinstance(data, dict):
        return None
    colours = data.get("colors")
    if not isinstance(colours, dict) or not colours:
        return None
    made = {
        "id": _safe_id(data.get("id") or stem, stem),
        "name": str(data.get("name") or stem)[:80],
        "colors": colours,
    }
    if isinstance(data.get("extras"), dict):
        made["extras"] = data["extras"]
    if data.get("light_theme"):
        made["light_theme"] = True
    version = data.get("version")
    made["version"] = version if isinstance(version, (int, float, str)) else 1
    return made


def read_one(path: Path) -> tuple[dict | None, str]:
    """One theme file, as a palette.

    Args:
        path: The file to read.

    Returns:
        ``(palette, problem)``. ``problem`` names what was wrong where the palette is None.
    """
    try:
        resolved = path.resolve(strict=True)
    except OSError as error:
        return None, f"could not be resolved ({error.__class__.__name__})"
    if resolved.parent != folder().resolve():
        return None, "sits outside the themes directory"
    if not resolved.is_file():
        return None, "is not a file"
    try:
        if resolved.stat().st_size > FILE_LIMIT:
            return None, f"is larger than {FILE_LIMIT // 1000}kB"
        text = resolved.read_text(encoding="utf-8", errors="replace")
    except OSError as error:
        return None, f"could not be read ({error.__class__.__name__})"
    try:
        data = json.loads(text)
    except ValueError as error:
        return None, f"is not valid JSON ({error})"
    shaped = _shaped(data, resolved.stem)
    if shaped is None:
        return None, "has no `colors` object, so it is not a palette"
    return shaped, ""


def listing() -> dict:
    """Every theme in the reader's themes directory.

    Returns:
        ``{folder, themes, problems}``. ``themes`` is one palette per readable file;
        ``problems`` is one ``{file, reason}`` per file that could not be used.
    """
    base = folder()
    themes: list[dict] = []
    problems: list[dict] = []
    try:
        found = sorted(entry for entry in base.iterdir() if entry.suffix.lower() == ".json")
    except OSError as error:
        return {"folder": str(base), "themes": [], "problems":
                [{"file": str(base), "reason": f"could not be listed ({error})"}]}

    seen: set[str] = set()
    for entry in found[:CAP]:
        palette, problem = read_one(entry)
        if palette is None:
            problems.append({"file": entry.name, "reason": problem})
            continue
        if palette["id"] in seen:
            problems.append({"file": entry.name,
                             "reason": f"another file already uses the id {palette['id']}"})
            continue
        seen.add(palette["id"])
        palette["source_file"] = entry.name
        themes.append(palette)
    if len(found) > CAP:
        problems.append({"file": "", "reason": f"only the first {CAP} themes were read"})
    return {"folder": str(base), "themes": themes, "problems": problems}


#: Image kinds a theme may load from its own directory, and what to serve them as.
ASSET_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
}

#: Largest asset served, in bytes.
ASSET_LIMIT = 1_000_000

_ASSET_PART = re.compile(r"^[A-Za-z0-9._-]+$")


def asset_parts(relative: str) -> tuple[list[str], str, str]:
    """A requested asset path split into segments, refused unless every one is a plain name.

    Shared by the reader's own themes directory and by the copy a pack ships, so both answer
    the same path to the same request.

    Args:
        relative: Path below the directory the asset lives in.

    Returns:
        ``(parts, content_type, problem)``. ``problem`` names what was wrong where ``parts``
        is empty.
    """
    text = str(relative or "").strip().replace("\\", "/").lstrip("/")
    if not text or ".." in text or len(text) > 300:
        return [], "", "not a path inside the themes directory"
    parts = text.split("/")
    if len(parts) > 6 or not all(_ASSET_PART.match(part) for part in parts):
        return [], "", "not a path inside the themes directory"
    kind = ASSET_TYPES.get(Path(parts[-1]).suffix.lower())
    if kind is None:
        return [], "", "not an image this serves"
    return parts, kind, ""


def asset(relative: str) -> tuple[bytes, str, str]:
    """One image a theme keeps beside itself.

    Args:
        relative: Path below the themes directory, forward slashes, no ``..``.

    Returns:
        ``(payload, content_type, problem)``. ``problem`` names what was wrong where the
        payload is empty.
    """
    parts, kind, problem = asset_parts(relative)
    if problem:
        return b"", "", problem

    base = folder().resolve()
    try:
        target = (base / Path(*parts)).resolve(strict=True)
    except OSError:
        return b"", "", "no such file"
    if base != target.parent and base not in target.parents:
        return b"", "", "sits outside the themes directory"
    if not target.is_file():
        return b"", "", "is not a file"
    try:
        if target.stat().st_size > ASSET_LIMIT:
            return b"", "", f"is larger than {ASSET_LIMIT // 1000}kB"
        return target.read_bytes(), kind, ""
    except OSError:
        return b"", "", "could not be read"
