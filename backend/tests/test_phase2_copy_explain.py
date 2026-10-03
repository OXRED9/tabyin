"""F4 (copy the correct text) and F5 (why this verdict?)."""
import pytest

from tabayyun.config import settings
from tabayyun.dataversion import get_data_version
from tabayyun.evidence_rules.explain import Facts, describe
from tabayyun.schemas import ContentLevel

SUPPORTED = ("supported", "supported_with_note")


def card_of(report, kind):
    return next(c for c in report["cards"] if c["claim_type"] == kind)


# ------------------------------------------------------------------ F4: copy
def test_ayah_copy_is_the_uthmani_text_in_brackets_with_surah_and_ayah(verify_text, ayah):
    uthmani, clean = ayah(49, 6)
    card = card_of(verify_text(f"قال الله تعالى: ﴿{' '.join(clean.split()[:9])}﴾"), "ayah")
    assert card["copy_text"] == f"﴿{uthmani}﴾ [الحجرات: 6]"


def test_ayah_copy_covers_a_range(verify_text, ayah):
    card = card_of(verify_text(ayah(112, 1)[1] + " " + ayah(112, 2)[1]), "ayah")
    assert card["copy_text"].startswith("﴿" + ayah(112, 1)[0]) and card["copy_text"].endswith("[الإخلاص: 1-2]")


def test_misquoted_verse_copies_the_mushaf_wording_not_the_users(verify_text, ayah):
    words = ayah(2, 255)[1].split()[:22]
    wrong = words.copy()
    wrong[10] = ayah(55, 46)[1].split()[-1]
    card = card_of(verify_text("قال الله تعالى: ﴿" + " ".join(wrong) + "﴾"), "ayah")
    assert card["state"] in ("supported_with_note", "contradicted")
    assert card["copy_text"] == f"﴿{ayah(2, 255)[0]}﴾ [البقرة: 255]"
    assert wrong[10] not in card["copy_text"]


def test_hadith_copy_is_source_wording_reference_grading_and_link(verify_text, matn, hadith):
    card = card_of(verify_text(f"قال رسول الله صلى الله عليه وسلم: «{matn('2962')}»"), "hadith")
    lines = card["copy_text"].split("\n")
    assert card["source"]["text"].strip() in card["copy_text"]  # the source's wording, with its chain
    assert card["source"]["ref"] in lines
    assert any(l.startswith("الحكم: ") and card["grades"][0]["text"] in l and card["grades"][0]["source_name"] in l for l in lines)
    assert lines[-1] == card["source"]["url"]


def test_english_ui_copies_an_english_reference(verify_text, ayah, monkeypatch):
    from tabayyun.sources import quranenc

    async def none(*_a, **_k):
        return None

    monkeypatch.setattr(quranenc, "translation", none)
    card = card_of(verify_text(ayah(103, 3)[1], ui_lang="en"), "ayah")
    assert card["copy_text"].endswith("103:3]") and card["copy_text"].startswith("﴿")


def test_nothing_to_copy_without_an_asserted_source(verify_text):
    report = verify_text("أعطني حديثاً يثبت أن الجلوس في الشمس عبادة.\nأنا مسافر غداً فهل يجوز لي أن أفطر؟")
    assert report["cards"] and all(c["copy_text"] is None for c in report["cards"])


def test_copy_flag_off_removes_the_field(verify_text, ayah, monkeypatch):
    monkeypatch.setattr(settings, "features_copy", False)
    assert card_of(verify_text(ayah(49, 6)[1]), "ayah")["copy_text"] is None


# ------------------------------------------------------------------ F5: explain
def test_every_card_explains_itself_and_ends_with_its_limits(verify_text, ayah, matn):
    text = (
        f"قال الله تعالى: ﴿{ayah(49, 6)[1]}﴾\n"
        f"قال رسول الله صلى الله عليه وسلم: «{matn('4560')}»\n"
        "أعطني حديثاً يثبت أن السهر يزيد العمر.\n"
        "أنا مسافر غداً فهل يجوز لي أن أفطر؟"
    )
    report = verify_text(text)
    assert len(report["cards"]) == 4
    for card in report["cards"]:
        e = card["explain"]
        assert e["rule_ar"] and e["rule_en"] and e["limits_ar"] and e["limits_en"]
        assert e["level_reason_ar"] and e["level_reason_origin"] == "rule"  # no model in this run
        assert e["data_version"] == get_data_version() and e["match_ms"] >= 0
        assert [c["rank"] for c in e["candidates"]] == list(range(1, len(e["candidates"]) + 1))
        assert len(e["candidates"]) <= 5
        if card["state"] in SUPPORTED:
            chosen = [c for c in e["candidates"] if c["chosen"]]
            assert len(chosen) == 1 and chosen[0]["ref"] == card["source"]["ref"] and chosen[0]["rank"] == 1
        else:
            assert not any(c["chosen"] for c in e["candidates"])
    stages = report["summary"]["stage_seconds"]
    assert set(stages) == {"ingest", "extract", "match", "total"} and stages["total"] >= stages["match"]


def test_explanation_quotes_the_numbers_the_rule_used(verify_text, ayah, matn):
    words = ayah(2, 255)[1].split()[:22]
    words[10] = ayah(55, 46)[1].split()[-1]
    near = card_of(verify_text("قال الله تعالى: ﴿" + " ".join(words) + "﴾"), "ayah")["explain"]
    assert f"{near['similarity']:.2f}" in near["rule_ar"] and "0.85" in near["rule_ar"] and near["threshold"] == 0.85
    assert near["candidates"][0]["similarity"] > near["candidates"][1]["similarity"]  # best first

    exact = card_of(verify_text(ayah(49, 6)[1]), "ayah")["explain"]
    assert "18 كلمة" in exact["rule_ar"] and "3 كلمات" in exact["rule_ar"]

    h = card_of(verify_text(f"قال رسول الله صلى الله عليه وسلم: «{matn('2962')}»"), "hadith")
    assert h["grades"][0]["text"] in h["explain"]["rule_ar"]  # the grading is quoted verbatim in the rule sentence
    assert any(c["grade_text"] for c in h["explain"]["candidates"])


def test_not_found_explains_how_close_the_nearest_text_was(verify_text, matn):
    # A text with no source, built without inventing a saying: the words of three narrations, shuffled.
    import random

    from tabayyun.normalize import normalize_ar

    words = [w for hid in ("2962", "4560", "5907") for w in normalize_ar(matn(hid), drop_honorifics=True).split()]
    random.Random(7).shuffle(words)
    card = card_of(verify_text("قال رسول الله صلى الله عليه وسلم: «" + " ".join(words[:14]) + "»"), "hadith")
    e = card["explain"]
    assert card["state"] == "not_found" and "لم نبحث خارج المصادر المعتمدة" in e["limits_ar"]
    assert e["candidates"] and e["similarity"] is not None and e["similarity"] < e["threshold"]


@pytest.mark.parametrize(
    "rule_id",
    [
        "ayah.exact", "ayah.near", "ayah.altered", "ayah.altered_transcript", "ayah.partial_unattributed", "ayah.below_threshold", "ayah.none",
        "hadith.accepted_exact", "hadith.accepted_near", "hadith.accepted_paraphrase", "hadith.weak", "hadith.fabricated", "hadith.grading_conflict",
        "hadith.grading_unclear", "hadith.no_grading", "hadith.partial", "hadith.too_short", "hadith.none",
        "ruling.text_found", "ruling.no_text", "ruling.disputed", "ruling.personal_case",
        "quote.verbatim", "quote.misattributed", "quote.attribution_unknown", "quote.none", "request.no_fabrication",
        "quote.verbatim+level_c", "hadith.none+level_d",
    ],
)  # fmt: skip
def test_every_rule_has_a_plain_language_account_and_a_limits_line(rule_id):
    r = describe(rule_id, Facts(similarity=0.91, quoted_words=9, grade_text="صحيح", grade_source="المصدر", grade_count=2, level=ContentLevel.A))
    for text in (r.rule_ar, r.rule_en, r.limits_ar, r.limits_en):
        assert text and "{" not in text and rule_id.split("+")[0] not in text  # words, not a rule id
    if "+level_c" in rule_id:
        assert "المستوى (ج)" in r.rule_ar
    if "+level_d" in rule_id:
        assert "المستوى (د)" in r.rule_ar


def test_model_level_reason_is_labelled_as_the_models(monkeypatch):
    import asyncio

    from tabayyun import pipeline
    from tabayyun.ingest.text import ingest_text
    from tabayyun.sources.dorar import DorarClient
    from tests.llm_stubs import ScriptedLLM as ScriptedProvider
    from tests.llm_stubs import claim

    text = "قراءة الفاتحة واجبة على المأموم في الصلاة الجهرية."
    provider = ScriptedProvider([claim(quote=text.rstrip("."), content_level="C", certainty="ijtihadi", level_reason_ar="مسألة اختلفت فيها المذاهب", level_reason_en="A matter the schools differ on")])
    dorar = DorarClient()
    dorar.status = "disabled"
    monkeypatch.setattr(pipeline, "get_llm", lambda: provider)
    monkeypatch.setattr(pipeline, "get_dorar", lambda: dorar)

    async def ingest():
        return ingest_text(text)

    (card,) = asyncio.run(pipeline.collect(ingest))["cards"]
    e = card["explain"]
    assert e["level_reason_origin"] == "model" and e["level_reason_ar"] == "مسألة اختلفت فيها المذاهب"
    assert "المستوى (ج)" in e["rule_ar"] and card["state"] == "needs_review"


def test_explain_flag_off_removes_the_panel(verify_text, ayah, monkeypatch):
    monkeypatch.setattr(settings, "features_explain", False)
    assert card_of(verify_text(ayah(49, 6)[1]), "ayah")["explain"] is None


def test_meta_announces_flags_and_data_version():
    from tabayyun.meta import build_meta

    build_meta.cache_clear()
    meta = build_meta()
    assert meta["features"] == {"share_card": True, "copy": True, "explain": True}
    assert meta["data_version"] == get_data_version() and "quran 6236" in meta["data_version"]


def test_html_export_includes_the_explanation(verify_text, ayah):
    from tabayyun.report.export_html import render_report_html
    from tabayyun.schemas import Report

    r = verify_text(f"قال الله تعالى: ﴿{ayah(49, 6)[1]}﴾")
    report = Report.model_validate({"source": r["source"], "segments": r["segments"], "cards": r["cards"], "summary": r["summary"], "generated_at": "x"})
    html = render_report_html(report)
    assert "لماذا هذا الحكم؟" in html and "حدود هذا الحكم" in html and r["cards"][0]["explain"]["data_version"] in html
