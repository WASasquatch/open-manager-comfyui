"""What is actually on disk, across every model folder ComfyUI knows.

ComfyUI can be pointed at several drives at once through ``extra_model_paths.yaml``, and once
it is, nothing tells the reader what they have. The same weights end up on two drives, a file
is deleted and a workflow stops loading, and a folder fills with models nothing references.

So this walks the registered folders and answers three questions: what is there, what is there
twice, and what nothing appears to use.

Two costs are deliberately kept apart. Walking is cheap and happens when asked. Hashing is not
-- a single model runs to twenty gigabytes -- so it happens only for the files a question is
actually being asked about, and the answer is cached against the file's size and modification
time so it is not paid twice.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from . import downloads, models

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

#: Most files indexed. A model folder holding more than this is not a model folder.
MAX_FILES = 50_000

#: Most workflows read when looking for references.
MAX_WORKFLOWS = 5_000

#: Largest workflow read, in bytes. Past this it is not a graph, it is an accident.
MAX_WORKFLOW_BYTES = 32 << 20

#: Models read from one workflow. A graph declaring more than this does not need
#: enumerating exactly for the reader to see what it is asking for.
MAX_DECLARED = 500

#: Registered folders the library does not describe. The same set the deletion gate refuses,
#: kept in one place so a folder can never be listed here and deletable there.
SKIP_FOLDERS = models.NON_MODEL_FOLDERS

#: Extensions counted as model files, whatever the policy currently allows to be downloaded.
#: The library reports what is there, including formats a download would refuse.
KNOWN_FORMATS = frozenset({
    ".safetensors", ".sft", ".gguf", ".ckpt", ".pt", ".pth", ".bin", ".onnx", ".engine",
    ".pkl", ".npz", ".yaml", ".msgpack",
})


def _dir() -> Path:
    """Where the library's own files are kept."""
    try:
        import folder_paths

        base = Path(folder_paths.get_user_directory()) / "open_manager"
    except Exception:
        base = Path(__file__).resolve().parent.parent / "_cache"
    base.mkdir(parents=True, exist_ok=True)
    return base


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


# --- hashes -------------------------------------------------------------------------------

def _hashes() -> dict:
    """Every digest already taken, keyed by path."""
    found = _read("model_hashes.json", {})
    return found if isinstance(found, dict) else {}


def hash_of(where: str, force: bool = False) -> str:
    """The sha256 of one file, taken now or remembered from before.

    A cached digest is only trusted while the file's size and modification time are unchanged,
    so a file replaced in place is hashed again rather than reported as what it used to be.

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


# --- the index ----------------------------------------------------------------------------

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
    """Whether a root is missing because the place it lives is missing.

    A registered folder that simply has not been created yet is ordinary and not worth
    reporting -- ComfyUI registers dozens of them. A root on a drive that is not mounted is
    worth reporting, because its contents are absent from the answer.
    """
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
        ``{files, roots, skipped, scanned_at, truncated}``. ``skipped`` names roots whose
        drive is not mounted, so their absence from the answer is stated rather than silent.
        A folder that merely has not been created is not reported: ComfyUI registers dozens
        of those and they mean nothing.
    """
    if not refresh:
        held = _read("model_index.json", None)
        if isinstance(held, dict) and isinstance(held.get("files"), list):
            return held

    files: list[dict] = []
    partials: list[dict] = []
    skipped: list[str] = []
    seen: set[str] = set()
    truncated = False

    for entry in _roots():
        root = entry["root"]
        # A registered root can point at a drive that is not mounted. Checked before
        # descending so an absent one is reported rather than silently contributing nothing.
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
                # A part file is a download in flight, not a model. It is noted rather than
                # ignored: one left behind by a download that never finished is wasted space
                # nothing will ever claim.
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
                # A file can sit under two registered roots where one nests inside the other.
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


# --- duplicates ---------------------------------------------------------------------------

def fingerprint(where: str, size: int) -> str:
    """A cheap signature of a file: its size, its first megabyte and its last.

    This can disprove a match and can never prove one. Two files whose signatures differ are
    certainly different; two whose signatures agree may still differ somewhere in the middle,
    and for a model file that middle is nearly all of it. So this is used to rule candidates
    out quickly and never to call anything identical.

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

    Sharing a name and a size is not being the same file, and being the same file is the only
    thing that makes one copy safe to delete. So the answer is reached in stages, and says
    which stage it stopped at rather than presenting a guess as a finding.

    ``names``
        Same name, same size. Free, no file is opened. A list of candidates.

    ``quick``
        Adds :func:`fingerprint`. Reads two megabytes per file, so it is effectively instant,
        and it settles the negative case: a group whose signatures differ is *not* duplicated,
        it is a name collision, which is worth knowing in its own right.

    ``full``
        Reads every candidate in full. The only level that can call a group identical, and the
        only one whose reclaimable figure means anything.

    Nothing is deleted here. Duplication is frequently deliberate -- a copy on the fast drive
    and a copy on the archive -- so this reports and leaves the decision alone.

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
        # Only a full read can say what deleting would actually recover.
        "reclaimable": sum(row["wasted"] for row in groups) if level == "full" else 0,
        "candidate_bytes": sum(row["wasted"] for row in groups),
        "level": level,
    }


# --- storage -------------------------------------------------------------------------------

def storage(largest: int = 15) -> dict:
    """What is taking up the drives, and what could be given back.

    Everything here is read off the index rather than measured again, so this costs a walk
    only when the index itself is out of date.

    Args:
        largest: How many of the biggest files to name.

    Returns:
        ``{roots, largest, partials, reclaimable, total}``.
    """
    found = index()
    files = found.get("files") or []
    partials = found.get("partials") or []

    # Free space is a property of the drive, so roots on the same one report the same figure
    # and it must not be added up across them.
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

    A part file is ours: a download writes one and renames it away when it finishes, so one
    still sitting there belongs to a transfer that did not. It is still checked against the
    index rather than deleted on the strength of its name, so nothing outside a registered
    model folder can be named here.

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


# --- references ---------------------------------------------------------------------------

def _workflow_dir() -> Path | None:
    """Where ComfyUI keeps saved workflows."""
    try:
        import folder_paths

        found = Path(folder_paths.get_user_directory()) / "default" / "workflows"
        return found if found.is_dir() else None
    except Exception:
        return None


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
        # Widget values carry a bare filename, sometimes with a subfolder in front of it.
        if os.path.splitext(node)[1].lower() in KNOWN_FORMATS:
            found.add(node.replace("\\", "/").rsplit("/", 1)[-1].lower())


def declared_models(document: object, limit: int = MAX_DECLARED) -> list[dict]:
    """Every model a workflow document declares on its nodes.

    ComfyUI records these as ``properties.models``, which is the only place a workflow says
    where a model came from rather than merely naming it. They sit wherever the node sits,
    and with subgraphs that is not the top-level ``nodes`` list, so the whole document is
    walked instead.

    Nothing here is judged. Whether a URL may be fetched, and whether the file is already on
    disk, are questions for the caller, which is why the picker and the library can share
    this and answer them differently.

    Args:
        document: A parsed workflow, or any part of one.
        limit: Most models to return from one document.

    Returns:
        ``{url, name, directory, hash, hash_type, owner, node}`` per model, de-duplicated on
        url, name and folder together, in the order the document gives them.
    """
    found: list[dict] = []
    seen: set = set()

    def walk(node: object, depth: int = 0) -> None:
        if depth > 20 or len(found) >= limit:
            return
        if isinstance(node, dict):
            properties = node.get("properties")
            if isinstance(properties, dict) and isinstance(properties.get("models"), list):
                for item in properties["models"]:
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
                        "node": str(node.get("type") or node.get("id") or ""),
                    })
            for value in node.values():
                walk(value, depth + 1)
        elif isinstance(node, list):
            for value in node:
                walk(value, depth + 1)

    walk(document)
    return found


def references() -> dict:
    """Every model filename the saved workflows appear to ask for.

    This is a search, not an inventory. A workflow saved in API form, a widget shape not
    recognised here, a path built at run time, or anything referring to a model from outside
    ComfyUI will not appear. So the result says how far it looked, and callers are expected to
    present it as what was found rather than as what exists.

    A filename is all a widget value gives, so that is all ``names`` can hold. Where a
    workflow also declares where a model came from, that is carried separately in
    ``declared``: the two answer different questions, and only the second can be acted on.

    Returns:
        ``{names, declared, workflows, unreadable, searched_at}``, where ``declared`` is
        ``{workflow, models}`` for each workflow that declares any.
    """
    where = _workflow_dir()
    names: set[str] = set()
    declared: list[dict] = []
    read = 0
    unreadable = 0
    if where is not None:
        for path in sorted(where.rglob("*.json"))[:MAX_WORKFLOWS]:
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
                try:
                    named = str(path.relative_to(where))
                except ValueError:
                    named = path.name
                declared.append({"workflow": named, "models": asked})
    return {
        "names": sorted(names),
        "declared": declared,
        "workflows": read,
        "unreadable": unreadable,
        "searched_at": time.time(),
    }


def referrers(name: str) -> dict:
    """Which saved workflows ask for a model by this filename.

    The same search :func:`references` runs, narrowed to one name so the answer can say where
    a particular file is used rather than only that something uses it. The same limits apply:
    a workflow saved in API form, or one that builds its paths at run time, will not appear.

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

    Three separate records meet here and not one of them is guaranteed: the download that
    fetched it, a hash taken of it, and the workflows naming it. A model copied in by hand has
    none of them, which is worth saying plainly rather than leaving the reader to infer it
    from an empty panel.

    A held hash is reported only while it still describes the file: the size and modification
    time have to agree, or it is the digest of what used to be there. Nothing is hashed here.
    Reading twenty gigabytes because a menu was opened is not a thing to do quietly.

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

# --- deleting -----------------------------------------------------------------------------

def delete(where: str) -> dict:
    """Delete one model file.

    Refused for anything :func:`models.owned_path` will not vouch for, which means a path
    outside the registered folders, a path that is not a file, and a symlink leading out of
    them. One file at a time, never a sweep.

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
