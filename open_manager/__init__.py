"""Registry browsing that warns rather than refuses.

:mod:`.registry` reads the Comfy Registry without a status filter, :mod:`.risk` turns
what it finds into findings, :mod:`.advisories` records published compromises, and
:mod:`.routes` serves them to the panel.
"""

from __future__ import annotations

import os

__all__ = ["advisories", "log", "registry", "risk", "routes", "web_directory"]


def web_directory() -> str:
    """The absolute path to the panel's web assets."""
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
