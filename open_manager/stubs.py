"""Packages whose PyPI release is a wheel stub, and the index their real wheel installs from.

A stub's index is used only where its host is one of :data:`STUB_HOSTS`.
"""

from __future__ import annotations

import io
import json
import re
import tarfile
import threading
import urllib.parse
import urllib.request

try:
    import tomllib
except ModuleNotFoundError:
    try:
        import tomli as tomllib
    except ModuleNotFoundError:
        tomllib = None

__all__ = ["STUB_BACKEND", "STUB_HOSTS", "index_for", "failed_on_stub", "last_collected"]

STUB_BACKEND = "wheel_stub.buildapi"

STUB_HOSTS = frozenset({"pypi.nvidia.com", "pypi.ngc.nvidia.com"})

PYPI_JSON = "https://pypi.org/pypi/{name}/json"

TIMEOUT = 20

JSON_BYTES = 16 << 20

ARCHIVE_BYTES = 1 << 20

_cache: dict = {}

_lock = threading.Lock()

_COLLECTING = re.compile(r"^\s*Collecting\s+(\S+)")


def _fetch(url: str, cap: int) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "open-manager"})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as answer:
        if answer.status != 200:
            raise OSError(f"{url} answered {answer.status}")
        body = answer.read(cap + 1)
    if len(body) > cap:
        raise OSError(f"{url} is larger than {cap} bytes")
    return body


def _stub_index(archive: bytes) -> str:
    """The index a wheel stub's source archive names, empty where it is not a wheel stub."""
    if tomllib is None:
        return ""
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:*") as packed:
        member = next((one for one in packed.getmembers()
                       if one.isfile() and one.name.count("/") == 1
                       and one.name.endswith("/pyproject.toml")), None)
        if member is None:
            return ""
        handle = packed.extractfile(member)
        text = handle.read(256 << 10).decode("utf-8", errors="replace") if handle else ""
    parsed = tomllib.loads(text)
    if (parsed.get("build-system") or {}).get("build-backend") != STUB_BACKEND:
        return ""
    return str(((parsed.get("tool") or {}).get("wheel_stub") or {}).get("index_url") or "")


def index_for(line: str) -> tuple[str, str]:
    """Where a requirement's real wheel comes from, when PyPI holds only a wheel stub for it.

    Args:
        line: One requirement line.

    Returns:
        ``(index_url, refused)``. ``index_url`` is the stub's index where its host is in
        :data:`STUB_HOSTS`; ``refused`` names an index a stub named that is not. Both are
        empty where the newest release the line accepts is not a wheel stub.
    """
    try:
        from packaging.requirements import Requirement
        from packaging.version import InvalidVersion, Version

        wanted = Requirement(line.strip())
    except Exception:
        return "", ""
    key = (wanted.name.lower(), str(wanted.specifier))
    with _lock:
        if key in _cache:
            return _cache[key]
    found = ("", "")
    try:
        data = json.loads(_fetch(PYPI_JSON.format(name=urllib.parse.quote(wanted.name)), JSON_BYTES))
        releases = data.get("releases") or {}
        versions = []
        for raw, files in releases.items():
            try:
                version = Version(raw)
            except InvalidVersion:
                continue
            live = [one for one in files or [] if not one.get("yanked")]
            if live and wanted.specifier.contains(version, prereleases=False):
                versions.append((version, live))
        if versions:
            _version, files = max(versions, key=lambda pair: pair[0])
            if not any(one.get("packagetype") == "bdist_wheel" for one in files):
                source = next((one for one in files if one.get("packagetype") == "sdist"), None)
                if source and source.get("url"):
                    named = _stub_index(_fetch(source["url"], ARCHIVE_BYTES))
                    if named:
                        parts = urllib.parse.urlparse(named)
                        if parts.scheme == "https" and (parts.hostname or "").lower() in STUB_HOSTS:
                            found = (named, "")
                        else:
                            found = ("", named)
    except Exception:
        found = ("", "")
    with _lock:
        _cache[key] = found
    return found


def failed_on_stub(output: str) -> bool:
    """Whether pip's output shows it failed to build a wheel stub."""
    return STUB_BACKEND in (output or "") or "wheel-stub" in (output or "")


def last_collected(output: str) -> str:
    """The requirement pip was collecting when its output ended, empty where none."""
    found = ""
    for line in (output or "").splitlines():
        match = _COLLECTING.match(line)
        if match:
            found = match.group(1)
    return found
