"""A cached copy of the registry catalogue.

The catalogue is fetched page by page and written to disk with each pack's licence already
classified. Browsing, searching and sorting run against the cached copy. The network is
reached for a first sync, an explicit update, and an install.
"""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

import aiohttp

from . import license_files, licenses, log, metadata

__all__ = ["load", "should_auto_sync", "state", "sync"]

#: Registry catalogue endpoint. The server caps the page size at 100.
BASE = "https://api.comfy.org/nodes"

#: Nodes fetched per page.
PAGE_LIMIT = 100

#: Seconds one page request may take.
TIMEOUT = 30

logger = log.get_logger("catalog")

_state = {"syncing": False, "done": 0, "total": 0, "error": ""}

#: Whether a sync has run since this server process started. Reset on restart.
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
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            info["cached"] = True
            info["count"] = len(data.get("nodes", []))
            info["fetched_at"] = float(data.get("fetched_at") or 0.0)
        except (OSError, ValueError):
            pass
    return info


def load() -> list[dict]:
    """The cached catalogue entries, empty where nothing is cached."""
    try:
        return json.loads(_path().read_text(encoding="utf-8")).get("nodes", [])
    except (OSError, ValueError):
        return []


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
        "stars": int(node.get("github_stars") or 0),
        "icon": node.get("icon", "") or "",
        "repository": node.get("repository", "") or "",
        "advertised": (node.get("latest_version") or {}).get("version", "") or "",
        "released": (node.get("latest_version") or {}).get("createdAt", "") or "",
        "license": licence["name"],
        "license_tier": licence["tier"],
        "license_rank": licence["rank"],
        "license_color": licence["color"],
    }


async def sync() -> None:
    """Fetch the whole catalogue page by page and write it to the cache.

    Runs one at a time, reports progress through :func:`state`, and leaves any existing cache
    in place on failure.
    """
    if _state["syncing"]:
        return
    _session["synced"] = True
    _state.update(syncing=True, done=0, total=0, error="")
    nodes: list[dict] = []
    try:
        async with aiohttp.ClientSession() as session:
            page = 1
            total_pages = 1
            while page <= total_pages:
                url = f"{BASE}?limit={PAGE_LIMIT}&page={page}"
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=TIMEOUT)) as answer:
                    if answer.status != 200:
                        raise RuntimeError(f"registry returned {answer.status}")
                    data = await answer.json()
                total_pages = max(1, int(data.get("totalPages") or 1))
                _state["total"] = total_pages
                nodes.extend(_entry(node) for node in data.get("nodes", []))
                _state["done"] = page
                page += 1
                await asyncio.sleep(0.2)
        _path().write_text(
            json.dumps({"fetched_at": time.time(), "nodes": nodes}), encoding="utf-8"
        )
        logger.info("catalogue synced: %d packs", len(nodes))
    except Exception as error:
        _state["error"] = f"{type(error).__name__}: {error}"
        logger.warning("catalogue sync failed (%s)", _state["error"])
    finally:
        _state["syncing"] = False
