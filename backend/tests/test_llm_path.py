"""The full (LLM) path, driven by a scripted stand-in provider.

No real model is called: the stand-in returns what a model would be asked to return (locations of
citations, an index into retrieved texts). The tests check the plumbing and — more importantly —
that nothing the "model" says can become a verdict without a retrieved source behind it.
"""
import asyncio

import pytest

from tabayyun import pipeline
from tabayyun.extract.models import LLMClaim, LLMClaims, LLMJudgement
from tabayyun.extract.prompts import EXTRACT_SYSTEM, JUDGE_SYSTEM
from tabayyun.ingest.text import ingest_text
from tabayyun.llm.base import LLMError
from tabayyun.llm.router import LLMRouter
from tabayyun.sources.dorar import DorarClient


class ScriptedProvider:
    name = "scripted"
    available = True

    def __init__(self, claims=None, judge_index=-1, fail=False, name="scripted"):
        self.name = name
        self.claims = claims or []
        self.judge_index = judge_index
        self.fail = fail
        self.calls: list[str] = []

    async def complete_json(self, *, system, user, schema, model_cls, max_tokens=8000):
        if self.fail:
            raise LLMError("scripted failure", cooldown=30)
        if system == EXTRACT_SYSTEM:
            self.calls.append("extract")
            return LLMClaims(claims=self.claims)
        assert system == JUDGE_SYSTEM
        self.calls.append("judge")
        relation = "none" if self.judge_index < 0 else ("same_narration" if 'task = "hadith_match"' in user else "explicit_support")
        return LLMJudgement(best_index=self.judge_index, relation=relation)


def claim(**kw) -> LLMClaim:
    base = dict(type="ruling", quote="", attributed_to="", explicit_attribution=False, content_level="A", certainty="definitive", search_query="", evidence_ref="")
    return LLMClaim(**{**base, **kw})


@pytest.fixture()
def run(monkeypatch):
    def _run(text: str, provider, ui_lang="ar") -> dict:
        dorar = DorarClient()
        dorar.status = "disabled"
        router = LLMRouter(providers=[provider] if not isinstance(provider, list) else provider)
        monkeypatch.setattr(pipeline, "get_llm", lambda: router)
        monkeypatch.setattr(pipeline, "get_dorar", lambda: dorar)

        async def ingest():
            return ingest_text(text)

        return asyncio.run(pipeline.collect(ingest, ui_lang=ui_lang))

    return _run


def test_definitive_ruling_is_supported_only_through_a_verse_fetched_from_the_mushaf(run, ayah):
    text = "صيام شهر رمضان واجب على كل مسلم بالغ قادر."
    provider = ScriptedProvider([claim(quote=text.rstrip("."), search_query="وجوب صيام رمضان", evidence_ref="2:183")], judge_index=0)
    report = run(text, provider)
    (card,) = report["cards"]
    assert report["summary"]["mode"] == "full" and provider.calls == ["extract", "judge"]
    assert card["claim_type"] == "ruling" and card["state"] == "supported" and card["match_kind"] == "topic"
    assert card["source"]["kind"] == "quran" and card["source"]["text"] == ayah(2, 183)[0]  # verbatim from the Mushaf
    assert "183" in card["source"]["ref"] and card["certainty"] == "definitive"


def test_ruling_stays_needs_review_when_the_model_points_at_nothing(run):
    text = "صيام شهر رمضان واجب على كل مسلم بالغ قادر."
    report = run(text, ScriptedProvider([claim(quote=text.rstrip("."), evidence_ref="2:183")], judge_index=-1))
    (card,) = report["cards"]
    assert card["state"] == "needs_review" and card["source"] is None and card["referral"]


def test_a_proposed_verse_unrelated_to_the_claim_is_ignored(run):
    # The "model" proposes a verse that shares no vocabulary with the claim and insists it fits.
    text = "الزكاة ركن من أركان الإسلام."
    report = run(text, ScriptedProvider([claim(quote=text.rstrip("."), evidence_ref="111:1", search_query="")], judge_index=0))
    (card,) = report["cards"]
    assert not (card["source"] and card["source"]["kind"] == "quran" and "المسد" in card["source"]["ref"])


@pytest.mark.parametrize("level,flag", [("C", "disagreement_noted"), ("D", "personal_case")])
def test_levels_c_and_d_are_never_supported_even_if_the_model_points_at_a_text(run, level, flag):
    text = "قراءة الفاتحة واجبة على المأموم في الصلاة الجهرية."
    report = run(text, ScriptedProvider([claim(quote=text.rstrip("."), content_level=level, certainty="definitive", evidence_ref="1:2")], judge_index=0))
    (card,) = report["cards"]
    assert card["state"] == "needs_review" and card[flag] and card["referral"] and card["certainty"] == "ijtihadi"


def test_a_quote_that_is_not_in_the_input_is_dropped(run, matn):
    invented = matn("2962")  # real narration text, but NOT present in the input
    report = run("هذا نص عادي يتحدث عن أهمية العلم وطلبه.", ScriptedProvider([claim(type="hadith", quote=invented, explicit_attribution=True)]))
    assert report["cards"] == [] and any(e["code"] == "no_claims" for e in report["errors"])


def test_paraphrased_narration_needs_the_models_pointer_and_shared_vocabulary(run, matn, hadith):
    words = matn("4560").split()
    reordered = " ".join(words[len(words) // 2 :] + words[: len(words) // 2])  # same words, clauses swapped
    text = f"ذكر المحاضر ما معناه: {reordered}."
    extracted = [claim(type="hadith", quote=reordered, explicit_attribution=False, certainty="not_applicable")]
    # which candidate is the right narration is not known in advance: try pointing at each
    states = set()
    for idx in range(5):
        (card,) = run(text, ScriptedProvider(extracted, judge_index=idx))["cards"]
        states.add(card["state"])
        if card["state"] == "supported_with_note":
            assert card["match_kind"] == "paraphrase" and card["source"]["text"] and card["grades"]
    assert "supported" not in states  # a paraphrase is never plain "supported"
    (card,) = run(text, ScriptedProvider(extracted, judge_index=-1))["cards"]
    assert card["state"] in ("needs_review", "not_found")


def test_sound_narration_attributed_to_someone_else_is_contradicted(run, matn):
    narration = matn("4560")
    text = f"قال أحد الدعاة المعاصرين من كلامه: «{narration}»"
    provider = ScriptedProvider([claim(type="attributed_quote", quote=narration, attributed_to="أحد الدعاة المعاصرين", explicit_attribution=True, content_level="B", certainty="not_applicable")])
    cards = run(text, provider)["cards"]
    quote_cards = [c for c in cards if c["claim_type"] == "attributed_quote"]
    assert quote_cards and quote_cards[0]["state"] == "contradicted" and quote_cards[0]["source"]["url"].startswith("https://hadeethenc.com/")


def test_provider_failure_falls_back_to_lexical_only_mode(run, ayah):
    report = run(f"قال الله تعالى: ﴿{ayah(49, 6)[1]}﴾", ScriptedProvider(fail=True))
    assert report["summary"]["mode"] == "lexical_only"
    assert any(e["code"] == "llm_unavailable" for e in report["errors"])
    assert report["cards"][0]["state"] == "supported"  # the Mushaf scan does not need a model


def test_router_fails_over_to_the_second_provider(run):
    text = "طلقت زوجتي وأنا غضبان فهل يقع الطلاق؟"
    second = ScriptedProvider([claim(quote=text.rstrip("؟"), content_level="D", certainty="ijtihadi")])
    report = run(text, [ScriptedProvider(fail=True, name="primary"), second])
    assert report["summary"]["mode"] == "full" and second.calls == ["extract"]
    assert report["cards"][0]["personal_case"]


def test_model_claims_do_not_duplicate_what_the_scans_already_found(run, ayah):
    verse = ayah(49, 6)[1]
    text = f"قال الله تعالى: ﴿{verse}﴾ وهذا أصل في التثبت."
    provider = ScriptedProvider([claim(type="ayah", quote=verse, explicit_attribution=True, certainty="not_applicable")])
    report = run(text, provider)
    assert len(report["cards"]) == 1 and report["cards"][0]["rule_id"] == "ayah.exact"
