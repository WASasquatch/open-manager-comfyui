"""Requirement installs held for the next start, when no pack has their files open yet.

An install that failed because the running ComfyUI holds one of its files is offered here
with the exact lines and indexes it handed to pip. A confirmed offer runs from the manager's
``prestartup``, before custom nodes load, and its outcome is kept for the page to show.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

from . import log, paths, piptool

logger = log.get_logger("pending")

__all__ = ["locked_files", "offer", "confirm", "queued", "run_queued", "results", "clear_results"]

QUEUE = "pending_installs.json"

RESULTS = "pending_results.json"

OFFER_KEEP = 6 * 3600

RUN_TIMEOUT = 1800

_LOCKED = re.compile(r"\[WinError (?:5|32)\][^'\"]*['\"]([^'\"]+)['\"]")

_offers: dict = {}

_lock = threading.Lock()


def locked_files(output: str) -> list[str]:
    """The files pip could not replace because a running process holds them.

    Args:
        output: What pip printed.

    Returns:
        Each path once, in the order pip named them.
    """
    found: dict = {}
    for match in _LOCKED.finditer(output or ""):
        found.setdefault(match.group(1).replace("\\\\", "\\"), None)
    return list(found)


def _read(name: str) -> list:
    try:
        held = json.loads(paths.store_file(name).read_text(encoding="utf-8"))
    except (OSError, ValueError, RuntimeError):
        return []
    return held if isinstance(held, list) else []


def _write(name: str, rows: list) -> None:
    path = paths.store_file(name)
    writing = path.with_name(path.name + ".writing")
    try:
        writing.write_text(json.dumps(rows, indent=1), encoding="utf-8")
        os.replace(writing, path)
    except OSError as error:
        logger.warning("[Open Manager] %s not saved: %s", name, error)


def offer(pack: str, lines: list[str], indexes: list[str], label: str, locked: list[str]) -> str:
    """Hold an install that met a locked file, for the user to send to the next start.

    Args:
        pack: The pack folder the lines belong to.
        lines: The requirement lines handed to pip.
        indexes: Extra indexes that run used.
        label: What the lines are, as the log names them.
        locked: The files pip could not replace.

    Returns:
        The offer's id.
    """
    token = secrets.token_hex(8)
    now = time.time()
    with _lock:
        for key, held in list(_offers.items()):
            if now - held["at"] > OFFER_KEEP:
                del _offers[key]
        _offers[token] = {"id": token, "pack": pack, "lines": list(lines), "indexes": list(indexes),
                          "label": label, "locked": list(locked), "at": now}
    return token


def confirm(token: str) -> dict | None:
    """Queue an offer for the next start.

    Args:
        token: An id :func:`offer` returned.

    Returns:
        The queued entry, or None where no such offer is held.
    """
    with _lock:
        held = _offers.pop(token, None)
        if held is None:
            return None
        rows = [row for row in _read(QUEUE) if row.get("id") != token]
        rows.append(held)
        _write(QUEUE, rows)
    logger.info("[Open Manager] %s: %s queued for the next start", held["pack"], held["label"])
    return held


def queued() -> list:
    """The installs waiting for the next start."""
    return _read(QUEUE)


def run_queued() -> None:
    """Run every queued install, then keep each outcome for the page. Called before packs load."""
    with _lock:
        rows = _read(QUEUE)
        if not rows:
            return
        _write(QUEUE, [])
    outcomes = _read(RESULTS)
    for row in rows:
        pack = str(row.get("pack") or "")
        lines = [str(line) for line in row.get("lines") or [] if str(line).strip()]
        if not lines:
            continue
        logger.info("[Open Manager] %s: installing %s held from the last run: %s", pack,
                    row.get("label") or "requirements", ", ".join(lines))
        extra = [arg for index in row.get("indexes") or [] for arg in ("--extra-index-url", index)]
        ok = False
        said = ""
        with tempfile.TemporaryDirectory(prefix="open_manager_pending_") as folder:
            listing = Path(folder) / "requirements.txt"
            listing.write_bytes(("\n".join(lines) + "\n").encode("utf-8"))
            try:
                finished = piptool.run(
                    sys.executable, "install", ["--no-input", *extra, "-r", str(listing)],
                    timeout=RUN_TIMEOUT,
                    echo=lambda line: logger.info("[Open Manager] %s: %s", pack, line),
                )
            except (OSError, subprocess.SubprocessError) as error:
                finished = None
                said = f"the installer could not be run ({type(error).__name__}: {error})"
            if finished is not None:
                ok = finished.returncode == 0
                output = (finished.stdout or "") + (finished.stderr or "")
                said = "\n".join(output.strip().splitlines()[-40:])
            elif not said:
                said = piptool.describe(sys.executable)
        if ok:
            logger.info("[Open Manager] %s: %s installed", pack, row.get("label") or "requirements")
        else:
            logger.warning("[Open Manager] %s: %s did not install", pack,
                           row.get("label") or "requirements")
        from .installer import pip_trouble

        outcomes.append({"id": row.get("id", ""), "pack": pack, "label": row.get("label", ""),
                         "lines": lines, "ok": ok, "output": said,
                         "errors": [] if ok else list(pip_trouble(said)), "at": time.time()})
    _write(RESULTS, outcomes[-20:])


def results() -> list:
    """Outcomes of installs run at start that the page has not shown yet."""
    return _read(RESULTS)


def clear_results(ids) -> None:
    """Forget the outcomes the page has shown.

    Args:
        ids: The ids of the outcomes shown.
    """
    gone = {str(one) for one in ids or ()}
    with _lock:
        _write(RESULTS, [row for row in _read(RESULTS) if str(row.get("id", "")) not in gone])
