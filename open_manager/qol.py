"""Quality of Life patches this repository ships, one module per file in a category folder."""

from __future__ import annotations

import json
import re
from pathlib import Path

__all__ = ["folder", "frontend_chunks", "listing", "meta"]

_CHUNK_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9]{0,60}$")

_CHUNK_REF = re.compile(r"""["'`](?:\./|/assets/|assets/)?([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js)["'`]""")

_chunk_memo: dict = {}

_NAME = re.compile(r"^[a-z][a-z0-9-]{0,40}$")

_KEY = re.compile(r"^qol[A-Za-z0-9]{1,60}$")

_TOKEN = re.compile(r'\s*(?:(?P<text>"(?:[^"\\\n]|\\.)*")|(?P<word>[A-Za-z_$][\w$]*)|(?P<mark>[+\[\],]))')

_CONST = re.compile(r"(?ms)^const ([A-Z][A-Z0-9_]*) = (.+?);$")

_FIELD = re.compile(r"^  ([A-Za-z_$][\w$]*)\s*[:(]")

_FIELDS = ("key", "name", "tooltip", "issues", "options", "defaultValue", "verified")


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
        ``{key, name, tooltip, issues, defaultValue, verified}``, plus ``options`` for a patch
        offering choices in place of a switch.

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
    options = found.get("options")
    if options is None:
        if not isinstance(found.get("defaultValue"), bool):
            raise ValueError("no defaultValue of true or false")
    elif (not isinstance(options, list) or len(options) < 2
          or not all(isinstance(one, str) and one for one in options)
          or len(set(options)) != len(options)):
        raise ValueError("options that are not two or more different strings")
    elif found.get("defaultValue") not in options:
        raise ValueError("a defaultValue that is not one of the options")
    tooltip = found.get("tooltip", "")
    issues = found.get("issues", [])
    if not isinstance(tooltip, str) or not isinstance(issues, list):
        raise ValueError("a tooltip that is not a string, or issues that are not a list")
    declared = {"key": found["key"], "name": found["name"], "tooltip": tooltip, "issues": issues,
                "defaultValue": found["defaultValue"], "verified": str(found.get("verified") or "")}
    if options is not None:
        declared["options"] = options
    return declared


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


def _web_root() -> Path | None:
    """The folder ComfyUI serves its frontend from, or None outside a running server."""
    try:
        from server import PromptServer
        root = PromptServer.instance.web_root
    except (ImportError, AttributeError):
        return None
    return Path(root) if root else None


def _reached(root: Path) -> set:
    """The chunk files the frontend's index page can load, following imports from it."""
    assets = root / "assets"
    text = (root / "index.html").read_text(encoding="utf-8", errors="replace")
    queue = [match.group(1) for match in _CHUNK_REF.finditer(text)]
    queue += re.findall(r"assets/([A-Za-z0-9_.-]+\.js)", text)
    seen: set = set()
    while queue:
        name = queue.pop()
        if name in seen:
            continue
        try:
            body = (assets / name).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        seen.add(name)
        queue.extend(match.group(1) for match in _CHUNK_REF.finditer(body)
                     if match.group(1) not in seen)
    return seen


def frontend_chunks(names: list) -> dict:
    """The built file of each named frontend component, as a path under the web root.

    Returns:
        ``{ok, chunks}`` with ``chunks`` mapping each name to ``assets/<name>-<hash>.js``, or
        to None where this frontend has no such file. Answers are kept until ``index.html``
        changes.
    """
    root = _web_root()
    if root is None:
        return {"ok": False, "reason": "no frontend folder", "chunks": {}}
    try:
        stamp = (root / "index.html").stat().st_mtime_ns
    except OSError as error:
        return {"ok": False, "reason": f"the frontend folder is unreadable ({error.strerror})",
                "chunks": {}}
    key = (str(root), stamp)
    memo = _chunk_memo.get(key)
    if memo is None:
        _chunk_memo.clear()
        memo = _chunk_memo[key] = {"chunks": {}, "files": None, "reached": None}
    found = {}
    for name in names:
        if not _CHUNK_NAME.match(name):
            continue
        if name in memo["chunks"]:
            found[name] = memo["chunks"][name]
            continue
        if memo["files"] is None:
            try:
                memo["files"] = sorted(entry.name for entry in (root / "assets").glob("*.js"))
            except OSError:
                memo["files"] = []
        shape = re.compile(rf"^{re.escape(name)}-[A-Za-z0-9_-]{{8}}\.js$")
        matches = [file for file in memo["files"] if shape.match(file)]
        if len(matches) > 1:
            if memo["reached"] is None:
                memo["reached"] = _reached(root)
            matches = [file for file in matches if file in memo["reached"]]
        chosen = f"assets/{matches[0]}" if len(matches) == 1 else None
        memo["chunks"][name] = found[name] = chosen
    return {"ok": True, "chunks": found}


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
