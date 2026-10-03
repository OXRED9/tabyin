"""F3 — server-side rendering of the shareable verdict card ("بطاقة تثبّت").

This is the fallback for browsers where client-side rendering fails; the content rules are the
same as the client's (docs/API.md → "What a verdict card shows"). Drawn with Pillow; Arabic shaping
and bidirectional layout come from libraqm. Nothing is stored, and nothing about the user is
drawn: no date or time, no reviewer name, no video link.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

import segno
from PIL import Image, ImageDraw, ImageFont

from ..schemas import Card, EvidenceState, Summary
from .labels import STATE, STATE_COLOR

FONTS = Path(__file__).resolve().parents[1] / "assets" / "fonts"
SIZES = {"portrait": (1080, 1350), "square": (1080, 1080)}
GREEN, GOLD = "#1B6B5E", "#C9A227"
THEMES = {
    "light": {"page": "#F6F7F5", "surface": "#FFFFFF", "ink": "#0F1F1B", "muted": "#4B5A56", "line": "#E3E7E4", "soft": "#EEF3F1"},
    "dark": {"page": "#0B1210", "surface": "#14201D", "ink": "#EDF3F1", "muted": "#A9B8B3", "line": "#26352F", "soft": "#1B2A26"},
}
# Text colour used for the verdict line: the state hue, darkened/lightened so it reads on the surface.
STATE_INK = {
    "light": {"supported": "#14633A", "supported_with_note": "#3F7426", "needs_review": "#8A5A12", "not_found": "#A8362E", "contradicted": "#7A1A1A"},
    "dark": {"supported": "#6FD3A0", "supported_with_note": "#A6D58B", "needs_review": "#E9B866", "not_found": "#F19A93", "contradicted": "#F08A8A"},
}
TEXT = {
    "title": ("بطاقة تثبّت", "Verification card"),
    "summary_title": ("خلاصة التحقق", "Verification summary"),
    "quoted": ("النص كما ورد", "As quoted"),
    "reference": ("المرجع", "Reference"),
    "grading": ("الحكم (منقول حرفياً)", "Grading (verbatim)"),
    "source": ("المصدر", "Source"),
    "no_grading": ("الحكم غير متاح من المصدر", "Grading not available from the source"),
    "abstain": ("لا نُصدر حكماً بلا مصدر، ولا نولّد بديلاً.", "No verdict without a source, and no substitute is generated."),
    "overridden": ("حالة معدَّلة بمراجعة بشرية", "State changed by human review"),
    "check": ("تحقّق بنفسك على تبيّن", "Check it yourself on Tabayyun"),
    "disclaimer": ("تبيّن أداة مدعومة بالذكاء الاصطناعي، لا تغني عن الرجوع إلى أهل العلم", "Tabayyun is an AI-assisted tool; it does not replace consulting qualified scholars"),
    "citations": ("استشهادات", "citations"),
    "brand": ("تبيّن", "Tabayyun"),
}


def renderer_available() -> bool:
    """Arabic needs shaping and bidirectional layout (libraqm + FriBiDi). Without them the letters
    would be drawn unjoined and in the wrong order — worse than no card — so the endpoint refuses."""
    from PIL import features

    return bool(features.check("raqm"))


@lru_cache(maxsize=32)
def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size, layout_engine=ImageFont.Layout.RAQM)


def _f(weight: str, size: int) -> ImageFont.FreeTypeFont:
    return _font({"regular": "IBMPlexSansArabic-Regular.ttf", "semibold": "IBMPlexSansArabic-SemiBold.ttf", "bold": "IBMPlexSansArabic-Bold.ttf", "quran": "AmiriQuran-Regular.ttf"}[weight], size)


def _is_rtl(text: str) -> bool:
    return any("֐" <= ch <= "ࣿ" for ch in text)


@dataclass
class _Canvas:
    draw: ImageDraw.ImageDraw
    rtl: bool  # layout direction of the card (Arabic UI)
    left: int
    right: int
    y: int = 0

    def _dir(self, text: str) -> dict:
        return {"direction": "rtl", "language": "ar"} if _is_rtl(text) else {"direction": "ltr", "language": "en"}

    def width(self, text: str, font) -> float:
        return self.draw.textlength(text, font=font, **self._dir(text))

    def wrap(self, text: str, font, max_width: int, max_lines: int) -> list[str]:
        """Greedy word wrap; when the text is cut, the last allowed line ends with an ellipsis."""
        lines: list[str] = []
        current = ""
        for word in " ".join(text.split()).split(" "):
            trial = f"{current} {word}".strip()
            if not current or self.width(trial, font) <= max_width:
                current = trial
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        if len(lines) > max_lines:
            lines = self._ellipsize(lines[:max_lines], font, max_width)
        return lines

    def _ellipsize(self, lines: list[str], font, max_width: int) -> list[str]:
        last = lines[-1]
        while last and self.width(last + "…", font) > max_width:
            last = last.rsplit(" ", 1)[0] if " " in last else last[:-1]
        lines[-1] = last + "…"
        return lines

    def line(self, text: str, font, fill: str, *, x: int | None = None, gap: int = 0, align_start: bool = True) -> None:
        """Draw one line at the card's start edge (right for Arabic) and advance."""
        start_right = self.rtl if align_start else not self.rtl
        ascent, descent = font.getmetrics()
        if start_right:
            self.draw.text((x if x is not None else self.right, self.y), text, font=font, fill=fill, anchor="ra", **self._dir(text))
        else:
            self.draw.text((x if x is not None else self.left, self.y), text, font=font, fill=fill, anchor="la", **self._dir(text))
        self.y += ascent + descent + gap

    def paragraph(self, text: str, font, fill: str, *, max_lines: int, line_gap: int = 10, after: int = 0, inset: int = 0) -> None:
        width = self.right - self.left - inset
        for ln in self.wrap(text, font, width, max_lines):
            self.line(ln, font, fill, gap=line_gap, x=(self.right - inset) if self.rtl else (self.left + inset))
        self.y += after

    def field(self, label: str, value: str, theme: dict, *, max_lines: int = 2, value_font=None) -> None:
        self.line(label, _f("regular", 26), theme["muted"], gap=2)
        self.paragraph(value, value_font or _f("semibold", 34), theme["ink"], max_lines=max_lines, line_gap=6, after=18)


def _mix(hex_a: str, hex_b: str, t: float) -> str:
    a = [int(hex_a[i : i + 2], 16) for i in (1, 3, 5)]
    b = [int(hex_b[i : i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(a, b))


def _icon(draw: ImageDraw.ImageDraw, state: str, cx: int, cy: int, r: int, color: str) -> None:
    """State icon: a second layer besides colour and word, so state never relies on colour alone."""
    w = max(4, r // 5)
    if state in ("supported", "supported_with_note"):
        draw.line([(cx - r * 0.5, cy), (cx - r * 0.12, cy + r * 0.38), (cx + r * 0.55, cy - r * 0.4)], fill=color, width=w, joint="curve")
        if state == "supported_with_note":
            draw.ellipse([cx + r * 0.5, cy + r * 0.25, cx + r * 0.5 + w, cy + r * 0.25 + w], fill=color)
    elif state == "needs_review":
        draw.text((cx, cy), "?", font=_f("bold", int(r * 1.5)), fill=color, anchor="mm")
    else:
        d = r * 0.42
        draw.line([(cx - d, cy - d), (cx + d, cy + d)], fill=color, width=w)
        draw.line([(cx - d, cy + d), (cx + d, cy - d)], fill=color, width=w)
        if state == "contradicted":
            draw.ellipse([cx + r * 0.62, cy - r * 0.75, cx + r * 0.62 + w, cy - r * 0.75 + w], fill=color)


def _logo(draw: ImageDraw.ImageDraw, x: int, y: int, s: int) -> None:
    """The deck's mark: two overlapping rounded squares with a gold core."""
    w = max(6, s // 9)
    draw.rounded_rectangle([x + s * 0.32, y + s * 0.32, x + s, y + s], radius=s // 5, outline=_mix(GREEN, "#FFFFFF", 0.55), width=w)
    draw.rounded_rectangle([x, y, x + s * 0.68, y + s * 0.68], radius=s // 5, outline="#FFFFFF", width=w)
    draw.rounded_rectangle([x + s * 0.34, y + s * 0.34, x + s * 0.62, y + s * 0.62], radius=s // 12, fill=GOLD)


def _qr(url: str, size: int, dark: str, light: str) -> Image.Image:
    qr = segno.make(url, error="m")
    matrix = [list(row) for row in qr.matrix]
    n = len(matrix)
    quiet = 2
    scale = max(1, size // (n + quiet * 2))
    img = Image.new("RGB", ((n + quiet * 2) * scale,) * 2, light)
    d = ImageDraw.Draw(img)
    for r, row in enumerate(matrix):
        for c, on in enumerate(row):
            if on:
                d.rectangle([(c + quiet) * scale, (r + quiet) * scale, (c + quiet + 1) * scale - 1, (r + quiet + 1) * scale - 1], fill=dark)
    return img.resize((size, size), Image.NEAREST)


def _first_sentence(text: str) -> str:
    for mark in (". ", "؛ ", "; "):
        if mark in text:
            return text.split(mark)[0].strip() + "."
    return text.strip()


def _frame(size: str, theme_name: str, lang: str, title_key: str) -> tuple[Image.Image, _Canvas, dict, int]:
    W, H = SIZES[size]
    theme = THEMES[theme_name]
    en = lang == "en"
    img = Image.new("RGB", (W, H), theme["page"])
    draw = ImageDraw.Draw(img)
    m = 48
    draw.rounded_rectangle([m, m, W - m, H - m], radius=44, fill=theme["surface"], outline=theme["line"], width=2)
    # brand header
    head = 150
    draw.rounded_rectangle([m, m, W - m, m + head], radius=44, fill=GREEN)
    draw.rectangle([m, m + head - 44, W - m, m + head], fill=GREEN)
    brand = TEXT["brand"][en]
    title = TEXT[title_key][en]
    canvas = _Canvas(draw=draw, rtl=not en, left=m + 56, right=W - m - 56)
    logo = 78
    cy = m + head // 2
    if en:
        _logo(draw, canvas.left, cy - logo // 2, logo)
        draw.text((canvas.left + logo + 22, cy), brand, font=_f("bold", 54), fill="#FFFFFF", anchor="lm")
        draw.text((canvas.right, cy), title, font=_f("semibold", 32), fill=_mix(GREEN, "#FFFFFF", 0.86), anchor="rm")
    else:
        _logo(draw, canvas.right - logo, cy - logo // 2, logo)
        draw.text((canvas.right - logo - 22, cy), brand, font=_f("bold", 58), fill="#FFFFFF", anchor="rm", direction="rtl", language="ar")
        draw.text((canvas.left, cy), title, font=_f("semibold", 34), fill=_mix(GREEN, "#FFFFFF", 0.86), anchor="lm", direction="rtl", language="ar")
    canvas.y = m + head + 44
    return img, canvas, theme, H - m


def _footer(img: Image.Image, canvas: _Canvas, theme: dict, bottom: int, app_url: str, lang: str, compact: bool = False) -> int:
    """Footer block; returns the y where the body must stop."""
    en = lang == "en"
    draw = canvas.draw
    qr_size = 132 if compact else 168
    top = bottom - qr_size - (84 if compact else 96)
    draw.line([(canvas.left, top - 22), (canvas.right, top - 22)], fill=theme["line"], width=2)
    qr = _qr(app_url, qr_size, "#0F1F1B", "#FFFFFF")
    qr_x = canvas.left if not en else canvas.right - qr_size
    img.paste(qr, (qr_x, top))
    text_edge = (canvas.right, "ra") if not en else (canvas.left, "la")
    kw = {"direction": "rtl", "language": "ar"} if not en else {"direction": "ltr", "language": "en"}
    draw.text((text_edge[0], top + (0 if compact else 8)), TEXT["check"][en], font=_f("semibold", 34 if compact else 38), fill=theme["ink"], anchor=text_edge[1], **kw)
    shown = app_url.replace("https://", "").replace("http://", "").rstrip("/")
    draw.text((text_edge[0], top + (58 if compact else 74)), shown, font=_f("regular", 28 if compact else 30), fill=GREEN if theme is THEMES["light"] else "#7FD1BF", anchor=text_edge[1], direction="ltr", language="en")
    # transparency line, centred under everything
    draw.text(((canvas.left + canvas.right) // 2, bottom - 44), TEXT["disclaimer"][en], font=_f("regular", 22), fill=theme["muted"], anchor="mm", **kw)
    return top - 40


# (quote lines, verdict lines, type scale), tried in order. Smaller type is preferred over cutting the
# claim: the first layout that fits AND shows the whole (240-character) claim wins; failing that, the
# first that fits; failing that, the tightest.
_FIT = {
    "portrait": [(5, 3, 1.0), (6, 3, 0.92), (7, 3, 0.84), (8, 2, 0.76), (9, 2, 0.68)],
    "square": [(3, 2, 0.9), (4, 2, 0.8), (5, 2, 0.72), (6, 1, 0.64), (7, 1, 0.58)],
}


def render_claim_card(card: Card, *, size: str, theme: str, lang: str, app_url: str, abstention_verse: dict | None, override_state: EvidenceState | None = None) -> bytes:
    fitting = None
    img = None
    for quote_lines, verdict_lines, k in _FIT[size]:
        img, fits, truncated = _draw_claim(card, size, theme, lang, app_url, abstention_verse, override_state, quote_lines, verdict_lines, k)
        if fits and not truncated:
            fitting = img
            break
        if fits and fitting is None:
            fitting = img
    out = io.BytesIO()
    (fitting or img).save(out, format="PNG", optimize=True)
    return out.getvalue()


def _draw_claim(card, size, theme, lang, app_url, abstention_verse, override_state, quote_lines: int, verdict_lines: int, k: float) -> tuple[Image.Image, bool, bool]:
    en = lang == "en"
    state = (override_state or card.state).value
    img, cv, th, bottom = _frame(size, theme, lang, "title")
    draw = cv.draw
    body_end = _footer(img, cv, th, bottom, app_url, lang, compact=size == "square")
    px = lambda n: max(1, round(n * k))  # noqa: E731
    label_font = _f("regular", px(26))

    def field(label: str, value: str, max_lines: int) -> None:
        cv.line(label, label_font, th["muted"], gap=2)
        cv.paragraph(value, _f("semibold", px(34)), th["ink"], max_lines=max_lines, line_gap=px(6), after=px(18))

    # ---- state badge: colour + icon + word
    label = STATE[state][en]
    font = _f("bold", px(40))
    pad, icon_r, h = px(28), px(26), px(84)
    w = int(cv.width(label, font) + pad * 2 + icon_r * 2 + 18)
    x0 = cv.right - w if cv.rtl else cv.left
    draw.rounded_rectangle([x0, cv.y, x0 + w, cv.y + h], radius=h // 2, fill=STATE_COLOR[state])
    icon_x = (x0 + w - pad - icon_r) if cv.rtl else (x0 + pad + icon_r)
    _icon(draw, state, icon_x, cv.y + h // 2, icon_r, "#FFFFFF")
    if cv.rtl:
        draw.text((x0 + w - pad - icon_r * 2 - 18, cv.y + h // 2), label, font=font, fill="#FFFFFF", anchor="rm", direction="rtl", language="ar")
    else:
        draw.text((x0 + pad + icon_r * 2 + 18, cv.y + h // 2), label, font=font, fill="#FFFFFF", anchor="lm")
    cv.y += h + px(14)
    if override_state and override_state != card.state:
        cv.line(TEXT["overridden"][en], _f("semibold", px(26)), th["muted"], gap=6)
    cv.y += px(20)

    # ---- the claim, as quoted (truncated)
    cv.line(TEXT["quoted"][en], label_font, th["muted"], gap=px(8))
    quoted = " ".join(card.text_as_quoted.split())
    if len(quoted) > 240:
        quoted = quoted[:240].rsplit(" ", 1)[0] + "…"
    top = cv.y
    cv.y += px(18)
    quote_font = _f("semibold", px(44))
    truncated = len(cv.wrap(quoted, quote_font, cv.right - cv.left - 28, 99)) > quote_lines
    cv.paragraph(quoted, quote_font, th["ink"], max_lines=quote_lines, line_gap=px(14), inset=28)
    bar_x = cv.right if cv.rtl else cv.left
    draw.rounded_rectangle([bar_x - 8, top + 8, bar_x, cv.y + 2] if cv.rtl else [bar_x, top + 8, bar_x + 8, cv.y + 2], radius=4, fill=STATE_COLOR[state])
    cv.y += px(28)

    # ---- verdict line (for not_found this is the abstention line)
    verdict = _first_sentence(card.note_en if en else card.note_ar) or (TEXT["abstain"][en] if state == "not_found" else "")
    if verdict:
        cv.paragraph(verdict, _f("semibold", px(34)), STATE_INK[theme][state], max_lines=verdict_lines, line_gap=px(8), after=px(24))

    # ---- evidence: reference + grading + source domain, or the abstention verse
    if state == "not_found" or card.source is None:
        if state == "not_found" and abstention_verse:
            verse_font = _f("quran", px(46))
            step = sum(verse_font.getmetrics()) + px(6)  # the Quran face has tall marks: use its own line height
            for ln in cv.wrap(f"﴿{abstention_verse['text']}﴾", verse_font, cv.right - cv.left, 2):
                draw.text(((cv.left + cv.right) // 2, cv.y), ln, font=verse_font, fill=th["ink"], anchor="ma", direction="rtl", language="ar")
                cv.y += step
            ref = abstention_verse["ref_en"] if en else abstention_verse["ref"]
            draw.text(((cv.left + cv.right) // 2, cv.y), ref, font=label_font, fill=th["muted"], anchor="ma", **({"direction": "rtl", "language": "ar"} if not en else {}))
            cv.y += px(40)
    else:
        src = card.source
        field(TEXT["reference"][en], src.ref, 2)
        if card.grades:
            g = card.grades[0]
            more = f"  (+{len(card.grades) - 1})" if len(card.grades) > 1 else ""
            cv.line(TEXT["grading"][en], label_font, th["muted"], gap=2)
            cv.paragraph(g.text.splitlines()[0] + (f" — {g.scholar}" if g.scholar else "") + more, _f("semibold", px(34)), th["ink"], max_lines=1, line_gap=px(2))
            cv.paragraph(g.source_name, _f("regular", px(24)), th["muted"], max_lines=1, line_gap=0, after=px(16))
        elif card.grade_unavailable:
            field(TEXT["grading"][en], TEXT["no_grading"][en], 1)
        domain = (urlparse(src.url).hostname or "").removeprefix("www.")
        if domain:
            cv.line(TEXT["source"][en], label_font, th["muted"], gap=2)
            x = cv.right if cv.rtl else cv.left
            dom_font = _f("semibold", px(32))
            draw.text((x, cv.y), domain, font=dom_font, fill=th["ink"], anchor="ra" if cv.rtl else "la", direction="ltr", language="en")
            cv.y += sum(dom_font.getmetrics())
    return img, cv.y <= body_end, truncated


def render_summary_card(summary: Summary, *, size: str, theme: str, lang: str, app_url: str, human_reviewed: bool = False) -> bytes:
    en = lang == "en"
    img, cv, th, bottom = _frame(size, theme, lang, "summary_title")
    draw = cv.draw
    _footer(img, cv, th, bottom, app_url, lang, compact=size == "square")
    big = _f("bold", 150)
    cx = (cv.left + cv.right) // 2
    draw.text((cx, cv.y + 80), str(summary.total), font=big, fill=th["ink"], anchor="mm")
    kw = {"direction": "rtl", "language": "ar"} if not en else {}
    draw.text((cx, cv.y + 190), TEXT["citations"][en], font=_f("semibold", 38), fill=th["muted"], anchor="mm", **kw)
    if human_reviewed:  # some counted states were set by a human reviewer; no name is drawn
        draw.text((cx, cv.y + 236), TEXT["overridden"][en], font=_f("semibold", 24), fill=th["muted"], anchor="mm", **kw)
    cv.y += (270 if size == "portrait" else 240) + (26 if human_reviewed else 0)
    row_h = 92 if size == "portrait" else 72
    for state in ("contradicted", "not_found", "needs_review", "supported_with_note", "supported"):
        count = summary.by_state.get(EvidenceState(state), 0)
        if not count:
            continue
        y_mid = cv.y + row_h // 2
        draw.rounded_rectangle([cv.left, cv.y, cv.right, cv.y + row_h - 14], radius=22, fill=th["soft"])
        r = 24
        icon_x = cv.right - 26 - r if cv.rtl else cv.left + 26 + r
        draw.ellipse([icon_x - r, y_mid - 7 - r, icon_x + r, y_mid - 7 + r], fill=STATE_COLOR[state])
        _icon(draw, state, icon_x, y_mid - 7, r - 4, "#FFFFFF")
        label = STATE[state][en]
        if cv.rtl:
            draw.text((icon_x - r - 20, y_mid - 7), label, font=_f("semibold", 34), fill=th["ink"], anchor="rm", direction="rtl", language="ar")
            draw.text((cv.left + 34, y_mid - 7), str(count), font=_f("bold", 40), fill=th["ink"], anchor="lm")
        else:
            draw.text((icon_x + r + 20, y_mid - 7), label, font=_f("semibold", 34), fill=th["ink"], anchor="lm")
            draw.text((cv.right - 34, y_mid - 7), str(count), font=_f("bold", 40), fill=th["ink"], anchor="rm")
        cv.y += row_h
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()
