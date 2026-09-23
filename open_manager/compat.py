"""What a published version says it needs, set beside what this install has."""

from __future__ import annotations

import sys

__all__ = ["check", "host"]

_ANY_OS = {"os independent", "any"}

_PLATFORMS = {
    "win32": ("Microsoft :: Windows", ("microsoft", "windows")),
    "cygwin": ("Microsoft :: Windows", ("microsoft", "windows")),
    "darwin": ("MacOS", ("macos", "mac os", "darwin")),
    "linux": ("POSIX :: Linux", ("linux", "posix", "unix")),
}

_ACCELERATORS = (
    ("nvidia cuda", "cuda"),
    ("cuda", "cuda"),
    ("amd rocm", "rocm"),
    ("rocm", "rocm"),
    ("intel", "xpu"),
    ("apple", "mps"),
    ("metal", "mps"),
)

_host_cache: dict | None = None


def _accelerator() -> tuple[str, str]:
    """The accelerator in use, as a backend key and something readable.

    Returns:
        ``(backend, label)``. ``backend`` is one of ``cuda``, ``rocm``, ``xpu``, ``mps`` or
        ``cpu``, or ``unknown`` where torch cannot be imported or queried.
    """
    try:
        import torch
    except Exception:
        return "unknown", ""
    try:
        if torch.cuda.is_available():
            if getattr(getattr(torch, "version", None), "hip", None):
                return "rocm", "AMD ROCm"
            name = ""
            try:
                name = torch.cuda.get_device_name(0)
            except Exception:
                pass
            return "cuda", f"NVIDIA CUDA{f' ({name})' if name else ''}"
        if getattr(torch, "xpu", None) is not None and torch.xpu.is_available():
            return "xpu", "Intel XPU"
        backends = getattr(torch.backends, "mps", None)
        if backends is not None and backends.is_available():
            return "mps", "Apple Metal"
    except Exception:
        return "unknown", ""
    return "cpu", "CPU only"


def _comfyui_version() -> str:
    """ComfyUI's own version, empty where it cannot be read."""
    try:
        import comfyui_version

        return str(getattr(comfyui_version, "__version__", "") or "")
    except Exception:
        return ""


def _frontend_version() -> str:
    """The installed frontend package version, empty where it cannot be read."""
    for name in ("comfyui_frontend_package", "comfyui-frontend-package"):
        try:
            from importlib.metadata import version

            return str(version(name))
        except Exception:
            continue
    return ""


def host() -> dict:
    """What this install is, in the terms the registry declares against.

    Returns:
        ``{comfyui, frontend, platform, os_label, accelerator, accelerator_label}``. Any
        field may be empty, which means unknown and never means unsatisfied.
    """
    global _host_cache
    if _host_cache is None:
        label, _ = _PLATFORMS.get(sys.platform, ("", ()))
        backend, accelerator_label = _accelerator()
        _host_cache = {
            "comfyui": _comfyui_version(),
            "frontend": _frontend_version(),
            "platform": sys.platform,
            "os_label": label or sys.platform,
            "accelerator": backend,
            "accelerator_label": accelerator_label,
        }
    return dict(_host_cache)


def _version_note(field: str, label: str, declared: str, mine: str) -> dict | None:
    """One version range set against what is installed.

    Args:
        field: Machine name for the note.
        label: What to call it, cased to read inside a sentence.
        declared: The PEP 440 specifier the version declares.
        mine: The version this install has.

    Returns:
        A note, or None where nothing was declared. ``state`` is ``ok``, ``differs`` or
        ``unknown``; unknown covers an unreadable specifier and an unknown local version, and
        is never presented as a problem.
    """
    declared = (declared or "").strip()
    if not declared:
        return None
    note = {"field": field, "label": label, "declared": declared, "yours": mine,
            "state": "unknown"}
    if not mine:
        return note
    try:
        from packaging.specifiers import SpecifierSet
        from packaging.version import Version

        note["state"] = "ok" if SpecifierSet(declared).contains(
            Version(mine), prereleases=True) else "differs"
    except Exception:
        note["state"] = "unknown"
    return note


def _list_note(field: str, label: str, declared, mine: str, matcher) -> dict | None:
    """One declared list set against what is installed.

    Args:
        field: Machine name for the note.
        label: What to call it in the interface.
        declared: The classifier fragments the version declares.
        mine: What this install has, for display.
        matcher: Called with a lowercased fragment; True where this install satisfies it.

    Returns:
        A note, or None where nothing was declared.
    """
    items = [str(one).strip() for one in (declared or ()) if str(one).strip()]
    if not items:
        return None
    note = {"field": field, "label": label, "declared": ", ".join(items), "yours": mine,
            "state": "unknown"}
    if not mine:
        return note
    note["state"] = "ok" if any(matcher(one.lower()) for one in items) else "differs"
    return note


def check(
    supported_comfyui: str = "",
    supported_frontend: str = "",
    supported_os=(),
    supported_accelerators=(),
) -> dict:
    """Set one version's declarations beside this install.

    Args:
        supported_comfyui: PEP 440 specifier for ComfyUI.
        supported_frontend: PEP 440 specifier for the frontend package.
        supported_os: Trove classifier fragments for operating systems.
        supported_accelerators: Trove classifier fragments for accelerators.

    Returns:
        ``{declared, state, notes}``. ``declared`` is False where the version says nothing,
        which is the common case. ``state`` is ``ok`` where everything declared is satisfied,
        ``differs`` where at least one is not, and ``unknown`` where nothing could be
        decided. ``notes`` carries one entry per declaration, for showing both sides.
    """
    mine = host()
    notes = []

    for note in (
        _version_note("comfyui", "ComfyUI", supported_comfyui, mine["comfyui"]),
        _version_note("frontend", "frontend", supported_frontend, mine["frontend"]),
    ):
        if note:
            notes.append(note)

    words = _PLATFORMS.get(mine["platform"], ("", ()))[1]
    os_note = _list_note(
        "os", "operating system", supported_os, mine["os_label"],
        lambda one: one in _ANY_OS or any(word in one for word in words),
    )
    if os_note:
        notes.append(os_note)

    backend = mine["accelerator"]
    accelerator_note = _list_note(
        "accelerator", "accelerator", supported_accelerators,
        mine["accelerator_label"] or "",
        lambda one: backend == "unknown" or any(
            key in one and backend == want for key, want in _ACCELERATORS),
    )
    if accelerator_note:
        if backend == "unknown":
            accelerator_note["state"] = "unknown"
        notes.append(accelerator_note)

    if not notes:
        return {"declared": False, "state": "unknown", "notes": []}
    states = {note["state"] for note in notes}
    state = "differs" if "differs" in states else ("ok" if states == {"ok"} else "unknown")
    return {"declared": True, "state": state, "notes": notes}
