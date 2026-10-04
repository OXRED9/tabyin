"""The full (LLM) path, driven by a scripted stand-in provider.

No real model is called: the stand-in returns what a model would be asked to return (locations of
citations, an index into retrieved texts). The tests check the plumbing and — more importantly —
that nothing the "model" says can become a verdict without a retrieved source behind it.
"""
import asyncio
import re

import pytest

from tabayyun import pipeline
from tabayyun.ingest.text import ingest_text
from tabayyun.sources.dorar import DorarClient
from tests.llm_stubs import NoLLM as NoModel
from tests.llm_stubs import ScriptedLLM as ScriptedProvider
from tests.llm_stubs import claim


@pytest.fixture()
def run(monkeypatch):
    def _run(text: str, provider, ui_lang="ar") -> dict:
        dorar = DorarClient()
        dorar.status = "disabled"
        monkeypatch.setattr(pipeline, "get_llm", lambda: provider)
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


def test_the_speakers_own_statement_gets_no_note_unless_a_text_was_found_for_it(run):
    """Tabayyun verifies what is quoted. A lecturer's explanation that no retrieved text states is
    left alone: no "needs review" on the speaker's own words (it read as a fault in the clip)."""
    text = "صيام شهر رمضان واجب على كل مسلم بالغ قادر."
    for level in ("A", "B"):
        report = run(text, ScriptedProvider([claim(quote=text.rstrip("."), evidence_ref="2:183", content_level=level)], judge_index=-1))
        assert report["cards"] == [] and any(e["code"] == "no_claims" for e in report["errors"])
    disputed = run(text, ScriptedProvider([claim(quote=text.rstrip("."), content_level="C")], judge_index=-1))["cards"]
    assert [c["state"] for c in disputed] == ["needs_review"] and disputed[0]["referral"]  # a matter marked as disputed is still flagged


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
        if card["match_kind"] == "paraphrase":  # the narration it may correspond to is shown, with its grading
            assert card["state"] == "needs_review" and card["rule_id"] == "hadith.possible_paraphrase"
            assert card["source"]["text"] and card["grades"] and card["referral"] and card["copy_text"] is None
    # the model's word alone never makes a paraphrase "supported" (it accepted a no-source text in the eval)
    assert states <= {"needs_review", "not_found"}
    (card,) = run(text, ScriptedProvider(extracted, judge_index=-1))["cards"]
    assert card["state"] in ("needs_review", "not_found")


def test_a_pointer_from_the_fallback_model_never_lifts_a_claim_to_supported(run, matn):
    """Found in the bake-off: weaker models pointed at a real narration for a text with no source.
    The backup model is not measured for that job, so its pointer is ignored."""
    ruling = "صيام شهر رمضان واجب على كل مسلم بالغ قادر."
    extracted = [claim(quote=ruling.rstrip("."), search_query="وجوب صيام رمضان", evidence_ref="2:183")]
    (primary,) = run(ruling, ScriptedProvider(extracted, judge_index=0))["cards"]
    assert primary["state"] == "supported"
    report = run(ruling, ScriptedProvider(extracted, judge_index=0, judge_from_fallback=True))
    assert report["cards"] == [] and "llm_fallback" in report["summary"]["warnings"]  # not supported, so no note

    words = matn("4560").split()
    reordered = " ".join(words[len(words) // 2 :] + words[: len(words) // 2])
    text = f"ذكر المحاضر ما معناه: {reordered}."
    narration = [claim(type="hadith", quote=reordered, explicit_attribution=False, certainty="not_applicable")]
    for idx in range(5):
        (card,) = run(text, ScriptedProvider(narration, judge_index=idx, judge_from_fallback=True))["cards"]
        assert card["state"] in ("needs_review", "not_found") and card["match_kind"] != "paraphrase"


def test_a_verse_with_one_changed_word_is_one_note_not_a_supported_fragment(run, ayah):
    """Seen with a real screenshot: the scan found the intact tail of a misquoted verse ("supported")
    and the model the whole misquotation ("with a note") — two notes for one verse."""
    words = ayah(23, 76)[1].split()
    assert len(words) == 8
    donor = ayah(2, 153)[1].split()[-1]
    altered = " ".join(words[:3] + [donor] + words[4:])  # the fourth word replaced by code
    text = f"قال الله تعالى:\n{altered}"
    for provider in (NoModel(), ScriptedProvider([claim(type="ayah", quote=altered)])):  # with and without a model
        (card,) = run(text, provider)["cards"]
        assert card["claim_type"] == "ayah" and card["text_as_quoted"] == altered
        assert card["state"] in ("supported_with_note", "contradicted") and card["diff"] and "76" in card["source"]["ref"]
    # no marker and no quotation marks: only the model can say where the quotation starts and ends
    bare = f"وصلتني هذه الرسالة {altered} فهل هي صحيحة"
    (card,) = run(bare, ScriptedProvider([claim(type="ayah", quote=altered, explicit_attribution=False)]))["cards"]
    assert card["text_as_quoted"] == altered and card["state"] != "supported" and card["diff"]


def test_a_wider_proposal_that_is_not_the_same_verse_does_not_replace_the_exact_fragment(run, ayah):
    fragment = " ".join(ayah(2, 153)[1].split()[-4:])
    prose = "اجتمع أهل الحي مساء أمس لمناقشة ما يتداوله الناس من أخبار وقال أحدهم"
    text = f"{prose} {fragment} ثم انصرفوا إلى بيوتهم بعد صلاة العشاء"
    report = run(text, ScriptedProvider([claim(type="ayah", quote=text)]))
    assert any(c["state"] == "supported" and c["text_as_quoted"] == fragment for c in report["cards"])


def test_a_personal_case_stays_a_personal_case_whatever_the_model_calls_it(run):
    """Seen in the evaluation: the model once typed a question about the asker's own divorce as a
    "request", and the answer became "no source" instead of the referral."""
    text = "طلقت زوجتي وأنا في حالة غضب شديد فهل يقع طلاقي؟"
    for proposed in ([claim(type="request", quote=text, content_level="B")], [claim(type="fact", quote=text, content_level="A")], []):
        (card,) = run(text, ScriptedProvider(proposed))["cards"]
        assert card["content_level"] == "D" and card["personal_case"] and card["referral"]
        assert card["state"] == "needs_review" and card["source"] is None


RULING = "صيام شهر رمضان واجب على كل مسلم بالغ قادر."


@pytest.mark.parametrize("level", ["C"])
def test_a_text_the_ruling_points_at_is_shown_without_raising_the_state(run, level):
    """Asked for by the team: a ruling that refers to its evidence shows that evidence from the sources
    — verbatim, with its grading — while the ruling itself stays for the scholars."""
    extracted = [claim(quote=RULING.rstrip("."), search_query="وجوب صيام رمضان", content_level=level)]
    report = run(RULING, ScriptedProvider(extracted, judge_index=0, evidence_relation="referenced"))
    (card,) = report["cards"]
    assert card["state"] == "needs_review" and card["match_kind"] == "referenced"
    assert card["source"]["text"] and card["source"]["ref"] and card["source"]["url"]
    assert card["grades"] and card["grades"][0]["text"]  # never shown without its grading, copied verbatim
    assert "لا يعني ترجيحاً" in card["note_ar"]


def test_explicit_support_still_needs_an_accepted_text_and_a_settled_matter(run):
    extracted = [claim(quote=RULING.rstrip("."), search_query="وجوب صيام رمضان", evidence_ref="2:183")]
    (settled,) = run(RULING, ScriptedProvider(extracted, judge_index=0))["cards"]
    assert settled["state"] == "supported" and settled["match_kind"] == "topic"
    disputed = [claim(quote=RULING.rstrip("."), search_query="وجوب صيام رمضان", content_level="C")]
    (card,) = run(RULING, ScriptedProvider(disputed, judge_index=0))["cards"]  # the model says "explicit support"
    assert card["state"] == "needs_review" and card["match_kind"] == "referenced" and card["referral"]


def test_no_evidence_is_shown_for_a_personal_case_or_when_the_model_points_at_nothing(run):
    personal = [claim(quote=RULING.rstrip("."), search_query="وجوب صيام رمضان", content_level="D")]
    (card,) = run(RULING, ScriptedProvider(personal, judge_index=0, evidence_relation="referenced"))["cards"]
    assert card["source"] is None and card["match_kind"] == "none"
    nothing = [claim(quote=RULING.rstrip("."), search_query="وجوب صيام رمضان", content_level="C")]
    (card,) = run(RULING, ScriptedProvider(nothing, judge_index=-1))["cards"]
    assert card["source"] is None and card["match_kind"] == "none"


def test_a_narration_recited_then_referred_to_again_is_one_note(run, matn):
    """Seen on the example clip: the narration, then «رواه … حديث "…"، من أعظم الأحاديث» — which came back
    as a second note for its opening words and a third, "needs review", for the remark about it."""
    full = matn("4560")
    body = re.split(r'[«"“]', full, maxsplit=1)[-1]  # past the chain of narration, into the wording itself
    opening = " ".join(body.split()[:4]).strip("،,.؛ ")
    remark = f'رواه مسلم حديث "{opening}"، من أعظم الأحاديث وبه بدأ المصنف كتابه'
    text = f"قال رسول الله صلى الله عليه وسلم: «{full}».\nثم قال الخطيب: {remark}. وقالوا: ثلث العلم."
    proposals = [
        claim(type="fact", quote=remark, content_level="A"),  # what the model tends to add
        claim(type="hadith", quote=opening),
        claim(type="attributed_quote", quote="ثلث العلم", content_level="B"),
    ]
    for provider in (NoModel(), ScriptedProvider(proposals, judge_index=-1)):
        cards = run(text, provider)["cards"]
        assert [c["claim_type"] for c in cards] == ["hadith"], [(c["claim_type"], c["text_as_quoted"][:30]) for c in cards]
        assert cards[0]["state"] in ("supported", "supported_with_note") and len(cards[0]["text_as_quoted"].split()) > 5  # the fullest occurrence


def test_a_ruling_that_quotes_its_evidence_keeps_its_own_note(run, ayah):
    verse = ayah(2, 183)[1]
    ruling = "صيام شهر رمضان واجب على كل مسلم بالغ قادر"
    text = f"{ruling}، لقوله تعالى: ﴿{verse}﴾."
    for level, expected in (("C", ["ayah", "ruling"]), ("A", ["ayah"])):  # a disputed ruling keeps its note; an unconfirmed statement has none
        cards = run(text, ScriptedProvider([claim(type="ruling", quote=f"{ruling}، لقوله تعالى: ﴿{verse}﴾", content_level=level, search_query="وجوب صيام رمضان")], judge_index=-1))["cards"]
        assert sorted(c["claim_type"] for c in cards) == expected


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


def test_a_request_served_by_the_fallback_model_is_flagged_for_the_ui(run):
    text = "طلقت زوجتي وأنا غضبان فهل يقع الطلاق؟"
    provider = ScriptedProvider([claim(quote=text.rstrip("؟"), content_level="D", certainty="ijtihadi")], fallback=True)
    report = run(text, provider)
    assert report["summary"]["mode"] == "full" and "llm_fallback" in report["summary"]["warnings"]
    assert report["cards"][0]["personal_case"]


def test_model_claims_do_not_duplicate_what_the_scans_already_found(run, ayah):
    verse = ayah(49, 6)[1]
    text = f"قال الله تعالى: ﴿{verse}﴾ وهذا أصل في التثبت."
    provider = ScriptedProvider([claim(type="ayah", quote=verse, explicit_attribution=True, certainty="not_applicable")])
    report = run(text, provider)
    assert len(report["cards"]) == 1 and report["cards"][0]["rule_id"] == "ayah.exact"


def test_a_report_of_what_the_prophet_said_is_an_attribution_and_a_biographical_remark_is_not():
    from tabayyun.extract.lexical import attributes_to_revelation as attributed

    for text in ("وقد ضربَ النبي ﷺ مثلاً بعبادة الهجرة", "وقد نهى النبي ﷺ عن ذلك", "بيّن لنا رسولنا الكريم فضل الصدقة",
                 "كما جاء في الحديث أن ذلك من الإيمان", "يخبرنا الله في كتابه بعاقبة الصابرين", "وهذا من سنة النبي ﷺ"):  # fmt: skip
        assert attributed(text), text
    for text in ("ولد النبي ﷺ في مكة", "هاجر رسول الله إلى المدينة", "وهكذا جميع العبادات تحتاج إلى نية سابقة", "النية محلها القلب"):
        assert not attributed(text), text


def test_a_report_by_meaning_is_never_given_a_reference(run, matn):
    """The worst error this tool can make, reported by the team on the example clip: the lecturer
    recited a narration, then said "the Prophet gave the example of ...", and that sentence was shown
    as «له مرجعية» with the narration's grading. A report by meaning is not a text: whatever the
    pointer says — even "explicit support" from the narration recited beside it — it stays "needs
    review"; the source's wording is shown for comparison and the note says whose grading it is."""
    full = matn("4560")
    words = [w for w in re.split(r"\s+", re.split(r'[«"“]', full, maxsplit=1)[-1]) if len(w) > 3][:6]
    restated = "وقد ضرب النبي ﷺ مثلاً في هذا فقال ما معناه: " + " ".join(words)  # the narration's own words, re-ordered into a report
    proposal = [claim(type="fact", quote=restated, content_level="B", search_query=" ".join(words[:4]))]

    recited = f"قال رسول الله صلى الله عليه وسلم: «{full}».\n{restated}."
    for relation, judge_index in (("explicit_support", 0), ("referenced", 0), ("none", -1)):
        cards = run(recited, ScriptedProvider(proposal, judge_index=judge_index, evidence_relation=relation))["cards"]
        assert [c["claim_type"] for c in cards] == ["hadith", "fact"], relation
        note = cards[1]
        assert note["state"] == "needs_review" and note["rule_id"] == "attribution.by_meaning" and note["referral"], relation
        # the recited narration is shown beside it for comparison — as referenced evidence, never as its source of support
        assert note["match_kind"] == "referenced" and note["source"]["url"] == cards[0]["source"]["url"], relation
        assert "لا حكم هذا الكلام" in note["note_ar"]

    alone = run(restated + ".", ScriptedProvider(proposal, judge_index=0, evidence_relation="explicit_support"))["cards"]
    assert [(c["state"], c["rule_id"]) for c in alone] == [("needs_review", "attribution.by_meaning")]


def test_a_statement_about_what_the_prophet_did_is_never_given_a_reference_by_a_pointer(run):
    """Wider than the attribution marker: "the Prophet used to ..." is a report about him by meaning.
    It has no saying-verb, so it is the speaker's statement and gets no note of its own — and even when
    the pointer says an accepted narration states it explicitly, it is not shown as «له مرجعية»."""
    from tabayyun.extract.lexical import attributes_to_revelation, mentions_prophet

    text = "كان النبي ﷺ يصوم الاثنين والخميس من كل أسبوع."
    assert mentions_prophet(text) and not attributes_to_revelation(text)
    assert mentions_prophet("The Prophet used to fast on Mondays") and attributes_to_revelation("The Prophet said that fasting is a shield")
    assert not mentions_prophet("صيام شهر رمضان واجب على كل مسلم بالغ قادر")
    proposal = [claim(type="fact", quote=text.rstrip("."), content_level="A", search_query="صيام الاثنين والخميس")]
    report = run(text, ScriptedProvider(proposal, judge_index=0, evidence_relation="explicit_support"))
    assert all(c["state"] != "supported" for c in report["cards"]) and report["cards"] == []


def test_a_scan_hit_that_straddles_the_opening_quotation_mark_is_not_a_note():
    """Reported by the team: «قال رسول الله ﷺ: «…»» gave an «exact» note on the introduction plus the
    first words of the quotation (they matched some other narration), and the quotation itself a
    second note. The quotation marks decide: one quotation, one note."""
    from tabayyun.extract import absorb_closed_quotes
    from tabayyun.extract.models import RawClaim
    from tabayyun.schemas import ClaimType

    closed = RawClaim(type=ClaimType.hadith, quote="q", start=35, end=118, closed=True, explicit_attribution=True, origin="marker")
    straddling = RawClaim(type=ClaimType.hadith, quote="s", start=4, end=55, origin="hadith_scan")
    covering = RawClaim(type=ClaimType.hadith, quote="c", start=10, end=130, origin="hadith_scan")  # chain and wording: kept
    assert absorb_closed_quotes([straddling], [closed]) == [closed]
    assert covering in absorb_closed_quotes([covering], [closed])
    nested = RawClaim(type=ClaimType.hadith, quote="n", start=35, end=200, origin="hadith_scan")  # past an inner closing mark: kept
    assert nested in absorb_closed_quotes([nested], [closed])

