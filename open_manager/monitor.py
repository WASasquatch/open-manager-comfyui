"""What the machine is doing, sampled only while somebody is looking."""

from __future__ import annotations

import asyncio
import os
import sys
import time
import warnings

from . import log

__all__ = ["activity", "blocks", "free", "lease", "models", "release", "sample", "state",
           "stop", "unload"]

logger = log.get_logger("monitor")

CHANNEL = "open_manager.monitor"

DEFAULT_INTERVAL = 2.0

MIN_INTERVAL = 1.0
MAX_INTERVAL = 10.0

LEASE_INTERVALS = 3

SAMPLE_SHARE = 20

SAMPLE_BACKOFF_CAP = 60.0

_leases: dict[str, dict] = {}
_task: "asyncio.Task | None" = None


def _psutil():
    """psutil, or ``None`` where it cannot be imported."""
    try:
        import psutil

        return psutil
    except Exception:
        return None


_nvml = None

_nvml_cards = None


def _nvml_handles():
    """A handle per NVIDIA device, or an empty list."""
    global _nvml, _nvml_cards
    if _nvml is False:
        return []
    if _nvml is None:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", FutureWarning)
                import pynvml

            pynvml.nvmlInit()
            _nvml = pynvml
        except Exception:
            _nvml = False
            return []
    if _nvml_cards is not None:
        return _nvml_cards
    try:
        _nvml_cards = [_nvml.nvmlDeviceGetHandleByIndex(i)
                       for i in range(_nvml.nvmlDeviceGetCount())]
    except Exception:
        _nvml_cards = None
        return []
    return _nvml_cards


def _nvml_readings() -> list[dict]:
    """Temperature and utilisation per NVIDIA device, indexed as NVML orders them."""
    found = []
    handles = _nvml_handles()
    for index, handle in enumerate(handles):
        entry = {"index": index}
        try:
            name = _nvml.nvmlDeviceGetName(handle)
            entry["name"] = name.decode() if isinstance(name, bytes) else str(name)
        except Exception:
            pass
        try:
            entry["temp"] = int(_nvml.nvmlDeviceGetTemperature(
                handle, _nvml.NVML_TEMPERATURE_GPU))
        except Exception:
            pass
        try:
            rates = _nvml.nvmlDeviceGetUtilizationRates(handle)
            entry["util"] = int(rates.gpu)
            entry["mem_util"] = int(rates.memory)
        except Exception:
            pass
        for version in (getattr(_nvml, "nvmlMemory_v2", None), None):
            try:
                memory = (_nvml.nvmlDeviceGetMemoryInfo(handle, version=version)
                          if version else _nvml.nvmlDeviceGetMemoryInfo(handle))
                entry["mem_total"] = int(memory.total)
                entry["mem_used"] = int(memory.used)
                break
            except Exception:
                continue
        try:
            entry["watts"] = round(_nvml.nvmlDeviceGetPowerUsage(handle) / 1000, 1)
        except Exception:
            pass
        for reader in ("nvmlDeviceGetEnforcedPowerLimit", "nvmlDeviceGetPowerManagementLimit"):
            try:
                entry["watt_limit"] = round(getattr(_nvml, reader)(handle) / 1000, 1)
                break
            except Exception:
                continue
        for reader in ("nvmlDeviceGetCurrentClocksEventReasons",
                       "nvmlDeviceGetCurrentClocksThrottleReasons"):
            try:
                entry["clock_events"] = int(getattr(_nvml, reader)(handle))
                break
            except Exception:
                continue
        found.append(entry)
    return found


def _cpu_temps(tool) -> list[dict]:
    """Processor temperatures, where the platform reports any."""
    if tool is None or not hasattr(tool, "sensors_temperatures"):
        return []
    try:
        groups = tool.sensors_temperatures() or {}
    except Exception:
        return []
    found = []
    for source, entries in groups.items():
        for entry in entries:
            label = (getattr(entry, "label", "") or source).strip()
            current = getattr(entry, "current", None)
            if current is None:
                continue
            if "package" in label.lower() or "die" in label.lower() or not found:
                found.append({"label": label or source, "temp": round(float(current), 1)})
    return found[:8]


def _interval() -> float:
    """The shortest interval any current lease asked for."""
    wanted = [one["interval"] for one in _leases.values()]
    return min(wanted) if wanted else DEFAULT_INTERVAL


def _expire(now: float) -> None:
    """Drop leases nobody renewed."""
    gone = [key for key, one in _leases.items() if one["expires"] <= now]
    for client in gone:
        _leases.pop(client, None)
    if gone:
        _sync_watch()


def _card_memory(mm, device, extra: dict | None) -> tuple[int, int]:
    """Total and used bytes on a card as its driver counts them, not as ComfyUI budgets them."""
    if extra and extra.get("mem_total"):
        return extra["mem_total"], extra.get("mem_used") or 0
    if device.type == "cuda":
        try:
            free, total = mm.torch.cuda.mem_get_info(device)
            return int(total), int(total - free)
        except Exception:
            pass
    total = mm.get_total_memory(device)
    return total, total - mm.get_free_memory(device)


def sample() -> dict:
    """One reading of the machine.

    Returns:
        ``{at, cpu, cores, cpu_temps, ram, vram, devices}``.
    """
    reading: dict = {"at": time.time()}

    tool = _psutil()
    if tool is not None:
        try:
            reading["cpu"] = round(tool.cpu_percent(interval=None), 1)
            cores = tool.cpu_percent(interval=None, percpu=True)
            if cores:
                reading["cores"] = [round(float(one), 1) for one in cores]
        except Exception:
            pass
        temps = _cpu_temps(tool)
        if temps:
            reading["cpu_temps"] = temps

    try:
        import comfy.model_management as mm

        cpu_device = mm.torch.device("cpu")
        total = mm.get_total_memory(cpu_device)
        free = mm.get_free_memory(cpu_device)
        reading["ram"] = {"total": total, "free": free, "used": total - free}

        extras = {one.get("index"): one for one in _nvml_readings()}
        devices = []
        for device in mm.get_all_torch_devices():
            if device.type == "cpu":
                continue
            name = mm.get_torch_device_name(device)
            index = device.index if device.index is not None else 0
            extra = extras.get(index)
            if extra and extra.get("name") and extra["name"] not in name:
                extra = None
            vram_total, vram_used = _card_memory(mm, device, extra)
            entry = {
                "name": name,
                "type": device.type,
                "index": index,
                "total": vram_total,
                "free": vram_total - vram_used,
                "used": vram_used,
            }
            if extra:
                for key in ("temp", "util", "mem_util", "watts", "watt_limit",
                            "clock_events"):
                    if key in extra:
                        entry[key] = extra[key]
            devices.append(entry)
        if devices:
            reading["devices"] = devices
            reading["vram"] = devices[0]
    except Exception:
        pass

    return reading


def _pin_state(patcher, device) -> dict:
    """What this build knows about a model's pinned host memory."""
    found: dict = {}
    try:
        pins = getattr(patcher.model, "dynamic_pins", None)
        state = pins.get(device) if isinstance(pins, dict) else None
        if not isinstance(state, dict):
            return found
        for key in ("active", "current_prompt", "failed", "hostbufs_initialized"):
            if key in state:
                found[key] = bool(state[key])
        held = 0
        for key in ("weights", "patches", "weights-loaded", "patches-loaded"):
            slot = state.get(key)
            buffer = slot[0] if isinstance(slot, (tuple, list)) and slot else None
            for attribute in ("size", "nbytes", "capacity"):
                value = getattr(buffer, attribute, None)
                if isinstance(value, int) and value > 0:
                    held += value
                    break
        if held:
            found["pinned_bytes"] = held
    except Exception:
        return found
    return found


def models() -> dict:
    """The models ComfyUI is holding, and where each one's weights actually are.

    Returns:
        ``{ok, models, totals, reason}``.
    """
    try:
        import comfy.model_management as mm
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "models": [], "totals": {}, "reason": str(error)[:120]}

    rows = []
    for entry in list(getattr(mm, "current_loaded_models", [])):
        try:
            patcher = entry.model
            if patcher is None:
                continue
            total = int(entry.model_memory() or 0)
            resident = int(entry.model_loaded_memory() or 0)
            inner = getattr(patcher, "model", None)
            row = {
                "id": id(patcher),
                "name": type(inner).__name__ if inner is not None else "unknown",
                "device": str(getattr(entry, "device", "")),
                "total": total,
                "resident": resident,
                "offloaded": max(0, total - resident),
                "share": round(min(resident, total) / total * 100, 1) if total else 0.0,
                "in_use": bool(getattr(entry, "currently_used", False)),
            }
            try:
                row["streaming"] = bool(patcher.is_dynamic())
            except Exception:
                row["streaming"] = False
            patches = getattr(inner, "lowvram_patch_counter", None)
            if isinstance(patches, int):
                row["streamed_weights"] = patches
            pins = _pin_state(patcher, getattr(entry, "device", None))
            if pins:
                row["pins"] = pins
            rows.append(row)
        except Exception:
            continue

    rows.sort(key=lambda row: -row["total"])
    return {
        "ok": True,
        "models": rows,
        "totals": {
            "count": len(rows),
            "total": sum(row["total"] for row in rows),
            "resident": sum(row["resident"] for row in rows),
            "offloaded": sum(row["offloaded"] for row in rows),
            "pinned": sum(row.get("pins", {}).get("pinned_bytes", 0) for row in rows),
        },
        "reason": "",
    }


PAGE_STATES = ("host", "on device", "pinned", "on device, pinned", "not allocated yet")

VBAR_SHIFT = 25

UNSEEN = len(PAGE_STATES) - 1

REFAULT_WINDOW = 2.0

HEAT_WINDOW = 4.0

THRASH_RATE = 12.0

THRASH_SHARE = 0.4

_fault_real = None
_fault_seen: dict = {}


def _watch_init(vbar) -> None:
    """Give one streamed model somewhere to record what was touched."""
    try:
        vbar._om_last = [0.0] * max(1, vbar.get_nr_pages())
    except Exception:
        vbar._om_last = [0.0]
    vbar._om_faults = 0
    vbar._om_refaults = 0


def _watched_fault(self, alloc, size):
    """``ModelVBAR.fault``, with the pages it was for stamped as touched."""
    answer = _fault_real(self, alloc, size)
    try:
        last = self._om_last
        now = time.monotonic()
        base = alloc - self.base_addr
        first = base >> VBAR_SHIFT
        end = (base + size - 1) >> VBAR_SHIFT
        pages = len(last)
        if first < pages:
            if now - last[first] < REFAULT_WINDOW:
                self._om_refaults += 1
            last[first] = now
        if end != first and end < pages:
            last[end] = now
        self._om_faults += 1
    except AttributeError:
        _watch_init(self)
    except Exception:
        pass
    return answer


def watching() -> bool:
    return _fault_real is not None


def watch_faults(on: bool) -> bool:
    """Start or stop recording which blocks the run touches.

    Returns:
        Whether the record is being kept.
    """
    global _fault_real
    try:
        from comfy_aimdo.model_vbar import ModelVBAR
    except Exception:
        return False
    if on and _fault_real is None:
        original = ModelVBAR.fault
        if getattr(original, "_om_watch", False):
            return True
        _fault_real = original
        _watched_fault._om_watch = True
        ModelVBAR.fault = _watched_fault
    elif not on and _fault_real is not None:
        ModelVBAR.fault = _fault_real
        _fault_real = None
        _fault_seen.clear()
    return watching()


def _sync_watch() -> None:
    """Keep the record in step with whether anything is asking for it."""
    wanted = any(one.get("watch") for one in _leases.values())
    if wanted != watching():
        watch_faults(wanted)


_churn_seen: dict = {}


def _stream_churn(now: float) -> tuple[float, float] | None:
    """Faults and re-faults a second across every streamed model.

    Args:
        now: The clock this rate is measured against.

    Returns:
        ``(faults, refaults)`` a second, or ``None`` where nothing is recording.
    """
    if not watching():
        return None
    try:
        import comfy.model_management as mm
    except Exception:
        return None
    faults = 0
    refaults = 0
    found = False
    for entry in list(getattr(mm, "current_loaded_models", [])):
        try:
            vbars = getattr(entry.model.model, "dynamic_vbars", None)
            if not isinstance(vbars, dict):
                continue
            for vbar in vbars.values():
                one = getattr(vbar, "_om_faults", None)
                if one is None:
                    continue
                found = True
                faults += one
                refaults += getattr(vbar, "_om_refaults", 0)
        except Exception:
            continue
    if not found:
        return None
    was = _churn_seen.get("all")
    _churn_seen["all"] = (faults, refaults, now)
    if not was or now <= was[2]:
        return None
    span = now - was[2]
    return (max(0, faults - was[0]) / span, max(0, refaults - was[1]) / span)


def _vbar_pages(patcher, entry, cells: int):
    """The residency of a streamed model, a page at a time, or ``None``.

    Returns:
        The same shape :func:`blocks` returns, or ``None`` where this model does not stream.
    """
    try:
        vbars = getattr(patcher.model, "dynamic_vbars", None)
        vbar = vbars.get(getattr(patcher, "load_device", None)) if isinstance(vbars, dict) else None
        if vbar is None:
            return None
        flags = vbar.get_residency()
    except Exception:
        return None
    if not flags:
        return None

    try:
        weighs = int(entry.model_memory() or 0)
    except Exception:
        weighs = 0
    wants = -(-weighs // (1 << VBAR_SHIFT)) if weighs else 0
    model_pages = wants or len(flags)
    if model_pages < 1:
        model_pages = len(flags)
    held = list(flags[:model_pages])
    unseen = [UNSEEN] * max(0, model_pages - len(held))
    total = model_pages
    cells = max(1, min(cells, total))

    states = [(1 if flag & 1 else 0) + (2 if flag & 2 else 0) for flag in held] + unseen
    counts = [0] * len(PAGE_STATES)
    for state in states:
        counts[state] += 1

    seen = [state for state in range(len(PAGE_STATES)) if counts[state]]
    seats = {state: position for position, state in enumerate(seen)}

    packed = []
    for cell in range(cells):
        low = (cell * total) // cells
        high = max(low + 1, ((cell + 1) * total) // cells)
        tally: dict = {}
        for position in range(low, min(high, total)):
            tally[states[position]] = tally.get(states[position], 0) + 1
        packed.append(seats[max(tally, key=tally.get)] if tally else -1)

    page_bytes = int(entry.model_memory() / total) if total else 0

    made = {
        "ok": True,
        "source": "pages",
        "total": entry.model_memory(),
        "modules": total,
        "unit": "pages",
        "cells": packed,
        "devices": [{"device": PAGE_STATES[state],
                     "bytes": counts[state] * page_bytes if page_bytes else 0,
                     "share": round(counts[state] / total * 100, 1)}
                    for state in seen],
        "reason": "",
    }
    made.update(_vbar_activity(vbar, total, cells))
    return made


def _vbar_activity(vbar, total: int, cells: int) -> dict:
    """What the run has touched, per square, where that is being recorded.

    Args:
        vbar: The streaming library's range for one model.
        total: Pages the model itself occupies.
        cells: Squares the map is divided into.

    Returns:
        ``{heat, faults, refaults, watermark}``, or the parts of it that can be read. ``heat``
        is one figure per square, 0 to 100, highest for a page touched just now.
    """
    out: dict = {}
    try:
        out["watermark"] = int(vbar.get_watermark())
    except Exception:
        pass
    last = getattr(vbar, "_om_last", None)
    if last is None:
        return out

    now = time.monotonic()
    heat = []
    for cell in range(cells):
        low = (cell * total) // cells
        high = max(low + 1, ((cell + 1) * total) // cells)
        freshest = 0.0
        for page in range(low, min(high, total, len(last))):
            if last[page] > freshest:
                freshest = last[page]
        age = now - freshest if freshest else HEAT_WINDOW
        heat.append(0 if age >= HEAT_WINDOW else round((1 - age / HEAT_WINDOW) * 100))
    out["heat"] = heat

    faults = getattr(vbar, "_om_faults", 0)
    refaults = getattr(vbar, "_om_refaults", 0)
    was = _fault_seen.get(id(vbar))
    _fault_seen[id(vbar)] = (faults, refaults, now)
    if was and now > was[2]:
        span = now - was[2]
        out["faults"] = round(max(0, faults - was[0]) / span, 1)
        out["refaults"] = round(max(0, refaults - was[1]) / span, 1)
    return out


def _module_bytes(mm, module) -> int:
    """How much a single module weighs."""
    try:
        return int(mm.module_size(module))
    except Exception:
        total = 0
        for _name, param in module.named_parameters(recurse=False):
            try:
                total += param.numel() * param.element_size()
            except Exception:
                continue
        return total


def blocks(index: int = 0, cells: int = 240) -> dict:
    """Where each part of one model's weights currently sits.

    Args:
        index: Which of the loaded models, largest first as :func:`models` lists them.
        cells: How many squares to divide it into.

    Returns:
        ``{ok, name, cells, devices, total, reason}``.
    """
    try:
        import comfy.model_management as mm
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "cells": [], "reason": str(error)[:120]}

    loaded = list(getattr(mm, "current_loaded_models", []))
    loaded.sort(key=lambda one: -(one.model_memory() if one.model is not None else 0))
    if index < 0 or index >= len(loaded):
        return {"ok": False, "cells": [], "reason": "no such model"}

    entry = loaded[index]
    patcher = entry.model
    inner = getattr(patcher, "model", None) if patcher is not None else None
    if inner is None:
        return {"ok": False, "cells": [], "reason": "that model is no longer held"}

    cells = max(24, min(2048, int(cells or 240)))

    paged = _vbar_pages(patcher, entry, cells)
    if paged is not None:
        paged["name"] = type(inner).__name__
        paged["index"] = index
        return paged

    segments: list[tuple[int, str]] = []
    try:
        for _name, module in inner.named_modules():
            params = list(module.named_parameters(recurse=False))
            if not params:
                continue
            size = _module_bytes(mm, module)
            if size <= 0:
                continue
            try:
                where = str(params[0][1].device)
            except Exception:
                where = "unknown"
            segments.append((size, where))
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "cells": [], "reason": f"the model could not be walked ({error})"}

    total = sum(size for size, _ in segments)
    if not total:
        return {"ok": False, "cells": [], "reason": "that model reports no weights"}
    cells = max(1, min(cells, len(segments)))

    grid = [dict() for _ in range(cells)]
    at = 0
    for size, where in segments:
        start, end = at, at + size
        at = end
        first = min(cells - 1, (start * cells) // total)
        last = min(cells - 1, ((end - 1) * cells) // total)
        for cell in range(first, last + 1):
            low = max(start, (cell * total) // cells)
            high = min(end, ((cell + 1) * total) // cells)
            if high > low:
                grid[cell][where] = grid[cell].get(where, 0) + (high - low)

    devices: dict[str, int] = {}
    for size, where in segments:
        devices[where] = devices.get(where, 0) + size

    order = sorted(devices, key=lambda one: -devices[one])
    seats = {name: position for position, name in enumerate(order)}
    packed = []
    for cell in grid:
        if not cell:
            packed.append(-1)
            continue
        packed.append(seats[max(cell, key=cell.get)])

    return {
        "ok": True,
        "source": "modules",
        "unit": "blocks",
        "name": type(inner).__name__,
        "index": index,
        "total": total,
        "modules": len(segments),
        "cells": packed,
        "devices": [{"device": name, "bytes": devices[name]} for name in order],
        "reason": "",
    }


BUSY_POWER = 0.35

BUSY_UTIL = 25

TIGHT_MEMORY = 0.94

STALL_CONFIRM = 45.0

OOM_WINDOW = 120.0

PINNED_UTIL = 90

PINNED_MEM_UTIL = 10

PINNED_POWER = 0.30

WORKING_POWER = 0.60

BANDWIDTH_BOUND = 60

CLOCK_IDLE = 0x1

CLOCK_CAPPED = 0x4 | 0x8 | 0x20 | 0x40 | 0x80

HANG_WATCH = 15.0

HANG_CONFIRM = 45.0

HANG_CONFIRM_LOOSE = 300.0

HANG_WATCH_LOOSE = 60.0

HANG_HOLD = 8

HANG_CAP = 24

HANG_REARM = 30.0

PID_EVERY = 5.0

PID_LOOKBACK = 2.0

PID_MAJORITY = 0.5

_watch: dict = {"quiet_since": 0.0, "mark": None, "resident": None,
                "bucket": 0, "since": 0.0, "rearm": 0.0}

_pid_seen: dict = {}


def _reset_watch() -> None:
    """Forget what the stopwatches were counting."""
    _watch.update({"quiet_since": 0.0, "mark": None, "resident": None,
                   "bucket": 0, "since": 0.0, "rearm": 0.0})


def _queue_state() -> tuple:
    """What ComfyUI is running and what is waiting, or empty lists where it cannot be asked."""
    try:
        from server import PromptServer

        return PromptServer.instance.prompt_queue.get_current_queue_volatile()
    except Exception:  # noqa: BLE001
        return ([], [])


def _recent_oom(now: float) -> tuple[int, str] | None:
    """An out-of-memory failure in the recent past, or ``None``.

    Returns:
        ``(seconds ago, node)``, where the node is the type or id the failure names and an
        empty string where it names neither.
    """
    try:
        from server import PromptServer

        history = PromptServer.instance.prompt_queue.get_history(max_items=8)
    except Exception:  # noqa: BLE001
        return None
    newest = 0.0
    said = ""
    for entry in (history or {}).values():
        status = entry.get("status") if isinstance(entry, dict) else None
        messages = (status or {}).get("messages") or []
        for message in messages:
            if not isinstance(message, (list, tuple)) or len(message) != 2:
                continue
            event, data = message
            if event != "execution_error" or not isinstance(data, dict):
                continue
            kind = str(data.get("exception_type") or "")
            text = str(data.get("exception_message") or "")
            if "outofmemory" not in kind.lower().replace("_", "") \
                    and "out of memory" not in text.lower():
                continue
            when = float(data.get("timestamp") or 0) / 1000
            if when > newest:
                newest = when
                said = str(data.get("node_type") or data.get("node_id") or "")
    if not newest or now - newest > OOM_WINDOW:
        return None
    return (int(now - newest), said)


def _busiest(reading: dict) -> dict:
    """The device doing the most, which is the one worth describing."""
    devices = reading.get("devices") or []
    if not devices:
        return {}
    return max(devices, key=lambda one: (one.get("util") or 0, one.get("used") or 0))


def _run_device(reading: dict) -> dict:
    """The device the prompt is running on, or the busiest where that cannot be asked."""
    devices = reading.get("devices") or []
    if not devices:
        return {}
    try:
        import comfy.model_management as mm

        wanted = mm.get_torch_device()
        index = wanted.index if wanted.index is not None else 0
        for one in devices:
            if one.get("type") == wanted.type and one.get("index") == index:
                return one
    except Exception:  # noqa: BLE001
        pass
    return _busiest(reading)


def _pinned(device: dict, share: float | None) -> bool:
    """Whether the card is holding kernels without doing arithmetic."""
    util = device.get("util")
    mem_util = device.get("mem_util")
    events = device.get("clock_events")
    if share is None or share > PINNED_POWER:
        return False
    if not isinstance(util, (int, float)) or util < PINNED_UTIL:
        return False
    if not isinstance(mem_util, (int, float)) or mem_util > PINNED_MEM_UTIL:
        return False
    if isinstance(events, int) and (events & (CLOCK_IDLE | CLOCK_CAPPED)):
        return False
    return True


def _running_id(running) -> str:
    """The id of the prompt being run, or an empty string."""
    try:
        return str(running[0][1])
    except Exception:  # noqa: BLE001
        return ""


def _running_node(running) -> list:
    """The node the run is on, as a fact row, or nothing where it cannot be said."""
    try:
        from server import PromptServer

        node = PromptServer.instance.last_node_id
        if node is None:
            return []
        spec = (running[0][2] or {}).get(str(node)) or {}
        name = (spec.get("_meta") or {}).get("title") or spec.get("class_type") or ""
        return [["Node", f"{name} #{node}" if name else f"#{node}"]]
    except Exception:  # noqa: BLE001
        return []


def _progress_mark() -> tuple:
    """A value that changes whenever the run advances.

    Returns:
        Something comparable, empty only where neither the registry nor the server can be
        reached.
    """
    mark: list = []
    try:
        module = sys.modules.get("comfy_execution.progress")
        registry = getattr(module, "global_progress_registry", None) if module else None
        if registry is not None:
            nodes = list(registry.nodes.values())
            steps = 0.0
            for one in nodes:
                try:
                    steps += float(one.get("value") or 0)
                except Exception:  # noqa: BLE001
                    continue
            mark.extend([str(registry.prompt_id), len(nodes), round(steps, 3)])
    except Exception:  # noqa: BLE001
        pass
    try:
        from server import PromptServer

        mark.append(PromptServer.instance.last_node_id)
    except Exception:  # noqa: BLE001
        pass
    return tuple(mark)


def _mark_step(now: float, prompt: str) -> bool | None:
    """Whether the run has advanced since the last reading.

    Returns:
        ``True`` where it has, ``False`` where it has not, ``None`` where the two readings
        cannot be compared: a different prompt, or too long a gap between them.
    """
    mark = _progress_mark()
    was = _watch.get("mark")
    _watch["mark"] = (mark, now, prompt)
    if not was or was[2] != prompt or now - was[1] > _interval() * 3:
        return None
    return mark != was[0]


def _resident_bytes() -> int | None:
    """Weight bytes the loaded models have on the card, or ``None``."""
    try:
        import comfy.model_management as mm
    except Exception:  # noqa: BLE001
        return None
    total = 0
    found = False
    for entry in list(getattr(mm, "current_loaded_models", [])):
        try:
            total += int(entry.model_loaded_memory() or 0)
            found = True
        except Exception:  # noqa: BLE001
            continue
    return total if found else None


def _resident_step(now: float, prompt: str) -> tuple | None:
    """How many weight bytes have arrived on the card since the last reading.

    Returns:
        ``(bytes, seconds)``, or ``None`` where the two readings cannot be compared: nothing
        to read, a different prompt, or too long a gap to call the difference a rate.
    """
    total = _resident_bytes()
    was = _watch.get("resident")
    _watch["resident"] = (total, now, prompt) if total is not None else None
    if total is None or not was or was[2] != prompt:
        return None
    span = now - was[1]
    if span <= 0 or span > _interval() * 3:
        return None
    return (total - was[0], span)


def _pid_share(device: dict, now: float) -> float | None:
    """This process's share of a card's utilisation, or ``None`` where it cannot be said."""
    index = device.get("index")
    handles = _nvml_handles()
    if not isinstance(index, int) or index >= len(handles):
        return None
    was = _pid_seen.get(index)
    if was and now - was[0] < PID_EVERY:
        return was[1]
    found = None
    try:
        since = int((time.time() - PID_LOOKBACK) * 1_000_000)
        ours = os.getpid()
        total = 0
        mine = 0
        for row in _nvml.nvmlDeviceGetProcessUtilization(handles[index], since) or []:
            one = int(getattr(row, "smUtil", 0) or 0)
            total += one
            if int(getattr(row, "pid", -1)) == ours:
                mine += one
        if total:
            found = mine / total
    except Exception:  # noqa: BLE001
        found = None
    _pid_seen[index] = (now, found)
    return found


def _hang_watch(now: float, qualifies: bool, advanced: bool) -> tuple[int, float]:
    """Advance the stopwatch on a card that is busy without working.

    Returns:
        ``(readings held, seconds held)``.
    """
    was = int(_watch.get("bucket") or 0)
    if advanced:
        bucket = 0
    elif qualifies:
        bucket = min(HANG_CAP, was + 1)
    else:
        bucket = max(0, was - 2)
    _watch["bucket"] = bucket
    if not bucket:
        _watch["since"] = 0.0
        if was >= HANG_HOLD:
            _watch["rearm"] = now + HANG_REARM
    elif not _watch.get("since"):
        _watch["since"] = now
    return bucket, now - float(_watch.get("since") or now)


def activity(reading: dict | None = None) -> dict:
    """What the machine is doing, in one word, with the reasoning attached.

    Args:
        reading: A sample to read the devices from. Taken fresh where none is given.

    Returns:
        ``{state, label, facts, detail}`` where state is one of ``idle``, ``working``,
        ``streaming``, ``stalling``, ``stalled``, ``thrashing``, ``hang``, ``oom``, facts is
        a list of ``[label, value]`` pairs already formatted for reading, and detail is one
        sentence that stands on its own.
    """
    now = time.time()
    reading = reading if reading is not None else sample()
    ram = reading.get("ram") or {}

    oom = _recent_oom(now)
    if oom:
        _reset_watch()
        ago, node = oom
        facts = [["Failed", f"{_span(ago)} ago"]]
        if node:
            facts.append(["Node", node])
        facts += _memory_rows(_run_device(reading), ram, True)
        return {"state": "oom", "label": "Out of memory", "facts": facts,
                "detail": "The run failed for want of memory, so ComfyUI let go of "
                          "everything it held."}

    running, pending = _queue_state()
    held = models() if not running else {"totals": {}}
    if not running:
        _reset_watch()
        totals = held.get("totals") or {}
        count = int(totals.get("count") or 0)
        facts = []
        if pending:
            facts.append(["Queued", f"{len(pending)} prompt{'' if len(pending) == 1 else 's'}"])
        if held.get("ok"):
            facts.append(["Models held", str(count)])
        if count:
            facts.append(["Resident", _size(totals.get("resident") or 0)])
        facts += _memory_rows(_run_device(reading), ram)
        return {"state": "idle", "label": "Idle", "facts": facts,
                "detail": "Nothing is running; models stay loaded until the room is needed."
                          if count else "Nothing is running and no weights are loaded."}

    prompt = _running_id(running)
    device = _run_device(reading)
    util = device.get("util")
    mem_util = device.get("mem_util")
    events = device.get("clock_events")
    watts = device.get("watts")
    limit = device.get("watt_limit") or 0
    share = (watts / limit) if (watts and limit) else None

    idling = isinstance(events, int) and bool(events & CLOCK_IDLE)
    computing = (isinstance(events, int) and bool(events & CLOCK_CAPPED)) \
        or (share is not None and share >= WORKING_POWER) \
        or (isinstance(mem_util, (int, float)) and mem_util >= BANDWIDTH_BOUND)
    busy = computing or (share is not None and share >= BUSY_POWER) \
        or (isinstance(util, (int, float)) and util >= BUSY_UTIL and not idling)

    counters = _counters(device)
    vram_share = (device.get("used") or 0) / (device.get("total") or 1)
    ram_share = (ram.get("used") or 0) / (ram.get("total") or 1)
    tight = max(vram_share, ram_share) >= TIGHT_MEMORY
    memory = _memory_rows(device, ram)

    advanced = _mark_step(now, prompt)
    step = _resident_step(now, prompt)
    arriving = bool(step and step[0] > 0)
    weighed = [["Weights in", _size(step[0]) if arriving else "none"]] if step else []

    if busy:
        _watch["quiet_since"] = 0.0
        churn = _stream_churn(now)
        thrash = bool(churn and churn[0] >= THRASH_RATE
                      and churn[1] / churn[0] >= THRASH_SHARE)
        qualifies = _pinned(device, share) and not arriving \
            and not (churn and churn[0] > 0)
        bucket, since = _hang_watch(now, qualifies, advanced is True)
        confirm = HANG_CONFIRM if tight else HANG_CONFIRM_LOOSE

        if bucket >= HANG_HOLD and since >= confirm \
                and now >= float(_watch.get("rearm") or 0):
            owned = _pid_share(device, now)
            if owned is not None and owned >= PID_MAJORITY:
                return {"state": "hang", "label": "Possible GPU hang",
                        "facts": [["No progress", _span(since)], *_running_node(running),
                                  *counters, *weighed, *memory],
                        "detail": "Reads as a card holding a kernel rather than working "
                                  "through one."}
        if thrash:
            back = round(churn[1] / churn[0] * 100)
            return {"state": "thrashing", "label": "Streaming thrash",
                    "facts": [["Page faults", f"{churn[0]:.0f}/s"],
                              ["Pages back", f"{churn[1]:.0f}/s ({back}%)"],
                              *counters, *memory],
                    "detail": "The card is fetching weights it already had rather than "
                              "getting through the run."}
        if arriving and not computing and not idling:
            return {"state": "streaming", "label": "Streaming weights",
                    "facts": [["Weights in", f"{_size(step[0])} in {_span(step[1])}"],
                              *counters, *memory],
                    "detail": "The card is fetching the model rather than waiting on it."}
        if bucket and since >= (HANG_WATCH if tight else HANG_WATCH_LOOSE):
            return {"state": "stalling", "label": "Potential GPU hang",
                    "facts": [["Watching", _span(since)], *_running_node(running),
                              *counters, *weighed, *memory],
                    "detail": "Could be a long kernel or a hang: too early to say which."}
        return {"state": "working", "label": "Working", "facts": [*counters, *memory],
                "detail": "The card is computing, and work is going through."}

    _watch["bucket"] = 0
    _watch["since"] = 0.0
    quiet = [*counters, *_cpu_rows(reading), *memory]
    if not tight:
        _watch["quiet_since"] = 0.0
        return {"state": "working", "label": "Working", "facts": quiet,
                "detail": "Memory is not tight, so this is a node that does not use the card."}

    if advanced is not False or not _watch.get("quiet_since"):
        _watch["quiet_since"] = now

    stuck = now - float(_watch["quiet_since"] or now)
    if stuck >= STALL_CONFIRM:
        return {"state": "stalled", "label": "Memory stalled",
                "facts": [["No progress", _span(stuck)], *_running_node(running), *quiet],
                "detail": "Memory is full and nothing is moving: thrashing, not working."}
    return {"state": "stalling", "label": "Potential memory stall",
            "facts": [["Watching", _span(stuck)], *quiet],
            "detail": "Memory is nearly full and nothing is moving; it may be a slow step."}

def _span(seconds: float) -> str:
    """A duration at the coarseness a reader can act on."""
    count = int(max(0, seconds))
    if count < 60:
        return f"{count}s"
    if count < 3600:
        return f"{count // 60}m {count % 60}s"
    return f"{count // 3600}h {count % 3600 // 60}m"


def _pct(value) -> str:
    """A percentage as a whole number, or an empty string where there is no reading."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return ""
    return f"{round(value)}%"


def _fill(used, total) -> str:
    """A share of a memory total, or an empty string where the total is unknown."""
    if not total:
        return ""
    return f"{round((used or 0) / total * 100)}% of {_size(total)}"


def _counters(device: dict) -> list:
    """The card's three counters, leaving out whatever it will not report."""
    rows = []
    util = _pct(device.get("util"))
    traffic = _pct(device.get("mem_util"))
    watts = device.get("watts")
    limit = device.get("watt_limit") or 0
    if util:
        rows.append(["Utilisation", util])
    if traffic:
        rows.append(["Memory traffic", traffic])
    if watts is not None:
        rows.append(["Power", f"{round(watts)} W" + (f" of {round(limit)} W" if limit else "")])
    return rows


def _cpu_rows(reading: dict) -> list:
    """Processor load, where psutil answered."""
    load = _pct(reading.get("cpu"))
    return [["CPU", load]] if load else []


def _memory_rows(device: dict, ram: dict, host: bool = False) -> list:
    """Card memory, and host memory where it is asked for or is itself tight."""
    rows = []
    card = _fill(device.get("used"), device.get("total"))
    if card:
        rows.append(["VRAM", card])
    total = ram.get("total") or 0
    held = _fill(ram.get("used"), total)
    if held and (host or (ram.get("used") or 0) / total >= TIGHT_MEMORY):
        rows.append(["RAM", held])
    return rows


def _size(value: int) -> str:
    """Bytes, in the shortest honest unit."""
    step = float(value)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if step < 1024 or unit == "TB":
            return f"{step:.0f} {unit}" if unit in ("B", "KB") else f"{step:.1f} {unit}"
        step /= 1024
    return f"{value} B"


def free(vram: bool = False, ram: bool = False) -> dict:
    """Ask ComfyUI to let go of what it is holding.

    Args:
        vram: Unload every model.
        ram: Clear the cached results of the last run, which unloads models with them.

    Returns:
        ``{ok, reason, did}``.
    """
    if not vram and not ram:
        return {"ok": False, "reason": "nothing asked for", "did": ""}
    try:
        from server import PromptServer

        queue = PromptServer.instance.prompt_queue
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "reason": str(error)[:120], "did": ""}
    if ram:
        queue.set_flag("free_memory", True)
        return {"ok": True, "reason": "",
                "did": "Clearing the cached results and unloading the models with them."}
    queue.set_flag("unload_models", True)
    return {"ok": True, "reason": "", "did": "Unloading every model."}


def unload(model_id: int, name: str = "") -> dict:
    """Unload one model ComfyUI is holding, with its clones.

    Args:
        model_id: The ``id`` the model list reported for it.
        name: The class name it was listed under, or empty. The unload is refused when it
            is given and differs from the model's.

    Returns:
        ``{ok, reason, freed, name}``.
    """
    try:
        import comfy.model_management as mm
    except Exception as error:  # noqa: BLE001
        return {"ok": False, "reason": str(error)[:120], "freed": 0, "name": ""}

    running, _ = _queue_state()
    if running:
        return {"ok": False, "freed": 0, "name": "",
                "reason": "a prompt is running"}

    for entry in list(getattr(mm, "current_loaded_models", [])):
        patcher = getattr(entry, "model", None)
        if patcher is None or id(patcher) != int(model_id):
            continue
        inner = getattr(patcher, "model", None)
        listed = type(inner).__name__ if inner is not None else "unknown"
        if name and listed != name:
            return {"ok": False, "freed": 0, "name": listed,
                    "reason": "the model list has changed"}
        try:
            freed = int(entry.model_memory() or 0)
        except Exception:  # noqa: BLE001
            freed = 0
        try:
            mm.unload_model_and_clones(patcher)
        except Exception as error:  # noqa: BLE001
            return {"ok": False, "reason": str(error)[:160], "freed": 0, "name": listed}
        try:
            import gc

            gc.collect()
            mm.soft_empty_cache()
        except Exception:  # noqa: BLE001
            pass
        return {"ok": True, "reason": "", "freed": freed, "name": listed}

    return {"ok": False, "freed": 0, "name": "",
            "reason": "that model is no longer loaded"}


def state() -> dict:
    """Who is watching, and how often."""
    _expire(time.time())
    return {
        "viewers": len(_leases),
        "interval": _interval(),
        "running": _task is not None and not _task.done(),
        "watching": watching(),
        "channel": CHANNEL,
    }


async def _loop() -> None:
    """Sample and push until the last lease lapses."""
    from server import PromptServer

    try:
        while True:
            now = time.time()
            _expire(now)
            if not _leases:
                watch_faults(False)
                return
            asked = _interval()
            wait = asked
            try:
                started = time.monotonic()
                reading = await asyncio.to_thread(sample)
                took = time.monotonic() - started
                wait = max(asked, min(SAMPLE_BACKOFF_CAP, took * SAMPLE_SHARE))
                reading["took"] = round(took, 3)
                reading["every"] = round(wait, 2)
                try:
                    reading["activity"] = activity(reading)
                except Exception as error:  # noqa: BLE001
                    logger.debug("activity failed (%s: %s)", type(error).__name__, error)
                PromptServer.instance.send_sync(CHANNEL, reading)
            except Exception as error:  # noqa: BLE001
                logger.debug("monitor sample failed (%s: %s)", type(error).__name__, error)
            await asyncio.sleep(wait)
    finally:
        global _task
        _task = None


def lease(client: str, interval: float = DEFAULT_INTERVAL, watch: bool = False) -> dict:
    """Ask for readings, or say you still want them.

    Args:
        client: Something stable for this viewer, so renewing replaces rather than adds.
        interval: Seconds between samples, clamped to :data:`MIN_INTERVAL`..
            :data:`MAX_INTERVAL`.
        watch: Also record which blocks the run touches, for as long as this lease lasts.

    Returns:
        What :func:`state` reports afterwards.
    """
    global _task
    if not client:
        return state()
    wanted = max(MIN_INTERVAL, min(MAX_INTERVAL, float(interval or DEFAULT_INTERVAL)))
    _leases[client[:120]] = {
        "interval": wanted,
        "expires": time.time() + wanted * LEASE_INTERVALS,
        "watch": bool(watch),
    }
    _sync_watch()
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())
    return state()


def release(client: str) -> dict:
    """Drop one viewer's lease."""
    _leases.pop((client or "")[:120], None)
    _sync_watch()
    return state()


async def stop() -> None:
    """Drop every lease and stop sampling."""
    global _task
    _leases.clear()
    if _task is not None and not _task.done():
        _task.cancel()
    _task = None
