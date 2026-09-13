"""Pack metadata scraped from its repository, cached until its versions change.

The registry carries a pack's license, category, tags and system support. The README is read
from the repository when the enrichment feature is on. A scrape is keyed by a signature of the
pack's version list and re-runs only when a version is added or changes status.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import aiohttp

from . import developer, paths

__all__ = ["Metadata", "cache_dir", "fetch", "fetch_repo", "signature"]

#: Which revision of the scrape produced a cached entry. A scrape is kept until the pack's
#: versions change, so a change in what we read would otherwise never reach anyone who had
#: already looked a pack up. Raise this whenever the shape of what is scraped changes.
#:
#: 2: pattern and directory entries in the developer table are resolved against the
#:    repository's files, and the conventional workflow directories are read.
#: 3: a workflow's preview image is paired with it, and a gallery may hold clips.
#: 4: the stargazer count travels, so a pack page can show GitHub's own figure.
CACHE_REVISION = 4

#: Seconds any single request may take.
TIMEOUT = 20

#: Bytes of README kept. A repository README runs long; a modal shows an excerpt.
README_LIMIT = 200_000

#: Owner and repo of a GitHub URL. The owner class excludes the separators so a long run of
#: colons cannot backtrack; the repo name keeps dots and a trailing ``.git`` is stripped after.
_GITHUB = re.compile(r"github\.com[/:]+([^/#?:]+)/([^/#?]+)", re.I)


@dataclass(frozen=True)
class Metadata:
    """Repository facts for one pack.

    Attributes:
        signature: Version signature the scrape was keyed to.
        readme: README text, empty where none was found.
        readme_format: ``markdown`` or ``text``.
        default_branch: Branch the files were read from.
        topics: Repository topics.
        license: SPDX identifier, empty where unknown.
        requires_python: ``requires-python`` from pyproject, empty where absent.
        requires_comfyui: ``[tool.comfy] requires-comfyui`` from pyproject.
        stars: Stargazer count as GitHub reports it. The registry keeps its own copy and
            refreshes it on its own schedule, so where the two differ this is the current one.
            Reported as found: nothing here second-guesses a figure that looks wrong.
        open_issues: Open issue count, excluding pull requests.
        open_prs: Open pull request count.
        pushed_at: ISO timestamp of the last push.
        fetched_at: Unix time of the scrape.
        developer: The pack's ``[tool.open_manager]`` table, empty where absent.
    """

    signature: str
    readme: str = ""
    readme_format: str = "markdown"
    default_branch: str = ""
    topics: tuple[str, ...] = ()
    license: str = ""
    requires_python: str = ""
    requires_comfyui: str = ""
    stars: int = 0
    open_issues: int = 0
    open_prs: int = 0
    pushed_at: str = ""
    fetched_at: float = 0.0
    developer: dict = field(default_factory=dict)

    def to_json(self) -> dict:
        """This metadata as a plain object."""
        return {
            "signature": self.signature,
            "readme": self.readme,
            "readme_format": self.readme_format,
            "default_branch": self.default_branch,
            "topics": list(self.topics),
            "license": self.license,
            "requires_python": self.requires_python,
            "requires_comfyui": self.requires_comfyui,
            "stars": self.stars,
            "open_issues": self.open_issues,
            "open_prs": self.open_prs,
            "pushed_at": self.pushed_at,
            "fetched_at": self.fetched_at,
            "developer": dict(self.developer),
            "revision": CACHE_REVISION,
        }

    @classmethod
    def from_json(cls, data: dict) -> "Metadata":
        """Rebuild metadata from a cached object."""
        return cls(
            signature=data.get("signature", ""),
            readme=data.get("readme", ""),
            readme_format=data.get("readme_format", "markdown"),
            default_branch=data.get("default_branch", ""),
            topics=tuple(data.get("topics") or ()),
            license=data.get("license", ""),
            requires_python=data.get("requires_python", ""),
            requires_comfyui=data.get("requires_comfyui", ""),
            stars=int(data.get("stars") or 0),
            open_issues=int(data.get("open_issues") or 0),
            open_prs=int(data.get("open_prs") or 0),
            pushed_at=data.get("pushed_at", ""),
            fetched_at=float(data.get("fetched_at") or 0.0),
            developer=developer.scrub(data.get("developer") or {}),
        )


def signature(versions: Iterable) -> str:
    """A short signature of a version list, changing when a version or status changes.

    Args:
        versions: Objects carrying ``version`` and ``status`` attributes.

    Returns:
        A hex digest.
    """
    parts = [f"{getattr(v, 'version', '')}:{getattr(v, 'status', '')}" for v in versions]
    return hashlib.sha1("|".join(sorted(parts)).encode("utf-8")).hexdigest()[:16]


def cache_dir() -> Path:
    """Directory the scrape cache is written to.

    Returns:
        A writable directory under ComfyUI's user tree, or beside this module.
    """
    return paths.store("metadata")


def _cache_path(node_id: str) -> Path:
    """Cache file for a pack."""
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", node_id)
    return cache_dir() / f"{safe}.json"


def _read_cache(node_id: str, sig: str) -> Metadata | None:
    """Cached metadata for a pack, where its signature still matches.

    Args:
        node_id: Registry identifier.
        sig: Current version signature.

    Returns:
        The metadata, or ``None`` where the cache is absent or stale.
    """
    path = _cache_path(node_id)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if data.get("signature") != sig:
        return None
    # An entry from an older scrape is read again rather than served as it stands.
    if int(data.get("revision") or 0) < CACHE_REVISION:
        return None
    return Metadata.from_json(data)


def _write_cache(node_id: str, meta: Metadata) -> None:
    """Persist metadata for a pack."""
    try:
        _cache_path(node_id).write_text(json.dumps(meta.to_json()), encoding="utf-8")
    except OSError:
        pass


def _owner_repo(repository: str) -> tuple[str, str] | None:
    """Owner and repo parsed from a GitHub URL.

    Args:
        repository: A repository URL.

    Returns:
        ``(owner, repo)`` for a GitHub URL, otherwise ``None``.
    """
    text = repository or ""
    if len(text) > 400:
        return None
    match = _GITHUB.search(text)
    return (match.group(1), re.sub(r"\.git$", "", match.group(2))) if match else None


def _requires_from_pyproject(text: str) -> tuple[str, str]:
    """Read the two support fields from pyproject text.

    Args:
        text: pyproject.toml contents.

    Returns:
        ``(requires_python, requires_comfyui)``, each empty where absent.
    """
    py = re.search(r'requires-python\s*=\s*["\']([^"\']+)["\']', text)
    comfy = re.search(r'requires-comfyui\s*=\s*["\']([^"\']+)["\']', text)
    return (py.group(1) if py else "", comfy.group(1) if comfy else "")


async def _text(session: aiohttp.ClientSession, url: str) -> str:
    """Fetch text, answering an empty string on any failure."""
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=TIMEOUT)) as answer:
            if answer.status != 200:
                return ""
            return (await answer.text())[:README_LIMIT]
    except (aiohttp.ClientError, TimeoutError):
        return ""


async def _json(session: aiohttp.ClientSession, url: str, token: str = "") -> dict:
    """Fetch JSON, answering an empty object on any failure.

    Args:
        session: Session the request runs on.
        url: Absolute URL.
        token: GitHub token, which lifts the hourly limit from 60 requests to 5,000. A pack
            page spends up to three, so without one a browsing session runs out quickly.
    """
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "open-manager"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with session.get(
            url,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=TIMEOUT),
        ) as answer:
            if answer.status != 200:
                return {}
            return await answer.json()
    except (aiohttp.ClientError, TimeoutError, ValueError):
        return {}


async def _issue_counts(
    session: aiohttp.ClientSession, owner: str, repo: str, info: dict, token: str = ""
) -> tuple[int, int]:
    """Open issue and pull request counts, counted apart.

    Args:
        session: Session the requests run on.
        owner: Repository owner.
        repo: Repository name.
        info: The repository record, used as a fallback.

    Returns:
        ``(open_issues, open_prs)``.
    """
    data = await _json(
        session,
        f"https://api.github.com/repos/{owner}/{repo}/issues?state=open&per_page=100",
        token,
    )
    if not isinstance(data, list):
        return int(info.get("open_issues_count") or 0), 0
    issues = sum(1 for item in data if "pull_request" not in item)
    prs = sum(1 for item in data if "pull_request" in item)
    if len(data) >= 100:
        search = await _json(
            session,
            f"https://api.github.com/search/issues"
            f"?q=repo:{owner}/{repo}+type:issue+state:open&per_page=1",
            token,
        )
        if isinstance(search, dict) and "total_count" in search:
            issues = int(search["total_count"])
    return issues, prs


async def fetch(
    node_id: str, repository: str, sig: str, session: aiohttp.ClientSession, token: str = ""
) -> Metadata:
    """Repository metadata for a pack, from cache where the versions are unchanged.

    Args:
        node_id: Registry identifier.
        repository: Repository URL.
        sig: Signature of the current version list.
        session: Session the requests run on.

    Returns:
        The metadata. A repository that cannot be read yields a cached record carrying the
        signature and empty fields.
    """
    cached = _read_cache(node_id, sig)
    if cached is not None:
        return cached

    owner_repo = _owner_repo(repository)
    if owner_repo is None:
        meta = Metadata(signature=sig, fetched_at=time.time())
        _write_cache(node_id, meta)
        return meta

    meta = await _scrape(owner_repo[0], owner_repo[1], sig, session, token)
    # A record keyed by the version signature is kept until the pack publishes again, so a
    # scrape that came back with nothing at all is left uncached and tried again instead.
    if not _is_blank(meta):
        _write_cache(node_id, meta)
    return meta


async def fetch_repo(
    repository: str, session: aiohttp.ClientSession, max_age: float = 86400.0, token: str = ""
) -> Metadata:
    """Repository metadata for a repo that is not on the registry, cached by repository.

    Args:
        repository: Repository URL.
        session: Session the requests run on.
        max_age: Seconds a cached record stands before the repository is read again.

    Returns:
        The metadata, empty where the repository is not a readable GitHub URL.
    """
    owner_repo = _owner_repo(repository)
    if owner_repo is None:
        return Metadata(fetched_at=time.time())
    key = f"repo__{owner_repo[0]}__{owner_repo[1]}"
    path = _cache_path(key)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        fresh = time.time() - float(data.get("fetched_at") or 0) < max_age
        if fresh and int(data.get("revision") or 0) >= CACHE_REVISION:
            return Metadata.from_json(data)
    except (OSError, ValueError):
        pass
    meta = await _scrape(owner_repo[0], owner_repo[1], "", session, token)
    if not _is_blank(meta):
        _write_cache(key, meta)
    return meta


#: Filenames a README is commonly held under, tried in order.
README_NAMES = ("README.md", "README.MD", "readme.md", "README.rst", "README")

#: A ref the panel will read: a branch name or a commit sha. Slashes are allowed because
#: branches carry them; a leading dash and any traversal are not.
_REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$")


def valid_ref(ref: str) -> bool:
    """Whether a ref is one worth putting in a raw content URL.

    Args:
        ref: A branch name or commit sha.

    Returns:
        True where the ref is well formed and climbs nowhere.
    """
    text = (ref or "").strip()
    return bool(text) and ".." not in text and bool(_REF.match(text))


async def read_at_ref(
    owner: str, repo: str, ref: str, session: aiohttp.ClientSession
) -> dict:
    """Read a repository's README and pyproject at one branch or commit.

    Only the raw content host is used, so this costs nothing against the API's hourly limit
    and keeps working when that limit is spent.

    Args:
        owner: Repository owner.
        repo: Repository name.
        ref: Branch name or commit sha to read at.
        session: Session the reads run on.

    Returns:
        ``{readme, readme_format, developer}``, the README empty where the ref holds none.
    """
    readme, fmt = "", "markdown"
    for name in README_NAMES:
        readme = await _text(
            session, f"https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{name}"
        )
        if readme:
            fmt = "markdown" if name.lower().endswith((".md", ".rst")) or name == "README" else "text"
            break
    pyproject = await _text(
        session, f"https://raw.githubusercontent.com/{owner}/{repo}/{ref}/pyproject.toml"
    )
    table = developer.from_pyproject(pyproject)
    if table:
        table = developer.expand(table, await _tree_lister(owner, repo, ref, session))
    return {
        "readme": readme,
        "readme_format": fmt,
        "developer": table,
    }


async def _tree_lister(owner: str, repo: str, ref: str, session: aiohttp.ClientSession):
    """A lister for :func:`developer.expand`, backed by the repository's file tree.

    One call returns every path in the repository, which is what resolving a pattern or a
    bare directory needs for a pack that is not installed locally. Failure is not fatal: the
    lister then sees nothing and every entry is left as the pack wrote it.

    Args:
        owner: Repository owner.
        repo: Repository name.
        ref: Branch or commit to read.
        session: Session the request runs on.

    Returns:
        A callable taking a directory and returning the repository-relative paths below it.
    """
    paths: list[str] = []
    try:
        async with session.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{ref}?recursive=1",
            headers={"Accept": "application/vnd.github+json", "User-Agent": "open-manager"},
            timeout=aiohttp.ClientTimeout(total=20),
        ) as answer:
            if answer.status == 200:
                payload = await answer.json()
                paths = [
                    str(item.get("path") or "")
                    for item in (payload.get("tree") or [])
                    if item.get("type") == "blob"
                ]
    except (aiohttp.ClientError, TimeoutError, ValueError):
        paths = []

    def listing(folder: str) -> list[str]:
        if folder in ("", "."):
            return list(paths)
        prefix = folder.rstrip("/") + "/"
        return [path for path in paths if path.startswith(prefix)]

    return listing


def _is_blank(meta: Metadata) -> bool:
    """Whether a scrape came back with nothing at all.

    A repository that yields neither a README nor a single field did not fail to find
    anything, it failed to ask: GitHub's hourly limit, or no network. Caching that would
    leave the pack page empty until its next release, so it is not cached.

    Args:
        meta: The record a scrape produced.

    Returns:
        True where every field a read could have filled is empty.
    """
    return not (
        meta.readme
        or meta.topics
        or meta.license
        or meta.pushed_at
        or meta.open_issues
        or meta.open_prs
        or meta.requires_python
        or meta.requires_comfyui
        or meta.developer
    )


async def _scrape(
    owner: str, repo: str, sig: str, session: aiohttp.ClientSession, token: str = ""
) -> Metadata:
    """Read a repository's README and support fields from GitHub.

    Args:
        owner: Repository owner.
        repo: Repository name.
        sig: Signature to stamp the record with.
        session: Session the requests run on.

    Returns:
        The metadata, with empty fields where a read failed.
    """
    info = await _json(session, f"https://api.github.com/repos/{owner}/{repo}", token)
    open_issues, open_prs = await _issue_counts(session, owner, repo, info, token)

    # Where the API answered, it named the branch. Where it did not -- an outage, or the
    # hourly limit spent -- the branch is a guess, and the raw host is case sensitive, so
    # the usual names are tried rather than assuming "main". This keeps the README, the
    # pyproject and the gallery readable when only the API is unavailable.
    named = info.get("default_branch") or ""
    # Both spellings of main are tried before master: a repository carrying either name
    # alongside an old master should be read from the one it actually develops on.
    branches = (named,) if named else ("main", "Main", "master")

    readme, fmt, branch = "", "markdown", named or "main"
    for candidate in branches:
        for name in ("README.md", "README.MD", "readme.md", "README.rst", "README"):
            readme = await _text(
                session, f"https://raw.githubusercontent.com/{owner}/{repo}/{candidate}/{name}"
            )
            if readme:
                fmt = "markdown" if name.lower().endswith((".md", ".rst")) or name == "README" else "text"
                branch = candidate
                break
        if readme:
            break

    # The pyproject carries requires-python and the [tool.open_manager] table, the gallery
    # among it. Where the branch was guessed, a miss is retried on the other candidates
    # rather than assumed absent: a repository can hold a README on one branch and its
    # pyproject on another.
    pyproject = ""
    for candidate in (branch, *(b for b in branches if b != branch)):
        pyproject = await _text(
            session, f"https://raw.githubusercontent.com/{owner}/{repo}/{candidate}/pyproject.toml"
        )
        if pyproject:
            break
    requires_python, requires_comfyui = _requires_from_pyproject(pyproject)

    dev_table = developer.from_pyproject(pyproject)
    if dev_table:
        dev_table = developer.expand(
            dev_table, await _tree_lister(owner, repo, branch or "HEAD", session)
        )
    return Metadata(
        signature=sig,
        readme=readme,
        readme_format=fmt,
        default_branch=branch,
        topics=tuple(info.get("topics") or ()),
        license=(info.get("license") or {}).get("spdx_id", "") or "",
        requires_python=requires_python,
        requires_comfyui=requires_comfyui,
        stars=int(info.get("stargazers_count") or 0),
        open_issues=open_issues,
        open_prs=open_prs,
        pushed_at=info.get("pushed_at", "") or "",
        fetched_at=time.time(),
        developer=dev_table,
    )
