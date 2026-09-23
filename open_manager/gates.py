"""What the machine has decided this install may do, before anyone asks."""

from __future__ import annotations

import os

__all__ = ["APPROVED_ONLY", "DESKTOP", "DOWNLOADS", "FILES", "GITHUB", "GRANTS", "INSTALL",
           "KEYS", "NAMES", "RESTART", "WRITES", "refuse", "state"]

NAMES = {
    "files": "OPEN_MANAGER_ENABLE_FILES",
    "writes": "OPEN_MANAGER_FILE_WRITES",
    "desktop": "OPEN_MANAGER_ENABLE_DESKTOP",
    "install": "OPEN_MANAGER_NO_INSTALL",
    "github": "OPEN_MANAGER_NO_GITHUB",
    "downloads": "OPEN_MANAGER_NO_DOWNLOADS",
    "restart": "OPEN_MANAGER_NO_RESTART",
    "keys": "OPEN_MANAGER_NO_KEYS",
    "approved": "OPEN_MANAGER_APPROVED_ONLY",
}

GRANTS = frozenset({"files", "writes", "desktop"})

_TRUE = {"1", "true", "yes", "on"}


def _set(name: str) -> bool:
    """Whether one environment variable is set to something meaning yes."""
    return str(os.environ.get(name, "")).strip().lower() in _TRUE


FILES = _set(NAMES["files"])

WRITES = _set(NAMES["writes"])

DESKTOP = _set(NAMES["desktop"])


INSTALL = not _set(NAMES["install"])

GITHUB = not _set(NAMES["github"])

DOWNLOADS = not _set(NAMES["downloads"])

RESTART = not _set(NAMES["restart"])

KEYS = not _set(NAMES["keys"])

APPROVED_ONLY = _set(NAMES["approved"])


def refuse(switch: str) -> dict:
    """The answer a closed switch gives, naming the variable that closed it."""
    name = NAMES.get(switch, switch)
    return {
        "ok": False,
        "reason": (f"not switched on for this install ({name})" if switch in GRANTS
                   else f"switched off for this install ({name})"),
        "gate": switch,
    }


def state() -> dict:
    """What the client is told, so it can hide what it must not offer."""
    return {
        "ok": True,
        "files": FILES,
        "writes": FILES and WRITES,
        "desktop": DESKTOP,
        "install": INSTALL,
        "github": GITHUB and INSTALL and not APPROVED_ONLY,
        "downloads": DOWNLOADS,
        "restart": RESTART,
        "keys": KEYS,
        "approved": APPROVED_ONLY,
        "names": dict(NAMES),
    }
