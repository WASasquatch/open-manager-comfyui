"""HTTP routes serving registry data, findings and installs to the panel.

Every route sits under a versioned prefix, leaving room for a later revision beside it.
"""

from __future__ import annotations

import asyncio
import functools
import json
import os
import posixpath
import re
import sys
import time
from urllib.parse import unquote

import aiohttp
from aiohttp import web

from . import (
    catalog,
    compat,
    deps,
    developer,
    downloads,
    environment,
    health as pack_health,
    keys,
    impact,
    library,
    virustotal,
    installer,
    license_files,
    licenses,
    local as local_pack,
    log,
    metadata,
    models as model_policy,
    monitor,
    nodemap,
    registry,
    risk,
    selfupdate,
    sources,
    topics,
    trust,
)

__all__ = ["ALLOW_BANNED", "PREFIX", "register_routes"]

#: Every route this package serves sits below this versioned prefix.
PREFIX = "/open_manager/v1/api"

#: Most repositories one licence request may ask about.
LICENSE_BATCH = 200

#: Extensions a gallery image may carry. The bytes are checked too; this only rejects the
#: obvious before anything is fetched.
GALLERY_SUFFIXES = (
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif",
    ".mp4", ".webm", ".mov", ".m4v",
)

#: Largest gallery image served, in bytes.
GALLERY_CAP = 12_000_000

#: Branches listed for a repository.
REF_BRANCHES = 100

#: Recent commits listed for a repository.
REF_COMMITS = 20

#: Tags read. A tag is where a release was actually cut, which is the only thing in a
#: repository that corresponds to a published version -- a commit sha does not say what it is.
#: About a quarter of packs publish any, so this is often empty and that is not an error.
REF_TAGS = 100

#: Statuses blocked rather than warned about.
BLOCKED_STATUSES = ("banned",)

#: Whether a banned version installs for a host with no panel attached. The panel carries
#: its own answer on each request -- the "Install versions the registry has banned" setting
#: -- and this is the override for a headless or scripted install, where there is nobody to
#: ask. Either one lifts the block; neither silences the warning.
ALLOW_BANNED = os.environ.get("OPEN_MANAGER_ALLOW_BANNED", "").strip().lower() in (
    "1",
    "true",
    "yes",
)

logger = log.get_logger("routes")

_registered = False

#: Hosts allowed to trigger a server restart.
_LOOPBACK = ("127.0.0.1", "::1", "localhost")


def _model_folder_names() -> set:
    """Every folder a download may be written to."""
    return model_policy.folders()


#: Characters read from a linked document. Long enough for any README's companion page,
#: short enough that this is not a way to pull a repository through the panel.
DOC_LIMIT = 400_000

#: What a GitHub owner or repository name may contain. Used before either is put into a URL.
_GH_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")


def _json_body(handler):
    """Give a POST handler a parsed body, and the content-type guard it must not be without.

    Thirty-two routes opened with the same eight lines. That is thirty-two chances to leave
    one of them off, and the one that matters is a security control: without the content type
    check, a page on another site can post here without the browser asking first. ``/reboot``
    shipped without it once. A decorator is not a tidier way of writing those lines; it is the
    difference between remembering and not having to.

    The body is coerced to a dict here too. Fourteen handlers did that for themselves and nine
    went on to call ``body.get`` without it, so a JSON body that happened to be a list answered
    500 where it should have answered 400.

    Args:
        handler: Called as ``handler(request, body)``.

    Returns:
        A handler aiohttp can route to.
    """
    @functools.wraps(handler)
    async def wrapped(request: web.Request) -> web.Response:
        if not _is_json(request):
            return web.json_response(
                {"ok": False, "reason": "expected application/json"}, status=415)
        try:
            body = await request.json()
        except ValueError:
            return web.json_response(
                {"ok": False, "reason": "invalid request body"}, status=400)
        return await handler(request, body if isinstance(body, dict) else {})

    return wrapped


def _is_json(request: web.Request) -> bool:
    """Whether a request body claims to be JSON.

    A page on another site can post a body to this server without the browser asking
    permission first, but only while it avoids a JSON content type. Requiring one means a
    cross-origin caller has to ask, and gets to be refused. Nothing here reads a body that
    does not say what it is.
    """
    kind = (request.headers.get("Content-Type") or "").split(";")[0].strip().lower()
    return kind == "application/json"


def _download_workers(body: dict) -> int:
    """How many downloads to run at once, as the panel asked.

    Args:
        body: A decoded request body.

    Returns:
        A count. :func:`downloads.start` clamps it.
    """
    try:
        return int((body or {}).get("workers") or downloads.DEFAULT_WORKERS)
    except (TypeError, ValueError):
        return downloads.DEFAULT_WORKERS


def _github_headers(token: str) -> dict:
    """Headers for a GitHub API call, carrying the token where one is configured.

    Args:
        token: A GitHub token, or empty for an anonymous call.

    Returns:
        Request headers. A token lifts the hourly limit from 60 to 5,000.
    """
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "open-manager"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _flag(value) -> bool:
    """Read a boolean that may have arrived as a query string rather than as JSON.

    ``bool("false")`` is true, so query parameters cannot be trusted to ``bool`` directly.

    Args:
        value: A JSON boolean, or the text a query string carried.

    Returns:
        What the caller meant.
    """
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


def _license_options(source: dict) -> "license_files.Options":
    """How a licence lookup should run, from the panel's settings.

    Each of the three speed-ups is off unless the caller turns it on, so the default
    behaviour is what it was before they existed. The values are clamped by
    :class:`license_files.Options`.

    Args:
        source: A decoded request body, or a request's query parameters.

    Returns:
        The options to resolve with.
    """
    if not isinstance(source, dict):
        return license_files.Options()
    wanted = source.get("concurrency")
    try:
        concurrency = int(wanted) if wanted is not None else 8
    except (TypeError, ValueError):
        concurrency = 8
    return license_files.Options(
        concurrency=concurrency,
        race=_flag(source.get("race")),
        use_api=_flag(source.get("use_api")),
        token=str(source.get("token") or ""),
    )


def _reboot() -> None:
    """Re-exec the ComfyUI process with the same arguments it started with."""
    try:
        argv = sys.argv.copy()
        if "--windows-standalone-build" in argv:
            argv.remove("--windows-standalone-build")
        if "__COMFY_CLI_SESSION__" in os.environ:
            open(os.environ["__COMFY_CLI_SESSION__"] + ".reboot", "w").close()
            os._exit(0)
        if argv[0].endswith("__main__.py"):
            module = os.path.basename(os.path.dirname(argv[0]))
            command = [sys.executable, "-m", module] + argv[1:]
        elif sys.platform.startswith("win32"):
            command = ['"' + sys.executable + '"', '"' + argv[0] + '"'] + argv[1:]
        else:
            command = [sys.executable] + argv
        os.execv(sys.executable, command)
    except Exception as error:
        logger.error("restart failed (%s: %s)", type(error).__name__, error)


def _norm_repo(url: str) -> str:
    """Fold a repository URL for comparison: lowercased, no ``.git`` or trailing slash."""
    return re.sub(r"\.git$", "", (url or "").strip().lower().rstrip("/"))


def _fold(name: str) -> str:
    """Fold a pack or directory name for comparison: lowercased, separators unified."""
    return re.sub(r"[-_.]+", "-", (name or "").strip().lower())


#: Seconds a pack's version-status map is held before it is fetched again.
_STATUS_TTL = 600

#: node_id -> ({version: status}, fetched_at).
_status_cache: dict = {}


async def _installed_status(node_id: str, version: str, session: aiohttp.ClientSession) -> str:
    """The registry status of an installed version, e.g. ``flagged`` or ``banned``.

    Args:
        node_id: Registry identifier of the pack.
        version: Installed version.
        session: Session the request runs on.

    Returns:
        The short status, empty where it cannot be determined.
    """
    if not node_id or not re.match(r"^\d", version or ""):
        return ""
    now = time.time()
    hit = _status_cache.get(node_id)
    if not hit or now - hit[1] > _STATUS_TTL:
        try:
            versions = await registry.fetch_versions(node_id, session)
            table = {entry.version: entry.status for entry in versions}
        except registry.RegistryError:
            table = {}
        _status_cache[node_id] = (table, now)
        hit = (table, now)
    return (hit[0].get(version) or "").lower()


def _pack_file(repo: str, relative: str, cap: int) -> str:
    """A file read from the installed copy of a pack, empty where it is not installed.

    Args:
        repo: The pack's repository URL, matched against installed directories.
        relative: Path inside the pack, already checked for traversal.
        cap: Most characters returned.

    Returns:
        The file text, or an empty string.
    """
    owner_repo = metadata._owner_repo(repo)
    if owner_repo is None:
        return ""
    directory = installer.resolve_install_dir(owner_repo[1])
    if directory is None:
        return ""
    try:
        root = directory.resolve()
        target = (root / relative).resolve()
        if not target.is_file() or root not in target.parents:
            return ""
        return target.read_text(encoding="utf-8", errors="replace")[:cap]
    except OSError:
        return ""


def _pack_bytes(repo: str, relative: str, cap: int) -> bytes | None:
    """A file read as bytes from the installed copy of a pack.

    Args:
        repo: The pack's repository URL, matched against installed directories.
        relative: Path inside the pack, already checked for traversal.
        cap: Most bytes returned.

    Returns:
        The bytes, or ``None`` where the pack is not installed or holds no such file.
    """
    owner_repo = metadata._owner_repo(repo)
    if owner_repo is None:
        return None
    directory = installer.resolve_install_dir(owner_repo[1])
    if directory is None:
        return None
    try:
        root = directory.resolve()
        target = (root / relative).resolve()
        if not target.is_file() or root not in target.parents:
            return None
        with target.open("rb") as handle:
            return handle.read(cap)
    except OSError:
        return None


#: Leading bytes that identify each image type, as hex with the offset they sit at.
_IMAGE_MAGIC = (
    ("89504e470d0a1a0a", 0, "image/png"),
    ("ffd8ff", 0, "image/jpeg"),
    ("474946383761", 0, "image/gif"),
    ("474946383961", 0, "image/gif"),
)


def _image_type(data: bytes) -> str:
    """The content type of an image, from its leading bytes.

    The bytes are sniffed rather than the extension trusted, because this is served from
    ComfyUI's own origin: a pack that listed markup or a script would otherwise have it run
    with the page's privileges.

    Args:
        data: Start of the file.

    Returns:
        An image content type, or empty where the bytes are not one.
    """
    for prefix, offset, kind in _IMAGE_MAGIC:
        raw = bytes.fromhex(prefix)
        if data[offset:offset + len(raw)] == raw:
            return kind
    # RIFF and ISO-BMFF carry their marker after a length, so they are matched by span.
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand in (b"avif", b"avis", b"mif1"):
            return "image/avif"
        # An ISO-BMFF clip: same container family, different brand.
        if brand in (b"isom", b"iso2", b"mp41", b"mp42", b"avc1", b"M4V ", b"qt  "):
            return "video/quicktime" if brand == b"qt  " else "video/mp4"
    # Matroska, which is what a WebM clip is.
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return "video/webm"
    return ""


def _local_developer(repo: str) -> dict:
    """The ``[tool.open_manager]`` table from the installed copy of a pack.

    Args:
        repo: The pack's repository URL.

    Returns:
        The declared table, empty where the pack is not installed or declares none.
    """
    table = developer.from_pyproject(_pack_file(repo, "pyproject.toml", 400_000))
    # Expanded even where the pack declares no table: reading an installed directory costs
    # nothing, so the conventional workflow directories are worth offering regardless. The
    # remote path is stricter, because there a listing costs a GitHub call.
    lister = _pack_lister(repo)
    return developer.expand(table, lister) if lister(".") else table


def _pack_lister(repo: str):
    """A lister for :func:`developer.expand`, reading the installed copy of a pack.

    Args:
        repo: The pack's repository URL.

    Returns:
        A callable taking a directory and returning the pack-relative paths below it.
    """
    owner_repo = metadata._owner_repo(repo)
    directory = installer.resolve_install_dir(owner_repo[1]) if owner_repo else None

    def listing(folder: str) -> list[str]:
        if directory is None:
            return []
        try:
            root = directory.resolve()
            base = (root / (folder or ".")).resolve()
            # Same containment rule as _pack_file: a pattern may not climb out of the pack.
            if not base.is_dir() or not (base == root or base.is_relative_to(root)):
                return []
            return [
                posixpath.join(*child.relative_to(root).parts)
                for child in sorted(base.rglob("*")) if child.is_file()
            ]
        except OSError:
            return []

    return listing


def _looks_like_theme(data) -> bool:
    """Whether decoded JSON is a colour palette.

    Args:
        data: A decoded JSON value.

    Returns:
        True where it carries an id and at least one recognised colour group.
    """
    if not isinstance(data, dict) or not data.get("id"):
        return False
    colors = data.get("colors")
    if not isinstance(colors, dict):
        return False
    return any(isinstance(colors.get(group), dict) for group in ("node_slot", "litegraph_base", "comfy_base"))


def _looks_like_workflow(data) -> bool:
    """Whether decoded JSON is a ComfyUI workflow rather than arbitrary data.

    Args:
        data: A decoded JSON value.

    Returns:
        True for a litegraph workflow, an app wrapper, or a prompt-format graph.
    """
    if not isinstance(data, dict) or not data:
        return False
    if isinstance(data.get("nodes"), list):
        return True
    if isinstance(data.get("workflow"), dict):
        return True
    return all(isinstance(value, dict) and "class_type" in value for value in data.values())


async def _pack_by_repo(repo_url: str, session: aiohttp.ClientSession) -> dict | None:
    """Find the registry pack whose repository matches, by searching the registry.

    A result is accepted only where its ``repository`` field matches the one asked for.

    Args:
        repo_url: The repository URL from the node index.
        session: Session the search runs on.

    Returns:
        The matching search entry, or ``None``.
    """
    name = nodemap.repo_name(repo_url)
    if not name:
        return None
    want = _norm_repo(repo_url)
    try:
        entries, _total = await registry.search(name, session, limit=30, page=1)
    except registry.RegistryError:
        return None
    for entry in entries:
        if _norm_repo(entry.get("repository")) == want:
            return entry
    return None


def _installable(status: str, allowed: bool = False) -> tuple[bool, str]:
    """Whether a version may be installed, and why not where it may not.

    Args:
        status: Short registry status.
        allowed: Whether the caller has turned the ban block off for this request.

    Returns:
        ``(installable, reason)``. ``reason`` is empty where the version installs.
    """
    if status in BLOCKED_STATUSES and not (allowed or ALLOW_BANNED):
        return False, (
            "The registry banned this version, so it is withheld by default. Bans are "
            "meant for harmful releases, and the registry's automated scanner also issues "
            "them for reasons it does not publish. Turn on Open Manager's 'Install "
            "versions the registry has banned' setting to decide for yourself."
        )
    return True, ""


def _finding_json(finding: risk.Finding) -> dict:
    """One finding as the panel draws it."""
    return {
        "severity": finding.severity,
        "title": finding.title,
        "detail": finding.detail,
        "evidence": list(finding.evidence),
        "reference": finding.reference,
    }


def _assessment_json(assessment: risk.Assessment) -> dict:
    """One assessment as the panel draws it."""
    return {
        "severity": assessment.severity,
        "clean": assessment.is_clean,
        "acknowledgement": assessment.acknowledgement,
        "findings": [_finding_json(item) for item in assessment.findings],
    }


def _version_json(entry: registry.NodeVersion, pack_id: str, allow_banned: bool = False) -> dict:
    """One version, with everything worth saying about installing it.

    Args:
        entry: The published version.
        pack_id: Registry identifier of the pack it belongs to.
        allow_banned: Whether the reader has turned the ban block off. It decides whether a
            banned version comes back installable; the findings against it are the same
            either way.

    Returns:
        The version as the panel draws it.
    """
    fit = compat.check(
        supported_comfyui=entry.supported_comfyui,
        supported_frontend=entry.supported_frontend,
        supported_os=entry.supported_os,
        supported_accelerators=entry.supported_accelerators,
    )
    assessment = risk.assess_version(
        pack_id=pack_id,
        version=entry.version,
        status=entry.status,
        dependencies=entry.dependencies,
        deprecated=entry.deprecated,
        compatibility=fit,
    )
    installable, blocked_reason = _installable(entry.status, allow_banned)
    return {
        "version": entry.version,
        "status": entry.status,
        "created_at": entry.created_at,
        "deprecated": entry.deprecated,
        # Publisher text. It reaches the page as text and is never parsed as markup there.
        "changelog": entry.changelog,
        "compatibility": fit,
        "download_url": entry.download_url,
        "dependencies": list(entry.dependencies),
        "installable": installable,
        "blocked_reason": blocked_reason,
        "assessment": _assessment_json(assessment),
    }


def register_routes() -> None:
    """Attach the routes to the running server. Safe to call more than once."""
    global _registered
    if _registered:
        return

    from server import PromptServer

    @PromptServer.instance.routes.get(f"{PREFIX}/pack/" + "{node_id}")
    async def pack(request: web.Request) -> web.Response:
        """Answer a pack's record and every published version, whatever its status."""
        node_id = request.match_info.get("node_id", "")
        if not node_id:
            return web.json_response({"error": "no pack named"}, status=400)

        # Whether a banned version comes back installable is the reader's setting, so it
        # travels with the request rather than being remembered here. The page is then the
        # only place that answer lives, and turning the setting off cannot leave a server
        # still handing out installable bans.
        allow_banned = _flag(request.query.get("allow_banned", False))

        async with aiohttp.ClientSession() as session:
            try:
                record = await registry.fetch_node(node_id, session)
                versions = await registry.fetch_versions(node_id, session)
            except registry.RegistryError as error:
                # A refusal and an outage are reported apart.
                return web.json_response(
                    {
                        "error": "registry",
                        "status": error.status,
                        "detail": error.detail,
                        "pack": node_id,
                    },
                    status=502,
                )

            # A file-referenced or absent registry licence is read from the repository, under
            # a time bound.
            lic_name = record.license
            lic = licenses.classify(lic_name)
            if lic["tier"] == "unknown" and record.repository:
                try:
                    resolved = await asyncio.wait_for(
                        license_files.resolve(
                            record.repository, session, _license_options(dict(request.query))
                        ),
                        timeout=8,
                    )
                except (asyncio.TimeoutError, aiohttp.ClientError):
                    resolved = ""
                if resolved:
                    lic_name = resolved
                    lic = licenses.classify(resolved)

        resolution = registry.resolve_versions(versions)
        return web.json_response(
            {
                "pack": {
                    "id": record.node_id,
                    "name": record.name,
                    "description": record.description,
                    "publisher": record.publisher,
                    "publisher_name": record.publisher_name,
                    "publisher_members": list(record.publisher_members),
                    "publisher_status": record.publisher_status,
                    "status": record.status,
                    "repository": record.repository,
                    "icon": record.icon,
                    "banner": record.banner,
                    "downloads": record.downloads,
                    "stars": record.stars,
                    "author": record.author,
                    "category": record.category,
                    "license": lic_name,
                    "license_tier": lic["tier"],
                    "license_color": lic["color"],
                    "tags": list(record.tags),
                    "created_at": record.created_at,
                    "installed_version": installer.installed_version(record.node_id),
                },
                "resolution": {
                    "newest": resolution.newest.version if resolution.newest else "",
                    "latest_active": (
                        resolution.latest_active.version if resolution.latest_active else ""
                    ),
                    "registry_advertises": record.latest_active,
                    "newest_is_hidden": resolution.newest_is_hidden,
                    "withheld": [entry.version for entry in resolution.withheld],
                    "assessment": _assessment_json(
                        risk.assess_resolution(
                            advertised=record.latest_active,
                            newest=resolution.newest.version if resolution.newest else "",
                            newest_status=resolution.newest.status if resolution.newest else "",
                            withheld=[entry.version for entry in resolution.withheld],
                        )
                    ),
                },
                "versions": [
                    _version_json(entry, record.node_id, allow_banned) for entry in versions
                ],
            }
        )

    @PromptServer.instance.routes.get(f"{PREFIX}/readme/" + "{node_id}")
    async def readme(request: web.Request) -> web.Response:
        """Answer a pack's README and repository metadata, cached until its versions change."""
        node_id = request.match_info.get("node_id", "")
        async with aiohttp.ClientSession() as session:
            try:
                record = await registry.fetch_node(node_id, session)
                versions = await registry.fetch_versions(node_id, session)
            except registry.RegistryError as error:
                return web.json_response(
                    {"error": "registry", "status": error.status, "detail": error.detail},
                    status=502,
                )
            sig = metadata.signature(versions)
            meta = await metadata.fetch(
                node_id, record.repository, sig, session, keys.secret("github")
            )
        payload = meta.to_json()
        payload["repository"] = record.repository
        # An installed pack's own pyproject describes the copy in use and wins over the
        # repository's.
        payload["developer"] = _local_developer(record.repository) or payload.get("developer") or {}
        payload["incompatible"] = developer.resolve_incompatible(
            payload["developer"].get("incompatible", [])
        )
        return web.json_response(payload)

    @PromptServer.instance.routes.get(f"{PREFIX}/media")
    async def readme_media(request: web.Request) -> web.Response:
        """Signed URLs for the attachments a README embeds.

        Never cached: GitHub mints these with a five minute window, so a stored one is worse
        than none. The reply carries that window so the panel can ask again.
        """
        repo = request.query.get("repo", "")
        if not repo:
            return web.json_response({"ok": False, "reason": "repo is required"}, status=400)
        async with aiohttp.ClientSession() as session:
            found = await metadata.attachment_media(repo, session, keys.secret("github"))
        return web.json_response({"ok": True, "media": found, "ttl": metadata.MEDIA_TTL})

    @PromptServer.instance.routes.get(f"{PREFIX}/repo-meta")
    async def repo_meta(request: web.Request) -> web.Response:
        """Answer a repository's README and support fields for a pack matched from GitHub.

        The licence is classified from what the repository declares.
        """
        repo = request.query.get("repo", "")
        if not repo:
            return web.json_response({"error": "no repository named"}, status=400)
        async with aiohttp.ClientSession() as session:
            meta = await metadata.fetch_repo(repo, session, token=keys.secret("github"))
        payload = meta.to_json()
        payload["repository"] = repo
        info = licenses.classify(meta.license)
        payload["license_tier"] = info["tier"]
        payload["license_color"] = info["color"]
        payload["developer"] = _local_developer(repo) or payload.get("developer") or {}
        payload["incompatible"] = developer.resolve_incompatible(
            payload["developer"].get("incompatible", [])
        )
        return web.json_response(payload)

    @PromptServer.instance.routes.get(f"{PREFIX}/workflow")
    async def example_workflow(request: web.Request) -> web.Response:
        """Download a pack's example workflow file and return it once it parses as one.

        The pack declares these in ``[tool.open_manager] example_workflows``. The file is
        read from the installed copy, or from the repository where the pack is not
        installed, and is returned only where it parses as a workflow.
        """
        repo = request.query.get("repo", "")
        branch = request.query.get("branch", "")
        path = request.query.get("path", "")
        clean = path.strip().lstrip("/")
        if (
            not clean
            or ".." in clean
            or "\\" in clean
            or len(clean) > 300
            or not clean.lower().endswith((".json", ".app.json"))
        ):
            return web.json_response({"ok": False, "reason": "invalid workflow path"}, status=400)
        owner_repo = metadata._owner_repo(repo)
        if owner_repo is None:
            return web.json_response({"ok": False, "reason": "not a GitHub repository"}, status=400)
        owner, name = owner_repo

        text = _pack_file(repo, clean, 8_000_000)
        if not text:
            async with aiohttp.ClientSession() as session:
                for candidate in (branch, "main", "Main", "master"):
                    if not candidate:
                        continue
                    url = f"https://raw.githubusercontent.com/{owner}/{name}/{candidate}/{clean}"
                    try:
                        async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as answer:
                            if answer.status == 200:
                                text = (await answer.text())[:8_000_000]
                                break
                    except (aiohttp.ClientError, TimeoutError):
                        continue
        if not text:
            return web.json_response({"ok": False, "reason": "workflow not found in the repository"}, status=404)
        try:
            data = json.loads(text)
        except ValueError:
            return web.json_response({"ok": False, "reason": "the file is not valid JSON"}, status=422)
        if not _looks_like_workflow(data):
            return web.json_response({"ok": False, "reason": "the file is not a ComfyUI workflow"}, status=422)
        return web.json_response({"ok": True, "workflow": data})

    @PromptServer.instance.routes.get(f"{PREFIX}/theme")
    async def pack_theme(request: web.Request) -> web.Response:
        """Download a theme a pack ships and return it once it parses as a palette.

        The pack declares these in ``[tool.open_manager] themes``. The file is read from
        the installed copy, or from the repository where the pack is not installed, and
        is returned only where it parses as a colour palette.
        """
        repo = request.query.get("repo", "")
        branch = request.query.get("branch", "")
        path = request.query.get("path", "")
        clean = path.strip().lstrip("/")
        if (
            not clean
            or ".." in clean
            or "\\" in clean
            or len(clean) > 300
            or not clean.lower().endswith(".json")
        ):
            return web.json_response({"ok": False, "reason": "invalid theme path"}, status=400)
        owner_repo = metadata._owner_repo(repo)
        if owner_repo is None:
            return web.json_response({"ok": False, "reason": "not a GitHub repository"}, status=400)
        owner, name = owner_repo

        text = _pack_file(repo, clean, 1_000_000)
        if not text:
            async with aiohttp.ClientSession() as session:
                for candidate in (branch, "main", "Main", "master"):
                    if not candidate:
                        continue
                    url = f"https://raw.githubusercontent.com/{owner}/{name}/{candidate}/{clean}"
                    try:
                        async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as answer:
                            if answer.status == 200:
                                text = (await answer.text())[:1_000_000]
                                break
                    except (aiohttp.ClientError, TimeoutError):
                        continue
        if not text:
            return web.json_response({"ok": False, "reason": "theme not found in the repository"}, status=404)
        try:
            data = json.loads(text)
        except ValueError:
            return web.json_response({"ok": False, "reason": "the file is not valid JSON"}, status=422)
        if not _looks_like_theme(data):
            return web.json_response({"ok": False, "reason": "the file is not a colour palette"}, status=422)
        return web.json_response({"ok": True, "theme": data})

    @PromptServer.instance.routes.post(f"{PREFIX}/scan")
    @_json_body
    async def start_scan(request: web.Request, body: dict) -> web.Response:
        """Begin a reputation scan of an installed pack.

        The key arrives in the body rather than the query string, because a query string is
        the part that reaches proxy and server logs. It is passed to the scan and kept
        nowhere else.
        """
        if not isinstance(body, dict):
            return web.json_response({"ok": False, "reason": "invalid request body"}, status=400)
        key = keys.secret("virustotal")
        pack_id = str(body.get("id") or "").strip()
        if not key:
            return web.json_response({"ok": False, "reason": "no VirusTotal key set"}, status=400)
        if not pack_id:
            return web.json_response({"ok": False, "reason": "no pack named"}, status=400)
        directory = installer.resolve_install_dir(pack_id)
        if directory is None:
            return web.json_response({"ok": False, "reason": f"{pack_id} is not installed"}, status=404)
        asyncio.get_running_loop().create_task(
            virustotal.scan(pack_id, directory, key)
        )
        return web.json_response({"ok": True, **virustotal.state()})

    @PromptServer.instance.routes.get(f"{PREFIX}/scan/state")
    async def scan_state(_request: web.Request) -> web.Response:
        """How the running scan is going, and what it has found."""
        return web.json_response(virustotal.state())

    @PromptServer.instance.routes.post(f"{PREFIX}/install-requirements")
    @_json_body
    async def install_requirements(request: web.Request, body: dict) -> web.Response:
        """Install a pack's requirements after the fact.

        Used where the requirements were deferred so the pack could be scanned first.
        """
        pack_id = str((body or {}).get("id") or "").strip()
        if not pack_id:
            return web.json_response({"ok": False, "reason": "no pack named"}, status=400)
        directory = installer.resolve_install_dir(pack_id)
        if directory is None:
            return web.json_response({"ok": False, "reason": f"{pack_id} is not installed"}, status=404)
        ok, output = await asyncio.to_thread(installer.install_requirements, directory, ""
        )
        return web.json_response({"ok": ok, "output": output})

    @PromptServer.instance.routes.get(f"{PREFIX}/status-reasons/" + "{node_id}")
    async def status_reasons(request: web.Request) -> web.Response:
        """Why each version of a pack carries the status it does.

        The registry only returns these when asked and answers in megabytes, so the reading
        and the summarising both happen here; what travels on is a sentence per version.
        """
        node_id = request.match_info.get("node_id", "")
        if not node_id:
            return web.json_response({"ok": False, "reason": "no pack named"}, status=400)
        async with aiohttp.ClientSession() as session:
            try:
                reasons = await registry.fetch_status_reasons(node_id, session)
            except registry.RegistryError as error:
                return web.json_response(
                    {"ok": False, "reason": error.detail or "the registry did not answer"},
                    status=502,
                )
        return web.json_response({"ok": True, "reasons": reasons})

    @PromptServer.instance.routes.get(f"{PREFIX}/comfy-nodes/" + "{node_id}")
    async def comfy_nodes(request: web.Request) -> web.Response:
        """The node classes one published version of a pack registers.

        Asked for only when a reader opens the section, because it is a separate request per
        version and most readers never want it. ``known`` distinguishes a pack the registry
        was never told about from one that genuinely adds no nodes.
        """
        node_id = request.match_info.get("node_id", "")
        version = (request.query.get("version") or "").strip()
        if not node_id or not version:
            return web.json_response(
                {"ok": False, "reason": "a pack and a version are both needed"}, status=400)
        async with aiohttp.ClientSession() as session:
            try:
                nodes = await registry.fetch_comfy_nodes(node_id, version, session)
            except registry.RegistryError as error:
                return web.json_response(
                    {"ok": False, "reason": error.detail or "the registry did not answer"},
                    status=502,
                )
        return web.json_response({"ok": True, "known": bool(nodes), "nodes": list(nodes)})

    @PromptServer.instance.routes.get(f"{PREFIX}/environment")
    async def environment_changes(_request: web.Request) -> web.Response:
        """What recent installs did to the Python environment, newest first.

        Each entry carries the plan that would undo it, so the interface can say exactly what
        a restore would run without asking again.
        """
        entries = await asyncio.to_thread(environment.recorded)
        for entry in entries:
            entry["plan"] = environment.restore_plan(entry.get("diff") or {})
        return web.json_response({"ok": True, "entries": entries})

    @PromptServer.instance.routes.post(f"{PREFIX}/environment/restore")
    @_json_body
    async def environment_restore(request: web.Request, body: dict) -> web.Response:
        """Put the packages back as they were before one install.

        Destructive, so it runs nothing unless ``confirm`` is true. Without it the plan is
        returned and the environment is untouched, which is what the interface shows the
        reader before asking.
        """

        entry_id = str(body.get("id", "")).strip()
        entry = next((one for one in environment.recorded() if one.get("id") == entry_id), None)
        if entry is None:
            return web.json_response(
                {"ok": False, "reason": "no record of that install"}, status=404)

        diff = entry.get("diff") or {}
        plan = environment.restore_plan(diff)
        if not body.get("confirm"):
            return web.json_response({"ok": True, "preview": True, "entry": entry, "plan": plan})

        # The record is dropped whatever the outcome. A half-applied restore describes an
        # environment that is no longer the one the record was taken against, so offering to
        # run it again would be undoing something that is not there any more.
        outcome = await asyncio.to_thread(environment.restore, diff)
        await asyncio.to_thread(environment.forget, entry_id)
        return web.json_response({"ok": outcome["ok"], "preview": False, **outcome},
                                 status=200 if outcome["ok"] else 500)

    @PromptServer.instance.routes.post(f"{PREFIX}/environment/forget")
    @_json_body
    async def environment_forget(request: web.Request, body: dict) -> web.Response:
        """Drop a record without acting on it."""
        gone = await asyncio.to_thread(environment.forget, str(body.get("id", "")))
        return web.json_response({"ok": gone})

    @PromptServer.instance.routes.get(f"{PREFIX}/local/" + "{node_id}")
    async def local_describe(request: web.Request) -> web.Response:
        """What can be read about an installed pack from the copy on disk.

        For packs the registry has never heard of: one written locally, one whose entry was
        pulled, one placed by hand. Everything comes from files the pack already ships, so
        this answers without reaching the network at all.
        """
        node_id = request.match_info.get("node_id", "")
        if not node_id:
            return web.json_response({"ok": False, "reason": "no pack named"}, status=400)
        found = await asyncio.to_thread(local_pack.describe, node_id)
        return web.json_response(found, status=200 if found.get("ok") else 404)

    @PromptServer.instance.routes.get(f"{PREFIX}/topic")
    async def topic_search(request: web.Request) -> web.Response:
        """Which packs carry a GitHub topic.

        The registry does not index topics, so this asks GitHub and narrows the answer to the
        catalogue. Always 200 where the topic itself was well formed: a topic nothing carries
        is an empty list, not an error.
        """
        name = (request.query.get("name") or "").strip()
        async with aiohttp.ClientSession() as session:
            answer = await topics.packs_for(name, session)
        return web.json_response(answer, status=200 if answer.get("ok") else 502)

    @PromptServer.instance.routes.get(f"{PREFIX}/refs")
    async def repo_refs(request: web.Request) -> web.Response:
        """List a repository's branches, tags and most recent commits.

        Asked for only when the picker is opened rather than on every pack page. A token
        lifts the hourly limit that otherwise applies.
        """
        repo = request.query.get("repo", "")
        token = keys.secret("github")
        owner_repo = metadata._owner_repo(repo)
        if owner_repo is None:
            return web.json_response({"ok": False, "reason": "not a GitHub repository"}, status=400)
        owner, name = owner_repo
        headers = _github_headers(token)

        async def read(url: str):
            try:
                async with session.get(
                    url, headers=headers, timeout=aiohttp.ClientTimeout(total=15)
                ) as answer:
                    if answer.status != 200:
                        return None, answer.status
                    return await answer.json(), 200
            except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
                return None, 0

        async with aiohttp.ClientSession() as session:
            info, _ = await read(f"https://api.github.com/repos/{owner}/{name}")
            branches, status = await read(
                f"https://api.github.com/repos/{owner}/{name}/branches?per_page={REF_BRANCHES}"
            )
            commits, _ = await read(
                f"https://api.github.com/repos/{owner}/{name}/commits?per_page={REF_COMMITS}"
            )
            tags, _ = await read(
                f"https://api.github.com/repos/{owner}/{name}/tags?per_page={REF_TAGS}"
            )

        if branches is None and commits is None:
            reason = (
                "GitHub's hourly limit is spent; set a GitHub token in settings to raise it"
                if status == 403
                else "the repository's refs could not be read"
            )
            return web.json_response({"ok": False, "reason": reason}, status=502)

        return web.json_response({
            "ok": True,
            "default_branch": (info or {}).get("default_branch", "") or "",
            "branches": [
                {"name": b.get("name", ""), "sha": (b.get("commit") or {}).get("sha", "")[:7]}
                for b in (branches or []) if b.get("name")
            ],
            "tags": [
                {"name": t.get("name", ""), "sha": (t.get("commit") or {}).get("sha", "")[:7]}
                for t in (tags or []) if t.get("name")
            ],
            "commits": [
                {
                    "sha": c.get("sha", ""),
                    "short": c.get("sha", "")[:7],
                    "message": ((((c.get("commit") or {}).get("message", "") or "")
                                 .splitlines() or [""])[0])[:120],
                    "date": ((c.get("commit") or {}).get("author") or {}).get("date", "") or "",
                }
                for c in (commits or []) if c.get("sha")
            ],
        })

    @PromptServer.instance.routes.get(f"{PREFIX}/readme-at")
    async def readme_at(request: web.Request) -> web.Response:
        """Read a pack's README and declared table at one branch or commit.

        Only the raw content host is read, so switching ref costs nothing against the API's
        hourly limit and still works once that limit is spent.
        """
        repo = request.query.get("repo", "")
        ref = request.query.get("ref", "")
        owner_repo = metadata._owner_repo(repo)
        if owner_repo is None:
            return web.json_response({"ok": False, "reason": "not a GitHub repository"}, status=400)
        if not metadata.valid_ref(ref):
            return web.json_response({"ok": False, "reason": "invalid ref"}, status=400)
        async with aiohttp.ClientSession() as session:
            payload = await metadata.read_at_ref(owner_repo[0], owner_repo[1], ref, session)
        if not payload["readme"] and not payload["developer"]:
            return web.json_response(
                {"ok": False, "reason": f"nothing to read at {ref}"}, status=404
            )
        return web.json_response({"ok": True, "ref": ref, **payload})

    @PromptServer.instance.routes.get(f"{PREFIX}/gallery-image")
    async def gallery_image(request: web.Request) -> web.Response:
        """Serve one image a pack lists in ``[tool.open_manager] gallery``.

        The image comes from the installed copy where the pack is installed, and from the
        repository where it is not. Entries that are already absolute URLs never reach here:
        the panel points the browser straight at them.

        Only bytes that are recognisably an image or a clip are returned, and they are served
        with the type those bytes say they are, so a pack cannot place markup on ComfyUI's
        origin.
        """
        repo = request.query.get("repo", "")
        branch = request.query.get("branch", "")
        path = request.query.get("path", "")
        clean = path.strip().lstrip("/")
        if (
            not clean
            or ".." in clean
            or "\\" in clean
            or len(clean) > 300
            or not clean.lower().endswith(GALLERY_SUFFIXES)
        ):
            return web.json_response({"ok": False, "reason": "invalid image path"}, status=400)
        owner_repo = metadata._owner_repo(repo)
        if owner_repo is None:
            return web.json_response({"ok": False, "reason": "not a GitHub repository"}, status=400)
        owner, name = owner_repo

        data = _pack_bytes(repo, clean, GALLERY_CAP)
        if not data:
            async with aiohttp.ClientSession() as session:
                for candidate in (branch, "main", "Main", "master"):
                    if not candidate:
                        continue
                    url = f"https://raw.githubusercontent.com/{owner}/{name}/{candidate}/{clean}"
                    try:
                        async with session.get(
                            url, timeout=aiohttp.ClientTimeout(total=20)
                        ) as answer:
                            if answer.status == 200:
                                # read(n) returns only what has arrived, so the body is
                                # gathered in chunks and stopped at the cap instead.
                                chunks: list[bytes] = []
                                total = 0
                                async for chunk in answer.content.iter_chunked(65536):
                                    chunks.append(chunk)
                                    total += len(chunk)
                                    if total >= GALLERY_CAP:
                                        break
                                data = b"".join(chunks)[:GALLERY_CAP]
                                break
                    except (aiohttp.ClientError, TimeoutError):
                        continue
        if not data:
            return web.json_response(
                {"ok": False, "reason": "image not found in the repository"}, status=404
            )
        kind = _image_type(data)
        if not kind:
            return web.json_response(
                {"ok": False, "reason": "the file is not an image or a clip"}, status=422
            )
        return web.Response(
            body=data,
            content_type=kind,
            headers={
                "Cache-Control": "public, max-age=86400",
                "X-Content-Type-Options": "nosniff",
                "Content-Disposition": "inline",
            },
        )

    @PromptServer.instance.routes.get(f"{PREFIX}/trust")
    async def trusted_authors(request: web.Request) -> web.Response:
        """Whether one owner is trusted, or the whole list where none is named."""
        owner = request.query.get("owner", "").strip()
        kind = request.query.get("kind", "packs").strip() or "packs"
        if owner:
            return web.json_response(
                {"owner": owner, "kind": kind, "trusted": trust.is_trusted(owner, kind)}
            )
        return web.json_response({"kind": kind, "authors": trust.listing(kind)})

    @PromptServer.instance.routes.post(f"{PREFIX}/trust")
    @_json_body
    async def set_trust(request: web.Request, body: dict) -> web.Response:
        """Add or remove an owner from the trusted list."""
        owner = str((body or {}).get("owner") or "").strip()
        if not owner or len(owner) > 100:
            return web.json_response({"ok": False, "reason": "owner is required"}, status=400)
        kind = str((body or {}).get("kind") or "packs")
        wanted = _flag((body or {}).get("trusted", True))
        ok = trust.record(owner, kind) if wanted else trust.forget(owner, kind)
        return web.json_response(
            {"ok": ok, "owner": owner, "kind": kind, "trusted": wanted and ok}
        )

    @PromptServer.instance.routes.get(f"{PREFIX}/downloads")
    async def list_downloads(_request: web.Request) -> web.Response:
        """Every download and how far along it is."""
        await downloads.start(downloads.DEFAULT_WORKERS)
        return web.json_response(downloads.state())

    @PromptServer.instance.routes.post(f"{PREFIX}/downloads")
    @_json_body
    async def queue_download(request: web.Request, body: dict) -> web.Response:
        """Put one model on the queue, or say why it cannot go on.

        The policy in :mod:`.models` decides what may be fetched and where it may land; this
        only carries the answer back. A model already on disk is refused once, with the path
        it is at, so the panel can ask before replacing it.
        """
        result = downloads.add(
            str(body.get("url") or ""),
            str(body.get("name") or ""),
            str(body.get("directory") or ""),
            str(body.get("source") or ""),
            str(body.get("hash") or ""),
            str(body.get("hash_type") or ""),
            _flag(body.get("overwrite", False)),
            str(body.get("root") or ""),
        )
        if not result.get("ok"):
            return web.json_response(result, status=400)
        await downloads.start(_download_workers(body))
        downloads.enqueue(result["id"])
        return web.json_response(result)

    @PromptServer.instance.routes.get(f"{PREFIX}/holds")
    async def list_holds(_request: web.Request) -> web.Response:
        """Every pack being held at its installed version."""
        return web.json_response({"ok": True, "holds": pack_health.holds()})

    @PromptServer.instance.routes.post(f"{PREFIX}/hold")
    @_json_body
    async def set_hold(request: web.Request, body: dict) -> web.Response:
        """Hold a pack at its installed version, or stop holding it.

        Nothing on disk changes either way. A hold only decides whether an update is offered.
        """
        name = str(body.get("name") or "")
        if _flag(body.get("off", False)):
            return web.json_response(pack_health.release(name))
        return web.json_response(pack_health.hold(name, str(body.get("version") or "")))

    @PromptServer.instance.routes.post(f"{PREFIX}/star")
    @_json_body
    async def star_repo(request: web.Request, body: dict) -> web.Response:
        """Read or set whether the reader has starred a repository.

        Made here rather than from the page because the token lives here. The panel used to
        call GitHub directly, which meant the browser had to hold the token to do it.
        """
        owner_repo = metadata._owner_repo(str(body.get("repo") or ""))
        if owner_repo is None:
            return web.json_response(
                {"ok": False, "reason": "not a GitHub repository"}, status=400)
        owner, name = owner_repo
        # The two halves go into a URL, so they are held to what a GitHub name may contain
        # rather than trusted because they came from a parser.
        if not (_GH_NAME.match(owner) and _GH_NAME.match(name)):
            return web.json_response(
                {"ok": False, "reason": "not a GitHub repository"}, status=400)
        token = keys.secret("github")
        if not token:
            return web.json_response(
                {"ok": False, "reason": "no GitHub token set", "need_key": True}, status=400)

        url = f"https://api.github.com/user/starred/{owner}/{name}"
        headers = {"Authorization": f"Bearer {token}",
                   "Accept": "application/vnd.github+json",
                   "User-Agent": "open-manager"}
        want = str(body.get("action") or "check")
        method = {"check": "GET", "star": "PUT", "unstar": "DELETE"}.get(want)
        if method is None:
            return web.json_response({"ok": False, "reason": "unknown action"}, status=400)
        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    method, url, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=20),
                ) as answer:
                    if method == "GET":
                        return web.json_response({"ok": True, "starred": answer.status == 204})
                    if answer.status != 204:
                        return web.json_response(
                            {"ok": False, "reason": f"GitHub answered {answer.status}"},
                            status=502)
                    return web.json_response({"ok": True, "starred": want == "star"})
        except (aiohttp.ClientError, TimeoutError) as error:
            return web.json_response(
                {"ok": False, "reason": str(error)[:120]}, status=502)

    @PromptServer.instance.routes.get(f"{PREFIX}/doc")
    async def pack_doc(request: web.Request) -> web.Response:
        """One markdown file from a pack, for a README that links its own documentation.

        Read from the installed copy where the pack is installed, and from the repository
        where it is not. Markdown only: this is for following a link a README made, not a way
        to read arbitrary files out of a repository.
        """
        path_asked = request.query.get("path", "")
        clean = path_asked.strip().lstrip("/")
        if (
            not clean
            or ".." in clean
            or "\\" in clean
            or len(clean) > 300
            or not clean.lower().endswith((".md", ".markdown"))
        ):
            return web.json_response({"ok": False, "reason": "invalid document path"}, status=400)
        repo = request.query.get("repo", "")
        owner_repo = metadata._owner_repo(repo)
        if owner_repo is None:
            return web.json_response(
                {"ok": False, "reason": "not a GitHub repository"}, status=400)
        owner, name = owner_repo

        text = _pack_file(repo, clean, DOC_LIMIT)
        if not text:
            branch = request.query.get("branch", "")
            async with aiohttp.ClientSession() as session:
                for candidate in (branch, "main", "Main", "master"):
                    if not candidate:
                        continue
                    url = (f"https://raw.githubusercontent.com/{owner}/{name}/"
                           f"{candidate}/{clean}")
                    try:
                        async with session.get(
                            url, timeout=aiohttp.ClientTimeout(total=20)
                        ) as answer:
                            if answer.status == 200:
                                text = (await answer.text())[:DOC_LIMIT]
                                break
                    except (aiohttp.ClientError, TimeoutError):
                        continue
        if not text:
            return web.json_response(
                {"ok": False, "reason": "no such document in the repository"}, status=404)
        return web.json_response({"ok": True, "path": clean, "text": text})

    @PromptServer.instance.routes.get(f"{PREFIX}/keys")
    async def list_keys(_request: web.Request) -> web.Response:
        """Which access keys are held, and what each is for.

        Never the keys themselves. There is no route that returns one, because nothing a
        reader can ask needs one: every request that uses a key is made by this server, which
        reads it from the store directly.
        """
        return web.json_response(keys.listing())

    @PromptServer.instance.routes.post(f"{PREFIX}/keys")
    @_json_body
    async def set_key(request: web.Request, body: dict) -> web.Response:
        """Keep an access key, or forget one.

        The value arrives once, in a body, and is not echoed back. What comes back is whether
        a key is now held and the last four characters of it, which is enough to tell two
        apart and not enough to use.
        """
        name = str(body.get("name") or "")
        if _flag(body.get("forget")):
            answer = keys.forget(name)
        else:
            answer = keys.store(name, str(body.get("value") or ""))
        return web.json_response(answer, status=200 if answer.get("ok") else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/collisions")
    async def node_collisions(_request: web.Request) -> web.Response:
        """Node names more than one installed pack registers, and which one is in use.

        Off the event loop: the answer is read from memory but resolving each pack's path
        touches the filesystem, which took the better part of a second the first time on the
        install this was written against. ComfyUI is serving a queue on that loop.
        """
        return web.json_response(await asyncio.to_thread(pack_health.collisions))

    @PromptServer.instance.routes.post(f"{PREFIX}/downloads/plan")
    @_json_body
    async def plan_downloads(request: web.Request, body: dict) -> web.Response:
        """What these downloads would ask of each drive, before any of them are queued.

        Nothing is queued and nothing is written. The answer is for the panel to show, so a
        21 GB model going onto a drive with 12 GB left is a question asked up front rather
        than a failure part way through.
        """
        items = body.get("items")
        return web.json_response(await downloads.plan(items if isinstance(items, list) else []))

    @PromptServer.instance.routes.post(f"{PREFIX}/downloads/action")
    @_json_body
    async def download_action(request: web.Request, body: dict) -> web.Response:
        """Resume, pause or cancel one download, or remove one or several from the list."""
        what = str(body.get("action") or "")
        download_id = str(body.get("id") or "")
        if what == "remove-many":
            ids = body.get("ids")
            removed = downloads.remove_many(ids if isinstance(ids, list) else [])
            return web.json_response({"ok": True, "removed": removed})
        if what == "retry":
            await downloads.start(_download_workers(body))
            return web.json_response({"ok": downloads.retry(download_id)})
        if what == "redownload":
            await downloads.start(_download_workers(body))
            return web.json_response({"ok": downloads.redownload(download_id)})
        if what == "delete":
            return web.json_response(downloads.delete_file(download_id))
        if what == "verify":
            return web.json_response(await downloads.verify(download_id))
        if what == "pause":
            return web.json_response({"ok": downloads.pause(download_id)})
        if what == "cancel":
            return web.json_response({"ok": downloads.cancel(download_id)})
        if what == "remove":
            return web.json_response({"ok": downloads.remove(download_id)})
        return web.json_response({"ok": False, "reason": "unknown action"}, status=400)

    @PromptServer.instance.routes.get(f"{PREFIX}/monitor/blocks")
    async def monitor_blocks(request: web.Request) -> web.Response:
        """Where each part of one model's weights currently sits."""
        try:
            index = int(request.query.get("index", "0"))
            cells = int(request.query.get("cells", "240"))
        except (TypeError, ValueError):
            index, cells = 0, 240
        return web.json_response(await asyncio.to_thread(monitor.blocks, index, cells))

    @PromptServer.instance.routes.get(f"{PREFIX}/monitor/models")
    async def monitor_models(_request: web.Request) -> web.Response:
        """The models ComfyUI is holding, and where each one's weights are."""
        return web.json_response(monitor.models())

    @PromptServer.instance.routes.post(f"{PREFIX}/monitor")
    @_json_body
    async def monitor_lease(request: web.Request, body: dict) -> web.Response:
        """Ask for machine readings, renew that request, or give it up.

        Sampling runs only while a lease is held, and a lease that stops being renewed lapses
        on its own. That is what keeps a closed tab from leaving the server measuring for
        nobody.
        """
        client = str(body.get("client") or "")
        if _flag(body.get("release")):
            return web.json_response({"ok": True, **monitor.release(client)})
        try:
            interval = float(body.get("interval") or monitor.DEFAULT_INTERVAL)
        except (TypeError, ValueError):
            interval = monitor.DEFAULT_INTERVAL
        answer = monitor.lease(client, interval)
        # The first reading rides along with the lease, so the strip has something to show
        # before the first push arrives.
        first = monitor.sample()
        try:
            first["activity"] = monitor.activity(first)
        except Exception:  # noqa: BLE001 - a reading without the light is still a reading
            pass
        return web.json_response({"ok": True, "reading": first, **answer})

    @PromptServer.instance.routes.post(f"{PREFIX}/monitor/free")
    @_json_body
    async def monitor_free(request: web.Request, body: dict) -> web.Response:
        """Ask ComfyUI to let go of what it is holding.

        Handed to the prompt worker as a flag, which is how ComfyUI frees memory for itself;
        the freeing then happens on the thread that owns the models. The worker is woken as
        the flag is set, so this is not a wait for the next prompt.
        """
        answer = monitor.free(vram=_flag(body.get("vram")), ram=_flag(body.get("ram")))
        return web.json_response(answer, status=200 if answer.get("ok") else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/monitor/unload")
    @_json_body
    async def monitor_unload(request: web.Request, body: dict) -> web.Response:
        """Unload one model ComfyUI is holding. Refused while a prompt is running."""
        try:
            model_id = int(body.get("id") or 0)
        except (TypeError, ValueError):
            model_id = 0
        answer = await asyncio.to_thread(
            monitor.unload, model_id, str(body.get("name") or ""))
        return web.json_response(answer, status=200 if answer.get("ok") else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/startup")
    async def startup_report(_request: web.Request) -> web.Response:
        """How long each installed pack took to import, from ComfyUI's own log."""
        return web.json_response(await asyncio.to_thread(pack_health.startup_times))

    @PromptServer.instance.routes.get(f"{PREFIX}/self")
    async def self_state(_request: web.Request) -> web.Response:
        """How Open Manager is installed here, and what updating it takes.

        Read-only, and it reads nothing the page could not work out for itself except the
        path of the interpreter running the server, which is the whole point: the update
        command for a portable build names an interpreter a terminal would never find.
        """
        return web.json_response(await asyncio.to_thread(selfupdate.state))

    @PromptServer.instance.routes.post(f"{PREFIX}/pack/toggle")
    @_json_body
    async def pack_toggle(request: web.Request, body: dict) -> web.Response:
        """Switch a pack off, or back on, by renaming its directory.

        The rename is the same one people already do by hand, so anything done here can be
        undone there. Nothing is deleted and no setting is touched.
        """
        result = await asyncio.to_thread(
            pack_health.toggle, str(body.get("name") or ""), _flag(body.get("off", True)))
        return web.json_response(result, status=200 if result.get("ok") else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/library")
    async def library_index(request: web.Request) -> web.Response:
        """Every model file on disk, across every folder ComfyUI registers.

        Walking is done off the event loop: a folder of twenty thousand files should not stop
        the server answering anything else while it is counted.
        """
        refresh = _flag(request.query.get("refresh"))
        found = await asyncio.to_thread(library.index, refresh)
        return web.json_response(found)

    @PromptServer.instance.routes.get(f"{PREFIX}/library/duplicates")
    async def library_duplicates(request: web.Request) -> web.Response:
        """Files held in more than one place, checked as far as the caller asks.

        ``level=names`` groups by name and size and opens nothing. ``level=quick`` adds a
        two-megabyte signature per file, which is fast and settles only the negative case.
        ``level=full`` reads every candidate, and is the only level that can report a file as
        identical to another.
        """
        level = request.query.get("level", "names").strip().lower()
        if level not in ("names", "quick", "full"):
            level = "names"
        found = await asyncio.to_thread(library.duplicates, level)
        return web.json_response(found)

    @PromptServer.instance.routes.get(f"{PREFIX}/library/storage")
    async def library_storage(_request: web.Request) -> web.Response:
        """What is taking up the drives, and what could be given back."""
        return web.json_response(await asyncio.to_thread(library.storage))

    @PromptServer.instance.routes.post(f"{PREFIX}/library/sweep")
    @_json_body
    async def library_sweep(request: web.Request, body: dict) -> web.Response:
        """Delete the part files left by downloads that never finished.

        Only ``.part`` files, and only those the index itself found inside a registered model
        folder. A finished model is never a candidate, and there is no route that sweeps one.
        """
        wanted = (body or {}).get("paths")
        removed = await asyncio.to_thread(
            library.sweep_partials, wanted if isinstance(wanted, list) else None)
        return web.json_response({"ok": True, **removed})

    @PromptServer.instance.routes.get(f"{PREFIX}/library/references")
    async def library_references(_request: web.Request) -> web.Response:
        """The model filenames the saved workflows appear to ask for."""
        found = await asyncio.to_thread(library.references)
        return web.json_response(found)

    @PromptServer.instance.routes.post(f"{PREFIX}/library/hash")
    @_json_body
    async def library_hash(request: web.Request, body: dict) -> web.Response:
        """The sha256 of one file, taken now or remembered from before."""
        where = str(body.get("path") or "")
        digest = await asyncio.to_thread(library.hash_of, where, _flag(body.get("force")))
        if not digest:
            return web.json_response(
                {"ok": False, "reason": "that file could not be read"}, status=400)
        return web.json_response({"ok": True, "path": where, "sha256": digest})

    @PromptServer.instance.routes.post(f"{PREFIX}/library/provenance")
    @_json_body
    async def library_provenance(request: web.Request, body: dict) -> web.Response:
        """Where one model came from, as far as anything here recorded it.

        Reads the download records, the held hashes and the saved workflows. Nothing is
        hashed and nothing is fetched.
        """
        found = await asyncio.to_thread(library.provenance, str(body.get("path") or ""))
        return web.json_response(found, status=200 if found.get("ok") else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/library/delete")
    @_json_body
    async def library_delete(request: web.Request, body: dict) -> web.Response:
        """Delete one model file.

        One file per request. There is deliberately no route that takes a list: a sweep over
        a folder of models is a different and much more dangerous thing than deleting a file,
        and it should not be reachable by passing a longer array to this.
        """
        result = await asyncio.to_thread(library.delete, str(body.get("path") or ""))
        return web.json_response(result, status=200 if result.get("ok") else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/models/folders")
    async def model_folders(_request: web.Request) -> web.Response:
        """The model folders this ComfyUI knows, for the folder picker."""
        return web.json_response({
            "folders": sorted(_model_folder_names()),
            "formats": sorted(model_policy.SAFE_FORMATS),
            "media_formats": sorted(model_policy.MEDIA_FORMATS),
            "media_directory": model_policy.MEDIA_DIRECTORY,
            "hosts": sorted(model_policy.ALLOWED_HOSTS),
        })

    @PromptServer.instance.routes.get(f"{PREFIX}/models/roots")
    async def model_roots(request: web.Request) -> web.Response:
        """Every path ComfyUI registers for one model folder, with the space left on each.

        This is what the location picker offers. Only these are accepted when a download is
        queued, so a model can be sent to another drive without a path ever being typed.
        """
        directory = request.query.get("directory", "").strip()
        if directory not in _model_folder_names():
            return web.json_response({"ok": False, "roots": [], "reason": "unknown folder"})
        return web.json_response({"ok": True, "directory": directory,
                                  "roots": model_policy.roots(directory)})

    @PromptServer.instance.routes.post(f"{PREFIX}/models/check")
    @_json_body
    async def check_model(request: web.Request, body: dict) -> web.Response:
        """Whether a URL may be downloaded, and what it would be saved as.

        Asked before a URL is written into a node as well as before it is fetched, so a URL
        that will never be allowed is refused while it is being typed rather than later.
        """
        declared = str(body.get("url") or "").strip()
        url = model_policy.normalise(declared)
        directory = str(body.get("directory") or "")
        name = str(body.get("name") or "") or unquote(url.split("?")[0].rsplit("/", 1)[-1])
        # A URL can be checked before its folder is known, which is the order the panel asks
        # in. Everything but the folder is judged against a stand-in, so a sound URL is not
        # reported as a problem merely because the reader has not picked a folder yet.
        # Without a folder the URL is judged against one that suits what it is, so the
        # answer is about the link rather than about a folder not yet chosen.
        kind = model_policy.kind_of(name)
        default = (model_policy.MEDIA_DIRECTORY if kind == "media"
                   else next(iter(sorted(_model_folder_names())), ""))
        probe = directory or default
        root = str(body.get("root") or "")
        allowed, reason = model_policy.check(url, name, probe, root if directory else "")
        owner = model_policy.owner_of(url)
        return web.json_response({
            "ok": allowed and bool(directory),
            "reason": reason,
            "needs_directory": allowed and not directory,
            "url": url,
            "name": name,
            "directory": directory,
            "owner": owner,
            "trusted": trust.is_trusted(owner, "downloads"),
            "installed": model_policy.installed_path(directory, name),
            "rewritten": url != declared,
            "root": root,
            "roots": model_policy.roots(directory) if directory else [],
            "kind": kind,
            "suggested_directory": default if kind == "media" else "",
        })

    @PromptServer.instance.routes.post(f"{PREFIX}/models/in-workflow")
    @_json_body
    async def models_in_workflow(request: web.Request, body: dict) -> web.Response:
        """The models a workflow asks for, and which of them are already on disk.

        ComfyUI records these on each node as ``properties.models``. Most sit inside subgraph
        definitions rather than the top-level node list, so the whole document is walked
        instead of just ``nodes``.
        """
        document = (body if isinstance(body, dict) else {}).get("workflow")
        found = []
        for item in library.declared_models(document):
            allowed, reason = model_policy.check(item["url"], item["name"], item["directory"])
            found.append({
                **item,
                "allowed": allowed,
                "reason": reason,
                "trusted": trust.is_trusted(item["owner"], "downloads"),
                "installed": model_policy.installed_path(item["directory"], item["name"]),
            })
        return web.json_response({"ok": True, "models": found})

    @PromptServer.instance.routes.get(f"{PREFIX}/pack-for-repo")
    async def pack_for_repo(request: web.Request) -> web.Response:
        """The registry pack a repository belongs to, for links between pack pages.

        Read from the cached catalogue rather than the registry, so following a link in a
        README costs nothing and works offline.
        """
        # Answers either direction: a repository to its pack, or a pack id to its repository.
        # Both read the cached catalogue, so neither costs a request.
        pack_id = request.query.get("id", "").strip()
        if pack_id:
            folded = _fold(pack_id)
            for entry in catalog.load():
                if _fold(entry.get("id")) == folded:
                    return web.json_response(
                        {"id": entry.get("id", ""), "repository": entry.get("repository", "")}
                    )
            return web.json_response({"id": "", "repository": ""})

        wanted = _norm_repo(request.query.get("repo", ""))
        if not wanted:
            return web.json_response({"id": ""})
        for entry in catalog.load():
            if _norm_repo(entry.get("repository")) == wanted:
                return web.json_response({"id": entry.get("id", ""), "name": entry.get("name", "")})
        return web.json_response({"id": ""})

    @PromptServer.instance.routes.get(f"{PREFIX}/search")
    async def find(request: web.Request) -> web.Response:
        """Answer packs matching a search term."""
        term = request.query.get("q", "")
        try:
            limit = max(1, min(100, int(request.query.get("limit", "40"))))
            page = max(1, int(request.query.get("page", "1")))
        except ValueError:
            return web.json_response({"error": "limit and page must be numbers"}, status=400)

        async with aiohttp.ClientSession() as session:
            try:
                entries, total = await registry.search(term, session, limit=limit, page=page)
            except registry.RegistryError as error:
                return web.json_response(
                    {"error": "registry", "status": error.status, "detail": error.detail},
                    status=502,
                )
        return web.json_response({"query": term, "total": total, "page": page, "results": entries})

    @PromptServer.instance.routes.get(f"{PREFIX}/impact/" + "{node_id}/{version}")
    async def dependency_impact(request: web.Request) -> web.Response:
        """Answer what installing one version would change in this environment.

        The resolve runs pip in dry-run mode and takes seconds.
        """
        node_id = request.match_info.get("node_id", "")
        version = request.match_info.get("version", "")

        async with aiohttp.ClientSession() as session:
            try:
                versions = await registry.fetch_versions(node_id, session)
            except registry.RegistryError as error:
                return web.json_response(
                    {"error": "registry", "status": error.status, "detail": error.detail},
                    status=502,
                )

        entry = next((item for item in versions if item.version == version), None)
        if entry is None:
            return web.json_response({"error": f"no version {version}"}, status=404)

        import asyncio

        report = await asyncio.to_thread(impact.analyse, list(entry.dependencies), ""
        )
        return web.json_response(
            {
                "pack": node_id,
                "version": version,
                "checked": report.checked,
                "failure": report.failure,
                "additive_only": report.is_additive,
                "additions": list(report.additions),
                "replacements": [
                    {
                        "name": item.name,
                        "have": item.have,
                        "want": item.want,
                        "direction": item.direction,
                        "core": item.is_core,
                        "abi": item.abi_break,
                    }
                    for item in report.replacements
                ],
                "findings": [
                    {
                        "severity": found["severity"],
                        "title": found["title"],
                        "detail": found["detail"],
                        "evidence": list(found["evidence"]),
                        "reference": "",
                    }
                    for found in impact.findings_from(report)
                ],
                "dependencies": deps.check(list(entry.dependencies)),
            }
        )

    @PromptServer.instance.routes.post(f"{PREFIX}/install")
    @_json_body
    async def do_install(request: web.Request, body: dict) -> web.Response:
        """Install a specific version of a pack, from the registry, without the host manager."""

        node_id = str(body.get("id", "")).strip()
        version = str(body.get("version", "")).strip()
        if not node_id or not version:
            return web.json_response(
                {"ok": False, "reason": "id and version are required"}, status=400
            )

        status = str(body.get("status", "")).strip()
        allow_banned = _flag(body.get("allow_banned", False))
        allowed, blocked_reason = _installable(status, allow_banned) if status else (True, "")
        if not allowed:
            return web.json_response({"ok": False, "reason": blocked_reason}, status=403)

        async with aiohttp.ClientSession() as session:
            try:
                target = await registry.install_target(node_id, version, session)
            except registry.RegistryError as error:
                return web.json_response(
                    {"ok": False, "reason": f"registry: {error.status} {error.detail}"},
                    status=502,
                )

        with_deps = bool(body.get("with_deps", True))
        overwrite = bool(body.get("overwrite", False))

        # Read either side of the install, so what pip did is a fact rather than something to
        # be reconstructed later from its output. Only worth taking when pip is going to run.
        before = await asyncio.to_thread(environment.snapshot) if with_deps else {}
        result = await asyncio.to_thread(installer.install, node_id, version,
            target.get("download_url", ""), "", with_deps, overwrite,
        )
        answer = result.to_json()
        if before:
            after = await asyncio.to_thread(environment.snapshot)
            diff = environment.compare(before, after)
            answer["environment"] = diff
            # Kept on disk as well as answered, because an install that breaks something is
            # usually noticed after a restart, by which time this response is long gone.
            answer["environment_id"] = await asyncio.to_thread(environment.record, node_id, version, diff)
        return web.json_response(answer, status=200 if result.ok else 409)

    @PromptServer.instance.routes.post(f"{PREFIX}/inspect-repo")
    @_json_body
    async def inspect_repo(request: web.Request, body: dict) -> web.Response:
        """Inspect a GitHub pack (contents, install scripts, dependency impact) without installing."""
        repo = str(body.get("repo", "")).strip()
        if not repo:
            return web.json_response({"ok": False, "reason": "repo is required"}, status=400)
        ref = str(body.get("ref", "")).strip()
        if ref and not metadata.valid_ref(ref):
            return web.json_response({"ok": False, "reason": "invalid ref"}, status=400)
        result = await asyncio.to_thread(installer.inspect_repo, repo, ref)
        return web.json_response(result, status=200 if result.get("ok") else 502)

    @PromptServer.instance.routes.post(f"{PREFIX}/install-repo")
    @_json_body
    async def install_repo(request: web.Request, body: dict) -> web.Response:
        """Install a pack from its GitHub repository, for packs not on the registry."""
        repo = str(body.get("repo", "")).strip()
        if not repo:
            return web.json_response({"ok": False, "reason": "repo is required"}, status=400)
        with_deps = bool(body.get("with_deps", True))
        ref = str(body.get("ref", "")).strip()
        if ref and not metadata.valid_ref(ref):
            return web.json_response({"ok": False, "reason": "invalid ref"}, status=400)
        overwrite = bool(body.get("overwrite"))
        # Read either side, the same as a registry install: a pack from a URL is no less able
        # to move a package, and rather more likely to.
        before = await asyncio.to_thread(environment.snapshot) if with_deps else {}
        result = await asyncio.to_thread(installer.install_repo, repo, "", with_deps, ref, overwrite
        )
        answer = result.to_json()
        if before:
            after = await asyncio.to_thread(environment.snapshot)
            diff = environment.compare(before, after)
            answer["environment"] = diff
            answer["environment_id"] = await asyncio.to_thread(environment.record, repo, ref or "default branch", diff)
        return web.json_response(answer, status=200 if result.ok else 409)

    @PromptServer.instance.routes.post(f"{PREFIX}/uninstall")
    @_json_body
    async def do_uninstall(request: web.Request, body: dict) -> web.Response:
        """Remove an installed pack."""
        node_id = str(body.get("id", "")).strip()
        if not node_id:
            return web.json_response({"ok": False, "reason": "id is required"}, status=400)
        result = await asyncio.to_thread(installer.uninstall, node_id)
        return web.json_response(result.to_json(), status=200 if result.ok else 409)

    @PromptServer.instance.routes.post(f"{PREFIX}/reboot")
    @_json_body
    async def reboot(request: web.Request, _body: dict) -> web.Response:
        """Restart the ComfyUI server, so newly installed or removed packs take effect.

        Loopback-only is not on its own a defence against another site asking for this. A
        request forged by a page the reader is visiting comes from the reader's own browser,
        so its peer address is loopback too. The content type is what stops it: a cross-origin
        caller cannot set one without asking permission first.
        """
        peer = request.transport.get_extra_info("peername") if request.transport else None
        host = peer[0] if peer else ""
        if host not in _LOOPBACK:
            return web.json_response({"ok": False, "reason": "restart is loopback-only"}, status=403)
        # Respond first, then re-exec.
        asyncio.get_running_loop().call_later(0.6, _reboot)
        return web.json_response({"ok": True})

    @PromptServer.instance.routes.get(f"{PREFIX}/catalog")
    async def catalog_get(_request: web.Request) -> web.Response:
        """The cached catalogue, for offline browsing, searching and sorting.

        Browsing only: the other readers of the cache index it by id and repository, and a
        manager left out of those would lose its icon, version and update path once
        installed.
        """
        info = catalog.state()
        return web.json_response({"nodes": catalog.browsable(), **info})

    @PromptServer.instance.routes.get(f"{PREFIX}/catalog/state")
    async def catalog_state(_request: web.Request) -> web.Response:
        """Whether the catalogue is cached, its size and age, and any sync in progress."""
        return web.json_response(catalog.state())

    def _sync_concurrency(body: dict) -> int | None:
        """The page concurrency a sync request asks for.

        Args:
            body: The decoded request body.

        Returns:
            One where the caller turned parallel syncing off, the requested count where it
            gave one, or ``None`` to leave the default in place. The count is clamped by
            :func:`catalog.sync` itself.
        """
        if not body.get("parallel", True):
            return 1
        wanted = body.get("concurrency")
        if wanted is None:
            return None
        try:
            return int(wanted)
        except (TypeError, ValueError):
            return None

    @PromptServer.instance.routes.post(f"{PREFIX}/catalog/sync")
    @_json_body
    async def catalog_sync(request: web.Request, body: dict) -> web.Response:
        """Start a catalogue sync in the background."""
        asyncio.get_running_loop().create_task(catalog.sync(_sync_concurrency(body)))
        return web.json_response({"ok": True})

    @PromptServer.instance.routes.post(f"{PREFIX}/catalog/auto-sync")
    @_json_body
    async def catalog_auto_sync(request: web.Request, body: dict) -> web.Response:
        """Start a background sync where the configured renewal policy calls for it.

        A per-session guard limits this to one renewal per server run.
        """
        policy = str(body.get("policy", "startup"))
        try:
            stale_days = float(body.get("stale_days", 7) or 7)
        except (TypeError, ValueError):
            stale_days = 7.0
        triggered = catalog.should_auto_sync(policy, stale_days)
        if triggered:
            asyncio.get_running_loop().create_task(catalog.sync(_sync_concurrency(body)))
        return web.json_response({"triggered": triggered, **catalog.state()})

    @PromptServer.instance.routes.get(f"{PREFIX}/installed")
    async def installed(_request: web.Request) -> web.Response:
        """List the packs currently in custom_nodes.

        A pack matching a catalogue entry also carries its registry id, icon, and the version
        the registry advertises.
        """
        packs = await asyncio.to_thread(installer.list_installed)
        index = {}
        for entry in catalog.load():
            folded = _fold(entry.get("id"))
            if folded:
                index[folded] = entry
        for pack in packs:
            entry = index.get(_fold(pack.get("id"))) or index.get(_fold(pack.get("dir")))
            pack["registry_id"] = entry.get("id", "") if entry else ""
            pack["latest"] = entry.get("advertised", "") if entry else ""
            pack["repository"] = entry.get("repository", "") if entry else ""
            pack["icon"] = entry.get("icon", "") if entry else ""
            pack["stars"] = int(entry.get("stars") or 0) if entry else 0
            pack["status"] = ""
            # Where it came from, most specific first. A working copy is a repository
            # install whether or not the registry also carries the pack; a registry match
            # names it otherwise; anything left arrived some other way.
            pack["source"] = (
                "github" if pack.get("from_git")
                else "registry" if pack["registry_id"]
                else "disk"
            )

        # The installed version's status is looked up only where it is not the advertised
        # active one.
        async with aiohttp.ClientSession() as session:
            gate = asyncio.Semaphore(8)

            async def annotate(pack: dict) -> None:
                if not pack["registry_id"]:
                    return
                if pack.get("version") and pack["version"] == pack["latest"]:
                    pack["status"] = "active"
                    return
                async with gate:
                    pack["status"] = await _installed_status(
                        pack["registry_id"], pack.get("version", ""), session
                    )

            await asyncio.gather(*(annotate(pack) for pack in packs))
        return web.json_response({"packs": packs})

    @PromptServer.instance.routes.post(f"{PREFIX}/resolve-nodes")
    @_json_body
    async def resolve_nodes(request: web.Request, body: dict) -> web.Response:
        """Given node classes missing from a graph, name the packs that provide them."""
        classes = [str(c) for c in (body.get("classes") or [])]
        if not classes:
            return web.json_response({"packs": [], "unresolved": []})

        # The cached catalogue maps a repository to its pack. A live search covers anything
        # not yet cached.
        repo_index = {}
        for entry in catalog.load():
            key = _norm_repo(entry.get("repository"))
            if key:
                repo_index[key] = entry

        async with aiohttp.ClientSession() as session:
            groups, unresolved = await nodemap.resolve(classes, session)
            packs = []
            for url, group in groups.items():
                entry = repo_index.get(_norm_repo(url))
                if entry is None:
                    entry = await _pack_by_repo(url, session)
                pack_id = entry["id"] if entry else ""
                packs.append({
                    "repo": url,
                    "title": (entry.get("name") if entry else "") or group["title"] or nodemap.repo_name(url),
                    "classes": sorted(group["classes"]),
                    "pack_id": pack_id,
                    "icon": (entry.get("icon") if entry else "") or "",
                    "installable": bool(pack_id),
                    "installed_version": installer.installed_version(pack_id) if pack_id else "",
                })
        packs.sort(key=lambda p: (not p["installable"], p["title"].lower()))
        return web.json_response({"packs": packs, "unresolved": sorted(unresolved)})

    @PromptServer.instance.routes.post(f"{PREFIX}/licenses")
    @_json_body
    async def resolve_licenses(request: web.Request, body: dict) -> web.Response:
        """Read licences from repositories for listing rows the registry left unnamed.

        Each item is ``{id, repository}``. The answer is keyed by pack id.
        """
        raw = body.get("items")
        items = [
            (str(i.get("id", "")), str(i.get("repository", "")))
            for i in raw
            if isinstance(i, dict) and i.get("id") and i.get("repository")
        ] if isinstance(raw, list) else []
        # A listing only ever asks about the rows it has drawn. The cap stops a client
        # queueing the whole catalogue into one request.
        items = items[:LICENSE_BATCH]
        if not items:
            return web.json_response({"licenses": {}})

        async with aiohttp.ClientSession() as session:
            by_repo = await license_files.resolve_many(
                [repo for _, repo in items], session, _license_options(body)
            )

        out = {}
        for pack_id, repo in items:
            name = by_repo.get(repo, "")
            if not name:
                continue
            info = licenses.classify(name)
            out[pack_id] = {
                "name": info["name"],
                "tier": info["tier"],
                "rank": info["rank"],
                "color": info["color"],
            }
        return web.json_response({"licenses": out})

    @PromptServer.instance.routes.get(f"{PREFIX}/github")
    async def github_list(_request: web.Request) -> web.Response:
        """List the GitHub repositories the user added, with each one's installed state."""
        rows = await asyncio.to_thread(sources.load)
        for row in rows:
            directory = installer.resolve_install_dir(row["name"])
            row["installed_version"] = installer.installed_version(row["name"])
            row["dir"] = directory.name if directory is not None else ""
        return web.json_response({"repos": rows})

    @PromptServer.instance.routes.post(f"{PREFIX}/github")
    @_json_body
    async def github_add(request: web.Request, body: dict) -> web.Response:
        """Put a GitHub repository on the user's list."""
        result = sources.add(str(body.get("url", "")))
        return web.json_response(result, status=200 if result["ok"] else 422)

    @PromptServer.instance.routes.post(f"{PREFIX}/github/remove")
    @_json_body
    async def github_remove(request: web.Request, body: dict) -> web.Response:
        """Take a repository off the list, uninstalling the pack where it is installed."""
        url = str(body.get("url", ""))
        pair = sources.parse(url)
        if pair is None:
            return web.json_response(
                {"ok": False, "reason": "that is not a GitHub repository URL"}, status=422
            )
        removed = sources.remove(url)
        result = {"ok": removed, "removed": removed, "uninstalled": False, "reason": ""}
        if not removed:
            result["reason"] = "that repository was not on the list"
            return web.json_response(result, status=404)
        if installer.resolve_install_dir(pair[1]) is not None:
            outcome = await asyncio.to_thread(installer.uninstall, pair[1]
            )
            result["uninstalled"] = outcome.ok
            result["restart_required"] = outcome.restart_required
            if not outcome.ok:
                result["reason"] = outcome.reason
        return web.json_response(result)

    @PromptServer.instance.routes.get(f"{PREFIX}/health")
    async def health(_request: web.Request) -> web.Response:
        """Answer whether the registry is reachable and what this package is."""
        reachable = True
        detail = ""
        async with aiohttp.ClientSession() as session:
            try:
                await registry.fetch_node("comfyui-manager", session)
            except registry.RegistryError as error:
                reachable = False
                detail = f"{error.status}: {error.detail[:200]}"
        return web.json_response(
            {
                "registry": registry.BASE_URL,
                "reachable": reachable,
                "detail": detail,
                "policy": "warn-never-block",
            }
        )

    _registered = True
    logger.info("routes registered below %s", PREFIX)
