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
"""

from __future__ import annotations

import tomllib

__all__ = ["from_pyproject", "resolve_incompatible"]

#: String fields kept from the table.
_STR_FIELDS = ("source", "branch", "docs", "funding", "release_note")

#: List-of-string fields kept from the table.
_LIST_FIELDS = ("incompatible", "example_workflows", "themes")

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
    if not text:
        return {}
    try:
        data = tomllib.loads(text)
    except (tomllib.TOMLDecodeError, ValueError, TypeError):
        return {}
    section = ((data.get("tool") or {}).get("open_manager")) or {}
    if not isinstance(section, dict):
        return {}
    out: dict = {}
    for key in _STR_FIELDS:
        value = section.get(key)
        if isinstance(value, str) and value.strip():
            out[key] = value.strip()[:_STR_CAP]
    for key in _LIST_FIELDS:
        value = section.get(key)
        if isinstance(value, list):
            items = [v.strip() for v in value if isinstance(v, str) and v.strip()]
            if items:
                out[key] = items[:_LIST_CAP]
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
        from importlib.metadata import PackageNotFoundError, version
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
