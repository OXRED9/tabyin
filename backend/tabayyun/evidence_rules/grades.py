"""Classify a *verbatim* hadith grading string into a coarse category for the rules.

The grading text itself is never rewritten: it is shown exactly as the source gave it. The
category only drives the evidence state. Anything the classifier does not recognise is
``unknown`` and can never produce a ``supported`` state.
"""
from __future__ import annotations

import re

from enum import Enum

from ..normalize import normalize_ar


class GradeCategory(str, Enum):
    accepted = "accepted"  # sahih / hasan and their variants
    weak = "weak"  # da'if and its variants
    fabricated = "fabricated"  # mawdu' / no basis / batil
    mixed = "mixed"  # the same grading text accepts one narration and rejects another
    unknown = "unknown"


# Normalised (see normalize_ar) keyword lists. Order of checks matters: rejections first, because
# rejecting phrases often contain an accepting word ("لا يصح", "ليس بصحيح").
_FABRICATED = ("موضوع", "لا اصل له", "باطل", "مكذوب", "مختلق", "كذب", "ليس له اصل", "لا يعرف له اصل")
_WEAK = (
    "ضعيف",
    "لا يصح",
    "لم يصح",
    "ليس بصحيح",
    "غير صحيح",
    "لا يثبت",
    "لم يثبت",
    "منكر",
    "معلول",
    "شاذ",
    "مضطرب",
    "واه",
    "متروك",
    "فيه ضعف",
    "فيه نظر",
    "لين",
    "منقطع",
    "معضل",
    "مجهول",
    "لا يحتج",
)
_ACCEPTED = ("صحيح", "حسن", "متفق عليه", "ثابت", "جيد", "قوي", "رجاله ثقات", "صححه", "حسنه")


def _pattern(keywords: tuple[str, ...]) -> "re.Pattern[str]":
    """A keyword counts only at the start of a word (after an optional و/ف, ب/ل/ك and ال), never inside
    another one: «واه» used to match inside «شواهد», so «له شواهد» was read as a weakening."""
    return re.compile(r"(?<![\u0621-\u064a])[وف]?[بلك]?(?:ال)?(?:" + "|".join(re.escape(normalize_ar(k)) for k in keywords) + ")")


_RE_FABRICATED, _RE_WEAK, _RE_ACCEPTED = _pattern(_FABRICATED), _pattern(_WEAK), _pattern(_ACCEPTED)


def classify_grade(text: str | None) -> GradeCategory:
    if not text or not text.strip():
        return GradeCategory.unknown
    norm = normalize_ar(text)
    fabricated = bool(_RE_FABRICATED.search(norm))
    weak = bool(_RE_WEAK.search(norm))
    # Remove rejecting phrases before looking for accepting words they may contain.
    residue = _RE_FABRICATED.sub(" ", _RE_WEAK.sub(" ", norm))
    accepted = bool(_RE_ACCEPTED.search(residue))
    if accepted and (weak or fabricated):
        return GradeCategory.mixed
    if fabricated:
        return GradeCategory.fabricated
    if weak:
        return GradeCategory.weak
    if accepted:
        return GradeCategory.accepted
    return GradeCategory.unknown


_SAHIHAYN_MARKERS = ("متفق عليه", "رواه البخاري", "رواه مسلم", "اخرجه البخاري", "اخرجه مسلم", "صحيح البخاري", "صحيح مسلم")


def attribution_in_sahihayn(attribution: str | None) -> bool:
    """True when a source's own takhrij line places the hadith in al-Bukhari or Muslim."""
    if not attribution:
        return False
    norm = normalize_ar(attribution)
    return any(normalize_ar(m) in norm for m in _SAHIHAYN_MARKERS)
