"""Accounts the reader has chosen to trust, so they are not asked the same thing twice.

The panel's setting decides whether this list is consulted at all:

``author``
    Ask once per account and remember the answer. Anything that account publishes is
    allowed from then on. This matches how the risk actually works -- a custom node runs
    with ComfyUI's privileges, so who wrote it is the question -- but it is broad.

``action``
    Ask every time, naming the account, and remember nothing. Nothing is written here.

Neither silences findings. An advisory, a payload finding or a scan result is about the
code rather than who published it, and is reported either way.

Kept in ``user/`` rather than beside the pack, so removing and reinstalling Open Manager
does not quietly clear it.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

__all__ = ["KINDS", "forget", "is_trusted", "listing", "path", "record"]

#: What a decision covers. Trusting someone to ship code that runs with ComfyUI's
#: privileges is a different question from trusting them for a model file, so the answers
#: are kept apart and neither implies the other.
KINDS = ("packs", "downloads")

#: Most accounts remembered. Far above any real list; a guard against a runaway writer.
_CAP = 500


def path() -> Path:
    """Where the trusted list is written."""
    try:
        import folder_paths

        base = Path(folder_paths.get_user_directory()) / "open_manager"
    except Exception:
        base = Path(__file__).resolve().parent.parent / "_cache"
    base.mkdir(parents=True, exist_ok=True)
    return base / "trusted_authors.json"


def _fold(owner: str) -> str:
    """Fold an owner name for comparison. GitHub treats them case-insensitively."""
    return (owner or "").strip().lower()


def _read() -> dict:
    """Every stored decision, keyed by kind then by owner.

    A file written before the kinds existed held owners at the top level. Those were all
    pack decisions, so they are read as such rather than discarded.
    """
    empty = {kind: {} for kind in KINDS}
    try:
        data = json.loads(path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return empty
    if not isinstance(data, dict):
        return empty
    if any(kind in data for kind in KINDS):
        return {kind: data.get(kind) if isinstance(data.get(kind), dict) else {} for kind in KINDS}
    legacy = data.get("authors")
    empty["packs"] = legacy if isinstance(legacy, dict) else data
    return empty


def _write(data: dict) -> bool:
    """Persist the map, reporting whether it landed."""
    try:
        path().write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
        return True
    except OSError:
        return False


def is_trusted(owner: str, kind: str = "packs") -> bool:
    """Whether the reader has already trusted this account for this kind of thing.

    Args:
        owner: Repository owner, or ``host/account`` for a download.
        kind: One of :data:`KINDS`.

    Returns:
        True where the owner is on that list.
    """
    folded = _fold(owner)
    if not folded or kind not in KINDS:
        return False
    return folded in _read()[kind]


def record(owner: str, kind: str = "packs") -> bool:
    """Add an account to one of the trusted lists.

    Args:
        owner: Repository owner, or ``host/account`` for a download.
        kind: One of :data:`KINDS`.

    Returns:
        Whether the list was written.
    """
    folded = _fold(owner)
    if not folded or kind not in KINDS:
        return False
    data = _read()
    store = data[kind]
    if len(store) >= _CAP and folded not in store:
        return False
    store[folded] = {"name": (owner or "").strip(), "trusted_at": time.time()}
    return _write(data)


def forget(owner: str, kind: str = "packs") -> bool:
    """Take an account off one of the trusted lists.

    Args:
        owner: Repository owner, or ``host/account`` for a download.
        kind: One of :data:`KINDS`.

    Returns:
        Whether the list was written.
    """
    if kind not in KINDS:
        return False
    data = _read()
    if data[kind].pop(_fold(owner), None) is None:
        return True
    return _write(data)


def listing(kind: str = "packs") -> list[dict]:
    """Every trusted account of one kind, newest first.

    Args:
        kind: One of :data:`KINDS`.

    Returns:
        One ``{owner, trusted_at}`` per entry.
    """
    if kind not in KINDS:
        return []
    rows = [
        {"owner": value.get("name") or key, "trusted_at": float(value.get("trusted_at") or 0)}
        for key, value in _read()[kind].items()
        if isinstance(value, dict)
    ]
    return sorted(rows, key=lambda row: -row["trusted_at"])
