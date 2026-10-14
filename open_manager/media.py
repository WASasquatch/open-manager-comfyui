"""A job's files from ComfyUI's asset records, and deleting a record's file with the record."""

from __future__ import annotations

import functools
import json
import os
import posixpath
import threading

from . import gates, log, paths

__all__ = ["DELETION_FLAG", "configure", "install", "job_files", "state"]

logger = log.get_logger("media")

DELETION_FLAG = "asset_deletion_enabled"

ROOTS = ("output", "temp")

_lock = threading.Lock()
_config: dict = {"delete_files": False}
_status: dict = {"installed": False, "reason": ""}


def _file():
    return paths.store_file("media.json")


def _load() -> None:
    try:
        data = json.loads(_file().read_text("utf-8"))
    except (OSError, ValueError):
        return
    if isinstance(data, dict) and isinstance(data.get("delete_files"), bool):
        _config["delete_files"] = data["delete_files"]


def _assets_on() -> bool:
    try:
        from server import PromptServer

        return bool(PromptServer.instance.asset_manager.enabled)
    except Exception:  # noqa: BLE001
        return False


def _native_deletion() -> bool:
    try:
        from comfy_api import feature_flags

        return feature_flags.SERVER_FEATURE_FLAGS.get(DELETION_FLAG) is True
    except Exception:  # noqa: BLE001
        return False


def _reason() -> str:
    if _native_deletion():
        return "native"
    if not _status["installed"]:
        return _status["reason"] or "changed"
    if not _assets_on():
        return "assets off"
    if not gates.WRITES:
        return "writes closed"
    return ""


def state() -> dict:
    """``{delete_files, available, reason}``: the switch, and why it cannot act if it cannot."""
    reason = _reason()
    return {"delete_files": _config["delete_files"], "available": not reason, "reason": reason}


def configure(delete_files: object) -> dict:
    """Turn deleting a record's file on or off, kept across restarts.

    Args:
        delete_files: Whether deleting an output record also deletes its file.

    Returns:
        :func:`state` after the change.
    """
    with _lock:
        _config["delete_files"] = bool(delete_files)
        try:
            _file().write_text(json.dumps(_config), "utf-8")
        except OSError as error:
            logger.warning("could not write media.json (%s)", error)
    return state()


def _root_of(path: str) -> str:
    import folder_paths

    real = os.path.realpath(path)
    for root in ROOTS:
        base = folder_paths.get_directory_by_type(root)
        if not base:
            continue
        base = os.path.realpath(base)
        try:
            if os.path.commonpath([base, real]) == base:
                return root
        except ValueError:
            continue
    return ""


def job_files(job_id: str) -> list[dict]:
    """Every live output and temp file a job made, outputs first.

    Args:
        job_id: The prompt id.

    Returns:
        ``[{name, type, subfolder, mime, size}]``, outputs first, smallest first; empty where
        assets are off or the job made none.
    """
    if not job_id or not _assets_on():
        return []
    from sqlalchemy import false, select

    from app.assets.database.models import Asset, AssetContent
    from app.database.db import create_session

    found = []
    with create_session() as session:
        rows = session.execute(
            select(Asset.name, Asset.loader_path, Asset.mime_type, AssetContent.path,
                   AssetContent.size_bytes)
            .join(AssetContent, AssetContent.id == Asset.content_id)
            .where(Asset.job_id == job_id, AssetContent.is_missing == false())
        ).all()
    for name, loader_path, mime, path, size in rows:
        root = _root_of(path)
        if not root:
            continue
        found.append({"name": name, "type": root, "mime": mime or "", "size": size or 0,
                      "subfolder": posixpath.dirname(loader_path or "")})
    found.sort(key=lambda one: (ROOTS.index(one["type"]), one["size"]))
    return found


def _content_of(reference_id: str):
    from app.assets.database.models import Asset, AssetContent
    from app.database.db import create_session

    with create_session() as session:
        record = session.get(Asset, reference_id)
        if record is None:
            return None
        content = session.get(AssetContent, record.content_id)
        return (content.id, content.path) if content is not None else None


def _drop_file(content_id: str) -> None:
    from app.assets.services import asset_management
    from app.database.db import create_write_session

    with create_write_session() as session:
        asset_management._drop_unused_content(session, content_id)
        session.commit()


def _wrap_delete(routes) -> None:
    original = routes.delete_asset_reference
    if getattr(original, "_om_media", False):
        return

    @functools.wraps(original)
    def delete_asset_reference(reference_id, *args, **kwargs):
        target = None
        if _config["delete_files"] and not _reason():
            try:
                target = _content_of(reference_id)
            except Exception:  # noqa: BLE001
                logger.warning("media: the record's file was not looked up", exc_info=True)
        deleted = original(reference_id, *args, **kwargs)
        if deleted and target and _root_of(target[1]):
            try:
                _drop_file(target[0])
            except Exception:  # noqa: BLE001
                logger.warning("media: the record's file was not deleted", exc_info=True)
        return deleted

    delete_asset_reference._om_media = True
    routes.delete_asset_reference = delete_asset_reference


def install() -> bool:
    """Hook ComfyUI's asset deletion. Safe to call again."""
    if _status["installed"]:
        return True
    _load()
    try:
        from app.assets.api import routes
        from app.assets.services import asset_management
    except Exception:  # noqa: BLE001
        _status["reason"] = "changed"
        return False
    if not callable(getattr(routes, "delete_asset_reference", None)) \
            or not callable(getattr(asset_management, "_drop_unused_content", None)):
        _status["reason"] = "changed"
        return False
    _wrap_delete(routes)
    _status["installed"] = True
    return True
