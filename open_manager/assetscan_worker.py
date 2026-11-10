"""ComfyUI's asset scans, run in a process of their own for :mod:`open_manager.assetscan`.

Started by the server with no arguments. Reads one JSON line of settings, then one JSON command
per line on stdin until stdin closes or ``quit`` arrives. Writes one JSON message per line on
the stdout it was started with; anything else printed goes to stderr.

Commands: ``{"scan": {roots, phase, prune, hashes, paused}}``, ``{"pause": 1}``,
``{"resume": 1}``, ``{"cancel": 1}``, ``{"quit": 1}``.

Messages: ``{"ready": {pid}}`` or ``{"fail": reason}`` once, then for each scan any number of
``{"event": [type, data]}``, ``{"progress": {...}}`` and ``{"log": [level, name, text]}``,
ending with ``{"done": {started, errors}}``.
"""

import dataclasses
import json
import logging
import os
import queue
import sqlite3
import sys
import threading
from contextlib import closing

_HERE = os.path.dirname(os.path.abspath(__file__))

_out = None
_out_lock = threading.Lock()

_QUIET = frozenset({"start", "pause", "resume", "cancel", "stop"})


class Refused(Exception):
    """This process cannot scan for the server that started it."""


def send(message: dict) -> None:
    data = (json.dumps(message, default=str) + "\n").encode("ascii")
    with _out_lock:
        try:
            _out.write(data)
        except (OSError, ValueError):
            pass


def _claim_stdout() -> None:
    global _out
    _out = os.fdopen(os.dup(1), "wb", buffering=0)
    os.dup2(2, 1)
    sys.stdout = sys.stderr


class _Relay(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        if record.funcName in _QUIET and os.path.basename(record.pathname) == "seeder.py":
            return
        try:
            text = record.getMessage()
            if record.exc_info:
                text += "\n" + logging.Formatter().formatException(record.exc_info)
        except Exception:  # noqa: BLE001
            return
        send({"log": [record.levelno, record.name, text]})


def _lower_priority() -> None:
    if os.name != "nt":
        try:
            os.nice(5)
        except (AttributeError, OSError):
            pass


def _same(one: list, other: list) -> bool:
    def norm(found: list) -> list:
        return sorted(os.path.normcase(os.path.abspath(entry)) for entry in found)
    return norm(one) == norm(other)


def _folders(settings: dict):
    import folder_paths

    folder_paths.folder_names_and_paths.clear()
    for name, (found, extensions) in settings["folders"].items():
        folder_paths.folder_names_and_paths[name] = (list(found), set(extensions))
    folder_paths.supported_pt_extensions.clear()
    folder_paths.supported_pt_extensions.update(settings["pt"])
    dirs = settings["dirs"]
    folder_paths.models_dir = dirs["models"]
    folder_paths.base_path = dirs["base"]
    folder_paths.set_output_directory(dirs["output"])
    folder_paths.set_input_directory(dirs["input"])
    folder_paths.set_temp_directory(dirs["temp"])
    folder_paths.set_user_directory(dirs["user"])
    if dirs.get("previews") and hasattr(folder_paths, "set_previews_directory"):
        folder_paths.set_previews_directory(dirs["previews"])


def _bind(settings: dict) -> None:
    from alembic.script import ScriptDirectory

    from app.database import db

    if not db.dependencies_available():
        raise Refused("the database packages did not import")
    url, path = settings["db"]["url"], settings["db"]["path"]
    if db._is_memory_db(url) or not os.path.isfile(path):
        raise Refused("the database is not a file")
    head = ScriptDirectory.from_config(db.get_alembic_config()).get_current_head()
    try:
        with closing(sqlite3.connect(path, timeout=30)) as conn:
            row = conn.execute("SELECT version_num FROM alembic_version").fetchone()
    except sqlite3.Error as error:
        raise Refused(f"the database could not be read ({error})") from error
    if head is None or not row or row[0] != head:
        raise Refused("the database is at another version than this ComfyUI")
    db._migrate_and_bind(url, path, True)


def _quiet_yields() -> None:
    def keep_going(*_args, **_kwargs) -> None:
        return None

    from app.assets import scanner
    from app.assets.services import file_utils

    for module in (scanner, file_utils):
        if callable(getattr(module, "yield_gil", None)):
            module.yield_gil = keep_going


def settle(settings: dict):
    """Make this process see the server's folders and database, or raise :class:`Refused`."""
    os.chdir(settings["cwd"])
    sys.path.insert(0, settings["comfy"])
    from comfy.cli_args import args

    args.database_url = settings["db"]["url"]
    args.enable_asset_hashing = bool(settings["hashing"])
    args.disable_assets = False
    _folders(settings)

    from app.assets import lifecycle, mode

    lifecycle._excluded_scan_roots.update(settings["excluded"])

    from app.assets.scanner import get_owned_prefixes

    if not _same(get_owned_prefixes(), settings["owned"]):
        raise Refused("this process sees other asset folders than the server")
    _bind(settings)
    mode.init(args)
    _quiet_yields()

    from app.assets.seeder import ScanPhase, asset_seeder

    asset_seeder.set_event_sink(lambda kind, data: send({"event": [kind, data]}))
    return asset_seeder, ScanPhase


def _listen(seeder, phases, started: queue.Queue) -> None:
    for raw in iter(sys.stdin.buffer.readline, b""):
        try:
            message = json.loads(raw)
        except ValueError:
            continue
        if not isinstance(message, dict):
            continue
        if "scan" in message:
            job = message["scan"]
            try:
                ok = seeder.start(
                    roots=tuple(job["roots"]),
                    phase=phases(job["phase"]),
                    prune_first=bool(job["prune"]),
                    compute_hashes=bool(job["hashes"]),
                    _start_paused=bool(job["paused"]),
                )
            except Exception as error:  # noqa: BLE001
                logging.exception("Asset scan could not start")
                send({"log": [logging.WARNING, "root", f"scan not started: {error}"]})
                ok = False
            started.put(ok)
        elif "pause" in message:
            seeder.pause()
        elif "resume" in message:
            seeder.resume()
        elif "cancel" in message:
            seeder.cancel()
        elif "quit" in message:
            break
    seeder.cancel()
    started.put(None)


def _progress(seeder, last):
    found = seeder.get_status().progress
    if found is None:
        return last
    now = dataclasses.asdict(found)
    if now != last:
        send({"progress": now})
    return now


def main() -> int:
    sys.path[:] = [entry for entry in sys.path if os.path.abspath(entry or os.curdir) != _HERE]
    _claim_stdout()
    root = logging.getLogger()
    for handler in list(root.handlers):
        root.removeHandler(handler)
    root.addHandler(_Relay())
    root.setLevel(logging.INFO)
    _lower_priority()

    try:
        settings = json.loads(sys.stdin.buffer.readline())
        seeder, phases = settle(settings)
    except Refused as error:
        send({"fail": str(error)})
        return 3
    except Exception as error:  # noqa: BLE001
        logging.getLogger().handlers.clear()
        logging.exception("asset scan process could not start")
        send({"fail": f"{type(error).__name__}: {error}"})
        return 3
    send({"ready": {"pid": os.getpid()}})

    started: queue.Queue = queue.Queue()
    threading.Thread(target=_listen, args=(seeder, phases, started), daemon=True).start()
    while True:
        ok = started.get()
        if ok is None:
            seeder.wait(timeout=30)
            return 0
        if not ok:
            send({"done": {"started": False, "errors": []}})
            continue
        last = None
        while not seeder.wait(timeout=0.5):
            last = _progress(seeder, last)
        _progress(seeder, last)
        send({"done": {"started": True, "errors": seeder.get_status().errors}})


if __name__ == "__main__":
    sys.exit(main())
