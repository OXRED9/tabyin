"""QuranEnc.com translations of the meanings (approved source), fetched on demand and cached.

API (verified 2026-10-03): GET https://quranenc.com/api/v1/translation/aya/{key}/{sura}/{aya}
-> {"result": {"id","sura","aya","arabic_text","translation","footnotes"}}
"""
from __future__ import annotations

import logging

import httpx

from ..config import settings
from ..schemas import Translation
from .cache import get_cache

log = logging.getLogger("tabayyun.quranenc")
DEFAULT_KEYS = {"en": "english_saheeh", "tafsir": "arabic_moyassar"}
NAMES = {"english_saheeh": "Saheeh International — via QuranEnc.com", "arabic_moyassar": "التفسير الميسر — موسوعة القرآن الكريم (QuranEnc.com)"}


async def translation(surah: int, ayah_start: int, ayah_end: int, lang: str = "en") -> Translation | None:
    key = DEFAULT_KEYS.get(lang)
    if not key or ayah_end - ayah_start > 9:
        return None
    cache = get_cache()
    parts: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds, headers={"User-Agent": settings.user_agent}) as client:
            for ayah in range(ayah_start, ayah_end + 1):
                ck = cache.key("quranenc", key, str(surah), str(ayah))
                text = cache.get(ck)
                if text is None:
                    r = await client.get(f"https://quranenc.com/api/v1/translation/aya/{key}/{surah}/{ayah}")
                    r.raise_for_status()
                    text = r.json()["result"]["translation"]
                    cache.set(ck, text)
                parts.append(text)
    except Exception as e:
        log.warning("QuranEnc translation unavailable: %s", type(e).__name__)
        return None
    return Translation(
        lang="ar" if lang == "tafsir" else lang,
        text=" ".join(parts),
        source_name=NAMES.get(key, key),
        source_url=f"https://quranenc.com/{'ar' if lang == 'tafsir' else lang}/browse/{key}/{surah}/{ayah_start}",
    )


async def tafsir(surah: int, ayah_start: int, ayah_end: int) -> Translation | None:
    """«التفسير الميسر» for the verse(s), verbatim from QuranEnc (the challenge's package lists it for
    explaining a verse, with the commentator's words kept apart from the Quranic text)."""
    return await translation(surah, ayah_start, ayah_end, "tafsir")
