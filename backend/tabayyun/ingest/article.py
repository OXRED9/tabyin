"""Article URL -> main text (trafilatura)."""
from __future__ import annotations

import asyncio

import httpx
import trafilatura

from ..config import settings
from ..schemas import SourceInfo
from .document import Document, IngestError
from .net import validate_public_url
from .text import clean_pasted, segments_from_text

_MAX_BYTES = 5 * 1024 * 1024
_MAX_REDIRECTS = 5


async def _fetch(url: str) -> tuple[str, str]:
    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds, headers={"User-Agent": settings.user_agent, "Accept-Language": "ar,en;q=0.8"}) as client:
        for _ in range(_MAX_REDIRECTS + 1):
            url = await validate_public_url(url)  # every hop is re-validated
            async with client.stream("GET", url) as r:
                if r.is_redirect and r.headers.get("location"):
                    url = str(httpx.URL(url).join(r.headers["location"]))
                    continue
                if r.status_code != 200:
                    raise IngestError("article_fetch_failed", f"HTTP {r.status_code}")
                if "html" not in r.headers.get("content-type", "html"):
                    raise IngestError("article_fetch_failed", "not an HTML page")
                chunks: list[bytes] = []
                size = 0
                async for chunk in r.aiter_bytes():
                    size += len(chunk)
                    if size > _MAX_BYTES:
                        break
                    chunks.append(chunk)
                return url, b"".join(chunks).decode(r.encoding or "utf-8", errors="replace")
    raise IngestError("article_fetch_failed", "too many redirects")


async def ingest_article(url: str | None) -> Document:
    try:
        final_url, html = await _fetch(url or "")
    except httpx.HTTPError as e:
        raise IngestError("article_fetch_failed", str(e)) from e

    def extract() -> tuple[str | None, str | None]:
        text = trafilatura.extract(html, include_comments=False, include_tables=False, favor_precision=True)
        meta = trafilatura.extract_metadata(html)
        return text, (meta.title if meta else None)

    text, title = await asyncio.to_thread(extract)
    if not text or len(text.strip()) < 80:
        raise IngestError("article_fetch_failed", "no article text")
    text = clean_pasted(text[: settings.max_text_chars])
    return Document(source=SourceInfo(input_type="article_url", title=title, url=final_url), segments=segments_from_text(text))
