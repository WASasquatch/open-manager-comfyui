"""The example media official templates name on their loader nodes, and where each file is."""

from __future__ import annotations

import json
import os
import re
import shutil
import threading
from pathlib import Path
from urllib.parse import quote

from . import downloads, log, models

__all__ = ["LOADERS", "SOURCE", "catalog", "keep", "scan"]

logger = log.get_logger("templatemedia")

SOURCE = "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/"

LOADERS = {"LoadImage": "image", "LoadImageMask": "image", "LoadVideo": "file",
           "LoadAudio": "audio"}

MAX_NODES = 5000

MAX_KEEP = 256

MAX_RENAMES = 999

_REVISION = re.compile(r"^[a-f0-9]{40}$")

_lock = threading.Lock()
_memo: dict = {"key": None, "files": {}}


def _index() -> Path | None:
    """The installed template catalog, the file ComfyUI serves as /templates/index.json."""
    try:
        from comfyui_workflow_templates import get_asset_path

        found = Path(get_asset_path("index", "index.json"))
        if found.is_file():
            return found
    except Exception:
        pass
    from importlib import resources

    for package in ("comfyui_workflow_templates_json", "comfyui_workflow_templates"):
        try:
            found = resources.files(package) / "templates" / "index.json"
            if found.is_file():
                return Path(str(found))
        except Exception:
            continue
    return None


def _read(where: Path) -> dict:
    """Every sample file one catalog declares, keyed by filename."""
    try:
        groups = json.loads(where.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        logger.warning("template catalog unreadable: %s", error)
        return {}
    files: dict = {}
    for group in groups if isinstance(groups, list) else []:
        templates = group.get("templates") if isinstance(group, dict) else None
        for template in templates if isinstance(templates, list) else []:
            if not isinstance(template, dict):
                continue
            io = template.get("io")
            inputs = io.get("inputs") if isinstance(io, dict) else None
            for item in inputs if isinstance(inputs, list) else []:
                if not isinstance(item, dict):
                    continue
                name = item.get("file")
                revision = item.get("sourceRevision")
                kind = item.get("nodeType")
                if (not isinstance(name, str) or not name or kind not in LOADERS
                        or not isinstance(revision, str) or not _REVISION.match(revision)):
                    continue
                entry = files.setdefault(name, {
                    "revision": revision,
                    "types": set(),
                    "media_type": str(item.get("mediaType") or ""),
                    "templates": [],
                })
                entry["types"].add(kind)
                title = str(template.get("title") or template.get("name") or "")
                if title and title not in entry["templates"]:
                    entry["templates"].append(title)
    return files


def catalog() -> dict:
    """Every sample file the installed templates declare, read again only when it changes.

    Returns:
        ``{file: {revision, types, media_type, templates}}``, empty where no catalog is
        installed.
    """
    where = _index()
    if where is None:
        return {}
    try:
        key = (str(where), where.stat().st_mtime_ns)
    except OSError:
        return {}
    with _lock:
        if _memo["key"] == key:
            return _memo["files"]
    files = _read(where)
    with _lock:
        _memo.update(key=key, files=files)
    return files


def _base(value: str) -> str:
    """A loader's value without the folder annotation ComfyUI may add to it."""
    for mark in (" [input]", " [temp]"):
        if value.endswith(mark):
            return value[: -len(mark)]
    return value


def _located(root: str, name: str) -> str:
    """Where a file of this name sits directly in a folder, empty where it does not."""
    if (not root or not name or name in (".", "..") or "/" in name or "\\" in name
            or "\0" in name):
        return ""
    target = Path(root) / name
    try:
        return str(target) if target.is_file() else ""
    except OSError:
        return ""


def _nodes(document: object) -> list:
    """The nodes of a workflow and of the subgraphs it defines."""
    if not isinstance(document, dict):
        return []
    found = [node for node in document.get("nodes") or [] if isinstance(node, dict)]
    definitions = document.get("definitions")
    subgraphs = definitions.get("subgraphs") if isinstance(definitions, dict) else None
    for graph in subgraphs if isinstance(subgraphs, list) else []:
        if isinstance(graph, dict):
            found.extend(node for node in graph.get("nodes") or [] if isinstance(node, dict))
    return found[:MAX_NODES]


def _values(node: dict) -> list:
    """The file values a loader node holds."""
    widget = LOADERS.get(node.get("type"))
    if not widget:
        return []
    found = []
    values = node.get("widgets_values")
    if isinstance(values, list) and values and isinstance(values[0], str):
        found.append(values[0])
    elif isinstance(values, dict) and isinstance(values.get(widget), str):
        found.append(values[widget])
    named = node.get("widgets_values_named")
    if isinstance(named, dict) and isinstance(named.get(widget), str):
        found.append(named[widget])
    return found


def scan(document: object) -> list[dict]:
    """The template media a workflow's loader nodes name, and where each file is.

    Args:
        document: A workflow, or only its loader nodes.

    Returns:
        One ``{name, url, owner, media_type, templates, node, nodes, input, temp, allowed,
        reason}`` per file, ``input`` and ``temp`` holding its path in each folder or empty.
    """
    files = catalog()
    if not files:
        return []
    input_root = models._media_root()
    temp_root = models._cache_root()
    rows: dict = {}
    for node in _nodes(document):
        for name in dict.fromkeys(_base(value) for value in _values(node)):
            entry = files.get(name)
            if entry is None or node.get("type") not in entry["types"]:
                continue
            row = rows.get(name)
            if row is not None:
                row["nodes"] += 1
                continue
            url = f"{SOURCE}{entry['revision']}/input/{quote(name, safe='')}"
            allowed, reason = models.check(url, name, models.MEDIA_DIRECTORY)
            rows[name] = {
                "name": name,
                "url": url,
                "owner": models.owner_of(url),
                "media_type": entry["media_type"],
                "templates": entry["templates"][:3],
                "node": f"{node.get('type')} #{node.get('id')}",
                "nodes": 1,
                "input": _located(input_root, name),
                "temp": _located(temp_root, name),
                "allowed": allowed,
                "reason": reason,
            }
    return list(rows.values())


def _same_bytes(left: str, right: str) -> bool:
    """Whether two files hold the same bytes."""
    try:
        if os.path.getsize(left) != os.path.getsize(right):
            return False
    except OSError:
        return False
    first = models.sha256_file(left)
    return bool(first) and first == models.sha256_file(right)


def _place(input_root: str, name: str, source: str) -> tuple[str, bool]:
    """The name a cached file takes in input, and whether input already holds those bytes."""
    stem, suffix = os.path.splitext(name)
    for count in range(MAX_RENAMES + 1):
        candidate = name if count == 0 else f"{stem} ({count}){suffix}"
        existing = Path(input_root) / candidate
        if not existing.exists():
            return candidate, False
        if existing.is_file() and _same_bytes(str(existing), source):
            return candidate, True
    return "", False


def keep(names: list) -> dict:
    """Move cached template media from ComfyUI's temp folder into input.

    Args:
        names: Filenames the template catalog declares.

    Returns:
        ``{ok, kept, problems}``. ``kept`` maps each name moved to its name in input, which
        differs where input already holds a different file of that name.
    """
    files = catalog()
    input_root = models._media_root()
    temp_root = models._cache_root()
    if not input_root or not temp_root:
        return {"ok": False, "kept": {}, "problems": ["ComfyUI's folders cannot be read"]}
    kept: dict = {}
    problems: list = []
    for name in list(dict.fromkeys(one for one in names if isinstance(one, str)))[:MAX_KEEP]:
        if name not in files:
            continue
        source = _located(temp_root, name)
        if not source:
            problems.append(f"{name} is not in temp")
            continue
        chosen, duplicate = _place(input_root, name, source)
        if not chosen:
            problems.append(f"{name}: no free name in input")
            continue
        target = str(Path(input_root) / chosen)
        try:
            if duplicate:
                os.remove(source)
            else:
                os.makedirs(input_root, exist_ok=True)
                shutil.move(source, target)
        except OSError as error:
            problems.append(f"{name}: {error.strerror or error}")
            continue
        downloads.relocate(source, target, models.MEDIA_DIRECTORY)
        kept[name] = chosen
        logger.info("template media kept: %s -> %s", name, target)
    return {"ok": True, "kept": kept, "problems": problems}
