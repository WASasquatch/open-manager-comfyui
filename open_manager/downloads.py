"""A queue for fetching model files, with what a long download needs to survive."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import aiohttp

from . import keys, models, paths

__all__ = [
    "add",
    "plan",
    "record_for",
    "cancel",
    "pause",
    "enqueue",
    "remove",
    "delete_file",
    "redownload",
    "remove_many",
    "verify",
    "retry",
    "start",
    "state",
    "stop",
]

DEFAULT_WORKERS = 2

MAX_WORKERS = 8

ATTEMPTS = 3

BACKOFF = 2.0

STALL_TIMEOUT = 120

MAX_HOPS = 5

CHUNK = 1 << 20

MAX_ENTRIES = 2000

DISK_MARGIN = 64 << 20

PLAN_MAX = 64

PLAN_PROBES = 4

PLAN_TIMEOUT = 15

_queue: "asyncio.Queue[str] | None" = None
_workers: list[asyncio.Task] = []
_entries: dict[str, dict] = {}
_queued: set[str] = set()
_wanted = 0
_lock = asyncio.Lock()
_loaded = False


def _dir() -> Path:
    """Where the record of downloads is kept."""
    return paths.store()


def _record_path() -> Path:
    """The file the list is written to."""
    return _dir() / "downloads.json"


def _load() -> None:
    """Read the list back, once per process."""
    global _loaded
    if _loaded:
        return
    _loaded = True
    try:
        rows = json.loads(_record_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    if not isinstance(rows, list):
        return
    for row in rows:
        if not isinstance(row, dict) or not row.get("id"):
            continue
        if row.get("status") in ("downloading", "queued", "pausing"):
            row["status"] = "paused"
            row["bytes"] = _part_size(row) or int(row.get("bytes") or 0)
        _entries[row["id"]] = row


def _save() -> None:
    """Persist the list, silent on failure."""
    try:
        _record_path().write_text(
            json.dumps(list(_entries.values()), indent=2), encoding="utf-8"
        )
    except OSError:
        pass


def state() -> dict:
    """Every download and what it is doing.

    Returns:
        ``{downloads: [...], running, queued, downloaded, archived, workers, max_workers}``,
        newest first.
    """
    _load()
    rows = []
    for stored in sorted(_entries.values(), key=lambda row: -float(row.get("added_at") or 0)):
        row = dict(stored)
        status = row.get("status")
        if status == "done":
            row["on_disk"] = _on_disk(row)
        elif status in ("paused", "failed", "cancelled"):
            row["bytes"] = _part_size(row) or int(row.get("bytes") or 0)
        rows.append(row)
    return {
        "downloads": rows,
        "running": sum(1 for row in rows if row.get("status") == "downloading"),
        "queued": sum(1 for row in rows if row.get("status") == "queued"),
        "downloaded": sum(1 for row in rows if row.get("on_disk") is True),
        "archived": sum(1 for row in rows if row.get("on_disk") is False),
        "workers": _wanted,
        "max_workers": MAX_WORKERS,
    }


def _target_for(entry: dict) -> "Path | None":
    """Where this download writes its file."""
    directory = entry.get("directory") or ""
    name = entry.get("name") or ""
    chosen = entry.get("root") or ""
    if chosen:
        return models.destination(directory, name, chosen)
    return (models.overwrite_target(directory, name, entry.get("replaces") or "")
            or models.destination(directory, name))


def _part_for(entry: dict) -> "Path | None":
    """The part file this download writes into."""
    target = _target_for(entry)
    return None if target is None else target.with_name(target.name + ".part")


def _part_size(entry: dict) -> int:
    """How many bytes of this download are already on disk."""
    part = _part_for(entry)
    try:
        return part.stat().st_size if part is not None and part.is_file() else 0
    except OSError:
        return 0


def _drop_part(entry: dict) -> None:
    """Delete the part file an unfinished download left, if it is still there."""
    part = _part_for(entry)
    if part is None:
        return
    try:
        part.unlink(missing_ok=True)
    except OSError:
        pass


def _absorb(digest, part: Path, upto: int) -> None:
    """Feed the bytes already in a part file into a digest."""
    with part.open("rb") as handle:
        left = upto
        while left > 0:
            block = handle.read(min(CHUNK, left))
            if not block:
                break
            digest.update(block)
            left -= len(block)


def _hash_file(where: str) -> str:
    """The sha256 of a file on disk, empty where it cannot be read."""
    try:
        digest = hashlib.sha256()
        with open(where, "rb") as handle:
            while True:
                block = handle.read(CHUNK)
                if not block:
                    break
                digest.update(block)
        return digest.hexdigest()
    except OSError:
        return ""


def _declared_digest(headers) -> str:
    """The sha256 a response claims for its body, empty where it claims none."""
    value = (headers.get("X-Linked-ETag") or "").strip().strip('"').lower()
    if len(value) == 64 and all(one in "0123456789abcdef" for one in value):
        return value
    return ""


def _room_for(target: Path, needed: int) -> None:
    """Check the drive can take what is about to be written.

    Args:
        target: Where the file will be written.
        needed: Bytes still to arrive.

    Raises:
        RuntimeError: Where the drive has too little room.
    """
    if needed <= 0:
        return
    try:
        free = shutil.disk_usage(target.parent).free
    except OSError:
        return
    if free < needed + DISK_MARGIN:
        raise RuntimeError(
            f"{target.parent} has {free // (1 << 20)} MB free and this needs "
            f"{needed // (1 << 20)} MB"
        )


def _on_disk(entry: dict) -> bool:
    """Whether a finished download's file is still where it was written."""
    where = entry.get("path") or ""
    if not where:
        return False
    try:
        return Path(where).is_file()
    except OSError:
        return False


def add(
    url: str,
    name: str,
    directory: str,
    source: str = "",
    digest: str = "",
    digest_type: str = "",
    overwrite: bool = False,
    root: str = "",
) -> dict:
    """Put a model on the queue, or report why it cannot be.

    Args:
        url: Where to fetch it from.
        name: Filename to write.
        directory: ComfyUI model folder to write it in.
        source: Where the request came from, for the reader's record.
        digest: Expected hash of the finished file, where one is known.
        digest_type: Which hash that is. Only ``sha256`` is checked.
        overwrite: Whether to replace a file that is already there.
        root: Which of the folder's registered paths to write to, or empty for the default.
            A machine with its models spread over several drives picks here.

    Returns:
        ``{ok, id, reason, entry}``. A refusal for an existing file carries ``installed``,
        so the caller can ask and come back with ``overwrite``.
    """
    _load()
    resolved = models.normalise(url)
    allowed, reason = models.check(resolved, name, directory, root)
    if not allowed:
        return {"ok": False, "reason": reason}

    existing = models.installed_path(directory, name)
    if existing and not overwrite:
        return {
            "ok": False,
            "reason": f"{name} is already in {directory}",
            "installed": existing,
        }

    going = ("queued", "downloading", "pausing")
    target = models.destination(directory, name, root)
    for row in _entries.values():
        if row.get("status") not in going:
            continue
        if row.get("url") == resolved:
            return {"ok": False, "reason": f"{name} is already downloading"}
        if target is not None and _target_for(row) == target:
            return {
                "ok": False,
                "reason": f"something else is already downloading to {target.name}",
            }

    if len(_entries) >= MAX_ENTRIES:
        return {"ok": False, "reason": "the download list is full"}

    entry = {
        "id": uuid.uuid4().hex[:12],
        "url": resolved,
        "declared_url": url if url != resolved else "",
        "name": name,
        "directory": directory,
        "owner": models.owner_of(resolved),
        "source": (source or "")[:120],
        "hash": (digest or "").strip().lower()[:128],
        "hash_type": (digest_type or "sha256").strip().lower()[:32],
        "root": root,
        "replaces": existing,
        "status": "queued",
        "bytes": 0,
        "total": 0,
        "attempts": 0,
        "error": "",
        "added_at": time.time(),
        "finished_at": 0.0,
    }
    _entries[entry["id"]] = entry
    _save()
    return {"ok": True, "id": entry["id"], "entry": entry}


def _mount_of(target: "Path") -> "tuple[str, Path]":
    """Which drive a path lands on, and a directory on it that exists to measure."""
    probe = target
    while not probe.exists() and probe.parent != probe:
        probe = probe.parent
    drive = os.path.splitdrive(str(target))[0]
    if drive:
        return drive.upper(), probe
    mount = probe
    while mount.parent != mount and not os.path.ismount(mount):
        mount = mount.parent
    return str(mount), probe


async def _measure(session: aiohttp.ClientSession, url: str) -> "tuple[int, str]":
    """How large the file at a URL is, without fetching it.

    Returns:
        ``(bytes, problem)``. A size of zero means it could not be established, and
        ``problem`` says why.
    """
    try:
        answer = await asyncio.wait_for(_open(session, url, 0), PLAN_TIMEOUT)
    except asyncio.TimeoutError:
        return 0, "the host did not answer in time"
    except Exception as problem:  # noqa: BLE001
        return 0, str(problem)
    try:
        return max(0, int(answer.headers.get("Content-Length") or 0)), ""
    except (TypeError, ValueError):
        return 0, "the host did not say how large it is"
    finally:
        answer.close()


async def plan(items: list) -> dict:
    """What queueing these would ask of each drive, before any of it is queued.

    Args:
        items: ``{url, name, directory, root}`` per model, as they would be added.

    Returns:
        ``{ok, drives, adding, unknown, notes}``. Each drive carries ``path, free, total,
        adding, queued, needed, after, short``. Nothing is queued and nothing is refused:
        ``short`` is an answer for the reader to act on.
    """
    _load()
    wanted = []
    for item in (items or [])[:PLAN_MAX]:
        item = item if isinstance(item, dict) else {}
        directory = str(item.get("directory") or "")
        name = str(item.get("name") or "")
        root = str(item.get("root") or "")
        url = models.normalise(str(item.get("url") or ""))
        allowed, _ = models.check(url, name, directory, root)
        if not allowed:
            continue
        target = (models.destination(directory, name, root) if root
                  else (models.overwrite_target(directory, name,
                                                models.installed_path(directory, name))
                        or models.destination(directory, name)))
        if target is not None:
            wanted.append({"url": url, "name": name, "target": target})
    if not wanted:
        return {"ok": True, "drives": [], "adding": 0, "unknown": 0, "notes": []}

    gate = asyncio.Semaphore(PLAN_PROBES)
    async with aiohttp.ClientSession() as session:
        async def measure(one: dict) -> "tuple[int, str]":
            async with gate:
                return await _measure(session, one["url"])

        sizes = await asyncio.gather(*(measure(one) for one in wanted))

    drives: dict[str, dict] = {}
    notes: list[str] = []
    unknown = 0
    for one, (size, problem) in zip(wanted, sizes, strict=True):
        if problem:
            notes.append(f"{one['name']}: {problem}")
        if not size:
            unknown += 1
        key, probe = _mount_of(one["target"])
        slot = drives.setdefault(key, {"path": key, "probe": probe, "adding": 0,
                                       "queued": 0, "files": 0})
        slot["adding"] += size
        slot["files"] += 1

    for row in _entries.values():
        if row.get("status") not in ("queued", "downloading", "pausing", "paused"):
            continue
        target = _target_for(row)
        if target is None:
            continue
        slot = drives.get(_mount_of(target)[0])
        if slot is not None:
            slot["queued"] += max(0, int(row.get("total") or 0) - int(row.get("bytes") or 0))

    out = []
    for slot in drives.values():
        try:
            usage = shutil.disk_usage(slot.pop("probe"))
            free, total = usage.free, usage.total
        except OSError:
            free = total = 0
        needed = slot["adding"] + slot["queued"]
        slot.update({
            "free": free,
            "total": total,
            "needed": needed,
            "after": max(0, free - needed),
            "short": bool(free) and free < needed + DISK_MARGIN,
        })
        out.append(slot)
    out.sort(key=lambda one: (not one["short"], one["path"]))
    return {
        "ok": True,
        "drives": out,
        "adding": sum(one["adding"] for one in out),
        "unknown": unknown,
        "notes": notes[:8],
    }


def record_for(where: str) -> dict:
    """The finished download that wrote this file, where one of them did.

    Args:
        where: A file on disk.

    Returns:
        The download's record, or an empty dict where nothing here wrote it.
    """
    _load()
    try:
        target = Path(where).resolve()
    except OSError:
        return {}
    best: dict = {}
    for row in _entries.values():
        if row.get("status") != "done":
            continue
        written = row.get("path") or ""
        try:
            same = Path(written).resolve() == target if written else _target_for(row) == target
        except OSError:
            same = False
        if same and float(row.get("finished_at") or 0) >= float(best.get("finished_at") or 0):
            best = row
    return dict(best)


def remove(download_id: str) -> bool:
    """Take one download off the list. A running one is cancelled first."""
    _load()
    entry = _entries.get(download_id)
    if entry is None:
        return False
    if entry.get("status") in ("queued", "downloading", "pausing"):
        entry["status"] = "cancelled"
    _entries.pop(download_id, None)
    _queued.discard(download_id)
    _drop_part(entry)
    _save()
    return True


def remove_many(ids: list) -> int:
    """Take several downloads off the list.

    Args:
        ids: Download identifiers.

    Returns:
        How many were removed.
    """
    _load()
    return sum(1 for one in (ids or []) if isinstance(one, str) and remove(one))


def retry(download_id: str) -> bool:
    """Put a download back on the queue."""
    _load()
    entry = _entries.get(download_id)
    if entry is None or entry.get("status") in ("queued", "downloading", "pausing"):
        return False
    if entry.get("status") == "done" and _on_disk(entry):
        return False
    entry.update(status="queued", error="", attempts=0)
    _save()
    enqueue(download_id)
    return True


def redownload(download_id: str) -> bool:
    """Fetch a finished download again, replacing the file it produced."""
    _load()
    entry = _entries.get(download_id)
    if entry is None or entry.get("status") in ("queued", "downloading", "pausing"):
        return False
    entry.update(status="queued", error="", attempts=0, bytes=0)
    _save()
    enqueue(download_id)
    return True


def delete_file(download_id: str) -> dict:
    """Delete the file a download produced, keeping the record that it was fetched.

    Returns:
        ``{ok, reason}``.
    """
    _load()
    entry = _entries.get(download_id)
    if entry is None:
        return {"ok": False, "reason": "no such download"}
    where = entry.get("path") or ""
    if not where or not _on_disk(entry):
        return {"ok": False, "reason": "that file is not on disk"}
    if models.overwrite_target(entry.get("directory") or "", entry.get("name") or "",
                               where) is None:
        return {"ok": False, "reason": "that file is not in a folder ComfyUI uses"}
    try:
        Path(where).unlink()
    except OSError as error:
        return {"ok": False, "reason": f"it could not be deleted ({error.strerror or error})"}
    _save()
    return {"ok": True}


async def _ask_declared(url: str) -> str:
    """Ask the host what a file should hash to, empty where it will not say."""
    hop = urlsplit(url or "")
    if hop.scheme != "https" or not models.host_allowed(hop.netloc):
        return ""
    try:
        async with aiohttp.ClientSession() as session:
            answer = await session.head(
                url, allow_redirects=False, headers={"User-Agent": "open-manager"},
                timeout=aiohttp.ClientTimeout(total=30),
            )
            try:
                return _declared_digest(answer.headers)
            finally:
                answer.release()
    except Exception:  # noqa: BLE001
        return ""


async def verify(download_id: str) -> dict:
    """Hash the file on disk and say whether it is what it should be.

    Returns:
        ``{ok, sha256, expected, expected_from, matches, reason}``. ``matches`` is ``None``
        where there is nothing to compare against.
    """
    _load()
    entry = _entries.get(download_id)
    if entry is None or not _on_disk(entry):
        return {"ok": False, "reason": "that file is not on disk"}
    got = await asyncio.to_thread(_hash_file, entry.get("path") or "")
    if not got:
        return {"ok": False, "reason": "the file could not be read"}

    declared = (entry.get("declared_hash") or "").strip().lower()
    if not declared:
        declared = await _ask_declared(entry.get("url") or "")
        if declared:
            entry["declared_hash"] = declared

    wanted = ""
    source = ""
    for value, whose in (
        ((entry.get("hash") or "").strip().lower()
         if entry.get("hash_type", "sha256").lower() == "sha256" else "", "the workflow"),
        (declared, "the host"),
        ((entry.get("sha256") or "").strip().lower(), "this download"),
    ):
        if value:
            wanted, source = value, whose
            break

    entry["sha256_observed"] = got
    _save()
    return {"ok": True, "sha256": got, "expected": wanted, "expected_from": source,
            "matches": (got == wanted) if wanted else None}


def pause(download_id: str) -> bool:
    """Stop one download so it can be picked up where it left off."""
    _load()
    entry = _entries.get(download_id)
    status = entry.get("status") if entry else None
    if status not in ("queued", "downloading"):
        return False
    entry["status"] = "pausing" if status == "downloading" else "paused"
    _save()
    return True


def cancel(download_id: str) -> bool:
    """Stop one download, leaving it on the list as cancelled."""
    _load()
    entry = _entries.get(download_id)
    if entry is None or entry.get("status") not in ("queued", "downloading", "pausing"):
        return False
    entry["status"] = "cancelled"
    _save()
    return True


async def _open(session: aiohttp.ClientSession, url: str, start_at: int, entry: dict | None = None):
    """Fetch a URL, following redirects only while they stay on allowed hosts.

    Args:
        session: Session the request runs on.
        url: Where to start.
        start_at: Byte to resume from, or zero.
        entry: The download being run, so a digest named along the way can be recorded.

    Returns:
        An open response.

    Raises:
        RuntimeError: Where a hop leaves the allowed hosts, the server answers with a page,
            or the redirects run out.
    """
    current = url
    for _ in range(MAX_HOPS):
        hop = urlsplit(current)
        if hop.scheme != "https" or not models.host_allowed(hop.netloc):
            raise RuntimeError(
                f"redirected to {hop.netloc or current}, which is not an allowed host"
            )
        headers = {"User-Agent": "open-manager", "Accept-Encoding": "identity"}
        if models.wants_token(hop.netloc):
            token = keys.secret("huggingface")
            if token:
                headers["Authorization"] = f"Bearer {token}"
        if start_at:
            headers["Range"] = f"bytes={start_at}-"
        answer = await session.get(
            current, headers=headers, allow_redirects=False,
            timeout=aiohttp.ClientTimeout(total=None, sock_read=STALL_TIMEOUT),
        )
        if entry is not None:
            declared = _declared_digest(answer.headers)
            if declared:
                entry["declared_hash"] = declared
        if answer.status in (301, 302, 303, 307, 308):
            location = answer.headers.get("Location", "")
            answer.release()
            if not location:
                raise RuntimeError("redirected with no destination")
            current = urljoin(current, location)
            continue
        if answer.status == 416:
            answer.release()
            raise RuntimeError("already complete")
        if answer.status in (401, 403):
            answer.release()
            raise RuntimeError(
                f"the server answered {answer.status}: the model is private, gated, or not there"
            )
        if answer.status == 404:
            answer.release()
            raise RuntimeError("there is no file at that URL")
        if answer.status not in (200, 206):
            answer.release()
            raise RuntimeError(f"the server answered {answer.status}")
        kind = (answer.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if kind in ("text/html", "application/xhtml+xml"):
            answer.release()
            raise RuntimeError(
                "that URL serves a web page rather than a file. A Hugging Face link needs "
                "to be the /resolve/ form, not /blob/."
            )
        return answer
    raise RuntimeError("too many redirects")


async def _fetch(entry: dict) -> None:
    """Run one download to completion, or record why it stopped."""
    target = _target_for(entry)
    if target is None:
        entry.update(status="failed", error="that name cannot be written there")
        return
    part = target.with_name(target.name + ".part")
    target.parent.mkdir(parents=True, exist_ok=True)

    digest = hashlib.sha256()
    start_at = part.stat().st_size if part.is_file() else 0
    if start_at:
        await asyncio.to_thread(_absorb, digest, part, start_at)

    async with aiohttp.ClientSession() as session:
        answer = await _open(session, entry["url"], start_at, entry)
        try:
            declared = int(answer.headers.get("Content-Length") or 0)
            entry["total"] = declared + start_at if answer.status == 206 else declared
            entry["bytes"] = start_at
            mode = "ab" if (start_at and answer.status == 206) else "wb"
            if mode == "wb":
                start_at = 0
                entry["bytes"] = 0
                digest = hashlib.sha256()
            _room_for(target, (entry["total"] or 0) - start_at)
            with part.open(mode) as handle:
                async for chunk in answer.content.iter_chunked(CHUNK):
                    if entry.get("status") in ("cancelled", "pausing"):
                        raise asyncio.CancelledError
                    handle.write(chunk)
                    digest.update(chunk)
                    entry["bytes"] += len(chunk)
                    if entry["total"] and entry["bytes"] > entry["total"]:
                        raise RuntimeError("the server sent more than it said it would")
        finally:
            answer.release()

    if entry["total"] and entry["bytes"] < entry["total"]:
        raise RuntimeError(f"ended early at {entry['bytes']} of {entry['total']} bytes")

    got = digest.hexdigest()
    for wanted, whose in (
        ((entry.get("hash") or "").strip().lower()
         if entry.get("hash_type", "sha256").lower() == "sha256" else "", "the workflow"),
        ((entry.get("declared_hash") or "").strip().lower(), "the server"),
    ):
        if wanted and got != wanted:
            part.unlink(missing_ok=True)
            raise RuntimeError(f"the file does not match the hash {whose} declared")

    part.replace(target)
    entry.update(status="done", finished_at=time.time(), error="", path=str(target),
                 sha256=got)


async def _worker(slot: int) -> None:
    """Take one download at a time off the queue until stopped.

    Args:
        slot: This worker's position. Where the reader lowers the worker count, the workers
            above it retire once they are between downloads rather than dropping one.
    """
    while slot < _wanted:
        download_id = await _queue.get()
        _queued.discard(download_id)
        entry = _entries.get(download_id)
        try:
            if entry is None or entry.get("status") not in ("queued",):
                continue
            for attempt in range(1, ATTEMPTS + 1):
                if entry.get("status") == "cancelled":
                    break
                entry.update(status="downloading", attempts=attempt, error="")
                _save()
                try:
                    await _fetch(entry)
                    break
                except asyncio.CancelledError:
                    entry.update(
                        status="cancelled" if entry.get("status") == "cancelled" else "paused",
                        error="",
                    )
                    break
                except Exception as error:  # noqa: BLE001
                    message = (str(error) if isinstance(error, RuntimeError)
                               else f"{type(error).__name__}: {error}").strip()
                    if str(error) == "already complete":
                        entry.update(status="done", finished_at=time.time(), error="")
                        break
                    entry.update(status="failed", error=message)
                    if attempt < ATTEMPTS:
                        entry["status"] = "queued"
                        await asyncio.sleep(BACKOFF * (2 ** (attempt - 1)))
                _save()
            _save()
        finally:
            _queue.task_done()


async def start(workers: int = DEFAULT_WORKERS) -> None:
    """Bring the queue up, and put anything already waiting back on it.

    Args:
        workers: Downloads to run at once, clamped to ``1..MAX_WORKERS``.
    """
    global _queue, _wanted
    _load()
    async with _lock:
        _wanted = max(1, min(MAX_WORKERS, int(workers or DEFAULT_WORKERS)))
        if _queue is None:
            _queue = asyncio.Queue()
        _workers[:] = [task for task in _workers if not task.done()]
        while len(_workers) < _wanted:
            _workers.append(asyncio.create_task(_worker(len(_workers))))
        queued = [key for key, row in _entries.items() if row.get("status") == "queued"]
        for key in queued:
            if key not in _queued:
                _queued.add(key)
                _queue.put_nowait(key)


async def stop() -> None:
    """Stop the workers, leaving the list as it stands."""
    global _wanted
    async with _lock:
        _wanted = 0
        for task in _workers:
            task.cancel()
        _workers.clear()
        _queued.clear()


def enqueue(download_id: str) -> bool:
    """Hand an already-added download to the workers, at most once at a time."""
    if _queue is None or download_id in _queued:
        return False
    _queued.add(download_id)
    _queue.put_nowait(download_id)
    return True
