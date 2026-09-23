"""Map a ComfyUI node class to the pack that provides it."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

import aiohttp

from . import metadata

__all__ = ["NODE_MAP_URL", "classes_for", "repo_name", "resolve"]

NODE_MAP_URL = "https://raw.githubusercontent.com/Comfy-Org/ComfyUI-Manager/main/extension-node-map.json"

CACHE_TTL = 86400

TIMEOUT = 60

_GITHUB = re.compile(r"github\.com[:/]+[^/]+/([^/#?]+)", re.I)

_memory: dict = {"at": 0.0, "reverse": None}


def _cache_path() -> Path:
    """Where the index is cached on disk."""
    return metadata.cache_dir().parent / "nodemap.json"


def repo_name(url: str) -> str:
    """The repository name from a git URL, without owner or ``.git``.

    Args:
        url: A repository URL.

    Returns:
        The repository name, empty where it is not a GitHub URL.
    """
    match = _GITHUB.search(url or "")
    return match.group(1).replace(".git", "") if match else ""


async def _raw_index(session: aiohttp.ClientSession) -> dict:
    """The node index, from disk where fresh, otherwise fetched.

    Args:
        session: Session the fetch runs on.

    Returns:
        The parsed index, empty on failure.
    """
    path = _cache_path()
    try:
        if path.is_file() and time.time() - path.stat().st_mtime < CACHE_TTL:
            return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    try:
        async with session.get(NODE_MAP_URL, timeout=aiohttp.ClientTimeout(total=TIMEOUT)) as answer:
            if answer.status != 200:
                return {}
            text = await answer.text()
        data = json.loads(text)
    except (aiohttp.ClientError, TimeoutError, ValueError):
        return {}
    try:
        path.write_text(text, encoding="utf-8")
    except OSError:
        pass
    return data


async def _reverse(session: aiohttp.ClientSession) -> dict:
    """A node class to ``(repository, title)`` map, memoized.

    Args:
        session: Session a fetch would run on.

    Returns:
        The reverse index, empty on failure.
    """
    if _memory["reverse"] is not None and time.time() - _memory["at"] < CACHE_TTL:
        return _memory["reverse"]
    data = await _raw_index(session)
    reverse: dict = {}
    for url, value in data.items():
        if not isinstance(value, list) or not value:
            continue
        classes = value[0] if isinstance(value[0], list) else []
        title = value[1].get("title_aux", "") if len(value) > 1 and isinstance(value[1], dict) else ""
        for node_class in classes:
            reverse.setdefault(node_class, (url, title))
    if reverse:
        _memory["reverse"] = reverse
        _memory["at"] = time.time()
    return reverse


async def resolve(classes, session: aiohttp.ClientSession) -> tuple[dict, list]:
    """Group node classes by the repository that provides them.

    Args:
        classes: Node class names to resolve.
        session: Session a fetch would run on.

    Returns:
        ``(groups, unresolved)``. ``groups`` maps a repository URL to ``{title, classes}``;
        ``unresolved`` lists classes no pack in the index claims.
    """
    reverse = await _reverse(session)
    groups: dict = {}
    unresolved: list = []
    for node_class in classes:
        hit = reverse.get(node_class)
        if hit is None:
            unresolved.append(node_class)
            continue
        url, title = hit
        group = groups.setdefault(url, {"title": title, "classes": []})
        group["classes"].append(node_class)
    return groups, unresolved


async def classes_for(repo: str, session: aiohttp.ClientSession) -> dict:
    """What the community index says one repository registers.

    Args:
        repo: The pack's repository URL.
        session: Session a fetch would run on.

    Returns:
        ``{title, classes}``, empty where the index does not carry that repository.
    """
    wanted = repo_name(repo).lower()
    if not wanted:
        return {}
    data = await _raw_index(session)
    for url, value in data.items():
        if repo_name(url).lower() != wanted:
            continue
        if not isinstance(value, list) or not value:
            continue
        classes = value[0] if isinstance(value[0], list) else []
        title = value[1].get("title_aux", "") if len(value) > 1 and isinstance(value[1], dict) else ""
        return {"title": str(title)[:120], "classes": [str(one) for one in classes][:2000]}
    return {}
