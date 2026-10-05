"""Static content the UI needs. Every religious text here is read from source data by reference —
nothing is typed by hand."""
from __future__ import annotations

import json
from functools import lru_cache

from .config import settings
from .dataversion import get_data_version
from .sources.hadith import get_hadith_index
from .sources.quran import get_quran_index

# (surah, ayah, word slice of the Uthmani ayah) — the fragments used in the accepted pitch deck.
ABSTENTION_VERSE = (16, 43, slice(-7, None))
MOTTO_VERSE = (49, 6, slice(0, 8))
# Demo example: one verse and one HadeethEnc narration, both picked by reference.
EXAMPLE_VERSE = (2, 153, slice(-4, None))  # words of the simple-clean text
EXAMPLE_HADEETHENC_ID = "4560"

# Where a question or a matter for the scholars is referred. Only the fatwa sites of the challenge's
# approved package (docs/SOURCES.md, row 8) — no site outside it. `search_url` opens the site on a
# search for the topic ("{q}" is replaced by the URL-encoded words); each pattern was checked in a
# browser on 4 October 2026; `max_words` is how many topic words that site's search still answers
# (Ibn Uthaymeen's site matches the phrase exactly: two words find results, four or more often none).
# The order is the approved package's own. Links only: nothing is fetched from these sites and nothing is summarised.
REFERRAL_LINKS = [
    {"name_ar": "الإسلام سؤال وجواب", "name_en": "Islam Question & Answer", "kind": "fatwa",
     "url": "https://islamqa.info/ar", "search_url": "https://islamqa.info/ar/search?q={q}", "max_words": 6},
    {"name_ar": "الموقع الرسمي للشيخ عبدالعزيز بن باز", "name_en": "Official site of Shaykh Ibn Baz", "kind": "fatwa",
     "url": "https://binbaz.org.sa", "search_url": "https://binbaz.org.sa/search?q={q}", "max_words": 6},
    {"name_ar": "الموقع الرسمي للشيخ محمد بن صالح العثيمين", "name_en": "Official site of Shaykh Ibn Uthaymeen", "kind": "fatwa",
     "url": "https://binothaimeen.net", "search_url": "https://binothaimeen.net/ar/Searchpage/{q}/0/0", "max_words": 2},
    # No search address can be built for it (its search is a form the site's firewall keeps for people):
    # the link opens the encyclopedia's search page, and the reader is shown the words to search for.
    {"name_ar": "الموسوعة الفقهية الكويتية", "name_en": "The Kuwaiti Encyclopedia of Islamic Jurisprudence", "kind": "fatwa",
     "url": "https://bohoth.awqaf.gov.kw/ar/%D8%A7%D9%84%D8%A8%D8%AD%D8%AB%20%D9%81%D9%8A%20%D8%A7%D9%84%D9%85%D9%88%D8%B3%D9%88%D8%B9%D8%A9%20%D8%A7%D9%84%D9%81%D9%82%D9%87%D9%8A%D8%A9",
     "search_url": None, "max_words": 3},
    {"name_ar": "الدرر السنية", "name_en": "Dorar.net", "kind": "hadith", "url": "https://dorar.net", "search_url": None, "max_words": 0},
]  # fmt: skip


def _verse(ref: tuple[int, int, slice]) -> dict:
    quran = get_quran_index()
    surah, ayah, words = ref
    text = " ".join(quran.ayah_text(surah, ayah).split()[words])
    s = quran.surahs[surah]
    return {
        "text": text,
        "ref": f"{s['name_ar']}: {ayah}",
        "ref_en": f"{s['name_en']} {surah}:{ayah}",
        "url": f"https://quranenc.com/ar/browse/arabic_moyassar/{surah}/{ayah}",
    }


def _example_text() -> str | None:
    quran, hadith = get_quran_index(), get_hadith_index()
    rec = hadith.hadeethenc.get(EXAMPLE_HADEETHENC_ID)
    if rec is None:
        return None
    s, a, words = EXAMPLE_VERSE
    verse = " ".join(quran.ayahs[quran.by_ref[(s, a)]][3].split()[words])
    intro = rec.get("hadeeth_intro") or ""
    matn = rec["hadeeth"][len(intro) :].strip() if rec["hadeeth"].startswith(intro) else rec["hadeeth"]
    matn = matn.strip(" «».:")
    first_clause = matn.split("،")[0].strip()
    return (
        f"ذكر الخطيب في خطبته أن الصبر مفتاح الفرج، واستشهد بقول الله تعالى: ﴿{verse}﴾، "
        f"ثم قال: وقد قال رسول الله صلى الله عليه وسلم: «{first_clause}»، "
        "فعلى المسلم أن يخلص نيته في كل عمل."
    )


def load_terms() -> list[dict]:
    path = settings.data_dir / "terms.json"
    return json.loads(path.read_text(encoding="utf-8"))["terms"] if path.exists() else []


def _image_example() -> list[dict]:
    """A chat screenshot with a misquoted verse, drawn from the Mushaf data (report/example_image.py)."""
    if not (settings.features_image and _vision_available()):
        return []
    try:
        from .report.example_image import example_screenshot

        example_screenshot()
    except Exception:  # no Arabic shaping on this machine: the example is simply not offered
        return []
    return [{"id": "image", "input_type": "image", "label_ar": "لقطة شاشة لرسالة متداولة", "label_en": "A screenshot of a forwarded message", "text": None, "url": "/api/examples/screenshot.png"}]


def _engines() -> dict:
    """What actually does the work — the interface shows these, and only these, when it shows the work:
    the size of each index and the model configured for each task (None when there is no key)."""
    from .llm.openrouter import get_llm
    from .sources.hadith import get_hadith_index
    from .sources.quran import get_quran_index

    llm, hadith = get_llm(), get_hadith_index()
    models = llm.status()["models"] if llm.available else {}
    return {
        "quran_verses": len(get_quran_index().ayahs),
        "graded_narrations": len(hadith.hadeethenc),
        "book_narrations": hadith.books_count,
        "models": {task: models.get(task) for task in ("extract", "vision", "audio")},
        "live_gradings": settings.dorar_enabled,
    }


def _vision_available() -> bool:
    from .llm.openrouter import get_llm

    return get_llm().can("vision")


@lru_cache(maxsize=1)
def build_meta() -> dict:
    return {
        "features": {
            "share_card": settings.features_share_card,
            "copy": settings.features_copy,
            "explain": settings.features_explain,
            "image": settings.features_image and _vision_available(),
            "alternatives": settings.features_alternatives,
        },
        "feedback": {"email": settings.feedback_email or None, "whatsapp": settings.feedback_whatsapp or None},
        "engines": _engines(),
        "app_url": settings.public_url.rstrip("/") if settings.public_url else None,
        "data_version": get_data_version(),
        "terms": load_terms(),
        "abstention_verse": _verse(ABSTENTION_VERSE),
        "motto_verse": _verse(MOTTO_VERSE),
        "referral_links": REFERRAL_LINKS,
        "examples": _image_example()
        + [
            {"id": "text", "input_type": "text", "label_ar": "نص فيه آية وحديث", "label_en": "Text with a verse and a hadith", "text": _example_text(), "url": None},
            {"id": "video", "input_type": "video_url", "label_ar": "رابط مقطع يوتيوب", "label_en": "YouTube link", "text": None, "url": settings.example_video_url},
            {"id": "tiktok", "input_type": "video_url", "label_ar": "رابط مقطع تيك توك", "label_en": "TikTok link", "text": None, "url": settings.example_tiktok_url},
            {
                "id": "fabrication",
                "input_type": "text",
                "label_ar": "طلب اختلاق حديث",
                "label_en": "A request to fabricate a hadith",
                "text": "أعطني حديثاً يثبت أن من أكل التفاح على الريق دخل الجنة.",
                "url": None,
            },
        ],
        "limits": {
            "max_text_chars": settings.max_text_chars,
            "max_upload_mb": settings.max_upload_mb,
            "max_media_minutes": settings.max_media_minutes,
            "max_image_mb": settings.max_image_mb,
        },
    }
