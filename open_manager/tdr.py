"""Windows' GPU timeout, and the driver resets it has caused."""

from __future__ import annotations

import re
import subprocess
import sys
import time
from datetime import datetime, timezone

from . import log

__all__ = ["status"]

logger = log.get_logger("tdr")

KEY = r"SYSTEM\CurrentControlSet\Control\GraphicsDrivers"

KEY_SHOWN = r"HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers"

DEFAULT_LEVEL = 3

DEFAULT_DELAY = 2

SHORT_DELAY = 10

LONG_DELAY = 120

ADVISED_DELAY = 60

WINDOW_DAYS = 7

CACHE_SECONDS = 300.0

QUERY_TIMEOUT = 8.0

RESET_QUERY = ("*[System[((Provider[@Name='Display'] and EventID=4101) or "
               "(Provider[@Name='nvlddmkm'] and (EventID=153 or EventID=13 or EventID=14 "
               "or EventID=109))) and TimeCreated[timediff(@SystemTime) <= {span}]]]")

_cache: dict = {"at": 0.0, "value": None}


def _registry() -> dict:
    """The timeout values Windows has been given, leaving out the ones it has not."""
    found: dict = {}
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, KEY) as key:
            for name in ("TdrLevel", "TdrDelay", "TdrDdiDelay"):
                try:
                    value, _kind = winreg.QueryValueEx(key, name)
                    found[name] = int(value)
                except (OSError, ValueError, TypeError):
                    continue
    except OSError:
        pass
    return found


def _resets() -> tuple[int | None, str]:
    """Driver resets Windows logged in the last :data:`WINDOW_DAYS` days.

    Returns:
        ``(count, newest)`` where newest is a local time, or ``(None, "")`` where the log
        could not be read.
    """
    query = RESET_QUERY.format(span=WINDOW_DAYS * 86_400_000)
    try:
        answer = subprocess.run(
            ["wevtutil", "qe", "System", f"/q:{query}", "/f:xml", "/rd:true", "/c:500"],
            capture_output=True, text=True, timeout=QUERY_TIMEOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.SubprocessError) as error:
        logger.debug("event log not read (%s: %s)", type(error).__name__, error)
        return None, ""
    if answer.returncode != 0:
        return None, ""
    stamps = re.findall(r"SystemTime=['\"]([^'\"]+)['\"]", answer.stdout)
    if not stamps:
        return 0, ""
    newest = stamps[0][:16].replace("T", " ")
    try:
        moment = datetime.strptime(stamps[0][:19], "%Y-%m-%dT%H:%M:%S")
        newest = moment.replace(tzinfo=timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")
    except ValueError:
        pass
    return len(stamps), newest


def _wddm() -> bool:
    """Whether the card ComfyUI runs on is under the display driver model TDR governs."""
    try:
        from . import monitor

        handles = monitor._nvml_handles()
        nvml = monitor._nvml
        if not handles or nvml is None:
            return True
        current, _pending = nvml.nvmlDeviceGetDriverModel(handles[0])
        return int(current) == 0
    except Exception:  # noqa: BLE001
        return True


FIX_TEXT = "Fix: run this in an administrator terminal, then restart Windows."


def _command(name: str, value: int) -> str:
    return f"reg add \"{KEY_SHOWN}\" /v {name} /t REG_DWORD /d {value} /f"


def _judge(values: dict, count: int | None, newest: str) -> dict:
    """The verdict, with the facts and lines a tooltip shows."""
    level = values.get("TdrLevel", DEFAULT_LEVEL)
    delay = values.get("TdrDelay", DEFAULT_DELAY)
    facts = []
    lines = []
    fix = FIX_TEXT
    command = ""
    if level == 0:
        verdict = "off"
        lines.append("Timeout detection is off, so a hung GPU stays hung until the PC restarts.")
        command = _command("TdrLevel", DEFAULT_LEVEL)
    elif level == 1:
        verdict = "bugcheck"
        lines.append("A GPU timeout stops Windows with a blue screen.")
        command = _command("TdrLevel", DEFAULT_LEVEL)
    elif level == 2:
        verdict = "vga"
        lines.append("A GPU timeout drops the display to basic VGA.")
        command = _command("TdrLevel", DEFAULT_LEVEL)
    elif delay < SHORT_DELAY:
        verdict = "short"
        lines.append("Windows resets the GPU driver when one piece of work runs past the "
                     "timeout, and the run dies with it.")
        command = _command("TdrDelay", ADVISED_DELAY)
    elif delay > LONG_DELAY:
        verdict = "long"
        lines.append(f"A real hang holds the display for up to {delay} s before Windows "
                     "recovers it.")
        command = _command("TdrDelay", ADVISED_DELAY)
    else:
        verdict = "ok"
        fix = ""
        if count:
            lines.append("The timeout is sound, so the resets point at the driver, clocks or "
                         "power.")
            fix = "Fix: update the GPU driver and undo any GPU overclock."
    shown = f"{delay} s" + ("" if "TdrDelay" in values else ", the Windows default")
    facts.append(["Timeout", shown])
    if level != DEFAULT_LEVEL:
        facts.append(["Recovery", {0: "off", 1: "blue screen", 2: "VGA"}.get(level, str(level))])
    if count:
        facts.append(["Driver resets", f"{count} in {WINDOW_DAYS} days, last {newest}"])
    flagged = verdict != "ok" or bool(count)
    return {
        "applies": True,
        "verdict": verdict,
        "flagged": flagged,
        "warn": bool(count) or verdict in ("off", "bugcheck"),
        "level": level,
        "delay": delay,
        "resets": count,
        "last_reset": newest,
        "label": {"off": "TDR off", "bugcheck": "TDR", "vga": "TDR"}.get(verdict, f"TDR {delay} s"),
        "lead": "Windows GPU timeout",
        "facts": facts,
        "lines": lines,
        "fix": fix if flagged else "",
        "command": command,
    }


def status(refresh: bool = False) -> dict:
    """What Windows does when the GPU stops answering, and how often it has.

    Args:
        refresh: Read again rather than answer from the last few minutes.

    Returns:
        ``{applies: False}`` off Windows or on a card outside the display driver model.
        Otherwise ``{applies, verdict, flagged, warn, level, delay, resets, last_reset,
        label, lead, facts, lines}``, where verdict is one of ``ok``, ``short``, ``long``,
        ``off``, ``bugcheck``, ``vga``.
    """
    if not sys.platform.startswith("win"):
        return {"applies": False}
    now = time.time()
    if not refresh and _cache["value"] is not None and now - _cache["at"] < CACHE_SECONDS:
        return _cache["value"]
    if not _wddm():
        value = {"applies": False}
    else:
        count, newest = _resets()
        value = _judge(_registry(), count, newest)
    _cache.update(at=now, value=value)
    return value
