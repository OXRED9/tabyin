"""Book metadata for the Open-Hadith-Data retrieval corpus (the Six Books, Muwatta, Musnad Ahmad).

Names are taken from the dataset's own README. Sunan al-Darimi ships with the dataset but is not on
the project's approved list, so it is not indexed.
"""
from __future__ import annotations

import re

BOOKS: dict[str, dict] = {
    "bukhari": {"folder": "Sahih_Al-Bukhari", "name_ar": "صحيح البخاري", "name_en": "Sahih al-Bukhari", "sahih": True},
    "muslim": {"folder": "Sahih_Muslim", "name_ar": "صحيح مسلم", "name_en": "Sahih Muslim", "sahih": True},
    "abudawud": {"folder": "Sunan_Abu-Dawud", "name_ar": "سنن أبي داود", "name_en": "Sunan Abu Dawud", "sahih": False},
    "tirmidhi": {"folder": "Sunan_Al-Tirmidhi", "name_ar": "جامع الترمذي", "name_en": "Jami al-Tirmidhi", "sahih": False},
    "nasai": {"folder": "Sunan_Al-Nasai", "name_ar": "سنن النسائي (الصغرى)", "name_en": "Sunan al-Nasa'i", "sahih": False},
    "ibnmajah": {"folder": "Sunan_Ibn-Maja", "name_ar": "سنن ابن ماجه", "name_en": "Sunan Ibn Majah", "sahih": False},
    "malik": {"folder": "Maliks_Muwataa", "name_ar": "موطأ الإمام مالك", "name_en": "Muwatta Malik", "sahih": False},
    "ahmad": {"folder": "Musnad_Ahmad_Ibn-Hanbal", "name_ar": "مسند الإمام أحمد", "name_en": "Musnad Ahmad", "sahih": False},
}

DATASET_URL = "https://github.com/mhashim6/Open-Hadith-Data"

_CONTROLS = re.compile("[​-‏‪-‮⁦-⁩﻿]")
_WS = re.compile(r"\s+")


def clean_display(text: str) -> str:
    """Remove the invisible direction marks the dataset wraps around names; keep the words as they are."""
    return _WS.sub(" ", _CONTROLS.sub("", text)).strip()
