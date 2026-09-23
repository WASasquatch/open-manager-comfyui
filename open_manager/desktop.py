"""Where a reader arranged their desktop icons."""

from __future__ import annotations

import json
import re

from . import paths

__all__ = ["CAP", "PIN_CAP", "read", "write"]

CAP = 400

EDGE = 200

PIN_CAP = 200

_KEY = re.compile(r"^[A-Za-z0-9._:%-]{1,400}$")


def _file():
    return paths.store_file("desktop.json")


def _whole(value: object) -> int | None:
    """One coordinate, or ``None`` where it is not a usable one."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value or value in (float("inf"), float("-inf")):
        return None
    at = int(value)
    return at if 0 <= at <= EDGE else None


def _keys(value: object) -> list:
    """A list of icon keys, deduplicated and capped, dropping anything unusable."""
    if not isinstance(value, list):
        return []
    kept = []
    for one in value[:PIN_CAP * 2]:
        if not isinstance(one, str) or not _KEY.match(one) or one in kept:
            continue
        kept.append(one)
        if len(kept) >= PIN_CAP:
            break
    return kept


def _cleaned(data: object) -> dict:
    """Only the parts of a stored layout that are still usable."""
    if not isinstance(data, dict):
        return {}
    cells = data.get("cells")
    if not isinstance(cells, dict):
        return {}
    kept: dict = {}
    for key, spot in list(cells.items())[:CAP]:
        if not isinstance(key, str) or not _KEY.match(key):
            continue
        if not isinstance(spot, dict):
            continue
        col = _whole(spot.get("col"))
        row = _whole(spot.get("row"))
        if col is None or row is None:
            continue
        kept[key] = {"col": col, "row": row}
    return kept


def _held() -> tuple[dict, bool]:
    """What is on disk, and whether the file was readable."""
    target = _file()
    if not target.is_file():
        return {}, True
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}, False
    return (data if isinstance(data, dict) else {}), True


def read() -> dict:
    """The desktop as the reader left it.

    Returns:
        ``{ok, cells, pinned, unpinned, off}``. ``cells`` maps an icon key to ``{col, row}``;
        ``pinned`` names programs the reader added, ``unpinned`` names built-in programs they
        took away, and ``off`` names programs they do not want loaded at all. All empty is a
        desktop nobody has changed, not a failure.
    """
    data, _fine = _held()
    return {"ok": True, "cells": _cleaned(data),
            "pinned": _keys(data.get("pinned")), "unpinned": _keys(data.get("unpinned")),
            "off": _keys(data.get("off"))}


def write(cells: object = None, pinned: object = None, unpinned: object = None,
          off: object = None) -> dict:
    """Keep what the reader changed, leaving the rest of the file alone.

    Returns:
        ``{ok, count, reason}`` where count is the number of placed icons.
    """
    data, fine = _held()
    target = _file()
    if not fine:
        try:
            target.replace(target.with_name(f"{target.name}.bad"))
        except OSError as error:
            return {"ok": False, "count": 0, "reason": str(error)[:120]}
        data = {}
    kept = _cleaned(data) if cells is None else _cleaned({"cells": cells})
    whole = {
        "v": 1,
        "cells": kept,
        "pinned": _keys(data.get("pinned")) if pinned is None else _keys(pinned),
        "unpinned": _keys(data.get("unpinned")) if unpinned is None else _keys(unpinned),
        "off": _keys(data.get("off")) if off is None else _keys(off),
    }
    part = target.with_name(f"{target.name}.part")
    try:
        part.write_text(json.dumps(whole, indent=1), encoding="utf-8")
        part.replace(target)
    except OSError as error:
        try:
            part.unlink(missing_ok=True)
        except OSError:
            pass
        return {"ok": False, "count": 0, "reason": str(error)[:120]}
    return {"ok": True, "count": len(kept), "reason": ""}
