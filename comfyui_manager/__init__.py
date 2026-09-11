"""Open Manager loaded through ComfyUI's ``--enable-manager`` hook.

ComfyUI enables a manager by importing the module named ``comfyui_manager`` and calling a
fixed set of functions on it. Taking that name loads Open Manager in place of the official
manager. A clone into ``custom_nodes`` runs the same core through the top-level entry point.
"""

from __future__ import annotations

import logging
import os

from aiohttp import web

logger = logging.getLogger("open_manager.comfyui_manager")

__all__ = [
    "create_middleware",
    "prestartup",
    "should_be_disabled",
    "start",
]


def prestartup() -> None:
    """Called before custom nodes load. Nothing needs doing here."""
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
