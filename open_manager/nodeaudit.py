"""Which node types the saved workflows use, read for the Node Audit program."""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

from . import installer, paths

__all__ = ["MAX_WORKFLOWS", "audit", "node_uses", "own_folder", "single_files"]

MAX_WORKFLOWS = 5_000

MAX_WORKFLOW_BYTES = 32 << 20

MAX_NODES = 20_000

MAX_SUBGRAPHS = 2_000

MAX_DEPTH = 16

HINT_CAP = 200

OFF_MODES = frozenset({2, 4})

GROUP_PREFIXES = ("workflow>", "workflow/")

USERS_FILE = "users.json"

WORKFLOW_DIR = "workflows"


def own_folder() -> str:
    """The ``custom_nodes`` directory Open Manager runs from, empty where it runs as a package."""
    try:
        placed = Path(os.path.abspath(__file__)).parent.parent
        homes = (placed, placed.resolve())
    except OSError:
        return ""
    for home in homes:
        if installer.in_custom_nodes(home):
            return home.name
    return ""


def single_files() -> list[str]:
    """The packs that are one ``.py`` file in a ``custom_nodes`` root, by module name."""
    found: set[str] = set()
    for root in installer.custom_nodes_roots():
        try:
            children = list(root.iterdir())
        except OSError:
            continue
        found.update(child.stem for child in children
                     if child.suffix == ".py" and child.is_file() and child.stem != "__init__")
    return sorted(found)


def _user_folders() -> list[tuple[str, Path]]:
    """Each ComfyUI user that has a workflows directory, ``default`` first.

    Returns:
        ``(user, directory)`` per user. Users come from ComfyUI's ``users.json`` where it
        runs with several users, so other directories under ``user`` are not read.
    """
    root = paths.user_root()
    if root is None:
        return []
    names = ["default"]
    try:
        listed = json.loads((root / USERS_FILE).read_text(encoding="utf-8"))
        if isinstance(listed, dict):
            names.extend(str(one) for one in listed)
    except (OSError, ValueError):
        pass
    found = []
    for name in dict.fromkeys(names):
        if not name or name.startswith(".") or "/" in name or "\\" in name:
            continue
        where = root / name / WORKFLOW_DIR
        if where.is_dir():
            found.append((name, where))
    return found


def _hint(properties: object) -> dict:
    """The pack a saved node says it came from, from its ``cnr_id`` and ``aux_id``."""
    if not isinstance(properties, dict):
        return {}
    kept = {}
    for name in ("cnr_id", "aux_id"):
        value = properties.get(name)
        if isinstance(value, str) and value.strip():
            kept[name] = value.strip()[:HINT_CAP]
    return kept


def _subgraphs(document: dict) -> list[dict]:
    """Every subgraph definition in a workflow, nested definitions included, each once."""
    found: dict[str, dict] = {}
    unnamed: list[dict] = []

    def walk(holder: object, depth: int) -> None:
        if depth > MAX_DEPTH or not isinstance(holder, dict):
            return
        definitions = holder.get("definitions")
        listed = definitions.get("subgraphs") if isinstance(definitions, dict) else None
        if not isinstance(listed, list):
            return
        for one in listed:
            if len(found) + len(unnamed) >= MAX_SUBGRAPHS:
                return
            if not isinstance(one, dict):
                continue
            key = str(one.get("id") or "")
            if key and key in found:
                continue
            if key:
                found[key] = one
            else:
                unnamed.append(one)
            walk(one, depth + 1)

    walk(document, 0)
    return [*found.values(), *unnamed]


def node_uses(document: object) -> dict | None:
    """The node types one workflow uses.

    Reads the graph, every subgraph definition and every group node of a workflow saved from
    the editor, or the ``class_type`` of each node in an API prompt. A subgraph or group node
    placed on a graph is not a type of its own; the nodes inside it are counted once each, for
    their definition.

    Args:
        document: A parsed workflow file.

    Returns:
        ``{kind, types, hints}`` where ``kind`` is ``ui`` or ``api``, ``types`` maps each node
        type to ``[count, off]``, ``off`` being how many of those are muted or bypassed, and
        ``hints`` maps a type to the ``cnr_id`` and ``aux_id`` a node of it carried. ``None``
        where the document is not a workflow.
    """
    if not isinstance(document, dict):
        return None
    types: dict[str, list[int]] = {}
    hints: dict[str, dict] = {}
    seen = 0

    def take(node: object, skip: set) -> None:
        nonlocal seen
        if not isinstance(node, dict) or seen >= MAX_NODES:
            return
        kind = node.get("type")
        if not isinstance(kind, str) or not kind or kind in skip or kind.startswith(GROUP_PREFIXES):
            return
        seen += 1
        held = types.setdefault(kind, [0, 0])
        held[0] += 1
        if node.get("mode") in OFF_MODES:
            held[1] += 1
        if kind not in hints:
            hint = _hint(node.get("properties"))
            if hint:
                hints[kind] = hint

    if isinstance(document.get("nodes"), list):
        subgraphs = _subgraphs(document)
        skip = {str(one.get("id")) for one in subgraphs if one.get("id")}
        lists = [document["nodes"], *(one.get("nodes") for one in subgraphs)]
        extra = document.get("extra")
        groups = extra.get("groupNodes") if isinstance(extra, dict) else None
        if isinstance(groups, dict):
            lists.extend(one.get("nodes") for one in groups.values() if isinstance(one, dict))
        for nodes in lists:
            if isinstance(nodes, list):
                for node in nodes:
                    take(node, skip)
        return {"kind": "ui", "types": types, "hints": hints}

    prompt = [one for one in document.values()
              if isinstance(one, dict) and isinstance(one.get("class_type"), str)]
    if not prompt:
        return None
    for node in prompt[:MAX_NODES]:
        kind = node["class_type"]
        if kind:
            types.setdefault(kind, [0, 0])[0] += 1
    return {"kind": "api", "types": types, "hints": hints}


_reads: dict[str, tuple] = {}

_audit_lock = threading.Lock()


def _read(path: Path) -> tuple[float, dict | None, str]:
    """One saved workflow's node types, read again only when the file changes.

    Returns:
        ``(modified, uses, problem)``: the file's modification time, what
        :func:`node_uses` found, and why nothing was found, empty where it was.
    """
    try:
        held = path.stat()
    except OSError:
        return 0.0, None, "unreadable"
    if held.st_size > MAX_WORKFLOW_BYTES:
        return held.st_mtime, None, "too large"
    key = str(path)
    known = _reads.get(key)
    if known is not None and known[0] == held.st_mtime_ns and known[1] == held.st_size:
        return held.st_mtime, known[2], known[3]
    try:
        uses = node_uses(json.loads(path.read_text(encoding="utf-8")))
        problem = "" if uses is not None else "not a workflow"
    except (OSError, UnicodeDecodeError):
        uses, problem = None, "unreadable"
    except (ValueError, RecursionError):
        uses, problem = None, "not valid JSON"
    _reads[key] = (held.st_mtime_ns, held.st_size, uses, problem)
    return held.st_mtime, uses, problem


def _open_label(one: dict) -> str:
    """The workflow path an open document names, relative to the workflows directory."""
    label = str(one.get("workflow") or "").replace("\\", "/").strip().lstrip("/")
    if label.startswith(f"{WORKFLOW_DIR}/"):
        label = label[len(WORKFLOW_DIR) + 1:]
    return label


def audit(open_documents: list | None = None, user: str = "default") -> dict:
    """The node types every saved workflow uses, and those of the workflows open in the editor.

    Args:
        open_documents: ``{workflow, document, saved, modified}`` per workflow open in the
            editor. An open workflow with unsaved changes stands in for its file; one never
            saved is read as well.
        user: The ComfyUI user the open workflows belong to.

    Returns:
        ``{ok, workflows, skipped, hints, user, users, own, files, capped, searched_at}``. Each
        workflow is ``{path, user, at, kind, open, modified, saved, nodes, types}``, ``types`` as
        :func:`node_uses` gives it and ``nodes`` the total count. ``skipped`` is
        ``{path, user, reason}`` per file that could not be read as a workflow. ``hints``
        merges every workflow's hints by node type. ``user`` is the one asking. ``own`` is Open
        Manager's own pack directory, empty where it is not in ``custom_nodes``. ``files`` names
        the packs that are a single ``.py`` file, from :func:`single_files`.
    """
    with _audit_lock:
        return _audit(open_documents, user)


def _audit(open_documents: list | None, user: str) -> dict:
    """:func:`audit`, run one at a time."""
    live: dict[str, dict] = {}
    for one in (open_documents or [])[:MAX_WORKFLOWS]:
        if not isinstance(one, dict) or not isinstance(one.get("document"), dict):
            continue
        label = _open_label(one)
        if label and label not in live:
            live[label] = one

    workflows: list[dict] = []
    skipped: list[dict] = []
    hints: dict[str, dict] = {}
    users = _user_folders()
    capped = False
    claimed: set[str] = set()

    def keep(entry: dict, uses: dict) -> None:
        entry["kind"] = uses["kind"]
        entry["types"] = uses["types"]
        entry["nodes"] = sum(count for count, _off in uses["types"].values())
        for kind, hint in uses["hints"].items():
            hints.setdefault(kind, hint)
        workflows.append(entry)

    read: set[str] = set()
    for name, where in users:
        try:
            found = sorted(where.rglob("*.json"))
        except OSError:
            continue
        for path in found:
            if len(read) >= MAX_WORKFLOWS:
                capped = True
                break
            read.add(str(path))
            try:
                label = path.relative_to(where).as_posix()
            except ValueError:
                label = path.name
            at, uses, problem = _read(path)
            mine = name == user and label in live
            entry = {"path": label, "user": name, "at": at, "open": mine,
                     "modified": False, "saved": True}
            if mine:
                claimed.add(label)
                opened = live[label]
                if opened.get("modified"):
                    entry["modified"] = True
                    uses = node_uses(opened["document"])
                    problem = "" if uses is not None else "not a workflow"
            if uses is None:
                skipped.append({"path": label, "user": name, "reason": problem or "unreadable"})
                continue
            keep(entry, uses)

    now = time.time()
    for label, opened in live.items():
        if label in claimed:
            continue
        uses = node_uses(opened["document"])
        if uses is None:
            continue
        keep({"path": label, "user": user, "at": 0.0, "open": True,
              "modified": bool(opened.get("modified")),
              "saved": False}, uses)

    if not capped:
        for stale in [key for key in _reads if key not in read]:
            _reads.pop(stale, None)

    return {
        "ok": True,
        "workflows": workflows,
        "skipped": skipped,
        "hints": hints,
        "user": user,
        "users": [name for name, _where in users],
        "own": own_folder(),
        "files": single_files(),
        "capped": capped,
        "searched_at": now,
    }
