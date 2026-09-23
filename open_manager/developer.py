"""Metadata a pack declares for Open Manager in a ``[tool.open_manager]`` pyproject table."""

from __future__ import annotations

try:
    import tomllib
except ModuleNotFoundError:
    try:
        import tomli as tomllib
    except ModuleNotFoundError:
        tomllib = None

__all__ = ["CAPABILITIES", "expand", "from_pyproject", "repository_from_pyproject",
           "resolve_incompatible", "scrub"]

_STR_FIELDS = ("source", "branch", "release_note")

_URL_FIELDS = ("docs", "funding")

_LIST_FIELDS = ("incompatible", "example_workflows", "themes", "gallery", "capabilities")

CAPABILITIES = {
    "filesystem": "Filesystem read and write",
    "network": "Network access",
    "subprocess": "Subprocess execution",
    "binaries": "External binaries",
    "environment": "Environment access",
    "dynamic_code": "Dynamic code execution",
    "packages": "Package and dependency changes",
    "models": "Model downloads",
    "credentials": "Credentials and API keys",
    "telemetry": "Telemetry or analytics",
    "compilation": "Native or GPU compilation",
    "hardware": "Direct hardware access",
}

_CAPABILITY_REFUSALS = 8
_CAPABILITY_CHARS = 40

_GALLERY_CAP = 24

_URL_SCHEMES = ("http://", "https://")

_LIST_CAP = 50

_STR_CAP = 600


def repository_from_pyproject(text: str) -> str:
    """The repository a pack declares under ``[project.urls]``.

    Args:
        text: pyproject.toml contents.

    Returns:
        The URL, or an empty string where the pack declares none.
    """
    if not text or tomllib is None:
        return ""
    try:
        data = tomllib.loads(text)
    except (ValueError, TypeError):
        return ""
    urls = (data.get("project") or {}).get("urls") or {}
    if not isinstance(urls, dict):
        return ""
    for name in ("Repository", "repository", "Source", "source", "Homepage", "homepage"):
        value = urls.get(name)
        if isinstance(value, str) and value.strip().startswith(("http://", "https://")):
            return value.strip()[:_STR_CAP]
    return ""


def from_pyproject(text: str) -> dict:
    """The ``[tool.open_manager]`` table from pyproject text, whitelisted and typed.

    Args:
        text: pyproject.toml contents.

    Returns:
        A dict holding only recognised fields, empty where the table or file is absent.
    """
    if not text or tomllib is None:
        return {}
    try:
        data = tomllib.loads(text)
    except (ValueError, TypeError):
        return {}
    section = ((data.get("tool") or {}).get("open_manager")) or {}
    if not isinstance(section, dict):
        return {}
    out: dict = {}
    for key in _STR_FIELDS:
        value = section.get(key)
        if isinstance(value, str) and value.strip():
            out[key] = value.strip()[:_STR_CAP]
    for key in _URL_FIELDS:
        value = section.get(key)
        if isinstance(value, str) and _link(value.strip()):
            out[key] = value.strip()[:_STR_CAP]
    for key in _LIST_FIELDS:
        value = section.get(key)
        if isinstance(value, list):
            items = [v.strip() for v in value if isinstance(v, str) and v.strip()]
            if key == "capabilities":
                asked = dict.fromkeys(v.lower().replace("-", "_") for v in items)
                items = [one for one in asked if one in CAPABILITIES]
                refused = [one[:_CAPABILITY_CHARS] for one in asked
                           if one not in CAPABILITIES][:_CAPABILITY_REFUSALS]
                if refused:
                    out["capabilities_unknown"] = refused
            if items:
                out[key] = items[:_LIST_CAP]
    urls = (data.get("project") or {}).get("urls") or {}
    if isinstance(urls, dict):
        for key, names in (("docs", ("Documentation", "documentation", "Docs", "docs")),
                           ("funding", ("Funding", "funding", "Sponsor", "sponsor"))):
            if out.get(key):
                continue
            for name in names:
                value = urls.get(name)
                if isinstance(value, str) and _link(value.strip()):
                    out[key] = value.strip()[:_STR_CAP]
                    break

    if "gallery" in out:
        gallery = [entry for entry in out["gallery"] if _gallery_entry(entry)]
        if gallery:
            out["gallery"] = gallery[:_GALLERY_CAP]
        else:
            out.pop("gallery")
    return out


def scrub(developer: dict) -> dict:
    """Drop link fields that are not safe to open.

    Args:
        developer: A developer table, from a cache or freshly parsed.

    Returns:
        The same table without any link field the panel may not open.
    """
    if not isinstance(developer, dict):
        return {}
    return {
        key: value
        for key, value in developer.items()
        if key not in _URL_FIELDS or (isinstance(value, str) and _link(value))
    }


def _link(value: str) -> bool:
    """Whether a value is a URL the panel may open.

    Args:
        value: The field's value.

    Returns:
        True where the value is safe to offer as a link.
    """
    text = (value or "").strip()
    if not text or len(text) > _STR_CAP:
        return False
    return text.lower().startswith(_URL_SCHEMES)


def _gallery_entry(entry: str) -> bool:
    """Whether a gallery entry is one the panel will show.

    Args:
        entry: One value from the ``gallery`` list.

    Returns:
        True where the entry is safe to offer.
    """
    text = (entry or "").strip()
    if not text or len(text) > 400:
        return False
    lowered = text.lower()
    if "://" in lowered or lowered.startswith(("javascript:", "data:", "vbscript:", "file:")):
        return lowered.startswith(_URL_SCHEMES)
    return not (".." in text or "\\" in text or text.startswith("/"))


_GLOBBABLE = {
    "example_workflows": (".json",),
    "themes": (".json",),
    "gallery": (".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif",
                ".mp4", ".webm", ".mov", ".m4v"),
}

_PREVIEW_SUFFIXES = (".webp", ".png", ".jpg", ".jpeg", ".gif")

_WORKFLOW_DIRS = ("workflows", "workflow", "examples", "example", "example_workflows")


def expand(table: dict, lister) -> dict:
    """Resolve pattern and directory entries against a pack's actual files.

    Args:
        table: A table from :func:`from_pyproject`.
        lister: Called with a directory path, returning the repository-relative paths of the
            files below it. Returns an empty list for anything it cannot read.

    Returns:
        The table with those fields resolved, capped as :func:`from_pyproject` caps them.
    """
    import fnmatch
    import posixpath

    out = dict(table or {})
    if not lister("."):
        return out
    for field, suffixes in _GLOBBABLE.items():
        entries = out.get(field)
        if not isinstance(entries, list):
            continue
        resolved: list[str] = []
        for entry in entries:
            text = (entry or "").strip()
            if not text or text.lower().startswith(_URL_SCHEMES):
                resolved.append(text)
                continue
            if any(ch in text for ch in "*?"):
                root = posixpath.dirname(text) or "."
                matched = [f for f in lister(root)
                           if fnmatch.fnmatch(f, text) and f.lower().endswith(suffixes)]
                resolved.extend(sorted(matched))
            elif text.lower().endswith(suffixes):
                resolved.append(text)
            else:
                found = [f for f in lister(text.rstrip("/")) if f.lower().endswith(suffixes)]
                resolved.extend(sorted(found))
        seen: set[str] = set()
        deduped = [f for f in resolved if not (f in seen or seen.add(f))]
        if deduped:
            out[field] = deduped[:_GALLERY_CAP if field == "gallery" else _LIST_CAP]
        else:
            out.pop(field, None)

    if not out.get("example_workflows"):
        for name in _WORKFLOW_DIRS:
            found = sorted(f for f in lister(name) if f.lower().endswith(".json"))
            if found:
                out["example_workflows"] = found[:_LIST_CAP]
                break

    workflows = out.get("example_workflows")
    if isinstance(workflows, list) and workflows:
        previews = {}
        for entry in workflows:
            folder = posixpath.dirname(entry)
            stem = posixpath.splitext(posixpath.basename(entry))[0].lower()
            for candidate in lister(folder or "."):
                if posixpath.dirname(candidate) != folder:
                    continue
                name = posixpath.basename(candidate).lower()
                base, ext = posixpath.splitext(name)
                if ext not in _PREVIEW_SUFFIXES:
                    continue
                if base == stem or base.startswith(f"{stem}-"):
                    previews[entry] = candidate
                    break
        if previews:
            out["example_workflow_previews"] = previews
    return out


def resolve_incompatible(specs) -> list[dict]:
    """Which declared incompatibilities the current environment matches.

    Args:
        specs: pip specifier strings the pack declares as incompatible.

    Returns:
        One entry per parseable spec: ``{spec, name, installed, matched}``. ``matched`` is
        true where an installed package satisfies the specifier.
    """
    try:
        from importlib.metadata import version
        from packaging.requirements import Requirement
    except Exception:
        return []
    out: list[dict] = []
    for raw in specs or []:
        raw = (raw or "").strip()
        if not raw:
            continue
        try:
            req = Requirement(raw)
        except Exception:
            continue
        try:
            installed = version(req.name)
        except Exception:
            installed = None
        matched = bool(installed) and (
            not req.specifier or req.specifier.contains(installed, prereleases=True)
        )
        out.append(
            {"spec": raw, "name": req.name, "installed": installed or "", "matched": matched}
        )
    return out
