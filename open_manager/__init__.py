"""Registry browsing that warns rather than refuses."""

from __future__ import annotations

import os

__all__ = ["advisories", "log", "registry", "risk", "routes", "web_directory"]


def web_directory() -> str:
    """The absolute path to the panel's web assets."""
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
