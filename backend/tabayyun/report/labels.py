"""Display labels shared by the HTML export (the frontend has its own copy in its i18n dictionary).

The state names say what was found about the SOURCE of a text, not whether the text is right: the
tool reports that a wording has a reference, it does not endorse a narration (the team's decision,
4 October 2026 — «مؤيَّد» read as a verdict on the hadith itself).
"""
from __future__ import annotations

STATE = {
    "supported": ("له مرجعية في مصدر معتمد", "Has a reference in an approved source"),
    "supported_with_note": ("له مرجعية مع ملاحظة", "Has a reference, with a note"),
    "needs_review": ("يحتاج مزيد تحقق", "Needs further verification"),
    "not_found": ("لم يُعثر على مصدر موثوق", "No reliable source found"),
    "contradicted": ("مخالف للمصدر", "Contradicts the source"),
}
# The short forms used beside a text (margin notes, cards, summary sentences).
STATE_SHORT = {
    "supported": ("له مرجعية", "Has a reference"),
    "supported_with_note": ("له مرجعية مع ملاحظة", "Has a reference, with a note"),
    "needs_review": ("يحتاج مراجعة", "Needs review"),
    "not_found": ("بلا مرجعية", "No reference found"),
    "contradicted": ("مخالف للمصدر", "Differs from the source"),
}
ACTION = {
    "adopt": ("نقله مع ذكر مرجعه", "Cite it with its reference"),
    "correct_wording": ("تصحيح اللفظ", "Correct the wording"),
    "refer_to_scholars": ("إحالة إلى أهل العلم", "Refer to scholars"),
    "remove_or_request_source": ("حذف أو طلب مصدر", "Remove or request a source"),
    "remove_and_warn": ("حذف وتنبيه", "Remove and warn"),
}
CLAIM_TYPE = {
    "ayah": ("آية", "Verse"),
    "hadith": ("حديث", "Hadith"),
    "ruling": ("حكم", "Ruling"),
    "attributed_quote": ("قول منسوب", "Attributed saying"),
    "fact": ("معلومة", "Fact"),
    "request": ("طلب دليل", "Request for evidence"),
}
LEVEL = {
    "A": ("أ — معلومات أصلية مستقرة", "A — stable foundational information"),
    "B": ("ب — شرح وتعريف واستدلال", "B — explanation, definition, argumentation"),
    "C": ("ج — مسائل خلافية أو عالية الحساسية", "C — disputed or highly sensitive"),
    "D": ("د — فتوى أو حالة شخصية", "D — fatwa or personal case"),
}
CERTAINTY = {
    "definitive": ("قطعي", "Definitive"),
    "ijtihadi": ("اجتهادي", "Ijtihadi (scholarly reasoning)"),
    "not_applicable": ("", ""),
}
STATE_COLOR = {
    "supported": "#1B7F4B",
    "supported_with_note": "#5E9E3E",
    "needs_review": "#B7791F",
    "not_found": "#C9463D",
    "contradicted": "#8B1E1E",
}
