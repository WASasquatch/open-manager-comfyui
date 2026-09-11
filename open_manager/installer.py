"""Install a pack from the registry without the host manager.

A registry artifact is a zip whose files sit at its root. Installing one places those files
in ``custom_nodes/<node_id>`` and installs any requirements the pack declares. A
``.tracking`` file beside them lists what was written.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

__all__ = [
    "InstallResult",
    "custom_nodes_dir",
    "install",
    "install_repo",
    "installed_version",
    "list_installed",
    "uninstall",
]

#: Marker written into an installed pack, naming the version this installed.
MARKER = ".open_manager.json"

#: Seconds a download may take.
DOWNLOAD_TIMEOUT = 300

#: Seconds a requirements install may take.
PIP_TIMEOUT = 1800

#: Characters a directory name may not carry on either platform.
_UNSAFE_IN_NAME = re.compile(r"[\\/:*?\"<>|\x00-\x1f]")

#: Windows device names, which cannot be used as a directory name.
_RESERVED_NAMES = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{n}" for n in range(1, 10)}
    | {f"LPT{n}" for n in range(1, 10)}
)


@dataclass
class InstallResult:
    """The outcome of an install.

    Attributes:
        ok: Whether the pack was placed on disk.
        directory: Where it was placed.
        files: Count of files written.
        reason: Why it did not install, empty on success.
        pip_ran: Whether a requirements install was attempted.
        pip_ok: Whether that install succeeded.
        pip_output: Captured pip output, trimmed.
        restart_required: Whether ComfyUI must restart to load the pack.
    """

    ok: bool
    directory: str = ""
    files: int = 0
    reason: str = ""
    pip_ran: bool = False
    pip_ok: bool = False
    pip_output: str = ""
    restart_required: bool = False

    def to_json(self) -> dict:
        """This result as a plain object."""
        return {
            "ok": self.ok,
            "directory": self.directory,
            "files": self.files,
            "reason": self.reason,
            "pip_ran": self.pip_ran,
            "pip_ok": self.pip_ok,
            "pip_output": self.pip_output,
            "restart_required": self.restart_required,
        }


def custom_nodes_dir() -> Path:
    """The directory packs install into.

    Returns:
        ComfyUI's first ``custom_nodes`` path.

    Raises:
        RuntimeError: Where the path cannot be resolved.
    """
    try:
        import folder_paths

        return Path(folder_paths.get_folder_paths("custom_nodes")[0])
    except Exception as error:
        raise RuntimeError(f"custom_nodes path could not be resolved: {error}") from error


def _safe_dir_name(node_id: str) -> str:
    """A single directory name from a pack id.

    Args:
        node_id: Registry identifier.

    Returns:
        The name with path separators, drive colons and leading dots replaced, or
        ``unnamed_pack`` where nothing usable is left.
    """
    cleaned = _UNSAFE_IN_NAME.sub("_", node_id.strip()).strip(". ")
    if not cleaned or cleaned.upper().split(".")[0] in _RESERVED_NAMES:
        return "unnamed_pack"
    return cleaned


def _remove_tree(target: Path) -> None:
    """Delete a directory tree, clearing the read-only bit on files that refuse.

    Args:
        target: Directory to remove.

    Raises:
        OSError: Where a file could not be removed even after its mode was cleared.
    """

    def retry(_function, path, _info):
        """Clear the read-only bit and remove the file again."""
        os.chmod(path, stat.S_IWRITE)
        os.unlink(path)

    if sys.version_info >= (3, 12):
        shutil.rmtree(target, onexc=retry)
    else:
        shutil.rmtree(target, onerror=retry)


def _norm(name: str) -> str:
    """Fold a pack id or directory name for comparison, ignoring case and ``-`` against ``_``.

    Args:
        name: A pack id, directory name or pyproject name.

    Returns:
        The folded form.
    """
    return name.strip().lower().replace("_", "-")


def _pyproject_name(directory: Path) -> str:
    """The ``name`` a pack declares in its pyproject, empty where absent."""
    pyproject = directory / "pyproject.toml"
    if not pyproject.is_file():
        return ""
    try:
        match = re.search(
            r'(?m)^\s*name\s*=\s*["\']([^"\']+)["\']',
            pyproject.read_text(encoding="utf-8", errors="replace"),
        )
        return match.group(1) if match else ""
    except OSError:
        return ""


def resolve_install_dir(node_id: str) -> Path | None:
    """The directory a pack is installed in, matched by exact name, then folded name, then
    the pyproject ``name``.

    Args:
        node_id: Registry identifier.

    Returns:
        The directory, or ``None`` where the pack is not installed.
    """
    try:
        base = custom_nodes_dir()
    except RuntimeError:
        return None

    exact = base / _safe_dir_name(node_id)
    if exact.is_dir():
        return exact

    want = _norm(node_id)
    for child in sorted(base.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        if _norm(child.name) == want or _norm(_pyproject_name(child)) == want:
            return child
    return None


def _download(url: str, target: Path) -> None:
    """Download a URL to a file.

    Args:
        url: Artifact URL.
        target: File to write.

    Raises:
        RuntimeError: On any download failure.
    """
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "open-manager"})
        with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT) as answer:
            if answer.status != 200:
                raise RuntimeError(f"download returned {answer.status}")
            with open(target, "wb") as handle:
                shutil.copyfileobj(answer, handle)
    except (OSError, ValueError) as error:
        raise RuntimeError(f"{type(error).__name__}: {error}") from error


def _extract(archive: Path, destination: Path, strip_top: bool = False) -> list[str]:
    """Extract a zip into a directory, refusing members that escape it.

    Args:
        archive: The zip file.
        destination: Directory to extract into.
        strip_top: Drop the single wrapping directory a GitHub archive adds.

    Returns:
        Relative paths written.

    Raises:
        RuntimeError: Where a member would be written outside the directory.
    """
    written: list[str] = []
    root = destination.resolve()
    with zipfile.ZipFile(archive) as zipped:
        for member in zipped.namelist():
            if member.endswith("/"):
                continue
            relative = member
            if strip_top:
                parts = member.split("/", 1)
                if len(parts) != 2:
                    continue
                relative = parts[1]
            target = (destination / relative).resolve()
            if not target.is_relative_to(root) or target == root:
                raise RuntimeError(f"archive member escapes the target: {member}")
            target.parent.mkdir(parents=True, exist_ok=True)
            with zipped.open(member) as source, open(target, "wb") as handle:
                shutil.copyfileobj(source, handle)
            written.append(relative)
    return written


_GITHUB_REPO = re.compile(r"github\.com[:/]+([^/]+)/([^/#?]+)", re.I)


def _archive_urls(owner: str, repo: str, ref: str) -> list[tuple[str, str]]:
    """Where a repository's zip lives, as ``(label, url)`` pairs to try in order.

    Args:
        owner: Repository owner.
        repo: Repository name.
        ref: A branch name or commit sha. Empty guesses at the usual branch names.

    Returns:
        One pair per candidate. A commit sha is fetched by sha; a branch by its head; an
        empty ref falls back to the branch names a default is commonly called.
    """
    base = f"https://codeload.github.com/{owner}/{repo}/zip"
    ref = (ref or "").strip()
    if not ref:
        return [(name, f"{base}/refs/heads/{name}") for name in ("main", "Main", "master")]
    # A full or abbreviated sha is fetched directly; anything else is treated as a branch,
    # with the bare form tried after in case it names a tag.
    if re.fullmatch(r"[0-9a-fA-F]{7,40}", ref):
        return [(ref, f"{base}/{ref}")]
    return [(ref, f"{base}/refs/heads/{ref}"), (ref, f"{base}/{ref}")]


def inspect_repo(repo_url: str, ref: str = "") -> dict:
    """Report what a GitHub pack would run and change, without installing it.

    Args:
        repo_url: The repository URL.

    Returns:
        ``{ok, findings, impact, reason}``. ``findings`` come from the artifact and
        dependency assessment; ``impact`` is the pip dry-run result.
    """
    from . import deps as deps_mod
    from . import impact as impact_mod
    from . import risk

    match = _GITHUB_REPO.search(repo_url or "")
    if not match:
        return {"ok": False, "reason": "not a GitHub repository", "findings": [], "impact": {}}
    owner, repo = match.group(1), match.group(2).replace(".git", "")

    tmp = Path(tempfile.mkdtemp(prefix="open_manager_inspect_"))
    archive = tmp / "repo.zip"
    try:
        for _, url in _archive_urls(owner, repo, ref):
            try:
                _download(url, archive)
                break
            except RuntimeError:
                continue
        else:
            reason = (
                f"could not download {repo} at {ref}" if ref
                else "could not download the repository archive"
            )
            return {"ok": False, "reason": reason, "findings": [], "impact": {}}

        assessment = risk.inspect_artifact(str(archive))
        requirements = _requirements_in_archive(archive)
        report = impact_mod.analyse(requirements) if requirements else impact_mod.Impact(checked=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    findings = [
        {"severity": f.severity, "title": f.title, "detail": f.detail,
         "evidence": list(f.evidence), "reference": f.reference}
        for f in (*risk.repository_findings(owner, repo), *assessment.findings)
    ]
    findings.extend(impact_mod.findings_from(report))
    return {
        "ok": True,
        "findings": findings,
        "impact": {
            "additive_only": report.is_additive,
            "failure": report.failure,
            "replacements": [
                {"name": r.name, "have": r.have, "want": r.want, "direction": r.direction, "core": r.is_core}
                for r in report.replacements
            ],
        },
        "dependencies": deps_mod.check(requirements),
        "reason": "",
    }


def _requirements_in_archive(archive: Path) -> list[str]:
    """Requirement lines declared anywhere in a zip archive."""
    lines: list[str] = []
    try:
        with zipfile.ZipFile(archive) as zipped:
            for name in zipped.namelist():
                if name.rsplit("/", 1)[-1] != "requirements.txt":
                    continue
                try:
                    body = zipped.read(name).decode("utf-8", errors="replace")
                except (OSError, KeyError):
                    continue
                lines.extend(
                    line.strip() for line in body.splitlines()
                    if line.strip() and not line.strip().startswith("#")
                )
    except (OSError, zipfile.BadZipFile):
        pass
    return lines


def install_repo(
    repo_url: str,
    python: str = "",
    with_deps: bool = True,
    ref: str = "",
    overwrite: bool = False,
) -> InstallResult:
    """Install a pack from its GitHub repository, for packs not on the registry.

    The repository archive is downloaded and extracted with its wrapping directory stripped.

    Args:
        repo_url: The repository URL.
        python: Interpreter requirements install into. Defaults to the running one.
        with_deps: Whether to install declared requirements.
        ref: A branch name or commit sha to install. Empty takes the default branch. The ref
            is recorded in the pack's marker, so the installed list shows what is in place.
        overwrite: Whether to replace an existing install rather than refusing. Installing a
            branch over a release is the ordinary case when testing a change.

    Returns:
        An :class:`InstallResult`.
    """
    match = _GITHUB_REPO.search(repo_url or "")
    if not match:
        return InstallResult(ok=False, reason="not a GitHub repository")
    owner, repo = match.group(1), match.group(2).replace(".git", "")

    try:
        base = custom_nodes_dir()
    except RuntimeError as error:
        return InstallResult(ok=False, reason=str(error))

    existing = resolve_install_dir(repo)
    if existing is not None:
        if not overwrite:
            return InstallResult(
                ok=False,
                directory=str(existing),
                reason=f"{repo} is already present. Remove it first to reinstall.",
            )
        removed = uninstall(existing.name)
        if not removed.ok:
            return removed

    tmp = Path(tempfile.mkdtemp(prefix="open_manager_"))
    archive = tmp / "repo.zip"
    target = base / _safe_dir_name(repo)
    try:
        landed = ""
        for label, url in _archive_urls(owner, repo, ref):
            try:
                _download(url, archive)
                landed = label
                break
            except RuntimeError:
                continue
        if not landed:
            reason = (
                f"could not download {repo} at {ref}" if ref
                else "could not download the repository archive"
            )
            return InstallResult(ok=False, reason=reason)
        target.mkdir(parents=True, exist_ok=True)
        try:
            written = _extract(archive, target, strip_top=True)
        except RuntimeError as error:
            _remove_tree(target)
            return InstallResult(ok=False, reason=str(error))
        (target / ".tracking").write_text("\n".join(written) + "\n", encoding="utf-8")
        (target / MARKER).write_text(
            json.dumps({"id": repo, "version": f"git:{landed}", "installed_at": time.time()}),
            encoding="utf-8",
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    result = InstallResult(ok=True, directory=str(target), files=len(written), restart_required=True)
    if with_deps and _requirements(target):
        result.pip_ran = True
        result.pip_ok, result.pip_output = _pip_install(target, python)
    return result


def _requirements(directory: Path) -> list[str]:
    """Requirement lines a pack declares at its root.

    Args:
        directory: The installed pack directory.

    Returns:
        Non-comment requirement lines, empty where none.
    """
    path = directory / "requirements.txt"
    if not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    return [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


#: Never installed from a pack's requirements: these carry the build a working ComfyUI was
#: set up with -- a CUDA wheel, a matching torchvision -- which a generic one would replace.
PIP_BLACKLIST = frozenset({"torch", "torchaudio", "torchsde", "torchvision"})

#: A requirement line's package name: what precedes any extras, specifier or marker.
_REQ_NAME = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)")


def overrides_path() -> Path:
    """The file holding the user's package substitutions."""
    try:
        import folder_paths

        base = Path(folder_paths.get_user_directory()) / "open_manager"
    except Exception:
        base = Path(__file__).resolve().parent.parent / "_cache"
    base.mkdir(parents=True, exist_ok=True)
    return base / "pip_overrides.json"


def pip_overrides() -> dict:
    """Package substitutions the user has configured.

    A mapping of package name to the requirement to install instead, applied before pip
    runs. The usual case is pointing a desktop build at a headless one, or the reverse.

    Returns:
        ``{name: replacement}``, empty where the file is absent or unreadable.
    """
    try:
        data = json.loads(overrides_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        str(key).strip().lower().replace("_", "-"): str(value).strip()
        for key, value in data.items()
        if str(key).strip() and str(value).strip()
    }


def _requirement_name(line: str) -> str:
    """The package a requirement line names, folded for comparison.

    Args:
        line: One line of a requirements file.

    Returns:
        The package name, empty for an option line, a URL, or anything unparseable.
    """
    text = line.strip()
    if not text or text.startswith(("-", "#")):
        return ""
    if "://" in text or text.startswith("."):
        return ""
    match = _REQ_NAME.match(text)
    return match.group(1).lower().replace("_", "-") if match else ""


def plan_requirements(lines: list[str]) -> tuple[list[str], list[str], list[str]]:
    """What will be handed to pip, and what changed on the way.

    Args:
        lines: Requirement lines as the pack wrote them.

    Returns:
        ``(to_install, held_back, substituted)``. ``held_back`` names requirements dropped
        because installing them would disturb the running environment; ``substituted``
        records each ``before -> after`` the user's overrides applied.
    """
    overrides = pip_overrides()
    keep: list[str] = []
    held: list[str] = []
    swapped: list[str] = []
    for line in lines:
        name = _requirement_name(line)
        if name and name in PIP_BLACKLIST:
            held.append(line.strip())
            continue
        if name and name in overrides:
            swapped.append(f"{line.strip()} -> {overrides[name]}")
            keep.append(overrides[name])
            continue
        keep.append(line)
    return keep, held, swapped


def install_requirements(directory: Path, python: str = "") -> tuple[bool, str]:
    """Install an already-placed pack's requirements.

    Separate from the install itself so the files can be looked at before anything is added
    to the environment.

    Args:
        directory: The installed pack directory.
        python: Interpreter to install into.

    Returns:
        ``(succeeded, output)``. Succeeds trivially where the pack declares none.
    """
    if not _requirements(directory):
        return True, "No requirements declared."
    return _pip_install(directory, python)


def _pip_install(directory: Path, python: str) -> tuple[bool, str]:
    """Install a pack's requirements, less anything held back.

    Args:
        directory: The installed pack directory.
        python: Interpreter to install into.

    Returns:
        ``(succeeded, output)``. The output names what was held back or substituted, so the
        result says what was done rather than only that it finished.
    """
    keep, held, swapped = plan_requirements(_requirements(directory))
    notes = []
    if held:
        notes.append("Held back to protect the running install: " + ", ".join(held))
    if swapped:
        notes.append("Substituted by your overrides: " + "; ".join(swapped))
    if not keep:
        return True, "\n".join(notes + ["Nothing left to install."]) if notes else "Nothing to install."

    # Written out rather than passed as arguments, so pip parses option lines itself.
    filtered = directory / ".open_manager_requirements.txt"
    try:
        filtered.write_text("\n".join(keep) + "\n", encoding="utf-8")
    except OSError as error:
        return False, f"requirements could not be prepared ({error})"

    command = [
        python or sys.executable, "-m", "pip", "install", "--no-input",
        "--disable-pip-version-check", "-r", str(filtered),
    ]
    try:
        finished = subprocess.run(
            command, capture_output=True, timeout=PIP_TIMEOUT, check=False,
            encoding="utf-8", errors="replace",
        )
    except (OSError, subprocess.SubprocessError) as error:
        return False, f"pip could not be run ({type(error).__name__}: {error})"
    try:
        filtered.unlink()
    except OSError:
        pass
    output = (finished.stdout or "") + (finished.stderr or "")
    tail = "\n".join(output.strip().splitlines()[-12:])
    if notes:
        tail = f"{chr(10).join(notes)}\n{tail}" if tail else chr(10).join(notes)
    return finished.returncode == 0, tail


def installed_version(node_id: str) -> str:
    """The version of a pack currently installed, if any.

    Args:
        node_id: Registry identifier.

    Returns:
        The installed version, ``present`` where a pack is installed but its version is
        unknown, or an empty string where it is not installed.
    """
    directory = resolve_install_dir(node_id)
    if directory is None:
        return ""
    marker = directory / MARKER
    if marker.is_file():
        try:
            recorded = json.loads(marker.read_text(encoding="utf-8")).get("version", "")
            if recorded:
                return str(recorded)
        except (OSError, ValueError):
            pass
    pyproject = directory / "pyproject.toml"
    if pyproject.is_file():
        try:
            match = re.search(
                r'(?m)^\s*version\s*=\s*["\']([^"\']+)["\']',
                pyproject.read_text(encoding="utf-8", errors="replace"),
            )
            if match:
                return match.group(1)
        except OSError:
            pass
    return "present"


def uninstall(node_id: str) -> InstallResult:
    """Remove an installed pack.

    Args:
        node_id: Registry identifier.

    Returns:
        An :class:`InstallResult`. ``ok`` is true where the pack was removed or was already
        absent.
    """
    try:
        root = custom_nodes_dir().resolve()
    except RuntimeError as error:
        return InstallResult(ok=False, reason=str(error))

    directory = resolve_install_dir(node_id)
    if directory is None:
        return InstallResult(ok=True, reason="was not installed")
    target = directory.resolve()
    if target == root or target.parent != root:
        return InstallResult(ok=False, reason="refusing to remove outside custom_nodes")
    try:
        _remove_tree(target)
    except OSError as error:
        return InstallResult(ok=False, directory=str(target), reason=f"removal failed: {error}")
    return InstallResult(ok=True, directory=str(target), restart_required=True)


def list_installed() -> list[dict]:
    """Every pack directory currently in custom_nodes.

    Returns:
        One entry per pack, each ``{id, version, dir}``. ``id`` is the pack's pyproject
        name where it declares one, otherwise the directory name. Disabled directories are
        skipped.
    """
    try:
        base = custom_nodes_dir()
    except RuntimeError:
        return []
    packs: list[dict] = []
    for child in sorted(base.iterdir()):
        if not child.is_dir() or child.name.startswith(".") or child.name == "__pycache__":
            continue
        pack_id = _pyproject_name(child) or child.name
        packs.append({
            "id": pack_id,
            "version": _version_in(child),
            "dir": child.name,
            "disabled": child.name.endswith(".disabled"),
        })
    return packs


def _version_in(directory: Path) -> str:
    """The version recorded for an installed directory, ``present`` where unknown."""
    marker = directory / MARKER
    if marker.is_file():
        try:
            recorded = json.loads(marker.read_text(encoding="utf-8")).get("version", "")
            if recorded:
                return str(recorded)
        except (OSError, ValueError):
            pass
    match = re.search(
        r'(?m)^\s*version\s*=\s*["\']([^"\']+)["\']',
        (_read_text(directory / "pyproject.toml")),
    )
    return match.group(1) if match else "present"


def _read_text(path: Path) -> str:
    """A file's text, empty where it cannot be read."""
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def install(
    node_id: str,
    version: str,
    download_url: str,
    python: str = "",
    with_deps: bool = True,
    overwrite: bool = False,
) -> InstallResult:
    """Download and place a pack, and install its requirements.

    Args:
        node_id: Registry identifier, used as the directory name.
        version: Version being installed, recorded in the pack's marker.
        download_url: Artifact URL from the registry.
        python: Interpreter requirements install into. Defaults to the running one.
        with_deps: Whether to install declared requirements.
        overwrite: Whether to replace an existing install rather than refusing.

    Returns:
        An :class:`InstallResult`. Never raises for an expected failure; the reason travels
        in the result.
    """
    if not download_url:
        return InstallResult(ok=False, reason="the registry gave no download URL")

    try:
        base = custom_nodes_dir()
    except RuntimeError as error:
        return InstallResult(ok=False, reason=str(error))

    # An existing install may sit in a differently-named directory. Find it before deciding
    # whether this is a fresh install or a replacement.
    existing = resolve_install_dir(node_id)
    if existing is not None:
        if not overwrite:
            return InstallResult(
                ok=False,
                directory=str(existing),
                reason=f"{existing.name} is already present. Remove it first to reinstall.",
            )
        removed = uninstall(node_id)
        if not removed.ok:
            return removed

    target = base / _safe_dir_name(node_id)

    tmp = Path(tempfile.mkdtemp(prefix="open_manager_"))
    archive = tmp / "node.zip"
    try:
        _download(download_url, archive)
        target.mkdir(parents=True, exist_ok=True)
        try:
            written = _extract(archive, target)
        except RuntimeError as error:
            _remove_tree(target)
            return InstallResult(ok=False, reason=str(error))
        (target / ".tracking").write_text("\n".join(written) + "\n", encoding="utf-8")
        (target / MARKER).write_text(
            json.dumps({"id": node_id, "version": version, "installed_at": time.time()}),
            encoding="utf-8",
        )
    except RuntimeError as error:
        return InstallResult(ok=False, reason=f"download failed: {error}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    result = InstallResult(
        ok=True, directory=str(target), files=len(written), restart_required=True
    )
    if with_deps and _requirements(target):
        result.pip_ran = True
        result.pip_ok, result.pip_output = _pip_install(target, python)
    return result
