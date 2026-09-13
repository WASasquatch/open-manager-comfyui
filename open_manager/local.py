"""What can be read about a pack from the copy on disk.

Not every installed pack is in the registry. Some never were, some were pulled and some were
put there by hand, and until now a pack the registry had never heard of had no page at all --
opening it got an error about an entry that does not exist, which says nothing about the pack
sitting in ``custom_nodes`` doing its job.

Everything here is read from files the pack already ships: its pyproject, its README, its
requirements, and the git metadata of a clone. Nothing is fetched and nothing is guessed. A
field that cannot be read is left out rather than filled in with a plausible value, because a
page that invents a licence is worse than one that admits it does not know.
"""

from __future__ import annotations

import configparser
import re
from pathlib import Path

__all__ = ["describe"]

#: README names tried, in order. The first that exists is the one shown.
_READMES = ("README.md", "README.MD", "Readme.md", "readme.md", "README.rst", "README.txt",
            "README")

#: How much of a README travels. The panel renders it; a repository that ships a book does not
#: get to decide how much memory that takes.
_README_LIMIT = 400_000

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python 3.10
    try:
        import tomli as tomllib  # type: ignore
    except ModuleNotFoundError:
        tomllib = None  # type: ignore


def _read(path: Path, limit: int = 200_000) -> str:
    """A text file's contents, empty where it cannot be read."""
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            return handle.read(limit)
    except OSError:
        return ""


def _pyproject(directory: Path) -> dict:
    """The parts of a pyproject worth showing, empty where there is none to read."""
    text = _read(directory / "pyproject.toml")
    if not text or tomllib is None:
        return {}
    try:
        parsed = tomllib.loads(text)
    except ValueError:
        return {}
    project = parsed.get("project") or {}
    licence = project.get("license")
    if isinstance(licence, dict):
        licence = licence.get("text") or licence.get("file") or ""
    urls = {str(k).lower(): str(v) for k, v in (project.get("urls") or {}).items()
            if isinstance(v, str)}
    comfy = parsed.get("tool", {}).get("comfy", {}) if isinstance(parsed.get("tool"), dict) else {}
    return {
        "name": str(project.get("name") or ""),
        "version": str(project.get("version") or ""),
        "description": str(project.get("description") or ""),
        "license": str(licence or ""),
        "requires_python": str(project.get("requires-python") or ""),
        "dependencies": [str(one) for one in (project.get("dependencies") or [])],
        "urls": urls,
        "publisher": str(comfy.get("PublisherId") or ""),
        "display_name": str(comfy.get("DisplayName") or ""),
        "icon": str(comfy.get("Icon") or ""),
    }


def _git(directory: Path) -> dict:
    """Where a clone came from and what it is sitting on.

    Read from the files git keeps rather than by running git, which may not be installed and
    would be a subprocess per pack page either way.

    Args:
        directory: The pack directory.

    Returns:
        ``{remote, branch, commit}``, any of which may be empty. Empty overall where the
        directory is not a clone.
    """
    git = directory / ".git"
    if not git.exists():
        return {}
    # A worktree or submodule keeps a file pointing at the real directory.
    if git.is_file():
        pointer = _read(git, 4096).strip()
        if pointer.startswith("gitdir:"):
            candidate = Path(pointer.split(":", 1)[1].strip())
            git = candidate if candidate.is_absolute() else (directory / candidate).resolve()
    out: dict = {}

    config = configparser.ConfigParser()
    try:
        config.read_string(_read(git / "config", 64_000))
        for section in config.sections():
            if section.startswith('remote "'):
                url = config.get(section, "url", fallback="")
                if url:
                    out["remote"] = url
                    if 'remote "origin"' == section:
                        break
    except (configparser.Error, ValueError):
        pass

    head = _read(git / "HEAD", 4096).strip()
    if head.startswith("ref:"):
        ref = head.split(":", 1)[1].strip()
        out["branch"] = ref.rsplit("/", 1)[-1]
        commit = _read(git / ref, 4096).strip()
        if not commit:
            # A repository that has been packed keeps its refs in one file instead.
            for line in _read(git / "packed-refs", 2_000_000).splitlines():
                if line.endswith(f" {ref}"):
                    commit = line.split(" ", 1)[0]
                    break
        if commit:
            out["commit"] = commit[:40]
    elif re.fullmatch(r"[0-9a-f]{40}", head):
        out["commit"] = head
        out["branch"] = "detached"
    return out


def _readme(directory: Path) -> dict:
    """The pack's README, and which file it came from."""
    for name in _READMES:
        path = directory / name
        if path.is_file():
            return {"name": name, "text": _read(path, _README_LIMIT)}
    return {}


def _node_classes(directory: Path) -> list[str]:
    """Node names this pack registered, as ComfyUI currently has them.

    Read from the live mappings rather than the source, so what is listed is what the pack
    actually contributed to this session. A pack that failed to import contributes nothing and
    gets an empty list, which is itself worth seeing.

    Args:
        directory: The pack directory.

    Returns:
        Node class names, sorted. Empty where nothing could be attributed.
    """
    try:
        import nodes  # type: ignore

        from . import health
    except Exception:
        return []
    seen: dict = {}
    found = []
    for name, cls in list(getattr(nodes, "NODE_CLASS_MAPPINGS", {}).items()):
        try:
            if health._defined_in(cls, directory, seen):
                found.append(str(name))
        except Exception:
            continue
    return sorted(found)


def describe(node_id: str) -> dict:
    """Everything readable about an installed pack, from the copy on disk.

    Args:
        node_id: Pack identifier, as the installed list reports it.

    Returns:
        ``{ok, id, dir, path, version, installed_at, pyproject, git, readme, requirements,
        classes, disabled}``. ``ok`` is False with a reason where nothing is installed under
        that name.
    """
    from . import installer

    directory = installer.resolve_install_dir(node_id)
    if directory is None or not directory.is_dir():
        return {"ok": False, "reason": "no pack of that name is installed", "id": node_id}

    project = _pyproject(directory)
    requirements = [
        line.strip() for line in _read(directory / "requirements.txt", 64_000).splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    return {
        "ok": True,
        "id": node_id,
        "dir": directory.name,
        "path": str(directory),
        "disabled": directory.name.endswith(".disabled"),
        "version": installer._version_in(directory),
        "installed_at": installer._installed_at(directory),
        "pyproject": project,
        "git": _git(directory),
        "readme": _readme(directory),
        "requirements": requirements,
        "classes": _node_classes(directory),
    }
