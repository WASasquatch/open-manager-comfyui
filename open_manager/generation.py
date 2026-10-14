"""Generation time, job, node and subfolder written into each output asset's ``user_metadata``
as its run ends, before ComfyUI tells the browser."""

from __future__ import annotations

import functools
import inspect
import json
import threading
import time

from . import log, paths

__all__ = ["CHANNEL", "available", "configure", "install", "state"]

logger = log.get_logger("generation")

CHANNEL = "open_manager.generation"

ENDS = ("execution_success", "execution_error", "execution_interrupted")

RUNS_KEPT = 16

_lock = threading.Lock()
_config: dict = {"on": True}
_runs: dict = {}
_places: dict = {}
_native: dict = {"seen": False}
_installed = False


def _file():
    return paths.store_file("generation.json")


def _load() -> None:
    try:
        data = json.loads(_file().read_text("utf-8"))
    except (OSError, ValueError):
        return
    if isinstance(data, dict) and isinstance(data.get("on"), bool):
        _config["on"] = data["on"]


def _assets_on() -> bool:
    try:
        from server import PromptServer

        return bool(PromptServer.instance.asset_manager.enabled)
    except Exception:  # noqa: BLE001
        return False


def _reason() -> str:
    if _native["seen"]:
        return "native"
    if not _installed:
        return "changed"
    if not _assets_on():
        return "assets off"
    return ""


def available() -> bool:
    """Whether runs can be recorded: the hooks are in, assets are on, ComfyUI records none itself."""
    return not _reason()


def state() -> dict:
    """``{on, available, reason}``: the switch, and why it cannot act if it cannot."""
    reason = _reason()
    return {"on": _config["on"], "available": not reason, "reason": reason}


def configure(on: object) -> dict:
    """Turn recording on or off, kept across restarts.

    Args:
        on: Whether to record.

    Returns:
        :func:`state` after the change.
    """
    with _lock:
        _config["on"] = bool(on)
        try:
            _file().write_text(json.dumps(_config), "utf-8")
        except OSError as error:
            logger.warning("could not write generation.json (%s)", error)
    return state()


def _pick(args: tuple, kwargs: dict, name: str):
    if name in kwargs:
        return kwargs[name]
    at = _places.get(name)
    return args[at] if at is not None and at < len(args) else None


def _note(args: tuple, kwargs: dict) -> None:
    """Keep the run's output map, the first time one of its nodes runs."""
    prompt_id = str(_pick(args, kwargs, "prompt_id") or "")
    if not prompt_id or prompt_id in _runs:
        return
    outputs = _pick(args, kwargs, "ui_outputs")
    while len(_runs) >= RUNS_KEPT:
        _runs.pop(next(iter(_runs)))
    _runs[prompt_id] = outputs if isinstance(outputs, dict) else {}


def _found(outputs: dict) -> dict:
    """Node, subfolder and format of every output that became an asset, by asset id."""
    found = {}
    for node_id, entry in list(outputs.items()):
        output = entry.get("output") if isinstance(entry, dict) else None
        if not isinstance(output, dict):
            continue
        for items in output.values():
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict) or not item.get("id"):
                    continue
                details = {"nodeId": str(node_id), "subfolder": str(item.get("subfolder") or "")}
                if item.get("format"):
                    details["format"] = str(item["format"])
                found[str(item["id"])] = details
    return found


def _started(executor) -> float | None:
    for event, data in getattr(executor, "status_messages", None) or []:
        if event == "execution_start" and isinstance(data, dict):
            stamp = data.get("timestamp")
            return stamp if isinstance(stamp, (int, float)) else None
    return None


def _write(found: dict, details: dict) -> dict:
    """Merge the details into each asset the run made, by id, in one transaction."""
    from sqlalchemy import select

    from app.assets.database.models import Asset
    from app.database.db import create_write_session

    written = {}
    with create_write_session() as session:
        records = session.scalars(select(Asset).where(Asset.id.in_(list(found)))).all()
        if any("executionTimeInSeconds" in (record.user_metadata or {}) for record in records):
            _native["seen"] = True
            logger.info("generation time: ComfyUI records it; standing down")
            return {}
        for record in records:
            merged = {**details, **found[record.id], **(record.user_metadata or {})}
            record.user_metadata = merged
            written[record.id] = merged
        session.commit()
    return written


def _push(payload: dict) -> None:
    try:
        from server import PromptServer

        PromptServer.instance.send_sync(CHANNEL, payload)
    except Exception:  # noqa: BLE001
        pass


def _finish(executor, data: object) -> None:
    prompt_id = str((data or {}).get("prompt_id") or "") if isinstance(data, dict) else ""
    outputs = _runs.pop(prompt_id, None) or {}
    if not prompt_id or not _config["on"] or not available():
        return
    details = {"jobId": prompt_id}
    started = _started(executor)
    if started is not None:
        details["executionTimeInSeconds"] = round((time.time() * 1000 - started) / 1000, 3)
    found = _found(outputs)
    if not found:
        return
    written = _write(found, details)
    if written:
        _push({"job": prompt_id, "assets": written})


def _wrap_node(execution) -> None:
    original = execution.execute
    if getattr(original, "_om_generation", False):
        return
    if inspect.iscoroutinefunction(original):
        @functools.wraps(original)
        async def execute(*args, **kwargs):
            try:
                _note(args, kwargs)
            except Exception:  # noqa: BLE001
                logger.debug("generation: a run's outputs were not noted", exc_info=True)
            return await original(*args, **kwargs)
    else:
        @functools.wraps(original)
        def execute(*args, **kwargs):
            try:
                _note(args, kwargs)
            except Exception:  # noqa: BLE001
                logger.debug("generation: a run's outputs were not noted", exc_info=True)
            return original(*args, **kwargs)
    execute._om_generation = True
    execution.execute = execute


def _wrap_messages(executor) -> None:
    original = executor.add_message
    if getattr(original, "_om_generation", False):
        return

    @functools.wraps(original)
    def add_message(self, event, data, *args, **kwargs):
        if event in ENDS:
            try:
                _finish(self, data)
            except Exception:  # noqa: BLE001
                logger.warning("generation: a run's details were not written", exc_info=True)
        return original(self, event, data, *args, **kwargs)

    add_message._om_generation = True
    executor.add_message = add_message


def install() -> bool:
    """Record every run from now on. Safe to call again."""
    global _installed
    if _installed:
        return True
    _load()
    try:
        import execution

        places = list(inspect.signature(execution.execute).parameters)
    except Exception:  # noqa: BLE001
        return False
    if not {"prompt_id", "ui_outputs"} <= set(places):
        return False
    if not callable(getattr(execution.PromptExecutor, "add_message", None)):
        return False
    _places.update({name: at for at, name in enumerate(places)})
    _wrap_node(execution)
    _wrap_messages(execution.PromptExecutor)
    _installed = True
    return True
