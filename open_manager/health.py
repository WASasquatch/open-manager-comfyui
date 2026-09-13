"""What each installed pack costs to load, and switching one off without removing it.

ComfyUI times every pack it imports and writes the result to its log, where nobody sees it.
On the machine this was written against, thirty-seven packs took 13.3 seconds between them and
one of them accounted for more than half. That is worth knowing before deciding what to keep
loaded, so it is read back out and put beside the pack it belongs to.

Switching a pack off is the other half of the same thought. ComfyUI skips a directory whose
name ends ``.disabled``, and renaming by hand is what people already do; this does the same
rename, refuses the cases where it would do damage, and leaves the files alone so it can be
undone by hand as easily as it was done.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

_IMPORTED_AT = time.time()

from . import installer, paths

__all__ = ["collisions", "disable", "enable", "hold", "holds", "is_disabled", "release",
           "startup_times", "toggle"]

#: Suffix ComfyUI treats as "do not load".
DISABLED = ".disabled"

#: Bytes read from the end of the log. The import block is written at start-up and the log
#: grows without bound afterwards, so only the tail is worth reading.
LOG_TAIL = 512 << 10

#: Most packs held at a version at once. Far above any real list; a guard against a
#: runaway writer rather than a limit anyone should meet.
HOLD_CAP = 500

#: The name every pack registers its nodes under.
MAPPING = "NODE_CLASS_MAPPINGS"

#: When this process started, for telling a log of this run from a log of the last one.
#: Read from the process where that can be asked, and from this module's import otherwise,
#: which is close enough: it is imported while the server is starting.
def _process_started() -> float:
    try:
        import psutil

        return float(psutil.Process(os.getpid()).create_time())
    except Exception:  # noqa: BLE001 - the fallback is only seconds out
        return _IMPORTED_AT


#: Where a timing line starts.
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
            # The block runs until the first line that is not a timing.
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

    A rotated log is read where the current one has no timings yet, which happens while a run
    is still starting. Where no log can be read the answer says so rather than reporting an
    empty list as though every pack were free.

    Returns:
        ``{ok, packs, total, failed, source, reason}``, slowest first.
    """
    started = _process_started()
    for path in _logs():
        rows = _parse(_tail(path))
        if not rows:
            continue
        rows.sort(key=lambda row: -row["seconds"])
        # A log that stopped being written before this process began describes a previous
        # run. ComfyUI's core writes no log file unless asked to with --file-log; the one
        # usually here is written by ComfyUI-Manager, so replacing that manager leaves this
        # file frozen. Reporting last week's timings as this run's would be worse than
        # reporting none.
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
            "reason": ("these timings are from an earlier run: nothing has written to "
                       f"{path.name} since this one started. ComfyUI only writes a log file "
                       "when launched with --file-log; the file usually here is written by "
                       "ComfyUI-Manager." if stale else ""),
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


# --- switching a pack off ------------------------------------------------------------------

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

    Renaming a directory on someone's behalf earns every one of these checks. The target has
    to be a real directory, directly inside ``custom_nodes``, still inside it once resolved,
    and not this pack.

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
    # Guards a name that climbs out, and a symlink pointing somewhere else entirely.
    if resolved.parent != base:
        return None, "that is not directly inside custom_nodes"
    if not resolved.is_dir():
        # custom_nodes also holds loose files, which are not packs.
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

    # Never merge into something that is already there: a pack disabled twice under different
    # names would otherwise lose one of them.
    if target.exists():
        return {"ok": False,
                "reason": f"{target.name} already exists; rename or remove it first"}
    try:
        directory.rename(target)
    except OSError as error:
        # Windows holds locks on the binaries of a pack that is loaded, so this can simply
        # refuse. Say what the system said rather than pretending it worked.
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


# --- node names two packs both claim ---------------------------------------------------------

def _pack_of(module: object, root: Path) -> str:
    """Which pack directory a module was loaded from, or empty for anything else."""
    where = getattr(module, "__file__", "") or ""
    if not where:
        return ""
    try:
        parts = Path(where).resolve().relative_to(root).parts
    except (ValueError, OSError):
        return ""
    return parts[0] if parts else ""


def _defined_in(node_class: object, root: Path, seen: dict) -> str:
    """Which pack a node class was written in, or empty for anything outside custom_nodes.

    A class does not carry its file, its module does, and a pack registers hundreds of
    classes from a handful of modules -- so the answer is kept per module and the path is
    resolved once rather than once per node.
    """
    module = getattr(node_class, "__module__", "")
    if module not in seen:
        seen[module] = _pack_of(sys.modules.get(module), root)
    return seen[module]


def collisions() -> dict:
    """Node names more than one installed pack registers.

    ComfyUI keeps one mapping of node name to class for the whole install, and a pack that
    registers a name another pack has already registered simply replaces it. Nothing is said
    at the time. What follows is a graph that loads the wrong node, or a node that changes
    behaviour when an unrelated pack is installed, with nothing to connect the two.

    Every claim is read from the packs as they were actually loaded rather than from their
    source, because the popular packs nearly all build their mappings in a loop and there is
    nothing in the source to read. Which pack won is read from the merged mapping, so the
    answer says what is in effect rather than what ought to be.

    A pack is only credited with a name where the class behind it is one of the pack's own.
    Several packs hold a reference to ComfyUI's merged mapping -- ``from nodes import
    NODE_CLASS_MAPPINGS`` is a normal thing to write -- and reading that as a claim credits
    one pack with every node in the install and reports seventeen hundred collisions that do
    not exist. The cost of the rule is that a pack re-registering a class it did not write is
    not counted, which is the right way to be wrong: silence rather than a false alarm.

    A pack that failed to import claims nothing, which is correct, since it is not in the
    mapping either.

    Returns:
        ``{ok, groups, packs, names, reason}``. Each group is ``{node, packs, loaded}``,
        where ``loaded`` is the pack whose class is the one in use, or empty where that
        cannot be told.
    """
    try:
        root = installer.custom_nodes_dir().resolve()
    except OSError as error:
        return {"ok": False, "groups": [], "packs": 0, "names": 0, "reason": str(error)}

    claims: dict = {}
    packs = set()
    seen: dict = {}
    for module in list(sys.modules.values()):
        mapping = getattr(module, MAPPING, None)
        if not isinstance(mapping, dict) or not mapping:
            continue
        pack = _pack_of(module, root)
        if not pack:
            continue
        for name, node_class in list(mapping.items()):
            if isinstance(name, str) and _defined_in(node_class, root, seen) == pack:
                claims.setdefault(name, set()).add(pack)
                packs.add(pack)

    try:
        import nodes

        live = getattr(nodes, MAPPING, {}) or {}
    except Exception:  # noqa: BLE001 - no live mapping only means "cannot say which won"
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
            "reason": ""}


# --- holding a pack at the version that works -------------------------------------------------

def holds_path() -> Path:
    """Where the held versions are written.

    Beside the trusted list, in ComfyUI's user directory, so a hold outlives a browser and a
    reinstall of this pack both.
    """
    return paths.store_file("held_versions.json")


def holds() -> dict:
    """Every pack being held, keyed by its directory name folded for comparison.

    Returns:
        ``{name: {"version": str, "at": float}}``, empty where nothing is held or the file
        cannot be read. A hold that cannot be read is treated as no hold: the consequence is
        an update being offered, which is recoverable, rather than one being hidden.
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

    This changes what is offered, not what is installed. Nothing is renamed, pinned in git, or
    written into the pack. It is a note that says "this one works, leave it alone", and the
    only thing it does is keep the pack out of the update count and out of a batch update.

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
