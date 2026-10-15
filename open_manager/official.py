"""The official ComfyUI-Manager beside Open Manager installed as the manager, and removing it."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from . import gates, log, piptool

__all__ = ["DIST", "state", "uninstall"]

logger = log.get_logger("official")

DIST = "comfyui-manager"

HOOK = b"open_manager.manager_hook"

UNINSTALL_TIMEOUT = 600

OUTPUT_CAP = 4000


def _dist():
    """The official package's distribution, or None where it is not installed."""
    try:
        from importlib.metadata import PackageNotFoundError, distribution

        try:
            return distribution(DIST)
        except PackageNotFoundError:
            return None
    except Exception:  # noqa: BLE001
        return None


def _folders() -> list:
    """The ``custom_nodes`` directories holding a copy of the official manager."""
    roots = []
    try:
        import folder_paths  # type: ignore

        roots = [Path(one) for one in folder_paths.get_folder_paths("custom_nodes")]
    except Exception:  # noqa: BLE001
        roots = []
    found = []
    for root in roots:
        try:
            entries = list(root.iterdir())
        except OSError:
            continue
        for entry in entries:
            if entry.is_dir() and "comfyui-manager" in entry.name.lower():
                found.append(entry)
    return found


def _hooks() -> dict:
    """The files that load Open Manager through ``--enable-manager``, with what they hold."""
    places = {Path(sys.prefix) / "comfyui_manager" / "__init__.py"}
    loaded = sys.modules.get("comfyui_manager")
    if getattr(loaded, "__file__", None):
        places.add(Path(loaded.__file__))
    held = _dist()
    if held is not None:
        try:
            places.add(Path(held.locate_file("comfyui_manager/__init__.py")))
        except Exception:  # noqa: BLE001
            pass
    kept = {}
    for place in places:
        try:
            data = place.read_bytes()
        except OSError:
            continue
        if HOOK in data:
            kept[place] = data
    return kept


def _own_hook():
    """Where Open Manager's own package record puts its hook, or None."""
    try:
        from importlib.metadata import distribution

        return Path(distribution("comfyui-open-manager").locate_file(
            "comfyui_manager/__init__.py"))
    except Exception:  # noqa: BLE001
        return None


def state() -> dict:
    """Whether the official manager is installed beside Open Manager, and whether it can go.

    Returns:
        ``{installed, version, folders, removable, reason}``. ``version`` is the official
        package's, empty where only folders hold it.
    """
    held = _dist()
    folders = [str(one) for one in _folders()]
    removable, reason = True, ""
    if not gates.INSTALL:
        removable, reason = False, gates.refuse("install")["reason"]
    elif held is not None and not piptool.available(sys.executable):
        removable, reason = False, "this Python has no pip or uv"
    return {"installed": held is not None or bool(folders),
            "version": str(held.version) if held is not None else "",
            "folders": folders, "removable": removable, "reason": reason}


def uninstall() -> dict:
    """Remove the official package and its ``custom_nodes`` copies, keeping Open Manager's hook.

    Both packages own ``comfyui_manager``, so pip removing the official one takes the file
    that loads Open Manager with it. That file is read first and written back after.

    Returns:
        ``{ok, reason, removed, output}``. ``removed`` names each thing taken away.
    """
    if not gates.INSTALL:
        return {**gates.refuse("install"), "removed": [], "output": ""}
    removed: list = []
    output = ""
    held = _dist()
    if held is not None:
        named = f"{DIST} {held.version}"
        kept = _hooks()
        argv = piptool.command(sys.executable, "uninstall", ["--yes", DIST])
        if not argv:
            return {"ok": False, "reason": "this Python has no pip or uv", "removed": removed,
                    "output": ""}
        try:
            done = subprocess.run(
                argv, capture_output=True, timeout=UNINSTALL_TIMEOUT, check=False,
                encoding="utf-8", errors="replace",
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except (OSError, subprocess.SubprocessError) as error:
            return {"ok": False, "reason": f"pip did not run ({type(error).__name__})",
                    "removed": removed, "output": ""}
        output = f"{done.stdout or ''}{done.stderr or ''}"[-OUTPUT_CAP:]
        own = _own_hook()
        if own is not None and kept and own not in kept:
            kept[own] = next(iter(kept.values()))
        for place, data in kept.items():
            try:
                if not place.is_file() or place.read_bytes() != data:
                    place.parent.mkdir(parents=True, exist_ok=True)
                    place.write_bytes(data)
            except OSError as error:
                logger.warning("Open Manager's hook not restored at %s (%s)", place,
                               error.strerror or error)
                return {"ok": False, "removed": removed, "output": output,
                        "reason": f"Open Manager's hook could not be put back at {place}"}
        if done.returncode != 0:
            return {"ok": False, "reason": f"pip stopped with code {done.returncode}",
                    "removed": removed, "output": output}
        removed.append(named)
    from . import installer

    for folder in _folders():
        try:
            installer._remove_tree(folder)
        except OSError as error:
            return {"ok": False, "removed": removed, "output": output,
                    "reason": f"{folder.name} could not be removed ({error.strerror or error})"}
        removed.append(str(folder))
    if removed:
        logger.info("official manager removed: %s", ", ".join(removed))
    return {"ok": True, "reason": "", "removed": removed, "output": output}
