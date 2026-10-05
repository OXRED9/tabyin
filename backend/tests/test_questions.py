"""A question put to the tool is referred, never answered: Tabayyun verifies what is quoted.

Referral goes only to the fatwa sites of the challenge's approved package, as links that search the
site for the topic. Nothing is fetched from them.
"""
import asyncio

import pytest

from tabayyun import pipeline
from tabayyun.ingest.text import ingest_text
from tabayyun.meta import REFERRAL_LINKS
from tabayyun.sources.dorar import DorarClient
from tests.llm_stubs import NoLLM, ScriptedLLM, claim

QUESTION = "ما حكم الزكاة؟"
PERSONAL = "طلقت زوجتي وأنا في حالة غضب شديد فهل يقع طلاقي؟"
FABRICATE = "أعطني حديثاً يثبت أن من أكل التفاح على الريق دخل الجنة."


@pytest.fixture()
def run(monkeypatch):
    def _run(text: str, provider) -> list[dict]:
        dorar = DorarClient()
        dorar.status = "disabled"
        monkeypatch.setattr(pipeline, "get_llm", lambda: provider)
        monkeypatch.setattr(pipeline, "get_dorar", lambda: dorar)

        async def ingest():
            return ingest_text(text)

        return asyncio.run(pipeline.collect(ingest))["cards"]

    return _run


def assert_referred(card: dict) -> None:
    assert card["is_question"] and card["rule_id"] == "question.referral"
    assert card["state"] == "needs_review" and card["referral"] and not card["personal_case"]
    assert card["source"] is None and card["grades"] == [] and card["alternatives"] == []  # nothing is offered as an answer
    assert "لا يجيب عما يُسأل" in card["note_ar"]


def test_a_question_is_referred_without_any_model(run):
    (card,) = run(QUESTION, NoLLM())
    assert_referred(card)
    assert "الزكاة" in card["referral_query"]


@pytest.mark.parametrize("kind,level", [("request", "B"), ("ruling", "A"), ("fact", "A")])
def test_a_question_stays_a_question_whatever_the_model_calls_it(run, kind, level):
    proposed = [claim(type=kind, quote=QUESTION, content_level=level, search_query="حكم الزكاة", evidence_ref="2:43")]
    provider = ScriptedLLM(proposed, judge_index=0)
    (card,) = run(QUESTION, provider)
    assert_referred(card)
    assert card["referral_query"] == "حكم الزكاة" and "judge" not in provider.calls  # no retrieval, no pointing


def test_a_request_to_produce_evidence_is_still_refused_not_referred(run):
    for provider in (NoLLM(), ScriptedLLM([claim(type="request", quote=FABRICATE.rstrip("."), content_level="B")])):
        (card,) = run(FABRICATE, provider)
        assert card["rule_id"] == "request.no_fabrication" and card["state"] == "not_found" and not card["is_question"]


def test_a_personal_case_keeps_its_own_message_and_sends_no_personal_detail(run):
    (card,) = run(PERSONAL, NoLLM())
    assert card["personal_case"] and not card["is_question"] and card["referral"]
    assert card["referral_query"] is None  # without topic keywords the link opens the site's first page
    (card,) = run(PERSONAL, ScriptedLLM([claim(type="ruling", quote=PERSONAL, content_level="D", search_query="طلاق الغضبان")]))
    assert card["personal_case"] and card["referral_query"] == "طلاق الغضبان"


def test_a_question_inside_a_long_text_is_the_speakers_own(run):
    filler = "اجتمع أهل الحي مساء أمس لمناقشة ما يتداوله الناس من أخبار، وتحدث كل واحد منهم بما عنده. " * 6
    cards = run(f"{filler}ثم قال أحدهم: لماذا نتأخر عن الموعد كل مرة؟ {filler}", NoLLM())
    assert not any(c["is_question"] for c in cards)


def test_a_verse_quoted_inside_a_question_is_still_verified(run, ayah):
    verse = ayah(2, 153)[1]
    cards = run(f"هل هذه آية: ﴿{verse}﴾؟", NoLLM())
    assert any(c["claim_type"] == "ayah" and c["state"] == "supported" for c in cards)


def test_referral_goes_only_to_the_four_approved_references_as_links():
    """The four references the challenge's package names for rulings (its page 12): three sites with a
    search address, and the Kuwaiti encyclopedia, whose search page is opened as it is."""
    fatwa = [link for link in REFERRAL_LINKS if link["kind"] == "fatwa"]
    assert [link["url"].split("/")[2] for link in fatwa] == ["islamqa.info", "binbaz.org.sa", "binothaimeen.net", "bohoth.awqaf.gov.kw"]
    for link in fatwa[:3]:
        assert "{q}" in link["search_url"] and link["search_url"].startswith(link["url"].split("/ar")[0]) and link["max_words"] >= 2
    assert fatwa[3]["search_url"] is None


def test_a_question_is_referred_to_the_nearest_ibn_uthaymeen_page_by_title_only(monkeypatch):
    """Matched here, by title: no model, nothing fetched, nothing of the fatwa shown but its title."""
    from tabayyun.sources import binothaimeen

    pages = [
        {"title": "حكم صيام يوم السبت منفرداً", "url": "https://binothaimeen.net/ar/a", "collection": "الصيام"},
        {"title": "الحكمة من النهي عن إفراد يوم الجمعة بالصيام", "url": "https://binothaimeen.net/ar/b", "collection": "الصيام"},
        {"title": "حكم صلاة الجماعة", "url": "https://binothaimeen.net/ar/c", "collection": "الصلاة"},
    ] + [{"title": f"عنوان آخر رقم {chr(0x0627 + i % 20)}{i}", "url": f"https://binothaimeen.net/ar/x{i}", "collection": ""} for i in range(40)]
    index = binothaimeen.TitleIndex(pages)
    assert index.nearest("صيام يوم الجمعة").url.endswith("/b")
    assert index.nearest("صلاة الجماعة").url.endswith("/c")
    assert index.nearest("حكم الموسيقى") is None  # no title covers it: the search link stays


@pytest.mark.parametrize("text", ["حكم القزع", "حكم القزع؟", "وش حكم القزع", "هل القزع حرام", "القزع حرام؟", "ما حكم القزع"])
def test_a_ruling_asked_the_way_people_type_it_is_a_question(text):
    from tabayyun.extract.lexical import looks_like_question

    assert looks_like_question(text)


def test_a_statement_with_a_ruling_word_is_not_a_question():
    from tabayyun.extract.lexical import looks_like_question

    assert not looks_like_question("وصيام رمضان واجب على كل مسلم بالغ قادر.")


def test_a_general_question_the_model_called_personal_is_a_question_unless_it_speaks_of_the_asker():
    from tabayyun.extract import keep_questions
    from tabayyun.extract.lexical import is_fabrication_request, is_personal_case, looks_like_question
    from tabayyun.extract.models import RawClaim
    from tabayyun.schemas import ClaimType, ContentLevel

    def run(text):
        marker = RawClaim(type=ClaimType.ruling, quote=text, start=0, end=len(text), is_question=True, origin="marker")
        model = RawClaim(type=ClaimType.ruling, quote=text, start=0, end=len(text), content_level=ContentLevel.D, origin="llm")
        (out,) = keep_questions([model], [marker], looks_like_question, is_fabrication_request)
        return out

    assert run("حكم القزع؟").is_question
    assert not run("ما حكم طلاق زوجي لي وأنا حائض؟").is_question and is_personal_case("ما حكم طلاق زوجي لي وأنا حائض؟")

