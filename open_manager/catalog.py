"""A cached copy of the registry catalogue."""

from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path

import aiohttp

from . import license_files, licenses, log, metadata

__all__ = [
    "is_self","load", "should_auto_sync", "state", "sync"]

BASE = "https://api.comfy.org/nodes"

PAGE_LIMIT = 100

TIMEOUT = 30

CONCURRENCY = 8

MAX_CONCURRENCY = 16

ATTEMPTS = 3

RETRY_BACKOFF = 0.5

_RETRY_STATUS = frozenset({429, 500, 502, 503, 504})

logger = log.get_logger("catalog")

_state = {"syncing": False, "done": 0, "total": 0, "error": ""}

_session = {"synced": False}


def should_auto_sync(policy: str, stale_days: float) -> bool:
    """Whether an automatic sync should run now, given the configured policy.

    Args:
        policy: ``off``, ``startup`` or ``stale``.
        stale_days: Age in days past which ``stale`` renews.

    Returns:
        True where a sync should start.
    """
    if policy == "off" or _state["syncing"] or _session["synced"]:
        return False
    if policy == "startup":
        return True
    if policy == "stale":
        info = state()
        if not info["cached"]:
            return True
        return (time.time() - info["fetched_at"]) > stale_days * 86400
    return False


def _path() -> Path:
    """The catalogue cache file."""
    return metadata.cache_dir().parent / "catalog.json"


def state() -> dict:
    """The cache's status: whether it exists, its size and age, and any sync in progress."""
    path = _path()
    info = {
        "cached": False,
        "count": 0,
        "fetched_at": 0.0,
        "syncing": _state["syncing"],
        "done": _state["done"],
        "total": _state["total"],
        "error": _state["error"],
    }
    if path.is_file():
        held = _parsed(path)
        if held["key"] is not None:
            info["cached"] = True
            info["count"] = len(held["nodes"])
            info["fetched_at"] = held["fetched_at"]
    return info


_LICENCE_FIELD = re.compile(r"^(file|text|spdx_id|type)\s*[=:]", re.I)

_REPO_URL = re.compile(r"github\.com[:/]+([^/]+)/([^/#?]+)", re.I)


_HELD: dict = {"key": None, "nodes": [], "fetched_at": 0.0}


def _stamp(path: Path):
    """What the cache file is now, or ``None`` where it is not there."""
    try:
        stat = path.stat()
    except OSError:
        return None
    return (str(path), stat.st_mtime_ns, stat.st_size)


def _parsed(path: Path) -> dict:
    """The cache file's contents, read again only when the file itself has changed."""
    key = _stamp(path)
    if key is None:
        _HELD["key"] = None
        _HELD["nodes"] = []
        _HELD["fetched_at"] = 0.0
        return _HELD
    if _HELD["key"] == key:
        return _HELD
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        _HELD["key"] = None
        _HELD["nodes"] = []
        _HELD["fetched_at"] = 0.0
        return _HELD
    nodes = data.get("nodes", [])
    _correct(nodes if isinstance(nodes, list) else [])
    _HELD["key"] = key
    _HELD["nodes"] = nodes if isinstance(nodes, list) else []
    _HELD["fetched_at"] = float(data.get("fetched_at") or 0.0)
    return _HELD


def load() -> list[dict]:
    """The cached catalogue entries, empty where nothing is cached."""
    return _parsed(_path())["nodes"]


def _correct(nodes: list) -> list[dict]:
    """Correct borrowed star counts and licence fields of catalogue entries in place."""
    for node in nodes:
        if node.get("stars") and _borrowed(node.get("repository", "")):
            node["stars"] = 0
            node["borrowed"] = True
        tier = node.get("license_tier")
        if tier:
            node["license_color"] = licenses.colour(tier)
        name = node.get("license") or ""
        if name and (name.startswith("{") or _LICENCE_FIELD.match(name)):
            again = licenses.classify(name)
            node["license"] = again["name"]
            node["license_tier"] = again["tier"]
            node["license_rank"] = again["rank"]
            node["license_color"] = again["color"]
    return nodes


SELF_REPO = ("wasasquatch", "open-manager-comfyui")


def _pair(repository: str) -> tuple[str, str] | None:
    """Owner and repository from a GitHub URL, or ``None`` where it is not one."""
    match = _REPO_URL.search(repository or "")
    if match is None:
        return None
    return (match.group(1).lower(), match.group(2).lower().removesuffix(".git"))


def hidden(repository: str) -> bool:
    """Whether a pack is kept out of the browsable listing.

    Args:
        repository: The repository URL the registry gives.

    Returns:
        True where the entry is kept out of browsing.
    """
    from . import risk

    pair = _pair(repository)
    return pair is not None and pair in risk.MANAGER_REPOS


def is_self(repository: str) -> bool:
    """Whether an entry is Open Manager's own."""
    return _pair(repository) == SELF_REPO


def browsable() -> list[dict]:
    """The catalogue as the registry browser shows it, other managers removed."""
    out = []
    for entry in load():
        repository = entry.get("repository", "")
        if hidden(repository):
            continue
        if is_self(repository):
            entry = {**entry, "is_self": True}
        out.append(entry)
    return out


def _borrowed(repository: str) -> bool:
    """Whether a listing's repository is another project's rather than the pack's.

    Args:
        repository: The repository URL the registry gives.

    Returns:
        True where the repository is ComfyUI or part of its tooling.
    """
    from . import risk

    pair = _pair(repository)
    return pair is not None and pair in risk.CORE_REPOS


def _stars(raw, repository: str) -> int:
    """A pack's stars, dropped where they belong to a project it merely points at.

    Args:
        raw: ``github_stars`` as the registry gives it.
        repository: The repository URL the registry gives.

    Returns:
        The star count, or zero where it is not this pack's.
    """
    return 0 if _borrowed(repository) else int(raw or 0)


def _entry(node: dict) -> dict:
    """Trim a registry node to the fields a listing needs, with its licence classified."""
    licence = licenses.classify(node.get("license"))
    repository = node.get("repository", "") or ""
    if licence["tier"] == "unknown" and repository:
        resolved = license_files.cached(repository)
        if resolved:
            licence = licenses.classify(resolved)
    return {
        "id": node.get("id", ""),
        "name": node.get("name", ""),
        "description": (node.get("description") or "")[:200],
        "publisher": (node.get("publisher") or {}).get("id", ""),
        "downloads": int(node.get("downloads") or 0),
        "stars": _stars(node.get("github_stars"), repository),
        "borrowed": _borrowed(repository),
        "icon": node.get("icon", "") or "",
        "repository": node.get("repository", "") or "",
        "advertised": (node.get("latest_version") or {}).get("version", "") or "",
        "released": (node.get("latest_version") or {}).get("createdAt", "") or "",
        "license": licence["name"],
        "license_tier": licence["tier"],
        "license_rank": licence["rank"],
        "license_color": licence["color"],
    }


def _limit(concurrency: int | None) -> int:
    """The page requests to keep in flight, held inside the range a sync will accept.

    Args:
        concurrency: A caller's preference, or ``None`` for the default.

    Returns:
        A count between one and :data:`MAX_CONCURRENCY`.
    """
    if concurrency is None:
        return CONCURRENCY
    try:
        wanted = int(concurrency)
    except (TypeError, ValueError):
        return CONCURRENCY
    return max(1, min(MAX_CONCURRENCY, wanted))


async def _page(session: aiohttp.ClientSession, number: int) -> dict:
    """Fetch one catalogue page, trying again where the registry is busy.

    Args:
        session: Session the request runs on.
        number: Page to read, counted from one.

    Returns:
        The decoded body.

    Raises:
        RuntimeError: Where the page was refused, or every attempt failed.
    """
    url = f"{BASE}?limit={PAGE_LIMIT}&page={number}"
    delay = RETRY_BACKOFF
    attempts = max(1, ATTEMPTS)
    for attempt in range(1, attempts + 1):
        detail = ""
        retryable = True
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=TIMEOUT)) as answer:
                if answer.status == 200:
                    return await answer.json()
                detail = f"registry returned {answer.status}"
                retryable = answer.status in _RETRY_STATUS
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
            detail = f"{type(error).__name__}: {error}"
        if not retryable or attempt == attempts:
            raise RuntimeError(f"page {number}: {detail}")
        await asyncio.sleep(delay)
        delay *= 2


async def sync(concurrency: int | None = None) -> None:
    """Fetch the whole catalogue and write it to the cache.

    Args:
        concurrency: Page requests to keep in flight, clamped to ``1..MAX_CONCURRENCY``.
            One reads the pages one after another. ``None`` uses :data:`CONCURRENCY`.
    """
    if _state["syncing"]:
        return
    _session["synced"] = True
    _state.update(syncing=True, done=0, total=0, error="")
    try:
        async with aiohttp.ClientSession() as session:
            first = await _page(session, 1)
            total_pages = max(1, int(first.get("totalPages") or 1))
            _state.update(total=total_pages, done=1)

            pages: list[list[dict]] = [[] for _ in range(total_pages)]
            pages[0] = [_entry(node) for node in first.get("nodes", [])]
            gate = asyncio.Semaphore(_limit(concurrency))

            async def read(number: int) -> None:
                async with gate:
                    data = await _page(session, number)
                pages[number - 1] = [_entry(node) for node in data.get("nodes", [])]
                _state["done"] += 1

            reads = [asyncio.ensure_future(read(number)) for number in range(2, total_pages + 1)]
            try:
                await asyncio.gather(*reads)
            except Exception:
                for task in reads:
                    task.cancel()
                await asyncio.gather(*reads, return_exceptions=True)
                raise

        nodes = [entry for page in pages for entry in page]
        _path().write_text(
            json.dumps({"fetched_at": time.time(), "nodes": nodes}), encoding="utf-8"
        )
        logger.info("catalogue synced: %d packs", len(nodes))
    except Exception as error:
        _state["error"] = f"{type(error).__name__}: {error}"
        logger.warning("catalogue sync failed (%s)", _state["error"])
    finally:
        _state["syncing"] = False
