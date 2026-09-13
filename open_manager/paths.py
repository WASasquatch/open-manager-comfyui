"""Where Open Manager keeps its files.

Twelve modules worked this out for themselves, and by the time anyone counted, two of the
twelve had drifted: one lost the fallback for running outside ComfyUI, the other was reaching
for a different directory entirely. Twelve places that have to agree about where a reader's
data lives is twelve chances to disagree, and the failure is quiet -- a file written to one
path and read from another looks like data loss.

Nothing here imports ``folder_paths`` at module level. It only exists inside a running
ComfyUI, and these modules are also imported by tests and by tooling that has no ComfyUI
around it.
"""

from __future__ import annotations

from pathlib import Path

__all__ = ["store", "store_file", "user_root"]

#: Where things go when there is no ComfyUI to ask. Beside the package rather than in a
#: temporary directory, so a cache survives a restart and is findable by whoever has to look.
_FALLBACK = Path(__file__).resolve().parent.parent / "_cache"


def user_root() -> Path | None:
    """ComfyUI's own user directory.

    Returns:
        The directory, or None where there is no ComfyUI to ask. This is ComfyUI's, not ours:
        callers reading its logs or its saved workflows want this one, and should treat None
        as "not running under ComfyUI" rather than as an error.
    """
    try:
        import folder_paths  # type: ignore

        return Path(folder_paths.get_user_directory())
    except Exception:  # noqa: BLE001 - running outside ComfyUI
        return None


def store(subdir: str = "") -> Path:
    """Open Manager's own directory, created if it is not there yet.

    Args:
        subdir: A single directory nested inside it, where one is wanted.

    Returns:
        The directory. Falls back to a cache beside the package when there is no ComfyUI, so
        that importing a module outside ComfyUI does not raise from a path lookup.
    """
    root = user_root()
    base = (root / "open_manager") if root is not None else _FALLBACK
    if subdir:
        base = base / subdir
    base.mkdir(parents=True, exist_ok=True)
    return base


def store_file(name: str, subdir: str = "") -> Path:
    """A file inside :func:`store`.

    The directory is created; the file is not, so a caller can still tell a first run from a
    file it has written before.

    Args:
        name: File name.
        subdir: A directory nested inside the store, where one is wanted.

    Returns:
        The path the file should live at.
    """
    return store(subdir) / name
