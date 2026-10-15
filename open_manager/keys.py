"""The access keys the environment supplies, and what may be said about them."""

from __future__ import annotations

import json
import os

from . import log, paths

__all__ = ["ENV_NAMES", "NAMES", "hint", "listing", "retire", "secret", "source"]

logger = log.get_logger("keys")

NAMES = {
    "huggingface": {
        "label": "Hugging Face",
        "purpose": "Gated and private models, and a higher download limit. Sent only to "
                   "huggingface.co, never to the CDN a download is redirected to.",
    },
    "github": {
        "label": "GitHub",
        "purpose": "One-click starring, and a higher rate limit when reading pack pages "
                   "and licences.",
    },
    "virustotal": {
        "label": "VirusTotal",
        "purpose": "Scanning an install. Must not be used in business workflows, commercial "
                   "products or services.",
    },
}

ENV_NAMES = {
    "huggingface": ("HF_TOKEN", "HUGGING_FACE_HUB_TOKEN", "OPEN_MANAGER_HF_TOKEN"),
    "github": ("GITHUB_TOKEN", "GH_TOKEN", "OPEN_MANAGER_GITHUB_TOKEN"),
    "virustotal": ("VIRUS_TOTAL_KEY", "VIRUSTOTAL_API_KEY", "OPEN_MANAGER_VIRUSTOTAL_KEY"),
}

RETIRED_FILE = "keys.json"


def _from_env(name: str) -> tuple:
    """The first environment variable that has a value for this key, and its value."""
    for variable in ENV_NAMES.get(name, ()):
        value = os.environ.get(variable, "").strip()
        if value:
            return variable, value
    return "", ""


def _hint_for(value: str) -> str:
    """What may be shown of a key: enough to tell two apart, not enough to use."""
    tail = value[-4:] if len(value) >= 8 else ""
    return f"****{tail}" if tail else "****"


def secret(name: str) -> str:
    """The key itself, for this server's own use."""
    return _from_env(name)[1] if name in NAMES else ""


def source(name: str) -> str:
    """``environment`` where a variable supplies the key, otherwise an empty string."""
    return "environment" if secret(name) else ""


def hint(name: str) -> dict:
    """Whether a key is set, by which variable, and the little of it that may be shown."""
    variable, value = _from_env(name)
    return {"set": bool(value), "hint": _hint_for(value) if value else "",
            "source": "environment" if value else "",
            "env": variable or ENV_NAMES[name][0],
            "env_names": list(ENV_NAMES[name])}


def listing() -> dict:
    """Every key this knows about: what it is for, and which variable supplies it."""
    return {"ok": True,
            "keys": {name: {**described, **hint(name)} for name, described in NAMES.items()}}


def retire() -> None:
    """Delete the key file earlier versions kept, naming the variables that replace it."""
    target = paths.store_file(RETIRED_FILE)
    if not target.exists():
        return
    try:
        held = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        held = {}
    try:
        target.unlink()
    except OSError as error:
        logger.warning("saved access keys not removed (%s)", error.strerror or error)
        return
    named = [f"{NAMES[name]['label']} ({ENV_NAMES[name][0]})"
             for name in NAMES if isinstance(held, dict) and name in held]
    if named:
        logger.warning("saved access keys removed: %s. Keys come from environment variables",
                       ", ".join(named))
