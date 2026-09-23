"""The reader's own notes and folders, kept as real files under their user directory."""

from __future__ import annotations

import base64
import hashlib
import os
import re
import secrets
import shutil
import tempfile
import time
import zipfile
from pathlib import Path

from . import paths

__all__ = ["BODY_LIMIT", "DEPTH", "DESKTOP", "DOCUMENTS", "EXPORT_LIMIT", "HOMES", "ICONS",
           "ICON_LIMIT", "LINK_SUFFIX",
           "MEDIA", "MEDIA_LIMIT", "NOTE_SUFFIX", "SUFFIXES", "TARGET_ROOT", "clear_icon",
           "arrange", "create_folder", "create_link", "create_note",
           "empty_trash", "export_file", "folder", "icon", "icon_folder", "keep_media",
           "display", "listing", "locate", "measure", "media", "media_folder", "move",
           "read_note",
           "remove", "rename", "restore", "set_colour", "set_icon", "set_target", "trash",
           "write_note",
           "zip_folder"]

BODY_LIMIT = 2_000_000

DEPTH = 8

WALK_CAP = 20_000

EXPORT_LIMIT = 64_000_000

ZIP_BUDGET = 256_000_000

SPOOL_MEM = 8_000_000

INLINE_BUDGET = 24_000_000

NOTE_SUFFIX = ".md"

LINK_SUFFIX = ".omlink"

SUFFIXES = (NOTE_SUFFIX, LINK_SUFFIX)

TARGET_CAP = 400

TARGET_ROOT = "workflows/"

TRASH = ".trash"

MEDIA = ".media"

MEDIA_LIMIT = 12_000_000

MEDIA_KINDS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
}

_MEDIA_NAME = re.compile(r"^[0-9a-f]{16}\.(png|jpg|webp|gif|avif)$")

ICONS = ".icons"

ICON_LIMIT = 1_000_000

ICON_KINDS = {".ico": "image/x-icon", ".png": "image/png", ".webp": "image/webp"}

_ICON_NAME = re.compile(r"^[0-9a-z]{8}\.(ico|png|webp)$")

COLOUR_SUFFIX = ".colour"

_COLOUR = re.compile(r"^#[0-9a-f]{6}$")

_UNNAMEABLE = re.compile(r"[\x00-\x1f\x7f:/\\]")

_ID = re.compile(r"~([0-9a-z]{8})$")

_ROUGH = re.compile(r"[^A-Za-z0-9 ._-]+")


def folder() -> Path:
    """Where the reader's documents live, created if it is not there yet."""
    return paths.store("docs")


DESKTOP = "Desktop"

DOCUMENTS = "Documents"

HOMES = (DESKTOP, DOCUMENTS)


def arrange() -> dict:
    """Make the two folders a reader starts with and file anything loose at the top under Desktop.

    Returns:
        ``{ok, moved, reason}``.
    """
    base = folder().resolve()
    desk = base / DESKTOP
    try:
        for one in HOMES:
            (base / one).mkdir(parents=True, exist_ok=True)
    except OSError as error:
        return {"ok": False, "moved": 0, "reason": str(error)[:120]}
    moved = 0
    try:
        for one in list(base.iterdir()):
            if one.name.startswith(".") or one.name in HOMES:
                continue
            try:
                shutil.move(str(one), str(desk / one.name))
                moved += 1
            except (OSError, shutil.Error):
                continue
    except OSError as error:
        return {"ok": False, "moved": moved, "reason": str(error)[:120]}
    return {"ok": True, "moved": moved, "reason": ""}


def _fresh_id() -> str:
    """Eight characters that will not collide in a directory a person can read."""
    return secrets.token_hex(4)


def slug(raw: str) -> str:
    """A display name reduced to something safe to put on a disk.

    Args:
        raw: The name as a person typed it.

    Returns:
        A single safe segment, never empty.
    """
    text = _ROUGH.sub("-", str(raw or "").replace("~", "-")).strip()
    text = re.sub(r"-{2,}", "-", text).strip(" .-")
    text = text[:64].strip(" .-")
    if not text or text.startswith("__"):
        text = f"note{text}" if text else "untitled"
    return text


def _named(name: str, kind: str) -> str:
    """A file or directory name carrying a fresh id."""
    tail = {"note": NOTE_SUFFIX, "link": LINK_SUFFIX}.get(kind, "")
    return f"{slug(name)}~{_fresh_id()}{tail}"


def _stem(name: str) -> str:
    """A stored name with the suffix this module gave it taken off."""
    for tail in SUFFIXES:
        if name.endswith(tail):
            return name[:-len(tail)]
    return name


def _display(name: str) -> str:
    """The part of a stored name a reader should see."""
    stem = _stem(name)
    return _ID.sub("", stem) or stem


def display(name: str) -> str:
    """The part of a stored name a reader should see."""
    return _display(name)


def _id_of(name: str) -> str:
    """The id carried by a stored name, or an empty string."""
    found = _ID.search(_stem(name))
    return found.group(1) if found else ""


def _parts(relative: str) -> tuple[list[str], str]:
    """A requested relative path split into segments.

    Returns:
        ``(parts, problem)``. ``problem`` names what was wrong where parts is empty. An empty
        path is the root and is allowed.
    """
    text = str(relative or "").replace("\\", "/").strip("/")
    if not text:
        return [], ""
    if len(text) > 400:
        return [], "not a path inside the documents directory"
    parts = text.split("/")
    if len(parts) > DEPTH:
        return [], f"deeper than {DEPTH} folders"
    for part in parts:
        if not part or part.startswith(".") or part == ".." or len(part) > 200:
            return [], "not a path inside the documents directory"
        if _UNNAMEABLE.search(part):
            return [], "not a path inside the documents directory"
    return parts, ""


def _target(relative: str, must_exist: bool = True) -> tuple[Path | None, str]:
    """The file or directory a relative path points at."""
    parts, problem = _parts(relative)
    if problem:
        return None, problem
    base = folder().resolve()
    candidate = base.joinpath(*parts) if parts else base
    try:
        found = candidate.resolve(strict=must_exist)
    except OSError:
        return None, "no such item"
    if found != base and base not in found.parents:
        return None, "sits outside the documents directory"
    return found, ""


def _clean_target(raw: str) -> tuple[str, str]:
    """A workflow path a shortcut may point at.

    Returns:
        ``(target, problem)``.
    """
    text = str(raw or "").strip().replace("\\", "/")
    if not text:
        return "", "names no workflow"
    if len(text) > TARGET_CAP:
        return "", "names a longer path than this keeps"
    if "\n" in text or "\r" in text or "\x00" in text:
        return "", "is not one line"
    if not text.startswith(TARGET_ROOT):
        return "", f"does not sit under {TARGET_ROOT}"
    if ".." in text.split("/"):
        return "", "climbs out of the workflows directory"
    return text, ""


def _read_target(path: Path) -> str:
    """The workflow one shortcut points at, or an empty string where it cannot be read."""
    try:
        if path.stat().st_size > TARGET_CAP * 4:
            return ""
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    target, _problem = _clean_target(text.splitlines()[0] if text else "")
    return target


def _icon_map() -> dict:
    """What each id has been given to look like, read in one pass.

    Returns:
        ``{id: {"icon": name, "colour": "#rrggbb"}}``, omitting whatever is not set.
    """
    found = {}
    try:
        for one in (folder() / ICONS).iterdir():
            held = one.name.split(".", 1)[0]
            if _ICON_NAME.match(one.name):
                found.setdefault(held, {})["icon"] = one.name
            elif one.name.endswith(COLOUR_SUFFIX):
                shade = _read_colour(one)
                if shade:
                    found.setdefault(held, {})["colour"] = shade
    except OSError:
        return {}
    return found


def _clean_colour(raw: str) -> str:
    """A colour a reader picked, or an empty string where it is not one this paints with."""
    text = str(raw or "").strip().lower()
    return text if _COLOUR.match(text) else ""


def _read_colour(path: Path) -> str:
    """The colour one mark holds, or an empty string."""
    try:
        if path.stat().st_size > 32:
            return ""
        return _clean_colour(path.read_text(encoding="utf-8", errors="replace"))
    except OSError:
        return ""


def _what_is(name: str) -> str:
    """What kind of file this is, asked of the module that owns the table."""
    try:
        from . import files

        return files.kind_of(name)
    except Exception:  # noqa: BLE001
        return "other"


def _kind_of(path: Path, folderish: bool) -> str:
    """Whether one item is a folder, a shortcut, a note, or a file that arrived from elsewhere."""
    if folderish:
        return "folder"
    if path.name.endswith(LINK_SUFFIX):
        return "link"
    return "note" if path.name.endswith(NOTE_SUFFIX) else "file"


def _entry(path: Path, base: Path, icons: dict | None = None) -> dict:
    """One item, in the shape the panel lists them in."""
    try:
        stat = path.stat()
    except OSError:
        return {}
    folderish = path.is_dir()
    holds = 0
    if folderish:
        try:
            holds = sum(1 for one in path.iterdir() if not one.name.startswith("."))
        except OSError:
            holds = 0
    held = _id_of(path.name)
    known = _icon_map() if icons is None else icons
    marks = known.get(held) or {}
    kind = _kind_of(path, folderish)
    return {
        "id": held,
        "name": _display(path.name),
        "path": path.relative_to(base).as_posix(),
        "kind": kind,
        "what": "" if folderish else _what_is(path.name),
        "edits": not folderish and kind != "link" and _editable(path),
        "size": 0 if folderish else stat.st_size,
        "at": int(stat.st_mtime),
        "holds": holds,
        "icon": marks.get("icon", ""),
        "colour": marks.get("colour", ""),
        "target": _read_target(path) if kind == "link" else "",
    }


def listing(relative: str = "") -> dict:
    """What sits directly inside one folder.

    Args:
        relative: The folder to read, empty for the root.

    Returns:
        ``{ok, path, items, reason}`` with folders before notes, each ordered by name.
    """
    found, problem = _target(relative)
    if problem or found is None:
        return {"ok": False, "path": relative, "items": [], "reason": problem}
    if not found.is_dir():
        return {"ok": False, "path": relative, "items": [], "reason": "is not a folder"}
    base = folder().resolve()
    icons = _icon_map()
    items = []
    try:
        for one in found.iterdir():
            if one.name.startswith("."):
                continue
            entry = _entry(one, base, icons)
            if entry:
                items.append(entry)
    except OSError as error:
        return {"ok": False, "path": relative, "items": [], "reason": str(error)[:120]}
    items.sort(key=lambda one: (one["kind"] != "folder", one["name"].lower()))
    return {"ok": True, "path": relative, "items": items, "reason": ""}


def create_folder(parent: str, name: str) -> dict:
    """Make a folder inside another.

    Args:
        parent: Where to make it, empty for the root.
        name: What to call it.

    Returns:
        ``{ok, item, reason}``.
    """
    holder, problem = _target(parent)
    if problem or holder is None:
        return {"ok": False, "item": None, "reason": problem}
    if not holder.is_dir():
        return {"ok": False, "item": None, "reason": "is not a folder"}
    parts, _ = _parts(parent)
    if len(parts) >= DEPTH:
        return {"ok": False, "item": None, "reason": f"deeper than {DEPTH} folders"}
    target = holder / _named(name, "folder")
    try:
        target.mkdir(parents=False, exist_ok=False)
    except OSError as error:
        return {"ok": False, "item": None, "reason": str(error)[:120]}
    return {"ok": True, "item": _entry(target, folder().resolve()), "reason": ""}


def create_note(parent: str, name: str, body: str = "") -> dict:
    """Make a note inside a folder.

    Args:
        parent: Where to make it, empty for the root.
        name: What to call it.
        body: Its markdown, empty for a blank note.

    Returns:
        ``{ok, item, reason}``.
    """
    holder, problem = _target(parent)
    if problem or holder is None:
        return {"ok": False, "item": None, "reason": problem}
    if not holder.is_dir():
        return {"ok": False, "item": None, "reason": "is not a folder"}
    parts, _ = _parts(parent)
    if len(parts) >= DEPTH:
        return {"ok": False, "item": None, "reason": f"deeper than {DEPTH} folders"}
    text = str(body or "")
    if len(text.encode("utf-8")) > BODY_LIMIT:
        return {"ok": False, "item": None, "reason": f"longer than {BODY_LIMIT // 1000}kB"}
    target = holder / _named(name, "note")
    part = target.with_name(f"{target.name}.part")
    try:
        part.write_text(text, encoding="utf-8")
        part.replace(target)
    except OSError as error:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "item": None, "reason": str(error)[:120]}
    return {"ok": True, "item": _entry(target, folder().resolve()), "reason": ""}


def create_link(parent: str, name: str, target: str) -> dict:
    """Make a shortcut to one of the host's workflows.

    Args:
        parent: Where to make it, empty for the root.
        name: What to call it, usually the workflow's own name.
        target: The workflow's path, as the host spells it.

    Returns:
        ``{ok, item, reason}``.
    """
    holder, problem = _target(parent)
    if problem or holder is None:
        return {"ok": False, "item": None, "reason": problem}
    if not holder.is_dir():
        return {"ok": False, "item": None, "reason": "is not a folder"}
    parts, _ = _parts(parent)
    if len(parts) >= DEPTH:
        return {"ok": False, "item": None, "reason": f"deeper than {DEPTH} folders"}
    wanted, problem = _clean_target(target)
    if problem:
        return {"ok": False, "item": None, "reason": problem}
    made = holder / _named(name, "link")
    part = made.with_name(f"{made.name}.part")
    try:
        part.write_text(f"{wanted}\n", encoding="utf-8")
        part.replace(made)
    except OSError as error:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "item": None, "reason": str(error)[:120]}
    return {"ok": True, "item": _entry(made, folder().resolve()), "reason": ""}


def set_target(relative: str, target: str) -> dict:
    """Point an existing shortcut at a different workflow.

    Args:
        relative: The shortcut, as a path under the documents root.
        target: The workflow's path, as the host spells it.

    Returns:
        ``{ok, item, reason}``.
    """
    found, problem = _target(relative)
    if problem or found is None:
        return {"ok": False, "item": None, "reason": problem}
    if not found.is_file() or found.suffix != LINK_SUFFIX:
        return {"ok": False, "item": None, "reason": "is not a shortcut"}
    wanted, problem = _clean_target(target)
    if problem:
        return {"ok": False, "item": None, "reason": problem}
    part = found.with_name(f"{found.name}.part")
    try:
        part.write_text(f"{wanted}\n", encoding="utf-8")
        part.replace(found)
    except OSError as error:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "item": None, "reason": str(error)[:120]}
    return {"ok": True, "item": _entry(found, folder().resolve()), "reason": ""}


EDITS = (NOTE_SUFFIX, ".txt", ".json", ".yaml", ".yml", ".csv", ".toml", ".ini", ".cfg",
         ".conf", ".log", ".env", ".diff", ".patch")


def _editable(path: Path) -> bool:
    """Whether the editor may open this and write it back without ruining it."""
    return path.suffix.lower() in EDITS


def _as_text(path: Path) -> tuple[str, str]:
    """What the editor would show for one file.

    Returns:
        ``(body, problem)``. A file whose bytes are not text is a problem, not an empty body.
    """
    if not _editable(path):
        return "", "is not text this edits"
    try:
        if path.stat().st_size > BODY_LIMIT:
            return "", "larger than this reads"
        body = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return "", "is not text this edits"
    except OSError as error:
        return "", str(error)[:120]
    return ("", "is not text this edits") if "\x00" in body else (body, "")


def read_note(relative: str) -> dict:
    """One note's markdown.

    Returns:
        ``{ok, path, name, body, at, reason}``.
    """
    found, problem = _target(relative)
    if problem or found is None:
        return {"ok": False, "path": relative, "name": "", "body": "", "at": 0,
                "reason": problem}
    if not found.is_file():
        return {"ok": False, "path": relative, "name": "", "body": "", "at": 0,
                "reason": "is not a note"}
    body, problem = _as_text(found)
    if problem:
        return {"ok": False, "path": relative, "name": "", "body": "", "at": 0,
                "reason": problem}
    return {"ok": True, "path": relative, "name": _display(found.name), "body": body,
            "at": int(found.stat().st_mtime), "reason": ""}


def _swap(part: Path, target: Path) -> None:
    """Move a finished scratch file into place, waiting out a destination that is busy.

    Raises:
        OSError: If it is still refused after the last attempt.
    """
    for wait in (0, 0.02, 0.05, 0.1, 0.2):
        if wait:
            time.sleep(wait)
        try:
            part.replace(target)
            return
        except PermissionError:
            continue
    part.replace(target)


def write_note(relative: str, body: str) -> dict:
    """Keep a note's markdown, replacing what was there.

    Returns:
        ``{ok, at, reason}``.
    """
    found, problem = _target(relative)
    if problem or found is None:
        return {"ok": False, "at": 0, "reason": problem}
    if not found.is_file():
        return {"ok": False, "at": 0, "reason": "is not a note"}
    _held, problem = _as_text(found)
    if problem:
        return {"ok": False, "at": 0, "reason": problem}
    text = str(body or "")
    if "\x00" in text:
        return {"ok": False, "at": 0, "reason": "is not text this edits"}
    if len(text.encode("utf-8")) > BODY_LIMIT:
        return {"ok": False, "at": 0, "reason": f"longer than {BODY_LIMIT // 1000}kB"}
    part = found.with_name(f"{found.name}.{os.getpid()}.{secrets.token_hex(4)}.part")
    try:
        part.write_text(text, encoding="utf-8")
        _swap(part, found)
    except OSError as error:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "at": 0, "reason": str(error)[:120]}
    return {"ok": True, "at": int(time.time()), "reason": ""}


def rename(relative: str, name: str) -> dict:
    """Give an item a new display name, keeping its id.

    Returns:
        ``{ok, item, reason}``.
    """
    if not str(relative or "").strip().strip("/"):
        return {"ok": False, "item": None, "reason": "the documents root has no name"}
    found, problem = _target(relative)
    if problem or found is None:
        return {"ok": False, "item": None, "reason": problem}
    held = _id_of(found.name) or ("" if found.is_file() else _fresh_id())
    tail = found.suffix if found.is_file() else ""
    target = found.with_name(f"{slug(name)}~{held}{tail}" if held else f"{slug(name)}{tail}")
    if target == found:
        return {"ok": True, "item": _entry(found, folder().resolve()), "reason": ""}
    try:
        found.rename(target)
    except OSError as error:
        return {"ok": False, "item": None, "reason": str(error)[:120]}
    return {"ok": True, "item": _entry(target, folder().resolve()), "reason": ""}


def _tall(path: Path, limit: int = DEPTH) -> int:
    """How many folder levels sit below this item, counted no further than it matters."""
    if not path.is_dir():
        return 0
    deepest = 0
    walking = [(path, 0)]
    while walking:
        here, down = walking.pop()
        if down >= limit:
            return limit
        try:
            entries = list(here.iterdir())
        except OSError:
            continue
        for one in entries:
            if one.name.startswith(".") or not one.is_dir():
                continue
            deepest = max(deepest, down + 1)
            walking.append((one, down + 1))
    return deepest


def move(relative: str, parent: str) -> dict:
    """Put an item inside another folder, keeping its name and id.

    Returns:
        ``{ok, item, reason}``.
    """
    found, problem = _target(relative)
    if problem or found is None:
        return {"ok": False, "item": None, "reason": problem}
    holder, problem = _target(parent)
    if problem or holder is None:
        return {"ok": False, "item": None, "reason": problem}
    if not holder.is_dir():
        return {"ok": False, "item": None, "reason": "is not a folder"}
    if holder == found or found in holder.parents:
        return {"ok": False, "item": None, "reason": "cannot go inside itself"}
    where, _ = _parts(parent)
    if len(where) + 1 + _tall(found) > DEPTH:
        return {"ok": False, "item": None, "reason": f"would sit deeper than {DEPTH} folders"}
    target = holder / found.name
    if target.exists():
        return {"ok": False, "item": None, "reason": "is already there"}
    try:
        shutil.move(str(found), str(target))
    except OSError as error:
        return {"ok": False, "item": None, "reason": str(error)[:120]}
    settled = holder / found.name
    if not settled.exists():
        return {"ok": False, "item": None, "reason": "did not arrive"}
    return {"ok": True, "item": _entry(settled, folder().resolve()), "reason": ""}


def remove(relative: str) -> dict:
    """Put an item in the wastebasket.

    Returns:
        ``{ok, token, reason}`` where the token restores it.
    """
    if not str(relative or "").strip().strip("/"):
        return {"ok": False, "token": "", "reason": "the documents root cannot be deleted"}
    found, problem = _target(relative)
    if problem or found is None:
        return {"ok": False, "token": "", "reason": problem}
    bin_dir = folder() / TRASH
    try:
        bin_dir.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        return {"ok": False, "token": "", "reason": str(error)[:120]}
    token = f"{int(time.time())}-{_fresh_id()}"
    target = bin_dir / f"{token}~{found.name}"
    try:
        shutil.move(str(found), str(target))
    except OSError as error:
        return {"ok": False, "token": "", "reason": str(error)[:120]}
    return {"ok": True, "token": target.name, "reason": ""}


def restore(token: str) -> dict:
    """Take an item back out of the wastebasket, to the Desktop.

    Args:
        token: The name :func:`remove` returned.

    Returns:
        ``{ok, item, reason}``.
    """
    text = str(token or "")
    if not text or text.startswith(".") or ".." in text or _UNNAMEABLE.search(text):
        return {"ok": False, "item": None, "reason": "not a wastebasket token"}
    base = folder().resolve()
    held = base / TRASH / text
    try:
        held = held.resolve(strict=True)
    except OSError:
        return {"ok": False, "item": None, "reason": "no longer in the Trash"}
    if (base / TRASH).resolve() not in held.parents:
        return {"ok": False, "item": None, "reason": "sits outside the wastebasket"}
    name = text.split("~", 1)[1] if "~" in text else text
    desk = base / DESKTOP
    target = desk / name
    if target.exists():
        return {"ok": False, "item": None, "reason": "something with that name is back already"}
    try:
        desk.mkdir(parents=True, exist_ok=True)
        shutil.move(str(held), str(target))
    except OSError as error:
        return {"ok": False, "item": None, "reason": str(error)[:120]}
    return {"ok": True, "item": _entry(target, base), "reason": ""}


def trash() -> dict:
    """What is in the wastebasket.

    Returns:
        ``{ok, items}`` with the newest first.
    """
    bin_dir = folder() / TRASH
    if not bin_dir.is_dir():
        return {"ok": True, "items": []}
    items = []
    try:
        for one in bin_dir.iterdir():
            try:
                stat = one.stat()
            except OSError:
                continue
            items.append({"token": one.name, "name": _display(one.name.split("~", 1)[-1]),
                          "kind": "folder" if one.is_dir() else "note",
                          "at": int(stat.st_mtime)})
    except OSError as error:
        return {"ok": False, "items": [], "reason": str(error)[:120]}
    items.sort(key=lambda one: one["at"], reverse=True)
    return {"ok": True, "items": items}


def empty_trash() -> dict:
    """Throw away everything in the wastebasket.

    Returns:
        ``{ok, count, reason}``.
    """
    bin_dir = folder() / TRASH
    if not bin_dir.is_dir():
        return {"ok": True, "count": 0, "reason": ""}
    gone = 0
    for one in list(bin_dir.iterdir()):
        try:
            if one.is_dir() and not one.is_symlink():
                shutil.rmtree(one)
            else:
                one.unlink()
        except OSError as error:
            return {"ok": False, "count": gone, "reason": str(error)[:120]}
        gone += 1
    try:
        _prune_icons()
    except OSError:
        pass
    try:
        _prune_media()
    except OSError:
        pass
    return {"ok": True, "count": gone, "reason": ""}


def locate(held: str) -> dict:
    """Where the item carrying an id sits now.

    Args:
        held: The eight-character id.

    Returns:
        ``{ok, item, reason}``.
    """
    text = str(held or "")
    if not re.fullmatch(r"[0-9a-z]{8}", text):
        return {"ok": False, "item": None, "reason": "not an id"}
    base = folder().resolve()
    walking = [(base, 0)]
    while walking:
        here, deep = walking.pop()
        try:
            entries = list(here.iterdir())
        except OSError:
            continue
        for one in entries:
            if one.name.startswith("."):
                continue
            if _id_of(one.name) == text:
                return {"ok": True, "item": _entry(one, base), "reason": ""}
            if one.is_dir() and deep < DEPTH:
                walking.append((one, deep + 1))
    return {"ok": False, "item": None, "reason": "no longer here"}


_MEDIA_LINK = re.compile(
    r"/open_manager/v1/api/docs/media\?name=([0-9a-f]{16}\.(?:png|jpg|webp|gif|avif))")


def _media_in(text: str) -> list:
    """Every pasted image one note refers to, in the order it first mentions them."""
    found = []
    for name in _MEDIA_LINK.findall(text):
        if name not in found:
            found.append(name)
    return found


def _inlined(text: str) -> tuple[str, int]:
    """One note with its images carried inside it as data URIs.

    Returns:
        ``(markdown, carried)``.
    """
    base = (folder() / MEDIA).resolve()
    carried = 0
    budget = 0
    for name in _media_in(text):
        try:
            at = (base / name).resolve(strict=True)
            if at.parent != base or not at.is_file():
                continue
            size = at.stat().st_size
            if budget + size > INLINE_BUDGET:
                break
            payload = at.read_bytes()
        except OSError:
            continue
        kind = MEDIA_KINDS.get(at.suffix.lower())
        if not kind:
            continue
        budget += size
        carried += 1
        data = base64.b64encode(payload).decode("ascii")
        text = text.replace(f"/open_manager/v1/api/docs/media?name={name}",
                            f"data:{kind};base64,{data}")
    return text, carried


def export_file(relative: str) -> tuple[bytes, str, str]:
    """One document's bytes, named the way a reader would expect to find it on their disk.

    Returns:
        ``(payload, name, problem)``.
    """
    found, problem = _target(relative)
    if problem or found is None:
        return b"", "", problem or "no such item"
    if not found.is_file():
        return b"", "", "is not a file"
    try:
        if found.stat().st_size > EXPORT_LIMIT:
            return b"", "", f"is larger than {EXPORT_LIMIT // 1_000_000}MB"
        payload = found.read_bytes()
    except OSError as error:
        return b"", "", str(error)[:120]
    tail = found.suffix if found.suffix else ""
    if tail == NOTE_SUFFIX:
        try:
            whole, _carried = _inlined(payload.decode("utf-8"))
            payload = whole.encode("utf-8")
        except (UnicodeDecodeError, OSError):
            pass
    return payload, f"{_display(found.name)}{tail}", ""


class _Overrun(Exception):
    """A bundle that reached one of its caps, carrying the sentence to answer with."""


def kind_at(relative: str) -> tuple[str, str]:
    """Whether a path points at a folder or a file.

    Returns:
        ``(kind, problem)`` where kind is ``folder``, ``file`` or an empty string.
    """
    found, problem = _target(relative)
    if problem or found is None:
        return "", problem or "no such item"
    return ("folder" if found.is_dir() else "file"), ""


def _bundle_name(path: Path, taken: set) -> str:
    """What one item is called inside an archive."""
    tail = path.suffix if path.suffix in SUFFIXES else ""
    label = f"{_display(path.name)}{tail}"
    if label.lower() in taken:
        label = path.name
    taken.add(label.lower())
    return label


def zip_folder(relative: str):
    """One folder and everything under it, as a zip.

    Returns:
        ``(spool, name, problem)``. The spool is positioned at its start.
    """
    found, problem = _target(relative)
    if problem or found is None:
        return None, "", problem or "no such item"
    if not found.is_dir():
        return None, "", "is not a folder"
    spool = tempfile.SpooledTemporaryFile(max_size=SPOOL_MEM)
    counted = {"bytes": 0, "entries": 0}
    carried = set()
    try:
        with zipfile.ZipFile(spool, "w", zipfile.ZIP_DEFLATED) as bundle:
            walking = [(found, "")]
            while walking:
                here, where = walking.pop()
                try:
                    entries = sorted(here.iterdir(), key=lambda one: one.name.lower())
                except OSError:
                    continue
                taken = set()
                for one in entries:
                    if one.name.startswith("."):
                        continue
                    counted["entries"] += 1
                    if counted["entries"] > WALK_CAP:
                        raise _Overrun(f"holds more than {WALK_CAP} items")
                    label = _bundle_name(one, taken)
                    inside = f"{where}{label}"
                    folderish = one.is_dir() and not one.is_symlink()
                    if folderish:
                        if inside.count("/") >= DEPTH:
                            raise _Overrun(f"nests deeper than {DEPTH} folders")
                        bundle.writestr(f"{inside}/", "")
                        walking.append((one, f"{inside}/"))
                        continue
                    try:
                        counted["bytes"] += one.stat().st_size
                    except OSError:
                        continue
                    if counted["bytes"] > ZIP_BUDGET:
                        raise _Overrun(f"holds more than {ZIP_BUDGET // 1_000_000}MB")
                    if one.name.endswith(NOTE_SUFFIX):
                        try:
                            text = one.read_text(encoding="utf-8", errors="replace")
                        except OSError:
                            continue
                        carried.update(_media_in(text))
                        deep = "../" * inside.count("/")
                        bundle.writestr(inside, _MEDIA_LINK.sub(
                            lambda hit: f"{deep}media/{hit.group(1)}", text))
                        continue
                    try:
                        bundle.write(one, inside)
                    except (OSError, ValueError):
                        continue
            if carried:
                base = (folder() / MEDIA).resolve()
                for name in sorted(carried):
                    try:
                        at = (base / name).resolve(strict=True)
                        if at.parent != base or not at.is_file():
                            continue
                        counted["bytes"] += at.stat().st_size
                        if counted["bytes"] > ZIP_BUDGET:
                            raise _Overrun(f"holds more than {ZIP_BUDGET // 1_000_000}MB")
                        bundle.write(at, f"media/{name}")
                    except (OSError, ValueError):
                        continue
    except _Overrun as stopped:
        spool.close()
        return None, "", str(stopped)
    except OSError as error:
        spool.close()
        return None, "", str(error)[:120]
    spool.seek(0)
    return spool, f"{_display(found.name)}.zip", ""


def measure(relative: str = "") -> dict:
    """How much one item holds, counted all the way down.

    Returns:
        ``{ok, kind, bytes, files, folders, deepest, capped, words, lines, reason}``.
    """
    answer = {"ok": False, "kind": "", "bytes": 0, "files": 0, "folders": 0, "deepest": 0,
              "capped": False, "words": 0, "lines": 0, "reason": ""}
    found, problem = _target(relative)
    if problem or found is None:
        answer["reason"] = problem or "no such item"
        return answer
    if found.is_file():
        try:
            size = found.stat().st_size
        except OSError as error:
            answer["reason"] = str(error)[:120]
            return answer
        answer.update(ok=True, kind="note", bytes=size, files=1)
        if size > BODY_LIMIT:
            answer["capped"] = True
            return answer
        try:
            text = found.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return answer
        answer["words"] = len(text.split())
        answer["lines"] = text.count("\n") + (0 if text.endswith("\n") or not text else 1)
        return answer
    seen = 0
    walking = [(found, 0)]
    while walking:
        here, deep = walking.pop()
        answer["deepest"] = max(answer["deepest"], deep)
        try:
            entries = list(here.iterdir())
        except OSError:
            continue
        for one in entries:
            if one.name.startswith("."):
                continue
            seen += 1
            if seen > WALK_CAP:
                answer["capped"] = True
                walking = []
                break
            try:
                folderish = one.is_dir() and not one.is_symlink()
                answer["bytes"] += 0 if folderish else one.stat().st_size
            except OSError:
                continue
            if folderish:
                answer["folders"] += 1
                if deep + 1 < DEPTH:
                    walking.append((one, deep + 1))
            else:
                answer["files"] += 1
    answer["ok"] = True
    answer["kind"] = "folder"
    return answer


def _image_kind(payload: bytes) -> str:
    """The extension an image's own bytes say it is, or an empty string."""
    if payload[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if payload[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if payload[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        return ".webp"
    if payload[4:8] == b"ftyp" and b"avif" in payload[8:32]:
        return ".avif"
    return ""


def media_folder() -> Path:
    """Where pasted images live, created if it is not there yet."""
    target = folder() / MEDIA
    target.mkdir(parents=True, exist_ok=True)
    return target


def keep_media(payload: bytes) -> dict:
    """Keep an image a reader pasted into a note.

    Returns:
        ``{ok, name, size, reason}``.
    """
    if not payload:
        return {"ok": False, "name": "", "size": 0, "reason": "carried no image"}
    if len(payload) > MEDIA_LIMIT:
        return {"ok": False, "name": "", "size": 0,
                "reason": f"is larger than {MEDIA_LIMIT // 1_000_000}MB"}
    tail = _image_kind(payload)
    if not tail:
        return {"ok": False, "name": "", "size": 0, "reason": "is not an image this keeps"}
    name = f"{hashlib.sha256(payload).hexdigest()[:16]}{tail}"
    base = media_folder().resolve()
    target = base / name
    if target.is_file():
        return {"ok": True, "name": name, "size": target.stat().st_size, "reason": ""}
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
    return {"ok": True, "name": name, "size": len(payload), "reason": ""}


def _icon_kind(payload: bytes) -> str:
    """The extension an icon's own bytes say it is, or an empty string."""
    if payload[:4] == b"\x00\x00\x01\x00" and int.from_bytes(payload[4:6], "little") >= 1:
        return ".ico"
    found = _image_kind(payload)
    return found if found in ICON_KINDS else ""


def icon_folder() -> Path:
    """Where folder icons live, created if it is not there yet."""
    target = folder() / ICONS
    target.mkdir(parents=True, exist_ok=True)
    return target


def set_icon(relative: str, payload: bytes) -> dict:
    """Give a folder an icon of its own.

    Returns:
        ``{ok, item, reason}``.
    """
    found, problem = _target(relative)
    if problem or found is None:
        return {"ok": False, "item": None, "reason": problem}
    if not found.is_dir():
        return {"ok": False, "item": None, "reason": "is not a folder"}
    held = _id_of(found.name)
    if not held:
        return {"ok": False, "item": None, "reason": "cannot take an icon"}
    if not payload:
        return {"ok": False, "item": None, "reason": "carried no icon"}
    if len(payload) > ICON_LIMIT:
        return {"ok": False, "item": None,
                "reason": f"is larger than {ICON_LIMIT // 1000}kB"}
    tail = _icon_kind(payload)
    if not tail:
        return {"ok": False, "item": None, "reason": "is not an icon this keeps"}
    base = icon_folder().resolve()
    target = base / f"{held}{tail}"
    part = target.with_name(f"{target.name}.part")
    try:
        part.write_bytes(payload)
        part.replace(target)
        for one in base.glob(f"{held}.*"):
            if one != target and _ICON_NAME.match(one.name):
                one.unlink(missing_ok=True)
    except OSError as error:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "item": None, "reason": str(error)[:120]}
    return {"ok": True, "item": _entry(found, folder().resolve()), "reason": ""}


def clear_icon(relative: str) -> dict:
    """Take a folder's own icon away, leaving it drawn as any other folder.

    Returns:
        ``{ok, item, reason}``.
    """
    found, problem = _target(relative)
    if problem or found is None:
        return {"ok": False, "item": None, "reason": problem}
    held = _id_of(found.name)
    if not held:
        return {"ok": False, "item": None, "reason": "has no icon of its own"}
    base = folder() / ICONS
    try:
        for one in base.glob(f"{held}.*"):
            if _ICON_NAME.match(one.name):
                one.unlink(missing_ok=True)
    except OSError as error:
        return {"ok": False, "item": None, "reason": str(error)[:120]}
    return {"ok": True, "item": _entry(found, folder().resolve()), "reason": ""}


def set_colour(relative: str, shade: str) -> dict:
    """Give an item a colour, or take it away when the colour is empty.

    Returns:
        ``{ok, item, reason}``.
    """
    found, problem = _target(relative)
    if problem or found is None:
        return {"ok": False, "item": None, "reason": problem}
    held = _id_of(found.name)
    if not held:
        return {"ok": False, "item": None, "reason": "cannot take a colour"}
    wanted = _clean_colour(shade)
    if shade and not wanted:
        return {"ok": False, "item": None, "reason": "is not a colour this paints with"}
    mark = icon_folder() / f"{held}{COLOUR_SUFFIX}"
    try:
        if wanted:
            mark.write_text(f"{wanted}\n", encoding="utf-8")
        else:
            mark.unlink(missing_ok=True)
    except OSError as error:
        return {"ok": False, "item": None, "reason": str(error)[:120]}
    return {"ok": True, "item": _entry(found, folder().resolve()), "reason": ""}


def icon(name: str) -> tuple[bytes, str, str]:
    """One folder icon's bytes.

    Returns:
        ``(payload, content_type, problem)``.
    """
    text = str(name or "").strip()
    if not _ICON_NAME.match(text):
        return b"", "", "not a name inside the icons directory"
    base = (folder() / ICONS).resolve()
    try:
        found = (base / text).resolve(strict=True)
    except OSError:
        return b"", "", "no such icon"
    if found.parent != base or not found.is_file():
        return b"", "", "sits outside the icons directory"
    try:
        if found.stat().st_size > ICON_LIMIT:
            return b"", "", "is larger than this serves"
        return found.read_bytes(), ICON_KINDS[found.suffix.lower()], ""
    except OSError:
        return b"", "", "could not be read"


def _prune_icons() -> None:
    """Drop icons whose folder is gone."""
    base = folder().resolve()
    live = set()
    walking = [(base, 0)]
    while walking:
        here, deep = walking.pop()
        try:
            entries = list(here.iterdir())
        except OSError:
            return
        for one in entries:
            if one.name.startswith("."):
                continue
            live.add(_id_of(one.name))
            if one.is_dir() and deep < DEPTH:
                walking.append((one, deep + 1))
    try:
        for one in (base / TRASH).iterdir():
            live.add(_id_of(one.name.split("~", 1)[-1]))
    except OSError:
        pass
    try:
        for one in (base / ICONS).iterdir():
            held = one.name.split(".", 1)[0]
            if held in live:
                continue
            if _ICON_NAME.match(one.name) or one.name.endswith(COLOUR_SUFFIX):
                one.unlink(missing_ok=True)
    except OSError:
        return


MEDIA_WALK = DEPTH + 2


def _prune_media() -> None:
    """Drop pasted images no note refers to any more."""
    base = folder().resolve()
    wanted = set()
    walking = [(base, 0)]
    while walking:
        here, deep = walking.pop()
        try:
            entries = list(here.iterdir())
        except OSError:
            return
        for one in entries:
            if one.name in (MEDIA, ICONS):
                continue
            try:
                if one.is_dir() and not one.is_symlink():
                    if deep >= MEDIA_WALK:
                        return
                    walking.append((one, deep + 1))
                    continue
            except OSError:
                return
            if not one.name.endswith(NOTE_SUFFIX):
                continue
            try:
                wanted.update(_media_in(one.read_text(encoding="utf-8")))
            except UnicodeDecodeError:
                continue
            except OSError:
                return
    try:
        for one in (base / MEDIA).iterdir():
            if one.name in wanted or not _MEDIA_NAME.match(one.name):
                continue
            one.unlink(missing_ok=True)
    except OSError:
        return


def media(name: str) -> tuple[bytes, str, str]:
    """One pasted image's bytes.

    Returns:
        ``(payload, content_type, problem)``.
    """
    text = str(name or "").strip()
    if not _MEDIA_NAME.match(text):
        return b"", "", "not a name inside the media directory"
    base = (folder() / MEDIA).resolve()
    try:
        found = (base / text).resolve(strict=True)
    except OSError:
        return b"", "", "no such image"
    if found.parent != base or not found.is_file():
        return b"", "", "sits outside the media directory"
    try:
        if found.stat().st_size > MEDIA_LIMIT:
            return b"", "", "is larger than this serves"
        return found.read_bytes(), MEDIA_KINDS[found.suffix.lower()], ""
    except OSError:
        return b"", "", "could not be read"
