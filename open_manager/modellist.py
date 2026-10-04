"""ComfyUI-Manager's list of models, and where each one would land here."""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import quote, urlsplit

import aiohttp

from . import downloads, keys, library, log, models, paths

__all__ = ["SOURCE", "listing", "place", "repo_files", "state", "sync"]

SOURCE = "https://raw.githubusercontent.com/Comfy-Org/ComfyUI-Manager/main/model-list.json"

REPO_TREE = "https://huggingface.co/api/models/{repo}/tree/main?recursive=true"

REPO_FILE = "https://huggingface.co/{repo}/resolve/main/{path}"

REPO_MAX_FILES = 500

SNAPSHOT = "<huggingface>"

WEIGHT_FORMATS = frozenset({
    ".safetensors", ".sft", ".gguf", ".ckpt", ".pt", ".pth", ".bin", ".onnx", ".pkl", ".npz",
    ".msgpack", ".h5",
})

ENABLE_FORMATS = "OPEN_MANAGER_MODEL_FORMATS"

ENABLE_HOSTS = "OPEN_MANAGER_MODEL_HOSTS"

ENABLE_REPOS = "OPEN_MANAGER_REPO_DOWNLOADS"

TIMEOUT = 30

MAX_BYTES = 16 << 20

MAX_MODELS = 5000

STALE_AFTER = 86400

TYPE_FOLDERS = {
    "checkpoints": "checkpoints",
    "checkpoint": "checkpoints",
    "unclip": "checkpoints",
    "text_encoders": "text_encoders",
    "clip": "text_encoders",
    "vae": "vae",
    "lora": "loras",
    "t2i-adapter": "controlnet",
    "t2i-style": "controlnet",
    "controlnet": "controlnet",
    "clip_vision": "clip_vision",
    "gligen": "gligen",
    "upscale": "upscale_models",
    "embedding": "embeddings",
    "embeddings": "embeddings",
    "unet": "diffusion_models",
    "diffusion_model": "diffusion_models",
}

_FIELDS = ("name", "type", "base", "save_path", "description", "reference", "filename", "url",
           "size")

_WARNING = re.compile(r"\[w/[^\]]*\]")

_TAG = re.compile(r"<[^<>]{0,200}>")

_SIZE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*([KMGT]?)i?B\s*$", re.I)

_REPO = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")

_DIGEST = re.compile(r"^[0-9a-f]{64}$")

_GOING = ("queued", "downloading", "pausing", "paused")

_state = {"syncing": False, "error": ""}

_lock = asyncio.Lock()

logger = log.get_logger("modellist")


def _path() -> Path:
    """The cached copy of the list."""
    return paths.store_file("model_list.json")


def _held() -> dict:
    """The cached list, empty where none has been fetched."""
    try:
        data = json.loads(_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) and isinstance(data.get("models"), list) else {}


def state(held: dict | None = None) -> dict:
    """Whether a copy is held, how old it is, and any fetch in progress.

    Args:
        held: The cached list where it has already been read.
    """
    held = _held() if held is None else held
    fetched = float(held.get("fetched_at") or 0)
    return {
        "cached": bool(held),
        "count": len(held.get("models") or []),
        "fetched_at": fetched,
        "stale": not held or time.time() - fetched > STALE_AFTER,
        "syncing": _state["syncing"],
        "error": _state["error"],
        "source": SOURCE,
    }


def _text(value, limit: int) -> str:
    """A field as plain text, cut to a length."""
    return str(value).strip()[:limit] if isinstance(value, (str, int, float)) else ""


def _clean(raw) -> dict | None:
    """One entry trimmed to the fields used, or ``None`` where it names no file."""
    if not isinstance(raw, dict):
        return None
    entry = {key: _text(raw.get(key), 1000 if key == "description" else 400) for key in _FIELDS}
    if not entry["url"] or not entry["filename"]:
        return None
    entry["description"] = " ".join(_TAG.sub("", _WARNING.sub("", entry["description"])).split())
    return entry


async def sync() -> dict:
    """Fetch the list again and keep a copy.

    Returns:
        ``{ok, count, reason}``.
    """
    async with _lock:
        _state.update(syncing=True, error="")
        try:
            body = bytearray()
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    SOURCE, headers={"User-Agent": "open-manager"},
                    timeout=aiohttp.ClientTimeout(total=TIMEOUT),
                ) as answer:
                    if answer.status != 200:
                        raise RuntimeError(f"GitHub answered {answer.status}")
                    async for chunk in answer.content.iter_chunked(1 << 16):
                        body.extend(chunk)
                        if len(body) > MAX_BYTES:
                            raise RuntimeError("the list is larger than any list this reads")
            data = json.loads(body.decode("utf-8"))
            raw = data.get("models") if isinstance(data, dict) else None
            if not isinstance(raw, list):
                raise RuntimeError("the list is not in the form ComfyUI-Manager publishes")
            found = [one for one in map(_clean, raw[:MAX_MODELS]) if one]
            if not found:
                raise RuntimeError("the list holds no models")
            _path().write_text(
                json.dumps({"fetched_at": time.time(), "source": SOURCE, "models": found}),
                encoding="utf-8")
            logger.info("model list fetched: %d models", len(found))
            return {"ok": True, "count": len(found), "reason": ""}
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError, RuntimeError,
                OSError) as error:
            reason = (str(error) if isinstance(error, RuntimeError)
                      else f"{type(error).__name__}: {error}")
            _state["error"] = reason
            logger.warning("model list not fetched (%s)", reason)
            return {"ok": False, "count": 0, "reason": reason}
        finally:
            _state["syncing"] = False


def _models_dir() -> str:
    """ComfyUI's models directory, empty where it cannot be asked."""
    try:
        import folder_paths

        return str(folder_paths.models_dir)
    except Exception:
        return ""


def _registered() -> dict[str, list[str]]:
    """Every model folder ComfyUI registers, with its paths folded for comparison."""
    return {
        name: [models._fold_path(root) for root in models._folder_roots(name)]
        for name in sorted(models.folders())
        if name not in models.NON_MODEL_FOLDERS
    }


def place(save_path: str, kind: str, registered: dict, base: str) -> tuple[str, str]:
    """The registered folder and the subfolder below it that an entry is saved into.

    Args:
        save_path: The entry's ``save_path``, relative to the models directory, or
            ``default`` to go by its type.
        kind: The entry's ``type``.
        registered: Folder names mapped to their folded paths, from :func:`_registered`.
        base: ComfyUI's models directory.

    Returns:
        ``(folder, subfolder)``, the folder empty where no registered folder holds the path.
    """
    text = (save_path or "").replace("\\", "/").strip().strip("/")
    if not text or text == "default":
        folder = TYPE_FOLDERS.get((kind or "").strip().lower(), "")
        return (folder, "") if folder in registered else ("", "")
    parts = text.split("/")
    if any(part in ("", ".", "..") for part in parts) or parts[0] == "custom_nodes":
        return "", ""
    if base:
        for cut in range(len(parts), 0, -1):
            where = models._fold_path(os.path.join(base, *parts[:cut]))
            owners = [name for name, roots in registered.items() if where in roots]
            if owners:
                folder = parts[cut - 1] if parts[cut - 1] in owners else owners[0]
                return folder, "/".join(parts[cut:])
    if parts[0] in registered:
        return parts[0], "/".join(parts[1:])
    return "", ""


def _size(text: str) -> tuple[int, str]:
    """A listed size in bytes, and as it reads."""
    match = _SIZE.match(text or "")
    if not match:
        return 0, ""
    unit = match.group(2).upper()
    return (int(float(match.group(1)) * 1000 ** "_KMGT".index(unit or "_")),
            f"{match.group(1)} {unit}B")


def _blocked(entry: dict, url: str, folder: str, subfolder: str) -> tuple[str, str]:
    """Why this entry cannot be downloaded here, and the variable that would allow it.

    Returns:
        ``(reason, variables)``, the reason empty where it can be downloaded, and the
        variables, space separated, empty where none would lift it.
    """
    if entry["filename"] == SNAPSHOT:
        repo = entry["url"].strip().strip("/")
        if not _REPO.match(repo):
            return "Not a Hugging Face repository", ""
        if not folder:
            return f"Folder not registered: {entry['save_path']}", ""
        if models.subfolder_parts("/".join(filter(None, (subfolder, repo.split("/")[1])))) is None:
            return f"Not a plain folder name: {entry['save_path']}", ""
        if not models.REPO_DOWNLOADS:
            return "Whole repository", ENABLE_REPOS
        return "", ""
    parts = urlsplit(url)
    last = parts.path.rsplit("/", 1)[-1]
    if parts.scheme != "https" or not parts.netloc:
        return "Not https", ""
    if not models._suffix(last):
        return "URL names no file", ""
    if not folder:
        return f"Folder not registered: {entry['save_path']}", ""
    reasons: list[str] = []
    variables: list[str] = []
    host = parts.netloc.lower().split(":")[0]
    if not models.host_allowed(host):
        reasons.append(f"Host not allowed: {host}")
        variables.append(ENABLE_HOSTS)
    formats = sorted({models._suffix(one) or "none" for one in (entry["filename"], last)}
                     - models.SAFE_FORMATS)
    if formats:
        reasons.append(f"Format not allowed: {', '.join(formats)}")
        variables.append(ENABLE_FORMATS)
    if reasons:
        return " · ".join(reasons), " ".join(variables)
    allowed, reason = models.check(url, entry["filename"], folder, "", subfolder)
    return ("", "") if allowed else (reason[:1].upper() + reason[1:], "")


def _refused(reason: str, variable: str = "") -> dict:
    """A repository that will not be fetched, and why."""
    return {"ok": False, "reason": reason, "enable": variable, "files": []}


async def repo_files(repo: str, folder: str, subfolder: str) -> dict:
    """The files a whole-repository entry fetches, each placed where it lands.

    Args:
        repo: A Hugging Face repository, ``owner/name``.
        folder: The registered folder it lands in.
        subfolder: The folders below that, before the repository's own name.

    Returns:
        ``{ok, reason, enable, files}``, each file ``{url, name, subfolder, size, hash}``.
    """
    repo = (repo or "").strip().strip("/")
    if not _REPO.match(repo):
        return _refused("Not a Hugging Face repository")
    if not models.REPO_DOWNLOADS:
        return _refused("Whole repository", ENABLE_REPOS)
    if folder not in models.folders() or folder in models.NON_MODEL_FOLDERS:
        return _refused(f"Folder not registered: {folder or 'none'}")

    headers = {"User-Agent": "open-manager"}
    token = keys.secret("huggingface")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(REPO_TREE.format(repo=repo), headers=headers,
                                   timeout=aiohttp.ClientTimeout(total=TIMEOUT)) as answer:
                if answer.status in (401, 403):
                    return _refused("Gated or private repository", "HF_TOKEN")
                if answer.status == 404:
                    return _refused("No such repository")
                if answer.status != 200:
                    return _refused(f"Hugging Face answered {answer.status}")
                if 'rel="next"' in answer.headers.get("Link", ""):
                    return _refused(f"More than {REPO_MAX_FILES} files")
                listed = await answer.json()
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
        return _refused(f"{type(error).__name__}: {error}")
    if not isinstance(listed, list):
        return _refused("Hugging Face answered with something other than a file list")

    base = [part for part in subfolder.split("/") if part] + [repo.split("/")[1]]
    files: list[dict] = []
    weights: dict[str, int] = {}
    refused: dict[str, set] = {}
    for item in listed:
        if not isinstance(item, dict) or item.get("type") != "file":
            continue
        path = str(item.get("path") or "")
        *dirs, leaf = path.split("/")
        where = "/".join(dirs)
        suffix = models._suffix(leaf)
        if suffix in WEIGHT_FORMATS and suffix not in models.SAFE_FORMATS:
            refused.setdefault(where, set()).add(suffix)
            continue
        if suffix not in models.SAFE_FORMATS and suffix not in models.REPO_FILE_FORMATS:
            continue
        if suffix in models.SAFE_FORMATS:
            weights[where] = weights.get(where, 0) + 1
        lands = "/".join(base + dirs)
        if models.destination(folder, leaf, "", lands) is None:
            return _refused(f"Not a plain file name: {path}")
        lfs = item.get("lfs") if isinstance(item.get("lfs"), dict) else {}
        digest = str(lfs.get("oid") or "").lower()
        files.append({
            "url": REPO_FILE.format(repo=repo, path="/".join(map(quote, path.split("/")))),
            "name": leaf,
            "subfolder": lands,
            "size": int(item.get("size") or 0),
            "hash": digest if _DIGEST.match(digest) else "",
        })
        if len(files) > REPO_MAX_FILES:
            return _refused(f"More than {REPO_MAX_FILES} files")

    stranded = sorted({suffix for where, found in refused.items() if not weights.get(where)
                       for suffix in found})
    if stranded:
        return _refused(f"Format not allowed: {', '.join(stranded)}", ENABLE_FORMATS)
    if not weights:
        return _refused("No model files in the repository")
    return {"ok": True, "reason": "", "enable": "", "files": files}


def _queued() -> dict[str, str]:
    """Downloads not yet finished, by URL, with what each is doing."""
    return {row.get("url", ""): row.get("status", "")
            for row in downloads.state()["downloads"]
            if row.get("status") in _GOING}


def listing() -> dict:
    """The cached list, each entry placed, checked, and matched against what is on disk.

    Returns:
        ``{models, cached, fetched_at, stale, syncing, error, source}``. Each model carries
        ``id, name, type, base, description, reference, filename, repo, url, owner, size,
        size_text, save_path, folder, subfolder, blocked, enable, on_disk, queued``. ``repo``
        names a whole Hugging Face repository, empty for a single file. ``enable`` names the
        variable that would lift ``blocked``, empty where none would.
    """
    held = _held()
    rows = held.get("models") or []
    registered = _registered()
    base = _models_dir()
    files = library.index().get("files") or []
    by_path = {library._key(one["path"]): one["path"] for one in files}
    by_name: dict[str, str] = {}
    for one in files:
        by_name.setdefault(one["name"].lower(), one["path"])
    listed_names: dict[str, int] = {}
    for raw in rows:
        if isinstance(raw, dict):
            folded = str(raw.get("filename") or "").lower()
            listed_names[folded] = listed_names.get(folded, 0) + 1
    queued = _queued()
    places: dict[tuple, tuple] = {}
    roots: dict[str, list] = {}

    out = []
    for position, raw in enumerate(rows):
        entry = _clean(raw)
        if entry is None:
            continue
        key = (entry["save_path"], entry["type"].lower())
        if key not in places:
            places[key] = place(entry["save_path"], entry["type"], registered, base)
        folder, subfolder = places[key]
        snapshot = entry["filename"] == SNAPSHOT
        repo = entry["url"].strip().strip("/") if snapshot else ""
        repo = repo if _REPO.match(repo) else ""
        url = f"https://huggingface.co/{repo}" if repo else models.normalise(entry["url"])
        filename = repo.split("/")[1] if repo else entry["filename"]
        blocked, enable = _blocked(entry, url, folder, subfolder)

        on_disk = ""
        sub = [part for part in subfolder.split("/") if part]
        if folder and folder not in roots:
            roots[folder] = models._folder_roots(folder)
        for root in roots.get(folder, []):
            target = os.path.join(root, *sub, filename)
            if repo:
                try:
                    with os.scandir(target) as inside:
                        found = target if any(inside) else ""
                except OSError:
                    found = ""
            else:
                found = by_path.get(library._key(target), "")
            if found:
                on_disk = found
                break
        folded = filename.lower()
        if not on_disk and not snapshot and listed_names.get(folded) == 1:
            on_disk = by_name.get(folded, "")

        status = queued.get(url, "")
        if repo and not status:
            status = next((value for where, value in queued.items()
                           if where.startswith(f"{url}/resolve/")), "")
        size, size_text = _size(entry["size"])
        reference = entry["reference"] if entry["reference"].startswith("https://") else ""
        out.append({
            "id": position,
            "name": entry["name"] or filename,
            "type": entry["type"],
            "base": entry["base"],
            "description": entry["description"],
            "reference": reference,
            "filename": filename,
            "repo": repo,
            "url": url,
            "owner": models.owner_of(url),
            "size": size,
            "size_text": size_text,
            "save_path": entry["save_path"],
            "folder": folder,
            "subfolder": subfolder,
            "blocked": blocked,
            "enable": enable,
            "on_disk": on_disk,
            "queued": status,
        })
    return {"models": out, **state(held)}
