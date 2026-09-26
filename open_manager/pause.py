"""Pause a running prompt to disk, and serve what it finished to the next run of its workflow."""

from __future__ import annotations

import gc
import hashlib
import json
import math
import re
import shutil
import threading
import time
import weakref
from pathlib import Path

from . import log, paths

__all__ = ["available", "discard", "install", "listing", "read", "request"]

logger = log.get_logger("pause")

SUBDIR = "pauses"

WAIT_SECONDS = 600.0

_lock = threading.Lock()
_executor_ref: "weakref.ReferenceType | None" = None
_provider = None
_installed = False
_running: dict = {}
_armed: dict = {}
_pending: dict = {}


def _safe_id(workflow_id: str) -> str:
    """A directory name for a workflow id."""
    text = str(workflow_id or "").strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", text):
        return text
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:40]


def _dir(workflow_id: str) -> Path:
    return paths.store(SUBDIR) / _safe_id(workflow_id)


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
    consumers: dict[str, list[str]] = {}
    for node_id in prompt:
        for source in _links(prompt, node_id):
            consumers.setdefault(source, []).append(node_id)

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

    run_values = []
    for item in widgets or []:
        if not isinstance(item, dict):
            continue
        node = prompt.get(str(item.get("node") or "")) or {}
        name = str(item.get("widget") or "")
        value = (node.get("inputs") or {}).get(name)
        if value is None or isinstance(value, list):
            continue
        run_values.append({**item, "run": value})

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


def _manifest(workflow_id: str) -> dict | None:
    try:
        held = json.loads((_dir(workflow_id) / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return held if isinstance(held, dict) and isinstance(held.get("nodes"), dict) else None


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
            folder = _dir(armed["workflow_id"])
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
                    _armed.setdefault("served", set()).add(digest)
            return CacheValue(outputs=outputs, ui=ui)

        def on_prompt_start(self, prompt_id):
            item = _running_item(prompt_id)
            workflow_id = _workflow_id(item[3]) if item is not None else ""
            manifest = _manifest(workflow_id) if workflow_id else None
            with _lock:
                _running.clear()
                _running.update(prompt_id=prompt_id, workflow_id=workflow_id)
                _armed.clear()
                if manifest is not None:
                    _armed.update(prompt_id=prompt_id, workflow_id=workflow_id,
                                  nodes=manifest["nodes"])
                    logger.info("pause: resuming %s with %d saved nodes",
                                workflow_id, len(manifest["nodes"]))

        def on_prompt_end(self, prompt_id):
            with _lock:
                pending = dict(_pending) if _pending.get("prompt_id") == prompt_id else None
                armed = dict(_armed) if _armed.get("prompt_id") == prompt_id else None
                _running.clear()
                _armed.clear()
            executor = _executor()
            succeeded = bool(getattr(executor, "success", False))
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


def read(workflow_id: str) -> dict | None:
    """A workflow's pause without its prompt, or None where it has none."""
    manifest = _manifest(workflow_id)
    if manifest is None:
        return None
    return {key: manifest.get(key) for key in
            ("workflow_id", "prompt_id", "bytes", "widgets", "created_at")} | {
        "nodes": len(manifest["nodes"])}


def listing() -> list[dict]:
    """Every saved pause, newest first."""
    found = []
    for folder in paths.store(SUBDIR).iterdir():
        if not folder.is_dir() or folder.name.endswith(".writing"):
            continue
        manifest = _manifest(folder.name)
        if manifest is not None:
            found.append(read(str(manifest.get("workflow_id") or folder.name)) or {})
    return sorted(found, key=lambda one: -float(one.get("created_at") or 0))


def discard(workflow_id: str) -> bool:
    """Delete a workflow's pause."""
    folder = _dir(workflow_id)
    if not folder.exists():
        return False
    shutil.rmtree(folder, ignore_errors=True)
    return True
