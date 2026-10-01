"""ComfyUI-Manager's ``/v2`` job queue, answered by Open Manager's own installer.

The host interface drives pack installs from its missing-nodes panel and its manager dialog
through this API: tasks are queued, a worker runs them one at a time, and each start and
finish is broadcast as ``cm-task-started`` and ``cm-task-completed`` with the whole queue
state. Every task goes through the same gates, ban checks and install policy as the panel.
"""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from aiohttp import web

from . import catalog, gates, installer, log, paths
from . import health as pack_health

__all__ = ["register"]

logger = log.get_logger("manager_api")

KINDS = ("install", "uninstall", "update", "disable", "enable", "fix")

HISTORY_CAP = 200

MESSAGE_CAP = 40

_GIT_URL = re.compile(r"github\.com[:/]+([^/\s]+)/([^/\s]+?)(?:\.git)?/?$", re.IGNORECASE)

_VERSION = re.compile(r"^\d")

_pending: list[dict] = []

_running: dict | None = None

_history: dict[str, dict] = {}

_worker: asyncio.Task | None = None

_registered = False

_asks: dict[str, dict] = {}

ACK_SECONDS = 20

RUN_SECONDS = 3600


def _now() -> str:
    """The current time as the ISO text the interface expects."""
    return datetime.now(timezone.utc).isoformat()


def _setting(key: str, default):
    """One of the user's ComfyUI settings, read without writing the file.

    Args:
        key: Setting id.
        default: Value where the setting is absent or unreadable.

    Returns:
        The stored value, or ``default``.
    """
    root = paths.user_root()
    if root is None:
        return default
    try:
        held = json.loads((root / "default" / "comfy.settings.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default
    return held.get(key, default) if isinstance(held, dict) else default


def _policy() -> str:
    """The install policy the user chose for requirement changes."""
    return installer.install_policy(_setting("openManager.installPolicy", "new"))


def _fold(name: str) -> str:
    """A pack id or directory name folded for comparison."""
    return re.sub(r"[-_.]+", "-", (name or "").strip().lower())


def _bare(name: str) -> str:
    """A directory name without the suffix that switches a pack off."""
    return name[: -len(pack_health.DISABLED)] if name.endswith(pack_health.DISABLED) else name


def _git_repo(directory: Path) -> str:
    """``owner/repo`` of a working copy's GitHub remote, empty where there is none."""
    try:
        text = (directory / ".git" / "config").read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    for line in text.splitlines():
        if line.strip().startswith("url"):
            found = _GIT_URL.search(line.split("=", 1)[-1].strip())
            if found:
                return f"{found.group(1)}/{found.group(2)}"
    return ""


def _catalog_index() -> dict[str, dict]:
    """Registry catalogue entries keyed by folded id."""
    index = {}
    for entry in catalog.load():
        folded = _fold(entry.get("id", ""))
        if folded:
            index[folded] = entry
    return index


def _identity(pack: dict, index: dict[str, dict]) -> tuple[str, str]:
    """``(cnr_id, aux_id)`` for an installed pack, as the interface identifies packs.

    Args:
        pack: An entry from :func:`installer.list_installed`.
        index: Catalogue entries keyed by folded id.

    Returns:
        The registry id where the pack is on the registry, otherwise ``owner/repo`` of its
        GitHub remote as the auxiliary id. Both empty where neither is known.
    """
    bare = _bare(pack.get("dir", ""))
    entry = index.get(_fold(pack.get("id", ""))) or index.get(_fold(bare))
    if entry:
        return entry.get("id", ""), ""
    try:
        directory = installer.custom_nodes_dir() / pack.get("dir", "")
    except RuntimeError:
        return "", ""
    repo = _git_repo(directory)
    if repo:
        return "", repo
    if pack.get("id") and pack.get("id") != pack.get("dir"):
        return pack["id"], ""
    return "", ""


def installed_map() -> dict[str, dict]:
    """Installed packs in the shape the interface reads, keyed by their id.

    Returns:
        ``{id: {ver, cnr_id, aux_id, enabled}}``. Where a pack is present both switched on
        and off, the switched-on copy wins.
    """
    index = _catalog_index()
    found: dict[str, dict] = {}
    for pack in installer.list_installed():
        cnr_id, aux_id = _identity(pack, index)
        key = cnr_id or aux_id
        if not key:
            continue
        enabled = not pack.get("disabled")
        if key in found and found[key]["enabled"] and not enabled:
            continue
        found[key] = {
            "ver": str(pack.get("version") or ""),
            "cnr_id": cnr_id or None,
            "aux_id": aux_id or None,
            "enabled": enabled,
        }
    return found


def _find(pack_id: str) -> Path | None:
    """The directory holding a pack, switched on or off.

    Args:
        pack_id: Registry id, ``owner/repo``, or directory name.

    Returns:
        The switched-on copy where both exist, otherwise whichever exists, or ``None``.
    """
    try:
        base = installer.custom_nodes_dir()
    except RuntimeError:
        return None
    want = _fold(pack_id)
    repo_want = _fold(pack_id.split("/", 1)[1]) if "/" in pack_id else ""
    off = None
    for child in sorted(base.iterdir()):
        if not child.is_dir() or child.name.startswith(".") or child.name == "__pycache__":
            continue
        bare = _fold(_bare(child.name))
        named = _fold(installer._pyproject_name(child))
        hit = want in (bare, named)
        if not hit and repo_want:
            hit = repo_want == bare or _fold(_git_repo(child)) == want
        if not hit:
            continue
        if pack_health.is_disabled(child):
            off = off or child
        else:
            return child
    return off


def _trim(lines) -> list[str]:
    """Non-blank message lines, capped."""
    kept = [str(line).rstrip() for line in lines if str(line).strip()]
    return kept[:MESSAGE_CAP]


async def _task_install(task: dict, update: bool = False) -> tuple[str, list[str], str]:
    """Hand an install or update to the Open Manager page that queued it.

    The page runs Open Manager's own install flow for the pack: its trust prompt, the
    banned-version gate, the requirement policy, the VirusTotal scan and the failure
    dialogs, then reports the outcome here.
    """
    if not gates.INSTALL:
        return "error", _trim([gates.refuse("install").get("reason", "installs are off")]),             "refused"
    params = task.get("params") if isinstance(task.get("params"), dict) else {}
    pack_id = str(params.get("id") or params.get("node_name") or "").strip()
    if not pack_id:
        return "error", ["No pack was named."], "failed"
    wanted = "latest" if update else str(
        params.get("selected_version") or params.get("version") or "latest").strip()
    existing = await asyncio.to_thread(_find, pack_id)

    if existing is not None and pack_health.is_disabled(existing):
        switched = await asyncio.to_thread(pack_health.toggle, existing.name, False)
        if not switched.get("ok"):
            return "error", _trim([switched.get("reason", "the pack could not be switched on")]),                 "failed"
        logger.info("[Open Manager] switched %s on", pack_id)
        existing = await asyncio.to_thread(_find, pack_id)
        if wanted in ("", "latest") and not update:
            return "success", [f"Switched {pack_id} on."], "success"

    github = wanted == "nightly" or ("/" in pack_id and not update)
    installed_version = ""
    if existing is not None:
        installed_version = await asyncio.to_thread(installer._version_in, existing)
    return await _delegate(task, {
        "id": pack_id,
        "version": wanted,
        "update": update,
        "source": "github" if github else "registry",
        "repository": str(params.get("repository") or "").strip(),
        "installed": existing is not None,
        "installed_version": installed_version,
    })


async def _delegate(task: dict, job: dict) -> tuple[str, list[str], str]:
    """Ask the page that queued a task to run it, and wait for its outcome."""
    ui_id = task["ui_id"]
    loop = asyncio.get_running_loop()
    held = {"ack": loop.create_future(), "done": loop.create_future()}
    _asks[ui_id] = held
    try:
        _send("om-manager-run", {"ui_id": ui_id, "kind": task.get("kind"), **job},
              sid=task.get("client_id") or None)
        try:
            await asyncio.wait_for(asyncio.shield(held["ack"]), ACK_SECONDS)
        except asyncio.TimeoutError:
            return "error", ["No Open Manager page answered. Install it from Open Manager."],                 "refused"
        try:
            answer = await asyncio.wait_for(asyncio.shield(held["done"]), RUN_SECONDS)
        except asyncio.TimeoutError:
            return "error", ["The install did not finish within an hour."], "failed"
    finally:
        _asks.pop(ui_id, None)
    status = "success" if answer.get("status") == "success" else "error"
    messages = _trim(answer.get("messages") or [])
    return status, messages, "success" if status == "success" else "failed"


async def _task_uninstall(params: dict) -> tuple[str, list[str], str]:
    """Remove a pack, switched on or off."""
    if not gates.INSTALL:
        return "error", _trim([gates.refuse("install").get("reason", "installs are off")]), \
            "refused"
    pack_id = str(params.get("node_name") or "").strip()
    directory = await asyncio.to_thread(_find, pack_id)
    if directory is None:
        return "success", [f"{pack_id} was not installed."], "skip"
    if pack_health._ours(directory):
        return "error", ["Open Manager cannot remove itself from here."], "refused"
    root = installer.custom_nodes_dir().resolve()
    target = directory.resolve()
    if target.parent != root:
        return "error", ["Refusing to remove outside custom_nodes."], "refused"
    try:
        await asyncio.to_thread(installer._remove_tree, target)
    except OSError as error:
        return "error", _trim([f"removal failed: {error}"]), "failed"
    logger.info("[Open Manager] removed %s", target.name)
    return "success", [f"Removed {target.name}."], "success"


async def _task_toggle(params: dict, off: bool) -> tuple[str, list[str], str]:
    """Switch a pack off or back on."""
    pack_id = str(params.get("node_name") or params.get("cnr_id") or "").strip()
    directory = await asyncio.to_thread(_find, pack_id)
    if directory is None:
        return "error", [f"{pack_id} is not installed."], "failed"
    result = await asyncio.to_thread(pack_health.toggle, directory.name, off)
    if not result.get("ok"):
        return "error", _trim([result.get("reason", "the pack could not be switched")]), "failed"
    word = "off" if off else "on"
    logger.info("[Open Manager] switched %s %s", pack_id, word)
    return "success", [f"Switched {pack_id} {word}."], "success"


async def _task_fix(params: dict) -> tuple[str, list[str], str]:
    """Install a pack's requirements again."""
    if not gates.INSTALL:
        return "error", _trim([gates.refuse("install").get("reason", "installs are off")]), \
            "refused"
    pack_id = str(params.get("node_name") or "").strip()
    directory = await asyncio.to_thread(_find, pack_id)
    if directory is None:
        return "error", [f"{pack_id} is not installed."], "failed"
    logger.info("[Open Manager] installing the requirements of %s", pack_id)
    ok, output = await asyncio.to_thread(installer.install_requirements, directory, "", _policy())
    if ok:
        return "success", [f"Requirements of {pack_id} installed."], "success"
    return "error", _trim(output.splitlines()[-12:]), "failed"


async def _run(task: dict) -> tuple[str, list[str], str]:
    """Carry out one queued task."""
    kind = task.get("kind")
    params = task.get("params") if isinstance(task.get("params"), dict) else {}
    if kind == "install":
        return await _task_install(task)
    if kind == "update":
        return await _task_install(task, update=True)
    if kind == "uninstall":
        return await _task_uninstall(params)
    if kind == "disable":
        return await _task_toggle(params, True)
    if kind == "enable":
        return await _task_toggle(params, False)
    if kind == "fix":
        return await _task_fix(params)
    return "error", [f"{kind} is not supported by Open Manager."], "failed"


def _state(installed: dict | None = None) -> dict:
    """The whole queue state, as every task message carries it."""
    state = {
        "history": dict(_history),
        "running_queue": [_running] if _running else [],
        "pending_queue": list(_pending),
    }
    if installed is not None:
        state["installed_packs"] = installed
    return state


def _send(event: str, data: dict, sid: str | None = None) -> None:
    """Send a message to one client, or to every connected client."""
    from server import PromptServer

    PromptServer.instance.send_sync(event, data, sid)


async def _work() -> None:
    """Run queued tasks one at a time until the queue is empty."""
    global _running
    while _pending:
        task = _pending.pop(0)
        _running = task
        ui_id = task["ui_id"]
        kind = task["kind"]
        _send("cm-task-started", {"ui_id": ui_id, "kind": kind, "timestamp": _now(),
                                  "state": _state()})
        try:
            status, messages, result = await _run(task)
        except Exception as error:  # noqa: BLE001
            logger.warning("task %s failed (%s: %s)", kind, type(error).__name__, error)
            status, messages, result = "error", [f"{type(error).__name__}: {error}"], "failed"
        for line in messages:
            logger.info("[Open Manager] %s", line)
        _running = None
        stamp = _now()
        verdict = {"status_str": status, "completed": True, "messages": messages}
        _history[ui_id] = {"ui_id": ui_id, "client_id": task.get("client_id", ""),
                           "kind": kind, "timestamp": stamp, "result": result,
                           "status": verdict, "params": task.get("params", {})}
        while len(_history) > HISTORY_CAP:
            _history.pop(next(iter(_history)))
        try:
            installed = await asyncio.to_thread(installed_map)
        except Exception:  # noqa: BLE001
            installed = None
        _send("cm-task-completed", {"ui_id": ui_id, "kind": kind, "result": result,
                                    "status": verdict, "timestamp": stamp,
                                    "state": _state(installed)})


def _start() -> bool:
    """Start the worker if it is not already running.

    Returns:
        Whether a new worker was started.
    """
    global _worker
    if _worker is not None and not _worker.done():
        return False
    _worker = asyncio.get_running_loop().create_task(_work())
    return True


def _refused(reason: str, status: int) -> web.Response:
    """An error the interface shows as it is."""
    return web.json_response({"message": reason, "reason": reason}, status=status)


async def _body(request: web.Request) -> dict:
    """A request's JSON object body, empty where there is none."""
    try:
        data = await request.json()
    except (ValueError, UnicodeDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _queue_item(kind: str, params: dict, client_id: str, ui_id: str = "") -> dict:
    """A queue entry in the shape the interface reads back."""
    return {"ui_id": ui_id or str(uuid.uuid4()), "client_id": client_id or "unknown",
            "kind": kind, "params": params}


async def _update_all(client_id: str) -> int:
    """Queue an update for every registry pack with a newer active version.

    Returns:
        How many updates were queued.
    """
    index = await asyncio.to_thread(_catalog_index)
    queued = 0
    for pack in await asyncio.to_thread(installer.list_installed):
        if pack.get("disabled") or pack.get("from_git"):
            continue
        entry = index.get(_fold(pack.get("id", ""))) or index.get(_fold(pack.get("dir", "")))
        latest = (entry or {}).get("advertised", "")
        current = str(pack.get("version") or "")
        if not entry or not latest or not _VERSION.match(current) or current == latest:
            continue
        _pending.append(_queue_item("update", {"node_name": entry["id"], "node_ver": current},
                                    client_id))
        queued += 1
    return queued


def _import_failures() -> set[str]:
    """Folded names of the packs whose import failed at the last start."""
    report = pack_health.startup_times()
    return {_fold(_bare(name)) for name in report.get("failed", [])}


def _failure_for(pack_id: str, failed: set[str]) -> dict | None:
    """Import failure detail for one pack, ``None`` where it imported."""
    directory = _find(pack_id)
    names = {_fold(pack_id)}
    if directory is not None:
        names.add(_fold(_bare(directory.name)))
    if names & failed:
        return {"error": "The pack failed to import at the last start. See the ComfyUI log.",
                "traceback": ""}
    return None


def register() -> None:
    """Attach the ``/v2`` routes to the running server. Safe to call more than once."""
    global _registered
    if _registered:
        return
    from server import PromptServer

    from .routes import _LOOPBACK, _reboot

    routes = PromptServer.instance.routes

    @routes.post("/open_manager/v1/api/manager/answer")
    async def manager_answer(request: web.Request) -> web.Response:
        """The page's acknowledgement of a handed-over task, or its outcome."""
        body = await _body(request)
        held = _asks.get(str(body.get("ui_id") or ""))
        if held is None:
            return _refused("No task is waiting on that answer.", 404)
        if not held["ack"].done():
            held["ack"].set_result(True)
        if body.get("stage") == "done" and not held["done"].done():
            held["done"].set_result(body)
        return web.json_response({})

    @routes.post("/v2/manager/queue/task")
    async def queue_task(request: web.Request) -> web.Response:
        """Queue one task."""
        body = await _body(request)
        kind = str(body.get("kind") or "")
        params = body.get("params")
        if kind not in KINDS:
            return _refused(f"{kind or 'That task'} is not supported by Open Manager.", 400)
        if not isinstance(params, dict):
            return _refused("The task has no parameters.", 400)
        ui_id = str(body.get("ui_id") or "") or str(uuid.uuid4())
        _pending.append(_queue_item(kind, params, str(body.get("client_id") or ""), ui_id))
        return web.json_response({})

    @routes.post("/v2/manager/queue/start")
    async def queue_start(_request: web.Request) -> web.Response:
        """Start working through the queue."""
        return web.json_response({}, status=200 if _start() else 201)

    @routes.get("/v2/manager/queue/status")
    async def queue_status(request: web.Request) -> web.Response:
        """Counts for the queue, optionally for one client."""
        client = request.query.get("client_id", "")

        def mine(items):
            return [one for one in items if not client or one.get("client_id") == client]

        done = len(mine(_history.values()))
        running = len(mine([_running] if _running else []))
        pending = len(mine(_pending))
        answer = {"total_count": done + running + pending, "done_count": done,
                  "in_progress_count": running, "pending_count": pending,
                  "is_processing": bool(running or pending)}
        if client:
            answer["client_id"] = client
        return web.json_response(answer)

    @routes.get("/v2/manager/queue/history")
    async def queue_history(request: web.Request) -> web.Response:
        """Finished tasks, filtered as asked."""
        query = request.query
        items = list(_history.values())
        if query.get("ui_id"):
            items = [one for one in items if one["ui_id"] == query["ui_id"]]
        if query.get("client_id"):
            items = [one for one in items if one["client_id"] == query["client_id"]]
        try:
            offset = max(0, int(query.get("offset", 0)))
            limit = int(query["max_items"]) if query.get("max_items") else None
        except ValueError:
            return _refused("offset and max_items must be numbers.", 400)
        items = items[offset:offset + limit if limit else None]
        return web.json_response({"history": {one["ui_id"]: one for one in items}})

    @routes.post("/v2/manager/queue/reset")
    async def queue_reset(_request: web.Request) -> web.Response:
        """Drop pending tasks and finished history."""
        _pending.clear()
        _history.clear()
        return web.json_response({})

    @routes.post("/v2/manager/queue/update_all")
    async def queue_update_all(request: web.Request) -> web.Response:
        """Queue updates for every pack with a newer registry version."""
        if not gates.INSTALL:
            return _refused(gates.refuse("install").get("reason", "installs are off"), 403)
        if _running or _pending:
            return _refused("The queue is busy.", 401)
        await _update_all(request.query.get("client_id", ""))
        return web.json_response({})

    @routes.post("/v2/manager/queue/update_comfyui")
    async def queue_update_comfyui(_request: web.Request) -> web.Response:
        """Updating ComfyUI itself is left to its own updater."""
        return _refused("Open Manager does not update ComfyUI itself.", 400)

    @routes.post("/v2/manager/reboot")
    async def manager_reboot(request: web.Request) -> web.Response:
        """Restart the server so installed or removed packs take effect."""
        if not gates.RESTART:
            return _refused(gates.refuse("restart").get("reason", "restart is off"), 403)
        peer = request.transport.get_extra_info("peername") if request.transport else None
        if not peer or peer[0] not in _LOOPBACK:
            return _refused("Restart is loopback-only.", 403)
        asyncio.get_running_loop().call_later(0.6, _reboot)
        return web.json_response({})

    @routes.get("/v2/manager/is_legacy_manager_ui")
    async def is_legacy(_request: web.Request) -> web.Response:
        """This manager serves the interface's own manager screens."""
        return web.json_response({"is_legacy_manager_ui": False})

    @routes.get("/v2/manager/version")
    async def manager_version(_request: web.Request) -> web.Response:
        """Which manager is answering."""
        return web.Response(text="open-manager")

    @routes.get("/v2/customnode/installed")
    async def customnode_installed(_request: web.Request) -> web.Response:
        """Installed packs keyed by registry or repository id."""
        return web.json_response(await asyncio.to_thread(installed_map))

    async def import_fail_info(request: web.Request) -> web.Response:
        """Why one pack failed to import, where it did."""
        body = await _body(request) if request.method == "POST" else dict(request.query)
        pack_id = str(body.get("cnr_id") or body.get("url") or "").strip()
        if not pack_id:
            return _refused("Name a pack by cnr_id or url.", 400)
        failed = await asyncio.to_thread(_import_failures)
        found = await asyncio.to_thread(_failure_for, pack_id.rstrip("/").split("github.com/")[-1],
                                        failed)
        return web.json_response(found or {})

    routes.get("/v2/customnode/import_fail_info")(import_fail_info)
    routes.post("/v2/customnode/import_fail_info")(import_fail_info)

    @routes.post("/v2/customnode/import_fail_info_bulk")
    async def import_fail_info_bulk(request: web.Request) -> web.Response:
        """Import failures for many packs at once."""
        body = await _body(request)
        wanted = [str(one) for one in (body.get("cnr_ids") or []) if one]
        urls = [str(one) for one in (body.get("urls") or []) if one]
        failed = await asyncio.to_thread(_import_failures)
        answer = {}
        for one in wanted:
            answer[one] = await asyncio.to_thread(_failure_for, one, failed)
        for one in urls:
            answer[one] = await asyncio.to_thread(
                _failure_for, one.rstrip("/").split("github.com/")[-1], failed)
        return web.json_response(answer)

    _registered = True
