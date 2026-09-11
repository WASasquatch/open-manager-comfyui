"""Check a pack's declared requirements against ComfyUI and the current environment.

Each requirement is read against what is installed now and against ComfyUI's own pins.
"""

from __future__ import annotations

import os
import re

__all__ = ["check", "comfyui_core"]

#: Packages ComfyUI itself depends on.
_CORE_NAMES = frozenset({
    "torch", "torchsde", "torchvision", "torchaudio", "numpy", "transformers",
    "tokenizers", "safetensors", "aiohttp", "pillow", "scipy", "einops", "kornia",
    "sentencepiece", "yarl", "pyyaml", "psutil", "av",
})


def _norm(name: str) -> str:
    """Fold a distribution name for comparison."""
    return re.sub(r"[-_.]+", "-", (name or "").strip().lower())


def comfyui_core() -> dict:
    """ComfyUI's own pinned requirements, keyed by folded name.

    Returns:
        ``{name: specifier}`` read from ComfyUI's requirements.txt, empty on failure.
    """
    try:
        import folder_paths

        path = os.path.join(os.path.dirname(os.path.abspath(folder_paths.__file__)), "requirements.txt")
        with open(path, encoding="utf-8", errors="replace") as handle:
            text = handle.read()
    except Exception:
        return {}
    pins: dict = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r"^([A-Za-z0-9_.-]+)\s*(.*)$", line)
        if match:
            pins[_norm(match.group(1))] = match.group(2).strip()
    return pins


def check(requirements) -> list[dict]:
    """Check declared requirements against the environment and ComfyUI.

    Args:
        requirements: Requirement strings, as a pack's requirements.txt or pyproject declares.

    Returns:
        One entry per requirement: ``{raw, name, spec, installed, status, core, comfyui}``.
        ``status`` is ``satisfied``, ``missing``, ``conflict``, ``vcs`` or ``unparsed``;
        ``core`` marks a package ComfyUI depends on; ``comfyui`` is ComfyUI's own specifier.
    """
    try:
        from importlib.metadata import PackageNotFoundError, version
        from packaging.requirements import Requirement
    except Exception:
        return []

    core = comfyui_core()
    out: list[dict] = []
    for raw in requirements:
        raw = (raw or "").strip()
        if not raw or raw.startswith("#"):
            continue
        if raw.startswith(("git+", "-e ", "--editable")) or "git+" in raw or "://" in raw:
            name = re.sub(r"\.git.*$", "", raw.rsplit("/", 1)[-1]) or raw
            out.append({"raw": raw, "name": name, "spec": "from URL", "installed": "",
                        "status": "vcs", "core": False, "comfyui": ""})
            continue
        try:
            req = Requirement(raw)
        except Exception:
            out.append({"raw": raw, "name": raw, "spec": "", "installed": "",
                        "status": "unparsed", "core": False, "comfyui": ""})
            continue
        name = req.name
        try:
            installed = version(name)
        except PackageNotFoundError:
            installed = None
        except Exception:
            installed = None
        folded = _norm(name)
        if installed is None:
            status = "missing"
        elif not req.specifier or req.specifier.contains(installed, prereleases=True):
            status = "satisfied"
        else:
            status = "conflict"
        out.append({
            "raw": raw,
            "name": name,
            "spec": str(req.specifier),
            "installed": installed or "",
            "status": status,
            "core": folded in _CORE_NAMES or folded in core,
            "comfyui": core.get(folded, ""),
        })
    return out
