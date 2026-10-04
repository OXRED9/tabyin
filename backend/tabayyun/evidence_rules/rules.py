"""Deterministic evidence-state rules.

Inputs are plain facts produced by retrieval (similarity, gradings copied from sources, whether a
source text exists). No model output can set a state here: an LLM may only have *proposed* which
candidate to look at; the numbers and the source records decide.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..schemas import STATE_ACTION, Action, ContentLevel, EvidenceState
from .grades import GradeCategory
from .thresholds import THRESHOLDS, Thresholds


@dataclass
class Decision:
    state: EvidenceState
    rule_id: str
    note_ar: str
    note_en: str
    referral: bool = False
    grade_unavailable: bool = False
    personal_case: bool = False
    disagreement_noted: bool = False
    warnings: list[str] = field(default_factory=list)

    @property
    def action(self) -> Action:
        return STATE_ACTION[self.state]


S = EvidenceState

PERSONAL_CASE_AR = "هذه حالة شخصية تستوجب فتوى من جهة مؤهلة"
PERSONAL_CASE_EN = "This is a personal case that requires a fatwa from a qualified body."
ABSTAIN_AR = "لم يُعثر على مصدر موثوق"
ABSTAIN_EN = "No reliable source was found."


# --------------------------------------------------------------------------- ayah


def decide_ayah(
    *,
    found: bool,
    exact: bool,
    similarity: float,
    quoted_words: int,
    explicit_attribution: bool,
    machine_transcribed: bool = False,
    t: Thresholds = THRESHOLDS,
) -> Decision:
    """``machine_transcribed``: the text came from speech recognition, so a wording difference may
    be the transcriber's, not the speaker's — the speaker is never said to have altered a verse."""
    if not found:
        return Decision(
            S.not_found,
            "ayah.none",
            "لم يُعثر على هذا النص في المصحف الشريف.",
            "This text was not found in the Mushaf.",
            referral=True,
        )
    if exact and (quoted_words >= t.ayah_min_exact_words or similarity >= 1.0):
        return Decision(
            S.supported,
            "ayah.exact",
            "النص مطابق لنص المصحف الشريف.",
            "The text matches the Mushaf verbatim.",
        )
    if similarity >= t.ayah_near:
        return Decision(
            S.supported_with_note,
            "ayah.near",
            "النص قريب من آية في المصحف مع اختلاف في اللفظ؛ يُصحَّح اللفظ وفق نص المصحف المعروض."
            + (" (قد يكون الاختلاف من التفريغ الآلي.)" if machine_transcribed else ""),
            "The text is close to a verse of the Mushaf but the wording differs; correct it to the Mushaf text shown."
            + (" (The difference may come from the machine transcript.)" if machine_transcribed else ""),
        )
    if similarity >= t.partial_floor(t.ayah_partial, quoted_words):
        if explicit_attribution and machine_transcribed:
            return Decision(
                S.needs_review,
                "ayah.altered_transcript",
                "لفظ التفريغ الآلي يخالف نص المصحف، وقد يكون الخطأ من التفريغ لا من المتحدث؛ النص الصحيح معروض، ويُراجَع المقطع عند موضعه.",
                "The machine transcript differs from the Mushaf; the error may be the transcription's rather than the speaker's. The correct text is shown; check the recording at this point.",
                referral=False,
            )
        if explicit_attribution:
            return Decision(
                S.contradicted,
                "ayah.altered",
                "نُسب هذا النص إلى القرآن الكريم ولفظه يخالف نص المصحف؛ النص الصحيح معروض مع موضعه.",
                "This text is attributed to the Quran but its wording departs from the Mushaf; the correct text and its location are shown.",
            )
        return Decision(
            S.needs_review,
            "ayah.partial_unattributed",
            "تشابه جزئي مع آية في المصحف دون نسبة صريحة إلى القرآن؛ يحتاج مراجعة.",
            "Partial similarity to a verse without an explicit attribution to the Quran; needs review.",
            referral=True,
        )
    return Decision(
        S.not_found,
        "ayah.below_threshold",
        "لم يُعثر على هذا النص في المصحف الشريف.",
        "This text was not found in the Mushaf.",
        referral=True,
    )


# --------------------------------------------------------------------------- hadith


def decide_hadith(
    *,
    found: bool,
    similarity: float,
    paraphrase: bool,
    grade_categories: list[GradeCategory],
    in_sahihayn: bool,
    quoted_words: int,
    grading_source_reachable: bool = True,
    t: Thresholds = THRESHOLDS,
) -> Decision:
    """``paraphrase`` means the candidate was confirmed as the same narration reported by meaning
    (lexical similarity alone is below the match threshold)."""
    if not found or (similarity < t.partial_floor(t.hadith_partial, quoted_words) and not paraphrase):
        return Decision(
            S.not_found,
            "hadith.none",
            "لم يُعثر على هذا الحديث في المصادر المعتمدة المتاحة.",
            "This hadith was not found in the approved sources available.",
            referral=True,
        )
    if quoted_words < t.hadith_min_words:
        return Decision(
            S.needs_review,
            "hadith.too_short",
            "النص المنقول أقصر من أن يُحدَّد به حديث بعينه.",
            "The quoted text is too short to identify a specific narration.",
            referral=True,
        )
    if similarity < t.hadith_required(quoted_words) and not paraphrase:
        return Decision(
            S.needs_review,
            "hadith.partial",
            "تشابه جزئي مع حديث في المصادر؛ يُعرض أقرب نص دون جزم بأنه المقصود.",
            "Partial similarity to a narration in the sources; the closest text is shown without asserting it is the one meant.",
            referral=True,
        )

    cats = set(grade_categories)
    accepted = GradeCategory.accepted in cats
    rejected = bool(cats & {GradeCategory.weak, GradeCategory.fabricated, GradeCategory.mixed})
    if in_sahihayn:
        # The narration is in al-Bukhari or Muslim. Gradings of other chains are still displayed as
        # found; they do not turn a narration of the two Sahihs into a disputed one.
        accepted, rejected = True, False
    if accepted and rejected:
        return Decision(
            S.needs_review,
            "hadith.grading_conflict",
            "تعارضت أحكام المحدّثين المنقولة من المصادر؛ تُعرض كما وردت دون ترجيح.",
            "The gradings copied from the sources conflict; they are shown as found, with no preference.",
            referral=True,
        )
    if GradeCategory.mixed in cats and not in_sahihayn:
        return Decision(
            S.needs_review,
            "hadith.grading_conflict",
            "الحكم المنقول من المصدر يفرّق بين روايات الحديث؛ يُعرض كما ورد دون ترجيح.",
            "The grading copied from the source distinguishes between versions of the narration; it is shown as found, with no preference.",
            referral=True,
        )
    if GradeCategory.fabricated in cats and not in_sahihayn:
        return Decision(
            S.contradicted,
            "hadith.fabricated",
            "الحديث محكوم عليه في المصدر بما يمنع نسبته إلى النبي ﷺ؛ الحكم منقول حرفياً.",
            "The source grades this narration as one that must not be attributed to the Prophet ﷺ; the grading is copied verbatim.",
        )
    if GradeCategory.weak in cats and not in_sahihayn:
        return Decision(
            S.needs_review,
            "hadith.weak",
            "الحديث مضعَّف في المصدر؛ الحكم منقول حرفياً.",
            "The source grades this narration as weak; the grading is copied verbatim.",
            referral=True,
        )
    if accepted:
        if similarity >= t.hadith_exact and not paraphrase:
            return Decision(
                S.supported,
                "hadith.accepted_exact",
                "النص مطابق لحديث في مصدر معتمد، والحكم منقول من المصدر.",
                "The text matches a narration in an approved source; the grading is copied from the source.",
            )
        if paraphrase:
            # Only the model says these words mean the same as the source's; their wording is too far
            # apart for the matcher to confirm it. In the evaluation the model accepted a text with no
            # source this way, so a paraphrase is shown with the narration it may correspond to and is
            # never "supported": a person decides.
            return Decision(
                S.needs_review,
                "hadith.possible_paraphrase",
                "قد يكون رواية بالمعنى لهذا الحديث؛ اللفظ بعيد عن لفظ المصدر فلا يُجزم به، ونص المصدر معروض للمقارنة.",
                "This may be the narration below reported by meaning; the wording is too far from the source's to confirm, so the source's text is shown for comparison.",
                referral=True,
            )
        return Decision(
            S.supported_with_note,
            "hadith.accepted_near",
            "الحديث ثابت في المصدر مع اختلاف يسير في اللفظ أو اقتباس مجتزأ.",
            "The narration is established in the source with a slight difference in wording or a partial quotation.",
        )
    if cats:  # gradings were copied, but none states acceptance or rejection in terms the rules recognise
        return Decision(
            S.needs_review,
            "hadith.grading_unclear",
            "أحكام المحدّثين منقولة كما وردت، ولا يُستخلص منها آلياً قبول أو ردّ صريح.",
            "The scholars' gradings are copied as found; no explicit acceptance or rejection can be derived from them automatically.",
            referral=True,
        )
    return Decision(
        S.needs_review,
        "hadith.no_grading",
        "وُجد النص في كتب السنة لكن الحكم غير متاح من المصدر"
        + ("." if grading_source_reachable else " حالياً (تعذّر الوصول إلى مصدر الأحكام)."),
        "The text was found in the hadith collections but no grading is available from a source"
        + ("." if grading_source_reachable else " right now (the grading source is unreachable)."),
        referral=True,
        grade_unavailable=True,
    )


# --------------------------------------------------------------------------- ruling


def decide_ruling(*, level: ContentLevel, explicit_text_found: bool) -> Decision:
    if level == ContentLevel.D:
        return Decision(
            S.needs_review, "ruling.personal_case", PERSONAL_CASE_AR, PERSONAL_CASE_EN, referral=True, personal_case=True
        )
    if level == ContentLevel.C:
        return Decision(
            S.needs_review,
            "ruling.disputed",
            "مسألة خلافية أو عالية الحساسية: يُعرض ما في المصادر دون ترجيح، ويُحال فيها إلى أهل العلم.",
            "A disputed or highly sensitive matter: what the sources say is shown without preference, and it is referred to scholars.",
            referral=True,
            disagreement_noted=True,
        )
    if explicit_text_found:
        return Decision(
            S.supported,
            "ruling.text_found",
            "للحكم مرجعية: نص صريح مسترجَع من مصدر معتمد.",
            "The ruling is backed by an explicit text retrieved from an approved source.",
        )
    return Decision(
        S.needs_review,
        "ruling.no_text",
        "لم يُسترجَع نص صريح من مصدر معتمد يؤيّد هذا الحكم؛ لا يُجزم به دون مراجعة.",
        "No explicit text backing this ruling was retrieved from an approved source; do not assert it without review.",
        referral=True,
    )


def decide_attribution_by_meaning() -> Decision:
    """A statement that reports, in the speaker's own words, what the Prophet ﷺ or the Quran says.
    It is not a text, so no retrieved text can make it "has a reference": the sources' wording may be
    shown beside it for comparison, and the matter is referred. (4 Oct 2026: such a statement was shown
    as «له مرجعية» with the grading of the narration it loosely restated — the worst error this tool
    can make. The team's decision: never.)"""
    return Decision(
        S.needs_review,
        "attribution.by_meaning",
        "نُسب هذا الكلام بالمعنى لا باللفظ، فليس نصاً يُتحقق من لفظه ولا يُجزم بنسبته؛ يُراجَع على لفظ المصدر.",
        "This is reported by meaning, not word for word: it is not a text whose wording can be verified, and its attribution is not asserted; compare it with the source's own wording.",
        referral=True,
    )


# --------------------------------------------------------------------------- quotes / facts


def decide_quote(
    *,
    found: bool,
    similarity: float,
    attribution_matches: bool | None,
    t: Thresholds = THRESHOLDS,
) -> Decision:
    """``attribution_matches``: True/False when the source states who said it, None when unknown."""
    if not found or similarity < t.quote_verbatim:
        return Decision(
            S.not_found,
            "quote.none",
            "لم يُعثر على هذا القول بنصه في المصادر المعتمدة المتاحة.",
            "This saying was not found verbatim in the approved sources available.",
            referral=True,
        )
    if attribution_matches is False:
        return Decision(
            S.contradicted,
            "quote.misattributed",
            "النص موجود في المصدر لكنه منسوب فيه إلى غير من نُسب إليه هنا.",
            "The text exists in the source but is attributed there to someone else.",
        )
    if attribution_matches is True:
        return Decision(
            S.supported,
            "quote.verbatim",
            "القول موجود بنصه في المصدر منسوباً إلى قائله.",
            "The saying is found verbatim in the source, attributed to its author.",
        )
    return Decision(
        S.needs_review,
        "quote.attribution_unknown",
        "النص موجود في المصدر لكن تعذّر التحقق من نسبته إلى القائل المذكور.",
        "The text exists in the source but its attribution to the named author could not be verified.",
        referral=True,
    )


# --------------------------------------------------------------------------- requests / caps


def decide_request() -> Decision:
    return Decision(
        S.not_found,
        "request.no_fabrication",
        "تبيّن لا يؤلّف نصوصاً شرعية ولا ينسبها: " + ABSTAIN_AR + " يطابق هذا الطلب.",
        "Tabayyun does not compose or attribute religious texts: no reliable source matching this request was found.",
        referral=True,
    )


def decide_question() -> Decision:
    """A question put to the tool. Tabayyun verifies what is quoted; it does not answer what is asked."""
    return Decision(
        S.needs_review,
        "question.referral",
        "هذا سؤال، وتبيّن يتحقق مما يُنقل ولا يجيب عما يُسأل. لا نفتي؛ راجع جواب مسألتك في مواقع أهل العلم المعتمدة.",
        "This is a question. Tabayyun verifies what is quoted; it does not answer what is asked and gives no fatwa. Look the matter up on the approved scholars' sites.",
        referral=True,
    )


def apply_level_caps(decision: Decision, level: ContentLevel) -> Decision:
    """Content-level ceilings from the scientific reference (levels C and D)."""
    if level == ContentLevel.D:
        return Decision(
            S.needs_review,
            decision.rule_id + "+level_d",
            PERSONAL_CASE_AR,
            PERSONAL_CASE_EN,
            referral=True,
            personal_case=True,
            warnings=decision.warnings,
        )
    if level == ContentLevel.C and decision.state != S.needs_review:
        return Decision(
            S.needs_review,
            decision.rule_id + "+level_c",
            "مسألة خلافية أو عالية الحساسية: يُعرض ما في المصادر دون ترجيح، ويُحال فيها إلى أهل العلم.",
            "A disputed or highly sensitive matter: what the sources say is shown without preference, and it is referred to scholars.",
            referral=True,
            disagreement_noted=True,
            grade_unavailable=decision.grade_unavailable,
            warnings=decision.warnings,
        )
    if level == ContentLevel.C:
        decision.disagreement_noted = True
        decision.referral = True
    return decision
