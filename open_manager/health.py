"""What each installed pack costs to load, and switching one off without removing it."""

from __future__ import annotations

import json
import os
import re
import sys
from collections.abc import Mapping
import time
from pathlib import Path

_IMPORTED_AT = time.time()

from . import installer, paths

__all__ = ["collisions", "disable", "enable", "hold", "holds", "is_disabled", "release",
           "startup_times", "toggle"]

DISABLED = ".disabled"

LOG_TAIL = 512 << 10

HOLD_CAP = 500

MAPPING = "NODE_CLASS_MAPPINGS"

def _process_started() -> float:
    try:
        import psutil

        return float(psutil.Process(os.getpid()).create_time())
    except Exception:  # noqa: BLE001
        return _IMPORTED_AT


_TIMING = re.compile(r"([\d.]+)\s+seconds(\s*\(IMPORT FAILED\))?:\s*(.+)")


def _logs() -> list[Path]:
    """ComfyUI's log and the ones it rotated, newest first."""
    base = paths.user_root()
    if base is None:
        return []
    found = [base / "comfyui.log", base / "comfyui.prev.log", base / "comfyui.prev2.log"]
    return [one for one in found if one.is_file()]


def _tail(path: Path) -> str:
    """The last stretch of a file, decoded loosely."""
    try:
        size = path.stat().st_size
        with path.open("rb") as handle:
            if size > LOG_TAIL:
                handle.seek(size - LOG_TAIL)
            return handle.read().decode("utf-8", "replace")
    except OSError:
        return ""


def _parse(text: str) -> list[dict]:
    """The last block of import timings in a log, newest run only."""
    if "Import times for custom nodes:" not in text:
        return []
    block = text.rsplit("Import times for custom nodes:", 1)[-1]
    rows = []
    for line in block.splitlines():
        found = _TIMING.search(line)
        if not found:
            if rows:
                break
            continue
        where = found.group(3).strip().rstrip("\\/")
        rows.append({
            "seconds": float(found.group(1)),
            "name": os.path.basename(where),
            "path": where,
            "failed": bool(found.group(2)),
        })
    return rows


def startup_times() -> dict:
    """How long each pack took to import, from ComfyUI's own log.

    Returns:
        ``{ok, packs, total, failed, source, stale, logged_at, reason}``, slowest first.
    """
    started = _process_started()
    for path in _logs():
        rows = _parse(_tail(path))
        if not rows:
            continue
        rows.sort(key=lambda row: -row["seconds"])
        try:
            written = path.stat().st_mtime
        except OSError:
            written = 0.0
        stale = bool(written) and written < started
        return {
            "ok": True,
            "packs": rows,
            "total": round(sum(row["seconds"] for row in rows), 2),
            "failed": [row["name"] for row in rows if row["failed"]],
            "source": path.name,
            "stale": stale,
            "logged_at": written,
            "reason": (f"Read from {path.name}, last written by an earlier run."
                       if stale else ""),
        }
    return {
        "ok": False,
        "packs": [],
        "total": 0,
        "failed": [],
        "source": "",
        "stale": False,
        "logged_at": 0.0,
        "reason": "no import timings in ComfyUI's log yet",
    }


def is_disabled(directory: Path) -> bool:
    """Whether a directory is one ComfyUI will skip."""
    return directory.name.endswith(DISABLED)


def _ours(directory: Path) -> bool:
    """Whether this is the pack drawing the button that would disable it."""
    try:
        return Path(__file__).resolve().parent.parent == directory.resolve()
    except OSError:
        return False


def _checked(name: str) -> tuple[Path | None, str]:
    """The directory a toggle may act on, or why it may not.

    Args:
        name: Directory name as the panel reported it.

    Returns:
        ``(directory, reason)``. ``directory`` is ``None`` where the reason explains why.
    """
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        return None, "that is not a pack directory"
    try:
        base = installer.custom_nodes_dir().resolve()
    except RuntimeError:
        return None, "the custom_nodes directory could not be found"

    target = (base / name)
    try:
        resolved = target.resolve()
    except OSError:
        return None, "that path could not be read"
    if resolved.parent != base:
        return None, "that is not directly inside custom_nodes"
    if not resolved.is_dir():
        return None, "that is not a directory"
    if _ours(resolved):
        return None, "Open Manager cannot switch itself off from here"
    return resolved, ""


def toggle(name: str, off: bool) -> dict:
    """Switch a pack off or back on by renaming its directory.

    Returns:
        ``{ok, reason, name, disabled, restart}``.
    """
    directory, reason = _checked(name)
    if directory is None:
        return {"ok": False, "reason": reason}

    already = is_disabled(directory)
    if already == off:
        return {"ok": True, "name": directory.name, "disabled": already, "restart": False}

    if off:
        target = directory.with_name(directory.name + DISABLED)
    else:
        target = directory.with_name(directory.name[: -len(DISABLED)])

    if target.exists():
        return {"ok": False,
                "reason": f"{target.name} already exists; rename or remove it first"}
    try:
        directory.rename(target)
    except OSError as error:
        return {"ok": False,
                "reason": f"it could not be renamed ({error.strerror or error}). "
                          "A pack already loaded may need ComfyUI restarted first."}
    return {"ok": True, "name": target.name, "disabled": off, "restart": True}


def disable(name: str) -> dict:
    """Switch a pack off."""
    return toggle(name, True)


def enable(name: str) -> dict:
    """Switch a pack back on."""
    return toggle(name, False)


def _attr(obj: object, name: str, default=None):
    """Read an attribute off somebody else's object without running their code.

    Args:
        obj: Any object, including one from a pack this knows nothing about.
        name: Attribute to read.
        default: Returned where it cannot be read for any reason.

    Returns:
        The attribute, or the default.
    """
    try:
        namespace = object.__getattribute__(obj, "__dict__")
        if isinstance(namespace, Mapping):
            return namespace[name] if name in namespace else default
    except Exception:  # noqa: BLE001
        pass
    try:
        return getattr(obj, name, default)
    except Exception:  # noqa: BLE001
        return default


def _pack_of(module: object, root: Path) -> str:
    """Which pack directory a module was loaded from, or empty for anything else."""
    where = _attr(module, "__file__", "") or ""
    if not where:
        return ""
    try:
        parts = Path(where).resolve().relative_to(root).parts
    except (ValueError, OSError):
        return ""
    return parts[0] if parts else ""


def _defined_in(node_class: object, root: Path, seen: dict) -> str:
    """Which pack a node class was written in, or empty for anything outside custom_nodes."""
    module = _attr(node_class, "__module__", "") or ""
    if module not in seen:
        seen[module] = _pack_of(sys.modules.get(module), root)
    return seen[module]


def collisions() -> dict:
    """Node names more than one installed pack registers.

    Returns:
        ``{ok, groups, packs, names, skipped, reason}``. Each group is ``{node, packs,
        loaded}``, where ``loaded`` is the pack whose class is the one in use, or empty where
        that cannot be told. ``skipped`` names each module that could not be read, with the
        error; its claims are missing from the answer.
    """
    try:
        root = installer.custom_nodes_dir().resolve()
    except (OSError, RuntimeError) as error:
        return {"ok": False, "groups": [], "packs": 0, "names": 0, "skipped": [],
                "reason": str(error)}

    claims: dict = {}
    packs = set()
    seen: dict = {}
    skipped: list = []
    for module in list(sys.modules.values()):
        try:
            mapping = _attr(module, MAPPING, None)
            if not isinstance(mapping, dict) or not mapping:
                continue
            pack = _pack_of(module, root)
            if not pack:
                continue
            for name, node_class in list(mapping.items()):
                if isinstance(name, str) and _defined_in(node_class, root, seen) == pack:
                    claims.setdefault(name, set()).add(pack)
                    packs.add(pack)
        except Exception as error:  # noqa: BLE001
            named = _attr(module, "__name__", "") or "an unnamed module"
            skipped.append(f"{named}: {type(error).__name__}: {error}")

    try:
        import nodes

        live = _attr(nodes, MAPPING, {}) or {}
    except Exception:  # noqa: BLE001
        live = {}

    groups = []
    for name, claimed in claims.items():
        if len(claimed) < 2:
            continue
        node_class = live.get(name)
        groups.append({
            "node": name,
            "packs": sorted(claimed),
            "loaded": _defined_in(node_class, root, seen) if node_class is not None else "",
        })
    groups.sort(key=lambda group: (-len(group["packs"]), group["node"]))
    return {"ok": True, "groups": groups, "packs": len(packs), "names": len(claims),
            "skipped": skipped, "reason": ""}


def holds_path() -> Path:
    """Where the held versions are written."""
    return paths.store_file("held_versions.json")


def holds() -> dict:
    """Every pack being held, keyed by its directory name folded for comparison.

    Returns:
        ``{name: {"version": str, "at": float}}``, empty where nothing is held or the file
        cannot be read.
    """
    try:
        data = json.loads(holds_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(key): value for key, value in data.items() if isinstance(value, dict)}


def hold(name: str, version: str) -> dict:
    """Hold a pack at the version it is on, so no update is offered for it.

    Args:
        name: The pack's directory name.
        version: The version being held, for the reader to see later.

    Returns:
        ``{ok, reason, name, version}``.
    """
    key = (name or "").strip().lower()[:200]
    if not key:
        return {"ok": False, "reason": "no pack named"}
    held = holds()
    if key not in held and len(held) >= HOLD_CAP:
        return {"ok": False, "reason": "too many packs are already held"}
    held[key] = {"version": (version or "").strip()[:64], "at": time.time()}
    try:
        holds_path().write_text(json.dumps(held, indent=2, sort_keys=True), encoding="utf-8")
    except OSError as error:
        return {"ok": False, "reason": str(error)}
    return {"ok": True, "reason": "", "name": key, "version": held[key]["version"]}


def release(name: str) -> dict:
    """Stop holding a pack, so updates are offered for it again."""
    key = (name or "").strip().lower()[:200]
    held = holds()
    if key not in held:
        return {"ok": True, "reason": "", "name": key}
    held.pop(key)
    try:
        holds_path().write_text(json.dumps(held, indent=2, sort_keys=True), encoding="utf-8")
    except OSError as error:
        return {"ok": False, "reason": str(error)}
    return {"ok": True, "reason": "", "name": key}
