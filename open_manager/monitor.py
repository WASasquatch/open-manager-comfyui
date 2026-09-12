"""What the machine is doing, sampled only while somebody is looking.

A monitor that keeps measuring after its panel is closed is a cost with nobody to read it, so
sampling here is driven by leases rather than by a switch. A client that wants readings asks
for one and renews it; when the last lease lapses the timer stops. A counter alone would not
do, because a browser tab that is closed never gets to decrement anything -- so a lease that
is not renewed simply expires.

Readings are pushed over the websocket ComfyUI already holds open rather than answered from a
new endpoint, which keeps a reading at one message instead of a request and a response.
"""

from __future__ import annotations

import asyncio
import time

from . import log

__all__ = ["activity", "blocks", "free", "lease", "models", "release", "sample", "state",
           "stop", "unload"]

logger = log.get_logger("monitor")

#: Message type the readings are pushed under. Registered by the panel before it asks for a
#: lease, so ComfyUI dispatches it rather than reporting it as an unknown type.
CHANNEL = "open_manager.monitor"

#: Seconds between samples, unless a client asks for something else.
DEFAULT_INTERVAL = 2.0

#: The range a client may ask for. Below the floor this measures itself more than the machine.
MIN_INTERVAL = 1.0
MAX_INTERVAL = 10.0

#: Intervals a lease survives without being renewed. Three is enough to ride out a slow frame
#: or a tab that is briefly busy, and short enough that a closed tab stops the timer promptly.
LEASE_INTERVALS = 3

#: client id -> {expires, interval}
_leases: dict[str, dict] = {}
_task: "asyncio.Task | None" = None


def _psutil():
    """psutil, or ``None`` where it cannot be imported.

    ComfyUI depends on it, so this is nearly always present; a reading it would have supplied
    is left out rather than the whole sample failing.
    """
    try:
        import psutil

        return psutil
    except Exception:
        return None


#: NVML, once it has been tried. ``False`` means it was tried and is not usable, which is not
#: an error: a machine without NVIDIA tooling simply reports no temperature.
_nvml = None


def _nvml_handles():
    """A handle per NVIDIA device, or an empty list.

    NVML is initialised once. Where it is missing, or refuses, temperatures and utilisation
    are left out of the reading rather than the reading failing.
    """
    global _nvml
    if _nvml is False:
        return []
    if _nvml is None:
        try:
            import pynvml

            pynvml.nvmlInit()
            _nvml = pynvml
        except Exception:
            _nvml = False
            return []
    try:
        return [_nvml.nvmlDeviceGetHandleByIndex(i)
                for i in range(_nvml.nvmlDeviceGetCount())]
    except Exception:
        return []


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
            entry["util"] = int(_nvml.nvmlDeviceGetUtilizationRates(handle).gpu)
        except Exception:
            pass
        # Watts say what utilisation cannot. A card can report busy while it waits on memory;
        # a card drawing a third of its limit is doing arithmetic.
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
        found.append(entry)
    return found


def _cpu_temps(tool) -> list[dict]:
    """Processor temperatures, where the platform reports any.

    ``sensors_temperatures`` is not present on every platform -- Windows has no such attribute
    at all -- so this is frequently empty and that is not a failure. A package reading is
    preferred over each individual core, since one figure per socket is what a reader wants.
    """
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
            # One per package or die, not one per core: a reader wants a handful of numbers.
            if "package" in label.lower() or "die" in label.lower() or not found:
                found.append({"label": label or source, "temp": round(float(current), 1)})
    return found[:8]


def _interval() -> float:
    """The shortest interval any current lease asked for."""
    wanted = [one["interval"] for one in _leases.values()]
    return min(wanted) if wanted else DEFAULT_INTERVAL


def _expire(now: float) -> None:
    """Drop leases nobody renewed."""
    for client in [key for key, one in _leases.items() if one["expires"] <= now]:
        _leases.pop(client, None)


def sample() -> dict:
    """One reading of the machine.

    Every part is optional: a figure that cannot be taken is left out rather than reported as
    zero, which would read as "idle" rather than "unknown".

    Returns:
        ``{at, cpu, ram, vram, devices}``.
    """
    reading: dict = {"at": time.time()}

    tool = _psutil()
    if tool is not None:
        try:
            # Without an interval this is the load since the previous call, which is exactly
            # the window between samples and costs nothing to take.
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

        # Every device, not just the one ComfyUI happens to prefer: a machine with four cards
        # is a machine where the interesting question is which of them is busy.
        extras = {one.get("index"): one for one in _nvml_readings()}
        devices = []
        for device in mm.get_all_torch_devices():
            if device.type == "cpu":
                continue
            vram_total = mm.get_total_memory(device)
            vram_free = mm.get_free_memory(device)
            entry = {
                "name": mm.get_torch_device_name(device),
                "type": device.type,
                "index": device.index if device.index is not None else 0,
                "total": vram_total,
                "free": vram_free,
                "used": vram_total - vram_free,
            }
            # NVML orders its devices the same way torch does unless CUDA_VISIBLE_DEVICES has
            # reordered them, so a mismatch means no temperature rather than a wrong one.
            extra = extras.get(entry["index"])
            if extra and (not extra.get("name") or extra["name"] in entry["name"]):
                for key in ("temp", "util", "watts", "watt_limit"):
                    if key in extra:
                        entry[key] = extra[key]
            devices.append(entry)
        if devices:
            reading["devices"] = devices
            reading["vram"] = devices[0]
    except Exception:
        # A build without torch, or a device that will not answer. The rest of the sample
        # still stands.
        pass

    return reading


def _pin_state(patcher, device) -> dict:
    """What this build knows about a model's pinned host memory.

    Pinning and block streaming are a fork's business and the shapes differ between them, so
    every field is reached for separately and a missing one is simply absent.
    """
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

    A model can be resident on the device, offloaded to host memory, or split between them
    while it streams; the figures that matter are therefore what it weighs and how much of
    that is on the device right now, not simply that it is "loaded".

    Returns:
        ``{ok, models, totals, reason}``.
    """
    try:
        import comfy.model_management as mm
    except Exception as error:  # noqa: BLE001 - a build without it is not an error here
        return {"ok": False, "models": [], "totals": {}, "reason": str(error)[:120]}

    rows = []
    for entry in list(getattr(mm, "current_loaded_models", [])):
        try:
            patcher = entry.model
            if patcher is None:
                # A weak reference that has gone; the model is on its way out.
                continue
            total = int(entry.model_memory() or 0)
            resident = int(entry.model_loaded_memory() or 0)
            inner = getattr(patcher, "model", None)
            row = {
                # Identity rather than position: the list is sorted for reading and shifts as
                # models come and go, so a row has to say which model it means.
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
            # One model that will not answer should not lose the rest of the list.
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


#: What a page of a streamed model can be. The flags come from the streaming library: bit one
#: means the page is on the card, bit two means it is pinned there.
PAGE_STATES = ("host", "on device", "pinned", "on device, pinned")

#: How much address space the streaming library reserves against a model's real size. Its own
#: comment calls it headroom for casting a whole model to a wider type with room to spare.
VBAR_OVERCOMMIT = 10


def _vbar_pages(patcher, entry, cells: int):
    """The residency of a streamed model, a page at a time, or ``None``.

    The streaming library keeps the model in a virtual range and reports which of its pages
    are on the card. That is the authority on what is resident; nothing else on the model
    knows it, and the parameters themselves go on reporting the host.

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

    # The range is deliberately allocated at ten times the model, so most of it is address
    # space the model never occupies. Describing all of it would report a model as entirely
    # absent from the card simply because its unused tail is. The model's own extent is that
    # tenth, and only that is described.
    model_pages = max(1, -(-len(flags) // VBAR_OVERCOMMIT))
    flags = flags[:model_pages]
    total = len(flags)

    states = [(1 if flag & 1 else 0) + (2 if flag & 2 else 0) for flag in flags]
    counts = [0, 0, 0, 0]
    for state in states:
        counts[state] += 1

    seen = [state for state in range(4) if counts[state]]
    seats = {state: position for position, state in enumerate(seen)}

    # Each square is asked which pages it covers, rather than each page being told which
    # square to fall in. A model with fewer pages than squares then reads as bands rather
    # than as a scatter of dots with gaps between them.
    packed = []
    for cell in range(cells):
        low = (cell * total) // cells
        high = max(low + 1, ((cell + 1) * total) // cells)
        tally: dict = {}
        for position in range(low, min(high, total)):
            tally[states[position]] = tally.get(states[position], 0) + 1
        packed.append(seats[max(tally, key=tally.get)] if tally else -1)

    page_bytes = int(entry.model_memory() / total) if total else 0

    return {
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

    A model is not simply on the card or off it. Under block streaming its modules are moved
    between host and device as it runs, so the useful picture is the layout: which stretches
    of the model are resident and which are not, in the order the model is written.

    The modules are walked in order and their bytes poured into a fixed number of cells, the
    way a disk map pours sectors into squares. A cell takes the colour of whichever device
    owns most of it, so a long resident stretch reads as a block of one colour rather than as
    a thousand separate readings.

    Args:
        index: Which of the loaded models, newest first as :func:`models` lists them.
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

    cells = max(24, min(600, int(cells or 240)))

    # The device a module's parameters report is where its home copy lives, which under block
    # streaming is the host for the whole model even while all of it is resident. Asking the
    # streaming machinery directly is the only way to get the real picture, so that is tried
    # first and the module walk is only a fallback for models that do not stream.
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

    # Each module occupies a stretch of the model, and each square a stretch of the same
    # length; the overlap between them is what a square gets.
    #
    # Done in whole bytes rather than by pouring out a running remainder. A remainder carried
    # in floating point lands a hair past a boundary, leaves a room of about nothing, and the
    # loop then advances by about nothing for as long as you let it.
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
        # One number per square, indexing into the device list, so this stays small enough to
        # ask for repeatedly.
        "cells": packed,
        "devices": [{"device": name, "bytes": devices[name]} for name in order],
        "reason": "",
    }


# --- what the machine is doing --------------------------------------------------------------

#: Share of a card's power limit above which it is plainly doing arithmetic.
BUSY_POWER = 0.35

#: Utilisation above which it is plainly busy, whatever the wattage says.
BUSY_UTIL = 25

#: How full memory has to be before a quiet card is suspicious rather than merely quiet.
TIGHT_MEMORY = 0.94

#: Seconds a quiet, memory-tight run must stay on the same node before this stops hedging and
#: calls it stalled. Long, because a slow node is not a stall and saying so would be wrong.
STALL_CONFIRM = 45.0

#: Seconds an out-of-memory failure keeps the light red.
OOM_WINDOW = 120.0

#: What the last few samples saw, so "it has not moved" can be said with a stopwatch rather
#: than guessed from one reading.
_watch: dict = {"node": None, "quiet_since": 0.0}


def _queue_state() -> tuple:
    """What ComfyUI is running and what is waiting, or empty lists where it cannot be asked."""
    try:
        from server import PromptServer

        return PromptServer.instance.prompt_queue.get_current_queue_volatile()
    except Exception:  # noqa: BLE001 - no queue means nothing is running, for our purposes
        return ([], [])


def _recent_oom(now: float) -> str:
    """An out-of-memory failure in the recent past, described, or an empty string.

    Read from ComfyUI's own history rather than from the log, so it carries the time it
    happened and stops being reported once it is old news.
    """
    try:
        from server import PromptServer

        history = PromptServer.instance.prompt_queue.get_history(max_items=8)
    except Exception:  # noqa: BLE001
        return ""
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
        return ""
    ago = int(now - newest)
    return f"ran out of memory {ago}s ago" + (f" in {said}" if said else "")


def _busiest(reading: dict) -> dict:
    """The device doing the most, which is the one worth describing."""
    devices = reading.get("devices") or []
    if not devices:
        return {}
    return max(devices, key=lambda one: (one.get("util") or 0, one.get("used") or 0))


def activity(reading: dict | None = None) -> dict:
    """What the machine is doing, in one word, with the reasoning attached.

    Five states, and the hedging is deliberate. A card that is quiet is not stalled: it may
    be waiting on the disk, on a node that runs on the processor, or on a model being moved.
    So quiet only becomes suspicious when memory is nearly full, and suspicion only becomes a
    claim once nothing has moved for the better part of a minute. Saying "stalled" about a
    slow node would teach the reader to ignore the light.

    Args:
        reading: A sample to read the devices from. Taken fresh where none is given.

    Returns:
        ``{state, label, detail}`` where state is one of ``idle``, ``working``,
        ``stalling``, ``stalled``, ``oom``.
    """
    now = time.time()
    reading = reading if reading is not None else sample()

    oom = _recent_oom(now)
    if oom:
        _watch["quiet_since"] = 0.0
        return {"state": "oom", "label": "Out of memory",
                "detail": f"The last run {oom}. ComfyUI unloaded everything it was holding."}

    running, pending = _queue_state()
    held = models() if not running else {"totals": {}}
    if not running:
        _watch["node"] = None
        _watch["quiet_since"] = 0.0
        totals = held.get("totals") or {}
        count = int(totals.get("count") or 0)
        waiting = f", {len(pending)} queued" if pending else ""
        if not count:
            return {"state": "idle", "label": "Idle",
                    "detail": f"Nothing running and nothing in memory{waiting}."}
        return {"state": "idle", "label": "Idle",
                "detail": f"Nothing running{waiting}. {count} model"
                          f"{'' if count == 1 else 's'} still held, "
                          f"{_size(totals.get('resident') or 0)} resident."}

    device = _busiest(reading)
    util = device.get("util")
    watts = device.get("watts")
    limit = device.get("watt_limit") or 0
    share = (watts / limit) if (watts and limit) else None
    busy = (isinstance(util, (int, float)) and util >= BUSY_UTIL) \
        or (share is not None and share >= BUSY_POWER)

    where = []
    if isinstance(util, (int, float)):
        where.append(f"{util}% busy")
    if watts is not None:
        where.append(f"{watts:g} W" + (f" of {limit:g} W" if limit else ""))

    if busy:
        _watch["quiet_since"] = 0.0
        return {"state": "working", "label": "Working",
                "detail": "Running" + (f": {', '.join(where)}" if where else "") + "."}

    # Quiet. Only worth worrying about if there is no room to work in.
    vram_share = (device.get("used") or 0) / (device.get("total") or 1)
    ram = reading.get("ram") or {}
    ram_share = (ram.get("used") or 0) / (ram.get("total") or 1)
    tight = max(vram_share, ram_share) >= TIGHT_MEMORY
    if not tight:
        _watch["quiet_since"] = 0.0
        return {"state": "working", "label": "Working",
                "detail": "Running, and quiet at the moment"
                          + (f": {', '.join(where)}" if where else "")
                          + ". Memory is not tight, so this is a node that does not use the "
                            "card rather than a hold-up."}

    node = None
    try:
        from server import PromptServer

        node = PromptServer.instance.last_node_id
    except Exception:  # noqa: BLE001
        pass
    if node != _watch.get("node"):
        _watch["node"] = node
        _watch["quiet_since"] = now
    elif not _watch.get("quiet_since"):
        _watch["quiet_since"] = now

    stuck = now - float(_watch["quiet_since"] or now)
    full = f"{round(max(vram_share, ram_share) * 100)}% of memory in use"
    facts = ", ".join([*where, full])
    if stuck >= STALL_CONFIRM:
        return {"state": "stalled", "label": "Memory stalled",
                "detail": f"Running, but nothing has moved for {int(stuck)}s and memory is "
                          f"full: {facts}. This is thrashing rather than working."}
    return {"state": "stalling", "label": "Potential memory stall",
            "detail": f"Running quietly with memory nearly full: {facts}. Watching for "
                      f"{int(stuck)}s; it may simply be a slow step."}


def _size(value: int) -> str:
    """Bytes, in the shortest honest unit."""
    step = float(value)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if step < 1024 or unit == "TB":
            return f"{step:.0f} {unit}" if unit in ("B", "KB") else f"{step:.1f} {unit}"
        step /= 1024
    return f"{value} B"


# --- giving memory back -----------------------------------------------------------------------

def free(vram: bool = False, ram: bool = False) -> dict:
    """Ask ComfyUI to let go of what it is holding.

    Done the way ComfyUI does it itself: a flag the prompt worker picks up, so the freeing
    happens on the thread that owns the models rather than under one that does not. The
    worker is woken as the flag is set, so this is not a wait for the next prompt.

    ComfyUI frees the two together in one direction: clearing the cached results also unloads
    the models, because the results hold references to them. Unloading models does not clear
    the cache. That asymmetry is its own, and it is passed on rather than papered over.

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

    Refused while a prompt is running. Pulling weights out from under a sampler is a way to
    fail a run that was going to succeed, and there is no ordering here that makes that safe.

    Args:
        model_id: The ``id`` the model list reported for it.
        name: The class name it was listed under, checked so a list that has moved on cannot
            unload something other than the row that was clicked.

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
                "reason": "a prompt is running. Unloading a model it is using would fail the "
                          "run, so this waits until the queue is idle."}

    for entry in list(getattr(mm, "current_loaded_models", [])):
        patcher = getattr(entry, "model", None)
        if patcher is None or id(patcher) != int(model_id):
            continue
        inner = getattr(patcher, "model", None)
        listed = type(inner).__name__ if inner is not None else "unknown"
        if name and listed != name:
            return {"ok": False, "freed": 0, "name": listed,
                    "reason": "the list has moved on since it was drawn; refresh and try again"}
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
        "watching": len(_leases),
        "interval": _interval(),
        "running": _task is not None and not _task.done(),
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
                return
            try:
                # The light rides along with the reading rather than being asked for
                # separately: it is read from the same figures, and a panel that has the
                # reading should not have to make a second request to know what it means.
                reading = sample()
                try:
                    reading["activity"] = activity(reading)
                except Exception as error:  # noqa: BLE001 - a reading without it is still one
                    logger.debug("activity failed (%s: %s)", type(error).__name__, error)
                PromptServer.instance.send_sync(CHANNEL, reading)
            except Exception as error:  # noqa: BLE001 - a bad sample must not end the loop
                logger.debug("monitor sample failed (%s: %s)", type(error).__name__, error)
            await asyncio.sleep(_interval())
    finally:
        global _task
        _task = None


def lease(client: str, interval: float = DEFAULT_INTERVAL) -> dict:
    """Ask for readings, or say you still want them.

    Args:
        client: Something stable for this viewer, so renewing replaces rather than adds.
        interval: Seconds between samples, clamped to :data:`MIN_INTERVAL`..
            :data:`MAX_INTERVAL`.

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
    }
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())
    return state()


def release(client: str) -> dict:
    """Stop wanting readings. The lease would lapse anyway; this is just prompt about it."""
    _leases.pop((client or "")[:120], None)
    return state()


async def stop() -> None:
    """Drop every lease and stop sampling."""
    global _task
    _leases.clear()
    if _task is not None and not _task.done():
        _task.cancel()
    _task = None
