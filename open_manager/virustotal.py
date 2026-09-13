"""Reputation lookups for the files a pack ships, against VirusTotal.

Only hashes leave the machine. A file is identified to VirusTotal by its SHA-256, which the
service either recognises or does not; the file itself is never uploaded, so nothing from an
unreleased pack is published to a corpus other people can download.

The public API allows four requests a minute, offers no way to ask about several hashes at
once, and grants a daily allowance that varies by account -- published as five hundred, but
an unverified key may get a single lookup a day. The real figure is read from the service
rather than assumed. The allowance is then spent carefully: only the files :mod:`.risk`
already considers worth naming are looked up, and every answer is cached by hash across
packs and sessions, so the same file is never paid for twice.

The key belongs to the user. It arrives with a request, is held only for the length of the
scan, and is never written to disk or repeated back.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import posixpath
import time
from pathlib import Path

import aiohttp

from . import paths

__all__ = [
    "DAILY_BUDGET",
    "budget_used",
    "candidates",
    "scan",
    "state",
]

#: Where a file report is read from. The id is the file's SHA-256.
API_URL = "https://www.virustotal.com/api/v3/files/{sha256}"

#: Seconds one lookup may take.
TIMEOUT = 20

#: Requests a public key is allowed each minute. Kept to deliberately, because exceeding it
#: earns a 429 and no answer.
PER_MINUTE = 4

#: Requests assumed per day before the key's real allowance is known. VirusTotal publishes
#: 500 for the public API, but an account's actual figure varies -- an unverified one can be
#: as low as a single lookup a day -- so this is only a starting point and
#: :func:`fetch_quota` replaces it with what the service reports.
DAILY_BUDGET = 500

#: Where a key's real allowance is read from. This does not appear to count against it.
QUOTA_URL = "https://www.virustotal.com/api/v3/users/{key}/overall_quotas"

#: Seconds between lookups, from :data:`PER_MINUTE`.
SPACING = 60.0 / PER_MINUTE

#: Days a verdict is reused. A hash names one byte sequence forever, but engines change
#: their minds, so an answer is not kept indefinitely.
CACHE_DAYS = 30

#: Largest file hashed. Beyond this the read costs more than the answer is worth.
MAX_FILE = 256 * 1024 * 1024

#: Extensions worth asking about: compiled code, pickled data and prebuilt packages. These
#: mirror what :mod:`.risk` reports, so a scan follows the same judgement.
SUFFIXES = (
    ".pyd", ".so", ".dylib", ".dll", ".exe",
    ".pkl", ".pickle", ".pt", ".pth", ".ckpt", ".joblib", ".dill",
    ".whl",
)

_state = {
    "scanning": False,
    "done": 0,
    "total": 0,
    "pack": "",
    "error": "",
    "results": [],
    "started": 0.0,
    "allowed": DAILY_BUDGET,
    "used": 0,
}


def _dir() -> Path:
    """Where the cache and the day's tally are kept."""
    return paths.store()


def _read(name: str) -> dict:
    """One of our JSON files, empty where absent or unreadable."""
    try:
        data = json.loads((_dir() / name).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _write(name: str, data: dict) -> None:
    """Persist one of our JSON files, silent on failure."""
    try:
        (_dir() / name).write_text(json.dumps(data), encoding="utf-8")
    except OSError:
        pass


def budget_used() -> int:
    """Lookups already spent today, counted against :data:`DAILY_BUDGET`."""
    tally = _read("vt_budget.json")
    return int(tally.get(time.strftime("%Y-%m-%d"), 0) or 0)


def _spend(count: int) -> None:
    """Record lookups against today's allowance, keeping only recent days."""
    today = time.strftime("%Y-%m-%d")
    tally = _read("vt_budget.json")
    tally[today] = int(tally.get(today, 0) or 0) + count
    recent = sorted(tally)[-7:]
    _write("vt_budget.json", {day: tally[day] for day in recent})


def _cached(sha256: str) -> dict | None:
    """A verdict already known for this hash, or ``None`` where it has expired."""
    entry = _read("vt_cache.json").get(sha256)
    if not isinstance(entry, dict):
        return None
    if time.time() - float(entry.get("at") or 0) > CACHE_DAYS * 86400:
        return None
    return entry


def _remember(sha256: str, verdict: dict) -> None:
    """Keep a verdict so the same file is never paid for twice."""
    cache = _read("vt_cache.json")
    cache[sha256] = {**verdict, "at": time.time()}
    _write("vt_cache.json", cache)


def digest(path: Path) -> str:
    """The SHA-256 of a file, empty where it cannot be read or is too large.

    Args:
        path: File to hash.

    Returns:
        The hex digest, or an empty string.
    """
    try:
        if path.stat().st_size > MAX_FILE:
            return ""
        reader = hashlib.sha256()
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                reader.update(block)
        return reader.hexdigest()
    except OSError:
        return ""


def candidates(directory: Path) -> list[Path]:
    """The files in an installed pack worth asking about.

    Everything else is source a reader can open, and spending a request on it would leave
    nothing for the files that cannot be read.

    Args:
        directory: The installed pack directory.

    Returns:
        Matching files, in a stable order.
    """
    found: list[Path] = []
    try:
        for path in sorted(directory.rglob("*")):
            if path.is_file() and path.suffix.lower() in SUFFIXES:
                found.append(path)
    except OSError:
        return []
    return found


async def fetch_quota(key: str, session: aiohttp.ClientSession) -> dict:
    """What the key is actually allowed, as VirusTotal reports it.

    The published public figure is 500 a day, but a given account may be allowed far less,
    so the real number is asked for rather than assumed. Failure is not fatal: the scan
    falls back to the published figure and stops when the service says to.

    Args:
        key: The user's API key.
        session: Session the request runs on.

    Returns:
        ``{allowed, used}`` for the day, or an empty dict where it could not be read.
    """
    try:
        async with session.get(
            QUOTA_URL.format(key=key),
            headers={"x-apikey": key, "Accept": "application/json"},
            timeout=aiohttp.ClientTimeout(total=TIMEOUT),
        ) as answer:
            if answer.status != 200:
                return {}
            payload = await answer.json()
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
        return {}
    daily = (((payload or {}).get("data") or {}).get("api_requests_daily") or {}).get("user") or {}
    if "allowed" not in daily:
        return {}
    return {"allowed": int(daily.get("allowed") or 0), "used": int(daily.get("used") or 0)}


async def _lookup(sha256: str, key: str, session: aiohttp.ClientSession) -> dict:
    """Ask VirusTotal what it knows about one hash.

    The key travels as a header, never in the URL, because a URL is the part that ends up in
    proxy and server logs.

    Args:
        sha256: The file's digest.
        key: The user's API key.
        session: Session the request runs on.

    Returns:
        ``{known, malicious, suspicious, engines, name, error}``.
    """
    try:
        async with session.get(
            API_URL.format(sha256=sha256),
            headers={"x-apikey": key, "Accept": "application/json"},
            timeout=aiohttp.ClientTimeout(total=TIMEOUT),
        ) as answer:
            if answer.status == 404:
                return {"known": False, "malicious": 0, "suspicious": 0, "engines": 0}
            if answer.status == 401:
                return {"error": "the key was refused"}
            if answer.status == 429:
                return {"error": "the key's allowance is spent"}
            if answer.status != 200:
                return {"error": f"lookup failed ({answer.status})"}
            payload = await answer.json()
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
        return {"error": f"{type(error).__name__}"}

    stats = (((payload or {}).get("data") or {}).get("attributes") or {}).get(
        "last_analysis_stats"
    ) or {}
    malicious = int(stats.get("malicious") or 0)
    suspicious = int(stats.get("suspicious") or 0)
    engines = sum(int(value or 0) for value in stats.values())
    names = (((payload or {}).get("data") or {}).get("attributes") or {}).get("names") or []
    return {
        "known": True,
        "malicious": malicious,
        "suspicious": suspicious,
        "engines": engines,
        "name": str(names[0]) if names else "",
    }


def _redact(text: str, key: str) -> str:
    """A message with the key taken out of it.

    :data:`QUOTA_URL` carries the key in its path, and an aiohttp error stringifies the URL
    it was fetching. Error text is reported through :func:`state`, so it is scrubbed before
    it is stored rather than trusted not to contain the key.

    Args:
        text: The message to report.
        key: The key to remove.

    Returns:
        The message with any occurrence of the key replaced.
    """
    message = str(text or "")
    return message.replace(key, "***") if key else message


def state() -> dict:
    """How a scan is going, and what it found. Never carries the key."""
    return {
        "scanning": _state["scanning"],
        "done": _state["done"],
        "total": _state["total"],
        "pack": _state["pack"],
        "error": _state["error"],
        "results": list(_state["results"]),
        "budget_used": _state["used"],
        "budget": _state["allowed"],
    }


async def scan(pack: str, directory: Path, key: str) -> None:
    """Look up every file in a pack worth asking about.

    Runs one at a time, spaced to the public allowance, reporting through :func:`state`. A
    hash already answered for costs nothing and is not spaced.

    Args:
        pack: Name shown while the scan runs.
        directory: The installed pack directory.
        key: The user's API key, used and discarded.
    """
    if _state["scanning"]:
        return
    files = candidates(directory)
    _state.update(
        scanning=True, done=0, total=len(files), pack=pack, error="", results=[],
        started=time.time(),
    )
    try:
        if not files:
            return
        spent = 0
        last = 0.0
        async with aiohttp.ClientSession() as session:
            # What this key may actually do today, rather than what the tier nominally says.
            quota = await fetch_quota(key, session)
            _state["allowed"] = quota.get("allowed", DAILY_BUDGET)
            _state["used"] = quota.get("used", budget_used())
            remaining = max(0, _state["allowed"] - _state["used"])
            if not remaining:
                _state["error"] = (
                    f"the key's daily allowance is spent "
                    f"({_state['used']} of {_state['allowed']})"
                )
                return
            for path in files:
                name = posixpath.join(*path.relative_to(directory).parts)
                sha256 = digest(path)
                if not sha256:
                    _state["results"].append(
                        {"file": name, "state": "unreadable", "sha256": ""}
                    )
                    _state["done"] += 1
                    continue

                verdict = _cached(sha256)
                if verdict is None:
                    if spent >= remaining:
                        _state["results"].append(
                            {"file": name, "state": "budget", "sha256": sha256}
                        )
                        _state["done"] += 1
                        continue
                    wait = SPACING - (time.monotonic() - last)
                    if last and wait > 0:
                        await asyncio.sleep(wait)
                    last = time.monotonic()
                    verdict = await _lookup(sha256, key, session)
                    spent += 1
                    _state["used"] += 1
                    if verdict.get("error"):
                        _state["error"] = _redact(verdict["error"], key)
                        _state["results"].append(
                            {"file": name, "state": "error", "sha256": sha256,
                             "detail": verdict["error"]}
                        )
                        _state["done"] += 1
                        if verdict["error"] != "lookup failed":
                            break
                        continue
                    _remember(sha256, verdict)

                _state["results"].append({
                    "file": name,
                    "sha256": sha256,
                    "state": "flagged" if verdict.get("malicious") else (
                        "known" if verdict.get("known") else "unknown"
                    ),
                    "malicious": int(verdict.get("malicious") or 0),
                    "suspicious": int(verdict.get("suspicious") or 0),
                    "engines": int(verdict.get("engines") or 0),
                })
                _state["done"] += 1
        if spent:
            _spend(spent)
    except Exception as error:  # noqa: BLE001 - a scan must never take the server down
        _state["error"] = _redact(f"{type(error).__name__}: {error}", key)
    finally:
        _state["scanning"] = False
