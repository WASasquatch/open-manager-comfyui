"""What the Comfy Registry says about a version, in words a reader can act on."""

from __future__ import annotations

import json
import re

__all__ = ["ALIASES", "SCAN_KINDS", "TAGS", "build", "normal"]

MAX_PER_KIND = 100

MAX_SNIPPET = 2000

MAX_RAW = 400_000

SCAN_KINDS = {
    "python_dynamic_execution": (
        "Runs code it builds while running",
        "Calls eval, exec or compile. Safe on fixed text; unsafe on text from a workflow, a "
        "file or the network."),
    "python_network_operations": (
        "Uses the network",
        "Opens network connections, for example to download models or call an API."),
    "python_environment_manipulation": (
        "Reads or sets environment variables",
        "Environment variables can hold settings and access keys."),
    "python_command_injection_risk": (
        "Runs other programs",
        "Calls subprocess or os.system. Unsafe when the command carries text from a workflow "
        "or the network."),
    "python_database_connections": (
        "Opens databases",
        "Connects to a database, such as SQLite."),
    "subprocess-pip-install": (
        "Installs Python packages while running",
        "Runs pip itself, outside the install step."),
    "contains_rm_rf": (
        "Deletes folders with rm -rf",
        "Contains a command that removes a folder and everything in it."),
    "contains_custom_url_dependency": (
        "Depends on a package from a custom address",
        "Its requirements fetch a package from outside PyPI."),
    "python_url_command_execution": (
        "Hands addresses to other programs",
        "Passes a URL to a tool such as ffmpeg or curl, which then fetches it."),
    "python_bytecode_manipulation": (
        "Alters Python code or imports while running",
        "Uses techniques that can also hide what code does."),
    "vendored_unknown": (
        "Bundles someone else's code of unknown origin",
        "The scan could not match the file to a known project."),
    "vendored_known": (
        "Bundles a known project's code",
        "The file matches a known project; its contents were not verified."),
    "contains_blacklisted_url": (
        "Contains a blocked address",
        "A URL in the code is on the registry's block list."),
    "python_minified_code": (
        "Contains compressed Python",
        "Minified code cannot be read or reviewed by eye."),
    "python_git_clone_execution": (
        "Fetches code with git while running",
        "Runs git clone, pull or fetch from Python."),
    "python_sensitive_file_access": (
        "Reads sensitive files",
        "Touches credential stores or system files."),
    "prohibited-string": (
        "Contains a prohibited string",
        ""),
    "python_privilege_escalation": (
        "Asks for administrator rights",
        "Calls sudo, su, runas or a similar tool."),
    "downloads_and_executes": (
        "Downloads files and makes them runnable",
        "Pairs a download or unpack with chmod, a pattern malware uses."),
    "syntax-error": (
        "Contains code that does not parse",
        ""),
    "windows_process_manipulation": (
        "Reaches into other Windows processes",
        "Uses Windows APIs that act on other programs."),
    "imports_cryptography_py": (
        "Uses encryption libraries",
        "Imports a cryptography package."),
    "zip_too_large": (
        "Package is over the registry's size limit",
        ""),
    "contains_obfuscated_url": (
        "Contains a hidden address",
        "A URL in the code is encoded or compressed."),
    "contains_btc_address": (
        "Contains a cryptocurrency wallet address",
        ""),
    "contains_url_strings": (
        "Contains web addresses",
        "The code names URLs."),
    "python_encoded_payload_execution": (
        "Runs an encoded payload",
        "Decodes data and runs it as code, a pattern used to hide what code does."),
    "python_anti_debugging": (
        "Tries to avoid inspection",
        "Uses techniques that stop a debugger from watching it."),
}

ALIASES = {
    "subprocesscall": "python_command_injection_risk",
    "ossystemcall": "python_command_injection_risk",
    "httpcall": "python_network_operations",
    "socketcall": "python_network_operations",
    "osenvironcall": "python_environment_manipulation",
    "evalcall": "python_dynamic_execution",
    "execcall": "python_dynamic_execution",
    "dbconnectcall": "python_database_connections",
    "prohibited_string": "prohibited-string",
    "subprocess_pip_install": "subprocess-pip-install",
    "customwheelurl": "contains_custom_url_dependency",
}

TAGS = {
    "any-network-requests": "Uses the network",
    "any-code-execute": "Runs code or commands",
    "system-modification": "Changes the system",
    "any-folder-access": "Reaches files outside its folder",
    "credential-access": "Touches credentials",
    "obfuscated-code": "Hidden code",
    "complex-dependency": "Unusual dependencies",
}

SCANNERS = {
    "yara_scan": "Pattern scan",
    "scan_python_file": "Code scan",
    "pylint-scanner": "Lint",
    "provenance_scan": "Origin check",
    "size_check": "Size check",
}

_SEP = r"[ _-]"

_MEANINGS = (
    (rf"re{_SEP}?verified{_SEP}safe|reviewed{_SEP}safe|false{_SEP}positive",
     "Reviewed and found safe", "clear"),
    (r"approved by admin", "Approved by a registry admin", "clear"),
    (r"passed automated checks", "Passed the automated scan", "clear"),
    (r"rejected by admin", "Rejected by a registry admin", "danger"),
    (rf"reflag{_SEP}pending{_SEP}review|pending{_SEP}review",
     "Flagged again, waiting for a reviewer", "caution"),
    (rf"cross{_SEP}site{_SEP}scripting|\bxss\b", "Can put script into the ComfyUI page", "danger"),
    (rf"command{_SEP}injection|shell{_SEP}injection|arbitrary{_SEP}bash",
     "Can be made to run system commands", "danger"),
    (rf"\brce\b|remote{_SEP}code|code{_SEP}execution|arbitrary{_SEP}(python{_SEP})?code"
     rf"|script{_SEP}injection|trust_remote_code|\beval\b|\bexec\b",
     "Can be made to run code on your machine", "danger"),
    (rf"arbitrary{_SEP}file{_SEP}wr", "Can be made to write files anywhere", "danger"),
    (rf"arbitrary{_SEP}file{_SEP}re|path{_SEP}traversal",
     "Can be made to read files outside its own folders", "danger"),
    (rf"arbitrary{_SEP}file{_SEP}launch", "Can be made to open any file", "danger"),
    (rf"insecure{_SEP}deserialization|\bpickle\b", "Loads data in a way that can run code",
     "danger"),
    (rf"credential{_SEP}exfiltration", "Can send keys or passwords elsewhere", "danger"),
    (rf"hard{_SEP}?coded{_SEP}credential", "Contains a built-in key or password", "caution"),
    (r"insecure transport|ssl verification|tls/ssl|verify=false",
     "Turns off secure connection checks", "caution"),
    (r"\bssrf\b", "Can be made to reach addresses on your network", "danger"),
    (rf"obfuscat|publication{_SEP}policy", "Hides what its code does", "caution"),
    (rf"opaque{_SEP}native{_SEP}code", "Ships compiled code that cannot be reviewed", "caution"),
    (rf"custom package{_SEP}install source|custom{_SEP}url",
     "Installs packages from outside PyPI", "caution"),
    (r"configuration integrity", "Changes its own setup in ways that cannot be checked",
     "caution"),
    (rf"arbitrary{_SEP}sql|sql{_SEP}injection", "Can be made to run database queries", "danger"),
    (rf"data{_SEP}exfil", "Can send your data elsewhere", "danger"),
    (r"\bmalware\b", "Contains malware", "danger"),
    (r"unauthenticated", "Lets anyone on the network trigger its actions", "danger"),
    (r"rejected on security review", "Rejected after a security review", "danger"),
    (rf"code{_SEP}install|git clone|download code", "Downloads and installs code while running",
     "caution"),
    (r"\bsudo\b", "Asks for administrator rights", "caution"),
    (r"\bsubprocess\b", "Runs other programs", "caution"),
    (r"\boutdated\b", "Outdated, with known problems", "caution"),
    (r"code-verified security vulnerability", "A reviewer confirmed a security flaw", "danger"),
)

_SEVERITY = re.compile(r"\((CRITICAL|HIGH|MEDIUM|LOW|INSECURE)\)", re.I)

_POLICY = re.compile(r"^policy-v(?P<version>[\d.]+):\s*(?P<rest>.*)$", re.S)

_REAUDIT = re.compile(r"^re-audit\s*(\([^)]*\))?\s*", re.I)

_DASH = re.compile(r"\s+[\u2014\u2013]\s+|\s+-{1,2}\s+")

_RANK = {"critical": 4, "high": 3, "warning": 2, "medium": 2, "low": 1, "info": 0}


def _meaning(text: str) -> tuple[str, str]:
    """The plain reading of a reviewer's category, and its tone."""
    folded = text.lower()
    for pattern, meaning, tone in _MEANINGS:
        if re.search(pattern, folded):
            return meaning, tone
    return "", "caution"


def _note(text: str, status: str) -> dict:
    """One reviewer or registry note, read into its parts."""
    raw = str(text or "").strip()
    policy = ""
    rest = raw
    found = _POLICY.match(raw)
    if found:
        policy = found.group("version")
        rest = found.group("rest").strip()
    again = bool(_REAUDIT.match(rest))
    rest = _REAUDIT.sub("", rest).lstrip("\u2014\u2013- ").strip()
    parts = _DASH.split(rest, maxsplit=1)
    head = parts[0].strip()
    detail = parts[1].strip() if len(parts) > 1 else ""
    severity = ""
    marked = _SEVERITY.search(head)
    if marked:
        severity = marked.group(1).lower()
        head = _SEVERITY.sub("", head).strip(" ,;")
    meaning, tone = _meaning(head or detail)
    if not meaning and detail:
        meaning, tone = _meaning(detail)
    lowered = raw.lower()
    return {
        "from": "registry" if not policy and ("admin" in lowered or "automated" in lowered)
        else "reviewer",
        "status": status,
        "policy": policy,
        "again": again,
        "category": head,
        "meaning": meaning,
        "severity": severity,
        "detail": detail,
        "text": raw,
        "tone": tone,
    }


def _findings(value) -> list:
    """The scan findings a history message holds, empty where it holds none."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return []
    return [one for one in value if isinstance(one, dict)] if isinstance(value, list) else []


def _short(status: str) -> str:
    """A registry status without its prefix, lowercased."""
    text = str(status or "")
    for prefix in ("NodeVersionStatus", "NodeStatus"):
        if text.startswith(prefix):
            text = text[len(prefix):]
    return text.lower()


def _clip(text, limit: int = MAX_SNIPPET) -> str:
    """Text cut to a limit, marked where it was cut."""
    value = str(text or "")
    return value if len(value) <= limit else value[:limit] + "\n..."


def normal(item: dict) -> dict:
    """One scan finding in a single shape, whichever format the registry wrote it in.

    Returns:
        ``{kind, file, line, line_text, rule}``.
    """
    kind = str(item.get("issue_type") or item.get("type") or item.get("error_type") or "other")
    kind = ALIASES.get(kind.lower(), kind)
    where = str(item.get("file_path") or item.get("file_name") or item.get("file") or "")
    line = item.get("line_number")
    text = item.get("line_snippet")
    if isinstance(item.get("line"), int) and not line:
        line = item["line"]
    elif isinstance(item.get("line"), str) and not text:
        text = item["line"]
    for match in item.get("matches") or ():
        if not isinstance(match, dict):
            continue
        where = where or str(match.get("filepath") or "")
        for string in match.get("strings") or ():
            for instance in (string or {}).get("instances") or ():
                if isinstance(instance, dict):
                    line = line or instance.get("line_number")
                    text = text or instance.get("line")
                    break
            break
        break
    return {
        "kind": kind,
        "file": where.lstrip("/"),
        "line": line if isinstance(line, int) else 0,
        "line_text": str(text or "").strip(),
        "rule": str(item.get("description") or item.get("message") or "").strip(),
    }


def _scan(found: list) -> dict:
    """The scan's findings, grouped by kind and read into plain words."""
    groups: dict[str, dict] = {}
    tags: dict[str, int] = {}
    scanners: dict[str, int] = {}
    files: set[str] = set()
    for item in found:
        shape = normal(item)
        kind = shape["kind"]
        label, explain = SCAN_KINDS.get(kind, ("", ""))
        rule = shape["rule"]
        group = groups.setdefault(kind, {
            "kind": kind,
            "label": label or rule or kind,
            "explain": explain if explain or not label else rule,
            "known": bool(label),
            "count": 0,
            "severity": "",
            "tags": [],
            "findings": [],
            "more": 0,
        })
        group["count"] += 1
        severity = str(item.get("severity") or "").lower()
        if _RANK.get(severity, -1) > _RANK.get(group["severity"], -1):
            group["severity"] = severity
        for tag in item.get("admin_tags") or ():
            tags[tag] = tags.get(tag, 0) + 1
            if tag not in group["tags"]:
                group["tags"].append(tag)
        scanner = str(item.get("scanner") or "")
        if scanner:
            scanners[scanner] = scanners.get(scanner, 0) + 1
        where = shape["file"]
        if where:
            files.add(where)
        if len(group["findings"]) >= MAX_PER_KIND:
            group["more"] += 1
            continue
        meta = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        attack = meta.get("attack_id") or (meta.get("yara_meta") or {}).get("attack_id1") or []
        group["findings"].append({
            "file": where,
            "line": shape["line"],
            "rule": rule,
            "severity": severity,
            "line_text": _clip(shape["line_text"], 400),
            "code": _clip(item.get("code_snippet")),
            "confidence": meta.get("confidence") or "",
            "attack": attack if isinstance(attack, list) else [str(attack)],
            "recommendation": str(item.get("recommendation") or ""),
            "scanner": SCANNERS.get(scanner, scanner),
        })
    ordered = sorted(groups.values(),
                     key=lambda one: (-_RANK.get(one["severity"], -1), -one["count"]))
    for group in ordered:
        group["tags"] = [TAGS.get(tag, tag) for tag in group["tags"]]
    return {
        "matches": len(found),
        "files": len(files),
        "groups": ordered,
        "tags": [{"tag": tag, "label": TAGS.get(tag, tag), "count": count}
                 for tag, count in sorted(tags.items(), key=lambda pair: -pair[1])],
        "scanners": [SCANNERS.get(name, name) for name in scanners],
    }


def _readable_raw(text: str):
    """The registry's record with its nested JSON strings unpacked, for showing as is."""
    def unpack(value):
        if isinstance(value, str) and value.strip()[:1] in ("[", "{"):
            try:
                return unpack(json.loads(value))
            except ValueError:
                return value
        if isinstance(value, list):
            return [unpack(one) for one in value]
        if isinstance(value, dict):
            return {key: unpack(one) for key, one in value.items() if key != "by"}
        return value

    return unpack(text) if text else ""


def _verdict(status: str, notes: list, scan: dict) -> dict:
    """One line saying where this version stands."""
    current = notes[-1] if notes else None
    why = ""
    if current and current["meaning"]:
        why = f": {current['meaning'][:1].lower()}{current['meaning'][1:]}"
    if current and current["tone"] == "clear" and current["meaning"]:
        return {"tone": "clear", "text": f"{current['meaning']}."}
    if status == "banned":
        return {"tone": "danger", "text": f"The registry withdrew this version{why}."}
    if status == "flagged":
        if current and current["from"] == "reviewer":
            return {"tone": current["tone"], "text": f"A reviewer flagged this version{why}."}
        if scan["matches"]:
            return {"tone": "caution",
                    "text": "The automated scan flagged this version. No reviewer note."}
        return {"tone": "caution", "text": "The registry flagged this version without a reason."}
    if status == "active":
        return {"tone": "clear", "text": "The registry lists this version as active."}
    return {"tone": "note", "text": f"The registry lists this version as {status or 'unknown'}."}


def build(node: dict, rows: list, version: str = "") -> dict:
    """The report for one version of a pack.

    Args:
        node: The pack's registry record.
        rows: Every version of the pack, with ``status_reason`` included.
        version: The version to report on. Empty, or one the registry does not list, picks the
            newest flagged or banned one, then the newest.

    Returns:
        ``{ok, pack, version, unlisted, status, created_at, verdict, notes, scan, versions,
        raw}``, ``unlisted`` naming the version asked for where the registry does not list it,
        or ``{ok: False, reason}``.
    """
    listed = [row for row in rows if isinstance(row, dict) and row.get("version")]
    if not listed:
        return {"ok": False, "reason": "the registry lists no versions for this pack"}
    row = next((one for one in listed if one.get("version") == version), None) if version else None
    if row is None:
        held = [one for one in listed if _short(one.get("status")) in ("flagged", "banned")]
        row = (held or listed)[0]
    unlisted = version if version and row.get("version") != version else ""

    status = _short(row.get("status"))
    text = str(row.get("status_reason") or "").strip()
    try:
        parsed = json.loads(text) if text else None
    except ValueError:
        parsed = text

    notes: list[dict] = []
    found: list = []
    if isinstance(parsed, dict):
        for entry in parsed.get("statusHistory") or []:
            if not isinstance(entry, dict):
                continue
            message = entry.get("message")
            listed_findings = _findings(message)
            if not listed_findings and isinstance(message, str) and message.strip() == "[]":
                continue
            if listed_findings:
                found = listed_findings
                notes.append({"from": "scan", "status": _short(entry.get("status")),
                              "text": "", "matches": len(listed_findings), "tone": "caution",
                              "meaning": "Automated scan", "policy": "", "again": False,
                              "category": "", "severity": "", "detail": ""})
            elif isinstance(message, str) and message.strip():
                notes.append(_note(message, _short(entry.get("status"))))
        current = str(parsed.get("message") or "").strip()
        if current:
            notes.append(_note(current, status))
    elif isinstance(parsed, list):
        found = _findings(parsed)
        if found:
            notes.append({"from": "scan", "status": status, "text": "", "matches": len(found),
                          "tone": "caution", "meaning": "Automated scan", "policy": "",
                          "again": False, "category": "", "severity": "", "detail": ""})
    elif isinstance(parsed, str) and parsed:
        notes.append(_note(parsed, status))

    trimmed: list[dict] = []
    for note in notes:
        if (trimmed and note["from"] != "scan" and trimmed[-1].get("text") == note["text"]
                and trimmed[-1].get("status") == note["status"]):
            trimmed[-1] = note
            continue
        trimmed.append(note)

    scan = _scan(found)
    raw = _readable_raw(text)
    shown = json.dumps(raw, indent=2, ensure_ascii=False) if raw else ""
    return {
        "ok": True,
        "pack": {
            "id": node.get("id") or row.get("node_id") or "",
            "name": node.get("name") or node.get("id") or "",
            "publisher": (node.get("publisher") or {}).get("name") or "",
            "repository": node.get("repository") or "",
        },
        "version": row.get("version"),
        "unlisted": unlisted,
        "status": status,
        "created_at": str(row.get("createdAt") or "")[:10],
        "verdict": _verdict(status, trimmed, scan),
        "notes": trimmed,
        "scan": scan,
        "versions": [{"version": one.get("version"), "status": _short(one.get("status"))}
                     for one in listed],
        "raw": shown[:MAX_RAW],
    }
