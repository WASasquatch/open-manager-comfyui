"""How Open Manager is installed, and what updating it takes from here."""

from __future__ import annotations

import os
import sys
import threading
from pathlib import Path

__all__ = ["DIST", "NODE_ID", "behind", "newest", "remote", "state", "update"]

DIST = "comfyui-open-manager"
NODE_ID = "comfyui-open-manager"

REPO_URL = "https://github.com/WASasquatch/open-manager-comfyui"

ARCHIVE_URL = f"{REPO_URL}/archive/refs/heads/main.zip"

REMOTE_URL = "https://raw.githubusercontent.com/WASasquatch/open-manager-comfyui/main/pyproject.toml"

UPDATE_TIMEOUT = 900

OUTPUT_CAP = 4000

_ROOT = Path(__file__).resolve().parent


def _custom_node_dir() -> Path | None:
    """The ``custom_nodes`` pack directory this is running from, or ``None``.

    Returns:
        The pack's own directory where this copy lives under a ``custom_nodes`` path,
        otherwise None.
    """
    try:
        import folder_paths  # type: ignore

        roots = [Path(p).resolve() for p in folder_paths.get_folder_paths("custom_nodes")]
    except Exception:
        roots = []
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
        The parsed ``direct_url.json``, or an empty dict where there is none.
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
    """The version of the copy that is running: its own pyproject.toml beside the package,
    as a custom node or a source checkout has, otherwise what pip recorded.

    Returns:
        A version string, or ``unknown`` where neither source answers.
    """
    try:
        found = _project_version((_ROOT.parent / "pyproject.toml").read_text(encoding="utf-8"))
        if found:
            return found
    except OSError:
        pass
    try:
        from importlib.metadata import PackageNotFoundError, version as dist_version

        try:
            return dist_version(DIST)
        except PackageNotFoundError:
            pass
    except Exception:
        pass
    return "unknown"


PYPI_URL = f"https://pypi.org/pypi/{DIST}/json"
NEWEST_TTL = 6 * 3600
NEWEST_TIMEOUT = 6

_newest: dict = {"version": "", "at": 0.0}


def newest(force: bool = False) -> str:
    """The newest version published for this distribution.

    Args:
        force: Ask again even where a recent answer is held.

    Returns:
        A version string, or an empty string where it could not be read.
    """
    import time

    if not force and _newest["version"] and time.time() - _newest["at"] < NEWEST_TTL:
        return _newest["version"]
    try:
        import json
        import urllib.request

        with urllib.request.urlopen(PYPI_URL, timeout=NEWEST_TIMEOUT) as answer:
            data = json.loads(answer.read().decode("utf-8", "replace")[:2_000_000])
        found = str(((data or {}).get("info") or {}).get("version") or "").strip()[:40]
    except Exception:
        found = ""
    if found:
        _newest["version"] = found
        _newest["at"] = time.time()
    return found or _newest["version"]


def behind(check: bool = False) -> dict:
    """Whether the running copy is behind what is published.

    Args:
        check: Ask the index rather than answering from what is already held.

    Returns:
        ``{version, newest, behind}``. ``newest`` is empty where it is not known.
    """
    here = version()
    out = {"version": here, "newest": "", "behind": False}
    published = newest() if check else (_newest["version"] or "")
    if not published:
        return out
    out["newest"] = published
    try:
        from packaging.version import InvalidVersion, Version

        try:
            out["behind"] = Version(published) > Version(here)
        except InvalidVersion:
            out["behind"] = published != here
    except Exception:
        out["behind"] = published != here
    return out


def _newer(candidate: str, here: str) -> bool:
    """Whether one version string is ahead of another."""
    if not candidate:
        return False
    try:
        from packaging.version import InvalidVersion, Version

        try:
            return Version(candidate) > Version(here)
        except InvalidVersion:
            return candidate != here
    except Exception:
        return candidate != here


def _project_version(text: str) -> str:
    """The ``[project]`` version a pyproject.toml declares, or an empty string."""
    try:
        try:
            import tomllib  # type: ignore
        except ImportError:
            import tomli as tomllib  # type: ignore
        found = ((tomllib.loads(text) or {}).get("project") or {}).get("version")
        if found:
            return str(found).strip()[:40]
    except Exception:
        pass
    import re

    inside = False
    for line in text.splitlines():
        bare = line.strip()
        if bare.startswith("[") and bare.endswith("]") and not bare.startswith("[["):
            inside = bare == "[project]"
            continue
        if inside:
            match = re.match(r'version\s*=\s*["\']([^"\']+)["\']', bare)
            if match:
                return match.group(1).strip()[:40]
    return ""


_remote: dict = {"version": "", "checked": 0.0, "asked": 0.0, "error": ""}


def remote(check: bool = False) -> dict:
    """The version Open Manager's main branch declares, against the copy that is running.

    Args:
        check: Ask GitHub again even where a recent answer is held.

    Returns:
        ``{version, remote, behind, checked, error}``. ``remote`` is empty where it is not
        known; ``checked`` is when GitHub last answered, in epoch seconds.
    """
    import time

    now = time.time()
    if check or now - _remote["asked"] >= NEWEST_TTL:
        _remote["asked"] = now
        try:
            import urllib.request

            asked = urllib.request.Request(REMOTE_URL, headers={"User-Agent": "open-manager"})
            with urllib.request.urlopen(asked, timeout=NEWEST_TIMEOUT) as answer:
                found = _project_version(answer.read(200_000).decode("utf-8", "replace"))
            if found:
                _remote.update(version=found, checked=now, error="")
            else:
                _remote["error"] = "no version in its pyproject.toml"
        except Exception as error:
            _remote["error"] = f"GitHub did not answer ({type(error).__name__})"
    here = version()
    return {
        "version": here,
        "remote": _remote["version"],
        "behind": _newer(_remote["version"], here),
        "checked": _remote["checked"],
        "error": _remote["error"],
    }


def _updater(pack_dir: Path | None, direct: dict) -> dict:
    """Whether Open Manager can update itself here, and how.

    Returns:
        ``{able, how, reason}``. ``how`` is ``pip`` for a package, ``git`` for a clone in
        ``custom_nodes``, ``archive`` for any other copy there, or empty.
    """
    import shutil

    from . import gates, piptool

    if not gates.INSTALL:
        return {"able": False, "how": "", "reason": gates.refuse("install")["reason"]}
    if not gates.GITHUB:
        return {"able": False, "how": "", "reason": gates.refuse("github")["reason"]}
    if pack_dir is not None:
        if (pack_dir / ".git").is_dir():
            git = shutil.which("git") is not None
            return {"able": git, "how": "git", "reason": "" if git else "git is not on PATH"}
        return {"able": True, "how": "archive", "reason": ""}
    if (direct.get("dir_info") or {}).get("editable"):
        return {"able": False, "how": "", "reason": "installed editable from a folder"}
    if not piptool.available(sys.executable):
        return {"able": False, "how": "", "reason": "this Python has no pip or uv"}
    return {"able": True, "how": "pip", "reason": ""}


_updating = threading.Lock()


def _swap_from_archive(pack_dir: Path) -> str:
    """Replace a custom-node copy with the main branch's archive, keeping the running copy
    until the new one is unpacked, checked and in its place.

    Returns:
        An empty string on success, otherwise what stopped it. A failure leaves the running
        copy where it was.
    """
    import json
    import shutil
    import tempfile
    import time

    from . import installer

    staging = pack_dir.with_name(f"{pack_dir.name}.update.disabled")
    previous = pack_dir.with_name(f"{pack_dir.name}.previous.disabled")
    for leftover in (staging, previous):
        if leftover.exists():
            try:
                installer._remove_tree(leftover)
            except OSError as error:
                return f"{leftover.name} could not be cleared ({error.strerror or error})"
    scratch = Path(tempfile.mkdtemp(prefix="open_manager_update_"))
    try:
        archive = scratch / "main.zip"
        try:
            installer._download(ARCHIVE_URL, archive)
            staging.mkdir()
            written = installer._extract(archive, staging, strip_top=True)
        except (RuntimeError, OSError) as error:
            return f"the download failed ({error})"
        fresh = _project_version((staging / "pyproject.toml").read_text(encoding="utf-8")) \
            if (staging / "pyproject.toml").is_file() else ""
        if not fresh or not (staging / "open_manager" / "__init__.py").is_file():
            return "the download is not Open Manager"
        held = {}
        try:
            held = json.loads((pack_dir / installer.MARKER).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            held = {}
        (staging / ".tracking").write_text("\n".join(written) + "\n", encoding="utf-8")
        (staging / installer.MARKER).write_text(json.dumps({
            "id": held.get("id") or NODE_ID, "version": fresh, "installed_at": time.time(),
        }), encoding="utf-8")
        try:
            pack_dir.rename(previous)
        except OSError as error:
            return f"the running copy could not be moved aside ({error.strerror or error})"
        try:
            staging.rename(pack_dir)
        except OSError as error:
            previous.rename(pack_dir)
            return f"the new copy could not be put in place ({error.strerror or error})"
        try:
            installer._remove_tree(previous)
        except OSError:
            pass
        return ""
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
        if staging.exists():
            try:
                installer._remove_tree(staging)
            except OSError:
                pass


def update() -> dict:
    """Install the newest Open Manager over the copy that is running. A restart loads it.

    Returns:
        ``{ok, reason, version, output}``. ``version`` is what is installed afterwards;
        ``output`` is the end of what the installer printed.
    """
    import subprocess

    if not _updating.acquire(blocking=False):
        return {"ok": False, "reason": "an update is already running", "version": version(),
                "output": ""}
    try:
        pack_dir = _custom_node_dir()
        plan = _updater(pack_dir, _direct_url())
        if not plan["able"]:
            return {"ok": False, "reason": plan["reason"] or "cannot update itself here",
                    "version": version(), "output": ""}
        if plan["how"] == "archive":
            problem = _swap_from_archive(pack_dir)
            return {"ok": not problem, "reason": problem, "version": version(), "output": ""}
        if plan["how"] == "git":
            argv = ["git", "-C", str(pack_dir), "pull", "--ff-only"]
        else:
            from . import piptool

            argv = piptool.command(sys.executable, "install",
                                   ["--upgrade", "--force-reinstall", "--no-deps", ARCHIVE_URL])
        if not argv:
            return {"ok": False, "reason": "this Python has no pip or uv", "version": version(),
                    "output": ""}
        try:
            done = subprocess.run(
                argv, capture_output=True, timeout=UPDATE_TIMEOUT, check=False,
                encoding="utf-8", errors="replace",
                env={**os.environ, "PYTHONIOENCODING": "utf-8", "GIT_TERMINAL_PROMPT": "0"},
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except (OSError, subprocess.SubprocessError) as error:
            return {"ok": False, "reason": f"the updater did not run ({type(error).__name__})",
                    "version": version(), "output": ""}
        output = f"{done.stdout or ''}{done.stderr or ''}"[-OUTPUT_CAP:]
        if done.returncode != 0:
            return {"ok": False, "reason": f"{plan['how']} stopped with code {done.returncode}",
                    "version": version(), "output": output}
        return {"ok": True, "reason": "", "version": version(), "output": output}
    finally:
        _updating.release()


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


def state(check: bool = False) -> dict:
    """How this copy is installed and what updating it would take.

    Args:
        check: Ask the package index whether a newer version is published.

    Returns:
        ``{mode, version, newest, behind, dist, node_id, path, python, environment, from_git,
        managed, updater, official, steps, note}``. ``mode`` is ``custom_node`` or ``package``.
        ``managed`` says whether the pack updater handles it. ``updater`` is what ``update``
        would do, as ``_updater`` answers. ``official`` is the official ComfyUI-Manager beside
        it, as ``official.state`` answers, in package mode only. ``steps`` is the terminal
        recipe, each ``{label, command}``; it is empty in custom-node mode.
    """
    from . import official

    published = behind(check)
    pack_dir = _custom_node_dir()
    environment = _environment()
    python = _quote(sys.executable)
    direct = _direct_url()

    if pack_dir is not None:
        return {
            "mode": "custom_node",
            "from_git": (pack_dir / ".git").is_dir(),
            "version": published["version"],
            "newest": published["newest"],
            "behind": published["behind"],
            "dist": DIST,
            "node_id": NODE_ID,
            "path": str(pack_dir),
            "python": sys.executable,
            "environment": environment,
            "managed": True,
            "updater": _updater(pack_dir, direct),
            "steps": [],
            "note": "Installed as a custom node, so it updates like any other pack.",
        }

    prefix, forced = _install_prefix(python)
    source = _source_dir(direct)
    vcs = direct.get("vcs_info") or {}
    from_git = bool(vcs) or (source is not None and (source / ".git").is_dir())

    if source is not None and (source / ".git").is_dir():
        steps = [
            {"label": "Update your clone",
             "command": f"git -C {_quote(str(source))} pull"},
            {"label": "Reinstall from it",
             "command": f"{prefix} --upgrade {_quote(str(source))}"},
        ]
    elif vcs.get("requested_revision") or str(direct.get("url", "")).startswith(("git+", "http")):
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
        "version": published["version"],
        "newest": published["newest"],
        "behind": published["behind"],
        "dist": DIST,
        "node_id": NODE_ID,
        "path": str(_ROOT),
        "python": sys.executable,
        "environment": environment,
        "from_git": from_git,
        "managed": False,
        "updater": _updater(pack_dir, direct),
        "official": official.state(),
        "steps": steps,
        "note": notes[environment] + " Stop ComfyUI first, then run it, then start again.",
    }
