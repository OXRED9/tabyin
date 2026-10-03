"""F2 — «الثابت في الباب»: accepted narrations on the same subject, retrieved never generated.

The "model" here is the scripted stand-in: it only returns indices into the retrieved texts.
"""
import asyncio

import pytest
from pydantic import ValidationError

from tabayyun import pipeline
from tabayyun.config import settings
from tabayyun.evidence_rules.grades import GradeCategory, classify_grade
from tabayyun.ingest.text import ingest_text
from tabayyun.schemas import Alternative
from tabayyun.sources.dorar import DorarClient
from tests.llm_stubs import ScriptedLLM, claim


@pytest.fixture()
def run(monkeypatch):
    def _run(text: str, provider) -> dict:
        dorar = DorarClient()
        dorar.status = "disabled"
        monkeypatch.setattr(pipeline, "get_llm", lambda: provider)
        monkeypatch.setattr(pipeline, "get_dorar", lambda: dorar)

        async def ingest():
            return ingest_text(text)

        return asyncio.run(pipeline.collect(ingest))

    return _run


@pytest.fixture()
def unsourced(matn):
    """Words of a real narration in an order that is not it: a text with no reference."""
    words = matn("4560").split()
    shuffled = " ".join(words[i] for i in sorted(range(len(words)), key=lambda i: (i * 7) % len(words)))
    return f"قال رسول الله صلى الله عليه وسلم: «{shuffled}»", shuffled


def test_an_alternative_cannot_exist_without_its_link_and_its_grading():
    good = dict(text="نص", ref="مرجع", source_name="مصدر", source_url="https://hadeethenc.com/x", grade_text="صحيح", grade_source_name="مصدر", grade_source_url="https://hadeethenc.com/x")
    Alternative(**good)
    for missing in ("source_url", "grade_text", "grade_source_url", "text", "ref"):
        with pytest.raises(ValidationError):
            Alternative(**{**good, missing: ""})


def test_a_text_with_no_reference_gets_accepted_narrations_the_model_picked(run, unsourced):
    text, quote = unsourced
    extracted = [claim(type="hadith", quote=quote)]
    (card,) = run(text, ScriptedLLM(extracted, judge_index=-1, select=[1, 0, 1, 99]))["cards"]
    assert card["state"] == "not_found" and card["source"] is None  # the verdict is untouched
    alts = card["alternatives"]
    assert 1 <= len(alts) <= 2 and len({a["source_url"] for a in alts}) == len(alts)  # duplicates and bad indices dropped
    for a in alts:
        assert a["text"] and a["ref"] and a["source_url"].startswith("https://") and a["grade_source_url"]
        assert classify_grade(a["grade_text"]) == GradeCategory.accepted  # only accepted narrations, grading verbatim


def test_nothing_is_shown_when_the_model_picks_nothing_or_the_feature_is_off(run, unsourced, monkeypatch):
    text, quote = unsourced
    extracted = [claim(type="hadith", quote=quote)]
    (card,) = run(text, ScriptedLLM(extracted, judge_index=-1, select=[]))["cards"]
    assert card["alternatives"] == []
    monkeypatch.setattr(settings, "features_alternatives", False)
    (card,) = run(text, ScriptedLLM(extracted, judge_index=-1, select=[0]))["cards"]
    assert card["alternatives"] == []


def test_at_most_three(run, unsourced):
    text, quote = unsourced
    (card,) = run(text, ScriptedLLM([claim(type="hadith", quote=quote)], judge_index=-1, select=[0, 1, 2, 3, 4, 5]))["cards"]
    assert len(card["alternatives"]) <= 3


def test_never_for_a_verse_a_ruling_a_request_or_a_narration_that_has_its_reference(run, ayah, matn):
    verse = ayah(2, 153)[1]
    (card,) = run(f"قال الله تعالى: ﴿{verse}﴾", ScriptedLLM([], select=[0]))["cards"]
    assert card["claim_type"] == "ayah" and card["alternatives"] == []
    ruling = "صيام شهر رمضان واجب على كل مسلم بالغ قادر."
    (card,) = run(ruling, ScriptedLLM([claim(quote=ruling.rstrip("."), content_level="C")], judge_index=-1, select=[0]))["cards"]
    assert card["alternatives"] == []
    request = "أعطني حديثاً يثبت أن من أكل التفاح على الريق دخل الجنة."
    for card in run(request, ScriptedLLM([claim(type="request", quote=request.rstrip("."), content_level="B")], select=[0]))["cards"]:
        assert card["alternatives"] == []  # a request for evidence is refused, not served
    sound = matn("4560")
    cards = run(f"قال رسول الله صلى الله عليه وسلم: «{sound}»", ScriptedLLM([], select=[0]))["cards"]
    assert cards and all(c["alternatives"] == [] for c in cards if c["state"] in ("supported", "supported_with_note"))
