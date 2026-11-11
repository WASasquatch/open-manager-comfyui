"""Keeps Open Manager as ComfyUI's manager, at its latest release, before each start."""

from __future__ import annotations

import importlib.metadata
import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

OURS = "comfyui-open-manager"
OFFICIAL = "comfyui-manager"
HOOK = "open_manager.manager_hook"


def _version(name: str) -> str:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return ""


def _hooked() -> bool:
    """Whether ``comfyui_manager`` is Open Manager's own module."""
    spec = importlib.util.find_spec("comfyui_manager")
    if spec is None or not spec.origin:
        return False
    try:
        return HOOK in Path(spec.origin).read_text("utf-8")
    except OSError:
        return False


def _uv(*args: str) -> bool:
    beside = Path(sys.executable).with_name("uv")
    uv = str(beside) if beside.is_file() else shutil.which("uv")
    if not uv:
        print("[Open Manager] uv not found")
        return False
    return subprocess.run([uv, "pip", *args, "--python", sys.executable],
                          check=False).returncode == 0


def main() -> int:
    official = _version(OFFICIAL)
    if official:
        print(f"[Open Manager] {OFFICIAL} {official} replaced Open Manager: uninstalling it",
              flush=True)
        _uv("uninstall", "--quiet", OFFICIAL)
    before = _version(OURS)
    broken = bool(official) or not before or not _hooked()
    args = ["install", "--quiet", "--upgrade-package", OURS]
    if broken:
        args += ["--reinstall-package", OURS]
    done = _uv(*args, OURS)
    after = _version(OURS)
    if broken and not done:
        print("[Open Manager] not repaired: ComfyUI starts without a manager")
        return 1
    if broken:
        print(f"[Open Manager] {after} installed as the manager")
    elif not done:
        print(f"[Open Manager] update check failed: starting {before}")
    elif after != before:
        print(f"[Open Manager] updated {before} to {after}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
