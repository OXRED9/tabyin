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
        # first wording only: some records add a second version after the closing quotation mark
        return text.strip(" «.:\n").split("»")[0].split("\n")[0].strip(" «».:")

    return _get


@pytest.fixture()
def offline(monkeypatch):
    """Deterministic pipeline: no LLM provider and no live source calls (lexical-only mode)."""
    from tabayyun import pipeline
    from tabayyun.llm.router import LLMRouter
    from tabayyun.sources.dorar import DorarClient

    dorar = DorarClient()
    dorar.status = "disabled"
    monkeypatch.setattr(pipeline, "get_llm", lambda: LLMRouter(providers=[]))
    monkeypatch.setattr(pipeline, "get_dorar", lambda: dorar)


@pytest.fixture()
def verify_text(offline):
    """verify_text(text) -> the collected report dict for a pasted text."""
    import asyncio

    from tabayyun import pipeline
    from tabayyun.ingest.text import ingest_text

    def _run(text: str, ui_lang: str = "ar") -> dict:
        async def ingest():
            return ingest_text(text)

        return asyncio.run(pipeline.collect(ingest, ui_lang=ui_lang))

    return _run
