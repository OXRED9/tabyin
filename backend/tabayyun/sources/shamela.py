"""Al-Maktaba al-Shamela (shamela.ws): where a saying attributed to a scholar is found, verbatim.

The challenge's package lists Shamela among the approved references. Its website search answers a
plain request (the endpoint its own search page calls), so nothing has to be downloaded: a quotation
is searched, the top pages are opened, and the quotation is aligned against each page's own text.
Only the source's responses are cached, under hashed keys — never the user's text in readable form.

What is returned is what the page says: the book, its author as Shamela names him, the volume and
page, the page's text, and whether the named person is mentioned just before the quotation (a scholar
quoting another). Nothing here decides a state; the rules do.
"""

from __future__ import annotations

import html as htmllib
import logging
import re
import time
from dataclasses import dataclass, field

import httpx

from ..config import settings
from ..normalize import normalize_ar
from .cache import get_cache

log = logging.getLogger(__name__)

SOURCE_NAME = "المكتبة الشاملة"
SOURCE_NAME_EN = "Al-Maktaba al-Shamela"
SEARCH_URL = "https://shamela.ws/ajax/search"
_COOLDOWN = 120.0
_PAGES = 3  # pages opened per quotation

_RESULT = re.compile(
    r'<a[^>]+href="(https://shamela\.ws/book/(\d+)/(\d+))[^"]*"[^>]*>\s*<b>(.*?)</b>(.*?)(?=<a[^>]+href="https://shamela\.ws/book/\d+/\d+|$)',
    re.S,
)
_AUTHOR = re.compile(r"\[([^\]]{2,120})\]")
_WHERE = re.compile(r"\((ج\s*\d+،\s*)?ص\s*\d+\)")
_NASS = re.compile(r'<div class="nass[^"]*"[^>]*>(.*?)</div>\s*</div>', re.S)
_TITLE = re.compile(r"<title>([^<]+)</title>")


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


@dataclass
class ShamelaPage:
    url: str
    book_id: int
    page: int
    book: str
    author: str
    where: str  # «ج 40، ص 429» as Shamela prints it
    text: str = field(default="", repr=False)


class ShamelaClient:
    def __init__(self) -> None:
        self.status = "unknown"  # "ok" | "unreachable" | "unknown"
        self._down_until = 0.0

    @property
    def reachable(self) -> bool:
        return time.monotonic() >= self._down_until

    def _down(self, e: Exception) -> None:
        # Only the error type is logged: the request carries the user's words.
        log.warning("Shamela unreachable (%s); attributed sayings will be checked without it", type(e).__name__)
        self.status = "unreachable"
        self._down_until = time.monotonic() + _COOLDOWN

    async def find(self, quote: str) -> list[ShamelaPage] | None:
        """The top pages for ``quote``, each with its text; ``None`` when Shamela cannot be reached."""
        if not self.reachable:
            return None
        words = normalize_ar(quote, drop_honorifics=True).split()
        if len(words) < 4:
            return []
        term = " ".join(quote.split()[:18])
        cache = get_cache()
        key = cache.key("shamela", term)
        cached = cache.get(key, max_age=30 * 86400)
        if cached is not None:
            return [ShamelaPage(**p) for p in cached]
        try:
            async with httpx.AsyncClient(timeout=settings.http_timeout_seconds, headers={"User-Agent": settings.user_agent, "X-Requested-With": "XMLHttpRequest"}) as client:
                r = await client.post(SEARCH_URL, data={"term": term})
                if r.status_code != 200:
                    raise httpx.HTTPStatusError(f"HTTP {r.status_code}", request=r.request, response=r)
                pages = self._parse(r.text)[:_PAGES]
                for p in pages:
                    pr = await client.get(p.url)
                    if pr.status_code == 200:
                        m = _NASS.search(pr.text)
                        p.text = _text(m.group(1)) if m else ""
        except Exception as e:
            self._down(e)
            return None
        self.status = "ok"
        pages = [p for p in pages if p.text]
        cache.set(key, [p.__dict__ for p in pages])
        return pages

    @staticmethod
    def _parse(body: str) -> list[ShamelaPage]:
        out: list[ShamelaPage] = []
        seen: set[str] = set()
        for url, book_id, page, title, rest in _RESULT.findall(body):
            if url in seen:
                continue
            seen.add(url)
            author = _AUTHOR.search(rest)
            where = _WHERE.search(rest)
            out.append(
                ShamelaPage(
                    url=url, book_id=int(book_id), page=int(page), book=_text(title),
                    author=_text(author.group(1)) if author else "", where=_text(where.group(0)).strip("()") if where else "",
                )
            )  # fmt: skip
        return out


def named_in(name: str, text: str) -> bool:
    """True when ``name`` (as the content gives it, e.g. «ابن تيمية», «شيخ الإسلام ابن تيمية») is the
    same person as ``text`` names (e.g. Shamela's «[ابن تيمية]»). Compared on the distinctive part:
    the words left after titles and honorifics."""
    noise = {"الشيخ", "شيخ", "الاسلام", "الامام", "العلامه", "الحافظ", "رحمه", "الله", "تعالي", "رحمهم", "قال", "يقول", "ذكر"}
    a = [w for w in normalize_ar(name).split() if w not in noise]
    if not a:
        return False
    hay = f" {normalize_ar(text)} "
    return all(f" {w} " in hay or f" {w}" in hay for w in a)


_client: ShamelaClient | None = None


def get_shamela() -> ShamelaClient:
    global _client
    if _client is None:
        _client = ShamelaClient()
    return _client
