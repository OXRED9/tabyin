"""Plain-language account of the rule that produced a state (F5, "لماذا هذا الحكم؟").

Every sentence here is assembled from the rule id and the retrieval facts. No model writes any of
it, including the closing "limits of this verdict" line.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..schemas import ContentLevel
from .thresholds import THRESHOLDS, Thresholds


@dataclass
class Facts:
    similarity: float | None = None
    quoted_words: int = 0
    grade_text: str | None = None  # first grading, verbatim
    grade_source: str | None = None
    grade_count: int = 0
    in_sahihayn: bool = False
    level: ContentLevel = ContentLevel.A
    machine_transcribed: bool = False
    dorar_reachable: bool = True


@dataclass
class RuleExplanation:
    rule_ar: str
    rule_en: str
    limits_ar: str
    limits_en: str
    threshold: float | None = None


def _words_ar(n: int) -> str:
    """Arabic number agreement: 3–10 take the plural, everything else the singular form."""
    return f"{n} كلمات" if 3 <= n <= 10 else f"{n} كلمة"


def _sim(x: float | None) -> str:
    return f"{x:.2f}" if x is not None else "—"


def _grade_ar(f: Facts) -> str:
    if f.grade_text:
        more = f" (مع {f.grade_count - 1} أحكام أخرى معروضة)" if f.grade_count > 1 else ""
        return f"حكمه «{f.grade_text.splitlines()[0]}» من {f.grade_source}{more}"
    if f.in_sahihayn:
        return "وهو في أحد الصحيحين"
    return "ولا حكم منقول له"


def _grade_en(f: Facts) -> str:
    if f.grade_text:
        more = f" (plus {f.grade_count - 1} other gradings shown)" if f.grade_count > 1 else ""
        return f'its grading is "{f.grade_text.splitlines()[0]}" from {f.grade_source}{more}'
    if f.in_sahihayn:
        return "it is in one of the two Sahih collections"
    return "no grading could be copied for it"


# Limits lines, by family. They state what the verdict does NOT establish.
_LIMITS = {
    "ayah_found": (
        "المطابقة للّفظ فقط، على نص المصحف برواية حفص؛ لا تتناول الأداة تفسير الآية ولا صحة الاستدلال بها.",
        "Only the wording is matched, against the Hafs Mushaf text; the tool does not address the verse's interpretation or whether it is used correctly as evidence.",
    ),
    "ayah_not_found": (
        "البحث في نص المصحف برواية حفص فقط؛ لا يشمل القراءات الأخرى ولا ترجمات المعاني، وقد يكون النص حديثاً أو قولاً لا آية.",
        "Only the Hafs Mushaf text is searched; other readings and translations are not covered, and the text may be a hadith or a saying rather than a verse.",
    ),
    "hadith_found": (
        "الحكم منقول عن المصدر المذكور لا اجتهاد من الأداة، والبحث محصور في المصادر المعتمدة المفهرسة؛ قد توجد للحديث طرق وأحكام أخرى.",
        "The grading is copied from the named source, not judged by the tool, and only the indexed approved sources are searched; the narration may have other chains and gradings.",
    ),
    "hadith_not_found": (
        "لم نبحث خارج المصادر المعتمدة؛ قد يوجد الحديث في كتب أخرى، أو بلفظ بعيد عمّا ورد.",
        "Nothing outside the approved sources was searched; the narration may exist in other books, or in a wording far from the one quoted.",
    ),
    "paraphrase": (
        "كون النص رواية بالمعنى لهذا الحديث اقتراحٌ من النموذج اللغوي، تحققت القواعد من اشتراك ألفاظه فقط؛ راجع لفظ المصدر.",
        "That the text is a paraphrase of this narration was proposed by the language model; the rules only checked shared vocabulary. Compare with the source wording.",
    ),
    "statement": (
        "الأداة تعرض نصاً مسترجَعاً ولا تُفتي: لا تحكم على الوقائع الفردية، ولا ترجّح بين الأقوال.",
        "The tool shows a retrieved text and issues no fatwa: it does not rule on individual cases or prefer one opinion over another.",
    ),
    "quote": (
        "أقوال العلماء غير مفهرسة بعد؛ يُبحث عن النص في كتب الحديث المعتمدة فقط، فعدم العثور لا ينفي صحة النسبة.",
        "Scholars' sayings are not indexed yet; the text is searched only in the approved hadith collections, so not finding it does not disprove the attribution.",
    ),
    "request": (
        "الأداة لا تؤلّف نصوصاً شرعية ولا تبحث عن أدلة للموضوعات؛ تتحقق من نصٍّ يُعرض عليها فقط.",
        "The tool does not compose religious texts or look for evidence on a topic; it only verifies a text presented to it.",
    ),
}


def describe(rule_id: str, f: Facts, t: Thresholds = THRESHOLDS) -> RuleExplanation:
    base, _, cap = rule_id.partition("+")
    s = _sim(f.similarity)
    n = f.quoted_words
    floor_ayah = t.partial_floor(t.ayah_partial, n)
    floor_hadith = t.partial_floor(t.hadith_partial, n)
    need = t.hadith_required(n)

    table: dict[str, tuple[str, str, str, float | None]] = {
        "ayah.exact": (
            f"تطابق لفظي متصل لـ{_words_ar(n)} مع نص المصحف (الحد الأدنى {_words_ar(t.ayah_min_exact_words)}).",
            f"Verbatim contiguous match of {n} words with the Mushaf text (minimum {t.ayah_min_exact_words} words).",
            "ayah_found", None,
        ),
        "ayah.near": (
            f"أقرب موضع في المصحف بتشابه {s}، وهو لا يقل عن {t.ayah_near:.2f}، مع اختلاف في اللفظ معروض كلمةً كلمة.",
            f"The closest place in the Mushaf has similarity {s}, at or above {t.ayah_near:.2f}; the wording differences are shown word by word.",
            "ayah_found", t.ayah_near,
        ),
        "ayah.altered": (
            f"نُسب النص صراحةً إلى القرآن، وتشابهه مع أقرب موضع {s}: فوق حد التشابه الجزئي ({floor_ayah:.2f}) ودون حد التقارب ({t.ayah_near:.2f})، فعُدّ لفظه مخالفاً لنص المصحف.",
            f"The text is explicitly attributed to the Quran and its similarity to the closest place is {s}: above the partial floor ({floor_ayah:.2f}) but below the near-match threshold ({t.ayah_near:.2f}), so its wording is treated as departing from the Mushaf.",
            "ayah_found", t.ayah_near,
        ),
        "ayah.altered_transcript": (
            f"تشابه النص مع أقرب موضع في المصحف {s} (دون {t.ayah_near:.2f})، لكنه مأخوذ من تفريغ آلي، فلا يُنسب الخطأ إلى المتحدث.",
            f"Similarity to the closest place in the Mushaf is {s} (below {t.ayah_near:.2f}), but the text comes from a machine transcript, so the error is not attributed to the speaker.",
            "ayah_found", t.ayah_near,
        ),
        "ayah.partial_unattributed": (
            f"تشابه جزئي {s} مع موضع في المصحف (بين {floor_ayah:.2f} و{t.ayah_near:.2f}) دون نسبة صريحة إلى القرآن.",
            f"Partial similarity {s} to a place in the Mushaf (between {floor_ayah:.2f} and {t.ayah_near:.2f}) with no explicit attribution to the Quran.",
            "ayah_found", floor_ayah,
        ),
        "ayah.below_threshold": (
            f"أعلى تشابه مع أي موضع في المصحف {s}، وهو دون الحد الأدنى ({floor_ayah:.2f}) لنصٍّ من {_words_ar(n)}.",
            f"The highest similarity to any place in the Mushaf is {s}, below the floor ({floor_ayah:.2f}) for a text of {n} words.",
            "ayah_not_found", floor_ayah,
        ),
        "ayah.none": (
            "لم يوجد في المصحف موضع يشارك هذا النص ألفاظه.",
            "No place in the Mushaf shares this text's wording.",
            "ayah_not_found", None,
        ),
        "hadith.accepted_exact": (
            f"أفضل مرشح بتشابه {s} (لا يقل عن {t.hadith_exact:.2f})، و{_grade_ar(f)}.",
            f"The best candidate has similarity {s} (at or above {t.hadith_exact:.2f}), and {_grade_en(f)}.",
            "hadith_found", t.hadith_exact,
        ),
        "hadith.accepted_near": (
            f"أفضل مرشح بتشابه {s} (بين {need:.2f} و{t.hadith_exact:.2f}: اختلاف يسير أو اقتباس مجتزأ)، و{_grade_ar(f)}.",
            f"The best candidate has similarity {s} (between {need:.2f} and {t.hadith_exact:.2f}: a slight difference or a partial quotation), and {_grade_en(f)}.",
            "hadith_found", need,
        ),
        "hadith.possible_paraphrase": (
            f"التشابه اللفظي {s} دون حد المطابقة ({need:.2f}). أشار النموذج اللغوي إلى أنه قد يكون رواية بالمعنى لهذا الحديث، وإشارة النموذج وحدها لا تكفي للجزم؛ لذلك «يحتاج مزيد تحقق».",
            f"Lexical similarity {s} is below the match threshold ({need:.2f}). The language model pointed at this narration as possibly the one paraphrased; the model's pointer alone does not settle it, hence “needs review”.",
            "paraphrase", need,
        ),
        "hadith.weak": (
            f"طابق النص حديثاً في المصدر بتشابه {s}، و{_grade_ar(f)}: حكم بالتضعيف.",
            f"The text matches a narration in the source with similarity {s}, and {_grade_en(f)}: a grading of weakness.",
            "hadith_found", need,
        ),
        "hadith.fabricated": (
            f"طابق النص حديثاً في المصدر بتشابه {s}، و{_grade_ar(f)}: حكم يمنع نسبته إلى النبي ﷺ.",
            f"The text matches a narration in the source with similarity {s}, and {_grade_en(f)}: a grading that bars attributing it to the Prophet ﷺ.",
            "hadith_found", need,
        ),
        "hadith.grading_conflict": (
            f"طابق النص حديثاً بتشابه {s}، والأحكام المنقولة ({f.grade_count}) بين قبول وردّ؛ تُعرض كلها دون ترجيح.",
            f"The text matches a narration with similarity {s}, and the {f.grade_count} gradings copied include both acceptance and rejection; all are shown with no preference.",
            "hadith_found", need,
        ),
        "hadith.grading_unclear": (
            f"طابق النص حديثاً بتشابه {s}، لكن ألفاظ الأحكام المنقولة ({f.grade_count}) لا تتضمن قبولاً ولا ردّاً صريحاً تتعرّف عليه القواعد.",
            f"The text matches a narration with similarity {s}, but the {f.grade_count} gradings copied do not state an acceptance or rejection the rules recognise.",
            "hadith_found", need,
        ),
        "hadith.no_grading": (
            f"طابق النص حديثاً في كتب السنة بتشابه {s}، ولم يُنقل له حكم"
            + ("." if f.dorar_reachable else " (تعذّر الوصول إلى مصدر الأحكام).")
            + " وليس في الصحيحين.",
            f"The text matches a narration in the hadith collections with similarity {s}, and no grading could be copied"
            + ("." if f.dorar_reachable else " (the grading source was unreachable).")
            + " It is not in the two Sahih collections.",
            "hadith_found", need,
        ),
        "hadith.partial": (
            f"أعلى تشابه مع حديث في المصادر {s}: فوق حد التشابه الجزئي ({floor_hadith:.2f}) ودون حد المطابقة ({need:.2f})، فيُعرض أقرب نص دون جزم.",
            f"The highest similarity to a narration in the sources is {s}: above the partial floor ({floor_hadith:.2f}) but below the match threshold ({need:.2f}), so the closest text is shown without asserting it.",
            "hadith_not_found", need,
        ),
        "hadith.too_short": (
            f"النص المنقول ({_words_ar(n)} ذات معنى) أقصر من الحد الأدنى ({_words_ar(t.hadith_min_words)}) لتحديد حديث بعينه.",
            f"The quoted text ({n} content words) is shorter than the minimum ({t.hadith_min_words}) needed to identify one narration.",
            "hadith_not_found", None,
        ),
        "hadith.none": (
            f"أعلى تشابه مع أي حديث في المصادر المفهرسة {s}، وهو دون الحد الأدنى ({floor_hadith:.2f})."
            if f.similarity is not None
            else "لم يوجد في المصادر المفهرسة حديث يشارك هذا النص ألفاظه.",
            f"The highest similarity to any narration in the indexed sources is {s}, below the floor ({floor_hadith:.2f})."
            if f.similarity is not None
            else "No narration in the indexed sources shares this text's wording.",
            "hadith_not_found", floor_hadith,
        ),
        "ruling.text_found": (
            "استُرجع نص من مصدر معتمد، وأشار النموذج اللغوي إلى أنه ينص على المسألة صراحةً، ووافقه اشتراك الألفاظ؛ النص معروض بلفظه.",
            "A text was retrieved from an approved source; the language model pointed at it as stating the matter explicitly and the shared vocabulary agreed. The text is shown verbatim.",
            "statement", None,
        ),
        "ruling.no_text": (
            "لم يُسترجَع من المصادر المعتمدة نص صريح في المسألة، فلا يُجزم بها.",
            "No explicit text on the matter was retrieved from the approved sources, so it is not asserted.",
            "statement", None,
        ),
        "ruling.disputed": (
            "صُنّفت المسألة في المستوى (ج): خلافية أو عالية الحساسية، وسقفها «يحتاج مزيد تحقق» مع الإحالة.",
            "The matter was classified as level C (disputed or highly sensitive); its ceiling is “needs further verification”, with referral.",
            "statement", None,
        ),
        "ruling.personal_case": (
            "صُنّف النص في المستوى (د): سؤال عن حالة شخصية؛ لا يصدر فيه حكم ويُحال إلى جهة مؤهلة.",
            "The text was classified as level D (a personal case); no verdict is issued and it is referred to a qualified body.",
            "statement", None,
        ),
        "quote.verbatim": (
            f"وُجد القول بنصه في المصدر بتشابه {s} (لا يقل عن {t.quote_verbatim:.2f}) منسوباً إلى قائله.",
            f"The saying was found verbatim in the source with similarity {s} (at or above {t.quote_verbatim:.2f}), attributed to its author.",
            "quote", t.quote_verbatim,
        ),
        "quote.misattributed": (
            f"وُجد النص في المصدر بتشابه {s} (لا يقل عن {t.quote_verbatim:.2f})، والمصدر يرويه حديثاً عن النبي ﷺ لا قولاً لمن نُسب إليه.",
            f"The text was found in the source with similarity {s} (at or above {t.quote_verbatim:.2f}); the source reports it as a hadith of the Prophet ﷺ, not as the words of the person named.",
            "quote", t.quote_verbatim,
        ),
        "quote.attribution_unknown": (
            f"وُجد النص في المصدر بتشابه {s}، لكن تعذّر التحقق آلياً من نسبته إلى القائل المذكور.",
            f"The text was found in the source with similarity {s}, but its attribution to the named author could not be checked automatically.",
            "quote", t.quote_verbatim,
        ),
        "quote.none": (
            f"أعلى تشابه مع نص في المصادر المفهرسة {s}، دون حد المطابقة الحرفية ({t.quote_verbatim:.2f})."
            if f.similarity
            else "لم يوجد هذا القول في المصادر المفهرسة.",
            f"The highest similarity to a text in the indexed sources is {s}, below the verbatim threshold ({t.quote_verbatim:.2f})."
            if f.similarity
            else "This saying was not found in the indexed sources.",
            "quote", t.quote_verbatim,
        ),
        "request.no_fabrication": (
            "النص طلبٌ لدليل لا ادعاءٌ يُتحقق منه؛ قاعدة ثابتة: لا يُولَّد نص شرعي ولا يُنسب.",
            "The text is a request for evidence, not a claim to verify; fixed rule: no religious text is generated or attributed.",
            "request", None,
        ),
    }
    rule_ar, rule_en, family, threshold = table.get(
        base, ("طُبّقت القاعدة " + base + ".", "Rule " + base + " was applied.", "statement", None)
    )
    if cap == "level_c":
        rule_ar += " ثم طُبّق سقف المستوى (ج): لا «مؤيَّد» ولا «مخالف» في المسائل الخلافية."
        rule_en += " Then the level-C ceiling was applied: no “supported” or “contradicted” on disputed matters."
        family = "statement"
    elif cap == "level_d":
        rule_ar += " ثم طُبّق حكم المستوى (د): حالة شخصية لا يصدر فيها حكم."
        rule_en += " Then the level-D rule was applied: a personal case gets no verdict."
        family = "statement"
    limits_ar, limits_en = _LIMITS[family]
    return RuleExplanation(rule_ar, rule_en, limits_ar, limits_en, threshold)


LEVEL_REASONS = {
    "quoted_text": (
        "نص منقول (آية أو حديث): يُتحقق من لفظه ونسبته — مستوى (أ).",
        "A quoted text (verse or hadith): its wording and attribution are what is verified — level A.",
    ),
    "personal_pattern": (
        "السؤال عن حال السائل نفسه: فتوى في واقعة شخصية — مستوى (د).",
        "The question is about the asker's own situation: a fatwa on a personal case — level D.",
    ),
    "request": (
        "طلب دليل لا ادعاء: يُعامل معاملة الاستدلال — مستوى (ب).",
        "A request for evidence, not a claim: treated as argumentation — level B.",
    ),
    "default": (
        "صُنّف بالقواعد دون نموذج لغوي.",
        "Classified by rules, without a language model.",
    ),
}
