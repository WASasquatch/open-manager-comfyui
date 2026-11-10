"""Where ComfyUI's asset scans run: alongside the server as ComfyUI has it, the startup scan
before the server opens, or every scan in a process of its own (``assetscan_worker.py``)."""

from __future__ import annotations

import atexit
import functools
import inspect
import json
import logging
import os
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path

from . import log, paths

__all__ = ["MODES", "configure", "install", "state"]

logger = log.get_logger("assetscan")

MODES = ("thread", "before", "process")

WORKER = Path(__file__).resolve().parent / "assetscan_worker.py"

READY_WAIT = 120.0

IDLE_QUIT = 300.0

POLL = 0.2

HOLD_REPORT = 15.0

_NO_WINDOW = 0x08000000

_BELOW_NORMAL = 0x00004000

_SEEDER_PARTS = ("_run_scan", "_run_gate", "_cancel_event", "_lock", "_roots", "_phase",
                 "_prune_first", "_compute_hashes", "_scan_state", "_finish_and_start_pending",
                 "_emit_event", "_add_error", "start", "wait", "get_status")

_DB_PARTS = ("_migrate_and_bind", "_is_memory_db", "get_database_url", "get_db_path",
             "get_alembic_config")

_LISTING = ("get_filename_list", "get_filename_list_", "get_full_path", "get_folder_paths")

_lock = threading.Lock()
_config: dict = {"mode": "process"}
_status: dict = {"installed": False, "reason": "", "fallback": ""}
_said: set = set()
_worker = None


def _file() -> Path:
    return paths.store_file("asset-scans.json")


def _load() -> None:
    try:
        data = json.loads(_file().read_text("utf-8"))
    except (OSError, ValueError):
        return
    if isinstance(data, dict) and data.get("mode") in MODES:
        _config["mode"] = data["mode"]


def _assets_on() -> bool:
    try:
        from server import PromptServer

        return bool(PromptServer.instance.asset_manager.enabled)
    except Exception:  # noqa: BLE001
        return False


def _reason() -> str:
    if _status["reason"]:
        return _status["reason"]
    if not _assets_on():
        return "assets off"
    return ""


def state() -> dict:
    """``{mode, available, reason, fallback, pid}``: the choice, why it cannot act if it cannot,
    why scans stay in ComfyUI's process if they do, and the scan process if one is running."""
    reason = _reason()
    with _lock:
        found = _worker
    pid = found.process.pid if found is not None and found.usable() else None
    return {"mode": _config["mode"], "available": not reason, "reason": reason,
            "fallback": _status["fallback"], "pid": pid}


def configure(mode: object) -> dict:
    """Choose where scans run, kept across restarts.

    Args:
        mode: One of :data:`MODES`.

    Returns:
        :func:`state` after the change.

    Raises:
        ValueError: For any other mode.
    """
    chosen = str(mode or "")
    if chosen not in MODES:
        raise ValueError(f"mode is one of {', '.join(MODES)}")
    with _lock:
        _config["mode"] = chosen
        found = _worker
        try:
            _file().write_text(json.dumps(_config), "utf-8")
        except OSError as error:
            logger.warning("could not write asset-scans.json (%s)", error)
    if chosen != "process" and found is not None:
        found.retire()
    return state()


def _say(why: str) -> None:
    if why not in _said:
        _said.add(why)
        logger.info("asset scans stay in ComfyUI's process: %s", why)


def _refuse(why: str) -> None:
    _status["fallback"] = why
    logger.warning("asset scans stay in ComfyUI's process: the scan process %s", why)


def _relog(entry: object) -> None:
    try:
        level, name, text = int(entry[0]), str(entry[1]), str(entry[2])
    except (TypeError, ValueError, IndexError, KeyError):
        return
    logging.getLogger(None if name == "root" else name).log(level, text)


def _flags() -> list:
    found = []
    if sys.flags.isolated:
        found.append("-I")
    else:
        if sys.flags.no_user_site:
            found.append("-s")
        if sys.flags.ignore_environment:
            found.append("-E")
    if sys.flags.utf8_mode:
        found += ["-X", "utf8"]
    return found


def _settings() -> dict:
    """What the scan process needs to see the server's folders and database."""
    import folder_paths
    from app.assets import lifecycle
    from app.assets.scanner import get_owned_prefixes
    from app.database import db
    from comfy.cli_args import args

    folders = {}
    for name, value in folder_paths.folder_names_and_paths.items():
        folders[name] = [[str(one) for one in value[0]], sorted(str(one) for one in value[1])]
    previews = getattr(folder_paths, "get_previews_directory", None)
    return {
        "comfy": os.path.dirname(os.path.abspath(folder_paths.__file__)),
        "cwd": os.getcwd(),
        "db": {"url": db.get_database_url(), "path": db.get_db_path()},
        "hashing": bool(getattr(args, "enable_asset_hashing", False)),
        "folders": folders,
        "pt": sorted(folder_paths.supported_pt_extensions),
        "dirs": {
            "models": folder_paths.models_dir,
            "base": folder_paths.base_path,
            "output": folder_paths.get_output_directory(),
            "input": folder_paths.get_input_directory(),
            "temp": folder_paths.get_temp_directory(),
            "user": folder_paths.get_user_directory(),
            "previews": previews() if callable(previews) else "",
        },
        "excluded": sorted(lifecycle.get_excluded_scan_roots()),
        "owned": list(get_owned_prefixes()),
    }


def _not_now() -> str:
    """Why this scan stays in ComfyUI's process, or an empty string."""
    if _status["fallback"]:
        return _status["fallback"]
    try:
        from app.database import db

        if db._is_memory_db(db.get_database_url()):
            return "the database is in memory"
    except Exception:  # noqa: BLE001
        return "the database is not reachable"
    try:
        from app.assets.services import hash_mode_state

        if hash_mode_state.pending_transition_count():
            return "a change to asset hashing is being applied"
    except Exception:  # noqa: BLE001
        pass
    import folder_paths

    for name in _LISTING:
        found = getattr(folder_paths, name, None)
        owner = getattr(found, "__module__", "folder_paths")
        if owner != "folder_paths":
            return f"{owner} changes how ComfyUI lists model files"
    return ""


class _Worker:
    """One scan process, reused for every scan until it sits idle for :data:`IDLE_QUIT`."""

    def __init__(self) -> None:
        self.process = None
        self.inbox: queue.Queue = queue.Queue()
        self.problem = ""
        self.busy = False
        self.retired = False
        self.timer = None
        self.writing = threading.Lock()

    def usable(self) -> bool:
        return not self.retired and self.process is not None and self.process.poll() is None

    def send(self, message: dict) -> bool:
        data = (json.dumps(message) + "\n").encode("utf-8")
        with self.writing:
            try:
                self.process.stdin.write(data)
                self.process.stdin.flush()
                return True
            except (OSError, ValueError, AttributeError):
                return False

    def _read(self) -> None:
        process = self.process
        for raw in iter(process.stdout.readline, b""):
            try:
                message = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(message, dict):
                continue
            if "log" in message:
                _relog(message["log"])
                continue
            self.inbox.put(message)
        self.inbox.put({"exit": process.wait()})

    def _drain(self) -> None:
        for raw in iter(self.process.stderr.readline, b""):
            text = raw.decode("utf-8", "replace").rstrip()
            if text:
                logger.warning("asset scan process: %s", text)

    def start(self, seeder) -> bool:
        """Start the process and wait until it can scan. False with :attr:`problem` empty when
        the scan was cancelled meanwhile."""
        try:
            settings = _settings()
        except Exception as error:  # noqa: BLE001
            self.problem = f"could not be given ComfyUI's folders ({type(error).__name__}: {error})"
            return False
        options = {"stdin": subprocess.PIPE, "stdout": subprocess.PIPE,
                   "stderr": subprocess.PIPE, "cwd": settings["cwd"], "close_fds": True}
        if os.name == "nt":
            options["creationflags"] = _NO_WINDOW | _BELOW_NORMAL
        else:
            options["start_new_session"] = True
        try:
            self.process = subprocess.Popen([sys.executable, *_flags(), str(WORKER)], **options)
        except OSError as error:
            self.problem = f"did not start ({error})"
            return False
        threading.Thread(target=self._read, name="open_manager.assetscan.out",
                         daemon=True).start()
        threading.Thread(target=self._drain, name="open_manager.assetscan.err",
                         daemon=True).start()
        if not self.send(settings):
            self.problem = "closed as it started"
            self.stop()
            return False
        deadline = time.monotonic() + READY_WAIT
        while time.monotonic() < deadline:
            if seeder._cancel_event.is_set():
                self.stop()
                return False
            try:
                message = self.inbox.get(timeout=POLL)
            except queue.Empty:
                continue
            if "ready" in message:
                logger.info("asset scans run in process %s", self.process.pid)
                return True
            if "fail" in message:
                self.problem = f"refused: {message['fail']}"
                self.stop()
                return False
            if "exit" in message:
                self.problem = f"stopped as it started (exit code {message['exit']})"
                return False
        self.problem = f"was not ready within {READY_WAIT:g} s"
        self.stop()
        return False

    def hold(self) -> None:
        """Mark it scanning. Caller holds ``_lock``."""
        self.busy = True
        if self.timer is not None:
            self.timer.cancel()
            self.timer = None

    def release(self) -> None:
        with _lock:
            self.busy = False
            leave = self.retired
            if not leave:
                self.timer = threading.Timer(IDLE_QUIT, self._idle)
                self.timer.daemon = True
                self.timer.start()
        if leave:
            self.quit()

    def _idle(self) -> None:
        with _lock:
            if self.busy or self.retired:
                return
            self.retired = True
        self.quit()

    def retire(self) -> None:
        """Let it finish the scan it holds, then quit."""
        with _lock:
            self.retired = True
            if self.timer is not None:
                self.timer.cancel()
                self.timer = None
            busy = self.busy
        if not busy:
            self.quit()

    def quit(self) -> None:
        self.send({"quit": 1})
        try:
            self.process.stdin.close()
        except (OSError, AttributeError):
            pass

    def stop(self, grace: float = 3.0) -> None:
        self.retired = True
        self.quit()
        if self.process is None:
            return
        try:
            self.process.wait(timeout=grace)
        except subprocess.TimeoutExpired:
            self.process.kill()

    def _progress(self, seeder, found: object) -> None:
        if not isinstance(found, dict):
            return
        with seeder._lock:
            now = seeder._scan_state
            if now is None:
                return
            for key, value in found.items():
                if isinstance(value, int) and hasattr(now, key):
                    setattr(now, key, value)

    def _lost(self, seeder, code: object) -> None:
        text = f"The asset scan process stopped (exit code {code})"
        logger.warning(text)
        seeder._add_error(text)
        seeder._emit_event("assets.seed.error", {"message": text})

    def scan(self, seeder) -> bool:
        """Run the seeder's current scan here, relaying its events, progress, pauses and
        cancels. False when the process never took the scan."""
        while True:
            try:
                self.inbox.get_nowait()
            except queue.Empty:
                break
        gate = seeder._run_gate.is_set()
        job = {"roots": list(seeder._roots), "phase": seeder._phase.value,
               "prune": bool(seeder._prune_first), "hashes": bool(seeder._compute_hashes),
               "paused": not gate}
        try:
            if not self.send({"scan": job}):
                with _lock:
                    self.retired = True
                return False
            cancelled = False
            while True:
                if not cancelled and seeder._cancel_event.is_set():
                    cancelled = True
                    self.send({"cancel": 1})
                now = seeder._run_gate.is_set()
                if not cancelled and now != gate:
                    gate = now
                    self.send({"resume": 1} if now else {"pause": 1})
                try:
                    message = self.inbox.get(timeout=POLL)
                except queue.Empty:
                    continue
                if "event" in message:
                    kind, data = message["event"]
                    if kind != "assets.seed.resumed":
                        seeder._emit_event(kind, data)
                elif "progress" in message:
                    self._progress(seeder, message["progress"])
                elif "done" in message:
                    done = message["done"] if isinstance(message["done"], dict) else {}
                    for error in done.get("errors") or []:
                        seeder._add_error(str(error))
                    if done.get("started") is False:
                        with _lock:
                            self.retired = True
                        return False
                    return True
                elif "exit" in message:
                    self._lost(seeder, message["exit"])
                    return True
        finally:
            self.release()


def _ready(seeder):
    """A scan process ready for the seeder's scan, or None to scan in ComfyUI's process."""
    global _worker
    with _lock:
        found = _worker
        if found is not None and found.usable():
            found.hold()
            return found
    fresh = _Worker()
    if not fresh.start(seeder):
        if fresh.problem:
            _refuse(fresh.problem)
        return None
    with _lock:
        _worker = fresh
        fresh.hold()
    return fresh


def _run_scan(seeder, original) -> None:
    """The seeder's scan thread: hands the scan to a scan process in ``process`` mode."""
    if _config["mode"] != "process":
        return original()
    why = _not_now()
    if why:
        _say(why)
        return original()
    try:
        worker = _ready(seeder)
    except Exception:  # noqa: BLE001
        logger.warning("asset scan process not started", exc_info=True)
        worker = None
    if worker is None:
        return original()
    try:
        taken = worker.scan(seeder)
    except Exception:  # noqa: BLE001
        logger.warning("asset scan process: the scan was lost", exc_info=True)
        worker.retire()
        taken = True
    if not taken:
        return original()
    with seeder._lock:
        seeder._finish_and_start_pending()
    return None


def _hold(seeder) -> None:
    """Keep ComfyUI from opening until the startup scan ends."""
    logger.info("ComfyUI opens once the asset scan ends")
    began = time.monotonic()
    while not seeder.wait(timeout=HOLD_REPORT):
        found = seeder.get_status().progress
        if found is not None:
            logger.info("asset scan: %d of %d files, %d new, %.0f s", found.scanned,
                        found.total, found.created, time.monotonic() - began)
    logger.info("asset scan done in %.1f s", time.monotonic() - began)


def _check(lifecycle, seeder_module, db) -> str:
    seeder = getattr(seeder_module, "asset_seeder", None)
    if seeder is None or not all(hasattr(seeder, part) for part in _SEEDER_PARTS):
        return "changed"
    if not callable(getattr(lifecycle, "start_asset_seeder", None)):
        return "changed"
    try:
        if "_start_paused" not in inspect.signature(seeder.start).parameters:
            return "changed"
    except (TypeError, ValueError):
        return "changed"
    if not all(callable(getattr(db, part, None)) for part in _DB_PARTS):
        return "changed"
    if any(name in vars(seeder_module) for name in ("subprocess", "multiprocessing")):
        return "native"
    return ""


def _retire() -> None:
    with _lock:
        found = _worker
    if found is not None and found.process is not None:
        found.stop(grace=2.0)


def install() -> bool:
    """Take over the seeder's scans and the startup scan's start. Safe to call again."""
    if _status["installed"]:
        return True
    _load()
    try:
        from app.database import db

        if not db.dependencies_available():
            _status["reason"] = "assets off"
            return False
        from app.assets import lifecycle
        from app.assets import seeder as seeder_module
    except Exception:  # noqa: BLE001
        _status["reason"] = "changed"
        return False
    problem = _check(lifecycle, seeder_module, db)
    if problem:
        _status["reason"] = problem
        logger.info("asset scans: left to ComfyUI (%s)", problem)
        return False
    seeder = seeder_module.asset_seeder
    original = seeder._run_scan
    if not getattr(original, "_om_assetscan", False):
        def run_scan() -> None:
            return _run_scan(seeder, original)

        run_scan._om_assetscan = True
        seeder._run_scan = run_scan
    start = lifecycle.start_asset_seeder
    if not getattr(start, "_om_assetscan", False):
        @functools.wraps(start)
        def start_asset_seeder(*args, **kwargs):
            started = start(*args, **kwargs)
            if started and _config["mode"] == "before":
                _hold(seeder)
            return started

        start_asset_seeder._om_assetscan = True
        lifecycle.start_asset_seeder = start_asset_seeder
    atexit.register(_retire)
    _status["installed"] = True
    return True
