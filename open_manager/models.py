"""What may be downloaded, from where, and to which directory.

A model file is not code, but the machinery around it is close enough to matter: a pickle
format executes on load, a URL decides who is being trusted, and a filename decides what
gets written where. So the policy is a whitelist on all three, kept here rather than spread
through the download code, and every decision is refused by default.

Two environment variables widen it, both read once at import:

``OPEN_MANAGER_MODEL_HOSTS``
    Hosts to allow in addition to Hugging Face and GitHub, comma separated.

``OPEN_MANAGER_MODEL_FORMATS``
    File extensions to allow *instead of* the safe set. Setting this is how a reader opts
    into pickle-backed formats, which run code when a model is loaded.

``OPEN_MANAGER_MEDIA_FORMATS``
    Image, video and audio extensions to allow *instead of* the built-in set.
"""

from __future__ import annotations

import hashlib
import os
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

__all__ = [
    "ALLOWED_HOSTS",
    "MEDIA_DIRECTORY",
    "MEDIA_FORMATS",
    "SAFE_FORMATS",
    "kind_of",
    "check",
    "folders",
    "destination",
    "installed_path",
    "NON_MODEL_FOLDERS",
    "normalise",
    "owned_path",
    "overwrite_target",
    "owner_of",
    "roots",
    "sha256_file",
]

#: Hosts a model may be fetched from without the reader widening anything. Hugging Face and
#: GitHub, plus the hosts each redirects its actual bytes to: a download that follows a
#: redirect off the allowed set is refused, so the redirect targets have to be named.
_DEFAULT_HOSTS = frozenset({
    "huggingface.co",
    "hf.co",
    "cdn-lfs.huggingface.co",
    "cdn-lfs-us-1.huggingface.co",
    "cdn-lfs-eu-1.huggingface.co",
    "transfer.xethub.hf.co",
    "github.com",
    "raw.githubusercontent.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
})


def _extra_hosts() -> frozenset[str]:
    """Hosts added by the environment, lowercased."""
    raw = os.environ.get("OPEN_MANAGER_MODEL_HOSTS", "")
    return frozenset(part.strip().lower() for part in raw.split(",") if part.strip())


#: Every host a download may touch, including any the environment added.
ALLOWED_HOSTS = _DEFAULT_HOSTS | _extra_hosts()

#: Formats that cannot execute code when a model is loaded. ``safetensors`` and ``gguf`` are
#: data; ``ckpt``, ``pt``, ``pth`` and ``bin`` are pickles, and loading one runs whatever it
#: was built to run. Those are absent deliberately.
_SAFE_FORMATS = frozenset({".safetensors", ".sft", ".gguf"})


def _formats() -> frozenset[str]:
    """Extensions allowed, from the environment where it names any."""
    raw = os.environ.get("OPEN_MANAGER_MODEL_FORMATS", "")
    chosen = {
        ("." + part.strip().lower().lstrip("."))
        for part in raw.split(",")
        if part.strip()
    }
    return frozenset(chosen) if chosen else _SAFE_FORMATS


#: Extensions a download may carry.
SAFE_FORMATS = _formats()

#: Image, video and audio containers. These are read as data by whatever loads them, so none
#: of them carries code the way a pickle does. ``svg`` is absent: it is a document that can
#: carry script, not an image format.
_MEDIA_FORMATS = frozenset({
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif",
    ".mp4", ".webm", ".mov", ".mkv", ".m4v", ".avi",
    ".mp3", ".wav", ".flac", ".ogg", ".oga", ".opus", ".m4a", ".aac",
})


def _media() -> frozenset[str]:
    """Media extensions allowed, from the environment where it names any."""
    raw = os.environ.get("OPEN_MANAGER_MEDIA_FORMATS", "")
    chosen = {
        ("." + part.strip().lower().lstrip("."))
        for part in raw.split(",")
        if part.strip()
    }
    return frozenset(chosen) if chosen else _MEDIA_FORMATS


#: Media extensions a download may carry.
MEDIA_FORMATS = _media()

#: Where media is written. ComfyUI reads the graph's images, video and audio from here, so a
#: file downloaded for a workflow to use belongs in it.
MEDIA_DIRECTORY = "input"


def _suffix(name: str) -> str:
    """A filename's extension, lowercased, empty where it has none."""
    tail = (name or "").split("?")[0].rsplit("/", 1)[-1]
    return ("." + tail.rsplit(".", 1)[-1].lower()) if "." in tail else ""


def kind_of(name: str) -> str:
    """What a filename is, by extension: ``model``, ``media``, or empty where neither.

    Args:
        name: A filename or the last part of a URL.

    Returns:
        ``"model"``, ``"media"`` or ``""``.
    """
    suffix = _suffix(name)
    if suffix in SAFE_FORMATS:
        return "model"
    if suffix in MEDIA_FORMATS:
        return "media"
    return ""


def _media_root() -> str:
    """ComfyUI's input directory, empty where it cannot be asked."""
    try:
        import folder_paths

        return str(folder_paths.get_input_directory())
    except Exception:
        return ""


#: A filename that is only a name: no separators, no parent, nothing a shell would read.
_SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$")

#: Windows device names, which cannot be used as a filename.
_RESERVED = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{n}" for n in range(1, 10)}
    | {f"LPT{n}" for n in range(1, 10)}
)


#: Hosts a Hugging Face token may be sent to. Deliberately not the CDN: a download is
#: redirected to a signed URL on a different host, and a credential that follows a redirect is
#: a credential handed to whoever controls the redirect.
TOKEN_HOSTS = frozenset({"huggingface.co", "hf.co"})


def wants_token(host: str) -> bool:
    """Whether a Hugging Face token belongs on a request to this host."""
    return (host or "").split(":")[0].strip().lower() in TOKEN_HOSTS


def host_allowed(host: str) -> bool:
    """Whether a host is on the allowed set, including its subdomains.

    Args:
        host: A URL's host, any case.

    Returns:
        True where the host is allowed outright or sits under an allowed domain.
    """
    folded = (host or "").strip().lower().split(":")[0]
    if not folded:
        return False
    return any(folded == allowed or folded.endswith("." + allowed) for allowed in ALLOWED_HOSTS)


def normalise(url: str) -> str:
    """A URL pointing at the bytes rather than at a page about them.

    Hugging Face serves a file two ways. ``/blob/`` is the page a person reads, and fetching
    it returns HTML; ``/resolve/`` is the file. Templates carry both, so the page form is
    rewritten rather than downloaded and found to be markup.

    Args:
        url: The URL as it was declared.

    Returns:
        The URL to actually fetch.
    """
    text = (url or "").strip()
    if not text:
        return ""
    parts = urlsplit(text)
    host = parts.netloc.lower().split(":")[0]
    if host in ("huggingface.co", "hf.co") or host.endswith(".huggingface.co"):
        path = re.sub(r"^(/[^/]+/[^/]+)/blob/", r"\1/resolve/", parts.path)
        if path != parts.path:
            return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))
    return text


def owner_of(url: str) -> str:
    """Who a URL belongs to, as ``host/account``, for the trust prompt.

    A model is published by an account on a host, and that pair is what a reader is being
    asked about. A URL with no account part answers with the host alone.

    Args:
        url: A model URL.

    Returns:
        ``huggingface.co/Comfy-Org``, or an empty string where nothing can be read.
    """
    parts = urlsplit((url or "").strip())
    host = parts.netloc.lower().split(":")[0]
    if not host:
        return ""
    segments = [segment for segment in parts.path.split("/") if segment]
    if host in ("github.com", "raw.githubusercontent.com") and segments:
        return f"{host}/{segments[0]}"
    if host.endswith("huggingface.co") or host == "hf.co":
        # A model lives at /account/repo; a dataset or space carries a kind first.
        if segments and segments[0] in ("datasets", "spaces", "models") and len(segments) > 1:
            return f"{host}/{segments[1]}"
        if segments:
            return f"{host}/{segments[0]}"
    return host


def folders() -> set[str]:
    """Directory names a download may be written to, empty where ComfyUI cannot be asked."""
    try:
        import folder_paths

        names = set(folder_paths.folder_names_and_paths.keys())
    except Exception:
        names = set()
    if _media_root():
        names.add(MEDIA_DIRECTORY)
    return names


def _folder_roots(directory: str) -> list[str]:
    """Every path ComfyUI registers for a folder, in its own order."""
    if directory == MEDIA_DIRECTORY:
        root = _media_root()
        return [root] if root else []
    try:
        import folder_paths

        return list(folder_paths.get_folder_paths(directory) or [])
    except Exception:
        return []


def roots(directory: str) -> list[dict]:
    """Where a model of this kind may be stored, for the reader to choose between.

    ComfyUI can be pointed at several drives through ``extra_model_paths.yaml``, which is how
    a large model ends up somewhere other than the install. Only the paths it registers are
    offered: a download is never written to a path the reader types.

    The order is ComfyUI's own, so a base marked ``is_default`` leads, and free space is
    reported because that is usually what decides.

    Args:
        directory: A ComfyUI model folder name, such as ``loras``.

    Returns:
        One ``{path, exists, writable, free, total}`` per registered path, first is default.
    """
    found = []
    for raw in _folder_roots(directory):
        try:
            path = Path(raw).resolve()
        except OSError:
            continue
        exists = path.is_dir()
        free = total = 0
        # Free space comes from the nearest parent that exists, so a folder ComfyUI has
        # registered but not yet created still reports the drive it would land on.
        probe = path
        while not probe.exists() and probe.parent != probe:
            probe = probe.parent
        try:
            usage = shutil.disk_usage(probe)
            free, total = usage.free, usage.total
        except OSError:
            pass
        found.append({
            "path": str(path),
            "exists": exists,
            "writable": os.access(probe, os.W_OK),
            "free": free,
            "total": total,
        })
    return found


def destination(directory: str, name: str, root: str = "") -> Path | None:
    """Where a model would be written, or ``None`` where it may not be.

    Args:
        directory: A ComfyUI model folder name, such as ``loras``.
        name: The file's name, without any path.
        root: One of the paths :func:`roots` reported, or empty for ComfyUI's default. A
            path that is not registered for this folder is refused rather than used.

    Returns:
        The full path, or ``None`` where the directory is unknown, the name is not a plain
        filename, the chosen root is not one ComfyUI registers, or the result would land
        outside the folder.
    """
    if not _SAFE_NAME.match(name or "") or name.upper().split(".")[0] in _RESERVED:
        return None
    registered = _folder_roots(directory)
    if not registered:
        return None
    chosen = Path(registered[0])
    if root:
        wanted = _fold_path(root)
        match = next((one for one in registered if _fold_path(one) == wanted), None)
        if match is None:
            return None
        chosen = Path(match)
    try:
        base = chosen.resolve()
    except OSError:
        return None
    target = (base / name).resolve()
    # The name is already checked, so this only catches a surprising resolution.
    if target.parent != base:
        return None
    return target


def _fold_path(value: str) -> str:
    """A path in a form two spellings of the same place agree on."""
    try:
        return str(Path(value).resolve()).rstrip("\\/").lower()
    except OSError:
        return str(value).strip().rstrip("\\/").lower()


def sha256_file(where: str, chunk: int = 1 << 20) -> str:
    """The sha256 of a file on disk, empty where it cannot be read.

    Args:
        where: Path to read.
        chunk: Bytes per read.

    Returns:
        A hex digest, or an empty string.
    """
    try:
        digest = hashlib.sha256()
        with open(where, "rb") as handle:
            while True:
                block = handle.read(chunk)
                if not block:
                    break
                digest.update(block)
        return digest.hexdigest()
    except OSError:
        return ""


#: Folders ComfyUI registers that hold no model the reader put there.
#:
#: ``custom_nodes`` is registered alongside the model folders and is not one: it holds a
#: pack's code, its bundled weights and its config files, and deleting from it breaks the
#: pack. ``input``, ``output`` and ``temp`` hold media with a different lifecycle.
NON_MODEL_FOLDERS = frozenset({"custom_nodes", "input", "output", "temp"})


def owned_path(where: str) -> Path | None:
    """The file at this path, where it lies inside a model folder ComfyUI registers.

    The gate for deleting something from the model library. A library file is not a download,
    so it cannot be checked the way :func:`overwrite_target` checks one; what makes it ours to
    act on is only that ComfyUI would look for models where it sits.

    Anywhere *under* a root counts, not merely the root itself: ComfyUI reads model folders
    recursively and a reader who files their loras under ``WAN/light2x`` has still put them in
    a model folder.

    Both the file and the roots are resolved before they are compared, so a symlink is judged
    by where it actually leads. One pointing out of the model folders is refused.

    Args:
        where: A path, as the panel reported it.

    Returns:
        The resolved path, or ``None`` where it is not a file in a model folder.
    """
    if not where:
        return None
    try:
        target = Path(where).resolve()
        if not target.is_file():
            return None
    except OSError:
        return None
    for directory in folders():
        if directory in NON_MODEL_FOLDERS:
            continue
        for root in _folder_roots(directory):
            try:
                if target.is_relative_to(Path(root).resolve()):
                    return target
            except (OSError, ValueError):
                continue
    return None


def overwrite_target(directory: str, name: str, existing: str) -> Path | None:
    """The path to rewrite when replacing a file already on disk.

    ComfyUI can be configured with several roots per model folder, and a file being replaced
    may sit under any of them. Writing to the first root instead would leave the original
    where it was and add a second copy, so the existing path is used -- once it is confirmed
    to be a file of that name sitting directly inside one of the folder's own roots.

    Args:
        directory: A ComfyUI model folder name.
        name: The file's name.
        existing: The path reported by :func:`installed_path`.

    Returns:
        The path to write, or ``None`` where it cannot be confirmed.
    """
    if not existing or not _SAFE_NAME.match(name or ""):
        return None
    try:
        target = Path(existing).resolve()
    except OSError:
        return None
    if target.name != name or not target.is_file():
        return None
    parent = _fold_path(target.parent)
    return target if any(_fold_path(one) == parent for one in _folder_roots(directory)) else None


def installed_path(directory: str, name: str) -> str:
    """Where this model already sits, empty where it is not downloaded.

    Args:
        directory: A ComfyUI model folder name.
        name: The file's name.

    Returns:
        The existing path, or an empty string.
    """
    if directory == MEDIA_DIRECTORY:
        target = destination(directory, name)
        return str(target) if target is not None and target.is_file() else ""
    try:
        import folder_paths

        found = folder_paths.get_full_path(directory, name)
        return str(found) if found else ""
    except Exception:
        target = destination(directory, name)
        return str(target) if target and target.is_file() else ""


def check(url: str, name: str, directory: str, root: str = "") -> tuple[bool, str]:
    """Whether this download is allowed, and why not where it is refused.

    Args:
        url: The model URL, already passed through :func:`normalise`.
        name: The filename to write.
        directory: The ComfyUI model folder to write it in.
        root: Which of the folder's registered paths to write to, or empty for the default.

    Returns:
        ``(allowed, reason)``. ``reason`` is empty when allowed and is written for the
        reader when it is not.
    """
    text = (url or "").strip()
    if not text:
        return False, "no URL given"
    parts = urlsplit(text)
    if parts.scheme != "https":
        return False, f"only https is downloaded, not {parts.scheme or 'a relative URL'}"
    if not host_allowed(parts.netloc):
        return False, (
            f"{parts.netloc.lower().split(':')[0]} is not an allowed host. Hugging Face and "
            "GitHub are allowed; set OPEN_MANAGER_MODEL_HOSTS to add others."
        )
    if directory not in folders():
        return False, f"{directory or 'no directory'} is not a ComfyUI folder"
    # Each folder takes what it is for: weights in the model folders, images, video and audio
    # in the media one. That keeps a folder's contents loadable by whatever reads it.
    media = directory == MEDIA_DIRECTORY
    permitted = MEDIA_FORMATS if media else SAFE_FORMATS
    advice = (
        "Set OPEN_MANAGER_MEDIA_FORMATS to choose your own list." if media else
        "Pickle-backed formats run code when loaded; set OPEN_MANAGER_MODEL_FORMATS to "
        "choose your own list."
    )
    # Both ends are checked. The URL says what is being fetched, and the name says what ends
    # up on disk; gating only the first lets a permitted URL be written under any extension
    # at all, which is the opposite of what an allowlist is for.
    for candidate, what in ((parts.path.rsplit("/", 1)[-1], "that URL"), (name, "that name")):
        suffix = _suffix(candidate)
        if suffix not in permitted:
            return False, (
                f"{suffix or f'{what}, which has no extension,'} is not an allowed "
                f"{'media ' if media else ''}format. Allowed: {', '.join(sorted(permitted))}. "
                f"{advice}"
            )
    if root and destination(directory, name, root) is None and destination(directory, name):
        return False, f"{root} is not one of the paths ComfyUI uses for {directory}"
    if destination(directory, name, root) is None:
        return False, f"{name or 'that name'} is not a plain filename"
    return True, ""
