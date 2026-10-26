"""Optional requirement groups a pack declares, and which of them the user chose.

A group is a ``requirements/<name>.txt`` file, a root ``requirements-<name>.txt`` or
``requirements_<name>.txt`` file, or a ``[project.optional-dependencies]`` extra. A file the
root ``requirements.txt`` includes belongs to the base install. A file or extra made only of
other groups is their aggregate and offers nothing of its own. Development groups such as
``dev``, ``test`` and ``docs`` are left out. Where a file and an extra share a name, the file
is the group, and takes the extra's comment as its description when it opens with none.
"""

from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    try:
        import tomli as tomllib
    except ModuleNotFoundError:
        tomllib = None

from . import log, paths

logger = log.get_logger("optional")

__all__ = ["DEVELOPMENT", "BASE_NAMES", "groups", "summary", "lines_for", "chosen", "unseen",
           "pending", "remember", "mark_seen", "forget", "pack_key", "fold"]

STORE = "optional_requirements.json"

DEVELOPMENT = frozenset({
    "dev", "devel", "develop", "development", "test", "tests", "testing", "doc", "docs",
    "documentation", "lint", "linting", "style", "typing", "types", "ci", "build", "bench",
    "benchmark", "benchmarks", "coverage", "release",
})

BASE_NAMES = frozenset({"base", "common", "core", "default", "main", "requirements", "runtime",
                        "install"})

_FILE = re.compile(r"^requirements[-_](?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)\.txt$", re.IGNORECASE)

_INCLUDE = re.compile(r"^(?:-r|--requirement)(?:\s*=\s*|\s+|(?=[^\s=]))(?P<path>\S+)$")

_COMMENT = re.compile(r"(^|\s+)#")

_EXTRA_KEY = re.compile(r"""^["']?(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)["']?\s*=\s*\[""")

_QUOTED = re.compile(r""""[^"]*"|'[^']*'""")

_REQ_NAME = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[(?P<extras>[^\]]*)\])?")

_FILE_BYTES = 64_000

_DESCRIPTION_CHARS = 280

_NOTE_CHARS = 160

_INCLUDE_DEPTH = 4

_GROUP_CAP = 40

_LINE_CAP = 400

_lock = threading.Lock()


def fold(name: str) -> str:
    """A group or package name folded for comparison.

    Args:
        name: The name as written.

    Returns:
        Lowercase, with runs of ``-``, ``_`` and ``.`` as one ``_``.
    """
    return re.sub(r"[-_.]+", "_", str(name or "").strip().lower())


def pack_key(directory: Path) -> str:
    """The name a pack's choices are kept under: its folder, switched on or off."""
    name = Path(directory).name
    return name[: -len(".disabled")] if name.endswith(".disabled") else name


def _read(path: Path) -> str:
    try:
        with path.open("rb") as handle:
            return handle.read(_FILE_BYTES).decode("utf-8", errors="replace")
    except OSError:
        return ""


def _split(line: str) -> tuple[str, str]:
    """A requirement line and its inline note, read as pip reads comments."""
    text = line.strip()
    if not text or text.startswith("#"):
        return "", ""
    match = _COMMENT.search(text)
    if not match:
        return text, ""
    return text[: match.start()].strip(), text[match.end():].strip()[:_NOTE_CHARS]


def _description(text: str) -> str:
    """The first paragraph of the comment block a file opens with."""
    said: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            if said:
                break
            continue
        if not line.startswith("#"):
            break
        body = line.lstrip("#").strip()
        if not body:
            if said:
                break
            continue
        said.append(body)
    return " ".join(said)[:_DESCRIPTION_CHARS]


def _inside(root: Path, path: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except (OSError, ValueError):
        return False
    return True


def _include(line: str) -> str:
    match = _INCLUDE.match(line.strip())
    return match.group("path") if match else ""


def _entries(root: Path, path: Path, depth: int = 0, seen: set | None = None) -> list[dict]:
    """The requirement lines of a file, following includes that stay inside the pack.

    Args:
        root: The pack directory.
        path: The file to read.
        depth: How many includes deep this file is.
        seen: Files already read on this path, against include loops.

    Returns:
        ``[{line, note}]`` in file order. Option lines are kept for the installer to judge.
    """
    seen = set() if seen is None else seen
    try:
        key = path.resolve()
    except OSError:
        return []
    if key in seen or depth > _INCLUDE_DEPTH or not _inside(root, path) or not path.is_file():
        return []
    seen.add(key)
    out: list[dict] = []
    for raw in _read(path).splitlines():
        line, note = _split(raw)
        if not line:
            continue
        target = _include(line)
        if target:
            out.extend(_entries(root, path.parent / target, depth + 1, seen))
            continue
        out.append({"line": line, "note": note})
        if len(out) >= _LINE_CAP:
            break
    return out


def _only_includes(path: Path) -> bool:
    """Whether every requirement line of a file includes another file."""
    lines = [_split(raw)[0] for raw in _read(path).splitlines()]
    lines = [line for line in lines if line]
    return bool(lines) and all(_include(line) for line in lines)


def _base_files(root: Path) -> set:
    """Files the root ``requirements.txt`` includes, and the files they include."""
    found: set = set()
    pending = [(root / "requirements.txt", 0)]
    while pending:
        path, depth = pending.pop()
        if depth > _INCLUDE_DEPTH or not path.is_file() or not _inside(root, path):
            continue
        for raw in _read(path).splitlines():
            target = _include(_split(raw)[0])
            if not target:
                continue
            nested = path.parent / target
            try:
                resolved = nested.resolve()
            except OSError:
                continue
            if resolved in found:
                continue
            found.add(resolved)
            pending.append((nested, depth + 1))
    return found


def _project(root: Path) -> tuple[dict, str]:
    """The ``[project]`` table and the raw text of a pack's pyproject."""
    text = _read(root / "pyproject.toml")
    if not text or tomllib is None:
        return {}, text
    try:
        parsed = tomllib.loads(text)
    except ValueError:
        return {}, text
    project = parsed.get("project")
    return (project if isinstance(project, dict) else {}), text


def _extra_notes(text: str) -> dict:
    """The comment written beside each extra's name in ``[project.optional-dependencies]``."""
    notes: dict = {}
    inside = False
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("["):
            inside = line.split("#", 1)[0].strip() == "[project.optional-dependencies]"
            continue
        if not inside:
            continue
        match = _EXTRA_KEY.match(line)
        if not match:
            continue
        bare = _QUOTED.sub(lambda quoted: '"' + " " * (len(quoted.group(0)) - 2) + '"', line)
        at = bare.find("#")
        if at < 0:
            continue
        note = line[at + 1:].strip()
        if note:
            notes[fold(match.group("name"))] = note[:_DESCRIPTION_CHARS]
    return notes


def _extras(project: dict) -> dict:
    """Each extra's requirement lines, with references to the pack's own extras expanded."""
    declared = project.get("optional-dependencies")
    if not isinstance(declared, dict):
        return {}
    own = fold(project.get("name") or "")
    raw = {
        str(name): [str(item).strip() for item in items if str(item).strip()]
        for name, items in declared.items()
        if isinstance(items, list)
    }
    folded = {fold(name): name for name in raw}

    def expand(name: str, trail: tuple) -> list[str]:
        out: list[str] = []
        for item in raw.get(name, []):
            match = _REQ_NAME.match(item)
            if own and match and fold(match.group(1)) == own and match.group("extras"):
                for part in match.group("extras").split(","):
                    other = folded.get(fold(part))
                    if other and other not in trail:
                        out.extend(expand(other, trail + (other,)))
                continue
            out.append(item)
        return out

    return {name: expand(name, (name,)) for name in raw}


def _same(lines: list[str]) -> frozenset:
    return frozenset(re.sub(r"\s+", "", line).lower() for line in lines)


def groups(directory: Path) -> list[dict]:
    """The optional groups a pack declares.

    Args:
        directory: The installed pack directory.

    Returns:
        ``[{name, key, source, description, packages: [{line, note}]}]``, files first in
        name order, then extras. ``key`` is the folded name.
    """
    root = Path(directory)
    if not root.is_dir():
        return []
    base = _base_files(root)
    found: list[dict] = []
    keys: set = set()

    def offer(name: str, source: str, description: str, packages: list[dict]) -> None:
        key = fold(name)
        if (not key or key in keys or key in DEVELOPMENT or key in BASE_NAMES
                or len(found) >= _GROUP_CAP * 2):
            return
        if not any(not entry["line"].startswith("-") for entry in packages):
            return
        keys.add(key)
        found.append({"name": name, "key": key, "source": source,
                      "description": description, "packages": packages})

    folder = root / "requirements"
    candidates: list[tuple[str, Path]] = []
    if folder.is_dir() and _inside(root, folder):
        try:
            listed = sorted(folder.iterdir(), key=lambda one: one.name.lower())
        except OSError:
            listed = []
        candidates.extend((one.stem, one) for one in listed
                          if one.is_file() and one.suffix.lower() == ".txt")
    try:
        top = sorted(root.iterdir(), key=lambda one: one.name.lower())
    except OSError:
        top = []
    for one in top:
        match = _FILE.match(one.name)
        if match and one.is_file():
            candidates.append((match.group("name"), one))

    fragments: set = set()
    for _name, path in candidates:
        if _only_includes(path):
            continue
        for raw in _read(path).splitlines():
            target = _include(_split(raw)[0])
            if target:
                try:
                    fragments.add((path.parent / target).resolve())
                except OSError:
                    continue

    for name, path in candidates:
        try:
            resolved = path.resolve()
        except OSError:
            continue
        if resolved in base or resolved in fragments or _only_includes(path):
            continue
        rel = path.relative_to(root).as_posix()
        offer(name, rel, _description(_read(path)), _entries(root, path))

    project, text = _project(root)
    notes = _extra_notes(text)
    for group in found:
        if not group["description"]:
            group["description"] = notes.get(group["key"], "")
    for name, lines in _extras(project).items():
        packages = []
        for line in lines:
            requirement, note = _split(line)
            if requirement:
                packages.append({"line": requirement, "note": note})
        offer(name, "pyproject.toml", notes.get(fold(name), ""), packages[:_LINE_CAP])

    sets = {group["key"]: _same([entry["line"] for entry in group["packages"]
                                 if not entry["line"].startswith("-")]) for group in found}
    dropped: set = set()
    for group in found:
        others = [sets[other["key"]] for other in found
                  if other is not group and other["key"] not in dropped]
        if _aggregate(sets[group["key"]], others):
            dropped.add(group["key"])
    return [group for group in found if group["key"] not in dropped][:_GROUP_CAP]


def _aggregate(own: frozenset, others: list) -> bool:
    """Whether a group is only other groups put together.

    True where every package in it belongs to another group and it holds two or more other
    groups whole, or where it repeats one other group exactly.
    """
    if not own or not others:
        return False
    if not own <= frozenset().union(*others):
        return False
    whole = [other for other in others if other and other <= own]
    return len(whole) >= 2 or any(other == own for other in others)


def summary(directory: Path) -> list[dict]:
    """The optional groups of a pack, with what is installed of each.

    Args:
        directory: The installed pack directory.

    Returns:
        :func:`groups` with ``state`` (``installed``, ``partial`` or ``missing``) on each
        group, and ``status`` and ``installed`` on each package from :func:`deps.check`.
    """
    from . import deps

    found = groups(directory)
    for group in found:
        wanted = [entry for entry in group["packages"] if not entry["line"].startswith("-")]
        try:
            checked = deps.check([entry["line"] for entry in wanted])
        except Exception:
            checked = []
        by_raw = {item.get("raw", ""): item for item in checked}
        have = 0
        for entry in wanted:
            item = by_raw.get(entry["line"]) or {}
            entry["name"] = item.get("name") or entry["line"]
            entry["spec"] = item.get("spec", "")
            entry["status"] = item.get("status", "unparsed")
            entry["installed"] = item.get("installed") or ""
            if entry["status"] == "satisfied":
                have += 1
        group["state"] = ("installed" if wanted and have == len(wanted)
                          else "partial" if have else "missing")
    return found


def lines_for(directory: Path, names) -> tuple[list[str], list[str]]:
    """The requirement lines that install some of a pack's groups.

    Args:
        directory: The installed pack directory.
        names: Group names, in any spelling :func:`fold` reconciles.

    Returns:
        ``(lines, groups)``: each line once, in group order, and the names of the groups
        found, as the pack writes them.
    """
    wanted = {fold(name) for name in names or ()}
    lines: list[str] = []
    used: list[str] = []
    seen: set = set()
    for group in groups(directory):
        if group["key"] not in wanted:
            continue
        used.append(group["name"])
        for entry in group["packages"]:
            if entry["line"] not in seen:
                seen.add(entry["line"])
                lines.append(entry["line"])
    return lines, used


def _path() -> Path:
    return paths.store_file(STORE)


def _load() -> dict:
    try:
        held = json.loads(_path().read_text(encoding="utf-8"))
    except (OSError, ValueError, RuntimeError):
        return {}
    return held if isinstance(held, dict) else {}


def _save(data: dict) -> None:
    path = _path()
    writing = path.with_name(path.name + ".writing")
    try:
        writing.write_text(json.dumps(data, indent=1, sort_keys=True), encoding="utf-8")
        os.replace(writing, path)
    except OSError as error:
        logger.warning("[Open Manager] optional requirement choices not saved: %s", error)


def _record(directory: Path) -> dict:
    held = _load().get(pack_key(directory))
    return held if isinstance(held, dict) else {}


def chosen(directory: Path) -> list[str]:
    """The folded names of the groups the user installed for a pack."""
    return [fold(name) for name in _record(directory).get("chosen") or [] if fold(name)]


def unseen(directory: Path, found: list[dict]) -> list[str]:
    """The groups of a pack the user has not yet been offered.

    Args:
        directory: The installed pack directory.
        found: The pack's groups, as :func:`groups` lists them.

    Returns:
        Their names, as the pack writes them.
    """
    record = _record(directory)
    known = {fold(name) for name in (record.get("seen") or []) + (record.get("chosen") or [])}
    return [group["name"] for group in found if group["key"] not in known]


def pending(directory: Path, found: list[dict]) -> list[str]:
    """The groups the user chose for a pack that the environment no longer satisfies.

    Args:
        directory: The installed pack directory.
        found: The pack's groups with their states, as :func:`summary` lists them.

    Returns:
        Their names, as the pack writes them.
    """
    picked = set(chosen(directory))
    return [group["name"] for group in found
            if group["key"] in picked and group.get("state") != "installed"]


def _update(directory: Path, chose=(), offered=()) -> None:
    key = pack_key(directory)
    with _lock:
        data = _load()
        record = data.get(key) if isinstance(data.get(key), dict) else {}
        picked = [fold(name) for name in record.get("chosen") or []]
        shown = [fold(name) for name in record.get("seen") or []]
        for name in chose:
            if fold(name) and fold(name) not in picked:
                picked.append(fold(name))
        for name in [*offered, *chose]:
            if fold(name) and fold(name) not in shown:
                shown.append(fold(name))
        data[key] = {"chosen": picked, "seen": shown}
        _save(data)


def remember(directory: Path, names, offered=()) -> None:
    """Keep the groups the user installed, to install again when the pack updates.

    Args:
        directory: The installed pack directory.
        names: The groups installed.
        offered: Every group the user was shown at the same time.
    """
    _update(directory, chose=names or (), offered=offered or ())


def mark_seen(directory: Path, names) -> None:
    """Keep that the user was offered some groups and installed none of them."""
    _update(directory, offered=names or ())


def forget(name: str) -> None:
    """Drop what was kept for a pack folder, as when the pack is removed."""
    key = name[: -len(".disabled")] if name.endswith(".disabled") else name
    with _lock:
        data = _load()
        if key in data:
            del data[key]
            _save(data)
