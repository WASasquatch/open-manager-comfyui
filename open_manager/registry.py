"""Comfy Registry client that asks for every version status.

The registry at ``https://api.comfy.org`` records a status per published version: ``Active``,
``Pending``, ``Flagged``, ``Banned`` or ``Deleted``. Requests here are unfiltered and every
version carries its status. ``latest_version`` on a node record names an ``Active`` release
only, and :func:`resolve_versions` reports ``newest`` beside it.
"""

from __future__ import annotations

import asyncio
import json
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
    "fetch_status_reasons",
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
        changelog: What the publisher said changed in this version, empty where they said
            nothing. Free text supplied by the publisher, so it is never treated as markup.
        supported_os: Operating system classifiers this version declares.
        supported_comfyui: ComfyUI version specifier this version declares.
        supported_frontend: Frontend package version specifier this version declares.
        supported_accelerators: Accelerator classifiers this version declares.
        download_url: Artifact URL, empty where the registry did not supply one.
        dependencies: Package requirements declared by the version.
        raw: The unmodified object the registry answered with.
    """

    version: str
    status: str
    created_at: str = ""
    deprecated: bool = False
    changelog: str = ""
    # Declared per version, and only per version: the node-level copies of these are empty
    # for every pack that fills them in, so the pack page was describing the newest release
    # no matter which version was being looked at.
    supported_os: tuple[str, ...] = ()
    supported_comfyui: str = ""
    supported_frontend: str = ""
    supported_accelerators: tuple[str, ...] = ()
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
        publisher_name: The publisher's display name, which the registry fills in for almost
            every pack while ``author`` is nearly always empty.
        publisher_members: Names of the people on the publisher account.
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
        raw: The unmodified object the registry answered with.
    """

    node_id: str
    name: str = ""
    description: str = ""
    publisher: str = ""
    publisher_name: str = ""
    publisher_members: tuple[str, ...] = ()
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


def _members(publisher: dict) -> tuple[str, ...]:
    """The people on a publisher account, in the order the registry lists them.

    The registry nests each one as ``{"user": {"name": ...}}``. Names repeat where somebody
    appears twice, so they are folded while keeping the order they arrived in.

    Args:
        publisher: The publisher object from a node payload.

    Returns:
        Display names, empty where the account lists nobody.
    """
    seen: dict[str, None] = {}
    for entry in publisher.get("members") or ():
        name = ((entry or {}).get("user") or {}).get("name") or ""
        name = str(name).strip()
        if name:
            seen.setdefault(name, None)
    return tuple(seen)


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
        publisher_name=publisher.get("name", "") or "",
        publisher_members=_members(publisher),
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
                    changelog=str(row.get("changelog") or "").strip(),
                    supported_os=tuple(row.get("supported_os") or ()),
                    supported_comfyui=str(row.get("supported_comfyui_version") or "").strip(),
                    supported_frontend=str(
                        row.get("supported_comfyui_frontend_version") or "").strip(),
                    supported_accelerators=tuple(row.get("supported_accelerators") or ()),
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


#: Distinct scanner findings named in one summary before the rest are counted.
_REASON_KINDS = 4


def _summarise_reason(raw: str) -> str:
    """One line explaining why a version carries the status it does.

    The registry answers in three shapes: plain prose, an object carrying an admin
    ``message``, and an array of scanner findings. All three are reduced to a sentence,
    because the raw form runs to megabytes of code snippets and YARA matches.

    Args:
        raw: The ``status_reason`` field as the registry sent it.

    Returns:
        A short explanation, empty where there is nothing worth saying.
    """
    import json as _json

    text = (raw or "").strip()
    if not text:
        return ""
    try:
        parsed = _json.loads(text)
    except ValueError:
        return text[:400]

    if isinstance(parsed, dict):
        return str(parsed.get("message") or "").strip()[:400]

    if not isinstance(parsed, list):
        return ""
    kinds: dict[str, int] = {}
    for item in parsed:
        if not isinstance(item, dict):
            continue
        label = str(item.get("description") or item.get("issue_type") or "").strip()
        if label:
            kinds[label] = kinds.get(label, 0) + 1
    if not kinds:
        return ""
    ordered = sorted(kinds.items(), key=lambda pair: (-pair[1], pair[0]))
    named = "; ".join(
        f"{label} (x{count})" if count > 1 else label
        for label, count in ordered[:_REASON_KINDS]
    )
    total = sum(kinds.values())
    if len(ordered) > _REASON_KINDS:
        named += f"; and {len(ordered) - _REASON_KINDS} more"
    return f"{total} finding(s): {named}"


async def fetch_status_reasons(node_id: str, session: aiohttp.ClientSession) -> dict:
    """Why each version of a pack carries its status.

    The registry only returns these when asked, and the raw answer is very large -- several
    megabytes for one pack, most of it code snippets -- so it is summarised here and only
    the sentence travels on.

    Args:
        node_id: Registry identifier.
        session: Session the request runs on.

    Returns:
        ``{version: reason}``, empty where the registry offered none.

    Raises:
        RegistryError: Where the registry did not answer.
    """
    key = f"reasons:{node_id}"
    hit = _cached(key)
    if hit is not None:
        return hit

    payload = await _get(
        session, f"{BASE_URL}/nodes/{node_id}/versions?include_status_reason=true"
    )
    rows = payload if isinstance(payload, list) else payload.get("versions", [])
    reasons = {}
    for row in rows:
        version = row.get("version", "")
        summary = _summarise_reason(row.get("status_reason", ""))
        if version and summary:
            reasons[version] = summary
    _cache[key] = (time.monotonic(), reasons)
    return reasons


#: Pages of node classes to follow before giving up. At 100 a page this is far more than any
#: real pack ships, and it stops a bad ``totalNumberOfPages`` turning one page view into an
#: unbounded crawl of someone else's server.
_NODE_PAGE_CAP = 8

#: How many node classes to ask for at once. The default page size is ten, which turns a large
#: pack into twenty-odd requests.
_NODE_PAGE_SIZE = 100


def _decoded_list(value) -> tuple[str, ...]:
    """A registry field that holds a JSON array inside a string.

    Args:
        value: The raw field, which may already be a list, a JSON string, or nothing.

    Returns:
        The entries as strings, empty where the field held nothing readable.
    """
    if isinstance(value, (list, tuple)):
        return tuple(str(one) for one in value)
    if not isinstance(value, str) or not value.strip():
        return ()
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return ()
    if isinstance(parsed, (list, tuple)):
        return tuple(str(one) for one in parsed)
    return ()


def _input_count(value) -> dict:
    """How many inputs a node class takes, split by whether they are required.

    Args:
        value: The raw ``input_types`` field, a JSON object inside a string.

    Returns:
        ``{"required": int, "optional": int}``, zeroes where nothing could be read.
    """
    raw = value
    if isinstance(raw, str):
        try:
            raw = json.loads(raw) if raw.strip() else {}
        except (TypeError, ValueError):
            raw = {}
    if not isinstance(raw, dict):
        return {"required": 0, "optional": 0}
    return {
        "required": len(raw.get("required") or {}),
        "optional": len(raw.get("optional") or {}),
    }


async def fetch_comfy_nodes(
    node_id: str, version: str, session: aiohttp.ClientSession
) -> tuple[dict, ...]:
    """The node classes one published version registers, as the registry recorded them.

    Roughly three packs in five have this filled in, so an empty answer means the registry was
    never told rather than that the pack adds no nodes. Callers have to say which of those two
    they are looking at, because "no nodes" and "nobody said" read very differently next to a
    pack you are deciding whether to install.

    Args:
        node_id: Registry identifier.
        version: Exact published version.
        session: Session the request runs on.

    Returns:
        One entry per node class: ``{name, category, description, deprecated, experimental,
        inputs, outputs}``. ``inputs`` is ``{required, optional}`` counts and ``outputs`` the
        socket types. Empty where the registry holds none.

    Raises:
        RegistryError: Where the registry did not answer.
    """
    key = f"comfynodes:{node_id}:{version}"
    hit = _cached(key)
    if hit is not None:
        return hit

    base = f"{BASE_URL}/nodes/{node_id}/versions/{version}/comfy-nodes"
    rows: list[dict] = []
    page = 1
    while page <= _NODE_PAGE_CAP:
        payload = await _get(session, f"{base}?page={page}&limit={_NODE_PAGE_SIZE}")
        found = (payload or {}).get("comfy_nodes") or []
        rows.extend(found)
        total = int((payload or {}).get("totalNumberOfPages") or 1)
        if page >= total or not found:
            break
        page += 1

    nodes = tuple(
        {
            "name": str(row.get("comfy_node_name") or ""),
            "category": str(row.get("category") or ""),
            "description": str(row.get("description") or ""),
            "deprecated": bool(row.get("deprecated")),
            "experimental": bool(row.get("experimental")),
            # The registry stores these JSON-encoded inside strings, so they have to be
            # decoded rather than iterated: a bare `for` over '["STRING"]' yields characters.
            "inputs": _input_count(row.get("input_types")),
            "outputs": _decoded_list(row.get("return_types")),
        }
        for row in rows
        if row.get("comfy_node_name")
    )
    _cache[key] = (time.monotonic(), nodes)
    return nodes


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
