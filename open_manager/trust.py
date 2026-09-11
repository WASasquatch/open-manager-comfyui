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

__all__ = ["forget", "is_trusted", "listing", "path", "record"]

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
    """The stored map of owner to when it was trusted, empty where unreadable."""
    try:
        data = json.loads(path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    # Tolerate a nested shape, in case a build wrote one.
    inner = data.get("authors")
    return inner if isinstance(inner, dict) else data


def _write(data: dict) -> bool:
    """Persist the map, reporting whether it landed."""
    try:
        path().write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
        return True
    except OSError:
        return False


def is_trusted(owner: str) -> bool:
    """Whether the reader has already trusted this account.

    Args:
        owner: Repository owner.

    Returns:
        True where the owner is on the list.
    """
    folded = _fold(owner)
    return bool(folded) and folded in _read()


def record(owner: str) -> bool:
    """Add an account to the trusted list.

    Args:
        owner: Repository owner, as GitHub spells it.

    Returns:
        Whether the list was written.
    """
    folded = _fold(owner)
    if not folded:
        return False
    data = _read()
    if len(data) >= _CAP and folded not in data:
        return False
    data[folded] = {"name": (owner or "").strip(), "trusted_at": time.time()}
    return _write(data)


def forget(owner: str) -> bool:
    """Take an account off the trusted list.

    Args:
        owner: Repository owner.

    Returns:
        Whether the list was written.
    """
    data = _read()
    if data.pop(_fold(owner), None) is None:
        return True
    return _write(data)


def listing() -> list[dict]:
    """Every trusted account, newest first.

    Returns:
        One ``{owner, trusted_at}`` per entry.
    """
    rows = [
        {"owner": value.get("name") or key, "trusted_at": float(value.get("trusted_at") or 0)}
        for key, value in _read().items()
        if isinstance(value, dict)
    ]
    return sorted(rows, key=lambda row: -row["trusted_at"])
