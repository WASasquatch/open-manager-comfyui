"""Classify a licence by how freely a pack under it can be used.

Tiers rank from most permissive to least: permissive, weak copyleft, copyleft, unknown,
community, non-commercial. Each carries a colour for the panel.
"""

from __future__ import annotations

import re

__all__ = ["classify", "colour", "detect_text"]

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
#: Told apart by hue rather than graded from safe to dangerous. A licence is an obligation
#: to check, not a fault: amber and red read as a warning about the pack itself, which is
#: not what a copyleft term means. The ordering in :data:`_RANK` carries how freely a pack
#: can be used, and the panel says so in words on the badge.
_COLOR = {
    "permissive": "#3fb950",
    "weak-copyleft": "#58a6ff",
    "copyleft": "#a371f7",
    "unknown": "#8b949e",
    "community": "#39c5cf",
    "non-commercial": "#db61a2",
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
#: Characters of the normalised text treated as the title block. A licence names itself at
#: the top; what it says about other licences comes later.
_TITLE_WINDOW = 400

#: ``(name, needles, title_only)``. The GNU licences quote each other by name in their own
#: bodies -- GPL-3 section 13 permits combining with the Affero licence, LGPL-3 incorporates
#: GPL-3, and GPL-2 points readers at the Lesser licence -- so a plain substring search over
#: the whole text reports the licence a file mentions rather than the one it is. Those are
#: matched against the title alone. The rest have no such habit and are matched anywhere.
_TEXT_SIGNS = (
    ("AGPL-3.0", ("gnu affero general public license",), True),
    ("LGPL-3.0", ("gnu lesser general public license", "version 3"), True),
    ("LGPL-2.1", ("gnu lesser general public license", "version 2.1"), True),
    ("LGPL", ("gnu lesser general public license",), True),
    ("GPL-3.0", ("gnu general public license", "version 3"), True),
    ("GPL-2.0", ("gnu general public license", "version 2"), True),
    ("GPL", ("gnu general public license",), True),
    ("MPL-2.0", ("mozilla public license",), False),
    ("Apache-2.0", ("apache license",), False),
    ("BSL-1.0", ("boost software license",), False),
    ("Unlicense", ("this is free and unencumbered software",), False),
    ("ISC", ("permission to use, copy, modify, and/or distribute",), False),
    ("MIT", ("permission is hereby granted, free of charge",), False),
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

    title = body[:_TITLE_WINDOW]
    for name, needles, title_only in _TEXT_SIGNS:
        where = title if title_only else body
        if all(needle in where for needle in needles):
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

    PEP 621 writes ``license`` as a table, and the registry stores whatever a pack declared.
    So this arrives as a plain name, as a JSON object, as the TOML table verbatim, or as the
    text between its braces. A table naming only a file names no licence: the empty string
    sends it to the unknown tier, where the repository's licence file is read instead.

    Args:
        value: A string, or a ``{"text": ...}`` / ``{"file": ...}`` object.

    Returns:
        The licence name, empty where only a file is referenced or none is set.
    """
    if not value:
        return ""
    if isinstance(value, dict):
        return (value.get("text") or value.get("spdx_id") or value.get("type") or "").strip()
    text = str(value).strip()
    if not text:
        return ""

    if text.startswith("{") and text.endswith("}"):
        import json

        try:
            decoded = json.loads(text)
        except ValueError:
            decoded = None
        if isinstance(decoded, dict):
            return _name(decoded)
        # Not JSON, so the braces are TOML's or the author's. Read what is inside them.
        text = text[1:-1].strip()

    # ``file = "LICENSE"``, ``text = "MIT"``, ``file: LICENSE`` and the unspaced forms.
    field = re.match(r'^(file|text|spdx_id|type)\s*[=:]\s*(.*)$', text, re.I)
    if field:
        if field.group(1).lower() == "file":
            return ""
        return field.group(2).strip().strip("\"'").strip()
    return text


def colour(tier: str) -> str:
    """The badge colour for a tier, for callers holding a tier but not a whole entry.

    Args:
        tier: One of the tiers :func:`classify` returns.

    Returns:
        A hex colour, falling back to the unknown tier's.
    """
    return _COLOR.get(tier, _COLOR["unknown"])


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
