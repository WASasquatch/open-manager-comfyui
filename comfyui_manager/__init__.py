"""Open Manager loaded through ComfyUI's ``--enable-manager`` hook."""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path

from aiohttp import web

logger = logging.getLogger("open_manager.comfyui_manager")

__all__ = [
    "create_middleware",
    "prestartup",
    "should_be_disabled",
    "start",
]

LOG_NAME = "comfyui.log"
LOG_ROTATIONS = ("comfyui.prev.log", "comfyui.prev2.log")

LOG_OFF = "OPEN_MANAGER_NO_LOG"

_SETTINGS_PATH = re.compile(r"^(?:/api)?/settings(?:/.*)?$")


def _rotate(folder) -> None:
    """Shift the previous logs down one."""
    names = (LOG_NAME, *LOG_ROTATIONS)
    for older, newer in zip(reversed(names[1:]), reversed(names[:-1]), strict=True):
        source, target = folder / newer, folder / older
        try:
            if source.is_file():
                target.unlink(missing_ok=True)
                source.rename(target)
        except OSError as error:
            logger.debug("rotate failed: %s (%s)", newer, error)


def _start_logging() -> None:
    """Write ComfyUI's output to ``comfyui.log`` in ComfyUI's user directory."""
    if os.environ.get(LOG_OFF):
        return
    try:
        import folder_paths

        folder = Path(folder_paths.get_user_directory())
        folder.mkdir(parents=True, exist_ok=True)
    except Exception as error:  # noqa: BLE001
        logger.debug("no user directory (%s: %s)", type(error).__name__, error)
        return

    root = logging.getLogger()
    target = folder / LOG_NAME
    for handler in root.handlers:
        existing = getattr(handler, "baseFilename", "")
        if existing and Path(existing) == target.resolve():
            return

    _rotate(folder)
    try:
        handler = logging.FileHandler(target, mode="w", encoding="utf-8")
    except OSError as error:
        logger.warning("log not opened (%s)", error.strerror or error)
        return
    formatter = logging.Formatter("[%(asctime)s] %(message)s")
    formatter.default_msec_format = "%s.%03d"
    handler.setFormatter(formatter)
    handler.setLevel(logging.INFO)
    root.addHandler(handler)
    if root.level > logging.INFO or root.level == logging.NOTSET:
        root.setLevel(logging.INFO)
    logging.info("[Open Manager] log: %s (%s to disable)",
                 target, LOG_OFF)


def _warn_if_shared() -> None:
    """Say so when the official manager is installed alongside this one."""
    try:
        from importlib.metadata import PackageNotFoundError, distribution
    except Exception:  # noqa: BLE001
        return
    try:
        distribution("comfyui-manager")
    except PackageNotFoundError:
        return
    except Exception:  # noqa: BLE001
        return
    logger.warning(
        "[Open Manager] comfyui-manager is also installed and provides the same module. "
        "Run: pip uninstall comfyui-manager"
    )


def prestartup() -> None:
    """Called before custom nodes load."""
    _start_logging()
    _warn_if_shared()
    _repair_settings()
    logging.info("[Open Manager] enabled in place of ComfyUI-Manager")


def _repair_settings() -> None:
    """Restore ComfyUI's settings file where something has left it unreadable to ComfyUI."""
    try:
        from open_manager import settingsfile

        settingsfile.repair()
    except Exception as error:
        logger.warning("settings check skipped (%s: %s)", type(error).__name__, error)


def should_be_disabled(fullpath: str) -> bool:
    """Whether a scanned custom-node directory should be skipped.

    Args:
        fullpath: Directory ComfyUI is about to load.

    Returns:
        True for a directory-based manager install.
    """
    return "comfyui-manager" in os.path.basename(fullpath).lower()


def start() -> None:
    """Called after the server exists. Registers the routes and mounts the panel."""
    from open_manager import routes

    try:
        routes.register_routes()
    except Exception as error:
        logger.warning("registry routes not registered (%s: %s)", type(error).__name__, error)
    _mount_web()
    _declare_manager_kind()


def _declare_manager_kind() -> None:
    """Tell the interface which kind of manager is answering."""
    try:
        from comfy_api import feature_flags
    except ImportError:
        return
    try:
        manager = feature_flags.SERVER_FEATURE_FLAGS.setdefault("extension", {}).setdefault(
            "manager", {}
        )
        manager["supports_v4"] = False
    except Exception as error:
        logger.warning("manager kind not declared (%s: %s)", type(error).__name__, error)


def _mount_web() -> None:
    """Serve the panel's assets as a web extension."""
    try:
        import nodes

        from open_manager import web_directory

        nodes.EXTENSION_WEB_DIRS["open_manager"] = web_directory()
    except Exception as error:
        logger.warning("panel assets not mounted (%s: %s)", type(error).__name__, error)


def create_middleware():
    """An aiohttp middleware ComfyUI adds to the server.

    Returns:
        A middleware that repairs unreadable settings files before each settings request.
    """

    @web.middleware
    async def open_manager_middleware(request: web.Request, handler):
        if _SETTINGS_PATH.match(request.path):
            await _settings_readable()
        return await handler(request)

    return open_manager_middleware


async def _settings_readable() -> None:
    """Repair the settings file before ComfyUI reads or saves it."""
    try:
        import asyncio

        from open_manager import settingsfile

        await asyncio.to_thread(settingsfile.ensure)
    except Exception as error:
        logger.warning("settings check skipped (%s: %s)", type(error).__name__, error)
