"""How Open Manager is installed, and what updating it takes from here.

Open Manager arrives one of two ways and they update differently.

As a custom node it is a directory in ``custom_nodes`` like any other pack, and the ordinary
update path applies: its page in the installed list, the same button every other pack has.

As a manager replacement it is a package in ``site-packages``, put there by pip. Nothing in a
running ComfyUI can rewrite that safely, so this offers directions instead: the command for
the interpreter actually running the server, which on a portable build is not the ``python``
a terminal finds on PATH. Getting that wrong installs the update into a different environment
and leaves the reader wondering why nothing changed.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

__all__ = ["DIST", "NODE_ID", "state"]

#: The distribution name pip knows, and the identifier the registry lists the pack under.
#: Both come from ``pyproject.toml``'s ``name``.
DIST = "comfyui-open-manager"
NODE_ID = "comfyui-open-manager"

REPO_URL = "https://github.com/WASasquatch/open-manager-comfyui"

#: For an install that did not come from an index. A zip of the default branch, because pip
#: can install one unaided and a portable build usually has no git for the ``git+`` form.
ARCHIVE_URL = f"{REPO_URL}/archive/refs/heads/main.zip"

#: Where the package is. ``open_manager/`` itself, whichever way it was installed.
_ROOT = Path(__file__).resolve().parent


def _custom_node_dir() -> Path | None:
    """The ``custom_nodes`` pack directory this is running from, or ``None``.

    Every registered ``custom_nodes`` path is checked rather than only the first, because a
    reader may keep packs on another drive and ComfyUI will load from all of them.

    Returns:
        The pack's own directory where this copy lives under a ``custom_nodes`` path,
        otherwise None.
    """
    try:
        import folder_paths  # type: ignore

        roots = [Path(p).resolve() for p in folder_paths.get_folder_paths("custom_nodes")]
    except Exception:
        roots = []
    # A fallback for the case where folder_paths is unavailable: the directory name alone.
    parents = list(_ROOT.parents)
    for parent in parents:
        if parent.name == "custom_nodes" and parent not in roots:
            roots.append(parent)

    for root in roots:
        for parent in parents:
            try:
                if parent.parent == root:
                    return parent
            except (OSError, ValueError):
                continue
    return None


def _environment() -> str:
    """A short name for the Python the server is running on.

    Returns:
        One of ``embedded``, ``conda``, ``venv`` or ``system``.
    """
    executable = Path(sys.executable)
    # A portable build ships its interpreter in a directory of this name, with a ._pth file
    # beside it that pins where imports come from.
    if executable.parent.name.lower() in {"python_embeded", "python_embedded"}:
        return "embedded"
    if any(executable.parent.glob("python*._pth")):
        return "embedded"
    conda = os.environ.get("CONDA_PREFIX")
    if conda and str(Path(sys.prefix)).startswith(str(Path(conda))):
        return "conda"
    if sys.prefix != getattr(sys, "base_prefix", sys.prefix):
        return "venv"
    return "system"


def _direct_url() -> dict:
    """What pip recorded about where this distribution was installed from.

    Returns:
        The parsed ``direct_url.json``, or an empty dict where there is none. An install from
        an index has no such file, which is itself the answer.
    """
    try:
        import json
        from importlib.metadata import distribution

        text = distribution(DIST).read_text("direct_url.json")
        return json.loads(text) if text else {}
    except Exception:
        return {}


def _source_dir(direct: dict) -> Path | None:
    """The local directory this was installed from, where that is still where it says.

    Args:
        direct: A parsed ``direct_url.json``.

    Returns:
        The directory, or None where the install did not come from one or it has since gone.
    """
    if "dir_info" not in direct:
        return None
    url = str(direct.get("url") or "")
    if not url.startswith("file:"):
        return None
    try:
        from urllib.parse import unquote, urlparse

        parsed = urlparse(url)
        path = unquote(parsed.path)
        # A Windows path arrives as /K:/thing; the leading slash is not part of it.
        if len(path) > 2 and path[0] == "/" and path[2] == ":":
            path = path[1:]
        candidate = Path(path)
        return candidate if candidate.is_dir() else None
    except Exception:
        return None


def _quote(path: str) -> str:
    """A path as a shell argument, quoted only where a space makes it necessary."""
    return f'"{path}"' if " " in path else path


def version() -> str:
    """The version of the copy that is running.

    Installed metadata is asked first, because that is what pip will compare against. A
    source checkout has no metadata, so its ``pyproject.toml`` is read instead.

    Returns:
        A version string, or ``unknown`` where neither source answers.
    """
    try:
        from importlib.metadata import PackageNotFoundError, version as dist_version

        try:
            return dist_version(DIST)
        except PackageNotFoundError:
            pass
    except Exception:
        pass

    import re

    for candidate in (_ROOT.parent / "pyproject.toml",):
        try:
            text = candidate.read_text(encoding="utf-8")
        except OSError:
            continue
        match = re.search(r'(?m)^\s*version\s*=\s*["\']([^"\']+)["\']', text)
        if match:
            return match.group(1)
    return "unknown"


def _install_prefix(python: str) -> tuple[str, str]:
    """How to spell an install command for this environment, and how to force one.

    Args:
        python: Interpreter the command should act on, already quoted.

    Returns:
        ``(prefix, reinstall_flag)``. The flag is empty where the installer has no equivalent.
    """
    from . import piptool

    if piptool.kind(sys.executable) == "uv":
        found = piptool.command(sys.executable, "install", [])
        if found:
            return " ".join(_quote(part) for part in found), ""
    return f"{python} -m pip install", "--force-reinstall "


def state() -> dict:
    """How this copy is installed and what updating it would take.

    Returns:
        ``{mode, version, dist, node_id, path, python, environment, from_git, managed,
        steps, note}``. ``mode`` is ``custom_node`` or ``package``. ``managed`` says whether
        Open Manager can perform the update itself. ``steps`` is the terminal recipe for when
        it cannot, each ``{label, command}``; it is empty in custom-node mode.
    """
    pack_dir = _custom_node_dir()
    environment = _environment()
    python = _quote(sys.executable)
    direct = _direct_url()

    if pack_dir is not None:
        return {
            "mode": "custom_node",
            "from_git": (pack_dir / ".git").is_dir(),
            "version": version(),
            "dist": DIST,
            "node_id": NODE_ID,
            "path": str(pack_dir),
            "python": sys.executable,
            "environment": environment,
            "managed": True,
            "steps": [],
            "note": "Installed as a custom node, so it updates like any other pack.",
        }

    # Package mode. Update from wherever this copy came from, because that is the source the
    # reader already chose and the one their setup is known to reach.
    prefix, forced = _install_prefix(python)
    source = _source_dir(direct)
    vcs = direct.get("vcs_info") or {}
    from_git = bool(vcs) or (source is not None and (source / ".git").is_dir())

    if source is not None and (source / ".git").is_dir():
        # A clone installed in place. Pulling first means the reinstall has something new to
        # install; without it pip would rebuild the same commit and report success.
        steps = [
            {"label": "Update your clone",
             "command": f"git -C {_quote(str(source))} pull"},
            {"label": "Reinstall from it",
             "command": f"{prefix} --upgrade {_quote(str(source))}"},
        ]
    elif vcs.get("requested_revision") or str(direct.get("url", "")).startswith(("git+", "http")):
        # Installed straight from the repository. pip is given the same URL again.
        url = str(direct.get("url") or ARCHIVE_URL)
        if vcs:
            revision = vcs.get("requested_revision") or ""
            url = f"git+{url}" if not url.startswith("git+") else url
            if revision:
                url = f"{url}@{revision}"
        steps = [
            {"label": "Reinstall from the repository",
             "command": f'{prefix} --upgrade {forced}"{url}"'},
        ]
    else:
        # No direct_url.json means pip resolved this from an index, so the name is enough.
        # The archive stays as the answer for an index that does not carry it.
        steps = [
            {"label": "Update from PyPI",
             "command": f"{prefix} --upgrade {DIST}"},
            {"label": "Or install the latest from GitHub",
             "command": f'{prefix} --upgrade {forced}"{ARCHIVE_URL}"'},
        ]

    notes = {
        "embedded": "This is a portable build: the command uses its bundled interpreter, not "
                    "the python on your PATH.",
        "venv": "The command uses the virtual environment's interpreter by full path, so it "
                "works whether or not the environment is activated.",
        "conda": "The command uses the conda environment's interpreter by full path, so it "
                 "works whether or not the environment is activated.",
        "system": "The command uses the interpreter running this server by full path.",
    }
    return {
        "mode": "package",
        "version": version(),
        "dist": DIST,
        "node_id": NODE_ID,
        "path": str(_ROOT),
        "python": sys.executable,
        "environment": environment,
        "from_git": from_git,
        "managed": False,
        "steps": steps,
        "note": notes[environment] + " Stop ComfyUI first, then run it, then start again.",
    }
