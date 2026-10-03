"""Arabic text normalisation shared by the Quran matcher, the hadith retriever and the data scripts.

Normalisation is used for *matching only*. Text shown to the user is always the
verbatim source text; the normalised form never leaves the index.
"""
from __future__ import annotations

import re
import unicodedata

# Harakat, Quranic annotation marks, dagger alef and tatweel.
_DIACRITICS = re.compile(
    "[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ࣓-ࣿ]"
)
# Zero-width and directional controls that appear in copied text and in the open hadith CSVs.
_CONTROLS = re.compile("[​-‏‪-‮⁦-⁩﻿]")

_CHAR_MAP = str.maketrans(
    {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ٱ": "ا",
        "ٲ": "ا",
        "ٳ": "ا",
        "ؤ": "و",
        "ئ": "ي",
        "ء": "",
        "ى": "ي",
        "ی": "ي",  # Farsi yeh
        "ې": "ي",
        "ة": "ه",
        "ک": "ك",  # Farsi kaf
        "ۀ": "ه",
        "ە": "ه",
    }
)

_NON_ARABIC_LETTER = re.compile(r"[^ء-ي\s]")
_NON_WORD = re.compile(r"[^\w\s]", re.UNICODE)
_WS = re.compile(r"\s+")

# Honorific formulas that speakers add or drop freely; they are not part of a narration's wording.
_HONORIFICS = re.compile(
    r"(صلي الله عليه و ?(?:اله و ?)?سلم|عليه (?:الصلاه و ?)?السلام|رضي الله (?:عنه|عنها|عنهما|عنهم)"
    r"|رحمه الله(?: تعالي)?|عز و ?جل|سبحانه و ?تعالي|تبارك و ?تعالي|جل و ?علا)"
)
_HONORIFIC_LIGATURES = re.compile("[ﷺﷻ﴾﴿ﷰ-ﷹ﷽]")


def strip_diacritics(text: str) -> str:
    """Remove harakat/Quranic marks/tatweel but keep the letters untouched."""
    return _DIACRITICS.sub("", _CONTROLS.sub("", text))


def normalize_ar(text: str, *, drop_honorifics: bool = False) -> str:
    """Normalise Arabic text for matching.

    Steps: strip diacritics and control characters, unify hamza/alef forms,
    alef maqsura -> ya, ta marbuta -> ha, drop punctuation and non-Arabic
    characters, collapse whitespace.
    """
    if not text:
        return ""
    text = _HONORIFIC_LIGATURES.sub(" ", text)
    text = unicodedata.normalize("NFKC", text)
    text = strip_diacritics(text)
    text = text.translate(_CHAR_MAP)
    text = _NON_ARABIC_LETTER.sub(" ", text)
    text = _WS.sub(" ", text).strip()
    if drop_honorifics:
        text = _WS.sub(" ", _HONORIFICS.sub(" ", text)).strip()
    return text


def tokens_ar(text: str, *, drop_honorifics: bool = False) -> list[str]:
    return normalize_ar(text, drop_honorifics=drop_honorifics).split()


def normalize_latin(text: str) -> str:
    """Normalise non-Arabic (e.g. English) text for lexical matching."""
    text = unicodedata.normalize("NFKC", text or "").lower()
    text = _NON_WORD.sub(" ", text)
    return _WS.sub(" ", text).strip()


def arabic_ratio(text: str) -> float:
    """Share of alphabetic characters that are Arabic letters (language sniffing, no personal inference)."""
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if "؀" <= c <= "ۿ") / len(letters)


def split_original_words(text: str) -> list[str]:
    """Split display text into words whose normalised form is non-empty (keeps original spelling)."""
    return [w for w in _CONTROLS.sub("", text).split() if normalize_ar(w)]
