"""Quality of Life patches this repository ships, one module per file in a category folder."""

from __future__ import annotations

import json
import re
from pathlib import Path

__all__ = ["folder", "listing", "meta"]

_NAME = re.compile(r"^[a-z][a-z0-9-]{0,40}$")

_KEY = re.compile(r"^qol[A-Za-z0-9]{1,60}$")

_TOKEN = re.compile(r'\s*(?:(?P<text>"(?:[^"\\\n]|\\.)*")|(?P<word>[A-Za-z_$][\w$]*)|(?P<mark>[+\[\],]))')

_CONST = re.compile(r"(?ms)^const ([A-Z][A-Z0-9_]*) = (.+?);$")

_FIELD = re.compile(r"^  ([A-Za-z_$][\w$]*)\s*[:(]")

_FIELDS = ("key", "name", "tooltip", "issues", "defaultValue", "verified")


def folder() -> Path:
    """Where the Quality of Life patches live, one folder per category."""
    return Path(__file__).resolve().parent / "web" / "modules" / "qol"


def _switched_off(path: Path) -> bool:
    """Whether a file or folder is left out by its name: a leading underscore or dot."""
    return path.name.startswith(("_", "."))


def _tokens(text: str) -> list:
    """The tokens of a literal expression, or ValueError where something else is in it."""
    found = []
    at = 0
    text = text.strip()
    while at < len(text):
        match = _TOKEN.match(text, at)
        if not match or match.end() == at:
            raise ValueError(f"unexpected {text[at:at + 12]!r}")
        found.append((match.lastgroup, match.group(match.lastgroup)))
        at = match.end()
        while at < len(text) and text[at].isspace():
            at += 1
    return found


def _joined(tokens: list, consts: dict) -> str:
    """A string from string literals and string constants joined with ``+``."""
    parts = []
    for at, (kind, value) in enumerate(tokens):
        if at % 2:
            if (kind, value) != ("mark", "+"):
                raise ValueError("only + joins strings")
            continue
        if kind == "text":
            parts.append(json.loads(value))
        elif kind == "word" and isinstance(consts.get(value), str):
            parts.append(consts[value])
        else:
            raise ValueError(f"{value} is not a string")
    if not parts or len(tokens) % 2 == 0:
        raise ValueError("an incomplete string")
    return "".join(parts)


def _literal(text: str, consts: dict):
    """The value of a field written as a boolean, a string, or a list of strings."""
    tokens = _tokens(text)
    if len(tokens) == 1 and tokens[0] in (("word", "true"), ("word", "false")):
        return tokens[0][1] == "true"
    if tokens and tokens[0] == ("mark", "["):
        if tokens[-1] != ("mark", "]"):
            raise ValueError("an unclosed list")
        items, current = [], []
        for token in tokens[1:-1] + [("mark", ",")]:
            if token == ("mark", ","):
                if current:
                    items.append(_joined(current, consts))
                current = []
            else:
                current.append(token)
        return items
    return _joined(tokens, consts)


def meta(path: Path) -> dict:
    """The setting a patch declares, read from its file without running it.

    Returns:
        ``{key, name, tooltip, issues, defaultValue, verified}``.

    Raises:
        ValueError: Where the file does not declare them as plain values.
    """
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    consts: dict = {}
    for name, body in _CONST.findall(text):
        try:
            consts[name] = _literal(body, consts)
        except ValueError:
            continue
    start = text.find("\nexport default {\n")
    if start < 0:
        raise ValueError("no export default object")
    fields: dict = {}
    current = None
    for line in text[start + 1:].split("\n")[1:]:
        if line.startswith("};"):
            break
        match = _FIELD.match(line)
        if match:
            name = match.group(1)
            current = name if match.group(0).endswith(":") and name in _FIELDS else None
            if current:
                fields[current] = line[match.end():]
            continue
        if current:
            fields[current] += "\n" + line
    found = {}
    for name, body in fields.items():
        found[name] = _literal(body.strip().rstrip(","), consts)
    if not isinstance(found.get("key"), str) or not _KEY.match(found["key"]):
        raise ValueError("no key such as qolSomething")
    if not isinstance(found.get("name"), str) or not found["name"]:
        raise ValueError("no name")
    if not isinstance(found.get("defaultValue"), bool):
        raise ValueError("no defaultValue of true or false")
    tooltip = found.get("tooltip", "")
    issues = found.get("issues", [])
    if not isinstance(tooltip, str) or not isinstance(issues, list):
        raise ValueError("a tooltip that is not a string, or issues that are not a list")
    return {"key": found["key"], "name": found["name"], "tooltip": tooltip, "issues": issues,
            "defaultValue": found["defaultValue"], "verified": str(found.get("verified") or "")}


def _category(home: Path, problems: list) -> list:
    """The patch files in one category folder, as ``category/name.mjs`` paths."""
    found = []
    for module in sorted(home.glob("*.mjs")):
        if _switched_off(module) or not module.is_file():
            continue
        if not _NAME.match(module.stem):
            problems.append(f"{home.name}/{module.name}: patch file names are lowercase "
                            "letters, digits and dashes")
            continue
        found.append(f"{home.name}/{module.name}")
    return found


def listing() -> dict:
    """Every patch in every category folder, and every name that could not be used.

    Returns:
        ``{ok, patches, meta, problems}``. ``patches`` holds ``category/name.mjs`` paths sorted
        by category, then name. ``meta`` maps each path to the setting it declares, so the
        settings exist before any patch runs. Names starting with ``_`` or ``.`` are left out,
        as is any file not ending in ``.mjs``, so renaming a patch to ``name.mjs.off`` turns
        it off.
    """
    problems: list = []
    try:
        homes = sorted(entry for entry in folder().iterdir() if entry.is_dir())
    except OSError as error:
        return {"ok": False, "patches": [], "problems": [f"the patch folder is unreadable "
                                                          f"({error.strerror})"]}
    patches = []
    for home in homes:
        if _switched_off(home):
            continue
        if not _NAME.match(home.name):
            problems.append(f"{home.name}: category folder names are lowercase letters, "
                            "digits and dashes")
            continue
        patches.extend(_category(home, problems))
    declared = {}
    for one in patches:
        try:
            declared[one] = meta(folder() / one)
        except (OSError, ValueError) as error:
            problems.append(f"{one}: its setting is read when it loads instead ({error})")
    return {"ok": True, "patches": patches, "meta": declared, "problems": problems}
