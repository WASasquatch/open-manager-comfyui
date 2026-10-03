"""HTTP routes serving registry data, findings and installs to the panel."""

from __future__ import annotations

import asyncio
import base64
import binascii
import functools
import json
import os
import posixpath
import re
import sys
import time
from urllib.parse import quote, unquote

import aiohttp
from aiohttp import web

from . import (
    assets as asset_files,
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
    localnodes,
    monitor,
    nodemap,
    pause as run_pause,
    registry,
    risk,
    selfupdate,
    sources,
    topics,
    trust,
    desktop as desktop_layout,
    docs as documents,
    files as host_files,
    gates,
    marks,
    programs as desk_programs,
    settingsfile,
    stall,
    tdr,
    usertheme,
    wallpaper,
)

__all__ = ["ALLOW_BANNED", "PREFIX", "register_routes"]

PREFIX = "/open_manager/v1/api"

LICENSE_BATCH = 200

GALLERY_SUFFIXES = (
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif",
    ".mp4", ".webm", ".mov", ".m4v",
)

GALLERY_CAP = 12_000_000

REF_BRANCHES = 100

REF_COMMITS = 20

REF_TAGS = 100

BLOCKED_STATUSES = ("banned",)

ALLOW_BANNED = os.environ.get("OPEN_MANAGER_ALLOW_BANNED", "").strip().lower() in (
    "1",
    "true",
    "yes",
)

logger = log.get_logger("routes")

_registered = False

_LOOPBACK = ("127.0.0.1", "::1", "localhost")


def _model_folder_names() -> set:
    """Every folder a download may be written to."""
    return model_policy.folders()


def _panel_module(request: web.Request) -> bool:
    """Whether a request is for one of the panel's own script modules."""
    if not request.path.endswith(".mjs"):
        return False
    if not request.match_info.get("filename", "").startswith("modules/"):
        return False
    resource = request.match_info.route.resource
    directory = resource.get_info().get("directory") if resource is not None else None
    if directory is None:
        return False
    from . import web_directory

    return os.path.normcase(os.path.realpath(directory)) == os.path.normcase(
        os.path.realpath(web_directory())
    )


@web.middleware
async def _uncached_modules(request: web.Request, handler):
    """Serve the panel's script modules with the no-store header ComfyUI gives `.js` files."""
    response = await handler(request)
    if _panel_module(request):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


DOC_LIMIT = 400_000

_GH_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")


def _json_body(handler):
    """Give a POST handler a parsed JSON body and a content-type check.

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
    """Whether a request body claims to be JSON."""
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


_STATUS_TTL = 600

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


INSTALLED_MARK = "installed"

ZIP_CHUNK = 262_144

THEME_DECLARED_CAP = 20


def _declared_themes() -> list[dict]:
    """Every theme the installed packs declare, read from their own directories.

    Returns:
        One ``{repo, path, theme}`` per readable declared theme.
    """
    try:
        base = installer.custom_nodes_dir()
    except Exception:
        return []
    found: list[dict] = []
    for record in installer.list_installed():
        if record.get("disabled"):
            continue
        directory = base / str(record.get("dir") or "")
        try:
            text = (directory / "pyproject.toml").read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        declared = developer.from_pyproject(text).get("themes") or []
        repo = developer.repository_from_pyproject(text)
        if not declared or not repo:
            continue
        for relative in declared[:THEME_DECLARED_CAP]:
            clean = str(relative).strip().replace("\\", "/").lstrip("/")
            if not clean or ".." in clean or not clean.lower().endswith(".json"):
                continue
            body = _pack_file(repo, clean, 1_000_000)
            if not body:
                continue
            try:
                data = json.loads(body)
            except ValueError:
                continue
            if _looks_like_theme(data):
                found.append({"repo": repo, "path": clean, "theme": data})
    return found


_SAFE_REF = re.compile(r"^[A-Za-z0-9._/-]{1,100}$")


def _safe_ref(raw: str) -> str:
    """A git ref fit to place in a raw.githubusercontent URL, or an empty string.

    Args:
        raw: The ref as it arrived from the client.

    Returns:
        The ref, or an empty string where it is not one.
    """
    text = str(raw or "").strip()
    if not text or ".." in text or text.startswith("/") or text.endswith("/"):
        return ""
    return text if _SAFE_REF.match(text) else ""


def _pack_bytes(repo: str, relative: str, cap: int) -> bytes | None:
    """A file read as bytes from the installed copy of a pack.

    Args:
        repo: The pack's repository URL, matched against installed directories.
        relative: Path inside the pack, already checked for traversal.
        cap: Size limit. One byte past it is read.

    Returns:
        The bytes, or ``None`` where the pack is not installed or holds no such file. A
        result longer than ``cap`` means the file is over the limit.
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
            return handle.read(cap + 1)
    except OSError:
        return None


_IMAGE_MAGIC = (
    ("89504e470d0a1a0a", 0, "image/png"),
    ("ffd8ff", 0, "image/jpeg"),
    ("474946383761", 0, "image/gif"),
    ("474946383961", 0, "image/gif"),
)


def _image_type(data: bytes) -> str:
    """The content type of an image, from its leading bytes.

    Args:
        data: Start of the file.

    Returns:
        An image content type, or empty where the bytes are not one.
    """
    for prefix, offset, kind in _IMAGE_MAGIC:
        raw = bytes.fromhex(prefix)
        if data[offset:offset + len(raw)] == raw:
            return kind
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand in (b"avif", b"avis", b"mif1"):
            return "image/avif"
        if brand in (b"isom", b"iso2", b"mp41", b"mp42", b"avc1", b"M4V ", b"qt  "):
            return "video/quicktime" if brand == b"qt  " else "video/mp4"
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
            "The registry banned this version. It installs only with Open Manager's "
            "'Install versions the registry has banned' setting on."
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

        allow_banned = _flag(request.query.get("allow_banned", False))

        async with aiohttp.ClientSession() as session:
            try:
                record = await registry.fetch_node(node_id, session)
                versions = await registry.fetch_versions(node_id, session)
            except registry.RegistryError as error:
                return web.json_response(
                    {
                        "error": "registry",
                        "status": error.status,
                        "detail": error.detail,
                        "pack": node_id,
                    },
                    status=502,
                )

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
        held_version = await asyncio.to_thread(installer.installed_version, record.node_id)
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
                    "installed_version": held_version,
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
        payload["developer"] = _local_developer(record.repository) or payload.get("developer") or {}
        payload["incompatible"] = developer.resolve_incompatible(
            payload["developer"].get("incompatible", [])
        )
        return web.json_response(payload)

    _ASSET_HEADERS = {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    }

    @PromptServer.instance.routes.get(f"{PREFIX}/theme-asset")
    async def theme_asset(request: web.Request) -> web.Response:
        """One image a reader's theme keeps beside itself, under their themes directory."""
        payload, kind, problem = await asyncio.to_thread(
            usertheme.asset, request.query.get("path", "")
        )
        if problem:
            return web.json_response({"ok": False, "reason": problem}, status=404)
        return web.Response(
            body=payload,
            content_type=kind,
            headers=_ASSET_HEADERS,
        )

    @PromptServer.instance.routes.get(f"{PREFIX}/docs")
    async def docs_listing(request: web.Request) -> web.Response:
        """What sits inside one of the reader's document folders."""
        return web.json_response(
            await asyncio.to_thread(documents.listing, request.query.get("path", ""))
        )

    @PromptServer.instance.routes.get(f"{PREFIX}/docs/note")
    async def docs_note(request: web.Request) -> web.Response:
        """One note's markdown."""
        answer = await asyncio.to_thread(documents.read_note, request.query.get("path", ""))
        return web.json_response(answer, status=200 if answer["ok"] else 404)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/folder")
    @_json_body
    async def docs_folder(_request: web.Request, body: dict) -> web.Response:
        """Make a folder."""
        answer = await asyncio.to_thread(
            documents.create_folder, str(body.get("parent") or ""), str(body.get("name") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/new")
    @_json_body
    async def docs_new(_request: web.Request, body: dict) -> web.Response:
        """Make a note."""
        answer = await asyncio.to_thread(
            documents.create_note, str(body.get("parent") or ""),
            str(body.get("name") or ""), str(body.get("body") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/link")
    @_json_body
    async def docs_link(_request: web.Request, body: dict) -> web.Response:
        """Make a shortcut to one of the host's workflows."""
        answer = await asyncio.to_thread(
            documents.create_link, str(body.get("parent") or ""),
            str(body.get("name") or ""), str(body.get("target") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/link/target")
    @_json_body
    async def docs_link_target(_request: web.Request, body: dict) -> web.Response:
        """Point an existing shortcut at a different workflow."""
        answer = await asyncio.to_thread(
            documents.set_target, str(body.get("path") or ""), str(body.get("target") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/write")
    @_json_body
    async def docs_write(_request: web.Request, body: dict) -> web.Response:
        """Keep a note's markdown."""
        answer = await asyncio.to_thread(
            documents.write_note, str(body.get("path") or ""), str(body.get("body") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/rename")
    @_json_body
    async def docs_rename(_request: web.Request, body: dict) -> web.Response:
        """Give an item a new display name."""
        answer = await asyncio.to_thread(
            documents.rename, str(body.get("path") or ""), str(body.get("name") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/move")
    @_json_body
    async def docs_move(_request: web.Request, body: dict) -> web.Response:
        """Put an item inside another folder."""
        answer = await asyncio.to_thread(
            documents.move, str(body.get("path") or ""), str(body.get("parent") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/remove")
    @_json_body
    async def docs_remove(_request: web.Request, body: dict) -> web.Response:
        """Put an item in the wastebasket."""
        answer = await asyncio.to_thread(documents.remove, str(body.get("path") or ""))
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/restore")
    @_json_body
    async def docs_restore(_request: web.Request, body: dict) -> web.Response:
        """Take an item back out of the wastebasket."""
        answer = await asyncio.to_thread(documents.restore, str(body.get("token") or ""))
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/docs/trash")
    async def docs_trash(_request: web.Request) -> web.Response:
        """What is in the wastebasket."""
        return web.json_response(await asyncio.to_thread(documents.trash))

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/trash/empty")
    @_json_body
    async def docs_trash_empty(_request: web.Request, _body: dict) -> web.Response:
        """Throw away everything in the wastebasket."""
        answer = await asyncio.to_thread(documents.empty_trash)
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/docs/find")
    async def docs_find(request: web.Request) -> web.Response:
        """Where the item carrying an id sits now."""
        answer = await asyncio.to_thread(documents.locate, request.query.get("id", ""))
        return web.json_response(answer, status=200 if answer["ok"] else 404)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/media")
    async def docs_media_save(request: web.Request) -> web.Response:
        """Keep an image pasted into a note, carried as the body."""
        kind = (request.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if kind != "application/octet-stream" and not kind.startswith("image/"):
            return web.json_response(
                {"ok": False, "reason": "expected application/octet-stream"}, status=415)
        payload = await request.read()
        answer = await asyncio.to_thread(documents.keep_media, payload)
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    def _download_headers(name: str) -> dict:
        """What names a download, in both spellings a browser may read."""
        plain = "".join(one if 32 <= ord(one) < 127 and one not in '"\\' else "_"
                        for one in name) or "document"
        return {
            "Content-Disposition":
                f'attachment; filename="{plain}"; filename*=UTF-8\'\'{quote(name, safe="")}',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        }

    @PromptServer.instance.routes.get(f"{PREFIX}/docs/export")
    async def docs_export(request: web.Request) -> web.Response:
        """One document or one folder, handed to the browser as a download."""
        asked = request.query.get("path", "")
        kind, problem = await asyncio.to_thread(documents.kind_at, asked)
        if problem:
            return web.json_response({"ok": False, "reason": problem}, status=404)
        if kind == "file":
            payload, name, problem = await asyncio.to_thread(documents.export_file, asked)
            if problem:
                return web.json_response({"ok": False, "reason": problem}, status=404)
            return web.Response(body=payload, headers=_download_headers(name),
                                content_type="application/octet-stream")

        spool, name, problem = await asyncio.to_thread(documents.zip_folder, asked)
        if problem or spool is None:
            return web.json_response({"ok": False, "reason": problem}, status=400)
        answer = web.StreamResponse(headers=_download_headers(name))
        answer.content_type = "application/zip"
        try:
            await answer.prepare(request)
            while True:
                chunk = await asyncio.to_thread(spool.read, ZIP_CHUNK)
                if not chunk:
                    break
                await answer.write(chunk)
            await answer.write_eof()
        finally:
            await asyncio.to_thread(spool.close)
        return answer

    @PromptServer.instance.routes.get(f"{PREFIX}/docs/measure")
    async def docs_measure(request: web.Request) -> web.Response:
        """How much one item holds, counted all the way down."""
        answer = await asyncio.to_thread(documents.measure, request.query.get("path", ""))
        return web.json_response(answer, status=200 if answer["ok"] else 404)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/icon")
    async def docs_icon_save(request: web.Request) -> web.Response:
        """Keep an icon a reader chose for one folder, carried as the body."""
        kind = (request.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if kind != "application/octet-stream" and not kind.startswith("image/"):
            return web.json_response(
                {"ok": False, "reason": "expected application/octet-stream"}, status=415)
        payload = await request.read()
        answer = await asyncio.to_thread(
            documents.set_icon, request.query.get("path", ""), payload
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/colour")
    @_json_body
    async def docs_colour(_request: web.Request, body: dict) -> web.Response:
        """Give an item a colour, or take it away when the colour is empty."""
        answer = await asyncio.to_thread(
            documents.set_colour, str(body.get("path") or ""), str(body.get("colour") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/docs/icon/clear")
    @_json_body
    async def docs_icon_clear(_request: web.Request, body: dict) -> web.Response:
        """Take a folder's own icon away."""
        answer = await asyncio.to_thread(documents.clear_icon, str(body.get("path") or ""))
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/docs/icon")
    async def docs_icon(request: web.Request) -> web.Response:
        """One folder icon's bytes."""
        payload, kind, problem = await asyncio.to_thread(
            documents.icon, request.query.get("name", "")
        )
        if problem:
            return web.json_response({"ok": False, "reason": problem}, status=404)
        return web.Response(body=payload, content_type=kind, headers=_ASSET_HEADERS)

    @PromptServer.instance.routes.get(f"{PREFIX}/docs/media")
    async def docs_media(request: web.Request) -> web.Response:
        """One pasted image's bytes."""
        payload, kind, problem = await asyncio.to_thread(
            documents.media, request.query.get("name", "")
        )
        if problem:
            return web.json_response({"ok": False, "reason": problem}, status=404)
        return web.Response(body=payload, content_type=kind, headers=_ASSET_HEADERS)

    @PromptServer.instance.routes.get(f"{PREFIX}/assets")
    async def asset_listing(request: web.Request) -> web.Response:
        """What sits inside one of ComfyUI's own output, input or temp directories."""
        query = request.query
        answer = await asyncio.to_thread(
            asset_files.listing,
            query.get("root", "output"), query.get("path", ""),
            int(query.get("page") or 0) if str(query.get("page") or "0").isdigit() else 0,
            int(query.get("size") or 0) if str(query.get("size") or "0").isdigit() else 0,
            query.get("sort", "new"), query.get("kind", "all"), query.get("q", ""),
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    _THUMB_HEADERS = {
        "Cache-Control": "private, max-age=604800",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    }

    @PromptServer.instance.routes.get(f"{PREFIX}/assets/thumb")
    async def asset_thumb(request: web.Request) -> web.Response:
        """One picture, shrunk to the size a gallery cell actually draws."""
        query = request.query
        edge = query.get("edge") or ""
        payload, kind, problem = await asyncio.to_thread(
            asset_files.thumb, query.get("root", "output"), query.get("path", ""),
            int(edge) if edge.isdigit() else asset_files.THUMB_EDGE,
        )
        if problem:
            return web.json_response({"ok": False, "reason": problem}, status=404)
        return web.Response(body=payload, content_type=kind, headers=_THUMB_HEADERS)

    _VIEW_HEADERS = {
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "inline",
    }

    @PromptServer.instance.routes.get(f"{PREFIX}/assets/view")
    async def asset_view(request: web.Request) -> web.Response:
        """One picture, video or sound, whole, from any directory a reader may look in."""
        query = request.query
        found, kind, problem = await asyncio.to_thread(
            asset_files.locate, query.get("root", "output"), query.get("path", "")
        )
        if problem or found is None:
            return web.json_response({"ok": False, "reason": problem}, status=404)
        return web.FileResponse(found, headers={**_VIEW_HEADERS, "Content-Type": kind})

    @PromptServer.instance.routes.get(f"{PREFIX}/assets/text")
    async def asset_text_read(request: web.Request) -> web.Response:
        """One text file, from any directory a reader may look in."""
        query = request.query
        answer = await asyncio.to_thread(
            asset_files.read_text, query.get("root", "output"), query.get("path", "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/assets/text")
    @_json_body
    async def asset_text_write(_request: web.Request, body: dict) -> web.Response:
        """Keep what the editor holds, over a text file that is already there."""
        if not gates.FILES:
            return web.json_response(gates.refuse("files"), status=403)
        if not gates.WRITES:
            return web.json_response(gates.refuse("writes"), status=403)
        answer = await asyncio.to_thread(
            asset_files.write_text, str(body.get("root") or ""),
            str(body.get("path") or ""), str(body.get("body") or ""),
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/assets/peek")
    async def asset_peek(request: web.Request) -> web.Response:
        """A few pictures from inside a folder, for the card that stands for it."""
        query = request.query
        count = query.get("count") or ""
        answer = await asyncio.to_thread(
            asset_files.peek, query.get("root", "output"), query.get("path", ""),
            int(count) if count.isdigit() else 4,
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/assets/search")
    async def asset_search(request: web.Request) -> web.Response:
        """Which files carry a graph mentioning a word."""
        query = request.query
        answer = await asyncio.to_thread(
            asset_files.search, query.get("root", "output"), query.get("path", ""),
            query.get("q", ""),
            int(query.get("size") or 0) if str(query.get("size") or "0").isdigit() else 0,
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/assets/workflow")
    async def asset_workflow(request: web.Request) -> web.Response:
        """What graph text one file carries."""
        answer = await asyncio.to_thread(
            asset_files.workflow_of, request.query.get("root", "output"),
            request.query.get("path", "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/assets/workflow/remove")
    @_json_body
    async def asset_workflow_remove(_request: web.Request, body: dict) -> web.Response:
        """Rewrite one png without the graph it carries."""
        answer = await asyncio.to_thread(
            asset_files.strip_workflow, str(body.get("root") or ""), str(body.get("path") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/assets/remove")
    @_json_body
    async def asset_remove(_request: web.Request, body: dict) -> web.Response:
        """Delete one file this install made."""
        answer = await asyncio.to_thread(
            asset_files.remove, str(body.get("root") or ""), str(body.get("path") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/assets/write")
    @_json_body
    async def asset_write(_request: web.Request, body: dict) -> web.Response:
        """Put a picture under one of the ComfyUI directories."""
        if not gates.FILES:
            return web.json_response(gates.refuse("files"), status=403)
        if not gates.WRITES:
            return web.json_response(gates.refuse("writes"), status=403)
        try:
            data = base64.b64decode(str(body.get("data") or ""), validate=True)
        except (ValueError, binascii.Error):
            return web.json_response({"ok": False, "reason": "not a picture this writes"},
                                     status=400)
        answer = await asyncio.to_thread(
            asset_files.write, str(body.get("root") or ""), str(body.get("path") or ""),
            data, bool(body.get("replace")),
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/programs")
    async def desktop_programs(_request: web.Request) -> web.Response:
        """Every desktop program this install ships, read from their manifests."""
        return web.json_response(await asyncio.to_thread(desk_programs.listing))

    @PromptServer.instance.routes.get(f"{PREFIX}/programs/store")
    async def program_store_read(request: web.Request) -> web.Response:
        """What one program kept in its own corner of the reader's directory."""
        answer = await asyncio.to_thread(desk_programs.read_store,
                                         request.query.get("id", ""))
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/programs/store")
    @_json_body
    async def program_store_write(_request: web.Request, body: dict) -> web.Response:
        """Keep what one program asked to keep."""
        answer = await asyncio.to_thread(desk_programs.write_store,
                                         str(body.get("id") or ""), body.get("data"))
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/gates")
    async def gate_state(_request: web.Request) -> web.Response:
        """What this machine's owner has decided this install may do."""
        return web.json_response(gates.state())

    @PromptServer.instance.routes.get(f"{PREFIX}/settings/health")
    async def settings_health(_request: web.Request) -> web.Response:
        """Whether ComfyUI's settings file is present and readable to ComfyUI."""
        answer = await asyncio.to_thread(settingsfile.status)
        return web.json_response(answer)

    @PromptServer.instance.routes.get(f"{PREFIX}/files/places")
    async def file_places(_request: web.Request) -> web.Response:
        """Every directory a reader may look in."""
        answer = await asyncio.to_thread(host_files.places, True)
        return web.json_response(answer, status=200 if answer["ok"] else 403)

    @PromptServer.instance.routes.get(f"{PREFIX}/files")
    async def file_listing(request: web.Request) -> web.Response:
        """What sits inside one directory of one place."""
        query = request.query
        answer = await asyncio.to_thread(
            host_files.listing, query.get("place", ""), query.get("path", "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/files/rename")
    @_json_body
    async def file_rename(_request: web.Request, body: dict) -> web.Response:
        """Give one file or folder a different name."""
        answer = await asyncio.to_thread(
            host_files.rename, str(body.get("place") or ""), str(body.get("path") or ""),
            str(body.get("name") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/files/folder")
    @_json_body
    async def file_make_folder(_request: web.Request, body: dict) -> web.Response:
        """Make a folder inside another."""
        answer = await asyncio.to_thread(
            host_files.make_folder, str(body.get("place") or ""),
            str(body.get("path") or ""), str(body.get("name") or ""),
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/files/move")
    @_json_body
    async def file_move(_request: web.Request, body: dict) -> web.Response:
        """Move one file or folder into another directory, in any place."""
        answer = await asyncio.to_thread(
            host_files.move, str(body.get("place") or ""), str(body.get("path") or ""),
            str(body.get("into") or ""), str(body.get("intoPlace") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/marks")
    async def folder_marks(_request: web.Request) -> web.Response:
        """Every icon and colour a reader has pinned to a folder."""
        answer = await asyncio.to_thread(marks.read)
        return web.json_response(answer)

    @PromptServer.instance.routes.get(f"{PREFIX}/marks/icon")
    async def folder_mark_icon(request: web.Request) -> web.Response:
        """One stored folder icon."""
        data, kind = await asyncio.to_thread(marks.icon, request.query.get("name", ""))
        if data is None:
            return web.Response(status=404)
        return web.Response(body=data, content_type=kind,
                            headers={"Cache-Control": "public, max-age=604800"})

    @PromptServer.instance.routes.post(f"{PREFIX}/marks/colour")
    @_json_body
    async def folder_mark_colour(_request: web.Request, body: dict) -> web.Response:
        """Give one folder a colour, or take it away."""
        if not gates.FILES:
            return web.json_response(gates.refuse("files"), status=403)
        answer = await asyncio.to_thread(
            marks.set_colour, str(body.get("place") or ""), str(body.get("path") or ""),
            str(body.get("colour") or ""),
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/marks/icon")
    @_json_body
    async def folder_mark_set_icon(_request: web.Request, body: dict) -> web.Response:
        """Give one folder an icon."""
        if not gates.FILES:
            return web.json_response(gates.refuse("files"), status=403)
        try:
            data = base64.b64decode(str(body.get("data") or ""), validate=True)
        except (ValueError, binascii.Error):
            return web.json_response({"ok": False, "icon": "", "reason": "is not an image"},
                                     status=400)
        answer = await asyncio.to_thread(
            marks.set_icon, str(body.get("place") or ""), str(body.get("path") or ""),
            data, str(body.get("suffix") or ""),
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/marks/clear")
    @_json_body
    async def folder_mark_clear(_request: web.Request, body: dict) -> web.Response:
        """Take a folder's mark off."""
        if not gates.FILES:
            return web.json_response(gates.refuse("files"), status=403)
        answer = await asyncio.to_thread(
            marks.clear, str(body.get("place") or ""), str(body.get("path") or ""))
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/files/copy")
    @_json_body
    async def file_copy(_request: web.Request, body: dict) -> web.Response:
        """Copy one file or folder into another directory, in any place."""
        answer = await asyncio.to_thread(
            host_files.copy, str(body.get("place") or ""), str(body.get("path") or ""),
            str(body.get("into") or ""), str(body.get("intoPlace") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/files/remove")
    @_json_body
    async def file_remove(_request: web.Request, body: dict) -> web.Response:
        """Delete one file or folder. There is no wastebasket for these."""
        answer = await asyncio.to_thread(
            host_files.remove, str(body.get("place") or ""), str(body.get("path") or "")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/desktop-layout")
    async def desktop_layout_read(_request: web.Request) -> web.Response:
        """Where the reader put their desktop icons."""
        return web.json_response(await asyncio.to_thread(desktop_layout.read))

    @PromptServer.instance.routes.post(f"{PREFIX}/desktop-layout")
    @_json_body
    async def desktop_layout_write(_request: web.Request, body: dict) -> web.Response:
        """Keep an arrangement the reader made by dragging."""
        answer = await asyncio.to_thread(
            desktop_layout.write, body.get("cells"), body.get("pinned"),
            body.get("unpinned"), body.get("off")
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/wallpapers")
    async def wallpapers(_request: web.Request) -> web.Response:
        """Every wallpaper the reader keeps for the desktop."""
        return web.json_response(await asyncio.to_thread(wallpaper.listing))

    @PromptServer.instance.routes.get(f"{PREFIX}/wallpaper")
    async def wallpaper_asset(request: web.Request) -> web.Response:
        """One wallpaper's bytes, from the reader's own directory."""
        payload, kind, problem = await asyncio.to_thread(
            wallpaper.asset, request.query.get("name", "")
        )
        if problem:
            return web.json_response({"ok": False, "reason": problem}, status=404)
        return web.Response(body=payload, content_type=kind, headers=_ASSET_HEADERS)

    @PromptServer.instance.routes.post(f"{PREFIX}/wallpaper/save")
    async def wallpaper_save(request: web.Request) -> web.Response:
        """Keep an image the reader picked, named by the query and carried as the body."""
        payload = await request.read()
        answer = await asyncio.to_thread(
            wallpaper.save, request.query.get("name", ""), payload
        )
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/wallpaper/remove")
    @_json_body
    async def wallpaper_remove(_request: web.Request, body: dict) -> web.Response:
        """Take one wallpaper off disk."""
        answer = await asyncio.to_thread(wallpaper.remove, str(body.get("name") or ""))
        return web.json_response(answer, status=200 if answer["ok"] else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/pack-asset")
    async def pack_asset(request: web.Request) -> web.Response:
        """One image a pack ships beside a theme it declares."""
        parts, kind, problem = usertheme.asset_parts(request.query.get("path", ""))
        if problem:
            return web.json_response({"ok": False, "reason": problem}, status=404)
        payload = await asyncio.to_thread(
            _pack_bytes, request.query.get("repo", ""), "/".join(parts), usertheme.ASSET_LIMIT
        )
        if not payload:
            return web.json_response({"ok": False, "reason": "no such file"}, status=404)
        if len(payload) > usertheme.ASSET_LIMIT:
            return web.json_response(
                {"ok": False,
                 "reason": f"is larger than {usertheme.ASSET_LIMIT // 1000}kB"},
                status=404,
            )
        return web.Response(
            body=payload,
            content_type=kind,
            headers=_ASSET_HEADERS,
        )

    @PromptServer.instance.routes.get(f"{PREFIX}/theme-updates")
    async def theme_updates(_request: web.Request) -> web.Response:
        """Themes the installed packs declare, for comparing against the stored copies."""
        found = await asyncio.to_thread(_declared_themes)
        return web.json_response({"ok": True, "themes": found})

    @PromptServer.instance.routes.get(f"{PREFIX}/user-themes")
    async def user_themes(_request: web.Request) -> web.Response:
        """Every theme the reader keeps in their own themes directory."""
        found = await asyncio.to_thread(usertheme.listing)
        return web.json_response({"ok": True, **found})

    @PromptServer.instance.routes.get(f"{PREFIX}/media")
    async def readme_media(request: web.Request) -> web.Response:
        """Signed URLs for the attachments a README embeds."""
        repo = request.query.get("repo", "")
        if not repo:
            return web.json_response({"ok": False, "reason": "repo is required"}, status=400)
        async with aiohttp.ClientSession() as session:
            found = await metadata.attachment_media(repo, session, keys.secret("github"))
        return web.json_response({"ok": True, "media": found, "ttl": metadata.MEDIA_TTL})

    @PromptServer.instance.routes.get(f"{PREFIX}/repo-meta")
    async def repo_meta(request: web.Request) -> web.Response:
        """Answer a repository's README and support fields for a pack matched from GitHub."""
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
        """Download a pack's example workflow file and return it once it parses as one."""
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
                for candidate in (_safe_ref(branch), "main", "Main", "master"):
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
        """Download a theme a pack ships and return it once it parses as a palette."""
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
                for candidate in (_safe_ref(branch), "main", "Main", "master"):
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
        """Begin a reputation scan of an installed pack."""
        if not isinstance(body, dict):
            return web.json_response({"ok": False, "reason": "invalid request body"}, status=400)
        key = keys.secret("virustotal")
        pack_id = str(body.get("id") or "").strip()
        if not key:
            return web.json_response({"ok": False, "reason": "no VirusTotal key set"}, status=400)
        if not pack_id:
            return web.json_response({"ok": False, "reason": "no pack named"}, status=400)
        directory = await asyncio.to_thread(installer.resolve_install_dir, pack_id)
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
        """Install a pack's requirements after the fact."""
        if not gates.INSTALL:
            return web.json_response(gates.refuse('install'), status=403)
        pack_id = str((body or {}).get("id") or "").strip()
        if not pack_id:
            return web.json_response({"ok": False, "reason": "no pack named"}, status=400)
        directory = await asyncio.to_thread(installer.resolve_install_dir, pack_id)
        if directory is None:
            return web.json_response({"ok": False, "reason": f"{pack_id} is not installed"}, status=404)
        policy = installer.install_policy((body or {}).get("policy", "all"))
        ok, output = await asyncio.to_thread(installer.install_requirements, directory, "",
            policy,
        )
        return web.json_response({"ok": ok, "output": output})

    @PromptServer.instance.routes.get(f"{PREFIX}/status-reasons/" + "{node_id}")
    async def status_reasons(request: web.Request) -> web.Response:
        """Why each version of a pack carries the status it does."""
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
        """The node classes one published version of a pack registers."""
        node_id = request.match_info.get("node_id", "")
        version = (request.query.get("version") or "").strip()
        repo = (request.query.get("repo") or "").strip()
        wants_index = _flag(request.query.get("index"))
        if not node_id or not version:
            return web.json_response(
                {"ok": False, "reason": "a pack and a version are both needed"}, status=400)

        found: list = []
        source = ""
        refused = ""
        here = await asyncio.to_thread(installer.installed_version, node_id)
        on_disk = version == INSTALLED_MARK
        async with aiohttp.ClientSession() as session:
            if not on_disk:
                try:
                    found = list(await registry.fetch_comfy_nodes(node_id, version, session))
                    source = "registry" if found else ""
                except registry.RegistryError as error:
                    refused = error.detail or "the registry did not answer"

            if not found and (on_disk or (here and here.strip() == version)):
                directory = await asyncio.to_thread(installer.resolve_install_dir, node_id)
                if directory is not None:
                    found = await asyncio.to_thread(localnodes.registered, directory)
                    source = "install" if found else source

            if not found and wants_index:
                index = await nodemap.classes_for(repo, session)
                if index.get("classes"):
                    found = [{"name": one} for one in index["classes"]]
                    source = "community"

        if not found and refused:
            return web.json_response({"ok": False, "reason": refused}, status=502)
        return web.json_response({"ok": True, "known": bool(found), "source": source,
                                  "installed": here, "indexable": bool(repo) and not here,
                                  "nodes": found})

    @PromptServer.instance.routes.get(f"{PREFIX}/environment")
    async def environment_changes(_request: web.Request) -> web.Response:
        """What recent installs did to the Python environment, newest first."""
        entries = await asyncio.to_thread(environment.recorded)
        for entry in entries:
            entry["plan"] = environment.restore_plan(entry.get("diff") or {})
        return web.json_response({"ok": True, "entries": entries})

    @PromptServer.instance.routes.post(f"{PREFIX}/environment/restore")
    @_json_body
    async def environment_restore(request: web.Request, body: dict) -> web.Response:
        """Put the packages back as they were before one install."""

        entry_id = str(body.get("id", "")).strip()
        recorded = await asyncio.to_thread(environment.recorded)
        entry = next((one for one in recorded if one.get("id") == entry_id), None)
        if entry is None:
            return web.json_response(
                {"ok": False, "reason": "no record of that install"}, status=404)

        diff = entry.get("diff") or {}
        plan = environment.restore_plan(diff)
        if not body.get("confirm"):
            return web.json_response({"ok": True, "preview": True, "entry": entry, "plan": plan})

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
        """What can be read about an installed pack from the copy on disk."""
        node_id = request.match_info.get("node_id", "")
        if not node_id:
            return web.json_response({"ok": False, "reason": "no pack named"}, status=400)
        found = await asyncio.to_thread(local_pack.describe, node_id)
        return web.json_response(found, status=200 if found.get("ok") else 404)

    @PromptServer.instance.routes.get(f"{PREFIX}/topic")
    async def topic_search(request: web.Request) -> web.Response:
        """Which packs carry a GitHub topic."""
        name = (request.query.get("name") or "").strip()
        async with aiohttp.ClientSession() as session:
            answer = await topics.packs_for(name, session)
        return web.json_response(answer, status=200 if answer.get("ok") else 502)

    @PromptServer.instance.routes.get(f"{PREFIX}/refs")
    async def repo_refs(request: web.Request) -> web.Response:
        """List a repository's branches, tags and most recent commits."""
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
                "GitHub's hourly limit is spent; a GitHub token, set under Open Manager > "
                "Access keys, raises it"
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
        """Read a pack's README and declared table at one branch or commit."""
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
        """Serve one image a pack lists in ``[tool.open_manager] gallery``."""
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
                for candidate in (_safe_ref(branch), "main", "Main", "master"):
                    if not candidate:
                        continue
                    url = f"https://raw.githubusercontent.com/{owner}/{name}/{candidate}/{clean}"
                    try:
                        async with session.get(
                            url, timeout=aiohttp.ClientTimeout(total=20)
                        ) as answer:
                            if answer.status == 200:
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
        """Put one model on the queue, or say why it cannot go on."""
        if not gates.DOWNLOADS:
            return web.json_response(gates.refuse('downloads'), status=403)
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
        held = await asyncio.to_thread(pack_health.holds)
        return web.json_response({"ok": True, "holds": held})

    @PromptServer.instance.routes.post(f"{PREFIX}/hold")
    @_json_body
    async def set_hold(request: web.Request, body: dict) -> web.Response:
        """Hold a pack at its installed version, or stop holding it."""
        name = str(body.get("name") or "")
        if _flag(body.get("off", False)):
            return web.json_response(await asyncio.to_thread(pack_health.release, name))
        return web.json_response(await asyncio.to_thread(
            pack_health.hold, name, str(body.get("version") or "")))

    @PromptServer.instance.routes.post(f"{PREFIX}/star")
    @_json_body
    async def star_repo(request: web.Request, body: dict) -> web.Response:
        """Read or set whether the reader has starred a repository."""
        owner_repo = metadata._owner_repo(str(body.get("repo") or ""))
        if owner_repo is None:
            return web.json_response(
                {"ok": False, "reason": "not a GitHub repository"}, status=400)
        owner, name = owner_repo
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
        """One markdown file from a pack, for a README that links its own documentation."""
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
                for candidate in (_safe_ref(branch), "main", "Main", "master"):
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
        """Which access keys are held, and what each is for."""
        return web.json_response(keys.listing())

    @PromptServer.instance.routes.post(f"{PREFIX}/keys")
    @_json_body
    async def set_key(request: web.Request, body: dict) -> web.Response:
        """Keep an access key, or forget one."""
        if not gates.KEYS:
            return web.json_response(gates.refuse('keys'), status=403)
        name = str(body.get("name") or "")
        if _flag(body.get("forget")):
            answer = keys.forget(name)
        else:
            answer = keys.store(name, str(body.get("value") or ""))
        return web.json_response(answer, status=200 if answer.get("ok") else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/collisions")
    async def node_collisions(_request: web.Request) -> web.Response:
        """Node names more than one installed pack registers, and which one is in use."""
        return web.json_response(await asyncio.to_thread(pack_health.collisions))

    @PromptServer.instance.routes.post(f"{PREFIX}/downloads/plan")
    @_json_body
    async def plan_downloads(request: web.Request, body: dict) -> web.Response:
        """What these downloads would ask of each drive, before any of them are queued."""
        items = body.get("items")
        return web.json_response(await downloads.plan(items if isinstance(items, list) else []))

    @PromptServer.instance.routes.post(f"{PREFIX}/downloads/action")
    @_json_body
    async def download_action(request: web.Request, body: dict) -> web.Response:
        """Resume, pause or cancel one download, or remove one or several from the list."""
        if not gates.DOWNLOADS:
            return web.json_response(gates.refuse('downloads'), status=403)
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
            return web.json_response(await asyncio.to_thread(downloads.delete_file, download_id))
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

    @PromptServer.instance.routes.get(f"{PREFIX}/monitor/tdr")
    async def monitor_tdr(request: web.Request) -> web.Response:
        """Windows' GPU timeout, and the driver resets it has caused."""
        refresh = _flag(request.query.get("refresh", False))
        return web.json_response(await asyncio.to_thread(tdr.status, refresh))

    stall.start()

    @PromptServer.instance.routes.get(f"{PREFIX}/stall")
    async def stall_state(_request: web.Request) -> web.Response:
        """What happens when a run stops answering, and anything waiting on an answer."""
        return web.json_response({"ok": True, **stall.state()})

    @PromptServer.instance.routes.post(f"{PREFIX}/stall/config")
    @_json_body
    async def stall_config(_request: web.Request, body: dict) -> web.Response:
        """Set what happens when a run stops answering."""
        return web.json_response({"ok": True, "config": stall.configure(
            body.get("mode"), body.get("minutes"))})

    @PromptServer.instance.routes.post(f"{PREFIX}/stall/unstick")
    @_json_body
    async def stall_unstick(request: web.Request, body: dict) -> web.Response:
        """Interrupt the run, and restart ComfyUI with its queue if it is stuck."""
        if not gates.RESTART:
            return web.json_response(gates.refuse('restart'), status=403)
        peer = request.transport.get_extra_info("peername") if request.transport else None
        if (peer[0] if peer else "") not in _LOOPBACK:
            return web.json_response({"ok": False, "reason": "restart is loopback-only"}, status=403)
        return web.json_response(stall.unstick(stall.MANUAL_GRACE, "asked from the browser",
                                               now=_flag(body.get("now"))))

    @PromptServer.instance.routes.post(f"{PREFIX}/stall/dismiss")
    @_json_body
    async def stall_dismiss(_request: web.Request, body: dict) -> web.Response:
        """Leave a stuck run alone."""
        return web.json_response({"ok": True, **stall.dismiss(str(body.get("prompt_id") or ""))})

    @PromptServer.instance.routes.post(f"{PREFIX}/stall/seen")
    @_json_body
    async def stall_seen(_request: web.Request, _body: dict) -> web.Response:
        """Mark the last restart as told."""
        return web.json_response({"ok": True, **stall.seen()})

    @PromptServer.instance.routes.get(f"{PREFIX}/monitor/models")
    async def monitor_models(_request: web.Request) -> web.Response:
        """The models ComfyUI is holding, and where each one's weights are."""
        return web.json_response(await asyncio.to_thread(monitor.models))

    @PromptServer.instance.routes.post(f"{PREFIX}/monitor")
    @_json_body
    async def monitor_lease(request: web.Request, body: dict) -> web.Response:
        """Ask for machine readings, renew that request, or give it up."""
        client = str(body.get("client") or "")
        if _flag(body.get("release")):
            return web.json_response({"ok": True, **monitor.release(client)})
        try:
            interval = float(body.get("interval") or monitor.DEFAULT_INTERVAL)
        except (TypeError, ValueError):
            interval = monitor.DEFAULT_INTERVAL
        answer = monitor.lease(client, interval, watch=_flag(body.get("watch")))
        first = await asyncio.to_thread(monitor.sample)
        try:
            first["activity"] = monitor.activity(first)
        except Exception:  # noqa: BLE001
            pass
        return web.json_response({"ok": True, "reading": first, **answer})

    run_pause.install()

    @PromptServer.instance.routes.post(f"{PREFIX}/pause")
    @_json_body
    async def pause_run(request: web.Request, body: dict) -> web.Response:
        """Pause the running prompt to disk, and answer once it has been written."""
        widgets = body.get("widgets")
        answer = await asyncio.to_thread(
            run_pause.request, str(body.get("mode") or "boundary"),
            widgets if isinstance(widgets, list) else None)
        return web.json_response(answer, status=200 if answer.get("ok") or answer.get("finished")
                                 else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/pause")
    async def pause_read(request: web.Request) -> web.Response:
        """A workflow's saved pause, or every saved pause where none is named."""
        workflow_id = request.query.get("workflow", "").strip()
        if not workflow_id:
            found = await asyncio.to_thread(run_pause.listing)
            return web.json_response({"ok": True, "available": run_pause.available(),
                                      "pauses": found})
        found = await asyncio.to_thread(run_pause.read, workflow_id)
        return web.json_response({"ok": True, "available": run_pause.available(),
                                  "pause": found})

    @PromptServer.instance.routes.post(f"{PREFIX}/pause/discard")
    @_json_body
    async def pause_discard(request: web.Request, body: dict) -> web.Response:
        """Delete a workflow's saved pause."""
        workflow_id = str(body.get("workflow") or "").strip()
        if not workflow_id:
            return web.json_response({"ok": False, "reason": "no workflow named"}, status=400)
        removed = await asyncio.to_thread(run_pause.discard, workflow_id)
        return web.json_response({"ok": True, "removed": removed})

    @PromptServer.instance.routes.post(f"{PREFIX}/monitor/free")
    @_json_body
    async def monitor_free(request: web.Request, body: dict) -> web.Response:
        """Ask ComfyUI to let go of what it is holding."""
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
    async def self_state(request: web.Request) -> web.Response:
        """How Open Manager is installed here, and what updating it takes."""
        check = _flag(request.query.get("check"))
        return web.json_response(await asyncio.to_thread(selfupdate.state, check))

    @PromptServer.instance.routes.post(f"{PREFIX}/pack/toggle")
    @_json_body
    async def pack_toggle(request: web.Request, body: dict) -> web.Response:
        """Switch a pack off, or back on, by renaming its directory."""
        result = await asyncio.to_thread(
            pack_health.toggle, str(body.get("name") or ""), _flag(body.get("off", True)))
        return web.json_response(result, status=200 if result.get("ok") else 400)

    @PromptServer.instance.routes.get(f"{PREFIX}/library")
    async def library_index(request: web.Request) -> web.Response:
        """Every model file on disk, across every folder ComfyUI registers."""
        refresh = _flag(request.query.get("refresh"))
        found = await asyncio.to_thread(library.index, refresh)
        return web.json_response(found)

    @PromptServer.instance.routes.get(f"{PREFIX}/library/duplicates")
    async def library_duplicates(request: web.Request) -> web.Response:
        """Files held in more than one place, checked as far as the caller asks."""
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
        """Delete the part files left by downloads that never finished."""
        wanted = (body or {}).get("paths")
        removed = await asyncio.to_thread(
            library.sweep_partials, wanted if isinstance(wanted, list) else None)
        return web.json_response({"ok": True, **removed})

    @PromptServer.instance.routes.get(f"{PREFIX}/library/references")
    async def library_references(_request: web.Request) -> web.Response:
        """The model filenames the saved workflows appear to ask for."""
        found = await asyncio.to_thread(library.references)
        return web.json_response(found)

    @PromptServer.instance.routes.post(f"{PREFIX}/library/references")
    @_json_body
    async def library_references_with_open(request: web.Request, body: dict) -> web.Response:
        """The model filenames the saved and open workflows appear to ask for."""
        opened = body.get("open")
        found = await asyncio.to_thread(
            library.references, opened if isinstance(opened, list) else None)
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
        """Where one model came from, as far as anything here recorded it."""
        found = await asyncio.to_thread(library.provenance, str(body.get("path") or ""))
        return web.json_response(found, status=200 if found.get("ok") else 400)

    @PromptServer.instance.routes.post(f"{PREFIX}/library/delete")
    @_json_body
    async def library_delete(request: web.Request, body: dict) -> web.Response:
        """Delete one model file."""
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
        """Every path ComfyUI registers for one model folder, with the space left on each."""
        directory = request.query.get("directory", "").strip()
        if directory not in _model_folder_names():
            return web.json_response({"ok": False, "roots": [], "reason": "unknown folder"})
        return web.json_response({"ok": True, "directory": directory,
                                  "roots": model_policy.roots(directory)})

    @PromptServer.instance.routes.post(f"{PREFIX}/models/check")
    @_json_body
    async def check_model(request: web.Request, body: dict) -> web.Response:
        """Whether a URL may be downloaded, and what it would be saved as."""
        declared = str(body.get("url") or "").strip()
        url = model_policy.normalise(declared)
        directory = str(body.get("directory") or "")
        name = str(body.get("name") or "") or unquote(url.split("?")[0].rsplit("/", 1)[-1])
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
        """The models a workflow asks for, and which of them are already on disk."""
        document = (body if isinstance(body, dict) else {}).get("workflow")
        found = []
        declared = await asyncio.to_thread(library.declared_models, document)
        for item in declared:
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
        """The registry pack a repository belongs to, for links between pack pages."""
        pack_id = request.query.get("id", "").strip()
        if pack_id:
            folded = _fold(pack_id)
            for entry in await asyncio.to_thread(catalog.load):
                if _fold(entry.get("id")) == folded:
                    return web.json_response(
                        {"id": entry.get("id", ""), "repository": entry.get("repository", "")}
                    )
            return web.json_response({"id": "", "repository": ""})

        wanted = _norm_repo(request.query.get("repo", ""))
        if not wanted:
            return web.json_response({"id": ""})
        for entry in await asyncio.to_thread(catalog.load):
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
        """Answer what installing one version would change in this environment."""
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
        if not gates.INSTALL:
            return web.json_response(gates.refuse('install'), status=403)

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
            if gates.APPROVED_ONLY:
                try:
                    held = await registry.fetch_versions(node_id, session)
                except registry.RegistryError:
                    held = ()
                found = next((one for one in held if one.version == version), None)
                if found is None or found.status != "active":
                    answer = gates.refuse("approved")
                    answer["reason"] = (
                        f"only versions the registry lists as active install here; "
                        f"{node_id} {version} is "
                        f"{found.status if found else 'not listed'} "
                        f"({gates.NAMES['approved']})"
                    )
                    return web.json_response(answer, status=403)
            try:
                target = await registry.install_target(node_id, version, session)
            except registry.RegistryError as error:
                return web.json_response(
                    {"ok": False, "reason": f"registry: {error.status} {error.detail}"},
                    status=502,
                )

        with_deps = bool(body.get("with_deps", True))
        overwrite = bool(body.get("overwrite", False))
        policy = installer.install_policy(body.get("policy", "all"))

        before = await asyncio.to_thread(environment.snapshot) if with_deps else {}
        result = await asyncio.to_thread(installer.install, node_id, version,
            target.get("download_url", ""), "", with_deps, overwrite, policy,
        )
        answer = result.to_json()
        if before:
            after = await asyncio.to_thread(environment.snapshot)
            diff = environment.compare(before, after)
            answer["environment"] = diff
            answer["environment_id"] = await asyncio.to_thread(environment.record, node_id, version, diff)
        return web.json_response(answer, status=200 if result.ok else 409)

    @PromptServer.instance.routes.post(f"{PREFIX}/inspect-repo")
    @_json_body
    async def inspect_repo(request: web.Request, body: dict) -> web.Response:
        """Inspect a GitHub pack (contents, install scripts, dependency impact) without installing."""
        if not gates.GITHUB:
            return web.json_response(gates.refuse('github'), status=403)
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
        if not gates.GITHUB or not gates.INSTALL or gates.APPROVED_ONLY:
            return web.json_response(
                gates.refuse("approved" if gates.APPROVED_ONLY else "github"), status=403)
        repo = str(body.get("repo", "")).strip()
        if not repo:
            return web.json_response({"ok": False, "reason": "repo is required"}, status=400)
        with_deps = bool(body.get("with_deps", True))
        ref = str(body.get("ref", "")).strip()
        if ref and not metadata.valid_ref(ref):
            return web.json_response({"ok": False, "reason": "invalid ref"}, status=400)
        overwrite = bool(body.get("overwrite"))
        policy = installer.install_policy(body.get("policy", "all"))
        before = await asyncio.to_thread(environment.snapshot) if with_deps else {}
        result = await asyncio.to_thread(installer.install_repo, repo, "", with_deps, ref, overwrite,
            policy,
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
        if not gates.INSTALL:
            return web.json_response(gates.refuse('install'), status=403)
        node_id = str(body.get("id", "")).strip()
        if not node_id:
            return web.json_response({"ok": False, "reason": "id is required"}, status=400)
        result = await asyncio.to_thread(installer.uninstall, node_id)
        return web.json_response(result.to_json(), status=200 if result.ok else 409)

    @PromptServer.instance.routes.post(f"{PREFIX}/reboot")
    @_json_body
    async def reboot(request: web.Request, _body: dict) -> web.Response:
        """Restart the ComfyUI server, so newly installed or removed packs take effect."""
        if not gates.RESTART:
            return web.json_response(gates.refuse('restart'), status=403)
        peer = request.transport.get_extra_info("peername") if request.transport else None
        host = peer[0] if peer else ""
        if host not in _LOOPBACK:
            return web.json_response({"ok": False, "reason": "restart is loopback-only"}, status=403)
        asyncio.get_running_loop().call_later(0.6, _reboot)
        return web.json_response({"ok": True})

    @PromptServer.instance.routes.get(f"{PREFIX}/catalog")
    async def catalog_get(_request: web.Request) -> web.Response:
        """The cached catalogue, for offline browsing, searching and sorting."""
        info = await asyncio.to_thread(catalog.state)
        return web.json_response({"nodes": catalog.browsable(), **info})

    @PromptServer.instance.routes.get(f"{PREFIX}/catalog/state")
    async def catalog_state(_request: web.Request) -> web.Response:
        """Whether the catalogue is cached, its size and age, and any sync in progress."""
        return web.json_response(await asyncio.to_thread(catalog.state))

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
        """Start a background sync where the configured renewal policy calls for it."""
        policy = str(body.get("policy", "startup"))
        try:
            stale_days = float(body.get("stale_days", 7) or 7)
        except (TypeError, ValueError):
            stale_days = 7.0
        triggered = catalog.should_auto_sync(policy, stale_days)
        if triggered:
            asyncio.get_running_loop().create_task(catalog.sync(_sync_concurrency(body)))
        held = await asyncio.to_thread(catalog.state)
        return web.json_response({"triggered": triggered, **held})

    @PromptServer.instance.routes.get(f"{PREFIX}/installed")
    async def installed(_request: web.Request) -> web.Response:
        """List the packs currently in custom_nodes."""
        packs = await asyncio.to_thread(installer.list_installed)
        index = {}
        for entry in await asyncio.to_thread(catalog.load):
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
            pack["source"] = (
                "github" if pack.get("from_git")
                else "registry" if pack["registry_id"]
                else "disk"
            )

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

        repo_index = {}
        for entry in await asyncio.to_thread(catalog.load):
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
                })
        held = await asyncio.to_thread(
            lambda ids: {one: installer.installed_version(one) for one in ids},
            sorted({one["pack_id"] for one in packs if one["pack_id"]}),
        )
        for one in packs:
            one["installed_version"] = held.get(one["pack_id"], "")
        packs.sort(key=lambda p: (not p["installable"], p["title"].lower()))
        return web.json_response({"packs": packs, "unresolved": sorted(unresolved)})

    @PromptServer.instance.routes.post(f"{PREFIX}/licenses")
    @_json_body
    async def resolve_licenses(request: web.Request, body: dict) -> web.Response:
        """Read licences from repositories for listing rows the registry left unnamed."""
        raw = body.get("items")
        items = [
            (str(i.get("id", "")), str(i.get("repository", "")))
            for i in raw
            if isinstance(i, dict) and i.get("id") and i.get("repository")
        ] if isinstance(raw, list) else []
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
        def _state(held: list) -> list:
            for one in held:
                directory = installer.resolve_install_dir(one["name"])
                one["installed_version"] = installer.installed_version(one["name"])
                one["dir"] = directory.name if directory is not None else ""
            return held

        rows = await asyncio.to_thread(sources.load)
        rows = await asyncio.to_thread(_state, rows)
        return web.json_response({"repos": rows})

    @PromptServer.instance.routes.post(f"{PREFIX}/github")
    @_json_body
    async def github_add(request: web.Request, body: dict) -> web.Response:
        """Put a GitHub repository on the user's list."""
        if not gates.GITHUB:
            return web.json_response(gates.refuse('github'), status=403)
        result = sources.add(str(body.get("url", "")))
        return web.json_response(result, status=200 if result["ok"] else 422)

    @PromptServer.instance.routes.post(f"{PREFIX}/github/remove")
    @_json_body
    async def github_remove(request: web.Request, body: dict) -> web.Response:
        """Take a repository off the list, uninstalling the pack where it is installed."""
        if not gates.INSTALL:
            return web.json_response(gates.refuse('install'), status=403)
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
        here = await asyncio.to_thread(installer.resolve_install_dir, pair[1])
        if here is not None:
            outcome = await asyncio.to_thread(installer.uninstall, pair[1])
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

    try:
        PromptServer.instance.app.middlewares.append(_uncached_modules)
    except RuntimeError as error:
        logger.warning("panel modules may be cached by the browser (%s)", error)

    _registered = True
    logger.info("routes registered below %s", PREFIX)
