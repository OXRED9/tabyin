"""Model-free claim extraction.

Always used for Quran detection (a verbatim verse is found by scanning the text against the Mushaf),
and used on its own when no LLM provider is reachable ("lexical-only mode", reduced coverage).
"""
from __future__ import annotations

import re

from ..ingest.document import Document
from ..normalize import arabic_ratio, normalize_ar
from ..schemas import Certainty, ClaimType, ContentLevel
from ..sources.hadith import HadithIndex, content_words
from ..sources.quran import QuranIndex
from ..textalign import words_with_offsets
from .models import RawClaim

_DIACRITICS = re.compile("[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]")
_FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه"})


def _plain(text: str) -> tuple[str, list[int]]:
    """Diacritic-free, alef/ya/ta-folded copy of ``text`` plus a map from its offsets to the original's."""
    chars: list[str] = []
    index: list[int] = []
    for i, ch in enumerate(text):
        if _DIACRITICS.match(ch):
            continue
        chars.append(ch)
        index.append(i)
    index.append(len(text))
    return "".join(chars).translate(_FOLD), index


# All patterns below are written in the folded spelling produced by _plain().
_HONORIFIC = r"(?:\s*(?:صلي\s+الله\s+عليه\s+و\s?(?:اله\s+و\s?)?سلم|ﷺ|عليه\s+(?:الصلاه\s+و\s?)?السلام|تعالي|سبحانه(?:\s+وتعالي)?|عز\s+وجل|جل\s+وعلا|تبارك\s+وتعالي))*"
# "Strong" markers introduce a quotation directly; "weak" ones only when a colon or an opening
# quotation mark follows ("ورد في القرآن: …"), otherwise they are ordinary prose.
_OPEN = r"(?:\s*[:：]\s*|\s*(?=[«“\"﴿(]))"
_AYAH_MARKER = re.compile(
    r"(?:(?:قال\s+الله|يقول\s+الله|قال\s+تعالي|يقول\s+تعالي|قال\s+سبحانه|قال\s+ربنا|يقول\s+ربنا|قوله\s+(?:تعالي|سبحانه|عز\s+وجل)"
    r"|allah\s+(?:says|said)|the\s+qur'?an\s+says)" + _HONORIFIC + r"\s*[:،,]?\s*"
    r"|(?:(?:جاء|ورد|كما)\s+)?في\s+(?:القران(?:\s+الكريم)?|كتاب\s+الله|الايه(?:\s+الكريمه)?|قوله)" + _HONORIFIC + _OPEN + r"|in\s+the\s+qur'?an" + _OPEN + r")",
    re.IGNORECASE,
)
_HADITH_MARKER = re.compile(
    r"(?:(?:(?:قال|يقول)\s+(?:رسول\s+الله|النبي|الرسول|المصطفي|نبينا)|عن\s+(?:النبي|رسول\s+الله)[^.:؟!\n]{0,60}?(?:قال|انه\s+قال)"
    r"|سمعت\s+(?:النبي|رسول\s+الله)[^.:؟!\n]{0,40}?يقول"
    r"|ان\s+(?:النبي|رسول\s+الله)[^.:؟!\n]{0,60}?قال|قال\s+عليه\s+(?:الصلاه\s+و\s?)?السلام|قال\s+صلي\s+الله\s+عليه\s+وسلم"
    r"|the\s+prophet[^.:\n]{0,60}?said|messenger\s+of\s+allah[^.:\n]{0,60}?said)" + _HONORIFIC + r"\s*[:،,]?\s*"
    r"|(?:(?:جاء|ورد|كما)\s+)?في\s+الحديث(?:\s+(?:الشريف|الصحيح|القدسي|النبوي))?" + _OPEN + r"|حديث\s+(?:النبي|رسول\s+الله)" + _HONORIFIC + _OPEN + r")",
    re.IGNORECASE,
)
_REQUEST = re.compile(
    r"(?:اعطني|اعطيني|هات(?:\s+لي)?|اذكر\s+لي|اريد|ابحث\s+لي\s+عن|اكتب\s+لي|الف\s+لي|جد\s+لي|زودني\s+ب|give\s+me|write\s+me|find\s+me|make\s+up|i\s+need)"
    r"[^.؟!\n]{0,50}?(?:حديث|ايه|دليل|اثر|نص|hadith|verse|ayah|evidence)[^.؟!\n]*",
    re.IGNORECASE,
)
_PERSONAL = re.compile(
    r"(?:هل\s+(?:يجوز|يحل|يصح|يحق|يلزمني|علي)\s+لي|هل\s+علي\b|ما\s+حكم[^.؟!\n]{0,80}?(?:\sلي\b|زوجتي|زوجي|طلاقي|صلاتي|صيامي|عقدي|ابي|امي|اخي)"
    r"|انا\s+[^.؟!\n]{0,120}?هل\s+(?:يجوز|يحل|يصح)|(?:طلقت|حلفت|نذرت)\s+[^.؟!\n]{0,160}?(?:فما|هل|ماذا)"
    r"|is\s+it\s+(?:permissible|allowed|halal|haram)\s+for\s+me|in\s+my\s+(?:case|marriage|situation))[^.؟!\n]*",
    re.IGNORECASE,
)
_OPENERS = {"«": "»", "“": "”", '"': '"', "'": "'", "‘": "’", "﴿": "﴾", "(": ")", "{": "}", "[": "]"}
_SENTENCE_END = re.compile(r"[.؟!\n]|\.\.\.|…")
_QURAN_BRACKETS = re.compile(r"﴿([^﴾]{3,2000})﴾")
_SENTENCES = re.compile(r"[^.؟!\n؛]+")


def _quote_after(plain: str, pos: int, max_chars: int = 1500, max_words: int = 60) -> tuple[int, int] | None:
    """Offsets (in ``plain``) of the quotation that starts at ``pos``."""
    while pos < len(plain) and plain[pos] in " \t:،,":
        pos += 1
    if pos >= len(plain):
        return None
    closer = _OPENERS.get(plain[pos])
    if closer:
        end = plain.find(closer, pos + 1, pos + max_chars)
        if end > pos + 1:
            return pos + 1, end
        pos += 1
    m = _SENTENCE_END.search(plain, pos, pos + max_chars)
    end = m.start() if m else min(len(plain), pos + max_chars)
    words = plain[pos:end].split()
    if len(words) > max_words:
        end = pos + len(" ".join(words[:max_words]))
    return (pos, end) if end > pos else None


def has_ayah_marker_before(doc_text: str, start: int) -> bool:
    plain, _ = _plain(doc_text[max(0, start - 90) : start])
    m = None
    for m in _AYAH_MARKER.finditer(plain):
        pass
    return bool(m and len(plain) - m.end() <= 6) or doc_text[max(0, start - 3) : start].strip().endswith("﴿")


def scan_quran(doc: Document, quran: QuranIndex) -> list[RawClaim]:
    """Find verbatim Quran fragments anywhere in the document (no model involved)."""
    text = doc.full_text
    words = words_with_offsets(text)
    norm = [w[3] for w in words]
    orig = [w[2] for w in words]
    claims: list[RawClaim] = []
    for w_start, w_end, match in quran.find_quotes_in(orig, norm):
        start, end = words[w_start][0], words[w_end - 1][1]
        claims.append(
            RawClaim(
                type=ClaimType.ayah,
                quote=text[start:end],
                start=start,
                end=end,
                explicit_attribution=has_ayah_marker_before(text, start),
                content_level=ContentLevel.A,
                certainty=Certainty.not_applicable,
                origin="quran_scan",
                prematched=match,
            )
        )
    return claims


def scan_hadith_verbatim(doc: Document, hadith: HadithIndex, exclude: list[tuple[int, int]] | None = None, *, min_words: int = 6) -> list[RawClaim]:
    """Find verbatim HadeethEnc narrations anywhere in the document (no model involved).

    ``exclude``: character spans already identified as Quran text. Narrations often quote verses,
    so a run only counts if enough of it lies outside those spans.
    """
    text = doc.full_text
    words = words_with_offsets(text)
    exclude = exclude or []
    claims: list[RawClaim] = []
    for w_start, w_end, _hid in hadith.find_quotes_in([w[3] for w in words], min_words=min_words):
        outside = [w for w in words[w_start:w_end] if not any(s <= w[0] < e for s, e in exclude)]
        if len(outside) < min_words or content_words([w[3] for w in outside]) < 4:
            continue
        start, end = words[w_start][0], words[w_end - 1][1]
        before, _ = _plain(text[max(0, start - 120) : start])
        claims.append(
            RawClaim(
                type=ClaimType.hadith,
                quote=text[start:end],
                start=start,
                end=end,
                explicit_attribution=bool(_HADITH_MARKER.search(before)) or "رسول الله" in before or "النبي" in before,
                origin="hadith_scan",
            )
        )
    return claims


def extract_by_markers(doc: Document) -> list[RawClaim]:
    """Citations introduced by an explicit marker, requests for evidence, and personal-case questions."""
    text = doc.full_text
    plain, index = _plain(text)
    claims: list[RawClaim] = []

    def add(kind: ClaimType, p_start: int, p_end: int, **kw) -> None:
        start, end = index[p_start], index[min(p_end, len(index) - 1)]
        quote = text[start:end].strip()
        if len(quote.split()) < 2:
            return
        start += len(text[start:end]) - len(text[start:end].lstrip())
        claims.append(RawClaim(type=kind, quote=quote, start=start, end=start + len(quote), origin="marker", **kw))

    for m in _QURAN_BRACKETS.finditer(plain):
        add(ClaimType.ayah, m.start(1), m.end(1), explicit_attribution=True)
    for marker, kind in ((_AYAH_MARKER, ClaimType.ayah), (_HADITH_MARKER, ClaimType.hadith)):
        for m in marker.finditer(plain):
            span = _quote_after(plain, m.end())
            if span:
                add(kind, span[0], span[1], explicit_attribution=True)
    for m in _REQUEST.finditer(plain):
        add(ClaimType.request, m.start(), m.end(), content_level=ContentLevel.B)
    for m in _PERSONAL.finditer(plain):
        add(ClaimType.ruling, m.start(), m.end(), content_level=ContentLevel.D, certainty=Certainty.ijtihadi)
    return claims


def scan_hadith(doc: Document, hadith: HadithIndex, taken: list[tuple[int, int]], *, max_sentences: int = 200, min_sim: float = 0.88) -> list[RawClaim]:
    """Unattributed sentences that are (nearly) verbatim narrations — lexical-only mode."""
    text = doc.full_text
    claims: list[RawClaim] = []
    for n, m in enumerate(_SENTENCES.finditer(text)):
        if n >= max_sentences:
            break
        sentence = m.group(0).strip()
        if len(sentence.split()) < 6 or arabic_ratio(sentence) < 0.5:
            continue
        if content_words(normalize_ar(sentence, drop_honorifics=True).split()) < 4:
            continue  # a chain of narrators or an introduction, not a narration's wording
        start = m.start() + (len(m.group(0)) - len(m.group(0).lstrip()))
        end = start + len(sentence)
        if any(s < end and start < e for s, e in taken):
            continue
        top = hadith.search(sentence, k=1)
        if top and top[0].similarity >= min_sim:
            claims.append(RawClaim(type=ClaimType.hadith, quote=sentence, start=start, end=end, origin="hadith_scan"))
    return claims
