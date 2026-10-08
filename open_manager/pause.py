"""Pause a running prompt to disk, and serve what it finished to the next run of its workflow."""

from __future__ import annotations

import concurrent.futures
import gc
import hashlib
import json
import math
import os
import re
import shutil
import threading
import time
import weakref
from pathlib import Path

from . import log, paths, settingsfile

__all__ = ["available", "discard", "install", "listing", "live_widgets", "read", "request"]

logger = log.get_logger("pause")

SUBDIR = "pauses"

LIVE_SUBDIR = "pauses-live"

LIVE_SETTING = "openManager.pauseLive"

WAIT_SECONDS = 600.0

_lock = threading.Lock()
_executor_ref: "weakref.ReferenceType | None" = None
_provider = None
_installed = False
_running: dict = {}
_armed: dict = {}
_pending: dict = {}
_writer: "concurrent.futures.ThreadPoolExecutor | None" = None
_jobs: list = []
_settling: set = set()


def _safe_id(workflow_id: str) -> str:
    """A directory name for a workflow id."""
    text = str(workflow_id or "").strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", text):
        return text
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:40]


def _dir(workflow_id: str) -> Path:
    return paths.store(SUBDIR) / _safe_id(workflow_id)


def _live_dir(workflow_id: str) -> Path:
    return paths.store(LIVE_SUBDIR) / _safe_id(workflow_id)


def _executor():
    """ComfyUI's prompt executor, where one has been built."""
    global _executor_ref
    found = _executor_ref() if _executor_ref is not None else None
    if found is not None:
        return found
    try:
        import execution
    except ImportError:
        return None
    for one in gc.get_objects():
        if isinstance(one, execution.PromptExecutor):
            _executor_ref = weakref.ref(one)
            return one
    return None


def _running_item(prompt_id: str):
    """The queue item for a running prompt: ``(number, prompt_id, prompt, extra_data, ...)``."""
    try:
        from server import PromptServer

        running, _queued = PromptServer.instance.prompt_queue.get_current_queue()
    except Exception:  # noqa: BLE001
        return None
    for item in running:
        if len(item) > 3 and item[1] == prompt_id:
            return item
    return None


def _workflow_id(extra_data: object) -> str:
    try:
        return str(extra_data["extra_pnginfo"]["workflow"]["id"] or "")
    except (KeyError, TypeError):
        return ""


def _plain_tensor(value: object) -> bool:
    import torch

    return type(value) is torch.Tensor or type(value) is torch.nn.Parameter


def _encode(value: object, tensors: dict):
    """A JSON-safe description of a value, with its tensors moved into ``tensors``.

    Raises:
        TypeError: The value holds something that is not saved.
    """
    if value is None or isinstance(value, (bool, int, str)):
        return {"t": "x", "v": value}
    if isinstance(value, float):
        if math.isfinite(value):
            return {"t": "x", "v": value}
        return {"t": "f", "v": repr(value)}
    if _plain_tensor(value):
        name = f"t{len(tensors)}"
        tensors[name] = value.detach().to("cpu", copy=True).contiguous()
        return {"t": "T", "k": name}
    if isinstance(value, list):
        return {"t": "l", "v": [_encode(one, tensors) for one in value]}
    if isinstance(value, tuple) and type(value) is tuple:
        return {"t": "u", "v": [_encode(one, tensors) for one in value]}
    if type(value) is dict and all(isinstance(key, str) for key in value):
        return {"t": "d", "v": {key: _encode(one, tensors) for key, one in value.items()}}
    raise TypeError(type(value).__name__)


def _decode(node: dict, tensors: dict):
    kind = node.get("t")
    if kind == "x":
        return node.get("v")
    if kind == "f":
        return float(node["v"])
    if kind == "T":
        return tensors[node["k"]]
    if kind == "l":
        return [_decode(one, tensors) for one in node["v"]]
    if kind == "u":
        return tuple(_decode(one, tensors) for one in node["v"])
    if kind == "d":
        return {key: _decode(one, tensors) for key, one in node["v"].items()}
    raise ValueError(f"unknown kind {kind!r}")


def _temp_ui(ui: object) -> bool:
    """Whether a node's ui points at files ComfyUI clears at startup."""
    if not isinstance(ui, dict):
        return False
    for value in ui.values():
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict) and item.get("type") == "temp":
                    return True
    return False


def _is_output(class_type: str) -> bool:
    try:
        import nodes

        return bool(getattr(nodes.NODE_CLASS_MAPPINGS[class_type], "OUTPUT_NODE", False))
    except Exception:  # noqa: BLE001
        return False


def _links(prompt: dict, node_id: str) -> list[str]:
    found = []
    for value in (prompt.get(node_id) or {}).get("inputs", {}).values():
        if isinstance(value, list) and len(value) == 2 and str(value[0]) in prompt:
            found.append(str(value[0]))
    return found


def _consumers(prompt: dict) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for node_id in prompt:
        for source in _links(prompt, node_id):
            found.setdefault(source, []).append(node_id)
    return found


def _run_values(prompt: dict, widgets: list | None) -> list[dict]:
    """Each controlled widget with the value the prompt ran it at."""
    found = []
    for item in widgets or []:
        if not isinstance(item, dict):
            continue
        node = prompt.get(str(item.get("node") or "")) or {}
        name = str(item.get("widget") or "")
        value = (node.get("inputs") or {}).get(name)
        if value is None or isinstance(value, list):
            continue
        found.append({**item, "run": value})
    return found


def _snapshot(prompt_id: str, prompt: dict, extra_data: dict, widgets: list) -> dict:
    """Write what a stopped prompt finished, filed under its workflow id."""
    from comfy_execution.cache_provider import _serialize_cache_key
    from safetensors.torch import save_file

    workflow_id = _workflow_id(extra_data)
    if not workflow_id:
        return {"ok": False, "reason": "the prompt names no workflow"}
    executor = _executor()
    if executor is None:
        return {"ok": False, "reason": "ComfyUI's executor could not be found"}
    cache = executor.caches.outputs
    if not getattr(cache, "initialized", False):
        return {"ok": False, "reason": "ComfyUI is not caching node outputs"}

    done = {}
    for node_id in prompt:
        try:
            entry = cache.get_local(node_id)
        except Exception:  # noqa: BLE001
            entry = None
        if entry is not None:
            done[node_id] = entry
    consumers = _consumers(prompt)

    frontier = [node_id for node_id in done
                if any(one not in done for one in consumers.get(node_id, []))
                or _is_output(prompt[node_id].get("class_type", ""))]

    folder = _dir(workflow_id)
    staging = folder.with_name(folder.name + ".writing")
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)

    saved: dict[str, dict] = {}
    visited: set[str] = set()
    queue = list(frontier)
    total = 0
    while queue:
        node_id = queue.pop()
        if node_id in visited:
            continue
        visited.add(node_id)
        entry = done.get(node_id)
        class_type = prompt[node_id].get("class_type", "")
        encoded = None
        tensors: dict = {}
        if entry is not None and not _temp_ui(entry.ui):
            try:
                encoded = {"outputs": _encode(list(entry.outputs), tensors),
                           "ui": _encode(entry.ui, {}) if entry.ui is not None else None}
            except TypeError:
                encoded = None
            except Exception as error:  # noqa: BLE001
                logger.warning("pause: node %s (%s) not saved: %s", node_id, class_type, error)
                encoded = None
        if encoded is None:
            queue.extend(_links(prompt, node_id))
            continue
        try:
            key = cache.cache_key_set.get_data_key(node_id)
        except Exception:  # noqa: BLE001
            key = None
        digest = _serialize_cache_key(key) if key is not None else None
        if not digest:
            queue.extend(_links(prompt, node_id))
            continue
        if tensors:
            save_file(tensors, str(staging / f"{digest}.safetensors"))
        (staging / f"{digest}.json").write_text(json.dumps(encoded), encoding="utf-8")
        size = sum(one.numel() * one.element_size() for one in tensors.values())
        total += size
        saved[digest] = {"node_id": node_id, "class_type": class_type, "bytes": size,
                         "tensors": bool(tensors)}

    run_values = _run_values(prompt, widgets)

    manifest = {
        "workflow_id": workflow_id,
        "prompt_id": prompt_id,
        "prompt": prompt,
        "nodes": saved,
        "bytes": total,
        "widgets": run_values,
        "created_at": time.time(),
    }
    (staging / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    shutil.rmtree(folder, ignore_errors=True)
    staging.rename(folder)
    return {"ok": True, "workflow_id": workflow_id, "nodes": len(saved), "bytes": total,
            "widgets": run_values}


def _manifest_at(folder: Path) -> dict | None:
    try:
        held = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return held if isinstance(held, dict) and isinstance(held.get("nodes"), dict) else None


def _manifest(workflow_id: str) -> dict | None:
    return _manifest_at(_dir(workflow_id))


def _replace_text(path: Path, text: str) -> None:
    writing = path.with_name(path.name + ".writing")
    writing.write_text(text, encoding="utf-8")
    os.replace(writing, path)


def _live_on() -> bool:
    return settingsfile.value(LIVE_SETTING, False) is True


def _live_submit(live: dict, job, *args) -> None:
    """Queue a write for the live snapshot of the running prompt."""
    global _writer
    with _lock:
        if _writer is None:
            _writer = concurrent.futures.ThreadPoolExecutor(
                max_workers=1, thread_name_prefix="open_manager-pause-live")
        _jobs.append(_writer.submit(_live_job, live, job, *args))


def _live_job(live: dict, job, *args) -> None:
    if live.get("dropped"):
        return
    try:
        job(live, *args)
    except Exception:  # noqa: BLE001
        logger.exception("pause: live snapshot of %s could not be written", live.get("workflow_id"))


def _live_settle(live: dict, keep: bool) -> None:
    """Wait for the live snapshot's writes, deleting it unless ``keep``."""
    if not keep:
        live["dropped"] = True
    with _lock:
        waiting = list(_jobs)
        _jobs.clear()
    try:
        concurrent.futures.wait(waiting)
        if not keep:
            shutil.rmtree(live["folder"], ignore_errors=True)
    finally:
        with _lock:
            _settling.discard(live["workflow_id"])


def _live_begin(prompt_id: str, item, workflow_id: str) -> dict | None:
    if not workflow_id or item is None or not _live_on():
        return None
    prompt = item[2] if isinstance(item[2], dict) else {}
    return {"prompt_id": prompt_id, "workflow_id": workflow_id, "folder": _live_dir(workflow_id),
            "prompt": prompt, "consumers": _consumers(prompt), "entries": {}, "covered": set(),
            "widgets": [], "created_at": time.time(), "open": False}


def _live_open(live: dict) -> None:
    """Carry what this run was served from the last live snapshot, and clear the rest."""
    live["open"] = True
    folder = live["folder"]
    with _lock:
        armed = _armed if _armed.get("prompt_id") == live["prompt_id"] else {}
        served = dict(armed.get("served") or {})
        records = dict(armed.get("nodes") or {})
    for digest, node_id in served.items():
        live["covered"].add(node_id)
        record = records.get(digest)
        if record is not None and record.get("dir") == str(folder):
            live["entries"][digest] = {**{key: value for key, value in record.items()
                                          if key != "dir"}, "node_id": node_id}
    folder.mkdir(parents=True, exist_ok=True)
    _live_manifest(live)
    keep = set(live["entries"]) | {"manifest"}
    for child in folder.iterdir():
        if child.name.split(".", 1)[0] not in keep:
            child.unlink(missing_ok=True)


def _live_manifest(live: dict) -> None:
    path = live["folder"] / "manifest.json"
    if not live["entries"]:
        path.unlink(missing_ok=True)
        return
    _replace_text(path, json.dumps({
        "workflow_id": live["workflow_id"],
        "prompt_id": live["prompt_id"],
        "prompt": live["prompt"],
        "nodes": live["entries"],
        "bytes": sum(int(one.get("bytes") or 0) for one in live["entries"].values()),
        "widgets": _run_values(live["prompt"], live["widgets"]),
        "created_at": live["created_at"],
        "live": True,
    }))


def _live_prune(live: dict) -> list[str]:
    """Drop saved nodes whose every consumer is saved or was served."""
    gone = []
    prompt = live["prompt"]
    for digest, record in list(live["entries"].items()):
        node_id = record.get("node_id")
        users = live["consumers"].get(node_id)
        if not users or _is_output((prompt.get(node_id) or {}).get("class_type", "")):
            continue
        if all(one in live["covered"] for one in users):
            del live["entries"][digest]
            gone.append(digest)
    return gone


def _live_store(live: dict, node_id: str, class_type: str, digest: str, value) -> None:
    import torch
    from safetensors.torch import save_file

    if _temp_ui(value.ui):
        return
    tensors: dict = {}
    try:
        with torch.inference_mode():
            encoded = {"outputs": _encode(list(value.outputs), tensors),
                       "ui": _encode(value.ui, {}) if value.ui is not None else None}
    except TypeError:
        return
    if not live["open"]:
        _live_open(live)
    folder = live["folder"]
    if tensors:
        target = folder / f"{digest}.safetensors"
        writing = target.with_name(target.name + ".writing")
        save_file(tensors, str(writing))
        os.replace(writing, target)
    _replace_text(folder / f"{digest}.json", json.dumps(encoded))
    live["entries"][digest] = {"node_id": node_id, "class_type": class_type,
                               "bytes": sum(one.numel() * one.element_size()
                                            for one in tensors.values()),
                               "tensors": bool(tensors)}
    live["covered"].add(node_id)
    gone = _live_prune(live)
    _live_manifest(live)
    for one in gone:
        (folder / f"{one}.json").unlink(missing_ok=True)
        (folder / f"{one}.safetensors").unlink(missing_ok=True)


def _live_set_widgets(live: dict, widgets: list) -> None:
    live["widgets"] = widgets
    if live["open"]:
        _live_manifest(live)


def _interrupted(executor) -> bool:
    return any(isinstance(one, (list, tuple)) and one and one[0] == "execution_interrupted"
               for one in getattr(executor, "status_messages", None) or [])


def _make_provider():
    from comfy_execution.cache_provider import CacheProvider, CacheValue

    class PauseProvider(CacheProvider):
        """Hands a paused run's outputs back to the next run of its workflow."""

        def should_cache(self, context, value=None):
            if value is not None:
                with _lock:
                    pending = _pending.get("prompt_id")
                    boundary = pending and pending == _running.get("prompt_id") \
                        and _pending.get("mode") == "boundary"
                    live = _running.get("live")
                if live is not None:
                    _live_submit(live, _live_store, str(context.node_id), context.class_type,
                                 context.cache_key_hash, value)
                if boundary:
                    import nodes

                    nodes.interrupt_processing()
                return False
            with _lock:
                return _armed.get("prompt_id") is not None \
                    and _armed.get("prompt_id") == _running.get("prompt_id")

        async def on_store(self, context, value):
            return None

        async def on_lookup(self, context):
            with _lock:
                armed = dict(_armed)
            if not armed or armed.get("prompt_id") != _running.get("prompt_id"):
                return None
            digest = context.cache_key_hash
            record = armed["nodes"].get(digest)
            if record is None:
                return None
            folder = Path(record["dir"])
            try:
                encoded = json.loads((folder / f"{digest}.json").read_text(encoding="utf-8"))
                tensors = {}
                if record.get("tensors"):
                    from safetensors.torch import load_file

                    tensors = load_file(str(folder / f"{digest}.safetensors"), device="cpu")
                outputs = _decode(encoded["outputs"], tensors)
                ui = _decode(encoded["ui"], {}) if encoded.get("ui") is not None else None
            except Exception as error:  # noqa: BLE001
                logger.warning("pause: node %s could not be read back: %s",
                               record.get("node_id"), error)
                return None
            with _lock:
                if _armed.get("prompt_id") == armed["prompt_id"]:
                    _armed.setdefault("served", {})[digest] = str(context.node_id)
            return CacheValue(outputs=outputs, ui=ui)

        def on_prompt_start(self, prompt_id):
            item = _running_item(prompt_id)
            workflow_id = _workflow_id(item[3]) if item is not None else ""
            saved: dict = {}
            for folder in ((_live_dir(workflow_id), _dir(workflow_id)) if workflow_id else ()):
                manifest = _manifest_at(folder)
                if manifest is not None:
                    saved.update({digest: {**record, "dir": str(folder)}
                                  for digest, record in manifest["nodes"].items()})
            live = _live_begin(prompt_id, item, workflow_id)
            with _lock:
                _running.clear()
                _running.update(prompt_id=prompt_id, workflow_id=workflow_id)
                if live is not None:
                    _running["live"] = live
                _armed.clear()
                if saved:
                    _armed.update(prompt_id=prompt_id, workflow_id=workflow_id, nodes=saved)
                    logger.info("pause: resuming %s with %d saved nodes", workflow_id, len(saved))

        def on_prompt_end(self, prompt_id):
            with _lock:
                pending = dict(_pending) if _pending.get("prompt_id") == prompt_id else None
                armed = dict(_armed) if _armed.get("prompt_id") == prompt_id else None
                live = _running.get("live") if _running.get("prompt_id") == prompt_id else None
                if live is not None:
                    _settling.add(live["workflow_id"])
                _running.clear()
                _armed.clear()
            executor = _executor()
            succeeded = bool(getattr(executor, "success", False))
            if live is not None and pending is None:
                _live_settle(live, keep=not succeeded and not _interrupted(executor))
            if pending is not None:
                item = _running_item(prompt_id)
                if succeeded:
                    answer = {"ok": False, "finished": True,
                              "reason": "the run finished before it could pause"}
                elif item is None:
                    answer = {"ok": False, "reason": "the running prompt could not be read"}
                else:
                    try:
                        answer = _snapshot(prompt_id, item[2], item[3], pending.get("widgets"))
                    except Exception as error:  # noqa: BLE001
                        logger.exception("pause: could not be written")
                        answer = {"ok": False, "reason": f"it could not be written ({error})"}
                if live is not None:
                    _live_settle(live, keep=not answer.get("ok") and not succeeded)
                with _lock:
                    if _pending.get("prompt_id") == prompt_id:
                        _pending["answer"] = answer
                        _pending["event"].set()
            elif armed is not None and succeeded:
                discard(armed["workflow_id"])

    return PauseProvider()


def install() -> bool:
    """Register the provider with ComfyUI and keep hold of its executor. Safe to call again."""
    global _installed, _provider
    if _installed:
        return True
    try:
        import execution
        from comfy_execution.cache_provider import register_cache_provider
    except ImportError:
        return False

    original = execution.PromptExecutor.__init__
    if not getattr(original, "_om_pause", False):
        def init(self, *args, **kwargs):
            global _executor_ref
            original(self, *args, **kwargs)
            _executor_ref = weakref.ref(self)

        init._om_pause = True
        execution.PromptExecutor.__init__ = init

    _provider = _make_provider()
    register_cache_provider(_provider)
    _installed = True
    return True


def available() -> bool:
    return _installed


def request(mode: str = "boundary", widgets: list | None = None) -> dict:
    """Ask the running prompt to pause, and wait until it has been written.

    Args:
        mode: ``boundary`` stops once the node now running finishes; ``now`` stops at once.
        widgets: ``{node, widget, canvas, control}`` for each controlled widget on the canvas.

    Returns:
        ``{ok, reason, workflow_id, nodes, bytes, widgets, finished}``.
    """
    if not _installed:
        return {"ok": False, "reason": "pausing is not available in this ComfyUI"}
    with _lock:
        prompt_id = _running.get("prompt_id")
        if not prompt_id:
            return {"ok": False, "reason": "nothing is running"}
        if not _running.get("workflow_id"):
            return {"ok": False, "reason": "the running prompt names no workflow"}
        if _pending.get("prompt_id") == prompt_id:
            event = _pending["event"]
        else:
            event = threading.Event()
            _pending.clear()
            _pending.update(prompt_id=prompt_id, mode="now" if mode == "now" else "boundary",
                            widgets=list(widgets or []), event=event)
    if mode == "now":
        import nodes

        nodes.interrupt_processing()
    if not event.wait(WAIT_SECONDS):
        return {"ok": False, "reason": "the run did not stop in time"}
    with _lock:
        answer = _pending.get("answer") or {"ok": False, "reason": "nothing was written"}
        if _pending.get("event") is event:
            _pending.clear()
    return answer


def live_widgets(prompt_id: str, widgets: list) -> bool:
    """Record the controlled widgets of the prompt being saved live.

    Args:
        prompt_id: The running prompt.
        widgets: ``{node, widget, canvas, control}`` for each controlled widget on its canvas.

    Returns:
        Whether that prompt is being saved live.
    """
    with _lock:
        live = _running.get("live")
        if live is None or live["prompt_id"] != prompt_id:
            return False
    _live_submit(live, _live_set_widgets, [one for one in widgets if isinstance(one, dict)])
    return True


def _in_flight(workflow_id: str) -> bool:
    with _lock:
        live = _running.get("live")
        return workflow_id in _settling or (live is not None and live["workflow_id"] == workflow_id)


def read(workflow_id: str) -> dict | None:
    """A workflow's pause and what its last unfinished run saved, without the prompt.

    Returns:
        ``{workflow_id, prompt_id, bytes, widgets, created_at, nodes}``, prompt, widgets and
        time from the newer of the two, or None where there is neither.
    """
    found = [manifest for manifest in (
        _manifest(workflow_id),
        None if _in_flight(workflow_id) else _manifest_at(_live_dir(workflow_id)),
    ) if manifest is not None]
    if not found:
        return None
    newest = max(found, key=lambda one: float(one.get("created_at") or 0))
    nodes: dict = {}
    for manifest in found:
        nodes.update(manifest["nodes"])
    return {key: newest.get(key) for key in ("workflow_id", "prompt_id", "widgets", "created_at")} | {
        "bytes": sum(int((one or {}).get("bytes") or 0) for one in nodes.values()),
        "nodes": len(nodes)}


def listing() -> list[dict]:
    """Every saved pause, newest first."""
    named = set()
    for subdir in (SUBDIR, LIVE_SUBDIR):
        for folder in paths.store(subdir).iterdir():
            if not folder.is_dir() or folder.name.endswith(".writing"):
                continue
            manifest = _manifest_at(folder)
            if manifest is not None:
                named.add(str(manifest.get("workflow_id") or folder.name))
    found = [one for one in (read(workflow_id) for workflow_id in named) if one is not None]
    return sorted(found, key=lambda one: -float(one.get("created_at") or 0))


def discard(workflow_id: str) -> bool:
    """Delete a workflow's pause, and what its last unfinished run saved."""
    removed = False
    for folder in (_dir(workflow_id), _live_dir(workflow_id)):
        if folder.exists():
            shutil.rmtree(folder, ignore_errors=True)
            removed = True
    return removed
