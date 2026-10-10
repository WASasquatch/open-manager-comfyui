"""Quality of Life patches this repository ships, one module per file in a category folder."""

from __future__ import annotations

import re
from pathlib import Path

__all__ = ["folder", "listing"]

_NAME = re.compile(r"^[a-z][a-z0-9-]{0,40}$")


def folder() -> Path:
    """Where the Quality of Life patches live, one folder per category."""
    return Path(__file__).resolve().parent / "web" / "modules" / "qol"


def _switched_off(path: Path) -> bool:
    """Whether a file or folder is left out by its name: a leading underscore or dot."""
    return path.name.startswith(("_", "."))


def _category(home: Path, problems: list) -> list:
    """The patch files in one category folder, as ``category/name.mjs`` paths."""
    found = []
    for module in sorted(home.glob("*.mjs")):
        if _switched_off(module) or not module.is_file():
            continue
        if not _NAME.match(module.stem):
            problems.append(f"{home.name}/{module.name}: patch file names are lowercase "
                            "letters, digits and dashes")
            continue
        found.append(f"{home.name}/{module.name}")
    return found


def listing() -> dict:
    """Every patch in every category folder, and every name that could not be used.

    Returns:
        ``{ok, patches, problems}``. ``patches`` holds ``category/name.mjs`` paths sorted by
        category, then name. Names starting with ``_`` or ``.`` are left out, as is any file
        not ending in ``.mjs``, so renaming a patch to ``name.mjs.off`` turns it off.
    """
    problems: list = []
    try:
        homes = sorted(entry for entry in folder().iterdir() if entry.is_dir())
    except OSError as error:
        return {"ok": False, "patches": [], "problems": [f"the patch folder is unreadable "
                                                          f"({error.strerror})"]}
    patches = []
    for home in homes:
        if _switched_off(home):
            continue
        if not _NAME.match(home.name):
            problems.append(f"{home.name}: category folder names are lowercase letters, "
                            "digits and dashes")
            continue
        patches.extend(_category(home, problems))
    return {"ok": True, "patches": patches, "problems": problems}
