"""How long each node of a run took, measured where it ran, kept for the most recent runs."""

from __future__ import annotations

import functools
import inspect
import threading
import time

from . import log

__all__ = ["CHANNEL", "KEEP", "available", "forget", "install", "label", "runs"]

logger = log.get_logger("timing")

CHANNEL = "open_manager.timer"

KEEP = 48

LABELS_KEPT = 64

PATH_CAP = 400

NAME_CAP = 120

NODE_PLACES = ("server", "dynprompt", "caches", "current_item", "extra_data", "executed",
               "prompt_id", "execution_list", "pending_subgraph_results", "pending_async_nodes")

RUN_PLACES = ("self", "prompt", "prompt_id", "extra_data", "execute_outputs")

_lock = threading.Lock()
_runs: list = []
_labels: dict = {}
_live: dict = {}
_node_places: dict = {}
_run_places: dict = {}
_installed = False


def _pick(places: dict, args: tuple, kwargs: dict, name: str):
    """One argument of a wrapped call, by name, wherever it was passed."""
    if name in kwargs:
        return kwargs[name]
    at = places.get(name)
    return args[at] if at is not None and at < len(args) else None


def _workflow_id(extra_data: object) -> str:
    try:
        return str(extra_data["extra_pnginfo"]["workflow"]["id"] or "")
    except Exception:  # noqa: BLE001
        return ""


def _header(run: dict, now: float) -> dict:
    """What a run is, without its nodes."""
    elapsed = now - run["_clock"] if run["state"] == "running" else run["elapsed"]
    return {"id": run["id"], "workflow": run["workflow"], "path": run["path"],
            "name": run["name"], "started": run["started"], "elapsed": round(elapsed, 4),
            "state": run["state"], "seq": run["seq"]}


def _shown(entry: dict) -> dict:
    return {**entry, "spent": round(entry["spent"], 4)}


def _push(payload: dict) -> None:
    try:
        from server import PromptServer

        PromptServer.instance.send_sync(CHANNEL, payload)
    except Exception:  # noqa: BLE001
        pass


def _bump(run: dict, entry: dict) -> None:
    run["seq"] += 1
    entry["seq"] = run["seq"]


def _entry(run: dict, display: str) -> dict:
    """A node's row in a run, made from the prompt the first time it is needed."""
    entry = run["nodes"].get(display)
    if entry is None:
        spec = run["_prompt"].get(display) if isinstance(run["_prompt"], dict) else None
        spec = spec if isinstance(spec, dict) else {}
        entry = {"id": display, "type": str(spec.get("class_type") or ""),
                 "title": str((spec.get("_meta") or {}).get("title") or ""),
                 "state": "waiting", "spent": 0.0, "open": None, "runs": 0, "seq": 0}
        run["nodes"][display] = entry
    return entry


def _reopen(run: dict, entry: dict) -> None:
    """Point a node at the earliest of its calls still running, or at none."""
    starts = [start for display, start in run["_calls"].values() if display == entry["id"]]
    entry["open"] = round(min(starts) - run["_clock"], 4) if starts else None


def _evict() -> None:
    while len(_runs) > KEEP:
        idle = next((at for at, run in enumerate(_runs) if run["state"] != "running"), None)
        if idle is None:
            return
        del _runs[idle]


def _run_begin(args: tuple, kwargs: dict) -> str:
    prompt_id = str(_pick(_run_places, args, kwargs, "prompt_id") or "")
    if not prompt_id:
        return ""
    prompt = _pick(_run_places, args, kwargs, "prompt")
    workflow = _workflow_id(_pick(_run_places, args, kwargs, "extra_data"))
    with _lock:
        path, name = _labels.pop(prompt_id, ("", ""))
        run = {"id": prompt_id, "workflow": workflow, "path": path, "name": name,
               "started": time.time(), "elapsed": 0.0, "state": "running", "seq": 0,
               "nodes": {}, "_clock": time.perf_counter(),
               "_prompt": prompt if isinstance(prompt, dict) else {}, "_calls": {}}
        _live[prompt_id] = run
        _runs[:] = [one for one in _runs if one["id"] != prompt_id]
        _runs.append(run)
        _evict()
        payload = {"run": _header(run, time.perf_counter()), "nodes": []}
    _push(payload)
    return prompt_id


def _outcome(executor) -> str:
    """How a run ended, from what the executor reported."""
    said = {str(one[0]) for one in getattr(executor, "status_messages", None) or []
            if isinstance(one, (list, tuple)) and one}
    if "execution_interrupted" in said:
        return "stopped"
    if "execution_error" in said or getattr(executor, "success", True) is False:
        return "error"
    return "done"


def _run_end(prompt_id: str, outcome: str) -> None:
    with _lock:
        run = _live.pop(prompt_id, None)
        if run is None:
            return
        now = time.perf_counter()
        for display, start in list(run["_calls"].values()):
            entry = run["nodes"].get(display)
            if entry is not None:
                entry["spent"] += now - start
                entry["state"] = "done" if outcome == "done" else outcome
        run["_calls"].clear()
        for entry in run["nodes"].values():
            entry["open"] = None
            if entry["state"] == "running":
                entry["state"] = "done" if outcome == "done" else outcome
            _bump(run, entry)
        run["elapsed"] = now - run["_clock"]
        run["state"] = outcome
        run["_prompt"] = {}
        payload = {"run": _header(run, now),
                   "nodes": [_shown(entry) for entry in run["nodes"].values()]}
    _push(payload)


def _cached(data: object) -> None:
    """Mark the nodes a run will take from the cache."""
    if not isinstance(data, dict):
        return
    with _lock:
        run = _live.get(str(data.get("prompt_id") or ""))
        if run is None:
            return
        changed = []
        for node in data.get("nodes") or []:
            entry = _entry(run, str(node))
            if entry["runs"] or entry["open"] is not None:
                continue
            entry["state"] = "cached"
            _bump(run, entry)
            changed.append(_shown(entry))
        payload = {"run": _header(run, time.perf_counter()), "nodes": changed}
    if changed:
        _push(payload)


def _display(dynprompt, unique: str) -> str:
    try:
        return str(dynprompt.get_display_node_id(unique))
    except Exception:  # noqa: BLE001
        return unique


def _node_begin(args: tuple, kwargs: dict):
    """Open a node's call. Returns what closing it needs, or ``None``."""
    try:
        unique = str(_pick(_node_places, args, kwargs, "current_item"))
        with _lock:
            run = _live.get(str(_pick(_node_places, args, kwargs, "prompt_id") or ""))
        if run is None:
            return None
        display = _display(_pick(_node_places, args, kwargs, "dynprompt"), unique)
        now = time.perf_counter()
        with _lock:
            entry = _entry(run, display)
            if unique not in run["_calls"]:
                run["_calls"][unique] = (display, now)
            quiet = entry["state"] == "cached" and not entry["runs"]
            if not quiet:
                entry["state"] = "running"
                _reopen(run, entry)
                _bump(run, entry)
                payload = {"run": _header(run, now), "nodes": [_shown(entry)]}
        if not quiet:
            _push(payload)
        return run, unique, display
    except Exception:  # noqa: BLE001
        logger.debug("timing: a node's start was not recorded", exc_info=True)
        return None


def _failure(result, error) -> str:
    caught = error if error is not None else (
        result[2] if isinstance(result, tuple) and len(result) > 2 else None)
    try:
        import comfy.model_management as mm

        if isinstance(caught, mm.InterruptProcessingException):
            return "stopped"
    except Exception:  # noqa: BLE001
        pass
    return "error"


def _node_end(token, result, error, args: tuple, kwargs: dict) -> None:
    """Close a node's call and add what it took to that node."""
    if token is None:
        return
    try:
        run, unique, display = token
        now = time.perf_counter()
        status = ""
        if isinstance(result, tuple) and result:
            status = str(getattr(result[0], "name", result[0]))
        if error is not None:
            status = "FAILURE"
        pending = _pick(_node_places, args, kwargs, "pending_async_nodes")
        executed = _pick(_node_places, args, kwargs, "executed")
        with _lock:
            entry = run["nodes"].get(display)
            call = run["_calls"].get(unique)
            if entry is None or call is None:
                return
            if status == "PENDING" and isinstance(pending, dict) and unique in pending:
                return
            del run["_calls"][unique]
            if status == "SUCCESS":
                ran = unique in executed if executed is not None else entry["state"] != "cached"
            else:
                ran = True
            if ran:
                entry["spent"] += now - call[1]
            if status == "SUCCESS":
                if ran:
                    entry["runs"] += 1
                    entry["state"] = "done"
                elif not entry["runs"]:
                    entry["state"] = "cached"
            elif status == "PENDING":
                entry["state"] = "waiting"
            else:
                entry["state"] = _failure(result, error)
            _reopen(run, entry)
            if entry["open"] is not None:
                entry["state"] = "running"
            _bump(run, entry)
            payload = {"run": _header(run, now), "nodes": [_shown(entry)]}
        _push(payload)
    except Exception:  # noqa: BLE001
        logger.debug("timing: a node's end was not recorded", exc_info=True)


async def _end_later(token, pending, args: tuple, kwargs: dict):
    result, error = None, None
    try:
        result = await pending
        return result
    except BaseException as caught:
        error = caught
        raise
    finally:
        _node_end(token, result, error, args, kwargs)


def _wrap_node(execution) -> None:
    original = execution.execute
    if getattr(original, "_om_timing", False):
        return
    if inspect.iscoroutinefunction(original):
        @functools.wraps(original)
        async def timed(*args, **kwargs):
            token = _node_begin(args, kwargs)
            return await _end_later(token, original(*args, **kwargs), args, kwargs)
    else:
        @functools.wraps(original)
        def timed(*args, **kwargs):
            token = _node_begin(args, kwargs)
            try:
                result = original(*args, **kwargs)
            except BaseException as caught:
                _node_end(token, None, caught, args, kwargs)
                raise
            if inspect.isawaitable(result):
                return _end_later(token, result, args, kwargs)
            _node_end(token, result, None, args, kwargs)
            return result
    timed._om_timing = True
    execution.execute = timed


def _wrap_run(executor) -> None:
    original = executor.execute
    if not getattr(original, "_om_timing", False):
        @functools.wraps(original)
        def execute(self, *args, **kwargs):
            prompt_id = ""
            try:
                prompt_id = _run_begin((self, *args), kwargs)
            except Exception:  # noqa: BLE001
                logger.debug("timing: a run's start was not recorded", exc_info=True)
            outcome = ""
            try:
                return original(self, *args, **kwargs)
            except BaseException:
                outcome = "error"
                raise
            finally:
                if prompt_id:
                    try:
                        _run_end(prompt_id, outcome or _outcome(self))
                    except Exception:  # noqa: BLE001
                        logger.debug("timing: a run's end was not recorded", exc_info=True)

        execute._om_timing = True
        executor.execute = execute

    message = executor.add_message
    if not getattr(message, "_om_timing", False):
        @functools.wraps(message)
        def add_message(self, event, data, *args, **kwargs):
            if event == "execution_cached":
                try:
                    _cached(data)
                except Exception:  # noqa: BLE001
                    logger.debug("timing: cached nodes were not recorded", exc_info=True)
            return message(self, event, data, *args, **kwargs)

        add_message._om_timing = True
        executor.add_message = add_message


def install() -> bool:
    """Time every node ComfyUI runs from now on. Safe to call again."""
    global _installed
    if _installed:
        return True
    try:
        import execution

        node_places = list(inspect.signature(execution.execute).parameters)
        run_places = list(inspect.signature(execution.PromptExecutor.execute).parameters)
    except Exception:  # noqa: BLE001
        return False
    if not {"current_item", "prompt_id"} <= set(node_places):
        node_places = list(NODE_PLACES)
    if not {"prompt", "prompt_id"} <= set(run_places):
        run_places = list(RUN_PLACES)
    if inspect.iscoroutinefunction(execution.PromptExecutor.execute):
        return False
    if not callable(getattr(execution.PromptExecutor, "add_message", None)):
        return False
    _node_places.update({name: at for at, name in enumerate(node_places)})
    _run_places.update({name: at for at, name in enumerate(run_places)})
    _wrap_node(execution)
    _wrap_run(execution.PromptExecutor)
    _installed = True
    return True


def available() -> bool:
    return _installed


def runs() -> list[dict]:
    """The runs kept, oldest first, with every node's timing."""
    now = time.perf_counter()
    with _lock:
        return [{**_header(run, now), "nodes": [_shown(entry) for entry in run["nodes"].values()]}
                for run in _runs]


def forget(prompt_id: str) -> bool:
    """Drop one run's timings. A run still going is kept."""
    with _lock:
        found = next((run for run in _runs if run["id"] == prompt_id), None)
        if found is None or found["state"] == "running":
            return False
        _runs.remove(found)
    _push({"forgot": prompt_id})
    return True


def label(prompt_id: str, path: object, name: object) -> bool:
    """Name the workflow tab a run was queued from.

    Args:
        prompt_id: The run.
        path: The workflow's path in the browser that queued it.
        name: The name that workflow shows.

    Returns:
        Whether the run was found or is still to start.
    """
    path = " ".join(str(path or "").split())[:PATH_CAP] if isinstance(path, str) else ""
    name = " ".join(str(name or "").split())[:NAME_CAP] if isinstance(name, str) else ""
    if not prompt_id or not (path or name):
        return False
    with _lock:
        run = next((one for one in _runs if one["id"] == prompt_id), None)
        if run is None:
            _labels[prompt_id] = (path, name)
            while len(_labels) > LABELS_KEPT:
                del _labels[next(iter(_labels))]
            return True
        run["path"], run["name"] = path, name
        run["seq"] += 1
        payload = {"run": _header(run, time.perf_counter()), "nodes": []}
    _push(payload)
    return True
