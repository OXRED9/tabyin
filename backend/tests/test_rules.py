import pytest
from pydantic import ValidationError

from tabayyun.evidence_rules import (
    GradeCategory,
    apply_level_caps,
    attribution_in_sahihayn,
    classify_grade,
    decide_ayah,
    decide_hadith,
    decide_quote,
    decide_request,
    decide_ruling,
)
from tabayyun.schemas import Action, Card, ClaimType, ContentLevel, EvidenceState, SourceRef

S = EvidenceState
A, W, F, M, U = GradeCategory.accepted, GradeCategory.weak, GradeCategory.fabricated, GradeCategory.mixed, GradeCategory.unknown


# ---- gradings are classified from the source's own wording (these are grading terms, not narrations)
@pytest.mark.parametrize(
    "text,expected",
    [
        ("صحيح", A), ("حسن", A), ("حسن لغيره", A), ("إسناده صحيح", A), ("صحيح على شرط البخاري", A), ("حسن صحيح", A),
        ("قال النووي: حديث حسن", A), ("أخرجه في صحيحه", A), ("ثابت", A), ("إسناده جيد", A),
        ("ضعيف", W), ("ضعيف جداً", W), ("إسناده ضعيف", W), ("لا يصح", W), ("ليس بصحيح", W), ("منكر", W), ("لا يثبت", W),
        ("موضوع", F), ("لا أصل له", F), ("باطل", F), ("كذب مختلق", F),
        ("حديث أبي ذر ضعيف، وحديث معيقيب صحيح", M),
        ("غريب من هذا الوجه", U), ("", U), (None, U), ("سكت عنه", U),
    ],
)  # fmt: skip
def test_classify_grade(text, expected):
    assert classify_grade(text) == expected


def test_attribution_in_sahihayn():
    assert attribution_in_sahihayn("متفق عليه")
    assert attribution_in_sahihayn("رواه البخاري")
    assert attribution_in_sahihayn("رواه مسلم")
    assert not attribution_in_sahihayn("رواه الترمذي وأحمد")
    assert not attribution_in_sahihayn(None)


# ---- ayah
def ayah(**kw):
    base = dict(found=True, exact=False, similarity=0.0, quoted_words=8, explicit_attribution=True)
    return decide_ayah(**{**base, **kw})


def test_ayah_rules():
    assert ayah(exact=True, similarity=1.0).state == S.supported
    assert ayah(similarity=0.90).state == S.supported_with_note
    assert ayah(similarity=0.85).state == S.supported_with_note
    assert ayah(similarity=0.84).state == S.contradicted
    assert ayah(similarity=0.70, explicit_attribution=False).state == S.needs_review
    assert ayah(similarity=0.59).state == S.not_found
    assert ayah(found=False).state == S.not_found


def test_ayah_actions_follow_states():
    assert ayah(exact=True, similarity=1.0).action == Action.adopt
    assert ayah(similarity=0.90).action == Action.correct_wording
    assert ayah(similarity=0.70).action == Action.remove_and_warn
    assert ayah(found=False).action == Action.remove_or_request_source


# ---- hadith
def hadith(**kw):
    base = dict(found=True, similarity=1.0, paraphrase=False, grade_categories=[A], in_sahihayn=False, quoted_words=8)
    return decide_hadith(**{**base, **kw})


def test_hadith_rules():
    assert hadith().state == S.supported
    assert hadith(similarity=0.90).state == S.supported_with_note
    assert hadith(similarity=0.80).state == S.supported_with_note
    assert hadith(similarity=0.70).state == S.needs_review
    assert hadith(similarity=0.59).state == S.not_found
    assert hadith(found=False).state == S.not_found
    assert hadith(grade_categories=[W]).state == S.needs_review
    assert hadith(grade_categories=[F]).state == S.contradicted
    assert hadith(grade_categories=[W, F]).state == S.contradicted
    assert hadith(grade_categories=[A, W]).state == S.needs_review
    assert hadith(grade_categories=[A, W]).rule_id == "hadith.grading_conflict"
    assert hadith(grade_categories=[M]).state == S.needs_review
    assert hadith(grade_categories=[], in_sahihayn=True).state == S.supported
    assert hadith(grade_categories=[U]).state == S.needs_review


def test_hadith_without_any_grading_is_never_supported():
    d = hadith(grade_categories=[])
    assert d.state == S.needs_review and d.grade_unavailable
    d = hadith(grade_categories=[], grading_source_reachable=False)
    assert d.state == S.needs_review and "حالياً" in d.note_ar


def test_hadith_paraphrase_is_supported_with_note_only_with_an_accepted_grading():
    assert hadith(similarity=0.4, paraphrase=True).state == S.supported_with_note
    assert hadith(similarity=0.4, paraphrase=True, grade_categories=[W]).state == S.needs_review
    assert hadith(similarity=0.4, paraphrase=True, grade_categories=[]).state == S.needs_review


def test_short_hadith_quotes_need_a_near_exact_match():
    assert hadith(similarity=0.85, quoted_words=4).state == S.needs_review
    assert hadith(similarity=0.97, quoted_words=4).state == S.supported
    assert hadith(similarity=1.0, quoted_words=2).state == S.needs_review


def test_sahihayn_narration_is_not_made_disputed_by_a_weak_chain_elsewhere():
    assert hadith(grade_categories=[A, W], in_sahihayn=True).state == S.supported


# ---- rulings, quotes, requests, level caps
def test_ruling_rules():
    assert decide_ruling(level=ContentLevel.A, explicit_text_found=True).state == S.supported
    assert decide_ruling(level=ContentLevel.A, explicit_text_found=False).state == S.needs_review
    assert decide_ruling(level=ContentLevel.B, explicit_text_found=True).state == S.supported
    assert decide_ruling(level=ContentLevel.B, explicit_text_found=False).state == S.needs_review
    for found in (True, False):
        c = decide_ruling(level=ContentLevel.C, explicit_text_found=found)
        assert c.state == S.needs_review and c.referral and c.disagreement_noted
        d = decide_ruling(level=ContentLevel.D, explicit_text_found=found)
        assert d.state == S.needs_review and d.referral and d.personal_case


def test_quote_rules():
    assert decide_quote(found=True, similarity=0.95, attribution_matches=True).state == S.supported
    assert decide_quote(found=True, similarity=0.95, attribution_matches=False).state == S.contradicted
    assert decide_quote(found=True, similarity=0.95, attribution_matches=None).state == S.needs_review
    assert decide_quote(found=True, similarity=0.80, attribution_matches=True).state == S.not_found
    assert decide_quote(found=False, similarity=0.0, attribution_matches=None).state == S.not_found


def test_request_is_refused_not_answered():
    d = decide_request()
    assert d.state == S.not_found and d.referral and d.action == Action.remove_or_request_source


@pytest.mark.parametrize("state_decision", [
    decide_quote(found=True, similarity=0.95, attribution_matches=True),
    decide_quote(found=True, similarity=0.95, attribution_matches=False),
    decide_quote(found=False, similarity=0.0, attribution_matches=None),
])  # fmt: skip
def test_level_c_is_capped_at_needs_review_and_level_d_gets_no_verdict(state_decision):
    c = apply_level_caps(state_decision, ContentLevel.C)
    assert c.state == S.needs_review and c.referral and c.disagreement_noted
    d = apply_level_caps(state_decision, ContentLevel.D)
    assert d.state == S.needs_review and d.personal_case and d.referral


def test_levels_a_and_b_do_not_change_a_decision():
    d = decide_quote(found=True, similarity=0.95, attribution_matches=True)
    assert apply_level_caps(d, ContentLevel.A).state == S.supported
    assert apply_level_caps(d, ContentLevel.B).state == S.supported


# ---- the schema itself refuses a "supported" card without source text, reference and URL
def card(**kw):
    base = dict(id="c1", index=1, claim_type=ClaimType.hadith, content_level=ContentLevel.A, text_as_quoted="x", state=S.supported, action=Action.adopt, rule_id="t")
    return Card(**{**base, **kw})


def test_supported_without_source_is_a_bug():
    for state in (S.supported, S.supported_with_note):
        with pytest.raises(ValidationError):
            card(state=state)
        for missing in ("text", "ref", "url"):
            fields = dict(kind="hadith", source_name="s", text="t", ref="r", url="u")
            fields[missing] = ""
            with pytest.raises(ValidationError):
                card(state=state, source=SourceRef(**fields))
    assert card(source=SourceRef(kind="hadith", source_name="s", text="t", ref="r", url="u")).state == S.supported
    assert card(state=S.not_found, action=Action.remove_or_request_source).source is None
