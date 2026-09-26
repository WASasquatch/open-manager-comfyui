"""What is actually on disk, across every model folder ComfyUI knows."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from . import downloads, models, paths

__all__ = [
    "delete",
    "duplicates",
    "fingerprint",
    "declared_models",
    "index",
    "provenance",
    "references",
    "referrers",
    "storage",
    "sweep_partials",
    "hash_of",
]

MAX_FILES = 50_000

MAX_WORKFLOWS = 5_000

MAX_WORKFLOW_BYTES = 32 << 20

MAX_DECLARED = 500

SKIP_FOLDERS = models.NON_MODEL_FOLDERS

KNOWN_FORMATS = frozenset({
    ".safetensors", ".sft", ".gguf", ".ckpt", ".pt", ".pth", ".bin", ".onnx", ".engine",
    ".pkl", ".npz", ".yaml", ".msgpack",
})


def _dir() -> Path:
    """Where the library's own files are kept."""
    return paths.store()


def _read(name: str, fallback):
    """A JSON file from the library's directory, or the fallback."""
    try:
        return json.loads((_dir() / name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return fallback


def _write(name: str, value) -> None:
    """Persist a JSON file, silent on failure."""
    try:
        (_dir() / name).write_text(json.dumps(value), encoding="utf-8")
    except OSError:
        pass


def _key(path: str) -> str:
    """A path in the form two spellings of the same file agree on."""
    return str(path).replace("\\", "/").rstrip("/").lower()


def _hashes() -> dict:
    """Every digest already taken, keyed by path."""
    found = _read("model_hashes.json", {})
    return found if isinstance(found, dict) else {}


def hash_of(where: str, force: bool = False) -> str:
    """The sha256 of one file, taken now or remembered from before.

    Args:
        where: Path to the file.
        force: Hash again even where a usable answer is held.

    Returns:
        A hex digest, or an empty string where the file cannot be read.
    """
    target = models.owned_path(where)
    if target is None:
        return ""
    try:
        stat = target.stat()
    except OSError:
        return ""

    store = _hashes()
    key = _key(target)
    held = store.get(key)
    if (not force and isinstance(held, dict)
            and held.get("size") == stat.st_size
            and abs(float(held.get("mtime") or 0) - stat.st_mtime) < 1
            and held.get("sha256")):
        return str(held["sha256"])

    digest = models.sha256_file(str(target))
    if digest:
        store[key] = {"size": stat.st_size, "mtime": stat.st_mtime, "sha256": digest}
        _write("model_hashes.json", store)
    return digest


def _roots() -> list[dict]:
    """Every registered folder and the paths behind it, without descending yet."""
    found = []
    for directory in sorted(models.folders()):
        if directory in SKIP_FOLDERS:
            continue
        for root in models._folder_roots(directory):
            found.append({"directory": directory, "root": root})
    return found


def _unavailable(root: str) -> bool:
    """Whether a root is missing because the place it lives is missing."""
    try:
        anchor = Path(root).anchor
        return bool(anchor) and not Path(anchor).exists()
    except OSError:
        return True


def index(refresh: bool = False) -> dict:
    """Every model file on disk, across every registered folder.

    Args:
        refresh: Walk again rather than answering from the last walk.

    Returns:
        ``{files, partials, roots, skipped, scanned_at, truncated}``. ``skipped`` names roots
        whose drive is not mounted.
    """
    if not refresh:
        held = _read("model_index.json", None)
        if isinstance(held, dict) and isinstance(held.get("files"), list):
            return _with_finished_downloads(held)

    files: list[dict] = []
    partials: list[dict] = []
    skipped: list[str] = []
    seen: set[str] = set()
    truncated = False

    for entry in _roots():
        root = entry["root"]
        try:
            if not Path(root).is_dir():
                if _unavailable(root):
                    skipped.append(root)
                continue
        except OSError:
            skipped.append(root)
            continue

        for where, _dirs, names in os.walk(root):
            for name in names:
                suffix = os.path.splitext(name)[1].lower()
                if suffix == ".part":
                    full = os.path.join(where, name)
                    try:
                        partials.append({"path": full, "name": name,
                                         "directory": entry["directory"],
                                         "size": os.path.getsize(full)})
                    except OSError:
                        pass
                    continue
                if suffix not in KNOWN_FORMATS:
                    continue
                full = os.path.join(where, name)
                folded = _key(full)
                if folded in seen:
                    continue
                try:
                    stat = os.stat(full)
                except OSError:
                    continue
                seen.add(folded)
                files.append({
                    "path": full,
                    "name": name,
                    "directory": entry["directory"],
                    "root": root,
                    "size": stat.st_size,
                    "mtime": stat.st_mtime,
                    "format": suffix,
                })
                if len(files) >= MAX_FILES:
                    truncated = True
                    break
            if truncated:
                break
        if truncated:
            break

    answer = {
        "files": files,
        "partials": partials,
        "roots": [one["root"] for one in _roots()],
        "skipped": skipped,
        "scanned_at": time.time(),
        "truncated": truncated,
    }
    _write("model_index.json", answer)
    return answer


def _with_finished_downloads(held: dict) -> dict:
    """Add the files downloads finished after the last walk to a remembered index."""
    since = float(held.get("scanned_at") or 0)
    fresh = [one for one in downloads.finished_since(since)
             if one["finished_at"] > float(held.get("downloads_at") or 0)]
    if not fresh:
        return held
    known = {_key(one.get("path", "")) for one in held["files"]}
    roots = _roots()
    for one in fresh:
        full = one["path"]
        if _key(full) in known:
            continue
        suffix = os.path.splitext(full)[1].lower()
        if suffix not in KNOWN_FORMATS:
            continue
        try:
            stat = os.stat(full)
        except OSError:
            continue
        owner = next((entry for entry in roots
                      if _key(full).startswith(_key(entry["root"]) + "/")), None)
        known.add(_key(full))
        held["files"].append({
            "path": full,
            "name": os.path.basename(full),
            "directory": owner["directory"] if owner else one["directory"],
            "root": owner["root"] if owner else os.path.dirname(full),
            "size": stat.st_size,
            "mtime": stat.st_mtime,
            "format": suffix,
        })
    held["downloads_at"] = max(one["finished_at"] for one in fresh)
    _write("model_index.json", held)
    return held


def fingerprint(where: str, size: int) -> str:
    """A cheap signature of a file: its size, its first megabyte and its last.

    Args:
        where: Path to the file.
        size: Its size, already known from the index.

    Returns:
        A hex digest, or an empty string where the file cannot be read.
    """
    import hashlib

    edge = 1 << 20
    try:
        digest = hashlib.sha256()
        digest.update(str(size).encode())
        with open(where, "rb") as handle:
            digest.update(handle.read(edge))
            if size > 2 * edge:
                handle.seek(-edge, os.SEEK_END)
                digest.update(handle.read(edge))
        return digest.hexdigest()
    except OSError:
        return ""


def duplicates(level: str = "names") -> dict:
    """Files held in more than one place, checked as far as the caller asked.

    Args:
        level: ``names``, ``quick`` or ``full``.

    Returns:
        ``{groups, collisions, reclaimable, level}``. ``collisions`` holds groups proven to
        differ: the same filename meaning different files, where which one loads depends on
        the order ComfyUI searches its roots.
    """
    files = index().get("files") or []
    buckets: dict[tuple, list] = {}
    for one in files:
        buckets.setdefault((one["size"], one["name"].lower()), []).append(one)

    groups = []
    collisions = []
    for (size, _name), members in buckets.items():
        if len(members) < 2:
            continue
        group = {
            "name": members[0]["name"],
            "size": size,
            "copies": sorted(members, key=lambda row: row["path"]),
            "wasted": size * (len(members) - 1),
            "sha256": "",
            "state": "candidate",
        }

        if level in ("quick", "full"):
            marks = {fingerprint(one["path"], size) for one in group["copies"]}
            marks.discard("")
            if len(marks) > 1:
                group["state"] = "different"
                collisions.append(group)
                continue
            group["state"] = "similar"

        if level == "full":
            digests = {hash_of(one["path"]) for one in group["copies"]}
            digests.discard("")
            if len(digests) == 1 and digests:
                group["state"] = "identical"
                group["sha256"] = next(iter(digests))
            else:
                group["state"] = "different"
                collisions.append(group)
                continue

        groups.append(group)

    groups.sort(key=lambda row: -row["wasted"])
    collisions.sort(key=lambda row: -row["size"])
    return {
        "groups": groups,
        "collisions": collisions,
        "reclaimable": sum(row["wasted"] for row in groups) if level == "full" else 0,
        "candidate_bytes": sum(row["wasted"] for row in groups),
        "level": level,
    }


def storage(largest: int = 15) -> dict:
    """What is taking up the drives, and what could be given back.

    Args:
        largest: How many of the biggest files to name.

    Returns:
        ``{ok, roots, largest, partials, partial_bytes, duplicate_bytes, total, files}``.
    """
    found = index()
    files = found.get("files") or []
    partials = found.get("partials") or []

    space: dict[str, dict] = {}
    for directory in sorted(models.folders()):
        if directory in SKIP_FOLDERS:
            continue
        for entry in models.roots(directory):
            space.setdefault(_key(entry["path"]), entry)

    roots: dict[str, dict] = {}
    for one in files:
        row = roots.setdefault(_key(one["root"]), {
            "root": one["root"], "files": 0, "bytes": 0, "folders": set(),
        })
        row["files"] += 1
        row["bytes"] += one["size"]
        row["folders"].add(one["directory"])

    listed = []
    for key, row in roots.items():
        entry = space.get(key) or {}
        listed.append({
            "root": row["root"],
            "files": row["files"],
            "bytes": row["bytes"],
            "folders": sorted(row["folders"]),
            "free": entry.get("free", 0),
            "total": entry.get("total", 0),
        })
    listed.sort(key=lambda row: -row["bytes"])

    waste = sum(one["size"] for one in partials)
    return {
        "ok": True,
        "roots": listed,
        "largest": sorted(files, key=lambda one: -one["size"])[:max(1, min(100, largest))],
        "partials": sorted(partials, key=lambda one: -one["size"]),
        "partial_bytes": waste,
        "duplicate_bytes": duplicates("names").get("candidate_bytes", 0),
        "total": sum(one["size"] for one in files),
        "files": len(files),
    }


def sweep_partials(paths: list | None = None) -> dict:
    """Delete leftover part files.

    Args:
        paths: Which to remove, or ``None`` for every one the index found.

    Returns:
        ``{removed, bytes, refused}``.
    """
    found = index()
    known = {_key(one["path"]): one for one in (found.get("partials") or [])}
    wanted = [_key(one) for one in paths] if paths is not None else list(known)

    removed = 0
    freed = 0
    refused = 0
    for key in wanted:
        entry = known.get(key)
        if entry is None:
            refused += 1
            continue
        try:
            Path(entry["path"]).unlink()
            removed += 1
            freed += entry["size"]
        except OSError:
            refused += 1

    if removed:
        found["partials"] = [one for one in (found.get("partials") or [])
                             if _key(one["path"]) not in set(wanted)
                             or Path(one["path"]).exists()]
        _write("model_index.json", found)
    return {"removed": removed, "bytes": freed, "refused": refused}


def _workflow_dir() -> Path | None:
    """Where ComfyUI keeps saved workflows."""
    root = paths.user_root()
    if root is None:
        return None
    found = root / "default" / "workflows"
    return found if found.is_dir() else None


def _names_in(node, found: set, depth: int = 0) -> None:
    """Collect anything in a workflow that looks like a model filename."""
    if depth > 24 or len(found) > 20_000:
        return
    if isinstance(node, dict):
        for value in node.values():
            _names_in(value, found, depth + 1)
    elif isinstance(node, list):
        for value in node:
            _names_in(value, found, depth + 1)
    elif isinstance(node, str) and 3 < len(node) < 256:
        if os.path.splitext(node)[1].lower() in KNOWN_FORMATS:
            found.add(node.replace("\\", "/").rsplit("/", 1)[-1].lower())


def declared_models(document: object, limit: int = MAX_DECLARED) -> list[dict]:
    """Every model a workflow document declares on its nodes.

    Args:
        document: A parsed workflow, or any part of one.
        limit: Most models to return from one document.

    Returns:
        ``{url, name, directory, hash, hash_type, owner, node}`` per model, de-duplicated on
        url, name and folder together, in the order the document gives them.
    """
    found: list[dict] = []
    seen: set = set()

    def take(items: list, node: str) -> None:
        for item in items:
            if not isinstance(item, dict) or len(found) >= limit:
                continue
            url = models.normalise(str(item.get("url") or ""))
            name = str(item.get("name") or "")
            directory = str(item.get("directory") or "")
            key = (url, name, directory)
            if key in seen:
                continue
            seen.add(key)
            found.append({
                "url": url,
                "name": name,
                "directory": directory,
                "hash": str(item.get("hash") or ""),
                "hash_type": str(item.get("hash_type") or ""),
                "owner": models.owner_of(url),
                "node": node,
            })

    def walk(node: object, depth: int = 0) -> None:
        if depth > 20 or len(found) >= limit:
            return
        if isinstance(node, dict):
            properties = node.get("properties")
            if isinstance(properties, dict) and isinstance(properties.get("models"), list):
                take(properties["models"], str(node.get("type") or node.get("id") or ""))
            for value in node.values():
                walk(value, depth + 1)
        elif isinstance(node, list):
            for value in node:
                walk(value, depth + 1)

    walk(document)
    if isinstance(document, dict) and isinstance(document.get("models"), list):
        take(document["models"], "")
    return found


def references(open_documents: list | None = None) -> dict:
    """Every model filename the saved and open workflows appear to ask for.

    Args:
        open_documents: ``{workflow, document, saved, modified}`` per workflow open in the
            editor. An open workflow stands in for the saved file of the same name.

    Returns:
        ``{names, declared, workflows, unreadable, searched_at}``, where ``declared`` is
        ``{workflow, path, open, modified, models}`` for each workflow that declares any;
        ``path`` is the file on disk, empty for a workflow never saved.
    """
    where = _workflow_dir()
    names: set[str] = set()
    declared: list[dict] = []
    read = 0
    unreadable = 0
    live: dict[str, dict] = {}
    for one in (open_documents or [])[:MAX_WORKFLOWS]:
        if not isinstance(one, dict) or not isinstance(one.get("document"), dict):
            continue
        label = str(one.get("workflow") or "").replace("\\", "/").strip()
        if label.startswith("workflows/"):
            label = label[len("workflows/"):]
        if label and label not in live:
            live[label] = one
    for label, one in live.items():
        document = one["document"]
        try:
            _names_in(document, names)
        except RecursionError:
            continue
        read += 1
        asked = declared_models(document)
        if asked:
            on_disk = where / label if where is not None and one.get("saved") else None
            declared.append({
                "workflow": label,
                "path": str(on_disk) if on_disk is not None and on_disk.is_file() else "",
                "open": True,
                "modified": bool(one.get("modified")),
                "models": asked,
            })
    if where is not None:
        for path in sorted(where.rglob("*.json"))[:MAX_WORKFLOWS]:
            try:
                named = path.relative_to(where).as_posix()
            except ValueError:
                named = path.name
            if named in live:
                continue
            try:
                if path.stat().st_size > MAX_WORKFLOW_BYTES:
                    unreadable += 1
                    continue
                document = json.loads(path.read_text(encoding="utf-8"))
                _names_in(document, names)
                read += 1
            except (OSError, ValueError, RecursionError):
                unreadable += 1
                continue
            asked = declared_models(document)
            if asked:
                declared.append({"workflow": named, "path": str(path), "open": False,
                                 "modified": False, "models": asked})
    return {
        "names": sorted(names),
        "declared": declared,
        "workflows": read,
        "unreadable": unreadable,
        "searched_at": time.time(),
    }


def referrers(name: str) -> dict:
    """Which saved workflows ask for a model by this filename.

    Args:
        name: A model's filename, without any path.

    Returns:
        ``{workflows, searched, unreadable}``, the workflows named relative to the workflow
        directory.
    """
    wanted = (name or "").strip().lower()
    where = _workflow_dir()
    found: list[str] = []
    read = 0
    unreadable = 0
    if wanted and where is not None:
        for path in sorted(where.rglob("*.json"))[:MAX_WORKFLOWS]:
            try:
                if path.stat().st_size > MAX_WORKFLOW_BYTES:
                    unreadable += 1
                    continue
                names: set = set()
                _names_in(json.loads(path.read_text(encoding="utf-8")), names)
                read += 1
            except (OSError, ValueError, RecursionError):
                unreadable += 1
                continue
            if any(one.lower() == wanted for one in names):
                try:
                    found.append(str(path.relative_to(where)))
                except ValueError:
                    found.append(path.name)
    return {"workflows": sorted(found), "searched": read, "unreadable": unreadable}


def provenance(where: str) -> dict:
    """Everything recorded about one model on disk.

    Args:
        where: A file inside one of ComfyUI's registered model folders.

    Returns:
        ``{ok, reason, name, path, size, modified, sha256, download, workflows, searched}``.
    """
    target = models.owned_path(where)
    if target is None:
        return {"ok": False, "reason": "that path is not in a registered model folder"}
    try:
        stat = target.stat()
    except OSError as error:
        return {"ok": False, "reason": str(error)}

    held = _hashes().get(_key(str(target)))
    digest = ""
    if (isinstance(held, dict) and held.get("size") == stat.st_size
            and abs(float(held.get("mtime") or 0) - stat.st_mtime) < 1):
        digest = str(held.get("sha256") or "")

    record = downloads.record_for(str(target))
    used = referrers(target.name)
    return {
        "ok": True,
        "reason": "",
        "name": target.name,
        "path": str(target),
        "size": stat.st_size,
        "modified": stat.st_mtime,
        "sha256": digest,
        "download": {
            "url": record.get("declared_url") or record.get("url") or "",
            "owner": record.get("owner", ""),
            "source": record.get("source", ""),
            "hash": record.get("hash", ""),
            "hash_type": record.get("hash_type", ""),
            "at": record.get("finished_at", 0),
        } if record else {},
        "workflows": used["workflows"],
        "searched": used["searched"],
    }


def delete(where: str) -> dict:
    """Delete one model file.

    Returns:
        ``{ok, reason, path}``.
    """
    target = models.owned_path(where)
    if target is None:
        return {"ok": False, "reason": "that file is not in a folder ComfyUI uses"}
    try:
        target.unlink()
    except OSError as error:
        return {"ok": False, "reason": f"it could not be deleted ({error.strerror or error})"}

    store = _hashes()
    store.pop(_key(target), None)
    _write("model_hashes.json", store)

    held = _read("model_index.json", None)
    if isinstance(held, dict) and isinstance(held.get("files"), list):
        folded = _key(target)
        held["files"] = [one for one in held["files"] if _key(one.get("path", "")) != folded]
        _write("model_index.json", held)
    return {"ok": True, "path": str(target)}
