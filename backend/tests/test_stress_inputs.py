"""Regressions found by the stress run of 6 Oct 2026 (formatting, repetition, small talk).

As everywhere in the tests, every religious text is read from the source data by reference."""
from tabayyun.evidence_rules import GradeCategory, decide_hadith


def kinds(report):
    return [("question" if c["is_question"] else c["claim_type"], c["state"]) for c in sorted(report["cards"], key=lambda c: c["position"])]


def test_a_verse_pasted_with_zero_width_spaces_between_its_words_is_found(verify_text, ayah):
    words = ayah(2, 153)[1].split()
    text = "‌".join(words[:2]) + " " + "​".join(words[2:])  # how some apps and sites space words
    assert kinds(verify_text(text)) == [("ayah", "supported")]


def test_a_narration_recited_three_times_is_one_supported_note(verify_text, matn):
    narration = matn("4560")
    report = verify_text(f"«{narration}» «{narration}» «{narration}»")
    assert kinds(report) == [("hadith", "supported")]


def test_one_changed_word_in_a_long_narration_is_not_verbatim(verify_text, matn):
    words = matn("4560").split()
    changed = " ".join(words[:2] + ["الناس"] + words[3:])  # a word that is not in the narration
    (card,) = verify_text(f"قال رسول الله صلى الله عليه وسلم: «{changed}»")["cards"]
    assert card["state"] == "supported_with_note" and card["match_kind"] != "exact"
    assert any(d["op"] != "equal" for d in card["diff"])


def test_the_rule_needs_identical_wording_for_supported():
    common = dict(found=True, similarity=0.98, paraphrase=False, grade_categories=[GradeCategory.accepted], in_sahihayn=True, quoted_words=30)
    assert decide_hadith(**common, wording_identical=False).state.value == "supported_with_note"
    assert decide_hadith(**common, wording_identical=True).state.value == "supported"
    assert decide_hadith(**common).state.value == "supported"  # unknown: the similarity decides, as before


def test_small_talk_is_not_referred_as_a_religious_question(verify_text):
    for text in ("السلام عليكم كيف الحال؟ ان شاء الله بخير", "Hello, how are you today? The weather is nice."):
        report = verify_text(text)
        assert report["cards"] == [] and any(e["code"] == "no_claims" for e in report["errors"])


def test_a_general_religious_question_is_still_referred(verify_text):
    for text in ("كيف أصلي صلاة الاستخارة؟", "ما معنى كلمة التقوى؟"):
        assert kinds(verify_text(text)) == [("question", "needs_review")]


def test_asking_whether_a_quoted_narration_is_authentic_gets_the_narrations_note_only(verify_text, matn):
    report = verify_text(f"هل حديث «{matn('4560')}» صحيح؟")
    assert kinds(report) == [("hadith", "supported")]


def test_a_question_about_a_quoted_verse_that_asks_for_a_ruling_keeps_its_referral(verify_text, ayah):
    report = verify_text(f"ما حكم من يقرأ ﴿{ayah(2, 153)[1]}﴾ في الصلاة بدون وضوء؟")
    assert ("question", "needs_review") in kinds(report) and ("ayah", "supported") in kinds(report)


def test_a_narration_introduced_as_a_scholars_saying_is_one_note(verify_text, matn):
    report = verify_text(f"قال ابن القيم: «{matn('4560')}»")
    (card,) = report["cards"]
    assert card["claim_type"] == "attributed_quote" and card["state"] == "contradicted"  # the source gives it as the Prophet's ﷺ
    assert card["source"]["url"].startswith("https://hadeethenc.com/")


def test_a_question_next_to_a_quotation_about_its_authenticity_gets_no_card_of_its_own(verify_text, ayah):
    report = verify_text(f"هل هذه آية؟ {ayah(2, 153)[1]}")
    assert kinds(report) == [("ayah", "supported")]


def test_a_whole_verse_followed_by_the_speakers_words_is_not_an_altered_verse(verify_text, ayah):
    report = verify_text(f"قال تعالى ﴿{ayah(49, 6)[1]} وهذه قاعدة في التثبت")
    assert kinds(report) == [("ayah", "supported")]


def test_a_verse_altered_at_its_end_is_still_caught(verify_text, ayah):
    words = ayah(49, 6)[1].split()
    report = verify_text("قال تعالى: ﴿" + " ".join(words[:-1] + ["غافلين"]) + "﴾")
    assert [k[1] for k in kinds(report)] in (["supported_with_note"], ["contradicted"])


def test_dialect_ways_of_asking_for_a_ruling_are_questions(verify_text):
    for text in ("ابي اعرف حكم صيام الست من شوال قبل القضاء", "أريد معرفة حكم الصلاة في الطائرة"):
        assert kinds(verify_text(text)) == [("question", "needs_review")]


def test_a_verse_presented_as_the_prophets_words_is_noted(verify_text, ayah):
    (card,) = verify_text(f"قال رسول الله صلى الله عليه وسلم: «{ayah(49, 6)[1]}»")["cards"]
    assert card["claim_type"] == "ayah" and card["state"] == "supported" and "النبي ﷺ" in card["note_ar"]


def test_a_narration_presented_as_quran_names_where_it_really_is(verify_text, matn):
    (card,) = verify_text(f"قال الله تعالى في كتابه: ﴿{matn('5516')}﴾")["cards"]
    assert card["claim_type"] == "ayah" and card["state"] == "not_found"
    assert "حديث" in card["note_ar"] and card["other_sources"] and card["other_sources"][0]["url"].startswith("https://hadeethenc.com/")


def test_an_unmarked_verse_with_a_changed_word_is_one_note_with_the_difference(verify_text, ayah):
    words = ayah(2, 153)[1].split()
    for changed in (words[:2] + ["الناس"] + words[3:], words[:-1] + ["الصادقين"]):
        (card,) = verify_text(" ".join(changed))["cards"]
        assert card["claim_type"] == "ayah" and card["state"] in ("supported_with_note", "needs_review")
        assert any(d["op"] != "equal" for d in card["diff"])


def test_the_speakers_words_beside_an_unmarked_verse_are_not_absorbed(verify_text, ayah):
    words = ayah(2, 153)[1].split()
    for text in ("وقال الخطيب الكريم " + " ".join(words[3:]), "تأمل " + " ".join(words[1:]), " ".join(words) + " وهذا يكفي"):
        (card,) = verify_text(text)["cards"]
        assert card["state"] == "supported", text
