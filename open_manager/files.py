"""Every directory a reader may navigate, as one set of places."""

from __future__ import annotations

import os
import shutil
import time
from pathlib import Path

from . import gates

__all__ = ["CACHE_SECONDS", "PAGE_CAP", "copy", "forget", "kind_of", "listing",
           "make_folder", "move", "places", "remove", "rename", "within"]

PAGE_CAP = 5_000

KINDS = {
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image",
    ".bmp": "image", ".avif": "image",
    ".mp4": "video", ".webm": "video", ".mov": "video", ".mkv": "video", ".avi": "video",
    ".flac": "audio", ".mp3": "audio", ".wav": "audio", ".ogg": "audio",
    ".safetensors": "model", ".ckpt": "model", ".pt": "model", ".pth": "model",
    ".bin": "model", ".gguf": "model", ".onnx": "model", ".sft": "model",
    ".json": "text", ".yaml": "text", ".yml": "text", ".txt": "text", ".md": "text",
    ".csv": "text", ".toml": "text", ".ini": "text", ".cfg": "text", ".conf": "text",
    ".log": "text", ".html": "text", ".htm": "text", ".css": "text", ".js": "text",
    ".mjs": "text", ".ts": "text", ".xml": "text", ".svg": "text", ".py": "text",
    ".sh": "text", ".bat": "text", ".ps1": "text", ".sql": "text", ".env": "text",
    ".gitignore": "text", ".diff": "text", ".patch": "text",
}

_ASSET_ROOTS = ("output", "input", "temp")


def _host():
    """ComfyUI's own path module, or ``None`` where this is not running inside it."""
    try:
        import folder_paths
    except ImportError:
        return None
    return folder_paths


def _roots_apart(roots: list) -> list:
    """A short hint per root, for names the host gives more than one directory."""
    if len(roots) < 2:
        return [""] * len(roots)
    apart = len({str(Path(one)) for one in roots})
    parts = [Path(one).parts for one in roots]

    def drive(one: tuple) -> str:
        return _trimmed(Path(one[0])) if one else ""

    def head(one: tuple) -> str:
        return _trimmed(Path(*one[:2])) if len(one) > 1 else drive(one)

    shapes = (
        drive,
        head,
        lambda one: f"{drive(one)} {one[-1]}" if len(one) > 1 else drive(one),
        lambda one: f"{head(one)} {one[-1]}" if len(one) > 2 else head(one),
    )
    marks = [shapes[-1](one) for one in parts]
    for shape in shapes:
        shaped = [shape(one) for one in parts]
        if len(set(shaped)) == apart:
            return shaped
    return marks


def _trimmed(path: Path) -> str:
    """One path as a hint, without the separator a drive root carries."""
    text = str(path)
    while text.endswith(("\\", "/")) and len(text) > 1:
        text = text[:-1]
    return text


def _model_places(host) -> list:
    """Every model directory the host was configured with, as places."""
    found = []
    try:
        names = sorted(host.folder_names_and_paths)
    except Exception:  # noqa: BLE001
        return found
    for name in names:
        try:
            roots = host.get_folder_paths(name) or []
        except Exception:  # noqa: BLE001
            continue
        live = []
        for at, root in enumerate(roots):
            try:
                path = Path(root)
                if not path.is_dir():
                    continue
            except OSError:
                continue
            live.append((at, path))
        apart = _roots_apart([str(one) for _at, one in live])
        for seat, (at, path) in enumerate(live):
            found.append({
                "id": f"model:{name}:{at}",
                "label": name,
                "note": apart[seat],
                "group": "Models",
                "path": str(path),
                "writable": bool(gates.WRITES),
                "heavy": True,
            })
    return found


CACHE_SECONDS = 10

_held: dict = {"at": 0.0, "places": None}


def forget() -> None:
    """Drop the held places, so the next call looks at the disk again."""
    _held["places"] = None


def places(force: bool = False) -> dict:
    """Every directory a reader may look in, with the ones they may change marked.

    The answer is held for ``CACHE_SECONDS``.

    Args:
        force: Build it again even where a held answer would still do.

    Returns:
        ``{ok, places, writes, reason}``.
    """
    if not gates.FILES:
        return {"ok": False, "places": [], "writes": False,
                "reason": ("the file browser is not switched on for this install: set "
                           f"{gates.NAMES['files']} to turn it on")}
    host = _host()
    if host is None:
        return {"ok": False, "places": [], "writes": False,
                "reason": "ComfyUI's own paths are not available"}
    if not force and _held["places"] is not None:
        if time.monotonic() - _held["at"] < CACHE_SECONDS:
            return {"ok": True, "places": [dict(one) for one in _held["places"]],
                    "writes": bool(gates.WRITES), "reason": ""}
    found = _home_places()
    for name in _ASSET_ROOTS:
        try:
            root = host.get_directory_by_type(name)
        except Exception:  # noqa: BLE001
            root = None
        if not root or not Path(root).is_dir():
            continue
        found.append({
            "id": f"asset:{name}",
            "label": name,
            "group": "ComfyUI",
            "path": str(Path(root)),
            "writable": bool(gates.WRITES),
            "heavy": False,
        })
    found.extend(_workflow_place())
    found.extend(_model_places(host))
    _held["places"] = [dict(one) for one in found]
    _held["at"] = time.monotonic()
    return {"ok": True, "places": found, "writes": bool(gates.WRITES), "reason": ""}


def _workflow_place() -> list:
    """ComfyUI's saved workflows, where the host keeps any."""
    from . import paths

    root = paths.user_root()
    if root is None:
        return []
    here = root / "default" / "workflows"
    if not here.is_dir():
        return []
    return [{
        "id": "user:workflows",
        "label": "workflows",
        "group": "ComfyUI",
        "path": str(here),
        "writable": bool(gates.WRITES),
        "heavy": False,
    }]


_tidied = False


def _home_places() -> list:
    """The reader's own two folders, Desktop first.

    The tidy-up runs once for the life of the process, and again whenever either folder is
    missing.
    """
    global _tidied
    try:
        from . import docs

        root = docs.folder()
        if not _tidied or not all((root / one).is_dir() for one in docs.HOMES):
            docs.arrange()
            _tidied = True
    except Exception:  # noqa: BLE001
        return []
    found = []
    for name in docs.HOMES:
        here = root / name
        if not here.is_dir():
            continue
        found.append({
            "id": f"docs:{name.lower()}",
            "label": name,
            "group": "HOME",
            "path": str(here),
            "writable": bool(gates.WRITES),
            "heavy": False,
        })
    return found


def _place(held: str) -> tuple[dict | None, str]:
    """One place by its id, or the sentence naming why not."""
    answer = places()
    if not answer["ok"]:
        return None, answer["reason"]
    for one in answer["places"]:
        if one["id"] == held:
            return one, ""
    return None, "not a place this lists"


def within(place: dict, relative: str) -> tuple[Path | None, str]:
    """One path inside a place, refused unless it really is inside it."""
    root = Path(place["path"])
    text = str(relative or "").replace("\\", "/").strip("/")
    if "\x00" in text:
        return None, "is not a name"
    try:
        home = root.resolve(strict=True)
        found = (home / text).resolve(strict=True) if text else home
    except OSError:
        return None, "no such path"
    if found != home and home not in found.parents:
        return None, "not a path inside that directory"
    return found, ""


def kind_of(name: str) -> str:
    """What a file is, decided from its name."""
    suffix = Path(name).suffix.lower()
    if not suffix:
        return "text"
    return KINDS.get(suffix, "other")


def _labeller(place: str):
    """How this place's stored names are shown."""
    if not str(place or "").startswith("docs:"):
        return lambda name: name
    try:
        from . import docs

        return docs.display
    except Exception:  # noqa: BLE001
        return lambda name: name


def listing(place: str = "", path: str = "") -> dict:
    """What sits inside one directory of one place.

    Returns:
        ``{ok, place, path, writable, folders, items, capped, reason}``.
    """
    held, problem = _place(place)
    if problem or held is None:
        return {"ok": False, "place": place, "path": path, "writable": False,
                "folders": [], "items": [], "capped": False, "reason": problem}
    here, problem = within(held, path)
    if problem or here is None:
        return {"ok": False, "place": place, "path": path, "writable": False,
                "folders": [], "items": [], "capped": False, "reason": problem}
    if not here.is_dir():
        return {"ok": False, "place": place, "path": path, "writable": False,
                "folders": [], "items": [], "capped": False, "reason": "is not a folder"}
    folders = []
    items = []
    capped = False
    base = str(path or "").strip("/")
    label = _labeller(place)
    try:
        with os.scandir(here) as reading:
            for one in reading:
                if len(items) + len(folders) >= PAGE_CAP:
                    capped = True
                    break
                if one.name.startswith("."):
                    continue
                try:
                    stat = one.stat(follow_symlinks=False)
                    if one.is_dir(follow_symlinks=False):
                        folders.append({"name": one.name, "label": label(one.name),
                                        "at": int(stat.st_mtime)})
                        continue
                except OSError:
                    continue
                items.append({
                    "name": one.name,
                    "label": label(one.name),
                    "sub": base,
                    "kind": kind_of(one.name),
                    "size": stat.st_size,
                    "at": int(stat.st_mtime),
                })
    except OSError as error:
        return {"ok": False, "place": place, "path": path, "writable": False,
                "folders": [], "items": [], "capped": False, "reason": str(error)[:120]}
    folders.sort(key=lambda one: one["label"].lower())
    items.sort(key=lambda one: one["label"].lower())
    return {"ok": True, "place": place, "path": base, "writable": bool(held["writable"]),
            "heavy": bool(held.get("heavy")),
            "folders": folders, "items": items, "capped": capped, "reason": ""}


def _writable(place: str) -> tuple[dict | None, str]:
    """One place, refused unless this install may write to it."""
    if not gates.WRITES:
        return None, ("writing is switched off for this install: set "
                      f"{gates.NAMES['writes']} to turn it on")
    held, problem = _place(place)
    if problem or held is None:
        return None, problem
    if not held["writable"]:
        return None, "that directory is read-only here"
    return held, ""


def _named(name: str) -> tuple[str, str]:
    """A file name a caller may use, refused unless it is one plain segment."""
    text = str(name or "").strip()
    if not text or text in (".", ".."):
        return "", "is not a name"
    if "/" in text or "\\" in text or "\x00" in text or len(text) > 200:
        return "", "is not one plain name"
    return text, ""


def _carried(name: str, out_of: str, into: str) -> str:
    """What a file is called once it arrives, with the store's own bookkeeping left behind."""
    if not out_of.startswith("docs:") or into.startswith("docs:"):
        return name
    try:
        from . import docs

        tail = Path(name).suffix
        return docs.display(name) + (tail if tail in docs.SUFFIXES else "")
    except Exception:  # noqa: BLE001
        return name


def rename(place: str, path: str, name: str) -> dict:
    """Give one file or folder a different name, in the directory it is already in."""
    held, problem = _writable(place)
    if problem or held is None:
        return {"ok": False, "reason": problem}
    found, problem = within(held, path)
    if problem or found is None:
        return {"ok": False, "reason": problem}
    if found == Path(held["path"]).resolve():
        return {"ok": False, "reason": "is the directory itself"}
    wanted, problem = _named(name)
    if problem:
        return {"ok": False, "reason": problem}
    target = found.parent / wanted
    if target.exists():
        return {"ok": False, "reason": "something of that name is already there"}
    try:
        found.rename(target)
    except OSError as error:
        return {"ok": False, "reason": str(error)[:120]}
    forget()
    return {"ok": True, "name": wanted, "reason": ""}


def _moved(place: str, path: str, into: str, keep: bool, into_place: str = "") -> dict:
    """One file copied or moved into another directory."""
    held, problem = _writable(place)
    if problem or held is None:
        return {"ok": False, "reason": problem}
    wanted = str(into_place or "").strip() or place
    holder, problem = _writable(wanted) if wanted != place else (held, "")
    if problem or holder is None:
        return {"ok": False, "reason": problem}
    found, problem = within(held, path)
    if problem or found is None:
        return {"ok": False, "reason": problem}
    home = Path(held["path"]).resolve()
    if found == home:
        return {"ok": False, "reason": "is the directory itself"}
    there, problem = within(holder, into)
    if problem or there is None:
        return {"ok": False, "reason": problem}
    if not there.is_dir():
        return {"ok": False, "reason": "is not a folder"}
    if found.is_dir() and (there == found or found in there.parents):
        return {"ok": False, "reason": "cannot go inside itself"}
    name = _carried(found.name, place, holder["id"])
    target = there / name
    if target.exists() and name != found.name:
        name = found.name
        target = there / name
    if target.exists():
        return {"ok": False, "reason": "something of that name is already there"}
    try:
        if keep:
            if found.is_dir():
                shutil.copytree(found, target, symlinks=True)
            else:
                shutil.copy2(found, target)
        else:
            shutil.move(str(found), str(target))
    except (OSError, shutil.Error) as error:
        return {"ok": False, "reason": str(error)[:120]}
    forget()
    return {"ok": True, "name": name, "reason": ""}


def move(place: str, path: str, into: str, into_place: str = "") -> dict:
    """Move one file or folder into another directory, in this place or another."""
    return _moved(place, path, into, keep=False, into_place=into_place)


def copy(place: str, path: str, into: str, into_place: str = "") -> dict:
    """Copy one file or folder into another directory, in this place or another."""
    return _moved(place, path, into, keep=True, into_place=into_place)


def make_folder(place: str, path: str, name: str) -> dict:
    """Make a folder inside another.

    Args:
        place: Which place to make it in.
        path: The folder to make it inside, empty for the top of the place.
        name: What to call it, one plain segment.

    Returns:
        ``{ok, name, reason}``.
    """
    held, problem = _writable(place)
    if problem or held is None:
        return {"ok": False, "name": "", "reason": problem}
    safe, problem = _named(name)
    if problem:
        return {"ok": False, "name": "", "reason": problem}
    here, problem = within(held, path)
    if problem or here is None:
        return {"ok": False, "name": "", "reason": problem}
    if not here.is_dir():
        return {"ok": False, "name": "", "reason": "is not a folder"}
    target = here / safe
    if target.exists():
        return {"ok": False, "name": "", "reason": "something of that name is already there"}
    try:
        target.mkdir(parents=False, exist_ok=False)
    except OSError as error:
        return {"ok": False, "name": "", "reason": str(error)[:120]}
    forget()
    return {"ok": True, "name": safe, "reason": ""}


def remove(place: str, path: str) -> dict:
    """Delete one file or folder. There is no wastebasket for these."""
    held, problem = _writable(place)
    if problem or held is None:
        return {"ok": False, "reason": problem}
    found, problem = within(held, path)
    if problem or found is None:
        return {"ok": False, "reason": problem}
    if found == Path(held["path"]).resolve():
        return {"ok": False, "reason": "is the directory itself"}
    try:
        if found.is_dir() and not found.is_symlink():
            shutil.rmtree(found)
        else:
            found.unlink()
    except OSError as error:
        return {"ok": False, "reason": str(error)[:120]}
    forget()
    return {"ok": True, "reason": ""}
