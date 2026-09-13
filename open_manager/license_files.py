"""Resolve a pack's licence from its repository when the registry only references a file.

The repository's LICENSE file is read from the raw content host and identified, and supersedes a
``{"file": "LICENSE"}`` reference. Each repository is read once and cached on disk.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import aiohttp

from . import licenses, paths

__all__ = ["Options", "cached", "resolve", "resolve_many"]

#: Seconds a fetch may take before it is abandoned.
TIMEOUT = 12

#: Most repositories read at once. A preference above this is clamped, so a mistyped
#: setting cannot turn a listing into a flood.
MAX_CONCURRENCY = 32

#: GitHub's licence endpoint, which names a repository's licence in one request instead of
#: guessing at filenames. Unauthenticated callers get 60 requests an hour, a token 5,000.
API_URL = "https://api.github.com/repos/{owner}/{repo}/license"

#: Seconds an API call may take.
API_TIMEOUT = 10

#: Longest the API is left alone after its rate limit is reached, however far off the reset
#: the header claims to be.
API_MAX_COOLDOWN = 3600.0

#: Seconds between writes of the cache while a batch is running. The final write is forced,
#: so at most a second of resolutions is ever lost.
SAVE_INTERVAL = 1.0

#: Largest licence file read, in characters.
LIMIT = 40000

#: Days a "no licence found" answer stands before it is looked for again. A resolved name
#: never expires on age alone.
NEGATIVE_DAYS = 21

#: Which revision of the detector produced a cached name. A resolved name is kept forever,
#: so a correction to the detector would otherwise never reach anyone who had already looked
#: the repository up. Raise this whenever detection changes and every older entry is read
#: again once.
#:
#: 2: the GNU licences are matched on their title. Before this, any text merely mentioning
#:    the Affero licence -- which GPL-3 section 13 does -- was reported as AGPL-3.0.
DETECTION_REVISION = 2

#: Longest repository string parsed for an owner and repo.
_MAX_URL = 400

#: Filenames a licence is commonly held under, tried in order on each branch.
_NAMES = ("LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md", "COPYING", "COPYING.md")

#: Branches a repository's default is commonly named, both spellings of main before the
#: older master. Raw content URLs are case sensitive, so "Main" is a separate candidate.
_BRANCHES = ("main", "Main", "master")

#: Owner and repo of a GitHub URL. The owner class excludes separators; the repo name keeps
#: dots, and a trailing ``.git`` is stripped after.
_GITHUB = re.compile(r"github\.com[/:]+([^/#?:]+)/([^/#?]+)", re.I)

_MEMO: dict | None = None

_last_save = 0.0

#: While the API's rate limit is spent, no call is made until this monotonic time. Without
#: it every repository in a listing would pay a refused request before falling back, which
#: is strictly worse than not asking at all. Anonymous callers get 60 an hour, so this is
#: the normal case rather than an edge one.
_api_blocked_until = 0.0


@dataclass(frozen=True)
class Options:
    """How a licence lookup should be carried out.

    Attributes:
        concurrency: Repositories read at once, clamped to ``1..MAX_CONCURRENCY``.
        race: Whether a repository's candidate filenames are fetched together rather than
            one after another. Faster per repository, at the cost of more requests.
        use_api: Whether GitHub is asked to name the licence before any file is read.
        token: GitHub token, which raises the API's rate limit. Empty for anonymous calls.
    """

    concurrency: int = 8
    race: bool = False
    use_api: bool = False
    token: str = ""

    @property
    def limit(self) -> int:
        """The concurrency actually used, held inside the accepted range."""
        try:
            wanted = int(self.concurrency)
        except (TypeError, ValueError):
            return 8
        return max(1, min(MAX_CONCURRENCY, wanted))


def _cache_path() -> Path:
    """File the resolved licences are written to."""
    return paths.store_file("license_cache.json")


def _load() -> dict:
    """The on-disk cache, read once and held for the process."""
    global _MEMO
    if _MEMO is None:
        try:
            _MEMO = json.loads(_cache_path().read_text(encoding="utf-8"))
        except (OSError, ValueError):
            _MEMO = {}
    return _MEMO


def _save(force: bool = False) -> None:
    """Persist the cache, at most once every :data:`SAVE_INTERVAL` unless forced.

    Resolving a listing writes an entry per repository, so an unthrottled save would rewrite
    the whole file thousands of times over one batch.

    Args:
        force: Write regardless of when the last write happened.
    """
    global _last_save
    now = time.monotonic()
    if not force and now - _last_save < SAVE_INTERVAL:
        return
    _last_save = now
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
    """Whether a cache entry still stands.

    An entry written by an older detector is stale whatever it says, so a correction reaches
    repositories that were already looked up.
    """
    if entry.get("rev") != DETECTION_REVISION:
        return False
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


def _candidates(owner: str, repo: str) -> list[str]:
    """Every raw URL a licence file might live at, most likely first."""
    return [
        f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{filename}"
        for branch in _BRANCHES
        for filename in _NAMES
    ]


def _cooldown(headers) -> float:
    """How long to leave the API alone, from the reset time it reported.

    Args:
        headers: Response headers carrying ``X-RateLimit-Reset``.

    Returns:
        Seconds to wait, never longer than :data:`API_MAX_COOLDOWN`.
    """
    try:
        wait = float(headers.get("X-RateLimit-Reset", 0)) - time.time()
    except (TypeError, ValueError):
        wait = API_MAX_COOLDOWN
    return max(0.0, min(wait, API_MAX_COOLDOWN))


async def _from_api(
    owner: str, repo: str, session: aiohttp.ClientSession, token: str
) -> tuple[str, bool]:
    """Ask GitHub to name a repository's licence, which takes one request.

    Args:
        owner: Repository owner.
        repo: Repository name.
        session: Session the request runs on.
        token: GitHub token, or empty for an anonymous call.

    Returns:
        ``(name, decided)``. ``decided`` is only ever true alongside a name. GitHub
        recognises a narrower set of licences than :mod:`.licenses` does and only looks at
        a few filenames, so "no licence" from the API is treated as unproven and the files
        are still read. The API can then add an answer but never take one away.
    """
    global _api_blocked_until
    if time.monotonic() < _api_blocked_until:
        return "", False
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with session.get(
            API_URL.format(owner=owner, repo=repo),
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=API_TIMEOUT),
        ) as answer:
            # A 404 means GitHub did not recognise a licence, not that there is none:
            # it misses British spellings and unusual filenames that a file read catches.
            if answer.status != 200:
                if answer.headers.get("X-RateLimit-Remaining") == "0":
                    _api_blocked_until = time.monotonic() + _cooldown(answer.headers)
                return "", False
            payload = await answer.json()
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
        return "", False
    spdx = ((payload or {}).get("license") or {}).get("spdx_id") or ""
    if not spdx or spdx == "NOASSERTION":
        return "", False
    return spdx, True


async def _from_files(
    owner: str, repo: str, session: aiohttp.ClientSession, race: bool
) -> tuple[str, bool]:
    """Read a repository's licence file and identify it.

    Args:
        owner: Repository owner.
        repo: Repository name.
        session: Session the reads run on.
        race: Whether every candidate is fetched at once rather than in turn.

    Returns:
        ``(name, failed)``. ``failed`` where a read did not complete, so an absence is not
        worth caching.
    """
    urls = _candidates(owner, repo)
    if not race:
        failed = False
        for url in urls:
            text = await _read_file(session, url)
            if text is None:
                failed = True
                continue
            if text:
                name = licenses.detect_text(text)
                if name:
                    return name, failed
        return "", failed

    # Raced: every candidate is fetched together, then the results are read back in
    # preference order, so the answer does not depend on which reply arrived first.
    texts = await asyncio.gather(*(_read_file(session, url) for url in urls))
    failed = any(text is None for text in texts)
    for text in texts:
        if text:
            name = licenses.detect_text(text)
            if name:
                return name, failed
    return "", failed


async def resolve(
    repository: str, session: aiohttp.ClientSession, options: Options | None = None
) -> str:
    """Identify a repository's licence, from cache where it has been read before.

    Args:
        repository: A repository URL.
        session: Session the reads run on.
        options: How to carry out the lookup. Defaults leave the behaviour as it was
            before the API and racing were offered.

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

    opts = options or Options()
    name, failed = "", False
    # The API answers in one request where it can. Anything it does not settle falls back
    # to reading the files, so a rate limit degrades rather than breaks the lookup.
    if opts.use_api:
        name, decided = await _from_api(owner, repo, session, opts.token)
        if not name and not decided:
            name, failed = await _from_files(owner, repo, session, opts.race)
    else:
        name, failed = await _from_files(owner, repo, session, opts.race)

    # A name, or an absence confirmed by reads that all completed, is cached. A failed fetch
    # is not.
    if name or not failed:
        _load()[key] = {"name": name, "at": time.time(), "rev": DETECTION_REVISION}
        _save()
    return name


async def resolve_many(
    repositories: Iterable[str],
    session: aiohttp.ClientSession,
    options: Options | None = None,
) -> dict:
    """Resolve several repositories' licences, reads run a few at a time.

    Args:
        repositories: Repository URLs.
        session: Session the reads run on.
        options: How to carry out the lookups, including how many run at once.

    Returns:
        ``{repository: name}`` for each input, name empty where none was identified.
    """
    opts = options or Options()
    unique = list(dict.fromkeys(r for r in repositories if r))
    gate = asyncio.Semaphore(opts.limit)
    out: dict = {}

    async def one(url: str) -> None:
        async with gate:
            out[url] = await resolve(url, session, opts)

    try:
        await asyncio.gather(*(one(url) for url in unique))
    finally:
        # Whatever was resolved before any failure is still worth keeping.
        _save(force=True)
    return out
