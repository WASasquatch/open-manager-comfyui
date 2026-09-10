"""GitHub repositories a user added by hand, kept in ComfyUI's user tree.

The list lives outside the pack directory, so removing and reinstalling Open Manager leaves
it in place.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

__all__ = ["add", "load", "path", "remove"]

#: Most repositories held in the list.
LIMIT = 500

#: Owner and repo of a GitHub URL, with any trailing ``.git`` stripped after.
_GITHUB = re.compile(r"github\.com[/:]+([^/#?:]+)/([^/#?]+)", re.I)


def path() -> Path:
    """The file the list is written to.

    Returns:
        A path under ComfyUI's user directory, or beside this package where that is
        unavailable.
    """
    try:
        import folder_paths

        base = Path(folder_paths.get_user_directory()) / "open_manager"
    except Exception:
        base = Path(__file__).resolve().parent.parent / "_cache"
    base.mkdir(parents=True, exist_ok=True)
    return base / "github_sources.json"


def parse(url: str) -> tuple[str, str] | None:
    """Owner and repository name from a GitHub URL.

    Args:
        url: A repository URL or ``owner/repo`` pair.

    Returns:
        ``(owner, name)``, or ``None`` where the URL names no GitHub repository.
    """
    text = (url or "").strip()
    if not text or len(text) > 400:
        return None
    if "github.com" not in text.lower():
        bare = re.fullmatch(r"([A-Za-z0-9._-]+)/([A-Za-z0-9._-]+)", text)
        if not bare:
            return None
        owner, name = bare.group(1), bare.group(2)
    else:
        match = _GITHUB.search(text)
        if not match:
            return None
        owner, name = match.group(1), match.group(2)
    name = re.sub(r"\.git$", "", name)
    if not owner or not name:
        return None
    return owner, name


def _fold(owner: str, name: str) -> str:
    """A comparison key for one repository, ignoring case."""
    return f"{owner}/{name}".lower()


def load() -> list[dict]:
    """The repositories on the list, newest first.

    Returns:
        One entry per repository, each ``{url, owner, name, added_at}``. Empty where the
        file is absent or unreadable.
    """
    try:
        data = json.loads(path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    rows = data.get("repos") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        pair = parse(str(row.get("url", "")))
        if pair is None:
            continue
        key = _fold(*pair)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "url": f"https://github.com/{pair[0]}/{pair[1]}",
            "owner": pair[0],
            "name": pair[1],
            "added_at": float(row.get("added_at") or 0.0),
        })
    out.sort(key=lambda row: row["added_at"], reverse=True)
    return out[:LIMIT]


def _write(rows: list[dict]) -> bool:
    """Write the list to disk.

    Args:
        rows: Entries to store.

    Returns:
        True where the file was written.
    """
    try:
        path().write_text(json.dumps({"repos": rows}, indent=1), encoding="utf-8")
        return True
    except OSError:
        return False


def add(url: str) -> dict:
    """Put a repository on the list.

    Args:
        url: A GitHub repository URL or ``owner/repo`` pair.

    Returns:
        ``{ok, repo, reason}``. ``ok`` is false for a URL that names no GitHub repository,
        for one already listed, and where the list is full.
    """
    pair = parse(url)
    if pair is None:
        return {"ok": False, "reason": "that is not a GitHub repository URL"}
    rows = load()
    key = _fold(*pair)
    if any(_fold(row["owner"], row["name"]) == key for row in rows):
        return {"ok": False, "reason": f"{pair[0]}/{pair[1]} is already on the list"}
    if len(rows) >= LIMIT:
        return {"ok": False, "reason": f"the list holds at most {LIMIT} repositories"}
    entry = {
        "url": f"https://github.com/{pair[0]}/{pair[1]}",
        "owner": pair[0],
        "name": pair[1],
        "added_at": time.time(),
    }
    if not _write([entry] + rows):
        return {"ok": False, "reason": "the list could not be written"}
    return {"ok": True, "repo": entry}


def remove(url: str) -> bool:
    """Take a repository off the list.

    Args:
        url: A GitHub repository URL or ``owner/repo`` pair.

    Returns:
        True where an entry was removed.
    """
    pair = parse(url)
    if pair is None:
        return False
    key = _fold(*pair)
    rows = load()
    kept = [row for row in rows if _fold(row["owner"], row["name"]) != key]
    if len(kept) == len(rows):
        return False
    return _write(kept)
