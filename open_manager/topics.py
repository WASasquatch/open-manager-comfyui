"""Which packs carry a GitHub topic.

The tags shown on a pack's page are its repository's GitHub topics. They are not in the
registry: it has a ``tags`` field, but it is empty for all but a handful of packs, and its own
search does not match topics either -- searching it for ``perlin-noise`` returns nothing while
WAS Node Suite carries exactly that topic.

So the question goes to GitHub, which does index topics, and the answer is narrowed to the
catalogue we already hold. The narrowing matters more than it looks: ``topic:animation`` alone
is 19,000 repositories and the hundred most-starred of them contain no ComfyUI pack at all,
while ``topic:animation topic:comfyui`` is fourteen repositories of which eight are packs. The
cost of that is a pack which does not tag itself ``comfyui`` will not be found by its other
topics; that is stated where the results are shown rather than papered over.
"""

from __future__ import annotations

import re
import time
from typing import Any

import aiohttp

__all__ = ["TOPIC", "packs_for"]

#: GitHub's own shape for a topic: lowercase, digits and hyphens, 50 characters at most. A
#: value that is not one of these is not searched for -- it would be pasted into a query.
TOPIC = re.compile(r"^[a-z0-9][a-z0-9-]{0,49}$")

#: The qualifier that keeps the search inside this ecosystem.
_NARROW = "topic:comfyui"

#: Results a page, and pages followed. A topic narrowed to ComfyUI has never come close to
#: three hundred repositories, so this is a bound on a runaway rather than a real limit.
_PER_PAGE = 100
_MAX_PAGES = 3

#: How long an answer is kept. Topics move when someone edits their repository, which is not
#: something that needs to be noticed within the hour.
_TTL = 3600.0

_cache: dict[str, tuple[float, dict]] = {}


def _pair(repository: str) -> str:
    """``owner/name``, folded, from a repository URL. Empty where it is not a GitHub one."""
    text = (repository or "").strip().rstrip("/")
    if "github.com/" not in text:
        return ""
    return text.split("github.com/", 1)[1].removesuffix(".git").lower()


async def packs_for(topic: str, session: aiohttp.ClientSession) -> dict:
    """The packs in the catalogue whose repository carries a topic.

    Args:
        topic: The topic, as GitHub spells it.
        session: Session the request runs on.

    Returns:
        ``{ok, topic, ids, found, searched, partial, reason}``. ``ids`` are catalogue
        identifiers. ``found`` is how many repositories GitHub returned and ``searched`` how
        many of those are packs, so a reader can tell "no pack has this" from "GitHub knows
        nothing about this". ``partial`` marks a result cut short by the page cap.
    """
    from . import catalog, keys

    topic = (topic or "").strip().lower()
    if not TOPIC.match(topic):
        return {"ok": False, "reason": "that is not a GitHub topic", "topic": topic, "ids": []}

    hit = _cache.get(topic)
    if hit and time.monotonic() - hit[0] < _TTL:
        return hit[1]

    # Built once per call rather than held, so a pack installed or synced since the last search
    # is included without anything having to remember to clear a second cache.
    known: dict[str, str] = {}
    for entry in catalog.load():
        pair = _pair(entry.get("repository", ""))
        if pair:
            known.setdefault(pair, entry.get("id", ""))

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "open-manager",
    }
    token = keys.secret("github")
    if token:
        # Search is rate limited hard without one: ten requests a minute against thirty.
        headers["Authorization"] = f"Bearer {token}"

    ids: list[str] = []
    found = 0
    partial = False
    for page in range(1, _MAX_PAGES + 1):
        url = (
            "https://api.github.com/search/repositories"
            f"?q=topic:{topic}+{_NARROW}&per_page={_PER_PAGE}&page={page}&sort=stars"
        )
        try:
            async with session.get(url, headers=headers, timeout=_timeout()) as answer:
                if answer.status == 403 and "rate limit" in (await answer.text()).lower():
                    return _keep(topic, {
                        "ok": False, "topic": topic, "ids": ids,
                        "reason": "GitHub's search limit is spent. It resets within the minute; "
                                  "a GitHub token under Open Manager > Access keys raises it.",
                    }, cache=False)
                if answer.status != 200:
                    return _keep(topic, {
                        "ok": False, "topic": topic, "ids": ids,
                        "reason": f"GitHub answered {answer.status}",
                    }, cache=False)
                payload: Any = await answer.json()
        except (aiohttp.ClientError, TimeoutError) as error:
            return _keep(topic, {
                "ok": False, "topic": topic, "ids": ids,
                "reason": f"GitHub could not be reached: {error}",
            }, cache=False)

        items = payload.get("items") or []
        found = int(payload.get("total_count") or 0)
        for item in items:
            pack = known.get(str(item.get("full_name", "")).lower())
            if pack and pack not in ids:
                ids.append(pack)
        if len(items) < _PER_PAGE:
            break
        if page == _MAX_PAGES and found > _MAX_PAGES * _PER_PAGE:
            partial = True

    return _keep(topic, {
        "ok": True,
        "topic": topic,
        "ids": ids,
        "found": found,
        "searched": len(ids),
        "partial": partial,
        "reason": "",
    })


def _timeout() -> aiohttp.ClientTimeout:
    """A bound on one search, so a slow GitHub does not hold a click open."""
    return aiohttp.ClientTimeout(total=20)


def _keep(topic: str, answer: dict, cache: bool = True) -> dict:
    """Record an answer, unless it is a failure worth retrying straight away."""
    if cache:
        _cache[topic] = (time.monotonic(), answer)
    return answer
