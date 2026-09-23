"""What a pack registered in this ComfyUI, read from the running process."""

from __future__ import annotations

import sys
from pathlib import Path

__all__ = ["registered"]

CAP = 2000

TEXT_CAP = 600


def _class_mappings() -> tuple[dict, dict]:
    """ComfyUI's class and display-name tables, or empty ones."""
    try:
        import nodes
    except Exception:
        return {}, {}
    classes = getattr(nodes, "NODE_CLASS_MAPPINGS", None)
    titles = getattr(nodes, "NODE_DISPLAY_NAME_MAPPINGS", None)
    return (classes if isinstance(classes, dict) else {},
            titles if isinstance(titles, dict) else {})


def _file_of(node_class) -> str:
    """The file a class was defined in, lowercased, or an empty string."""
    module = sys.modules.get(getattr(node_class, "__module__", "") or "")
    return str(getattr(module, "__file__", "") or "").lower()


def _describe(name: str, node_class, title: str) -> dict:
    """One class, in the shape the panel lists published nodes in.

    Args:
        name: The class name as ComfyUI registered it.
        node_class: The class itself.
        title: Its display name, where one is registered.

    Returns:
        ``{name, display_name, category, description, deprecated, experimental, inputs,
        outputs}``, carrying only the parts the class states.
    """
    entry: dict = {"name": name}
    if title:
        entry["display_name"] = str(title)[:120]
    for attribute, key in (("CATEGORY", "category"), ("DESCRIPTION", "description")):
        value = getattr(node_class, attribute, "")
        if isinstance(value, str) and value.strip():
            entry[key] = value.strip()[:TEXT_CAP]
    if getattr(node_class, "DEPRECATED", False):
        entry["deprecated"] = True
    if getattr(node_class, "EXPERIMENTAL", False):
        entry["experimental"] = True
    try:
        spec = node_class.INPUT_TYPES()
        entry["inputs"] = {
            "required": len(spec.get("required") or {}),
            "optional": len(spec.get("optional") or {}),
        }
    except Exception:
        pass
    outputs = getattr(node_class, "RETURN_TYPES", None)
    if isinstance(outputs, (list, tuple)) and outputs:
        entry["outputs"] = [str(one) for one in outputs][:24]
    return entry


def registered(directory: Path | str) -> list[dict]:
    """Every node class one installed pack added to this ComfyUI.

    Args:
        directory: The pack's install directory.

    Returns:
        One entry per class, by name. Empty where the pack registered none, where it is not
        imported, or where ComfyUI's tables cannot be read.
    """
    try:
        root = str(Path(directory).resolve()).lower()
    except OSError:
        return []
    if not root:
        return []
    classes, titles = _class_mappings()
    found: list[dict] = []
    for name, node_class in list(classes.items())[:20000]:
        where = _file_of(node_class)
        if not where or not where.startswith(root):
            continue
        found.append(_describe(str(name), node_class, str(titles.get(name, "") or "")))
        if len(found) >= CAP:
            break
    found.sort(key=lambda one: one["name"].lower())
    return found
