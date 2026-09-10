"""Resolve a pack's licence from its repository when the registry only references a file.

The repository's LICENSE file is read from the raw content host and identified, and supersedes a
``{"file": "LICENSE"}`` reference. Each repository is read once and cached on disk.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Iterable

import aiohttp

from . import licenses

__all__ = ["cached", "resolve", "resolve_many"]

#: Seconds a fetch may take before it is abandoned.
TIMEOUT = 12

#: Largest licence file read, in characters.
LIMIT = 40000

#: Days a "no licence found" answer stands before it is looked for again. A resolved name
#: never expires.
NEGATIVE_DAYS = 21

#: Longest repository string parsed for an owner and repo.
_MAX_URL = 400

#: Filenames a licence is commonly held under, tried in order on each branch.
_NAMES = ("LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md", "COPYING", "COPYING.md")

#: Branches a repository's default is commonly named.
_BRANCHES = ("main", "master")

#: Owner and repo of a GitHub URL. The owner class excludes separators; the repo name keeps
#: dots, and a trailing ``.git`` is stripped after.
_GITHUB = re.compile(r"github\.com[/:]+([^/#?:]+)/([^/#?]+)", re.I)

_MEMO: dict | None = None


def _cache_path() -> Path:
    """File the resolved licences are written to."""
    try:
        import folder_paths

        base = Path(folder_paths.get_user_directory()) / "open_manager"
    except Exception:
        base = Path(__file__).resolve().parent.parent / "_cache"
    base.mkdir(parents=True, exist_ok=True)
    return base / "license_cache.json"


def _load() -> dict:
    """The on-disk cache, read once and held for the process."""
    global _MEMO
    if _MEMO is None:
        try:
            _MEMO = json.loads(_cache_path().read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _MEMO = {}
    return _MEMO


def _save() -> None:
    """Persist the cache."""
    try:
        _cache_path().write_text(json.dumps(_load()), encoding="utf-8")
    except OSError:
        pass


def _parse(repository: str) -> tuple[str, str] | None:
    """Owner and repo from a GitHub URL, ``None`` for anything else.

    Args:
        repository: A repository URL.

    Returns:
        ``(owner, repo)`` with a trailing ``.git`` stripped, or ``None``.
    """
    text = repository or ""
    if len(text) > _MAX_URL:
        return None
    match = _GITHUB.search(text)
    if not match:
        return None
    return match.group(1), re.sub(r"\.git$", "", match.group(2))


def _key(repository: str) -> str:
    """Owner and repo folded to a stable cache key, empty for a non-GitHub URL."""
    parsed = _parse(repository)
    return f"{parsed[0]}/{parsed[1]}".lower() if parsed else ""


def _fresh(entry: dict) -> bool:
    """Whether a cache entry still stands."""
    if entry.get("name"):
        return True
    age = time.time() - entry.get("at", 0)
    return age < NEGATIVE_DAYS * 86400


def cached(repository: str) -> str | None:
    """A resolved licence name from the cache without any network.

    Args:
        repository: A repository URL.

    Returns:
        The licence name, ``""`` where it is cached as having none, or ``None`` where it has
        not been resolved.
    """
    key = _key(repository)
    if not key:
        return None
    entry = _load().get(key)
    if entry is None or not _fresh(entry):
        return None
    return entry.get("name", "")


async def _read_file(session: aiohttp.ClientSession, url: str) -> str | None:
    """Fetch a licence file's text.

    Args:
        session: Session the request runs on.
        url: Raw content URL.

    Returns:
        The text on a 200, ``""`` where the file is absent (404 or empty), ``None`` where the
        fetch itself failed.
    """
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=TIMEOUT)) as answer:
            if answer.status == 404:
                return ""
            if answer.status != 200:
                return None
            return (await answer.text())[:LIMIT]
    except (aiohttp.ClientError, TimeoutError):
        return None


async def resolve(repository: str, session: aiohttp.ClientSession) -> str:
    """Read and identify a repository's licence, from cache where already read.

    Args:
        repository: A repository URL.
        session: Session the reads run on.

    Returns:
        The licence name, empty where the repository is not on GitHub or holds no licence
        file that can be identified.
    """
    parsed = _parse(repository)
    if parsed is None:
        return ""
    owner, repo = parsed
    key = f"{owner}/{repo}".lower()
    entry = _load().get(key)
    if entry is not None and _fresh(entry):
        return entry.get("name", "")

    name = ""
    failed = False
    for branch in _BRANCHES:
        for filename in _NAMES:
            text = await _read_file(
                session, f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{filename}"
            )
            if text is None:
                failed = True
                continue
            if text:
                name = licenses.detect_text(text)
                if name:
                    break
        if name:
            break

    # A name, or an absence confirmed by reads that all completed, is cached. A failed fetch
    # is not.
    if name or not failed:
        _load()[key] = {"name": name, "at": time.time()}
        _save()
    return name


async def resolve_many(
    repositories: Iterable[str], session: aiohttp.ClientSession, concurrency: int = 8
) -> dict:
    """Resolve several repositories' licences, reads run a few at a time.

    Args:
        repositories: Repository URLs.
        session: Session the reads run on.
        concurrency: How many reads run at once.

    Returns:
        ``{repository: name}`` for each input, name empty where none was identified.
    """
    import asyncio

    unique = list(dict.fromkeys(r for r in repositories if r))
    gate = asyncio.Semaphore(max(1, concurrency))
    out: dict = {}

    async def one(url: str) -> None:
        async with gate:
            out[url] = await resolve(url, session)

    await asyncio.gather(*(one(url) for url in unique))
    return out
