"""Classify a licence by how freely a pack under it can be used.

Tiers rank from most permissive to least: permissive, weak copyleft, copyleft, unknown,
community, non-commercial. Each carries a colour for the panel.
"""

from __future__ import annotations

import re

__all__ = ["classify", "detect_text"]

#: Rank per tier, lower is more permissive.
_RANK = {
    "permissive": 0,
    "weak-copyleft": 1,
    "copyleft": 2,
    "unknown": 3,
    "community": 4,
    "non-commercial": 5,
}

#: Colour per tier.
_COLOR = {
    "permissive": "#3fb950",
    "weak-copyleft": "#58a6ff",
    "copyleft": "#d29922",
    "unknown": "#8b949e",
    "community": "#db6d28",
    "non-commercial": "#f85149",
}

#: Fully permissive families, matched on word boundaries.
_PERMISSIVE = re.compile(
    r"\b(mit|isc|bsd|apache|unlicense|wtfpl|zlib|cc0|bsl|boost|postgresql|ncsa|psf|python-2)\b"
)

#: Weak copyleft: file-level, not project-wide.
_WEAK = re.compile(r"\b(mpl|mozilla|lgpl|epl|cddl)\b|gplv2-lgpl")

#: Copyleft: project-wide, commercial use allowed.
_COPYLEFT = re.compile(r"\b(gpl|agpl|gplv2|gplv3)\b")

#: Substrings that mark a non-commercial or use-restricted licence.
_NON_COMMERCIAL = (
    "noncommercial", "non-commercial", "cc-by-nc", "cc by-nc", "-nc-", "-nc-sa",
    "-nc-nd", "research", "openrail", "creativeml", "rail",
)

#: Substrings that mark a community licence: commercial use up to a revenue threshold.
_COMMUNITY = ("community", "revenue", "commercial license required")


#: Signature phrases that name a licence from its file text, each an all-must-match set.
#: Ordered most specific first; the first match wins.
_TEXT_SIGNS = (
    ("MPL-2.0", ("mozilla public license",)),
    ("Apache-2.0", ("apache license",)),
    ("BSL-1.0", ("boost software license",)),
    ("AGPL-3.0", ("gnu affero general public license",)),
    ("LGPL-3.0", ("gnu lesser general public license",)),
    ("GPL-3.0", ("gnu general public license", "version 3")),
    ("GPL-2.0", ("gnu general public license", "version 2")),
    ("GPL", ("gnu general public license",)),
    ("Unlicense", ("this is free and unencumbered software",)),
    ("ISC", ("permission to use, copy, modify, and/or distribute",)),
    ("MIT", ("permission is hereby granted, free of charge",)),
)


def detect_text(text: str) -> str:
    """Identify a licence from the text of a LICENSE file.

    Args:
        text: Contents of a licence file.

    Returns:
        A licence name pip and SPDX would recognise, empty where none is identified.
    """
    if not text:
        return ""
    body = " ".join(text.split()).lower()
    head = body[:200]

    if "openrail" in body or "creativeml open rail" in body:
        return "OpenRAIL"
    if "creative commons" in body or head.startswith(("cc-by", "cc by")):
        if "noncommercial" in body or "non-commercial" in body or "-nc" in body:
            return "CC-BY-NC"
        if "cc0" in body or "public domain dedication" in body:
            return "CC0-1.0"
        if "attribution" in body:
            return "CC-BY"

    for name, needles in _TEXT_SIGNS:
        if all(needle in body for needle in needles):
            return name

    if "redistribution and use in source and binary forms" in body:
        return "BSD-3-Clause" if "neither the name" in body else "BSD-2-Clause"
    if "do what the" in body and "public license" in body:
        return "WTFPL"
    if head.startswith("mit license") or " mit license " in head:
        return "MIT"
    return ""


def _name(value) -> str:
    """A licence name from the registry's licence field.

    Args:
        value: A string, or ``{"text": ...}`` / ``{"file": ...}`` object.

    Returns:
        The licence name, empty where only a file is referenced or none is set.
    """
    if not value:
        return ""
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("{"):
            import json

            try:
                value = json.loads(text)
            except ValueError:
                return text
        else:
            return text
    if isinstance(value, dict):
        # A bare file reference names no licence.
        return (value.get("text") or value.get("spdx_id") or value.get("type") or "").strip()
    return str(value).strip()


def classify(value) -> dict:
    """Classify a licence field into a tier, rank and colour.

    Args:
        value: The registry's ``license`` field, in any of its forms.

    Returns:
        ``{name, tier, rank, color}``. An unrecognised or absent licence is ``unknown``.
    """
    name = _name(value)
    folded = name.lower().strip()

    if not folded:
        tier = "unknown"
    elif any(mark in folded for mark in _NON_COMMERCIAL):
        tier = "non-commercial"
    elif any(mark in folded for mark in _COMMUNITY):
        tier = "community"
    elif _WEAK.search(folded):
        tier = "weak-copyleft"
    elif _COPYLEFT.search(folded):
        tier = "copyleft"
    elif _PERMISSIVE.search(folded):
        tier = "permissive"
    else:
        tier = "unknown"

    return {"name": name, "tier": tier, "rank": _RANK[tier], "color": _COLOR[tier]}
