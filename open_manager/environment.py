"""What an install did to the Python environment, and how to put it back.

Installing a pack runs pip, and pip is free to upgrade, downgrade or add anything the pack's
requirements imply. That is usually fine and occasionally is the thing that breaks an install
that worked ten minutes ago. This records the package list either side of an install, so the
difference is a fact rather than a guess, and keeps the record on disk so it can still be
undone after a restart -- which is when the damage is usually noticed.

Restoring is destructive and is treated that way. It is never automatic, the exact commands
are shown before anything runs, and a set of packages is refused outright: the interpreter's
own tooling and the libraries ComfyUI is built on. Downgrading those to undo a pack install
trades one broken environment for a worse one, and pip is quite willing to do it.

The record describes the running interpreter. An install directed at a different one is not
snapshotted, because a list read from this process would describe the wrong environment.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path

from . import paths

__all__ = ["REFUSED", "compare", "forget", "record", "recorded", "restore", "restore_plan",
           "snapshot"]

#: Packages never uninstalled or downgraded by a restore, whatever an install did to them.
#:
#: The first group is how pip itself runs; removing them leaves an environment that cannot
#: install anything, including the thing that would fix it. The second is what ComfyUI imports
#: at startup, where a downgrade can stop the server booting, and a reader whose server will
#: not boot cannot reach this to undo it.
REFUSED = frozenset({
    "pip", "setuptools", "wheel", "packaging",
    "torch", "torchvision", "torchaudio", "torchsde",
    "numpy", "pillow", "aiohttp", "safetensors", "transformers", "tokenizers",
    "psutil", "pyyaml", "scipy",
})

#: How many installs are kept. Older records are dropped: a diff from fifty installs ago
#: describes an environment that has moved on and restoring to it is not an undo.
KEEP = 40

#: A bound on one restore, which may be downloading wheels.
TIMEOUT = 1800

_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


def _fold(name: str) -> str:
    """A distribution name folded for comparison, as PyPI compares them."""
    return re.sub(r"[-_.]+", "-", (name or "").strip().lower())


def snapshot() -> dict[str, str]:
    """Every distribution installed in the running interpreter.

    Read through ``importlib.metadata`` rather than by running ``pip freeze``: it is the same
    information without a subprocess, and it cannot fail halfway and return a partial list
    that would read as packages having been removed.

    Returns:
        ``{folded name: version}``, empty where the list could not be read.
    """
    try:
        from importlib.metadata import distributions
    except Exception:
        return {}
    found: dict[str, str] = {}
    for dist in distributions():
        try:
            name = dist.metadata["Name"]
            if name:
                found[_fold(name)] = str(dist.version)
        except Exception:
            # One unreadable distribution is not a reason to lose the other nine hundred.
            continue
    return found


def compare(before: dict, after: dict) -> dict:
    """What changed between two snapshots.

    Args:
        before: Snapshot taken before the install.
        after: Snapshot taken after it.

    Returns:
        ``{added, changed, removed, total}``. ``added`` is ``[{name, version}]``, ``changed``
        is ``[{name, was, now, direction}]`` and ``removed`` is ``[{name, version}]``.
    """
    added = [{"name": name, "version": after[name]}
             for name in sorted(set(after) - set(before))]
    removed = [{"name": name, "version": before[name]}
               for name in sorted(set(before) - set(after))]
    changed = []
    for name in sorted(set(before) & set(after)):
        if before[name] == after[name]:
            continue
        changed.append({
            "name": name,
            "was": before[name],
            "now": after[name],
            "direction": _direction(before[name], after[name]),
        })
    return {"added": added, "changed": changed, "removed": removed,
            "total": len(added) + len(changed) + len(removed)}


def _direction(was: str, now: str) -> str:
    """Whether a version moved up or down, or could not be told."""
    try:
        from packaging.version import Version

        return "upgraded" if Version(now) > Version(was) else "downgraded"
    except Exception:
        return "changed"


def restore_plan(diff: dict) -> dict:
    """The pip operations that would undo a diff, and the ones that will not be attempted.

    Args:
        diff: A result of :func:`compare`.

    Returns:
        ``{uninstall, install, refused}``. ``uninstall`` is a list of names, ``install`` a
        list of ``name==version``, and ``refused`` names what was left alone with the reason.
    """
    uninstall: list[str] = []
    install: list[str] = []
    refused: list[dict] = []

    def guard(name: str, what: str) -> bool:
        if _fold(name) in REFUSED:
            refused.append({"name": name, "action": what,
                            "reason": "kept back: pip or ComfyUI depends on it"})
            return False
        if not _NAME.match(name):
            refused.append({"name": name, "action": what,
                            "reason": "not a package name"})
            return False
        return True

    for entry in diff.get("added", ()):
        if guard(entry["name"], "uninstall"):
            uninstall.append(entry["name"])
    for entry in diff.get("changed", ()):
        if guard(entry["name"], "downgrade"):
            install.append(f"{entry['name']}=={entry['was']}")
    for entry in diff.get("removed", ()):
        if guard(entry["name"], "reinstall"):
            install.append(f"{entry['name']}=={entry['version']}")
    return {"uninstall": uninstall, "install": install, "refused": refused}


def _pip(args: list[str], python: str = "") -> tuple[bool, str]:
    """Run pip and return whether it succeeded with its trimmed output."""
    command = [python or sys.executable, "-m", "pip", "--disable-pip-version-check", *args]
    try:
        finished = subprocess.run(
            command, capture_output=True, timeout=TIMEOUT, check=False,
            encoding="utf-8", errors="replace",
        )
    except (OSError, subprocess.SubprocessError) as error:
        return False, f"pip could not be run ({type(error).__name__}: {error})"
    output = (finished.stdout or "") + (finished.stderr or "")
    return finished.returncode == 0, "\n".join(output.strip().splitlines()[-15:])


def restore(diff: dict, python: str = "") -> dict:
    """Undo what an install did to the environment.

    The two halves run separately and both are reported, because the second failing does not
    unwind the first: an environment left between the two states is still a state the reader
    has to be told about rather than left to discover.

    Args:
        diff: A result of :func:`compare`.
        python: Interpreter to act on. Defaults to the running one.

    Returns:
        ``{ok, plan, steps, restart_required}``. ``steps`` is one entry per pip run, each
        ``{action, packages, ok, output}``.
    """
    plan = restore_plan(diff)
    steps: list[dict] = []
    if plan["uninstall"]:
        ok, output = _pip(["uninstall", "--yes", *plan["uninstall"]], python)
        steps.append({"action": "uninstall", "packages": plan["uninstall"],
                      "ok": ok, "output": output})
    if plan["install"]:
        ok, output = _pip(["install", "--no-input", *plan["install"]], python)
        steps.append({"action": "install", "packages": plan["install"],
                      "ok": ok, "output": output})
    return {
        "ok": all(step["ok"] for step in steps) if steps else True,
        "plan": plan,
        "steps": steps,
        # Whatever happened, the interpreter is holding modules from before it happened.
        "restart_required": bool(steps),
    }


def _path() -> Path:
    """Where the record of environment changes is kept."""
    return paths.store_file("env_changes.json")


def recorded() -> list[dict]:
    """Every recorded install, newest first. Empty where nothing has been recorded."""
    try:
        raw = json.loads(_path().read_text(encoding="utf-8"))
    except (OSError, ValueError, RuntimeError, ImportError):
        return []
    return raw if isinstance(raw, list) else []


def record(pack: str, version: str, diff: dict) -> str:
    """Keep what an install did, so it can be undone after a restart.

    Args:
        pack: Pack identifier.
        version: Version installed.
        diff: A result of :func:`compare`.

    Returns:
        The identifier of the record, empty where nothing was written. An install that
        changed nothing is not recorded: there would be nothing to undo.
    """
    if not diff or not diff.get("total"):
        return ""
    entry = {
        "id": f"{pack}-{version}-{int(time.time())}",
        "pack": pack,
        "version": version,
        "at": time.time(),
        "python": sys.executable,
        "diff": diff,
    }
    entries = [entry] + recorded()
    try:
        _path().write_text(json.dumps(entries[:KEEP], indent=2), encoding="utf-8")
    except (OSError, RuntimeError, ImportError):
        return ""
    return entry["id"]


def forget(entry_id: str) -> bool:
    """Drop one record, once it has been acted on or is no longer wanted."""
    entries = [one for one in recorded() if one.get("id") != entry_id]
    try:
        _path().write_text(json.dumps(entries, indent=2), encoding="utf-8")
    except (OSError, RuntimeError, ImportError):
        return False
    return True
