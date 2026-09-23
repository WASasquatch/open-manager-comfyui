"""Where Open Manager keeps its files."""

from __future__ import annotations

from pathlib import Path

__all__ = ["store", "store_file", "user_root"]

_FALLBACK = Path(__file__).resolve().parent.parent / "_cache"


def user_root() -> Path | None:
    """ComfyUI's own user directory.

    Returns:
        The directory, or None where there is no ComfyUI to ask.
    """
    try:
        import folder_paths  # type: ignore

        return Path(folder_paths.get_user_directory())
    except Exception:  # noqa: BLE001
        return None


def store(subdir: str = "") -> Path:
    """Open Manager's own directory, created if it is not there yet.

    Args:
        subdir: A single directory nested inside it, where one is wanted.

    Returns:
        The directory, or a cache beside the package where there is no ComfyUI.
    """
    root = user_root()
    base = (root / "open_manager") if root is not None else _FALLBACK
    if subdir:
        base = base / subdir
    base.mkdir(parents=True, exist_ok=True)
    return base


def store_file(name: str, subdir: str = "") -> Path:
    """A file inside :func:`store`.

    Args:
        name: File name.
        subdir: A directory nested inside the store, where one is wanted.

    Returns:
        The path the file should live at.
    """
    return store(subdir) / name
