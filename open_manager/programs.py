"""Desktop programs that ship in this repository, read from their own manifests."""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import paths

__all__ = ["ENTRY", "ICON_KINDS", "MANIFEST", "RESERVED", "STORE_LIMIT", "TAG_CAP",
           "folder", "listing",
           "read_store", "write_store"]

PROGRAMS = "programs"

MANIFEST = "manifest.json"

ENTRY = "program.mjs"

RESERVED = frozenset({
    "note", "notes", "folder", "pack", "panel", "props", "desktop", "wastebasket", "manager",
    "registry", "memory", "downloads", "library", "notepad", "start", "trash",
    "programs", "desksettings", "files",
    "constructor", "prototype", "__proto__", "toString", "valueOf", "hasownproperty",
})

ICON_KINDS = {".png", ".webp", ".ico", ".jpg", ".jpeg", ".gif", ".avif", ".svg"}

CAP = 60

NAME_CAP = 40

HINT_CAP = 200

_ID = re.compile(r"^[a-z][a-z0-9-]{1,30}$")

_TINT = re.compile(r"^(?:[a-z]{3,12}|#[0-9a-f]{6})$")


def folder() -> Path:
    """Where the programs this repository ships live."""
    return Path(__file__).resolve().parent / "web" / PROGRAMS


def _text(value: object, cap: int) -> str:
    """One line of a manifest, trimmed to something a window can carry."""
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:cap]


def _icon(value: object, home: Path) -> str:
    """A program's icon, refused unless it is one plain file inside that program's directory."""
    text = str(value or "").strip().replace("\\", "/")
    if not text or text.startswith("/") or ".." in text.split("/") or len(text) > 120:
        return ""
    if Path(text).suffix.lower() not in ICON_KINDS:
        return ""
    try:
        found = (home / text).resolve(strict=True)
    except OSError:
        return ""
    if home.resolve() not in found.parents or not found.is_file():
        return ""
    return text


def _look(value: object) -> dict:
    """A window colour an author asked for, or nothing."""
    if not isinstance(value, dict):
        return {}
    kept = {}
    for side in ("tint", "from", "to"):
        asked = str(value.get(side) or "").strip().lower()
        if _TINT.match(asked):
            kept[side] = asked
    if "from" in kept and "to" not in kept:
        kept["to"] = kept["from"]
    return kept


TAG_CAP = 16
TAG_LEN = 24

_TAG = re.compile(r"^[a-z0-9][a-z0-9 +-]{0,%d}$" % (TAG_LEN - 1))


def _tags(value: object) -> list:
    """The keywords a program offers itself under, cleaned."""
    if not isinstance(value, (list, tuple)):
        return []
    kept = []
    for one in value:
        if not isinstance(one, str):
            continue
        text = " ".join(one.strip().lower().split())[:TAG_LEN]
        if text and _TAG.match(text) and text not in kept:
            kept.append(text)
        if len(kept) >= TAG_CAP:
            break
    return kept


def _surfaces(value: object) -> dict:
    """Where a program asks to appear. Absent means the Start menu only."""
    asked = value if isinstance(value, dict) else {}
    return {
        "desktop": asked.get("desktop") is True,
        "start": asked.get("start") is not False,
    }


def _read(home: Path, taken: set) -> tuple[dict, str]:
    """One program's manifest, or the sentence naming why it was refused."""
    try:
        data = json.loads((home / MANIFEST).read_text(encoding="utf-8"))
    except OSError:
        return {}, f"{home.name} has no {MANIFEST}"
    except ValueError as error:
        return {}, f"{home.name}: {MANIFEST} is not valid JSON ({str(error)[:60]})"
    if not isinstance(data, dict):
        return {}, f"{home.name}: {MANIFEST} is not an object"
    held = str(data.get("id") or "").strip().lower()
    if not _ID.match(held):
        return {}, f"{home.name}: id must be lowercase letters, digits and dashes"
    if held in RESERVED:
        return {}, f"{home.name}: id {held} is one the desktop already uses"
    if held in taken:
        return {}, f"{home.name}: id {held} is claimed by another program"
    if held != home.name:
        return {}, f"{home.name}: id {held} does not match its directory"
    entry = home / ENTRY
    if not entry.is_file():
        return {}, f"{home.name} has no {ENTRY}"
    name = _text(data.get("name"), NAME_CAP) or held
    icon = _icon(data.get("icon"), home)
    stamp = 0
    for part in (entry, home / MANIFEST, (home / icon) if icon else None):
        if part is None:
            continue
        try:
            stamp = max(stamp, int(part.stat().st_mtime))
        except OSError:
            continue
    return {
        "id": held,
        "name": name,
        "stamp": stamp,
        "hint": _text(data.get("hint"), HINT_CAP),
        "version": _text(data.get("version"), 20),
        "author": _text(data.get("author"), NAME_CAP),
        "icon": icon,
        "group": _text(data.get("group"), NAME_CAP),
        "surfaces": _surfaces(data.get("surfaces")),
        "multiple": data.get("multiple") is True,
        "look": _look(data.get("look")),
        "capabilities": [_text(one, 40) for one in (data.get("capabilities") or [])
                         if isinstance(one, str)][:12],
        "tags": _tags(data.get("tags")),
        "entry": f"{held}/{ENTRY}",
    }, ""


def listing() -> dict:
    """Every program this repository ships, and every one that could not be read.

    Returns:
        ``{ok, programs, problems}``. ``problems`` names each program directory that failed
        validation, and why.
    """
    home = folder()
    if not home.is_dir():
        return {"ok": True, "programs": [], "problems": []}
    programs = []
    problems = []
    taken = set()
    try:
        entries = sorted(one for one in home.iterdir() if one.is_dir())
    except OSError as error:
        return {"ok": False, "programs": [], "problems": [str(error)[:120]]}
    for one in entries[:CAP]:
        if one.name.startswith("."):
            continue
        made, problem = _read(one, taken)
        if problem:
            problems.append(problem)
            continue
        taken.add(made["id"])
        programs.append(made)
    return {"ok": True, "programs": programs, "problems": problems}


STORE_LIMIT = 200_000


def _store(held: str) -> Path | None:
    """Where one program keeps what it is allowed to keep, or ``None`` for a bad id."""
    if not _ID.match(str(held or "")) or held in RESERVED:
        return None
    return paths.store(f"{PROGRAMS}/{held}") / "store.json"


def read_store(held: str) -> dict:
    """What a program kept.

    Returns:
        ``{ok, data, reason}``. A store that has never been written is empty, not a failure.
    """
    target = _store(held)
    if target is None:
        return {"ok": False, "data": {}, "reason": "not a program id"}
    if not target.is_file():
        return {"ok": True, "data": {}, "reason": ""}
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"ok": True, "data": {}, "reason": ""}
    return {"ok": True, "data": data if isinstance(data, dict) else {}, "reason": ""}


def write_store(held: str, data: object) -> dict:
    """Keep what a program asked to keep, in its own corner and nowhere else.

    Returns:
        ``{ok, reason}``.
    """
    target = _store(held)
    if target is None:
        return {"ok": False, "reason": "not a program id"}
    if not isinstance(data, dict):
        return {"ok": False, "reason": "is not an object"}
    try:
        text = json.dumps(data)
    except (TypeError, ValueError):
        return {"ok": False, "reason": "holds something that cannot be stored"}
    if len(text.encode("utf-8")) > STORE_LIMIT:
        return {"ok": False, "reason": f"is larger than {STORE_LIMIT // 1000}kB"}
    part = target.with_name(f"{target.name}.part")
    try:
        part.write_text(text, encoding="utf-8")
        part.replace(target)
    except OSError as error:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "reason": str(error)[:120]}
    return {"ok": True, "reason": ""}
