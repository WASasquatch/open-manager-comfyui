"""Custom-node entry point.

Loads Open Manager through ComfyUI's custom_nodes scan, alongside any other manager. A
pip install loads the same core through the manager hook in the ``comfyui_manager``
package. No nodes are declared.
"""

from __future__ import annotations

from .open_manager import log, routes

#: Panel assets ComfyUI serves for this package.
WEB_DIRECTORY = "./open_manager/web"

#: No nodes are registered.
NODE_CLASS_MAPPINGS: dict = {}
NODE_DISPLAY_NAME_MAPPINGS: dict = {}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

logger = log.get_logger()

try:
    routes.register_routes()
except Exception as error:
    logger.warning(
        "the registry routes could not be registered (%s: %s), so the panel will report "
        "the backend as unreachable",
        type(error).__name__,
        error,
    )
