"""LLM claim extraction: the model only *locates* citations; every quote must exist in the input."""
from __future__ import annotations

import asyncio
import logging
import re

from rapidfuzz import fuzz

from ..ingest.document import Document
from ..llm.base import LLMError
from ..llm.router import LLMSession
from ..schemas import Certainty, ClaimType, ContentLevel
from .models import CLAIMS_SCHEMA, LLMClaims, RawClaim
from .prompts import EXTRACT_SYSTEM

log = logging.getLogger("tabayyun.extract")
CHUNK_CHARS = 7000
MAX_PARALLEL = 4
_WS = re.compile(r"\s+")


def _chunks(text: str, size: int = CHUNK_CHARS) -> list[tuple[int, str]]:
    """Split on line/sentence boundaries; returns (absolute_offset, chunk_text)."""
    if len(text) <= size:
        return [(0, text)]
    out: list[tuple[int, str]] = []
    pos = 0
    while pos < len(text):
        end = min(len(text), pos + size)
        if end < len(text):
            cut = max(text.rfind("\n", pos, end), text.rfind(". ", pos, end), text.rfind("؟", pos, end))
            if cut > pos + size // 2:
                end = cut + 1
        out.append((pos, text[pos:end]))
        pos = end
    return out


def locate(quote: str, text: str) -> tuple[int, int] | None:
    """Find where ``quote`` sits in ``text``. The quote must really be there (no invented citations)."""
    quote = quote.strip()
    if not quote:
        return None
    i = text.find(quote)
    if i >= 0:
        return i, i + len(quote)
    # Tolerate whitespace differences introduced by the model.
    pattern = r"\s+".join(re.escape(p) for p in _WS.split(quote))
    m = re.search(pattern, text)
    if m:
        return m.start(), m.end()
    aln = fuzz.partial_ratio_alignment(quote, text)
    if aln is not None and aln.score >= 90 and aln.dest_end > aln.dest_start:
        return aln.dest_start, aln.dest_end
    return None


async def extract_with_llm(doc: Document, llm: LLMSession, *, max_claims: int) -> list[RawClaim]:
    """Raises LLMError when the primary and the fallback model both fail, so the caller can switch
    to lexical-only mode."""
    text = doc.full_text
    sem = asyncio.Semaphore(MAX_PARALLEL)

    async def run(offset: int, chunk: str) -> list[RawClaim]:
        async with sem:
            result = await llm.complete_json(
                task="extract",
                system=EXTRACT_SYSTEM,
                user=f"<text>\n{chunk}\n</text>",
                schema=CLAIMS_SCHEMA,
                model_cls=LLMClaims,
            )
        claims: list[RawClaim] = []
        for c in result.claims:
            where = locate(c.quote, chunk)
            if where is None:
                log.info("dropping an extracted quote that is not present in the input")
                continue
            start, end = offset + where[0], offset + where[1]
            kind = ClaimType(c.type)
            level = ContentLevel.A if kind in (ClaimType.ayah, ClaimType.hadith) else ContentLevel(c.content_level)
            if kind == ClaimType.request:
                # A request to produce evidence is refused whatever its subject; it is not a personal
                # case (the model called «أعطني حديثاً يثبت …» level D, which would read as one).
                level = ContentLevel.B
            claims.append(
                RawClaim(
                    type=kind,
                    quote=text[start:end],
                    start=start,
                    end=end,
                    attributed_to=c.attributed_to.strip() or None,
                    explicit_attribution=c.explicit_attribution,
                    content_level=level,
                    certainty=Certainty(c.certainty),
                    search_query=c.search_query.strip(),
                    evidence_ref=c.evidence_ref.strip(),
                    origin="llm",
                    # quoted verses and narrations are level A by rule; for the rest the level is the model's
                    level_reason_ar="" if kind in (ClaimType.ayah, ClaimType.hadith, ClaimType.request) else c.level_reason_ar.strip(),
                    level_reason_en="" if kind in (ClaimType.ayah, ClaimType.hadith, ClaimType.request) else c.level_reason_en.strip(),
                    level_reason_origin="rule" if kind in (ClaimType.ayah, ClaimType.hadith, ClaimType.request) else "model",
                )
            )
        return claims

    results = await asyncio.gather(*(run(o, c) for o, c in _chunks(text)), return_exceptions=True)
    failures = [r for r in results if isinstance(r, BaseException)]
    if failures and len(failures) == len(results):
        raise failures[0] if isinstance(failures[0], LLMError) else LLMError(str(failures[0]))
    claims = [c for r in results if not isinstance(r, BaseException) for c in r]
    if failures:
        doc.warnings.append("partial_llm_extraction")
    claims.sort(key=lambda c: c.start)
    return claims[:max_claims]
