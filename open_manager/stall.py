"""Notice a run that has stopped answering, and restart ComfyUI with its queue intact."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import signal
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

from . import gates, log, monitor, paths

__all__ = ["CHANNEL", "MANUAL_GRACE", "configure", "dismiss", "seen", "start", "state",
           "unstick"]

logger = log.get_logger("stall")

CHANNEL = "open_manager.stall"

SUBDIR = "stall"

MODES = ("ask", "restart", "off")

DEFAULT_MODE = "ask"

DEFAULT_MINUTES = 10

MIN_MINUTES = 5

MAX_MINUTES = 120

TICK = 5.0

CHECK_EVERY = 15.0

AUTO_GRACE = 45.0

MANUAL_GRACE = 20.0

WORK_WAIT = 600.0

LOOK_EVERY = 5.0

REQUEUE_MAX_AGE = 1800.0

SERVER_WAIT = 600.0

ATTEMPT_WINDOW = 86400.0

EXIT_WAIT = 60.0

CPU_BUSY = 20.0

GPU_IDLE = 5

HELPER = r'''
import base64, json, os, subprocess, sys, time
pid = int(sys.argv[1]); cwd = sys.argv[2]
command = json.loads(base64.b64decode(sys.argv[3]).decode("utf-8"))
wait = float(sys.argv[4]); log_path = sys.argv[5]
if os.name == "nt":
    import ctypes
    kernel = ctypes.windll.kernel32
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    kernel.TerminateProcess.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    handle = kernel.OpenProcess(0x00100000 | 0x0001, False, pid)
    if handle:
        if kernel.WaitForSingleObject(handle, int(wait * 1000)) != 0:
            kernel.TerminateProcess(handle, 1)
            kernel.WaitForSingleObject(handle, 30000)
        kernel.CloseHandle(handle)
    time.sleep(1.5)
    subprocess.Popen(command, cwd=cwd, creationflags=0x00000010)
else:
    end = time.time() + wait
    while time.time() < end:
        try:
            os.kill(pid, 0)
        except OSError:
            break
        time.sleep(0.25)
    else:
        try:
            os.kill(pid, 9)
        except OSError:
            pass
        time.sleep(2)
    time.sleep(1.5)
    out = open(log_path, "ab")
    subprocess.Popen(command, cwd=cwd, stdout=out, stderr=subprocess.STDOUT,
                     stdin=subprocess.DEVNULL, start_new_session=True)
'''

_lock = threading.Lock()

_config: dict = {"mode": DEFAULT_MODE, "minutes": DEFAULT_MINUTES}

_watch: dict = {"prompt": "", "mark": None, "moved": 0.0, "acted": "", "checked": 0.0}

_alert: dict = {}

_last: dict = {}

_busy = {"on": False}

_started = False


def _file(name: str):
    return paths.store_file(name, SUBDIR)


def _read(name: str, fallback):
    try:
        return json.loads(_file(name).read_text("utf-8"))
    except (OSError, ValueError):
        return fallback


def _write(name: str, value) -> None:
    try:
        _file(name).write_text(json.dumps(value), "utf-8")
    except OSError as error:
        logger.warning("could not write %s (%s)", name, error)


def _apply(data: dict) -> None:
    mode = str(data.get("mode") or "")
    if mode in MODES:
        _config["mode"] = mode
    try:
        minutes = int(data.get("minutes"))
    except (TypeError, ValueError):
        minutes = 0
    if minutes:
        _config["minutes"] = max(MIN_MINUTES, min(MAX_MINUTES, minutes))


def configure(mode: str | None = None, minutes=None) -> dict:
    """Set what happens when a run stops answering.

    Args:
        mode: One of :data:`MODES`. Left as it was where not given.
        minutes: Minutes without progress before a run counts as stuck.

    Returns:
        The settings now in force.
    """
    with _lock:
        _apply({"mode": mode, "minutes": minutes})
        _write("config.json", _config)
        return dict(_config)


def state() -> dict:
    """The settings, any run waiting on an answer, and the last restart this made."""
    return {
        "config": dict(_config),
        "alert": dict(_alert),
        "last": dict(_last),
        "restarting": _busy["on"],
        "can_restart": gates.RESTART,
    }


def dismiss(prompt_id: str) -> dict:
    """Leave a stuck run alone: it is not raised again."""
    if _alert.get("prompt_id") == str(prompt_id or ""):
        _alert.clear()
    return state()


def seen() -> dict:
    """Mark the last restart as told."""
    if _last:
        _last["seen"] = True
        _write("last.json", _last)
    return state()


def _push(payload: dict) -> None:
    try:
        from server import PromptServer

        PromptServer.instance.send_sync(CHANNEL, payload)
    except Exception:  # noqa: BLE001
        pass


def _span(seconds: float) -> str:
    minutes = int(max(0, seconds) // 60)
    return f"{minutes}m" if minutes < 60 else f"{minutes // 60}h {minutes % 60}m"


def _jobs(running, pending) -> list:
    """The queue as plain data, the run first."""
    found = []
    ordered = [(one, True) for one in running]
    ordered += [(one, False) for one in sorted(pending, key=lambda one: one[0])]
    for item, stalled in ordered:
        try:
            outputs = item[4] if len(item) > 4 else None
            found.append({
                "prompt_id": str(item[1]),
                "prompt": item[2],
                "extra_data": dict(item[3] or {}),
                "outputs": list(outputs) if outputs else None,
                "stalled": stalled,
            })
        except Exception:  # noqa: BLE001
            continue
    return found


def _fingerprint(prompt) -> str:
    text = json.dumps(prompt, sort_keys=True, default=str)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:20]


def _attempts(now: float) -> dict:
    kept = {key: when for key, when in (_read("attempts.json", {}) or {}).items()
            if isinstance(when, (int, float)) and now - when < ATTEMPT_WINDOW}
    return kept


def _remember(fingerprint: str) -> None:
    now = time.time()
    kept = _attempts(now)
    kept[fingerprint] = now
    _write("attempts.json", kept)


def _base_url() -> tuple[str, ssl.SSLContext | None]:
    port, host, secure = 8188, "127.0.0.1", False
    try:
        from comfy.cli_args import args

        port = int(args.port)
        listen = str(args.listen or "").split(",")[0].strip()
        if listen and listen not in ("0.0.0.0", "::", "*"):
            host = listen
        elif listen == "::":
            host = "::1"
        secure = bool(getattr(args, "tls_keyfile", None))
    except Exception:  # noqa: BLE001
        pass
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    context = None
    if secure:
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    return f"{'https' if secure else 'http'}://{host}:{port}", context


def _call(url: str, context, payload: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data,
                                     headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30, context=context) as answer:
            body = answer.read().decode("utf-8") or "{}"
            return answer.status, json.loads(body)
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read().decode("utf-8") or "{}")
        except ValueError:
            return error.code, {}


def _queue_job(base: str, context, job: dict, front: bool = False) -> str:
    """Put one saved job back in the queue.

    Returns:
        An empty string where it went in, otherwise why it did not.
    """
    extra = dict(job.get("extra_data") or {})
    payload = {"prompt": job["prompt"], "extra_data": extra}
    if extra.get("client_id"):
        payload["client_id"] = extra["client_id"]
    if job.get("outputs"):
        payload["partial_execution_targets"] = job["outputs"]
    if front:
        payload["front"] = True
    try:
        code, body = _call(f"{base}/prompt", context, payload)
    except Exception as error:  # noqa: BLE001
        return f"{type(error).__name__}: {error}"[:200]
    if code == 200 and body.get("prompt_id"):
        return ""
    reason = (body.get("error") or {}).get("message") if isinstance(body.get("error"), dict) \
        else body.get("error")
    return str(reason or f"HTTP {code}")[:200]


def _node_label(running) -> str:
    rows = monitor._running_node(running)
    return rows[0][1] if rows else ""


def _signature() -> str:
    """``pinned`` for a card busy without working, ``idle`` for a machine doing nothing."""
    reading = monitor.sample()
    device = monitor._run_device(reading)
    watts = device.get("watts")
    limit = device.get("watt_limit") or 0
    share = (watts / limit) if (watts and limit) else None
    if monitor._pinned(device, share):
        return "pinned"
    util = device.get("util")
    cpu = reading.get("cpu")
    if isinstance(util, (int, float)) and util <= GPU_IDLE \
            and isinstance(cpu, (int, float)) and cpu < CPU_BUSY:
        return "idle"
    return ""


def _interrupt() -> None:
    try:
        import comfy.model_management as mm

        mm.interrupt_current_processing(True)
    except Exception as error:  # noqa: BLE001
        logger.warning("interrupt not sent (%s: %s)", type(error).__name__, error)


def _command() -> list:
    """The command line this ComfyUI was started with, to start it again."""
    argv = sys.argv.copy()
    if "--windows-standalone-build" in argv:
        argv.remove("--windows-standalone-build")
    flags = ["-s"] if sys.flags.no_user_site else []
    if argv and argv[0].endswith("__main__.py"):
        module = os.path.basename(os.path.dirname(argv[0]))
        return [sys.executable, *flags, "-m", module, *argv[1:]]
    return [sys.executable, *flags, *argv]


def _helper() -> str:
    path = _file("restart_helper.py")
    try:
        if not path.is_file() or path.read_text("utf-8") != HELPER:
            path.write_text(HELPER, "utf-8")
    except OSError as error:
        logger.warning("could not write the restart helper (%s)", error)
    return str(path)


def _spawn_helper() -> None:
    command = base64.b64encode(json.dumps(_command()).encode("utf-8")).decode("ascii")
    args = [sys.executable, _helper(), str(os.getpid()), os.getcwd(), command,
            str(EXIT_WAIT), str(_file("restart.log"))]
    if os.name == "nt":
        detached = 0x00000008 | 0x00000200
        try:
            subprocess.Popen(args, creationflags=detached | 0x01000000, close_fds=True)
        except OSError:
            subprocess.Popen(args, creationflags=detached, close_fds=True)
        return
    subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                     stderr=subprocess.DEVNULL, start_new_session=True, close_fds=True)


def _die() -> None:
    """Leave at once, without waiting on anything the stuck run holds."""
    try:
        if os.name == "nt":
            import ctypes

            kernel = ctypes.windll.kernel32
            kernel.GetCurrentProcess.restype = ctypes.c_void_p
            kernel.TerminateProcess.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
            kernel.TerminateProcess(kernel.GetCurrentProcess(), 1)
        else:
            os.kill(os.getpid(), signal.SIGKILL)
    finally:
        os._exit(1)


def _restart(jobs: list, reason: str) -> None:
    """Save the queue and start ComfyUI over."""
    now = time.time()
    tried = _attempts(now)
    for job in jobs:
        if job["stalled"]:
            job["fingerprint"] = _fingerprint(job["prompt"])
            if job["fingerprint"] in tried:
                job["skip"] = "it stopped answering again after the last restart"
    _write("requeue.json", {"at": now, "reason": reason, "jobs": jobs})
    logger.warning("restarting ComfyUI: %s. %d job(s) saved to queue again", reason, len(jobs))
    for handler in list(getattr(logger, "handlers", [])):
        try:
            handler.flush()
        except Exception:  # noqa: BLE001
            pass
    session = os.environ.get("__COMFY_CLI_SESSION__")
    if session:
        try:
            open(session + ".reboot", "w").close()
        except OSError:
            pass
    else:
        _spawn_helper()
    time.sleep(0.3)
    _die()


def _unstick(grace: float, reason: str) -> None:
    try:
        running, pending = monitor._queue_state()
        jobs = _jobs(running, pending)
        if not gates.RESTART:
            logger.warning("not restarting: restarts are switched off")
            return
        if not running:
            _restart(jobs, reason)
            return
        prompt = monitor._running_id(running)
        _interrupt()
        started = time.time()
        looked = 0.0
        told = False
        while True:
            time.sleep(1.0)
            now_running, _ = monitor._queue_state()
            if monitor._running_id(now_running) != prompt:
                stuck = [job for job in jobs if job["stalled"]]
                base, context = _base_url()
                failed = [why for why in (_queue_job(base, context, job, front=True)
                                          for job in stuck) if why]
                _alert.clear()
                _push({"unstuck": {"requeued": len(stuck) - len(failed), "failed": failed,
                                   "restarted": False}})
                logger.info("the run let go after an interrupt and was queued again")
                return
            now = time.time()
            if now - started < grace:
                continue
            if _busy.get("now") or now - started >= WORK_WAIT:
                break
            if now - looked < LOOK_EVERY:
                continue
            looked = now
            if _signature():
                break
            if not told:
                told = True
                _push({"unsticking": {"working": True}})
        _restart(jobs, reason)
    finally:
        _busy.update(on=False, now=False)


def unstick(grace: float, reason: str, now: bool = False) -> dict:
    """Interrupt the run, and restart ComfyUI with the queue saved if it is stuck.

    The run is given ``grace`` seconds to answer the interrupt. After that the process is
    ended once the card is busy without working or the machine is idle, and in any case
    after :data:`WORK_WAIT`. A run that is still working is left to finish its step.

    Args:
        grace: Seconds to wait for the run to answer the interrupt.
        reason: Why, for the log.
        now: Restart without waiting on a run that is still working. Given while a restart
            is already waiting, it cuts that wait short.

    Returns:
        ``{ok, reason}``. The work goes on in the background.
    """
    if not gates.RESTART:
        return {"ok": False, "reason": "restarts are switched off on this machine"}
    with _lock:
        if _busy["on"]:
            if now:
                _busy["now"] = True
                return {"ok": True, "reason": ""}
            return {"ok": False, "reason": "already on it"}
        _busy.update(on=True, now=bool(now))
    threading.Thread(target=_unstick, args=(grace, reason), daemon=True,
                     name="om-unstick").start()
    return {"ok": True, "reason": ""}


def _tick(now: float) -> None:
    running, _pending = monitor._queue_state()
    if not running:
        _watch.update(prompt="", mark=None, moved=0.0)
        if _alert:
            _alert.clear()
            _push({"alert": {}})
        return
    prompt = monitor._running_id(running)
    mark = monitor._progress_mark()
    if prompt != _watch["prompt"] or mark != _watch["mark"]:
        if _alert.get("prompt_id") == prompt:
            _alert.clear()
            _push({"alert": {}})
        _watch.update(prompt=prompt, mark=mark, moved=now)
        return
    mode = _config["mode"]
    if mode == "off" or _busy["on"] or _watch["acted"] == prompt:
        return
    quiet = now - _watch["moved"]
    if quiet < _config["minutes"] * 60 or now - _watch["checked"] < CHECK_EVERY:
        return
    _watch["checked"] = now
    look = _signature()
    if not look:
        return
    _watch["acted"] = prompt
    node = _node_label(running)
    if mode == "restart" and look == "pinned" and gates.RESTART:
        unstick(AUTO_GRACE, f"{node or 'the run'} made no progress for {_span(quiet)} "
                            "with the card busy without working")
        return
    _alert.clear()
    _alert.update(prompt_id=prompt, node=node, quiet=round(quiet), look=look, at=now)
    _push({"alert": dict(_alert)})


def _watchdog() -> None:
    while True:
        time.sleep(TICK)
        try:
            _tick(time.time())
        except Exception as error:  # noqa: BLE001
            logger.debug("stall check failed (%s: %s)", type(error).__name__, error)


def _requeue_saved() -> None:
    saved = _read("requeue.json", None)
    if not isinstance(saved, dict):
        return
    try:
        _file("requeue.json").unlink()
    except OSError:
        pass
    jobs = [job for job in saved.get("jobs") or [] if isinstance(job, dict)]
    record = {"at": time.time(), "reason": str(saved.get("reason") or ""), "requeued": 0,
              "skipped": [], "failed": [], "seen": False}
    if time.time() - float(saved.get("at") or 0) > REQUEUE_MAX_AGE:
        record["failed"].append("the saved queue was too old to run again")
    else:
        base, context = _base_url()
        end = time.time() + SERVER_WAIT
        while time.time() < end:
            try:
                code, _body = _call(f"{base}/prompt", context)
                if code == 200:
                    break
            except Exception:  # noqa: BLE001
                pass
            time.sleep(2.0)
        for job in jobs:
            if job.get("skip"):
                record["skipped"].append(str(job.get("skip")))
                continue
            why = _queue_job(base, context, job)
            if why:
                record["failed"].append(why)
                continue
            record["requeued"] += 1
            if job.get("stalled") and job.get("fingerprint"):
                _remember(str(job["fingerprint"]))
    _last.clear()
    _last.update(record)
    _write("last.json", _last)
    logger.info("after the restart: %d job(s) queued again, %d left out, %d failed",
                record["requeued"], len(record["skipped"]), len(record["failed"]))
    _push({"last": dict(_last)})


def start() -> None:
    """Read the settings, put back a queue saved by a restart, and start watching runs."""
    global _started
    if _started:
        return
    _started = True
    _apply(_read("config.json", {}) or {})
    last = _read("last.json", {})
    if isinstance(last, dict):
        _last.update(last)
    threading.Thread(target=_requeue_saved, daemon=True, name="om-requeue").start()
    threading.Thread(target=_watchdog, daemon=True, name="om-stall-watch").start()
