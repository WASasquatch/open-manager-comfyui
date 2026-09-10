"""Logging for the package, namespaced so its lines are identifiable in ComfyUI's output."""

from __future__ import annotations

import logging

__all__ = ["get_logger"]

#: Prefix every logger name carries.
ROOT = "open_manager"


def get_logger(name: str = "") -> logging.Logger:
    """A logger below the package root.

    Args:
        name: Dotted suffix, or empty for the root logger.

    Returns:
        The logger.
    """
    return logging.getLogger(f"{ROOT}.{name}" if name else ROOT)
