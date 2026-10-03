"""Shared fixtures.

House rule: no verse, hadith or scholar's quote is typed into a test. Every religious text used
here is read from the source data files by reference (surah/ayah number, HadeethEnc id) and, when a
test needs a faulty quotation, the fault is produced programmatically from that text.
"""
from __future__ import annotations

import pytest

from tabayyun.sources.hadith import get_hadith_index
from tabayyun.sources.quran import get_quran_index


@pytest.fixture(scope="session")
def quran():
    return get_quran_index()


@pytest.fixture(scope="session")
def hadith():
    return get_hadith_index()


@pytest.fixture(scope="session")
def ayah(quran):
    """ayah(surah, n) -> (uthmani, simple_clean)"""

    def _get(surah: int, n: int) -> tuple[str, str]:
        row = quran.ayahs[quran.by_ref[(surah, n)]]
        return row[2], row[3]

    return _get


@pytest.fixture(scope="session")
def matn(hadith):
    """matn(hadeethenc_id) -> the narration's wording without its introducing chain."""

    def _get(hid: str) -> str:
        rec = hadith.hadeethenc[hid]
        intro = rec.get("hadeeth_intro") or ""
        text = rec["hadeeth"][len(intro) :] if rec["hadeeth"].startswith(intro) else rec["hadeeth"]
        return text.strip(" «».:\n")

    return _get
