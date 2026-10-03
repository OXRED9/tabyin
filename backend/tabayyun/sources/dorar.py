"""Dorar.net hadith search client (scholars' gradings, copied verbatim).

API: https://dorar.net/dorar_api.json?skey=<text> — documented at https://dorar.net/article/389.
It returns ``{"ahadith": {"result": "<html>"}}`` where each hit is a ``.hadith`` block followed by a
``.hadith-info`` block listing الراوي / المحدث / المصدر / الصفحة أو الرقم / خلاصة حكم المحدث.

STATUS (verified 2026-10-03): the endpoint answers the backend's HTTP client (httpx, honestly
identified by ``settings.user_agent``) with the documented shape, and robots.txt allows all paths.
Requests made with ``curl`` from the same network were answered by a Cloudflare 403 block page, so
availability can vary by client and network. We never disguise the client: when Dorar cannot be
reached the pipeline reports "الحكم غير متاح حالياً" and never guesses a grading.
"""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from urllib.parse import quote as urlquote

import httpx
from bs4 import BeautifulSoup

from ..config import settings
from ..normalize import normalize_ar
from .cache import get_cache

log = logging.getLogger("tabayyun.dorar")
API_URL = "https://dorar.net/dorar_api.json"
SOURCE_NAME = "الدرر السنية — الموسوعة الحديثية"
SOURCE_NAME_EN = "Dorar.net — Hadith Encyclopedia"
_COOLDOWN = 600.0
_LABELS = {
    "الراوي": "narrator",
    "المحدث": "scholar",
    "المصدر": "book",
    "الصفحه او الرقم": "number",
    "خلاصه حكم المحدث": "grade",
}


@dataclass
class DorarHit:
    text: str
    narrator: str | None
    scholar: str | None
    book: str | None
    number: str | None
    grade: str | None
    url: str


LINK_WORDS = 7


def search_url(text: str) -> str:
    """A link that opens Dorar on this narration. Dorar has no address per narration, and its site
    search answers "no results" for a long query (measured: 40 words find nothing, 7 do), so the
    link searches for the opening words of the narration as Dorar itself prints it."""
    return f"https://dorar.net/hadith/search?q={urlquote(' '.join(text.split()[:LINK_WORDS]))}"


def parse_result_html(html: str, query: str) -> list[DorarHit]:
    soup = BeautifulSoup(html, "lxml")
    hits: list[DorarHit] = []
    for block in soup.select(".hadith"):
        info = block.find_next_sibling(class_="hadith-info")
        if info is None:
            continue
        text = re.sub(r"^\s*\d+\s*-\s*", "", block.get_text(" ", strip=True))
        fields: dict[str, str] = {}
        for label in info.select(".info-subtitle"):
            name = normalize_ar(label.get_text(" ", strip=True))
            key = _LABELS.get(name)
            if not key:
                continue
            parts: list[str] = []
            for sib in label.next_siblings:
                if getattr(sib, "get", None) and "info-subtitle" in (sib.get("class") or []):
                    break
                parts.append(sib.get_text(" ", strip=True) if hasattr(sib, "get_text") else str(sib))
            value = re.sub(r"\s+", " ", " ".join(parts)).strip(" :")
            fields[key] = "" if value in ("-", "—", "–") else value  # Dorar prints "-" for "not stated"
        hits.append(
            DorarHit(
                text=text,
                narrator=fields.get("narrator") or None,
                scholar=fields.get("scholar") or None,
                book=fields.get("book") or None,
                number=fields.get("number") or None,
                grade=fields.get("grade") or None,
                url=search_url(text),  # the hit's own wording, not what the user typed
            )
        )
    return hits


class DorarClient:
    def __init__(self) -> None:
        self.status = "unknown"  # "ok" | "unreachable" | "unknown" | "disabled"
        self._down_until = 0.0
        if not settings.dorar_enabled:
            self.status = "disabled"

    @property
    def reachable(self) -> bool:
        return self.status != "disabled" and time.monotonic() >= self._down_until

    async def search(self, text: str) -> list[DorarHit] | None:
        """Hits for ``text``; ``None`` when Dorar cannot be reached (never an empty-looking success)."""
        if not self.reachable:
            return None
        query = " ".join(normalize_ar(text, drop_honorifics=True).split()[:14])
        if len(query.split()) < 3:
            return []
        cache = get_cache()
        key = cache.key("dorar", query)
        cached = cache.get(key, max_age=30 * 86400)
        if cached is not None:
            return [DorarHit(**{**h, "url": search_url(h["text"])}) for h in cached]  # links are rebuilt, not kept
        try:
            async with httpx.AsyncClient(timeout=settings.http_timeout_seconds, headers={"User-Agent": settings.user_agent}) as client:
                r = await client.get(API_URL, params={"skey": query})
            if r.status_code != 200:
                raise httpx.HTTPStatusError(f"HTTP {r.status_code}", request=r.request, response=r)
            html = r.json()["ahadith"]["result"]
        except Exception as e:  # network, block page, unexpected shape: all mean "unreachable"
            # Only the error type is logged: the exception text contains the request URL, i.e. the user's words.
            log.warning("Dorar unreachable (%s); gradings will be reported as unavailable", type(e).__name__)
            self.status = "unreachable"
            self._down_until = time.monotonic() + _COOLDOWN
            return None
        self.status = "ok"
        hits = parse_result_html(html, query)
        cache.set(key, [h.__dict__ for h in hits])
        return hits


_client: DorarClient | None = None


def get_dorar() -> DorarClient:
    global _client
    if _client is None:
        _client = DorarClient()
    return _client
