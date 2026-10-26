"""Install a pack from the registry without the host manager."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

from . import log, paths, pending, piptool, stubs

logger = log.get_logger("installer")

__all__ = [
    "InstallResult",
    "custom_nodes_dir",
    "install",
    "install_repo",
    "installed_version",
    "list_installed",
    "uninstall",
]

MARKER = ".open_manager.json"

DOWNLOAD_TIMEOUT = 300

PIP_TIMEOUT = 1800

_UNSAFE_IN_NAME = re.compile(r"[\\/:*?\"<>|\x00-\x1f]")

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
        pip_requirements: The requirement lines pip was actually given, after anything held
            back or substituted.
        pip_errors: The lines of pip's output that say what went wrong.
        pip_held: The requirements the install policy refused, each with its reason.
        pip_locked: Files pip could not replace because the running ComfyUI holds them.
        pip_later: The id of an offer to run those requirements at the next start.
        installer: Which installer ran, ``pip`` or ``uv``.
        restart_required: Whether ComfyUI must restart to load the pack.
        optional_unseen: Optional groups the pack declares that the user has not been offered.
        optional_pending: Optional groups the user chose that the environment no longer
            satisfies.
    """

    ok: bool
    directory: str = ""
    files: int = 0
    reason: str = ""
    pip_ran: bool = False
    pip_ok: bool = False
    pip_output: str = ""
    pip_requirements: tuple[str, ...] = ()
    pip_errors: tuple[str, ...] = ()
    pip_held: tuple[str, ...] = ()
    pip_locked: tuple[str, ...] = ()
    pip_later: str = ""
    installer: str = ""
    restart_required: bool = False
    optional_unseen: tuple[str, ...] = ()
    optional_pending: tuple[str, ...] = ()

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
            "pip_requirements": list(self.pip_requirements),
            "pip_errors": list(self.pip_errors),
            "pip_held": list(self.pip_held),
            "pip_locked": list(self.pip_locked),
            "pip_later": self.pip_later,
            "installer": self.installer,
            "restart_required": self.restart_required,
            "optional_unseen": list(self.optional_unseen),
            "optional_pending": list(self.optional_pending),
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


ARCHIVE_KEEP = 3600

_kept_archives: dict = {}

_archive_lock = threading.Lock()


def _archive_folder() -> Path:
    folder = Path(tempfile.gettempdir()) / "open_manager_archives"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _prune_archives() -> None:
    """Forget and delete archives kept longer than :data:`ARCHIVE_KEEP`. Called under the lock."""
    now = time.time()
    for url, (path, at) in list(_kept_archives.items()):
        if now - at > ARCHIVE_KEEP or not path.is_file():
            _kept_archives.pop(url, None)
    kept = {path for path, _at in _kept_archives.values()}
    try:
        for one in _archive_folder().iterdir():
            if one not in kept and now - one.stat().st_mtime > ARCHIVE_KEEP:
                one.unlink()
    except OSError:
        pass


def fetch_archive(url: str) -> Path:
    """A registry archive on disk, downloaded once and kept for the install that follows.

    Args:
        url: Artifact URL.

    Returns:
        The archive's path.

    Raises:
        RuntimeError: Where it could not be downloaded.
    """
    with _archive_lock:
        _prune_archives()
        held = _kept_archives.get(url)
        if held and held[0].is_file():
            return held[0]
    path = _archive_folder() / (hashlib.sha256(url.encode("utf-8")).hexdigest()[:32] + ".zip")
    partial = path.with_name(path.name + ".part")
    _download(url, partial)
    os.replace(partial, path)
    with _archive_lock:
        _kept_archives[url] = (path, time.time())
    return path


def _take_archive(url: str) -> Path | None:
    """The archive :func:`fetch_archive` kept for a URL, handed over and forgotten."""
    with _archive_lock:
        held = _kept_archives.pop(url, None)
    if held and held[0].is_file() and time.time() - held[1] <= ARCHIVE_KEEP:
        return held[0]
    return None


def archive_requirements(url: str) -> list[str]:
    """The requirement lines installing a registry archive would hand to pip.

    Args:
        url: Artifact URL.

    Returns:
        The non-comment lines of the ``requirements.txt`` at the archive's root, as
        :func:`_requirements` reads them once the archive is placed.

    Raises:
        RuntimeError: Where the archive could not be downloaded or read.
    """
    path = fetch_archive(url)
    try:
        with zipfile.ZipFile(path) as zipped:
            name = next((one for one in zipped.namelist()
                         if one.replace("\\", "/").lstrip("./") == "requirements.txt"), "")
            body = zipped.read(name).decode("utf-8", errors="replace") if name else ""
    except (OSError, KeyError, zipfile.BadZipFile) as error:
        raise RuntimeError(f"the archive could not be read ({error})") from error
    return [line.strip() for line in body.splitlines()
            if line.strip() and not line.strip().startswith("#")]


def _download(url: str, target: Path) -> None:
    """Download a URL to a file.

    Args:
        url: Artifact URL.
        target: File to write.

    Raises:
        RuntimeError: On any download failure, or where the URL is not https.
    """
    if urllib.parse.urlparse(url or "").scheme.lower() != "https":
        raise RuntimeError(f"refusing to download from a non-https URL: {url[:120]!r}")
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
    if re.fullmatch(r"[0-9a-fA-F]{7,40}", ref):
        return [(ref, f"{base}/{ref}")]
    return [(ref, f"{base}/refs/heads/{ref}"), (ref, f"{base}/{ref}")]


def inspect_repo(repo_url: str, ref: str = "") -> dict:
    """Report what a GitHub pack would run and change, without installing it.

    Args:
        repo_url: The repository URL.
        ref: A branch name or commit sha. Empty tries ``main``, ``Main`` and ``master``.

    Returns:
        ``{ok, findings, impact, dependencies, reason}``. ``findings`` come from the
        artifact and dependency assessment; ``impact`` is the pip dry-run result.
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


def _report(name: str, result: InstallResult) -> InstallResult:
    """Say in ComfyUI's output how an install ended."""
    if not result.ok:
        logger.warning("[Open Manager] %s not installed: %s", name, result.reason)
    elif result.pip_ran and not result.pip_ok:
        logger.warning("[Open Manager] %s installed in %s; its requirements did not install",
                       name, result.directory)
    else:
        logger.info("[Open Manager] %s installed in %s", name, result.directory)
    return result


def install_repo(
    repo_url: str,
    python: str = "",
    with_deps: bool = True,
    ref: str = "",
    overwrite: bool = False,
    policy: str = "all",
) -> InstallResult:
    """Install a pack from its GitHub repository, for packs not on the registry.

    Args:
        repo_url: The repository URL.
        python: Interpreter requirements install into. Defaults to the running one.
        with_deps: Whether to install declared requirements.
        ref: A branch name or commit sha to install. Empty tries ``main``, ``Main`` and
            ``master``. The one fetched is recorded in the pack's marker.
        overwrite: Whether to replace an existing install rather than refusing.

    Returns:
        An :class:`InstallResult`.
    """
    logger.info("[Open Manager] installing %s%s", repo_url, f" at {ref}" if ref else "")
    return _report(repo_url, _install_repo(repo_url, python, with_deps, ref, overwrite, policy))


def _install_repo(
    repo_url: str,
    python: str,
    with_deps: bool,
    ref: str,
    overwrite: bool,
    policy: str,
) -> InstallResult:
    """The work of :func:`install_repo`."""
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
        logger.info("[Open Manager] %s: %d files from %s written to %s",
                    repo, len(written), landed, target)
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
        _ran = _pip_install(target, python, policy)
        result.pip_ok, result.pip_output = _ran["ok"], _ran["output"]
        result.pip_requirements = tuple(_ran["requirements"])
        result.pip_errors = tuple(_ran["errors"])
        result.installer = _ran.get("installer", "")
        result.pip_held = tuple(_ran.get("held", ()))
        result.pip_locked = tuple(_ran.get("locked", ()))
        result.pip_later = _ran.get("later", "")
    return _optional_after(result, target)


def install_optional(directory: Path, names, python: str = "", policy: str = "all") -> dict:
    """Install some of a pack's optional groups.

    Args:
        directory: The installed pack directory.
        names: Group names, as :func:`optional.groups` lists them.
        python: Interpreter to install into.
        policy: One of :data:`INSTALL_POLICIES`.

    Returns:
        :func:`_pip_install`'s answer, with ``groups`` naming the groups installed.
    """
    from . import optional

    lines, used = optional.lines_for(directory, names)
    if not lines:
        return {"ok": True, "output": "Nothing to install.", "requirements": [], "errors": [],
                "installer": piptool.kind(python), "groups": used}
    ran = _pip_install(directory, python, policy, lines, f"optional {', '.join(used)}")
    ran["groups"] = used
    return ran


def _optional_after(result: InstallResult, target: Path) -> InstallResult:
    """Name the optional groups not yet offered, and the chosen ones now short."""
    from . import optional

    try:
        found = optional.summary(target)
    except Exception as error:
        logger.warning("[Open Manager] %s: optional requirements unreadable: %s",
                       target.name, error)
        return result
    if found:
        result.optional_unseen = tuple(optional.unseen(target, found))
        result.optional_pending = tuple(optional.pending(target, found))
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


PIP_BLACKLIST = frozenset({"torch", "torchaudio", "torchsde", "torchvision"})

PIP_REDIRECTS = {
    "-i": "changes where every package in this install comes from",
    "--index-url": "changes where every package in this install comes from",
    "--extra-index-url": "adds another source for every package in this install",
    "--no-index": "stops pip using the package index at all",
    "-f": "adds another source for every package in this install",
    "--find-links": "adds another source for every package in this install",
    "--trusted-host": "waives certificate checking for a host",
    "-r": "reads requirements from another file",
    "--requirement": "reads requirements from another file",
    "-c": "reads version constraints from another file",
    "--constraint": "reads version constraints from another file",
    "--no-binary": "forces a source build, which runs the package's own setup code",
    "--global-option": "passes arguments to the package's own build",
    "--config-settings": "passes arguments to the package's own build",
}

_PIP_TROUBLE = (
    "ERROR:",
    "error:",
    "No matching distribution",
    "Could not find a version",
    "The conflict is caused by",
    "Cannot install",
    "is incompatible",
    "Failed building",
    "subprocess-exited-with-error",
    "metadata-generation-failed",
    "requires Python",
)

_PIP_TAIL = 40


def pip_trouble(output: str) -> tuple[str, ...]:
    """The lines of pip output that say what went wrong.

    Args:
        output: Everything pip printed.

    Returns:
        The lines worth reading first, in the order pip printed them, without repeats,
        followed by the exception that ended a traceback pip printed.
    """
    seen: dict[str, None] = {}
    lines = (output or "").splitlines()
    for line in lines:
        text = line.strip()
        if text and any(mark in text for mark in _PIP_TROUBLE):
            seen.setdefault(text, None)
    starts = [at for at, line in enumerate(lines)
              if line.strip().startswith("Traceback (most recent call last):")]
    if starts:
        for line in lines[starts[-1] + 1:]:
            if line.strip() and not line[:1].isspace():
                seen.setdefault(line.strip(), None)
                break
    return tuple(seen)


STUB_RETRIES = 3


def _stub_for(keep: list[str], output: str) -> tuple[str, str, str]:
    """The wheel stub pip stopped on, and the index it names.

    Args:
        keep: The requirement lines handed to pip.
        output: What pip printed.

    Returns:
        ``(requirement, index, refused)`` as :func:`stubs.index_for` reads the requirement
        pip was collecting last.
    """
    collected = stubs.last_collected(output)
    wanted = _requirement_name(collected)
    line = next((one for one in keep if wanted and _requirement_name(one) == wanted), collected)
    if not line:
        return "", "", ""
    index, named = stubs.index_for(line)
    return line.strip(), index, named


_REQ_NAME = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)")


def overrides_path() -> Path:
    """The file holding the user's package substitutions."""
    return paths.store_file("pip_overrides.json")


def pip_overrides() -> dict:
    """Package substitutions the user has configured.

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


def requirement_redirect(line: str) -> tuple[str, str]:
    """The source-changing option a requirement line carries, if it carries one.

    Args:
        line: One line of a requirements file.

    Returns:
        ``(option, why)``, both empty where the line changes nothing about where packages
        come from.
    """
    text = line.strip()
    if not text.startswith("-"):
        return "", ""
    head = text.split("=", 1)[0].split()[0]
    if head in PIP_REDIRECTS:
        return head, PIP_REDIRECTS[head]
    for option in ("-i", "-f", "-r", "-c"):
        if head.startswith(option) and len(head) > len(option):
            return option, PIP_REDIRECTS[option]
    return "", ""


INSTALL_POLICIES = ("all", "new", "upgrade", "downgrade")

POLICY_DEFAULT = "new"


def install_policy(name: str) -> str:
    """Fold a requested policy to one this understands.

    Args:
        name: Policy as asked for.

    Returns:
        A member of :data:`INSTALL_POLICIES`, :data:`POLICY_DEFAULT` where unrecognised.
    """
    folded = str(name or "").strip().lower()
    return folded if folded in INSTALL_POLICIES else POLICY_DEFAULT


def _policy_holds(policy: str, direction: str) -> bool:
    """Whether a policy refuses a requirement that would replace what is installed."""
    if policy == "new":
        return True
    if policy == "upgrade":
        return direction == "downgrade"
    if policy == "downgrade":
        return direction == "upgrade"
    return False


def _replacements(lines: list[str], python: str) -> dict[str, tuple[str, str]]:
    """Which requirement lines would replace a package already installed.

    Args:
        lines: Requirement lines as the pack wrote them.
        python: Interpreter the install targets.

    Returns:
        ``{raw_line: (direction, installed_version)}`` for conflicting lines only.
    """
    from . import deps

    try:
        checked = deps.check(lines)
    except Exception:
        return {}
    elsewhere = {}
    if python and os.path.normcase(python) != os.path.normcase(sys.executable):
        from . import impact

        elsewhere = impact.installed_versions(python)
    found: dict[str, tuple[str, str]] = {}
    for entry in checked:
        raw = entry.get("raw", "")
        have = entry.get("installed", "")
        if elsewhere:
            have = elsewhere.get(_norm(entry.get("name", "")), "")
            if not have:
                continue
            if not entry.get("spec"):
                continue
            way = deps.direction(entry.get("spec", ""), have)
            if way == "change":
                continue
        elif entry.get("status") != "conflict":
            continue
        else:
            way = entry.get("direction") or "change"
        found[raw] = (way, have)
    return found


def _fold_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", str(name or "").strip().lower())


def _who(users: list[str]) -> str:
    names = sorted(set(users), key=lambda one: (one != "ComfyUI", one.lower()))
    if len(names) <= 2:
        return " and ".join(names)
    return f"{names[0]}, {names[1]} and {len(names) - 2} more"


def _users(python: str, skip: Path | None) -> dict | None:
    """What in this install asks for each package.

    Args:
        python: Interpreter the install targets.
        skip: The pack being installed, whose own requirements do not count.

    Returns:
        ``{folded name: [user, ...]}`` naming ComfyUI, installed distributions and other
        packs, or None where the target is another interpreter, whose packages are not read.
    """
    if python and os.path.normcase(python) != os.path.normcase(sys.executable):
        return None
    from . import deps

    found: dict = {}

    def add(name: str, user: str) -> None:
        key = _fold_name(name)
        if key and user not in found.setdefault(key, []):
            found[key].append(user)

    for name in deps.comfyui_core():
        add(name, "ComfyUI")
    try:
        from importlib.metadata import distributions
        from packaging.requirements import Requirement

        for dist in distributions():
            owner = str(dist.metadata.get("Name") or "")
            for raw in dist.requires or ():
                try:
                    wanted = Requirement(raw)
                except Exception:
                    continue
                if wanted.marker is not None:
                    try:
                        if not wanted.marker.evaluate({"extra": ""}):
                            continue
                    except Exception:
                        continue
                if owner and _fold_name(owner) != _fold_name(wanted.name):
                    add(wanted.name, owner)
    except Exception:
        return None
    try:
        own = skip.resolve() if skip is not None else None
        packs = sorted(custom_nodes_dir().iterdir())
    except (OSError, RuntimeError):
        packs = []
    for child in packs:
        if not child.is_dir() or child.name.startswith("."):
            continue
        try:
            if own is not None and child.resolve() == own:
                continue
        except OSError:
            continue
        label = child.name[: -len(".disabled")] if child.name.endswith(".disabled") else child.name
        for line in _requirements(child):
            name = _requirement_name(line)
            if name:
                add(name, label)
    return found


def plan_requirements(
    lines: list[str],
    policy: str = "all",
    python: str = "",
    skip: Path | None = None,
) -> tuple[list[str], list[str], list[str], list[str]]:
    """What will be handed to pip, and what changed on the way.

    Args:
        lines: Requirement lines as the pack wrote them.
        policy: One of :data:`INSTALL_POLICIES`. ``all`` installs as the pack asks;
            ``new`` refuses every requirement that would replace an installed package
            that ComfyUI, an installed distribution or another pack uses; ``upgrade`` and
            ``downgrade`` refuse the opposite direction. A package nothing else uses changes
            as the pack asks under every policy.
        python: Interpreter the install targets, for reading what is installed.
        skip: The pack being installed, whose own requirements do not make a package used.

    Returns:
        ``(to_install, held_back, substituted, redirects)``. ``held_back`` names the
        :data:`PIP_BLACKLIST` requirements dropped and any the policy refused, each with
        its reason; ``redirects`` names the :data:`PIP_REDIRECTS` option lines dropped,
        each as ``line (why)``; ``substituted`` records each ``before -> after`` the
        user's overrides applied.
    """
    overrides = pip_overrides()
    chosen = install_policy(policy) if policy else "all"
    replacing = _replacements(lines, python) if chosen != "all" else {}
    users: dict | None | bool = False
    keep: list[str] = []
    held: list[str] = []
    swapped: list[str] = []
    redirects: list[str] = []
    for line in lines:
        option, why = requirement_redirect(line)
        if option:
            redirects.append(f"{line.strip()} ({why})")
            continue
        name = _requirement_name(line)
        if name and name in PIP_BLACKLIST:
            held.append(line.strip())
            continue
        if name and name in overrides:
            swapped.append(f"{line.strip()} -> {overrides[name]}")
            keep.append(overrides[name])
            continue
        moved = replacing.get(line.strip()) or replacing.get(line)
        if moved and _policy_holds(chosen, moved[0]):
            if users is False:
                users = _users(python, skip)
            who = None if users is None else users.get(_fold_name(name), [])
            if who is None or who:
                way = {"downgrade": "would downgrade", "upgrade": "would upgrade"}.get(
                    moved[0], "would replace"
                )
                using = f", which {_who(who)} {'uses' if len(who) == 1 else 'use'}" if who else ""
                held.append(f"{line.strip()} ({way} {name or 'it'} {moved[1]}{using})")
                continue
        keep.append(line)
    return keep, held, swapped, redirects


def install_requirements(directory: Path, python: str = "", policy: str = "all") -> tuple[bool, str]:
    """Install an already-placed pack's requirements.

    Args:
        directory: The installed pack directory.
        python: Interpreter to install into.

    Returns:
        ``(succeeded, output)``. Succeeds trivially where the pack declares none.
    """
    if not _requirements(directory):
        return True, "No requirements declared."
    ran = _pip_install(directory, python, policy)
    return ran["ok"], ran["output"]


def _pip_install(directory: Path, python: str, policy: str = "all", lines=None,
                 label: str = "requirements") -> dict:
    """Install a pack's requirements, less anything held back.

    Args:
        directory: The installed pack directory.
        python: Interpreter to install into.
        policy: One of :data:`INSTALL_POLICIES`.
        lines: Requirement lines to install in place of the pack's ``requirements.txt``.
        label: What the lines are, as the log names them.

    Returns:
        ``{ok, output, requirements, errors, installer, held}``. ``output`` names what was
        held back or substituted. ``errors`` is what pip said went wrong. ``installer`` is
        ``pip``, ``uv`` or ``none``. ``held`` names the requirements the policy refused, each
        with its reason.
    """
    keep, held, swapped, redirects = plan_requirements(
        _requirements(directory) if lines is None else list(lines), policy, python, directory
    )
    refused = [line for line in held if " (would " in line]
    notes = []
    if held:
        notes.append("Held back to protect the running install: " + ", ".join(held))
    if redirects:
        notes.append(
            "Options held back: "
            + "; ".join(redirects)
        )
    if swapped:
        notes.append("Substituted by your overrides: " + "; ".join(swapped))
    name = directory.name
    for note in notes:
        logger.info("[Open Manager] %s: %s", name, note)
    if not keep:
        said = "\n".join(notes + ["Nothing left to install."]) if notes else "Nothing to install."
        logger.info("[Open Manager] %s: no %s to install", name, label)
        return {"ok": True, "output": said, "requirements": [], "errors": [],
                "installer": piptool.kind(python), "held": refused}

    filtered = directory / ".open_manager_requirements.txt"
    try:
        filtered.write_text("\n".join(keep) + "\n", encoding="utf-8")
    except OSError as error:
        return {"ok": False, "output": f"requirements could not be prepared ({error})",
                "requirements": keep, "errors": [f"requirements could not be prepared ({error})"],
                "installer": piptool.kind(python), "held": refused}

    logger.info("[Open Manager] %s: installing %d requirement%s with %s: %s", name, len(keep),
                "" if len(keep) == 1 else "s", piptool.kind(python) or "pip", ", ".join(keep))
    indexes: list[str] = []
    for _attempt in range(STUB_RETRIES + 1):
        extra = [arg for index in indexes for arg in ("--extra-index-url", index)]
        try:
            finished = piptool.run(
                python, "install", ["--no-input", *extra, "-r", str(filtered)],
                timeout=PIP_TIMEOUT,
                echo=lambda line: logger.info("[Open Manager] %s: %s", name, line),
            )
        except (OSError, subprocess.SubprocessError) as error:
            said = f"the installer could not be run ({type(error).__name__}: {error})"
            logger.warning("[Open Manager] %s: %s", name, said)
            return {"ok": False, "output": said, "requirements": keep, "errors": [said],
                    "installer": piptool.kind(python), "held": refused}
        if finished is None:
            said = piptool.describe(python)
            logger.warning("[Open Manager] %s: %s", name, said)
            return {"ok": False, "output": said, "requirements": keep, "errors": [said],
                    "installer": "none", "held": refused}
        attempt_output = (finished.stdout or "") + (finished.stderr or "")
        if finished.returncode == 0 or not stubs.failed_on_stub(attempt_output):
            break
        which, index, named = _stub_for(keep, attempt_output)
        if named:
            notes.append(f"{which} is a wheel stub naming {named}, which is not an index "
                         "Open Manager installs from")
        if not index or index in indexes:
            break
        indexes.append(index)
        note = f"{which} installs from {index}, the index its PyPI release names"
        notes.append(note)
        logger.info("[Open Manager] %s: %s; trying again", name, note)
    if finished.returncode == 0:
        logger.info("[Open Manager] %s: %s installed", name, label)
    else:
        logger.warning("[Open Manager] %s: %s did not install (exit code %d)",
                       name, label, finished.returncode)
    try:
        filtered.unlink()
    except OSError:
        pass
    output = (finished.stdout or "") + (finished.stderr or "")
    tail = "\n".join(output.strip().splitlines()[-_PIP_TAIL:])
    if notes:
        tail = f"{chr(10).join(notes)}\n{tail}" if tail else chr(10).join(notes)
    answer = {
        "ok": finished.returncode == 0,
        "output": tail,
        "requirements": keep,
        "errors": list(pip_trouble(output)),
        "installer": piptool.kind(python),
        "held": refused,
        "locked": [],
        "later": "",
    }
    if finished.returncode != 0:
        locked = pending.locked_files(output)
        if locked:
            answer["locked"] = locked
            answer["later"] = pending.offer(directory.name, keep, indexes, label, locked)
    return answer


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
        logger.warning("[Open Manager] %s not removed: it is outside custom_nodes", node_id)
        return InstallResult(ok=False, reason="refusing to remove outside custom_nodes")
    try:
        _remove_tree(target)
    except OSError as error:
        logger.warning("[Open Manager] %s not removed: %s", target.name, error)
        return InstallResult(ok=False, directory=str(target), reason=f"removal failed: {error}")
    logger.info("[Open Manager] removed %s", target)
    return InstallResult(ok=True, directory=str(target), restart_required=True)


def list_installed() -> list[dict]:
    """Every pack directory currently in custom_nodes.

    Returns:
        One entry per pack, each ``{id, version, dir, disabled, from_git, installed_at}``.
        ``id`` is the pack's pyproject name where it declares one, otherwise the directory
        name. ``from_git`` marks a working copy: a clone, or one this installed from a
        repository. ``installed_at`` is a POSIX timestamp, 0 where none could be worked out.
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
        version = _version_in(child)
        packs.append({
            "id": pack_id,
            "version": version,
            "dir": child.name,
            "disabled": child.name.endswith(".disabled"),
            "from_git": (child / ".git").exists() or version.startswith("git:"),
            "installed_at": _installed_at(child),
        })
    return packs


def _installed_at(directory: Path) -> float:
    """When a pack arrived, as well as can be told from what is on disk.

    Args:
        directory: The pack directory.

    Returns:
        A POSIX timestamp, or 0.0 where nothing could be read.
    """
    marker = directory / MARKER
    if marker.is_file():
        try:
            recorded = json.loads(marker.read_text(encoding="utf-8")).get("installed_at")
            if isinstance(recorded, (int, float)) and recorded > 0:
                return float(recorded)
        except (OSError, ValueError):
            pass
    try:
        info = directory.stat()
    except OSError:
        return 0.0
    for name in ("st_birthtime", "st_ctime"):
        value = getattr(info, name, None)
        if isinstance(value, (int, float)) and value > 0:
            return float(value)
    return float(getattr(info, "st_mtime", 0.0) or 0.0)


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
    policy: str = "all",
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
    logger.info("[Open Manager] installing %s %s", node_id, version)
    return _report(node_id, _install(node_id, version, download_url, python, with_deps,
                                     overwrite, policy))


def _install(
    node_id: str,
    version: str,
    download_url: str,
    python: str,
    with_deps: bool,
    overwrite: bool,
    policy: str,
) -> InstallResult:
    """The work of :func:`install`."""
    if not download_url:
        return InstallResult(ok=False, reason="the registry gave no download URL")

    try:
        base = custom_nodes_dir()
    except RuntimeError as error:
        return InstallResult(ok=False, reason=str(error))

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
        kept = _take_archive(download_url)
        if kept is not None:
            logger.info("[Open Manager] %s: using %s, downloaded for the review", node_id,
                        download_url)
            shutil.move(str(kept), str(archive))
        else:
            logger.info("[Open Manager] %s: downloading %s", node_id, download_url)
            _download(download_url, archive)
        target.mkdir(parents=True, exist_ok=True)
        try:
            written = _extract(archive, target)
        except RuntimeError as error:
            _remove_tree(target)
            return InstallResult(ok=False, reason=str(error))
        logger.info("[Open Manager] %s: %d files written to %s", node_id, len(written), target)
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
        _ran = _pip_install(target, python, policy)
        result.pip_ok, result.pip_output = _ran["ok"], _ran["output"]
        result.pip_requirements = tuple(_ran["requirements"])
        result.pip_errors = tuple(_ran["errors"])
        result.installer = _ran.get("installer", "")
        result.pip_held = tuple(_ran.get("held", ()))
        result.pip_locked = tuple(_ran.get("locked", ()))
        result.pip_later = _ran.get("later", "")
    return _optional_after(result, target)
