"""HTTP routes serving registry data, findings and installs to the panel.

Every route sits under a versioned prefix, leaving room for a later revision beside it.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time

import aiohttp
from aiohttp import web

from . import (
    catalog,
    deps,
    developer,
    impact,
    installer,
    license_files,
    licenses,
    log,
    metadata,
    nodemap,
    registry,
    risk,
    sources,
)

__all__ = ["ALLOW_BANNED", "PREFIX", "register_routes"]

#: Every route this package serves sits below this versioned prefix.
PREFIX = "/open_manager/v1/api"

#: Statuses blocked rather than warned about. ``OPEN_MANAGER_ALLOW_BANNED=1`` lifts the
#: block and treats a ban as a warning.
BLOCKED_STATUSES = ("banned",)

#: Whether a banned version may be installed after acknowledgement rather than blocked.
ALLOW_BANNED = os.environ.get("OPEN_MANAGER_ALLOW_BANNED", "").strip().lower() in (
    "1",
    "true",
    "yes",
)

logger = log.get_logger("routes")

_registered = False

#: Hosts allowed to trigger a server restart.
_LOOPBACK = ("127.0.0.1", "::1", "localhost")


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


def _local_developer(repo: str) -> dict:
    """The ``[tool.open_manager]`` table from the installed copy of a pack.

    Args:
        repo: The pack's repository URL.

    Returns:
        The declared table, empty where the pack is not installed or declares none.
    """
    return developer.from_pyproject(_pack_file(repo, "pyproject.toml", 400_000))


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


def _installable(status: str) -> tuple[bool, str]:
    """Whether a version may be installed, and why not where it may not.

    Args:
        status: Short registry status.

    Returns:
        ``(installable, reason)``. ``reason`` is empty where the version installs.
    """
    if status in BLOCKED_STATUSES and not ALLOW_BANNED:
        return False, (
            "The registry banned this version. A ban is applied for illegal content or "
            "malware, so it is blocked rather than warned about. Set "
            "OPEN_MANAGER_ALLOW_BANNED=1 to install it anyway."
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


def _version_json(entry: registry.NodeVersion, pack_id: str) -> dict:
    """One version, with everything worth saying about installing it."""
    assessment = risk.assess_version(
        pack_id=pack_id,
        version=entry.version,
        status=entry.status,
        dependencies=entry.dependencies,
        deprecated=entry.deprecated,
    )
    installable, blocked_reason = _installable(entry.status)
    return {
        "version": entry.version,
        "status": entry.status,
        "created_at": entry.created_at,
        "deprecated": entry.deprecated,
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
                        license_files.resolve(record.repository, session), timeout=8
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
                    "supported_os": list(record.supported_os),
                    "supported_comfyui": record.supported_comfyui,
                    "supported_accelerators": list(record.supported_accelerators),
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
                "versions": [_version_json(entry, record.node_id) for entry in versions],
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
            meta = await metadata.fetch(node_id, record.repository, sig, session)
        payload = meta.to_json()
        payload["repository"] = record.repository
        # An installed pack's own pyproject describes the copy in use and wins over the
        # repository's.
        payload["developer"] = _local_developer(record.repository) or payload.get("developer") or {}
        payload["incompatible"] = developer.resolve_incompatible(
            payload["developer"].get("incompatible", [])
        )
        return web.json_response(payload)

    @PromptServer.instance.routes.get(f"{PREFIX}/repo-meta")
    async def repo_meta(request: web.Request) -> web.Response:
        """Answer a repository's README and support fields for a pack matched from GitHub.

        The licence is classified from what the repository declares.
        """
        repo = request.query.get("repo", "")
        if not repo:
            return web.json_response({"error": "no repository named"}, status=400)
        async with aiohttp.ClientSession() as session:
            meta = await metadata.fetch_repo(repo, session)
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
                for candidate in (branch, "main", "master"):
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
                for candidate in (branch, "main", "master"):
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

        report = await asyncio.get_running_loop().run_in_executor(
            None, impact.analyse, list(entry.dependencies), ""
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
    async def do_install(request: web.Request) -> web.Response:
        """Install a specific version of a pack, from the registry, without the host manager."""
        try:
            body = await request.json()
        except ValueError:
            return web.json_response({"ok": False, "reason": "invalid request body"}, status=400)

        node_id = str(body.get("id", "")).strip()
        version = str(body.get("version", "")).strip()
        if not node_id or not version:
            return web.json_response(
                {"ok": False, "reason": "id and version are required"}, status=400
            )

        status = str(body.get("status", "")).strip()
        allowed, blocked_reason = _installable(status) if status else (True, "")
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
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, installer.install, node_id, version,
            target.get("download_url", ""), "", with_deps, overwrite,
        )
        return web.json_response(result.to_json(), status=200 if result.ok else 409)

    @PromptServer.instance.routes.post(f"{PREFIX}/inspect-repo")
    async def inspect_repo(request: web.Request) -> web.Response:
        """Inspect a GitHub pack (contents, install scripts, dependency impact) without installing."""
        try:
            body = await request.json()
        except ValueError:
            return web.json_response({"ok": False, "reason": "invalid request body"}, status=400)
        repo = str(body.get("repo", "")).strip()
        if not repo:
            return web.json_response({"ok": False, "reason": "repo is required"}, status=400)
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, installer.inspect_repo, repo)
        return web.json_response(result, status=200 if result.get("ok") else 502)

    @PromptServer.instance.routes.post(f"{PREFIX}/install-repo")
    async def install_repo(request: web.Request) -> web.Response:
        """Install a pack from its GitHub repository, for packs not on the registry."""
        try:
            body = await request.json()
        except ValueError:
            return web.json_response({"ok": False, "reason": "invalid request body"}, status=400)
        repo = str(body.get("repo", "")).strip()
        if not repo:
            return web.json_response({"ok": False, "reason": "repo is required"}, status=400)
        with_deps = bool(body.get("with_deps", True))
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, installer.install_repo, repo, "", with_deps)
        return web.json_response(result.to_json(), status=200 if result.ok else 409)

    @PromptServer.instance.routes.post(f"{PREFIX}/uninstall")
    async def do_uninstall(request: web.Request) -> web.Response:
        """Remove an installed pack."""
        try:
            body = await request.json()
        except ValueError:
            return web.json_response({"ok": False, "reason": "invalid request body"}, status=400)
        node_id = str(body.get("id", "")).strip()
        if not node_id:
            return web.json_response({"ok": False, "reason": "id is required"}, status=400)
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, installer.uninstall, node_id)
        return web.json_response(result.to_json(), status=200 if result.ok else 409)

    @PromptServer.instance.routes.post(f"{PREFIX}/reboot")
    async def reboot(request: web.Request) -> web.Response:
        """Restart the ComfyUI server, so newly installed or removed packs take effect."""
        peer = request.transport.get_extra_info("peername") if request.transport else None
        host = peer[0] if peer else ""
        if host not in _LOOPBACK:
            return web.json_response({"ok": False, "reason": "restart is loopback-only"}, status=403)
        # Respond first, then re-exec.
        asyncio.get_running_loop().call_later(0.6, _reboot)
        return web.json_response({"ok": True})

    @PromptServer.instance.routes.get(f"{PREFIX}/catalog")
    async def catalog_get(_request: web.Request) -> web.Response:
        """The cached catalogue, for offline browsing, searching and sorting."""
        info = catalog.state()
        return web.json_response({"nodes": catalog.load(), **info})

    @PromptServer.instance.routes.get(f"{PREFIX}/catalog/state")
    async def catalog_state(_request: web.Request) -> web.Response:
        """Whether the catalogue is cached, its size and age, and any sync in progress."""
        return web.json_response(catalog.state())

    @PromptServer.instance.routes.post(f"{PREFIX}/catalog/sync")
    async def catalog_sync(_request: web.Request) -> web.Response:
        """Start a catalogue sync in the background."""
        asyncio.get_running_loop().create_task(catalog.sync())
        return web.json_response({"ok": True})

    @PromptServer.instance.routes.post(f"{PREFIX}/catalog/auto-sync")
    async def catalog_auto_sync(request: web.Request) -> web.Response:
        """Start a background sync where the configured renewal policy calls for it.

        A per-session guard limits this to one renewal per server run.
        """
        try:
            body = await request.json()
        except ValueError:
            body = {}
        policy = str(body.get("policy", "startup"))
        try:
            stale_days = float(body.get("stale_days", 7) or 7)
        except (TypeError, ValueError):
            stale_days = 7.0
        triggered = catalog.should_auto_sync(policy, stale_days)
        if triggered:
            asyncio.get_running_loop().create_task(catalog.sync())
        return web.json_response({"triggered": triggered, **catalog.state()})

    @PromptServer.instance.routes.get(f"{PREFIX}/installed")
    async def installed(_request: web.Request) -> web.Response:
        """List the packs currently in custom_nodes.

        A pack matching a catalogue entry also carries its registry id, icon, and the version
        the registry advertises.
        """
        loop = asyncio.get_running_loop()
        packs = await loop.run_in_executor(None, installer.list_installed)
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
            pack["status"] = ""

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
    async def resolve_nodes(request: web.Request) -> web.Response:
        """Given node classes missing from a graph, name the packs that provide them."""
        try:
            body = await request.json()
        except ValueError:
            return web.json_response({"error": "invalid request body"}, status=400)
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
    async def resolve_licenses(request: web.Request) -> web.Response:
        """Read licences from repositories for listing rows the registry left unnamed.

        Each item is ``{id, repository}``. The answer is keyed by pack id.
        """
        try:
            body = await request.json()
        except ValueError:
            return web.json_response({"error": "invalid request body"}, status=400)
        raw = body.get("items") if isinstance(body, dict) else None
        items = [
            (str(i.get("id", "")), str(i.get("repository", "")))
            for i in raw
            if isinstance(i, dict) and i.get("id") and i.get("repository")
        ] if isinstance(raw, list) else []
        if not items:
            return web.json_response({"licenses": {}})

        async with aiohttp.ClientSession() as session:
            by_repo = await license_files.resolve_many([repo for _, repo in items], session)

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
        loop = asyncio.get_running_loop()
        rows = await loop.run_in_executor(None, sources.load)
        for row in rows:
            directory = installer.resolve_install_dir(row["name"])
            row["installed_version"] = installer.installed_version(row["name"])
            row["dir"] = directory.name if directory is not None else ""
        return web.json_response({"repos": rows})

    @PromptServer.instance.routes.post(f"{PREFIX}/github")
    async def github_add(request: web.Request) -> web.Response:
        """Put a GitHub repository on the user's list."""
        try:
            body = await request.json()
        except ValueError:
            return web.json_response({"ok": False, "reason": "invalid request body"}, status=400)
        result = sources.add(str(body.get("url", "")))
        return web.json_response(result, status=200 if result["ok"] else 422)

    @PromptServer.instance.routes.post(f"{PREFIX}/github/remove")
    async def github_remove(request: web.Request) -> web.Response:
        """Take a repository off the list, uninstalling the pack where it is installed."""
        try:
            body = await request.json()
        except ValueError:
            return web.json_response({"ok": False, "reason": "invalid request body"}, status=400)
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
            outcome = await asyncio.get_running_loop().run_in_executor(
                None, installer.uninstall, pair[1]
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
