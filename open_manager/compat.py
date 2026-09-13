"""What a published version says it needs, set beside what this install has.

The registry lets a publisher declare, per version, a ComfyUI range, a frontend range, an
operating system and an accelerator. Roughly one pack in six declares something, and the
declarations are often wrong in the publisher's favour: ``>=1.0.0`` appears against a ComfyUI
that has never left ``0.x``, and ``>=0.0.1`` says nothing at all.

So nothing here predicts whether a version will run. It reports two facts side by side, what
was declared and what this install has, and says whether one satisfies the other. A pack that
declares a range it does not really need still installs; the reader is told what the pack
claims and can decide. That is the same rule the rest of Open Manager follows: warn, never
block.

The OS and accelerator vocabularies are PyPI trove classifier fragments, which is why they
read as ``Microsoft :: Windows`` rather than ``windows``.
"""

from __future__ import annotations

import sys

__all__ = ["check", "host"]

#: Trove classifier fragments that mean "any operating system".
_ANY_OS = {"os independent", "any"}

#: How ``sys.platform`` maps onto the classifier fragments publishers use.
_PLATFORMS = {
    "win32": ("Microsoft :: Windows", ("microsoft", "windows")),
    "cygwin": ("Microsoft :: Windows", ("microsoft", "windows")),
    "darwin": ("MacOS", ("macos", "mac os", "darwin")),
    "linux": ("POSIX :: Linux", ("linux", "posix", "unix")),
}

#: Accelerator fragments, and the torch backend that satisfies each.
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
        ``cpu``; it is ``unknown`` where torch is not importable, which is not the same as
        having no accelerator and must not be reported as a mismatch.
    """
    try:
        import torch
    except Exception:
        return "unknown", ""
    try:
        if torch.cuda.is_available():
            # ROCm builds answer is_available() through the CUDA API, so the two are told
            # apart by the build carrying a HIP version rather than by which call answers.
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

    Cached: none of it changes while the server runs, and it is read for every version of
    every pack page.

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
        # An unparsable specifier is the publisher's, not the reader's, and saying nothing
        # is better than calling a version incompatible on the strength of a typo.
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
        # An unreadable torch is unknown, not unsatisfied: a reader with a working GPU and no
        # importable torch must not be told their card is the wrong one.
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
