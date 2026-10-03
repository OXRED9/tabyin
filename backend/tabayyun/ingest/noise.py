"""Decorative noise in forwarded messages: emoji, rows of punctuation, "share this" footers.

Run on the text read from an image before the user sees it. Nothing is dropped silently: what is
removed is returned so the UI can show it in a collapsible list. Only whole lines are removed as
footers, and only short ones — a word inside a sentence is never touched, and the wording of a
verse or a narration is never changed here.
"""
from __future__ import annotations

import re

from ..normalize import normalize_ar

# Pictographs, emoticons, flags, dingbats and other decorative symbols, with the selectors that
# glue emoji sequences together. Arabic ligature signs (ﷺ, ﷲ, ۝, ﴾ ﴿) are not in these ranges.
_EMOJI_CHAR = "\U0001F000-\U0001FAFF☀-➿⬀-⯿\U000E0020-\U000E007F"
_EMOJI = re.compile(f"[{_EMOJI_CHAR}](?:[️‍{_EMOJI_CHAR}])*")
_REPEATED = re.compile(r"([!?؟.،,~*_=\-–—•·])\1{2,}")
_DECORATION_ONLY = re.compile(r"^[\W_ـ]+$")
_CLOCK = re.compile(r"^\W*\d{1,2}:\d{2}\s*(?:ص|م|am|pm)?\W*$", re.IGNORECASE)

# Chain-message footers and messaging-app labels, matched on the normalised line. They are requests
# to forward or app chrome, not part of what is claimed.
_FOOTERS = [
    re.compile(p)
    for p in (  # written as the normaliser leaves them: ؤ→و, ئ→ي, أ/إ→ا, ة→ه, ى→ي
        r"^انشر(ها|وها|ه)?( توجر| توجروا| ولك الاجر| ولكم الاجر| في ميزان حسنات(ك|كم))?$",
        r"انشر(ها|وها|ه) (توجر|توجروا|ولك الاجر|ولكم الاجر)",
        r"لا (تدع|تجعل)(ها|ه) تقف عندك",
        r"^ارسل(ها|ه|وها) (ل|الي) ",
        r"^شارك(ها|وها|ه)?( مع .*)?$",
        r"لا تنس(وا|ي)? الصلاه علي النبي",
        r"امانه في (عنقك|رقبتك|اعناقكم)",
        r"^(منقول|للفايده|للنشر|رساله محوله|محوله|تمت اعاده التوجيه|تم التحويل|تمت اعاده توجيهها عده مرات)$",
        r"^(forwarded|forwarded many times|share (this|it)( .*)?|pass it on|please share)$",
    )
]
_MAX_FOOTER_WORDS = 10


def _is_footer(line: str) -> bool:
    plain = re.sub(r"[^\w\s]", " ", normalize_ar(line).lower())
    plain = re.sub(r"\s+", " ", plain.replace("_", " ")).strip()
    if not plain or len(plain.split()) > _MAX_FOOTER_WORDS:
        return False
    return any(p.search(plain) for p in _FOOTERS)


def strip_noise(text: str) -> tuple[str, list[str]]:
    """Returns (the text without decorative noise, what was removed in the order it appeared)."""
    removed: list[str] = []
    kept: list[str] = []
    for raw in text.splitlines():
        emoji = _EMOJI.findall(raw)
        line = _EMOJI.sub(" ", raw)
        line = _REPEATED.sub(r"\1", line)
        line = re.sub(r"[ \t]{2,}", " ", line).strip()
        if not line:
            if emoji:
                removed.append("".join(emoji))
            elif kept and kept[-1] != "":
                kept.append("")  # keep one blank line between paragraphs
            continue
        if _is_footer(line) or _CLOCK.match(line) or (_DECORATION_ONLY.match(line) and "[?]" not in line):
            removed.append(raw.strip())
            continue
        removed += ["".join(emoji)] if emoji else []
        kept.append(line)
    while kept and kept[-1] == "":
        kept.pop()
    return "\n".join(kept), removed
