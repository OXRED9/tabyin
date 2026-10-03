"""Display labels shared by the HTML export (the frontend has its own copy in its i18n dictionary)."""
from __future__ import annotations

STATE = {
    "supported": ("مؤيَّد بمصدر معتمد", "Supported by an approved source"),
    "supported_with_note": ("مؤيَّد مع ملاحظة", "Supported, with a note"),
    "needs_review": ("يحتاج مزيد تحقق", "Needs further verification"),
    "not_found": ("لم يُعثر على مصدر موثوق", "No reliable source found"),
    "contradicted": ("مخالف للمصدر", "Contradicts the source"),
}
ACTION = {
    "adopt": ("اعتماد", "Adopt"),
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
