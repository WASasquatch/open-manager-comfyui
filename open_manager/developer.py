"""Metadata a pack declares for Open Manager in a ``[tool.open_manager]`` pyproject table.

Read from the pyproject the metadata scrape fetches, and from an installed pack's own
pyproject. Every field is optional and whitelisted.

    [tool.open_manager]
    incompatible = ["numpy>=2.0"]
    source = "github"
    branch = "main"
    docs = "https://..."
    funding = "https://..."
    release_note = "3.1.0 is flagged for an optional subprocess call."
    example_workflows = ["workflows/demo.json"]
    themes = ["themes/ember-pro.json"]
    gallery = ["docs/before.png", "https://example.com/after.webp"]
"""

from __future__ import annotations

# tomllib is stdlib from 3.11. On 3.10 the same parser is available as tomli, and where
# neither is present the table is simply not read: a pack that declares one loses those
# extras, and everything else in Open Manager carries on.
try:
    import tomllib
except ModuleNotFoundError:
    try:
        import tomli as tomllib
    except ModuleNotFoundError:
        tomllib = None

__all__ = ["from_pyproject", "resolve_incompatible", "scrub"]

#: String fields kept from the table and shown as text.
_STR_FIELDS = ("source", "branch", "release_note")

#: String fields the panel turns into links. These are scheme-checked like gallery entries:
#: the panel opens them, so ``javascript:`` here is script in ComfyUI's own origin.
_URL_FIELDS = ("docs", "funding")

#: List-of-string fields kept from the table.
_LIST_FIELDS = ("incompatible", "example_workflows", "themes", "gallery")

#: Most gallery entries kept. Lower than the general cap: a gallery is a showcase, and every
#: entry is an image the panel will fetch.
_GALLERY_CAP = 24

#: Schemes a gallery entry may name. Anything else is a path inside the repository, and
#: anything that is neither is dropped, so ``javascript:`` and ``data:`` never reach an
#: ``img`` tag.
_URL_SCHEMES = ("http://", "https://")

#: Most list entries kept from one field.
_LIST_CAP = 50

#: Longest string kept from one field.
_STR_CAP = 600


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
        # Both parsers raise a ValueError subclass for malformed input.
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
            if items:
                out[key] = items[:_LIST_CAP]
    if "gallery" in out:
        gallery = [entry for entry in out["gallery"] if _gallery_entry(entry)]
        if gallery:
            out["gallery"] = gallery[:_GALLERY_CAP]
        else:
            out.pop("gallery")
    return out


def scrub(developer: dict) -> dict:
    """Drop link fields that are not safe to open.

    Applied to metadata read back from the cache, which was written before the check in
    :func:`from_pyproject` existed and is kept until a pack's versions change. Without this
    a value cached then is served indefinitely.

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

    Only absolute ``http`` and ``https`` are allowed. ``javascript:`` passed to the panel's
    link buttons runs in ComfyUI's origin, which reaches every API the server exposes, so
    the scheme is checked here rather than trusted.

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

    An entry is either an absolute ``http``/``https`` image URL, or a path inside the
    repository. A scheme that is neither is refused rather than passed to the browser.

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
    # A repository path: no traversal, no absolute or Windows-style path.
    return not (".." in text or "\\" in text or text.startswith("/"))


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
