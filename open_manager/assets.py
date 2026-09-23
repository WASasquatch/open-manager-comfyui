"""What this install has made, and anything else a reader may look at where it lives."""

from __future__ import annotations

import hashlib
import os
import re
from io import BytesIO
from pathlib import Path

from . import gates, paths

__all__ = ["ALL_CAP", "FLOW_KEYS", "KINDS", "PAGE", "PAGE_CAP", "ROOTS", "SCAN_CAP",
           "THUMB_EDGE", "WRITE_CAP", "WRITE_KINDS",
           "TEXT_CAP", "TEXT_EDITS", "VIEW_TYPES",
           "listing", "locate", "peek", "read_text", "remove", "root_of", "search",
           "strip_workflow", "sweep_thumbs", "thumb", "thumb_folder", "workflow_of",
           "write", "write_text"]

ROOTS = ("output", "input", "temp")

KINDS = {
    ".png": "still", ".jpg": "still", ".jpeg": "still", ".webp": "still", ".gif": "still",
    ".bmp": "still",
    ".exr": "raw", ".dng": "raw", ".tif": "raw", ".tiff": "raw", ".psd": "raw",
    ".mp4": "video", ".webm": "video", ".mov": "video", ".mkv": "video", ".avi": "video",
    ".flac": "audio", ".mp3": "audio", ".wav": "audio", ".ogg": "audio",
    ".json": "text", ".txt": "text", ".yaml": "text",
}

SCAN_CAP = 50_000

PAGE = 120

PAGE_CAP = 500

ALL_CAP = 8_000

FOLDER_CAP = 500

_SEGMENT = re.compile(r"^[^\\/:*?\"<>|]+$")


def _host():
    """ComfyUI's own path module, or ``None`` where this is not running inside it."""
    try:
        import folder_paths
    except ImportError:
        return None
    return folder_paths


def _place_root(name: str) -> tuple[Path | None, str]:
    """One of the file browser's places, as a directory."""
    from . import files

    answer = files.places()
    if not answer["ok"]:
        return None, answer["reason"]
    for one in answer["places"]:
        if one["id"] == name:
            return Path(one["path"]), ""
    return None, "not a directory this lists"


def root_of(name: str, write: bool = False) -> tuple[Path | None, str]:
    """The directory one root name points at, as the host resolves it.

    Args:
        name: One of :data:`ROOTS`, or the id of any place the file browser lists.
        write: Whether the caller means to change what is there. A place is refused unless
            this install has writing switched on; ComfyUI's own three are not.

    Returns:
        ``(directory, problem)``.
    """
    asked = str(name or "").strip()
    if asked.lower() in ROOTS:
        host = _host()
        if host is None:
            return None, "ComfyUI's own paths are not available"
        found = host.get_directory_by_type(asked.lower())
        if not found:
            return None, "ComfyUI does not have that directory"
        return Path(found), ""
    if write and not gates.WRITES:
        return None, ("writing is switched off for this install: set "
                      f"{gates.NAMES['writes']} to turn it on")
    return _place_root(asked)


def _inside(root: Path, relative: str) -> tuple[Path | None, str]:
    """One path inside a root, refused unless it stays there once links are followed."""
    text = str(relative or "").replace("\\", "/").strip("/")
    if not text:
        return root, ""
    if ".." in text.split("/") or len(text) > 400:
        return None, "not a path inside that directory"
    for part in text.split("/"):
        if not _SEGMENT.match(part):
            return None, "not a path inside that directory"
    try:
        found = (root / text).resolve(strict=True)
        home = root.resolve(strict=True)
    except OSError:
        return None, "no such file"
    if found != home and home not in found.parents:
        return None, "sits outside that directory"
    return found, ""


def _kind(name: str) -> str:
    return KINDS.get(Path(name).suffix.lower(), "other")


def _entry(item: os.DirEntry, sub: str) -> dict:
    """One file, in the shape a gallery draws a placeholder from."""
    try:
        stat = item.stat(follow_symlinks=False)
    except OSError:
        return {}
    kind = _kind(item.name)
    return {
        "name": item.name,
        "sub": sub,
        "kind": kind,
        "size": stat.st_size,
        "at": int(stat.st_mtime),
        "thumb": kind in THUMB_KINDS,
    }


def listing(root: str = "output", path: str = "", page: int = 0, size: int = PAGE,
            sort: str = "new", kind: str = "all", find: str = "") -> dict:
    """What sits inside one directory of this install.

    Args:
        root: One of :data:`ROOTS`, or the id of any place the file browser lists.
        path: A subfolder inside it, empty for the top.
        page: Which page of entries, from zero.
        size: How many entries a page holds. Zero or less asks for the whole directory, up
            to ``ALL_CAP``.
        sort: ``new``, ``old``, ``name`` or ``size``.
        kind: ``all``, ``still``, ``video``, or any other kind name.
        find: Matched against the file name.

    Returns:
        ``{ok, root, path, folders, items, total, page, size, capped, reason}``.
    """
    home, problem = root_of(root)
    if problem or home is None:
        return {"ok": False, "root": root, "path": path, "folders": [], "items": [],
                "total": 0, "page": 0, "size": 0, "capped": False, "reason": problem}
    here, problem = _inside(home, path)
    if problem or here is None:
        return {"ok": False, "root": root, "path": path, "folders": [], "items": [],
                "total": 0, "page": 0, "size": 0, "capped": False, "reason": problem}
    if not here.is_dir():
        return {"ok": False, "root": root, "path": path, "folders": [], "items": [],
                "total": 0, "page": 0, "size": 0, "capped": False, "reason": "is not a folder"}

    want = str(find or "").strip().lower()
    wanted = str(kind or "all").strip().lower()
    folders = []
    items = []
    seen = 0
    capped = False
    try:
        with os.scandir(here) as reading:
            for item in reading:
                seen += 1
                if seen > SCAN_CAP:
                    capped = True
                    break
                if item.name.startswith("."):
                    continue
                try:
                    if item.is_dir(follow_symlinks=False):
                        if len(folders) < FOLDER_CAP and (not want or want in item.name.lower()):
                            folders.append(item.name)
                        continue
                except OSError:
                    continue
                if want and want not in item.name.lower():
                    continue
                made = _entry(item, str(path or "").strip("/"))
                if not made:
                    continue
                if wanted != "all" and made["kind"] != wanted:
                    continue
                items.append(made)
    except OSError as error:
        return {"ok": False, "root": root, "path": path, "folders": [], "items": [],
                "total": 0, "page": 0, "size": 0, "capped": False,
                "reason": str(error)[:120]}

    order = {
        "new": lambda one: -one["at"],
        "old": lambda one: one["at"],
        "size": lambda one: -one["size"],
    }.get(str(sort or "new").strip().lower())
    if order:
        items.sort(key=lambda one: (order(one), one["name"].lower()))
    else:
        items.sort(key=lambda one: one["name"].lower())
    folders.sort(key=str.lower)

    asked = int(size) if size is not None else PAGE
    whole = asked <= 0
    held = ALL_CAP if whole else max(1, min(asked, PAGE_CAP))
    at = 0 if whole else max(0, int(page or 0))
    start = at * held
    return {
        "ok": True, "root": root, "path": str(path or "").strip("/"),
        "folders": folders, "items": items[start:start + held],
        "total": len(items), "page": at, "size": held, "capped": capped, "reason": "",
    }


VIEW_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp",
    ".avif": "image/avif",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
    ".flac": "audio/flac", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    ".ogg": "audio/ogg",
}


def locate(root: str, relative: str) -> tuple[Path | None, str, str]:
    """One file to hand back whole, with the type it may safely be handed back as.

    Only pictures, video and sound are served, typed from :data:`VIEW_TYPES`.

    Returns:
        ``(path, content_type, problem)``.
    """
    home, problem = root_of(root)
    if problem or home is None:
        return None, "", problem
    found, problem = _inside(home, relative)
    if problem or found is None:
        return None, "", problem
    if found == home.resolve() or not found.is_file():
        return None, "", "is not a file this shows"
    kind = VIEW_TYPES.get(found.suffix.lower())
    if not kind:
        return None, "", "is not a picture, a video or a sound"
    return found, kind, ""


TEXT_EDITS = (".md", ".txt", ".json", ".yaml", ".yml", ".csv", ".toml", ".ini", ".cfg",
              ".conf", ".log", ".env", ".diff", ".patch")

TEXT_CAP = 2_000_000


def _text_of(path: Path) -> tuple[str, str]:
    """What the editor would show for one file.

    Returns:
        ``(body, problem)``. Bytes that are not text are a problem, not an empty body.
    """
    if path.suffix.lower() not in TEXT_EDITS:
        return "", "is not text this edits"
    try:
        if path.stat().st_size > TEXT_CAP:
            return "", "larger than this reads"
        body = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return "", "is not text this edits"
    except OSError as error:
        return "", str(error)[:120]
    return ("", "is not text this edits") if "\x00" in body else (body, "")


def read_text(root: str, relative: str) -> dict:
    """One text file, from any directory a reader may look in.

    Returns:
        ``{ok, name, body, at, reason}``.
    """
    nothing = {"ok": False, "name": "", "body": "", "at": 0}
    home, problem = root_of(root)
    if problem or home is None:
        return {**nothing, "reason": problem}
    found, problem = _inside(home, relative)
    if problem or found is None:
        return {**nothing, "reason": problem}
    if found == home.resolve() or not found.is_file():
        return {**nothing, "reason": "is not a file this reads"}
    body, problem = _text_of(found)
    if problem:
        return {**nothing, "reason": problem}
    return {"ok": True, "name": found.name, "body": body,
            "at": int(found.stat().st_mtime), "reason": ""}


def write_text(root: str, relative: str, body: str) -> dict:
    """Keep what the editor holds, over a text file that is already there.

    Returns:
        ``{ok, at, reason}``.
    """
    if not gates.WRITES:
        return {"ok": False, "at": 0,
                "reason": ("writing is switched off for this install: set "
                           f"{gates.NAMES['writes']} to turn it on")}
    home, problem = root_of(root, write=True)
    if problem or home is None:
        return {"ok": False, "at": 0, "reason": problem}
    found, problem = _inside(home, relative)
    if problem or found is None:
        return {"ok": False, "at": 0, "reason": problem}
    if found == home.resolve() or not found.is_file():
        return {"ok": False, "at": 0, "reason": "is not a file this writes"}
    _held, problem = _text_of(found)
    if problem:
        return {"ok": False, "at": 0, "reason": problem}
    text = str(body or "")
    if "\x00" in text:
        return {"ok": False, "at": 0, "reason": "is not text this edits"}
    if len(text.encode("utf-8")) > TEXT_CAP:
        return {"ok": False, "at": 0, "reason": f"longer than {TEXT_CAP // 1000}kB"}
    spare = found.with_name(f".om-{os.getpid()}-{found.name}")
    try:
        spare.write_text(text, encoding="utf-8")
        spare.replace(found)
    except OSError as error:
        try:
            spare.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "at": 0, "reason": str(error)[:120]}
    return {"ok": True, "at": int(found.stat().st_mtime), "reason": ""}


def remove(root: str, relative: str) -> dict:
    """Delete one file this install made.

    Returns:
        ``{ok, reason}``.
    """
    home, problem = root_of(root, write=True)
    if problem or home is None:
        return {"ok": False, "reason": problem}
    found, problem = _inside(home, relative)
    if problem or found is None:
        return {"ok": False, "reason": problem}
    if found == home.resolve() or not found.is_file():
        return {"ok": False, "reason": "is not a file this deletes"}
    try:
        found.unlink()
    except OSError as error:
        return {"ok": False, "reason": str(error)[:120]}
    return {"ok": True, "reason": ""}


WRITE_KINDS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
               ".webp": "image/webp"}

WRITE_CAP = 32 * 1024 * 1024


def _inside_new(root: Path, relative: str) -> tuple[Path | None, str]:
    """A path inside a root for a file that does not exist yet."""
    text = str(relative or "").replace("\\", "/").strip("/")
    if not text or len(text) > 400:
        return None, "not a path inside that directory"
    parts = text.split("/")
    if ".." in parts or any(not _SEGMENT.match(one) for one in parts):
        return None, "not a path inside that directory"
    leaf = parts[-1]
    if leaf in {".", ".."} or leaf != leaf.strip() or leaf.endswith("."):
        return None, "not a name this writes"
    if Path(leaf).suffix.lower() not in WRITE_KINDS:
        return None, "not a picture this writes"
    holder, problem = _inside(root, "/".join(parts[:-1]))
    if problem or holder is None:
        return None, problem or "no such directory"
    if not holder.is_dir():
        return None, "no such directory"
    found = holder / leaf
    if found.is_symlink():
        return None, "sits outside that directory"
    return found, ""


def write(root: str, relative: str, data: bytes, replace: bool = False) -> dict:
    """Put a picture on disk under one of the ComfyUI directories.

    Args:
        root: One of :data:`ROOTS`, or, with writing switched on, the id of any place the
            file browser lists.
        relative: Where inside it, including the name.
        data: The encoded picture.
        replace: Whether an existing file of that name may be written over.

    Returns:
        ``{ok, reason, name, sub, bytes}``.
    """
    nothing = {"ok": False, "name": "", "sub": "", "bytes": 0}
    if not isinstance(data, (bytes, bytearray)) or not data:
        return {**nothing, "reason": "nothing to write"}
    if len(data) > WRITE_CAP:
        return {**nothing, "reason": "larger than this writes"}
    home, problem = root_of(root, write=True)
    if problem or home is None:
        return {**nothing, "reason": problem}
    found, problem = _inside_new(home, relative)
    if problem or found is None:
        return {**nothing, "reason": problem}
    if found.exists():
        if not replace:
            return {**nothing, "reason": "there is already one of that name"}
        if not found.is_file():
            return {**nothing, "reason": "is not a file this writes"}

    spare = found.with_name(f".om-{os.getpid()}-{found.name}")
    try:
        with open(spare, "wb") as writing:
            writing.write(data)
        os.replace(spare, found)
    except OSError as error:
        try:
            spare.unlink(missing_ok=True)
        except OSError:
            pass
        return {**nothing, "reason": str(error)[:120]}
    sub = str(found.parent.relative_to(home.resolve(strict=True))).replace("\\", "/")
    return {"ok": True, "reason": "", "name": found.name,
            "sub": "" if sub == "." else sub, "bytes": len(data)}


FLOW_KEYS = ("workflow", "prompt")

_PNG = b"\x89PNG\r\n\x1a\n"

HEAD_READ = 2_000_000

SEARCH_CAP = 8_000


def _chunks(payload: bytes):
    """Every PNG chunk in a buffer, as ``(kind, data, start, end)``."""
    at = len(_PNG)
    size = len(payload)
    while at + 8 <= size:
        length = int.from_bytes(payload[at:at + 4], "big")
        kind = payload[at + 4:at + 8]
        end = at + 12 + length
        if end > size:
            return
        yield kind, payload[at + 8:at + 8 + length], at, end
        if kind == b"IEND":
            return
        at = end


def _texts(payload: bytes) -> dict:
    """The text chunks a PNG carries, keyword to text, uncompressed ones only."""
    found = {}
    if not payload.startswith(_PNG):
        return found
    for kind, data, _start, _end in _chunks(payload):
        if kind == b"IDAT":
            break
        if kind == b"tEXt":
            key, _sep, text = data.partition(b"\x00")
            found[key.decode("latin-1", "replace")] = text.decode("utf-8", "replace")
        elif kind == b"iTXt":
            key, _sep, rest = data.partition(b"\x00")
            if len(rest) >= 2 and rest[0] == 0:
                body = rest[2:].split(b"\x00", 2)[-1]
                found[key.decode("latin-1", "replace")] = body.decode("utf-8", "replace")
    return found


def _head(path: Path) -> bytes:
    """The front of a file, which is where the text this reads lives."""
    try:
        with path.open("rb") as reading:
            return reading.read(HEAD_READ)
    except OSError:
        return b""


def workflow_of(root: str, relative: str) -> dict:
    """What graph text one file carries.

    Returns:
        ``{ok, keys, kind, reason}`` where keys names the text chunks found.
    """
    home, problem = root_of(root)
    if problem or home is None:
        return {"ok": False, "keys": [], "kind": "", "reason": problem}
    found, problem = _inside(home, relative)
    if problem or found is None or not found.is_file():
        return {"ok": False, "keys": [], "kind": "", "reason": problem or "no such file"}
    if found.suffix.lower() != ".png":
        return {"ok": True, "keys": [], "kind": _kind(found.name),
                "reason": "only a png is read here"}
    held = _texts(_head(found))
    return {"ok": True, "kind": "still",
            "keys": [key for key in FLOW_KEYS if held.get(key)], "reason": ""}


def strip_workflow(root: str, relative: str) -> dict:
    """Rewrite one PNG without the graph it carries.

    Returns:
        ``{ok, removed, reason}``.
    """
    home, problem = root_of(root)
    if problem or home is None:
        return {"ok": False, "removed": [], "reason": problem}
    found, problem = _inside(home, relative)
    if problem or found is None or not found.is_file():
        return {"ok": False, "removed": [], "reason": problem or "no such file"}
    if found.suffix.lower() != ".png":
        return {"ok": False, "removed": [],
                "reason": "only a png can have its workflow taken out here"}
    try:
        payload = found.read_bytes()
    except OSError as error:
        return {"ok": False, "removed": [], "reason": str(error)[:120]}
    if not payload.startswith(_PNG):
        return {"ok": False, "removed": [], "reason": "is not a png after all"}
    kept = bytearray(payload[:len(_PNG)])
    removed = []
    for kind, data, start, end in _chunks(payload):
        drop = False
        if kind in (b"tEXt", b"iTXt", b"zTXt"):
            key = data.partition(b"\x00")[0].decode("latin-1", "replace")
            if key in FLOW_KEYS:
                drop = True
                removed.append(key)
        if not drop:
            kept += payload[start:end]
    if not removed:
        return {"ok": True, "removed": [], "reason": "carried no workflow"}
    part = found.with_name(f"{found.name}.part")
    try:
        part.write_bytes(bytes(kept))
        part.replace(found)
    except OSError as error:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "removed": [], "reason": str(error)[:120]}
    return {"ok": True, "removed": removed, "reason": ""}


def search(root: str = "output", path: str = "", term: str = "", size: int = PAGE) -> dict:
    """Which files carry a graph mentioning a word.

    Returns:
        ``{ok, items, read, capped, reason}``.
    """
    want = str(term or "").strip().lower()
    if len(want) < 2:
        return {"ok": False, "items": [], "read": 0, "capped": False,
                "reason": "needs at least two letters"}
    home, problem = root_of(root)
    if problem or home is None:
        return {"ok": False, "items": [], "read": 0, "capped": False, "reason": problem}
    here, problem = _inside(home, path)
    if problem or here is None or not here.is_dir():
        return {"ok": False, "items": [], "read": 0, "capped": False,
                "reason": problem or "is not a folder"}
    held = max(1, min(int(size or PAGE), PAGE_CAP))
    items = []
    read = 0
    capped = False
    try:
        with os.scandir(here) as reading:
            for item in reading:
                if len(items) >= held or read >= SEARCH_CAP:
                    capped = True
                    break
                if item.name.startswith(".") or not item.name.lower().endswith(".png"):
                    continue
                try:
                    if item.is_dir(follow_symlinks=False):
                        continue
                except OSError:
                    continue
                read += 1
                texts = _texts(_head(Path(item.path)))
                joined = " ".join(texts.get(key, "") for key in FLOW_KEYS).lower()
                if not joined or want not in joined:
                    continue
                made = _entry(item, str(path or "").strip("/"))
                if made:
                    items.append(made)
    except OSError as error:
        return {"ok": False, "items": [], "read": read, "capped": False,
                "reason": str(error)[:120]}
    items.sort(key=lambda one: -one["at"])
    return {"ok": True, "items": items, "read": read, "capped": capped, "reason": ""}


THUMB_EDGE = 512

THUMB_CAP = 1024

THUMB_QUALITY = 72

THUMB_KEEP = 4_000

THUMB_SWEEP = 256

_thumb_writes = 0


THUMB_KINDS = ("still", "video")

POSTER_AT = 0.1


def _video_frame(found: Path):
    """A frame from near the start of a video, as a picture, or ``None``."""
    try:
        from PIL import Image
    except ImportError:
        return None

    try:
        import cv2
    except ImportError:
        cv2 = None
    if cv2 is not None:
        reading = None
        try:
            reading = cv2.VideoCapture(str(found))
            if reading.isOpened():
                count = int(reading.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
                if count > 1:
                    reading.set(cv2.CAP_PROP_POS_FRAMES, min(int(count * POSTER_AT), count - 1))
                ok, frame = reading.read()
                if not ok:
                    reading.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ok, frame = reading.read()
                if ok and frame is not None:
                    return Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        except Exception:  # noqa: BLE001
            pass
        finally:
            if reading is not None:
                try:
                    reading.release()
                except Exception:  # noqa: BLE001
                    pass

    try:
        import av
    except ImportError:
        return None
    try:
        with av.open(str(found)) as holding:
            stream = next((one for one in holding.streams if one.type == "video"), None)
            if stream is None:
                return None
            stream.thread_type = "AUTO"
            for frame in holding.decode(stream):
                return frame.to_image()
    except Exception:  # noqa: BLE001
        return None
    return None


def thumb_folder() -> Path:
    """Where shrunk copies live, created if it is not there yet."""
    return paths.store("thumbs")


def _root_key(name: str) -> str:
    """Which root a thumbnail belongs to, as something that can be part of a file name."""
    return hashlib.sha256(str(name or "").encode("utf-8")).hexdigest()[:8]


def _spot(home: Path, relative: str) -> str:
    """Which file a thumbnail is of. The same for every version of that file."""
    return hashlib.sha256(f"{home}|{relative}".encode("utf-8")).hexdigest()[:16]


def _mark(stat: os.stat_result, edge: int) -> str:
    """Which version of that file. Changes when the bytes do, or when the size asked for does."""
    return hashlib.sha256(
        f"{stat.st_mtime_ns}|{stat.st_size}|{edge}".encode("utf-8")
    ).hexdigest()[:10]


def _live_spots() -> dict:
    """Every file that could have a thumbnail, by the root it lives under."""
    live = {}
    seen = 0
    for name in ROOTS:
        home, problem = root_of(name)
        if problem or home is None:
            continue
        spots = set()
        whole = True
        for here, folders, files in os.walk(home, onerror=lambda _e: None):
            folders[:] = [one for one in folders if not one.startswith(".")]
            for leaf in files:
                seen += 1
                if seen > SCAN_CAP:
                    whole = False
                    break
                if _kind(leaf) not in THUMB_KINDS:
                    continue
                try:
                    spots.add(_spot(home, (Path(here) / leaf).relative_to(home).as_posix()))
                except ValueError:
                    whole = False
            if not whole:
                break
        if whole:
            live[_root_key(name)] = spots
    return live


def sweep_thumbs() -> dict:
    """Throw away thumbnails whose file is gone, then any excess by age.

    Returns:
        ``{ok, gone, kept, roots, reason}``, where ``roots`` names the ones that were swept.
    """
    base = thumb_folder()
    try:
        held = [one for one in base.iterdir() if one.is_file() and one.suffix == ".webp"]
    except OSError as error:
        return {"ok": False, "gone": 0, "kept": 0, "roots": [], "reason": str(error)[:120]}

    gone = 0
    live = _live_spots()
    for one in list(held):
        parts = one.stem.split("-")
        if len(parts) == 3:
            if parts[0] not in live or parts[1] in live[parts[0]]:
                continue
        try:
            one.unlink(missing_ok=True)
        except OSError:
            continue
        held.remove(one)
        gone += 1

    if len(held) > THUMB_KEEP:
        try:
            aged = sorted((one.stat().st_mtime, one.name, one) for one in held)
        except OSError:
            aged = []
        for _at, _name, one in aged[:max(0, len(aged) - THUMB_KEEP)]:
            try:
                one.unlink(missing_ok=True)
            except OSError:
                break
            gone += 1
            held.remove(one)

    return {"ok": True, "gone": gone, "kept": len(held), "roots": sorted(live), "reason": ""}


def thumb(root: str, relative: str, edge: int = THUMB_EDGE) -> tuple[bytes, str, str]:
    """One picture, shrunk once and kept.

    Returns:
        ``(payload, content_type, problem)``.
    """
    global _thumb_writes
    name = str(root or "").strip()
    home, problem = root_of(name)
    if problem or home is None:
        return b"", "", problem
    found, problem = _inside(home, relative)
    if problem or found is None or not found.is_file():
        return b"", "", problem or "no such file"
    kind = _kind(found.name)
    if kind not in THUMB_KINDS:
        return b"", "", "is not something this makes a thumbnail of"
    wanted = max(64, min(int(edge or THUMB_EDGE), THUMB_CAP))
    try:
        stat = found.stat()
    except OSError as error:
        return b"", "", str(error)[:120]
    rel = found.relative_to(home).as_posix()
    spot = _spot(home, rel)
    kept = thumb_folder() / f"{_root_key(name)}-{spot}-{_mark(stat, wanted)}.webp"
    try:
        if kept.is_file():
            return kept.read_bytes(), "image/webp", ""
    except OSError:
        pass
    try:
        from PIL import Image
    except ImportError:
        return b"", "", "has no image library to shrink with"
    try:
        if kind == "video":
            frame = _video_frame(found)
            if frame is None:
                return b"", "", "has no decoder for this video"
            shrunk = frame.convert("RGB")
            shrunk.thumbnail((wanted, wanted), Image.LANCZOS)
            buffer = BytesIO()
            shrunk.save(buffer, format="webp", quality=THUMB_QUALITY, method=4)
        else:
            with Image.open(found) as img:
                img.draft("RGB", (wanted, wanted))
                shrunk = img.convert("RGB")
                shrunk.thumbnail((wanted, wanted), Image.LANCZOS)
                buffer = BytesIO()
                shrunk.save(buffer, format="webp", quality=THUMB_QUALITY, method=4)
    except (OSError, ValueError) as error:
        return b"", "", f"could not be read: {str(error)[:80]}"
    payload = buffer.getvalue()
    part = kept.with_name(f"{kept.name}.part")
    try:
        part.write_bytes(payload)
        part.replace(kept)
        for stale in thumb_folder().glob(f"{_root_key(name)}-{spot}-*.webp"):
            if stale.name != kept.name:
                try:
                    stale.unlink(missing_ok=True)
                except OSError:
                    break
        _thumb_writes += 1
        if _thumb_writes == 1 or _thumb_writes % THUMB_SWEEP == 0:
            sweep_thumbs()
    except OSError:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
    return payload, "image/webp", ""


PEEK_SHOW = 4

PEEK_SCAN = 400

PEEK_DEEP = 3


def peek(root: str = "output", path: str = "", count: int = PEEK_SHOW) -> dict:
    """A few pictures from inside a folder, for drawing a card that says what is in it.

    Returns:
        ``{ok, items, reason}``.
    """
    home, problem = root_of(root)
    if problem or home is None:
        return {"ok": False, "items": [], "reason": problem}
    here, problem = _inside(home, path)
    if problem or here is None or not here.is_dir():
        return {"ok": False, "items": [], "reason": problem or "is not a folder"}
    wanted = max(1, min(int(count or PEEK_SHOW), 8))
    base = str(path or "").strip("/")
    found = []
    seen = 0
    nested = []
    try:
        with os.scandir(here) as reading:
            for item in reading:
                seen += 1
                if seen > PEEK_SCAN:
                    break
                if item.name.startswith("."):
                    continue
                try:
                    if item.is_dir(follow_symlinks=False):
                        if len(nested) < PEEK_DEEP:
                            nested.append(item.name)
                        continue
                except OSError:
                    continue
                if _kind(item.name) != "still":
                    continue
                made = _entry(item, base)
                if made:
                    found.append(made)
    except OSError as error:
        return {"ok": False, "items": [], "reason": str(error)[:120]}

    for name in nested:
        if len(found) >= wanted:
            break
        inside = peek(root, f"{base}/{name}" if base else name, wanted - len(found))
        if inside["ok"]:
            found.extend(inside["items"])

    found.sort(key=lambda one: -one["at"])
    return {"ok": True, "items": found[:wanted], "reason": ""}
