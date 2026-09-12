"""Open Manager loaded through ComfyUI's ``--enable-manager`` hook.

ComfyUI enables a manager by importing the module named ``comfyui_manager`` and calling a
fixed set of functions on it. Taking that name loads Open Manager in place of the official
manager. A clone into ``custom_nodes`` runs the same core through the top-level entry point.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from aiohttp import web

logger = logging.getLogger("open_manager.comfyui_manager")

__all__ = [
    "create_middleware",
    "prestartup",
    "should_be_disabled",
    "start",
]

#: The log file, and the names its older copies take. ComfyUI writes no log of its own unless
#: launched with ``--file-log``; the file usually in ``user/`` is written by ComfyUI-Manager.
#: Taking that manager's place and not writing it would quietly remove something the reader
#: had, including the import timings this pack reads back for "what each pack costs to load".
LOG_NAME = "comfyui.log"
LOG_ROTATIONS = ("comfyui.prev.log", "comfyui.prev2.log")

#: Set to anything to leave the log alone. For a setup that collects its own, or one that
#: would rather this wrote nothing.
LOG_OFF = "OPEN_MANAGER_NO_LOG"


def _rotate(folder) -> None:
    """Shift the previous logs down one, so a run does not overwrite the last one's record."""
    names = (LOG_NAME, *LOG_ROTATIONS)
    for older, newer in zip(reversed(names[1:]), reversed(names[:-1]), strict=True):
        source, target = folder / newer, folder / older
        try:
            if source.is_file():
                target.unlink(missing_ok=True)
                source.rename(target)
        except OSError as error:
            logger.debug("could not rotate %s (%s)", newer, error)


def _start_logging() -> None:
    """Write ComfyUI's output to the file the manager used to write.

    Added to the root logger, in the format the previous file used, so anything that read it
    keeps reading it. Failure here is reported and otherwise ignored: a missing log is not a
    reason to stop a server from starting.
    """
    if os.environ.get(LOG_OFF):
        return
    try:
        import folder_paths

        folder = Path(folder_paths.get_user_directory())
        folder.mkdir(parents=True, exist_ok=True)
    except Exception as error:  # noqa: BLE001 - no user directory, so no log
        logger.debug("no user directory for the log (%s: %s)", type(error).__name__, error)
        return

    root = logging.getLogger()
    target = folder / LOG_NAME
    # Nothing else is writing it: a second handler on the same file interleaves two copies
    # of every line.
    for handler in root.handlers:
        existing = getattr(handler, "baseFilename", "")
        if existing and Path(existing) == target.resolve():
            return

    _rotate(folder)
    try:
        handler = logging.FileHandler(target, mode="w", encoding="utf-8")
    except OSError as error:
        logger.warning("the log could not be opened (%s)", error.strerror or error)
        return
    formatter = logging.Formatter("[%(asctime)s] %(message)s")
    # A dot rather than a comma before the milliseconds, matching what was there before.
    formatter.default_msec_format = "%s.%03d"
    handler.setFormatter(formatter)
    handler.setLevel(logging.INFO)
    root.addHandler(handler)
    if root.level > logging.INFO or root.level == logging.NOTSET:
        root.setLevel(logging.INFO)
    logging.info("[Open Manager] writing %s, as the manager it replaced did. Set %s to stop.",
                 target, LOG_OFF)


def prestartup() -> None:
    """Called before custom nodes load.

    The log is opened here rather than in :func:`start`, because the import timings worth
    keeping are written while the custom nodes load, which is after this and before that.
    """
    _start_logging()
    logging.info("[Open Manager] enabled in place of ComfyUI-Manager")


def should_be_disabled(fullpath: str) -> bool:
    """Whether a scanned custom-node directory should be skipped.

    Args:
        fullpath: Directory ComfyUI is about to load.

    Returns:
        True for a directory-based manager install, so two managers do not run at once.
    """
    return "comfyui-manager" in os.path.basename(fullpath).lower()


def start() -> None:
    """Called after the server exists. Registers the routes and mounts the panel."""
    from open_manager import routes

    try:
        routes.register_routes()
    except Exception as error:
        logger.warning(
            "the registry routes could not be registered (%s: %s)",
            type(error).__name__, error,
        )
    _mount_web()
    _declare_manager_kind()


def _declare_manager_kind() -> None:
    """Tell the interface which kind of manager is answering.

    Core claims ``extension.manager.supports_v4`` for every manager, which the interface
    reads as a promise to serve ComfyUI-Manager's v4 endpoints. Open Manager serves its own
    panel, so the claim is withdrawn and the interface treats this as a legacy manager,
    keeping the Extensions button and dispatching ``Comfy.Manager.Menu.ToggleVisibility``.
    Left alone it finds v4 promised and ``supports_csrf_post`` missing, calls the manager
    incompatible, hides the button and warns on every load.
    """
    try:
        from comfy_api import feature_flags
    except ImportError:
        # Older core without feature flags. The button is governed by version strings there.
        return
    try:
        manager = feature_flags.SERVER_FEATURE_FLAGS.setdefault("extension", {}).setdefault(
            "manager", {}
        )
        manager["supports_v4"] = False
    except Exception as error:
        logger.warning(
            "the manager kind could not be declared, so the Extensions button may be hidden "
            "(%s: %s)",
            type(error).__name__, error,
        )


def _mount_web() -> None:
    """Serve the panel's assets as a web extension.

    A pip install has no ``custom_nodes`` directory to carry the panel, so its directory is
    registered directly.
    """
    try:
        import nodes

        from open_manager import web_directory

        nodes.EXTENSION_WEB_DIRS["open_manager"] = web_directory()
    except Exception as error:
        logger.warning("the panel assets could not be mounted (%s: %s)", type(error).__name__, error)


def create_middleware():
    """An aiohttp middleware ComfyUI adds to the server.

    Returns:
        A pass-through middleware.
    """

    @web.middleware
    async def open_manager_middleware(request: web.Request, handler):
        return await handler(request)

    return open_manager_middleware
