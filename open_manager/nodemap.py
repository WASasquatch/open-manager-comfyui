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

_memory: dict = {"at": 0.0, "reverse": None, "patterns": []}


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


async def _index(session: aiohttp.ClientSession) -> tuple[dict, list]:
    """Every pack that claims each node class, and the packs that claim classes by pattern.

    Args:
        session: Session a fetch would run on.

    Returns:
        ``(reverse, patterns)``. ``reverse`` maps a node class to ``[(repository, title)]`` in
        index order; ``patterns`` lists ``(regex, repository, title)``. Both empty on failure.
    """
    if _memory["reverse"] is not None and time.time() - _memory["at"] < CACHE_TTL:
        return _memory["reverse"], _memory["patterns"]
    data = await _raw_index(session)
    reverse: dict = {}
    patterns: list = []
    for url, value in data.items():
        if not isinstance(value, list) or not value:
            continue
        classes = value[0] if isinstance(value[0], list) else []
        meta = value[1] if len(value) > 1 and isinstance(value[1], dict) else {}
        title = meta.get("title_aux", "")
        for node_class in classes:
            reverse.setdefault(node_class, []).append((url, title))
        pattern = meta.get("nodename_pattern")
        if isinstance(pattern, str) and pattern:
            try:
                patterns.append((re.compile(pattern), url, title))
            except re.error:
                pass
    if reverse:
        _memory["reverse"] = reverse
        _memory["patterns"] = patterns
        _memory["at"] = time.time()
    return reverse, patterns


def _owner_repo(url: str) -> str:
    """``owner/repo`` from a GitHub URL, lowercased, empty where it is not one."""
    match = re.search(r"github\.com[:/]+([^/]+)/([^/#?]+)", url or "", re.I)
    if not match:
        return ""
    return f"{match.group(1)}/{match.group(2).removesuffix('.git')}".lower()


async def resolve(classes, session: aiohttp.ClientSession, hints: dict | None = None,
                  rank=None) -> tuple[dict, list]:
    """Group node classes by the repository that provides them.

    A class the workflow names a repository for goes to that repository. Otherwise, of the packs
    that claim it, by name or by pattern, the highest ranked wins, and the first in the index on a
    tie.

    Args:
        classes: Node class names to resolve.
        session: Session a fetch would run on.
        hints: Node class to the repository URL the workflow names for it.
        rank: Repository URL to a score.

    Returns:
        ``(groups, unresolved)``. ``groups`` maps a repository URL to ``{title, classes}``;
        ``unresolved`` lists classes no pack in the index claims.
    """
    reverse, patterns = await _index(session)
    hints = hints or {}
    groups: dict = {}
    unresolved: list = []
    for node_class in classes:
        claimants = reverse.get(node_class) or [
            (url, title) for regex, url, title in patterns if regex.search(node_class)
        ]
        named = _owner_repo(hints.get(node_class, ""))
        if named:
            picked = next((one for one in claimants if _owner_repo(one[0]) == named),
                          (hints[node_class], ""))
        elif claimants:
            picked = max(claimants, key=lambda one: rank(one[0]) if rank else 0)
        else:
            unresolved.append(node_class)
            continue
        url, title = picked
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
