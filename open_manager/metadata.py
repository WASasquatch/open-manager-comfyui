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

from . import developer

__all__ = ["Metadata", "cache_dir", "fetch", "fetch_repo", "signature"]

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
            "open_issues": self.open_issues,
            "open_prs": self.open_prs,
            "pushed_at": self.pushed_at,
            "fetched_at": self.fetched_at,
            "developer": dict(self.developer),
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
            open_issues=int(data.get("open_issues") or 0),
            open_prs=int(data.get("open_prs") or 0),
            pushed_at=data.get("pushed_at", ""),
            fetched_at=float(data.get("fetched_at") or 0.0),
            developer=data.get("developer") or {},
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
    try:
        import folder_paths

        base = Path(folder_paths.get_user_directory()) / "open_manager" / "metadata"
    except Exception:
        base = Path(__file__).resolve().parent.parent / "_cache" / "metadata"
    base.mkdir(parents=True, exist_ok=True)
    return base


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


async def _json(session: aiohttp.ClientSession, url: str) -> dict:
    """Fetch JSON, answering an empty object on any failure."""
    try:
        async with session.get(
            url,
            headers={"Accept": "application/vnd.github+json", "User-Agent": "open-manager"},
            timeout=aiohttp.ClientTimeout(total=TIMEOUT),
        ) as answer:
            if answer.status != 200:
                return {}
            return await answer.json()
    except (aiohttp.ClientError, TimeoutError, ValueError):
        return {}


async def _issue_counts(
    session: aiohttp.ClientSession, owner: str, repo: str, info: dict
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
        session, f"https://api.github.com/repos/{owner}/{repo}/issues?state=open&per_page=100"
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
        )
        if isinstance(search, dict) and "total_count" in search:
            issues = int(search["total_count"])
    return issues, prs


async def fetch(
    node_id: str, repository: str, sig: str, session: aiohttp.ClientSession
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

    meta = await _scrape(owner_repo[0], owner_repo[1], sig, session)
    _write_cache(node_id, meta)
    return meta


async def fetch_repo(
    repository: str, session: aiohttp.ClientSession, max_age: float = 86400.0
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
        if time.time() - float(data.get("fetched_at") or 0) < max_age:
            return Metadata.from_json(data)
    except (OSError, ValueError):
        pass
    meta = await _scrape(owner_repo[0], owner_repo[1], "", session)
    _write_cache(key, meta)
    return meta


async def _scrape(owner: str, repo: str, sig: str, session: aiohttp.ClientSession) -> Metadata:
    """Read a repository's README and support fields from GitHub.

    Args:
        owner: Repository owner.
        repo: Repository name.
        sig: Signature to stamp the record with.
        session: Session the requests run on.

    Returns:
        The metadata, with empty fields where a read failed.
    """
    info = await _json(session, f"https://api.github.com/repos/{owner}/{repo}")
    branch = info.get("default_branch", "main") or "main"
    open_issues, open_prs = await _issue_counts(session, owner, repo, info)

    readme = ""
    for name in ("README.md", "README.MD", "readme.md", "README.rst", "README"):
        readme = await _text(
            session, f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{name}"
        )
        if readme:
            fmt = "markdown" if name.lower().endswith((".md", ".rst")) or name == "README" else "text"
            break
    else:
        fmt = "markdown"

    pyproject = await _text(
        session, f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/pyproject.toml"
    )
    requires_python, requires_comfyui = _requires_from_pyproject(pyproject)

    return Metadata(
        signature=sig,
        readme=readme,
        readme_format=fmt,
        default_branch=branch,
        topics=tuple(info.get("topics") or ()),
        license=(info.get("license") or {}).get("spdx_id", "") or "",
        requires_python=requires_python,
        requires_comfyui=requires_comfyui,
        open_issues=open_issues,
        open_prs=open_prs,
        pushed_at=info.get("pushed_at", "") or "",
        fetched_at=time.time(),
        developer=developer.from_pyproject(pyproject),
    )
