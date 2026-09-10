"""Comfy Registry client that asks for every version status.

The registry at ``https://api.comfy.org`` records a status per published version: ``Active``,
``Pending``, ``Flagged``, ``Banned`` or ``Deleted``. Requests here are unfiltered and every
version carries its status. ``latest_version`` on a node record names an ``Active`` release
only, and :func:`resolve_versions` reports ``newest`` beside it.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

import aiohttp

__all__ = [
    "BASE_URL",
    "NodeRecord",
    "NodeVersion",
    "RegistryError",
    "Resolution",
    "fetch_node",
    "fetch_versions",
    "install_target",
    "resolve_versions",
    "search",
]

#: Registry origin. Overridable so a mirror or a private index can be used instead.
BASE_URL = "https://api.comfy.org"

#: Seconds a node record or version list is reused before it is fetched again.
CACHE_SECONDS = 300

#: Seconds any single request may take.
TIMEOUT = 20

#: Prefixes the registry puts in front of its status constants.
_STATUS_PREFIXES = ("NodeVersionStatus", "PublisherStatus", "NodeStatus")

_cache: dict[str, tuple[float, Any]] = {}


class RegistryError(RuntimeError):
    """A registry request failed.

    Attributes:
        status: HTTP status, or 0 where the request never completed.
        detail: Body text or the transport error.
    """

    def __init__(self, status: int, detail: str) -> None:
        """Build the error.

        Args:
            status: HTTP status, or 0 where the request never completed.
            detail: Body text or the transport error.
        """
        super().__init__(f"registry returned {status}: {detail}")
        self.status = status
        self.detail = detail


@dataclass(frozen=True)
class NodeVersion:
    """One published version of a pack.

    Attributes:
        version: Version string as published.
        status: Short status, one of ``active``, ``pending``, ``flagged``, ``banned``,
            ``deleted`` or the raw value where the registry publishes something new.
        created_at: ISO timestamp of publication.
        deprecated: Whether the publisher marked this version deprecated.
        download_url: Artifact URL, empty where the registry did not supply one.
        dependencies: Package requirements declared by the version.
        raw: The unmodified object the registry answered with.
    """

    version: str
    status: str
    created_at: str = ""
    deprecated: bool = False
    download_url: str = ""
    dependencies: tuple[str, ...] = ()
    raw: dict = field(default_factory=dict, repr=False)

    @property
    def is_active(self) -> bool:
        """Whether the registry considers this version unremarkable."""
        return self.status == "active"

    @property
    def is_withheld(self) -> bool:
        """Whether the registry withdrew this version rather than merely flagging it."""
        return self.status in ("banned", "deleted")


@dataclass(frozen=True)
class NodeRecord:
    """A pack as the registry describes it.

    Attributes:
        node_id: Registry identifier, which is also the pyproject name.
        name: Display name.
        description: Publisher's summary.
        publisher: Publisher identifier.
        publisher_status: Publisher account status.
        status: Node-level status, separate from any version status.
        repository: Source repository URL.
        icon: Icon URL, empty where none is published.
        banner: Banner URL, empty where none is published.
        downloads: Lifetime download count.
        stars: GitHub star count as the registry last saw it.
        latest_active: Version the registry advertises, which is always an active one.
        author: Author string, empty where the registry has none.
        category: Registry category, empty where unset.
        license: License as the registry records it, empty where unset.
        tags: Registry tags.
        created_at: ISO timestamp the pack was first published.
        supported_os: Operating systems the pack declares support for.
        supported_comfyui: ComfyUI version range the pack declares.
        supported_accelerators: Accelerators the pack declares support for.
        raw: The unmodified object the registry answered with.
    """

    node_id: str
    name: str = ""
    description: str = ""
    publisher: str = ""
    publisher_status: str = ""
    status: str = ""
    repository: str = ""
    icon: str = ""
    banner: str = ""
    downloads: int = 0
    stars: int = 0
    latest_active: str = ""
    author: str = ""
    category: str = ""
    license: str = ""
    tags: tuple[str, ...] = ()
    created_at: str = ""
    supported_os: tuple[str, ...] = ()
    supported_comfyui: str = ""
    supported_accelerators: tuple[str, ...] = ()
    raw: dict = field(default_factory=dict, repr=False)


@dataclass(frozen=True)
class Resolution:
    """How a pack's versions sort once every status is visible.

    Attributes:
        newest: Most recently published version of any status.
        latest_active: Most recently published active version.
        withheld: Versions the registry banned or deleted.
        versions: Every version, newest first.
    """

    newest: NodeVersion | None
    latest_active: NodeVersion | None
    withheld: tuple[NodeVersion, ...]
    versions: tuple[NodeVersion, ...]

    @property
    def newest_is_hidden(self) -> bool:
        """Whether the registry's advertised version is behind the newest published one."""
        if self.newest is None:
            return False
        if self.latest_active is None:
            return True
        return self.newest.version != self.latest_active.version


def _short_status(value: str) -> str:
    """Reduce a registry status constant to its lowercase suffix.

    Args:
        value: A value such as ``NodeVersionStatusFlagged`` or ``PublisherStatusActive``.

    Returns:
        ``flagged``, or the input lowercased where it carries no known prefix.
    """
    text = (value or "").strip()
    for prefix in _STATUS_PREFIXES:
        if text.startswith(prefix):
            text = text[len(prefix):]
            break
    return text.lower() or "unknown"


async def _get(session: aiohttp.ClientSession, url: str) -> Any:
    """Fetch JSON from the registry.

    Args:
        session: Session the request runs on.
        url: Absolute URL.

    Returns:
        The decoded body.

    Raises:
        RegistryError: On any non-200 answer or transport failure.
    """
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=TIMEOUT)) as answer:
            body = await answer.text()
            if answer.status != 200:
                raise RegistryError(answer.status, body[:400])
            import json

            return json.loads(body)
    except RegistryError:
        raise
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
        raise RegistryError(0, f"{type(error).__name__}: {error}") from error


def _cached(key: str) -> Any | None:
    """Read a cache entry that has not expired."""
    entry = _cache.get(key)
    if entry is None:
        return None
    stamped, value = entry
    if time.monotonic() - stamped > CACHE_SECONDS:
        _cache.pop(key, None)
        return None
    return value


def _licence_name(value) -> str:
    """A displayable license name from the registry's license field.

    Args:
        value: The raw ``license`` field, an SPDX string or JSON naming a license file.

    Returns:
        A license name, empty where only a file reference is recorded.
    """
    import json as _json

    if not value:
        return ""
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("{"):
            try:
                value = _json.loads(text)
            except ValueError:
                return text
        else:
            return text
    if isinstance(value, dict):
        return value.get("spdx_id") or value.get("type") or value.get("text") or ""
    return str(value)


async def fetch_node(node_id: str, session: aiohttp.ClientSession) -> NodeRecord:
    """Read one pack's registry record.

    Args:
        node_id: Registry identifier.
        session: Session the request runs on.

    Returns:
        The record, including the banner and description a detail view draws.

    Raises:
        RegistryError: Where the registry did not answer with the record.
    """
    key = f"node:{node_id}"
    hit = _cached(key)
    if hit is not None:
        return hit

    payload = await _get(session, f"{BASE_URL}/nodes/{node_id}")
    publisher = payload.get("publisher") or {}
    latest = payload.get("latest_version") or {}
    licence = _licence_name(payload.get("license"))
    record = NodeRecord(
        node_id=payload.get("id", node_id),
        name=payload.get("name", ""),
        description=payload.get("description", ""),
        publisher=publisher.get("id", ""),
        publisher_status=_short_status(publisher.get("status", "")),
        status=_short_status(payload.get("status", "")),
        repository=payload.get("repository", ""),
        icon=payload.get("icon", ""),
        banner=payload.get("banner_url", ""),
        downloads=int(payload.get("downloads") or 0),
        stars=int(payload.get("github_stars") or 0),
        latest_active=latest.get("version", ""),
        author=payload.get("author", "") or "",
        category=payload.get("category", "") or "",
        license=licence,
        tags=tuple(payload.get("tags") or ()),
        created_at=payload.get("created_at", "") or "",
        supported_os=tuple(payload.get("supported_os") or latest.get("supported_os") or ()),
        supported_comfyui=payload.get("supported_comfyui_version")
        or latest.get("supported_comfyui_version")
        or "",
        supported_accelerators=tuple(
            payload.get("supported_accelerators") or latest.get("supported_accelerators") or ()
        ),
        raw=payload,
    )
    _cache[key] = (time.monotonic(), record)
    return record


async def fetch_versions(node_id: str, session: aiohttp.ClientSession) -> tuple[NodeVersion, ...]:
    """Read every published version of a pack, whatever its status.

    Args:
        node_id: Registry identifier.
        session: Session the request runs on.

    Returns:
        Every version, newest first.

    Raises:
        RegistryError: Where the registry did not answer with the list.
    """
    key = f"versions:{node_id}"
    hit = _cached(key)
    if hit is not None:
        return hit

    payload = await _get(session, f"{BASE_URL}/nodes/{node_id}/versions")
    rows = payload if isinstance(payload, list) else payload.get("versions", [])
    versions = tuple(
        sorted(
            (
                NodeVersion(
                    version=row.get("version", ""),
                    status=_short_status(row.get("status", "")),
                    created_at=row.get("createdAt", ""),
                    deprecated=bool(row.get("deprecated")),
                    download_url=row.get("downloadUrl", "") or "",
                    dependencies=tuple(row.get("dependencies") or ()),
                    raw=row,
                )
                for row in rows
            ),
            key=lambda entry: entry.created_at,
            reverse=True,
        )
    )
    _cache[key] = (time.monotonic(), versions)
    return versions


def resolve_versions(versions: tuple[NodeVersion, ...]) -> Resolution:
    """Sort a version list into what is newest and what the registry advertises.

    Args:
        versions: Every version, as :func:`fetch_versions` answers.

    Returns:
        A :class:`Resolution` separating ``newest`` from ``latest_active``.
    """
    offerable = tuple(entry for entry in versions if not entry.is_withheld)
    withheld = tuple(entry for entry in versions if entry.is_withheld)
    newest = offerable[0] if offerable else None
    latest_active = next((entry for entry in offerable if entry.is_active), None)
    return Resolution(
        newest=newest, latest_active=latest_active, withheld=withheld, versions=versions
    )


async def search(
    term: str, session: aiohttp.ClientSession, limit: int = 40, page: int = 1
) -> tuple[list[dict], int]:
    """Find packs whose entry matches a search term.

    Args:
        term: Text to match. An empty term lists the catalog.
        session: Session the request runs on.
        limit: Entries per page.
        page: Page to read, counted from one.

    Returns:
        ``(entries, total)``, each entry carrying the summary fields a result row draws.

    Raises:
        RegistryError: Where the registry did not answer.
    """
    import urllib.parse

    quoted = urllib.parse.quote(term.strip())
    if quoted:
        url = f"{BASE_URL}/nodes/search?search={quoted}&limit={limit}&page={page}"
    else:
        url = f"{BASE_URL}/nodes?limit={limit}&page={page}"

    payload = await _get(session, url)
    rows = payload.get("nodes", []) if isinstance(payload, dict) else list(payload)
    total = int(payload.get("total", len(rows))) if isinstance(payload, dict) else len(rows)
    from . import licenses

    entries = []
    for row in rows:
        licence = licenses.classify(row.get("license"))
        entries.append({
            "id": row.get("id", ""),
            "name": row.get("name", ""),
            "description": (row.get("description") or "")[:200],
            "publisher": (row.get("publisher") or {}).get("id", ""),
            "downloads": int(row.get("downloads") or 0),
            "stars": int(row.get("github_stars") or 0),
            "icon": row.get("icon", ""),
            "repository": row.get("repository", "") or "",
            "advertised": (row.get("latest_version") or {}).get("version", ""),
            "released": (row.get("latest_version") or {}).get("createdAt", "") or "",
            "license": licence["name"],
            "license_tier": licence["tier"],
            "license_rank": licence["rank"],
            "license_color": licence["color"],
        })
    return entries, total


async def install_target(
    node_id: str, version: str, session: aiohttp.ClientSession
) -> dict:
    """Ask the registry where a specific version's artifact lives.

    Args:
        node_id: Registry identifier.
        version: Exact version string.
        session: Session the request runs on.

    Returns:
        ``{"download_url", "status", "version"}`` for the named version.

    Raises:
        RegistryError: Where the registry declined to answer.
    """
    payload = await _get(session, f"{BASE_URL}/nodes/{node_id}/install?version={version}")
    return {
        "download_url": payload.get("downloadUrl", ""),
        "status": _short_status(payload.get("status", "")),
        "version": payload.get("version", version),
    }
