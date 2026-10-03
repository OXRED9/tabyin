"""F3 — the shareable verdict card («بطاقة تثبّت»), drawn on the server (v2: docs/DESIGN.md §8).

This is the fallback for browsers where client-side rendering fails; the content and its order are
the same as the client's (docs/API.md → "What a verdict card shows"). The card is paper inside one
hairline frame: the state (ring glyph + word) and one sentence, the words as they circulate, the
source's own wording with its reference and grading, the suggested action, then the address with its
QR code and the transparency line.

Drawn with Pillow; Arabic shaping and bidirectional layout come from libraqm. Nothing is stored, and
nothing about the user is drawn: no date or time, no reviewer name, no link to a clip.

Three rules of the product are enforced here and not left to the layout's luck:

* a grading is drawn in the source's words — its line whole, or not at all; it is never shortened;
* a verse is never cut inside the span that was quoted (``_Claim.fit``);
* nothing is drawn outside the frame: every block reports the pixels it inked (``Block.ink``).
"""
from __future__ import annotations

import io
import math
import re
import unicodedata
from dataclasses import dataclass, field, replace
from functools import lru_cache
from pathlib import Path
from typing import Callable

import segno
from PIL import Image, ImageDraw, ImageFont
from rapidfuzz.distance import Levenshtein

from ..normalize import arabic_ratio
from ..schemas import STATE_ACTION, Card, ContentLevel, EvidenceState, Summary
from ..textalign import words_with_offsets
from .labels import STATE

FONTS = Path(__file__).resolve().parents[1] / "assets" / "fonts"
SIZES = {"portrait": (1080, 1350), "square": (1080, 1080)}
FRAME = 36  # the hairline frame's inset from the edge of the image
HAIRLINE = 2
# The square card has 270px less height: its fixed type and spacing are set at this scale. The claim
# and the source's wording keep the same range of sizes on both cards (see ``_LADDER``).
SCALE = {"portrait": 1.0, "square": 0.86}

# docs/DESIGN.md §2.1 — base colours. `green` is the tool's own ink (the address).
THEMES = {
    "light": {"paper": "#FFFFFF", "ink": "#11221E", "quiet": "#4F615B", "green": "#1B6B5E", "rule": "#D3DDD9", "gold": "#C9A227"},
    "dark": {"paper": "#10231E", "ink": "#E7EFEB", "quiet": "#9DB1AA", "green": "#7DBFB0", "rule": "#24392F", "gold": "#D9B648"},
}
# docs/DESIGN.md §2.2 — the five states, one family: (solid, ink). Solid draws the glyph and the
# underlines, ink the words.
STATE_TOKENS = {
    "light": {
        "supported": ("#1B6B5E", "#14584D"),
        "supported_with_note": ("#6E7B1E", "#56611A"),
        "needs_review": ("#A66A00", "#7A4E00"),
        "not_found": ("#B5524A", "#8F3B34"),
        "contradicted": ("#8C1D18", "#73130F"),
    },
    "dark": {
        "supported": ("#6FC3A9", "#9AD9C5"),
        "supported_with_note": ("#B3C25A", "#CBD784"),
        "needs_review": ("#E0A63A", "#EFC670"),
        "not_found": ("#E08A80", "#F0ACA4"),
        "contradicted": ("#E0605A", "#F4A29D"),
    },
}
# The five canonical actions, each said as a sentence — the same wording as the open note in the UI
# (frontend dictionary `actionSentences`). TODO-SULAIMAN-REVIEW (wording).
ACTION_SENTENCE = {
    "adopt": ("الإجراء المقترح: اعتماده كما ورد.", "Suggested action: adopt it as quoted."),
    "correct_wording": ("الإجراء المقترح: تصحيح اللفظ على ما في المصدر.", "Suggested action: correct the wording to match the source."),
    "refer_to_scholars": ("الإجراء المقترح: إحالة المسألة إلى أهل العلم.", "Suggested action: refer the matter to scholars."),
    "remove_or_request_source": ("الإجراء المقترح: حذفه أو طلب مصدره.", "Suggested action: remove it, or ask for its source."),
    "remove_and_warn": ("الإجراء المقترح: حذفه والتنبيه على مخالفته للمصدر.", "Suggested action: remove it and warn that it contradicts the source."),
}
TEXT = {
    "brand": ("تبيّن", "Tabayyun"),
    "title": ("بطاقة تثبّت", "Verification card"),
    "summary_title": ("خلاصة التحقق", "Verification summary"),
    "claim": ("النص المتداول", "The text in circulation"),
    "source": ("في المصدر", "In the source"),
    "no_grading": ("الحكم غير متاح من المصدر", "Grading not available from the source"),
    "one_grading": ("حكم واحد في المصدر", "one grading in the source"),
    "abstain": ("لا نُصدر حكماً بلا مصدر، ولا نولّد بديلاً.", "We issue no verdict without a source, and generate no substitute."),
    # Stands in the source's place when nothing is quoted (no source, level C or D) — the client's `share.referral`.
    "referral": ("تبيّن لا يفتي ولا يرجّح؛ يُرجع في هذه المسألة إلى أهل العلم.", "Tabayyun issues no fatwa and prefers no opinion; this matter is for qualified scholars."),
    "overridden": ("حالة معدَّلة بمراجعة بشرية", "State changed by human review"),
    "check": ("تحقّق بنفسك على تبيّن", "Check it yourself on Tabayyun"),
    "disclaimer": ("تبيّن أداة مدعومة بالذكاء الاصطناعي، لا تغني عن الرجوع إلى أهل العلم", "Tabayyun is an AI-assisted tool. It does not replace consulting qualified scholars."),
    # Shown in place of a wording that cannot be drawn whole where it must be. TODO-SULAIMAN-REVIEW (wording).
    "verse_too_long": ("نص الآية أطول من أن تسعه البطاقة؛ يُقرأ كاملاً في موضعه من المصحف.", "The verse is too long for this card; read it in full at its reference."),
    "text_too_long": ("نص المصدر أطول من أن تسعه البطاقة؛ يُقرأ كاملاً في مصدره.", "The source's text is too long for this card; read it in full at its reference."),
}
CLAIM_MAX_CHARS = 240
STATES_FOR_SUMMARY = ("supported", "supported_with_note", "needs_review", "not_found", "contradicted")


def renderer_available() -> bool:
    """Arabic needs shaping and bidirectional layout (libraqm + FriBiDi). Without them the letters
    would be drawn unjoined and in the wrong order — worse than no card — so the endpoint refuses."""
    from PIL import features

    return bool(features.check("raqm"))


# --------------------------------------------------------------------------- what a render returns


@dataclass(frozen=True)
class Block:
    """One drawn part of a card: the area laid out for it and the pixels it actually inked."""

    name: str
    box: tuple[int, int, int, int]  # x0, y0, x1, y1 of the lines' boxes
    ink: tuple[int, int, int, int]  # the bounding box of everything drawn for it
    text: str = ""  # the words drawn, in reading order (lines joined by "\n")


@dataclass
class Drawn:
    image: Image.Image
    blocks: list[Block]
    frame: tuple[int, int, int, int]  # the hairline frame; nothing is drawn outside it
    fit: dict = field(default_factory=dict)  # how the content was fitted (sizes, what was cut)

    def block(self, name: str) -> Block | None:
        return next((b for b in self.blocks if b.name == name), None)

    def png(self) -> bytes:
        out = io.BytesIO()
        self.image.save(out, format="PNG", optimize=True)
        return out.getvalue()


# --------------------------------------------------------------------------- type


# Two voices (docs/DESIGN.md §1): Naskh is the text under examination and the words of the sources,
# Plex is the tool speaking. The Plex Arabic file carries the Latin letters too.
_FACES = {
    "plex": "IBMPlexSansArabic-Regular.ttf",
    "plex600": "IBMPlexSansArabic-SemiBold.ttf",
    "naskh": "Amiri-Regular.ttf",
    "quran": "AmiriQuran-Regular.ttf",
}
_UNDERLINE_DROP = 0.32  # of the type size, below the baseline (the client's text-underline-offset)
_UNDERLINE = 3
_BRACKET_GAP = 0.6  # of a space, between a verse and its brackets: the marks over a first letter need the room


@lru_cache(maxsize=128)
def _font(face: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / _FACES[face]), size, layout_engine=ImageFont.Layout.RAQM)


def _direction(text: str) -> str | None:
    """The direction a string is shaped in: "rtl" when it has Arabic letters, "ltr" when it has
    other letters or digits, None for marks alone (they take the direction of the paragraph)."""
    ltr = False
    for ch in text:
        if "\u0590" <= ch <= "\u08ff" or "\ufb1d" <= ch <= "\ufefc":
            return "rtl"
        ltr = ltr or ch.isalnum()
    return "ltr" if ltr else None


def _shaping(direction: str) -> dict:
    return {"direction": direction, "language": "ar" if direction == "rtl" else "en"}


@lru_cache(maxsize=60_000)
def _width(text: str, face: str, size: int, rtl: bool) -> float:
    return _font(face, size).getlength(text, **_shaping(_direction(text) or ("rtl" if rtl else "ltr")))


@dataclass(frozen=True)
class _Ink:
    """How a run of words is set."""

    face: str
    size: int
    fill: str
    rule: str | None = None  # an underline under these words alone (the collation mark)


@dataclass(frozen=True)
class _W:
    """One word of a paragraph. A tied word stays on the line of the word before it."""

    text: str
    ink: _Ink
    tie: bool = False
    space: float = 1.0  # what separates it from the word before it: 1 a space, 0 nothing, between: a thin gap


def _words(text: str, ink: _Ink) -> list[_W]:
    return [_W(w, ink) for w in text.split()]


def _lead(word: _W, rtl: bool) -> float:
    return _width(" ", word.ink.face, word.ink.size, rtl) * word.space


def _line_width(line: list[_W], rtl: bool) -> float:
    return sum(_width(w.text, w.ink.face, w.ink.size, rtl) + (_lead(w, rtl) if i else 0.0) for i, w in enumerate(line))


def _split_long(word: _W, max_width: float, rtl: bool) -> list[_W]:
    """A single word wider than the measure (a pasted address, a stretched word) is broken by
    characters, so that nothing can run out of the frame."""
    if _width(word.text, word.ink.face, word.ink.size, rtl) <= max_width:
        return [word]
    pieces: list[_W] = []
    rest = word.text
    while rest:
        n = len(rest)
        while n > 1 and _width(rest[:n], word.ink.face, word.ink.size, rtl) > max_width:
            n -= 1
        pieces.append(replace(word, text=rest[:n], tie=word.tie and not pieces))
        rest = rest[n:]
    return pieces


def _wrap(words: list[_W], max_width: float, rtl: bool) -> list[list[_W]]:
    """Greedy line breaking in reading order. A word and the words tied to it never part."""
    units: list[list[_W]] = []
    for word in words:
        for piece in _split_long(word, max_width, rtl):
            if piece.tie and units:
                units[-1].append(piece)
            else:
                units.append([piece])
    lines: list[list[_W]] = []
    current: list[_W] = []
    for unit in units:
        if current and _line_width(current + unit, rtl) > max_width:
            lines.append(current)
            current = []
        current = current + unit
    if current:
        lines.append(current)
    return lines


def _clip(lines: list[list[_W]], max_lines: int, max_width: float, rtl: bool) -> tuple[list[list[_W]], bool]:
    """Keep ``max_lines`` lines; when words are dropped the last line ends with «…» at a word boundary."""
    if len(lines) <= max_lines:
        return lines, False
    lines = [list(line) for line in lines[:max_lines]]
    last = lines[-1]
    mark = _W("…", replace(last[-1].ink, rule=None), tie=True, space=0)
    while len(last) > 1 and _line_width(last + [mark], rtl) > max_width:
        last.pop()
    tail = last[-1]
    last[-1] = tail = replace(tail, text=tail.text.rstrip("،؛:,;.") or tail.text)
    while len(tail.text) > 1 and _line_width(last + [mark], rtl) > max_width:  # one long unbroken word
        last[-1] = tail = replace(tail, text=tail.text[:-1])
    last.append(mark)
    return lines, True


@dataclass
class _Para:
    lines: list[list[_W]]
    rtl: bool  # reading direction; the paragraph is set flush to the edge it starts from
    line_height: int
    baseline: int  # offset of the baseline inside a line's box
    line_rule: str | None = None  # an underline along every line (the claim, as on the page)
    rule_drop: int = 0
    cut: bool = False

    @property
    def height(self) -> int:
        return len(self.lines) * self.line_height

    @property
    def text(self) -> str:
        return "\n".join("".join((" " if i and w.space == 1 else "") + w.text for i, w in enumerate(line)) for line in self.lines)


def _para(
    words: list[_W], width: float, rtl: bool, *, strut: tuple[str, int], leading: float,
    max_lines: int | None = None, line_rule: str | None = None,
) -> _Para:  # fmt: skip
    """Set words as a paragraph. ``strut`` is the face and size the line box is built on, ``leading``
    its line-height as a multiple of that size (CSS line-height: the text is centred in the box)."""
    face, size = strut
    ascent, descent = _font(face, size).getmetrics()
    line_height = round(size * leading)
    lines = _wrap(words, width, rtl)
    cut = False
    if max_lines is not None:
        lines, cut = _clip(lines, max_lines, width, rtl)
    return _Para(
        lines=lines, rtl=rtl, line_height=line_height, baseline=round((line_height - (ascent + descent)) / 2 + ascent),
        line_rule=line_rule, rule_drop=round(size * _UNDERLINE_DROP), cut=cut,
    )  # fmt: skip


@dataclass
class _Chunk:
    text: str
    ink: _Ink
    lead: float  # the space before it, in reading order
    index: int


def _chunks(line: list[_W], rtl: bool) -> list[_Chunk]:
    """Consecutive words set the same way are shaped as one string."""
    out: list[_Chunk] = []
    for i, word in enumerate(line):
        if out and out[-1].ink == word.ink and word.space in (0, 1):
            out[-1].text += (" " if word.space else "") + word.text
        else:
            out.append(_Chunk(word.text, word.ink, _lead(word, rtl) if i else 0.0, len(out)))
    return out


def _visual(chunks: list[_Chunk], rtl: bool) -> list[_Chunk]:
    """The order chunks are placed in along the paragraph's direction: a run of chunks that read the
    other way (Arabic inside an English line, or the reverse) is laid out in its own direction."""
    para = "rtl" if rtl else "ltr"
    dirs = [_direction(c.text) for c in chunks]
    out: list[_Chunk] = []
    i = 0
    while i < len(chunks):
        if dirs[i] and dirs[i] != para:
            last = j = i
            while j < len(chunks) and dirs[j] != para:
                if dirs[j]:
                    last = j
                j += 1
            out.extend(reversed(chunks[i : last + 1]))
            i = last + 1
        else:
            out.append(chunks[i])
            i += 1
    return out


def _union(a: tuple[int, int, int, int] | None, b: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    b = (math.floor(b[0]), math.floor(b[1]), math.ceil(b[2]), math.ceil(b[3]))
    return b if a is None else (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


# --------------------------------------------------------------------------- the ring, in five conditions


@lru_cache(maxsize=64)
def _ring(state: str, size: int, solid: str, gold: str) -> Image.Image:
    """The state glyph (frontend `state-glyph.tsx`): one ring on a 20-unit grid, 1.5 stroke, round
    caps — closed and checked, closed with a dot, half open, broken, struck through. Gold is used
    once: on the closed ring of a verified quotation."""
    ss = 4  # drawn large and reduced, so the curves are smooth
    n = size * ss
    u = n / 20
    w = 1.5 * u
    layer = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = 7.25
    box = [(10 - r) * u - w / 2, (10 - r) * u - w / 2, (10 + r) * u + w / 2, (10 + r) * u + w / 2]

    def cap(x: float, y: float, color: str) -> None:
        d.ellipse([x * u - w / 2, y * u - w / 2, x * u + w / 2, y * u + w / 2], fill=color)

    def stroke(points: list[tuple[float, float]], color: str) -> None:
        d.line([(x * u, y * u) for x, y in points], fill=color, width=round(w), joint="curve")
        for x, y in points:
            cap(x, y, color)

    def arc(start: float, end: float, color: str) -> None:
        d.arc(box, start, end, fill=color, width=round(w))
        for angle in (start, end):
            cap(10 + r * math.cos(math.radians(angle)), 10 + r * math.sin(math.radians(angle)), color)

    if state == "supported":
        d.ellipse(box, outline=gold, width=round(w))
        stroke([(6.75, 10.25), (9, 12.5), (13.25, 7.75)], solid)
    elif state == "supported_with_note":
        d.ellipse(box, outline=solid, width=round(w))
        d.ellipse([(10 - 1.6) * u, (10 - 1.6) * u, (10 + 1.6) * u, (10 + 1.6) * u], fill=solid)
    elif state == "needs_review":  # M15.13 4.87 A7.25 7.25 0 0 0 4.87 15.13 — the half that is drawn
        arc(135, 315, solid)
    elif state == "not_found":  # M16.81 7.52 A7.25 7.25 0 1 1 12.48 3.19 — a gap at the upper right
        arc(-20, 290, solid)
    else:  # contradicted
        d.ellipse(box, outline=solid, width=round(w))
        stroke([(4.25, 15.75), (15.75, 4.25)], solid)
    return layer.resize((size, size), Image.LANCZOS)


@lru_cache(maxsize=16)
def _qr(url: str, size: int, dark: str, tile: bool) -> Image.Image:
    """The address as a QR code, modules on whole pixels. On a dark card the code sits on a white
    tile with its own quiet zone, so any scanner reads it; on white paper the paper is the quiet zone."""
    matrix = [list(row) for row in segno.make(url, error="m").matrix]
    n = len(matrix)
    quiet = 3 if tile else 0
    scale = max(1, size // (n + quiet * 2))
    side = (n + quiet * 2) * scale
    img = Image.new("RGB", (side, side), "#FFFFFF")
    d = ImageDraw.Draw(img)
    for r, row in enumerate(matrix):
        for c, on in enumerate(row):
            if on:
                d.rectangle([(c + quiet) * scale, (r + quiet) * scale, (c + quiet + 1) * scale - 1, (r + quiet + 1) * scale - 1], fill=dark)
    return img


# --------------------------------------------------------------------------- the sheet


@dataclass
class _Item:
    """One step down the card: a part with a height that draws itself at a y, or a gap."""

    height: int
    draw: Callable[[int], None] | None = None
    stretch: int = 0  # a gap may grow by this much when the card has room to spare
    spring: float = 0.0  # its share of the room that is still left after that


def _gap(height: int, stretch: int = 0, spring: float = 0.0) -> _Item:
    return _Item(height, None, stretch, spring)


class _Sheet:
    """The paper, its frame, header and footer, and the pen that draws paragraphs on it."""

    def __init__(self, size: str, theme: str, lang: str) -> None:
        self.W, self.H = SIZES[size]
        self.k = SCALE[size]
        self.t = THEMES[theme]
        self.states = STATE_TOKENS[theme]
        self.dark = theme == "dark"
        self.en = lang == "en"
        self.rtl = not self.en
        self.img = Image.new("RGB", (self.W, self.H), self.t["paper"])
        self.draw = ImageDraw.Draw(self.img)
        self.frame = (FRAME, FRAME, self.W - FRAME, self.H - FRAME)
        self.left = FRAME + HAIRLINE + self.px(52)
        self.right = self.W - self.left
        self.width = self.right - self.left
        self.blocks: list[Block] = []
        self.draw.rectangle([FRAME, FRAME, self.W - FRAME - 1, self.H - FRAME - 1], outline=self.t["rule"], width=HAIRLINE)

    def px(self, n: float) -> int:
        return max(1, round(n * self.k))

    def say(self, key: str) -> str:
        return TEXT[key][self.en]

    def ink(self, face: str, size: float, fill: str = "ink", rule: str | None = None) -> _Ink:
        return _Ink(face, self.px(size), self.t.get(fill, fill), rule)

    # ---- drawing

    def hairline(self, y: int) -> None:
        self.draw.rectangle([self.left, y, self.right - 1, y + HAIRLINE - 1], fill=self.t["rule"])

    def _line(self, line: list[_W], rtl: bool, y: int, start: float | None = None) -> tuple[tuple[int, int, int, int] | None, float]:
        """Draw one line on the baseline ``y`` from the paragraph's starting edge; returns the ink
        box and the far end of the line."""
        x = float(start if start is not None else (self.right if rtl else self.left))
        ink: tuple[int, int, int, int] | None = None
        previous: _Chunk | None = None
        for chunk in _visual(_chunks(line, rtl), rtl):
            if previous is not None:
                later = chunk if chunk.index > previous.index else previous
                gap = later.lead if abs(chunk.index - previous.index) == 1 else _width(" ", chunk.ink.face, chunk.ink.size, rtl)
                x += -gap if rtl else gap
            direction = _direction(chunk.text) or ("rtl" if rtl else "ltr")
            font = _font(chunk.ink.face, chunk.ink.size)
            w = font.getlength(chunk.text, **_shaping(direction))
            kw = dict(font=font, anchor="rs" if rtl else "ls", **_shaping(direction))
            self.draw.text((x, y), chunk.text, fill=chunk.ink.fill, **kw)
            ink = _union(ink, self.draw.textbbox((x, y), chunk.text, **kw))
            far = x - w if rtl else x + w
            if chunk.ink.rule:
                drop = y + round(chunk.ink.size * _UNDERLINE_DROP)
                box = (min(x, far), drop, max(x, far), drop + _UNDERLINE)
                self.draw.rectangle([round(box[0]), box[1], round(box[2]) - 1, box[3] - 1], fill=chunk.ink.rule)
                ink = _union(ink, box)
            x = far
            previous = chunk
        return ink, x

    def para(self, name: str, p: _Para, y: int) -> None:
        """Draw a paragraph with its first line's box at ``y`` and record it as a block."""
        start = self.right if p.rtl else self.left
        ink: tuple[int, int, int, int] | None = None
        far = float(start)
        for i, line in enumerate(p.lines):
            base = y + i * p.line_height + p.baseline
            line_ink, end = self._line(line, p.rtl, base)
            if line_ink:
                ink = _union(ink, line_ink)
            far = min(far, end) if p.rtl else max(far, end)
            if p.line_rule:
                box = (min(start, end), base + p.rule_drop, max(start, end), base + p.rule_drop + _UNDERLINE)
                self.draw.rectangle([round(box[0]), box[1], round(box[2]) - 1, box[3] - 1], fill=p.line_rule)
                ink = _union(ink, box)
        box = (math.floor(min(start, far)), y, math.ceil(max(start, far)), y + p.height)
        self.blocks.append(Block(name, box, ink or box, p.text))

    def item(self, name: str, p: _Para) -> _Item:
        return _Item(p.height, lambda y: self.para(name, p, y))

    def reads_rtl(self, text: str) -> bool:
        """A paragraph reads in the direction of most of its letters (as ``dir="auto"`` would have
        it), and is set flush to the edge it starts from; without letters, in the card's direction."""
        return arabic_ratio(text) >= 0.5 if any(ch.isalpha() for ch in text) else self.rtl

    def tool(self, text: str, ink: _Ink, *, leading: float = 1.5, max_lines: int | None = None) -> _Para:
        """A paragraph in the tool's own voice."""
        return _para(_words(text, ink), self.width, self.reads_rtl(text), strut=(ink.face, ink.size), leading=leading, max_lines=max_lines)

    def glyph(self, name: str, state: str, x: int, y: int, size: int) -> None:
        mark = _ring(state, size, self.states[state][0], self.t["gold"])
        self.img.paste(mark, (x, y), mark)
        self.blocks.append(Block(name, (x, y, x + size, y + size), (x, y, x + size, y + size)))

    # ---- the parts every card shares

    def header(self, label: str) -> int:
        """Logotype in Naskh at the starting edge, the card's label in Plex at the other; a hairline
        under them. Returns the y where the body starts."""
        base = FRAME + self.px(74)
        brand = _W(self.say("brand"), self.ink("naskh", 58))
        ink, end = self._line([brand], self.rtl, base)
        self.blocks.append(Block("logotype", ink, ink, brand.text))
        tag = self.ink("plex", 28, "quiet")
        text = TEXT[label][self.en]
        x = self.left if self.rtl else self.right
        kw = dict(font=_font(tag.face, tag.size), anchor="ls" if self.rtl else "rs", **_shaping("rtl" if self.rtl else "ltr"))
        self.draw.text((x, base), text, fill=tag.fill, **kw)
        box = self.draw.textbbox((x, base), text, **kw)
        self.blocks.append(Block("label", _union(None, box), _union(None, box), text))
        rule = base + self.px(28)
        self.hairline(rule)
        return rule + HAIRLINE + self.px(30)

    def footer(self, app_url: str) -> int:
        """Hairline; «تحقّق بنفسك على تبيّن» and the address beside its QR code; the transparency
        line. Returns the y where the body must end."""
        bottom = self.H - FRAME - self.px(26)
        note = self.ink("plex", 22, "quiet")
        text = self.say("disclaimer")
        while note.size > 16 and _width(text, note.face, note.size, self.rtl) > self.width:
            note = replace(note, size=note.size - 1)
        line = _para(_words(text, note), self.width, self.rtl, strut=(note.face, note.size), leading=1.45, max_lines=2)
        top = bottom - line.height
        self.para("transparency", line, top)

        side = self.px(150)
        code = _qr(app_url, side, THEMES["light"]["ink"], self.dark)
        qr_top = top - self.px(12) - side
        qr_x = self.left if self.rtl else self.right - code.width
        qr_y = qr_top + (side - code.height) // 2
        self.img.paste(code, (qr_x, qr_y))
        self.blocks.append(Block("qr", (qr_x, qr_y, qr_x + code.width, qr_y + code.height), (qr_x, qr_y, qr_x + code.width, qr_y + code.height)))

        column = self.width - side - self.px(32)
        check = _para(_words(self.say("check"), self.ink("plex600", 30)), column, self.rtl, strut=("plex600", self.px(30)), leading=1.5, max_lines=1)
        shown = re.sub(r"^https?://", "", app_url).rstrip("/")
        address = self.ink("plex", 30, "green")
        while address.size > 18 and _width(shown, address.face, address.size, False) > column:
            address = replace(address, size=address.size - 1)
        y = qr_top + (side - check.height - round(address.size * 1.5)) // 2
        self.para("check", check, y)
        # The address reads left to right in either language, and still starts at the card's edge.
        y += check.height
        x = self.right if self.rtl else self.left
        kw = dict(font=_font(address.face, address.size), anchor="rs" if self.rtl else "ls", **_shaping("ltr"))
        base = y + round(address.size * 1.085)
        self.draw.text((x, base), shown, fill=address.fill, **kw)
        box = _union(None, self.draw.textbbox((x, base), shown, **kw))
        self.blocks.append(Block("address", (box[0], y, box[2], y + round(address.size * 1.5)), box, shown))

        rule = qr_top - self.px(20) - HAIRLINE
        self.hairline(rule)
        return rule - self.px(18)

    def place(self, items: list[_Item], top: int, bottom: int) -> None:
        """Draw the items down the body. Room to spare goes first into the gaps that may stretch,
        then to the springs; without a spring it stays as paper above the footer."""
        spare = max(0, bottom - top - sum(i.height for i in items))
        stretch = sum(i.stretch for i in items)
        share = min(1.0, spare / stretch) if stretch else 0.0
        springs = sum(i.spring for i in items)
        rest = (spare - stretch * share) / springs if springs else 0.0
        y, extra = top, 0.0
        for it in items:
            if it.draw is not None:
                it.draw(y + int(extra))
            y += it.height
            extra += it.stretch * share + it.spring * rest

    def done(self, fit: dict | None = None) -> Drawn:
        return Drawn(self.img, self.blocks, self.frame, fit or {})


# --------------------------------------------------------------------------- collation


_ALIGN_LIMIT = 400_000  # words × words; beyond it the source is shown without marks
_GAP_QUOTED, _GAP_SOURCE = -0.6, -0.4


def _display_words(text: str) -> list[str]:
    """The source's words as they are drawn. A token with no letter or digit (a pause mark, an
    end-of-ayah sign, a lone bracket) stays with the word before it, so it never starts a line."""
    out: list[str] = []
    for token in text.split():
        if out and not any(unicodedata.category(ch)[0] in "LN" for ch in token):
            out[-1] += " " + token
        else:
            out.append(token)
    return out


def _align(quoted: list[str], source: list[str]) -> list[int | None]:
    """For each normalised word of ``quoted``, the index of the word of ``source`` it corresponds to.

    A plain alignment (no model): every quoted word is either paired with a similar source word or
    skipped; source words before the first pair and after the last cost nothing. Similarity is by
    letters, so the same word in the Mushaf's orthography and in everyday spelling still pair.
    """
    n, m = len(quoted), len(source)
    if not n or not m or n * m > _ALIGN_LIMIT:
        return [None] * n
    score = [[0.0] * (m + 1) for _ in range(n + 1)]
    move = [bytearray(m + 1) for _ in range(n + 1)]  # 1 pair, 2 skip quoted, 3 skip source
    for i in range(1, n + 1):
        score[i][0] = i * _GAP_QUOTED
        move[i][0] = 2
        q = quoted[i - 1]
        row, above, steps = score[i], score[i - 1], move[i]
        for j in range(1, m + 1):
            best, step = above[j] + _GAP_QUOTED, 2
            s = source[j - 1]
            sim = 1.0 if q == s else Levenshtein.normalized_similarity(q, s)
            if sim >= 0.5 and above[j - 1] + 2 * sim - 1 >= best:
                best, step = above[j - 1] + 2 * sim - 1, 1
            if row[j - 1] + _GAP_SOURCE > best:
                best, step = row[j - 1] + _GAP_SOURCE, 3
            row[j], steps[j] = best, step
    j = max(range(m + 1), key=lambda col: (score[n][col], -col))
    pairs: list[int | None] = [None] * n
    i = n
    while i > 0 and j >= 0:
        step = move[i][j]
        if step == 1:
            pairs[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif step == 2:
            i -= 1
        elif step == 3:
            j -= 1
        else:
            break
    return pairs


def _collate(card: Card) -> tuple[list[str], tuple[int, int] | None, set[int]]:
    """The source's words, the span of them that the quotation corresponds to, and the words inside
    it that differ from the quotation (``card.diff``'s "replace" steps — the collation's underline).

    ``card.diff`` speaks of the matched span only, and for a verse it may spell the words as the
    matcher's plain text does; both are mapped here onto the words of ``source.text`` as displayed.
    """
    words = _display_words(card.source.text)
    sub = [(i, norm) for i, word in enumerate(words) for _s, _e, _piece, norm in words_with_offsets(word)]
    if card.diff:
        quoted = [(norm, op.op == "replace") for op in card.diff for _s, _e, _piece, norm in words_with_offsets(op.source)]
    else:
        quoted = [(norm, False) for _s, _e, _piece, norm in words_with_offsets(card.text_as_quoted)]
    pairs = _align([q for q, _ in quoted], [s for _, s in sub])
    found = [j for j in pairs if j is not None]
    if not found or len(found) < math.ceil(len(quoted) * 0.6):
        return words, None, set()
    span = (sub[min(found)][0], sub[max(found)][0] + 1)
    marks: set[int] = set()
    i = 0
    while i < len(quoted):
        if not quoted[i][1]:
            i += 1
            continue
        end = i
        while end < len(quoted) and quoted[end][1]:
            end += 1
        marks |= {sub[j][0] for j in pairs[i:end] if j is not None}
        if any(j is None for j in pairs[i:end]):
            # a differing word with no counterpart found: mark what lies between its two neighbours
            before = next((pairs[k] for k in range(i - 1, -1, -1) if pairs[k] is not None), None)
            after = next((pairs[k] for k in range(end, len(quoted)) if pairs[k] is not None), None)
            if before is not None and after is not None:
                marks |= {sub[j][0] for j in range(before + 1, after)}
        i = end
    return words, span, marks


# --------------------------------------------------------------------------- the claim card


def _grades_count(n: int, en: bool) -> str:
    """Several gradings: how many, in the page's words (frontend dictionary `gradesCount`)."""
    if en:
        return f"{n} gradings in the sources"
    return "حكمان في المصادر" if n == 2 else f"{n} أحكام في المصادر" if n <= 10 else f"{n} حكماً في المصادر"


def _first_sentence(text: str) -> str:
    """The verdict sentence: the first sentence of the rule's note (as the client cuts it)."""
    clean = " ".join(text.split())
    match = re.match(r"^.+?[.!?؟](?=\s|$)", clean)
    return match.group(0) if match else clean


def _claim_text(text: str) -> tuple[str, bool]:
    """The words as they circulate, cut at 240 characters at a word boundary with «…» (the client's
    `truncateClaim`: a last word so long that the boundary falls far back is cut where it stands)."""
    clean = " ".join(text.split())
    if len(clean) <= CLAIM_MAX_CHARS:
        return clean, False
    head = clean[:CLAIM_MAX_CHARS]
    boundary = head.rfind(" ")
    return (head[:boundary] if boundary > CLAIM_MAX_CHARS * 0.6 else head).rstrip() + "…", True


# Type is reduced before anything is cut: the claim from 44 down to 34 and the source's wording from
# 46 (a verse) or 40 down to 30, two pixels at a step, together.
_CLAIM_SIZES = (44, 34)
_VERSE_SIZES = (46, 30)
_QUOTE_SIZES = (40, 30)
_VERSE_FLOOR = 22  # only for the quoted part of a verse that fits no other way: smaller type, never fewer words
_LADDER = range(0, 9)


def _step(sizes: tuple[int, int], i: int) -> int:
    return max(sizes[1], sizes[0] - 2 * i)


class _Claim:
    """One claim's card: what it says (decided once) and how it is fitted (tried in steps)."""

    def __init__(self, sheet: _Sheet, card: Card, state: str, overridden: bool, abstention_verse: dict | None) -> None:
        self.sh = sheet
        self.card = card
        self.state = state
        self.overridden = overridden
        self.solid, self.state_ink = sheet.states[state]
        en = sheet.en

        # Is it right? — one plain sentence. A reviewer's state has no sentence of the rules' behind it.
        note = (card.note_en or card.note_ar) if en else (card.note_ar or card.note_en)
        self.verdict = "" if overridden else _first_sentence(note)
        self.claim, self.claim_trimmed = _claim_text(card.text_as_quoted)
        self.claim_rtl = sheet.reads_rtl(self.claim)
        self.action = ACTION_SENTENCE[STATE_ACTION[EvidenceState(state)].value][en]

        # What does the source say? A personal case (level D) is never verified, so it shows no source.
        personal = card.personal_case or card.content_level == ContentLevel.D
        self.verse_ref = ""
        if state == "not_found":
            self.mode = "abstain"
            self.verse = True
            self.words = _display_words(abstention_verse["text"]) if abstention_verse else []
            self.span, self.marks = ((0, len(self.words)) if self.words else None), set()
            if abstention_verse:
                self.verse_ref = (abstention_verse.get("ref_en") or abstention_verse["ref"]) if en else abstention_verse["ref"]
        elif card.source is None or personal:
            self.mode = "refer"
            self.verse = False
            self.words, self.span, self.marks = [], None, set()
        else:
            self.mode = "source"
            self.verse = card.source.kind == "quran"
            self.words, self.span, self.marks = _collate(card)
        self.words_rtl = sheet.reads_rtl(" ".join(self.words))
        self.takhrij = self._takhrij() if self.mode == "source" else None

    # ---- parts

    def _state_row(self) -> list[_Item]:
        sh = self.sh
        size = sh.px(64)
        gap = sh.px(20)
        word = _W(STATE[self.state][sh.en], sh.ink("plex600", 52, self.state_ink))
        while word.ink.size > 30 and _width(word.text, word.ink.face, word.ink.size, sh.rtl) > sh.width - size - gap:
            word = replace(word, ink=replace(word.ink, size=word.ink.size - 2))  # the longest name stays on the ring's line

        def draw(y: int) -> None:
            x = sh.right - size if sh.rtl else sh.left
            sh.glyph("state-glyph", self.state, x, y, size)
            start = x - gap if sh.rtl else x + size + gap
            base = y + size // 2 + round(word.ink.size * 0.335)  # the word's middle on the ring's centre
            ink, end = sh._line([word], sh.rtl, base, start)
            sh.blocks.append(Block("state", (math.floor(min(start, end)), y, math.ceil(max(start, end)), y + size), ink, word.text))

        items = [_Item(size, draw)]
        if self.overridden:  # a person changed the state: said right after it, and no name
            items += [_gap(sh.px(6)), sh.item("review-mark", sh.tool(sh.say("overridden"), sh.ink("plex", 26, "quiet"), max_lines=1))]
        return items

    def _wording(self, a: int, b: int, size: int) -> list[_W]:
        """Words ``a``..``b`` of the source as drawn: «…» on each side that was cut, a verse between
        its brackets, the words that differ from the claim underlined."""
        sh = self.sh
        plain = _Ink("quran" if self.verse else "naskh", size, sh.t["ink"])
        differing = replace(plain, rule=self.solid)
        out: list[_W] = []
        opening = ("﴿" if self.verse else "") + ("…" if a > 0 else "")
        if opening:
            out.append(_W(opening, plain))
        for i in range(a, b):
            first = i == a and bool(opening)
            out.append(_W(self.words[i], differing if i in self.marks else plain, tie=first, space=_BRACKET_GAP if first and opening == "﴿" else 1))
        closing = ("…" if b < len(self.words) else "") + ("﴾" if self.verse else "")
        if closing:
            out.append(_W(closing, plain, tie=True, space=_BRACKET_GAP if closing == "﴾" else 0))
        return out

    def _wording_para(self, wording: list[_W], size: int, max_lines: int | None = None) -> _Para:
        face = "quran" if self.verse else "naskh"
        return _para(wording, self.sh.width, self.words_rtl, strut=(face, size), leading=2.2 if self.verse else 2.0, max_lines=max_lines)

    def _takhrij(self) -> _Para | None:
        """Reference — «the grading, verbatim», who gave it and where it was copied from. Several
        gradings are counted, not listed, so that none is singled out (as in the page's notes). A
        grading is drawn whole or not at all."""
        sh, card = self.sh, self.card
        src = card.source
        ref = sh.ink("plex", 30)
        quiet = sh.ink("plex", 26, "quiet")
        comma = "," if sh.en else "،"

        def build(tokens: list[_W]) -> _Para:
            return _para(tokens, sh.width, sh.reads_rtl(" ".join(w.text for w in tokens)), strut=("naskh", sh.px(36)), leading=1.6)

        ref_rtl = sh.reads_rtl(src.ref)
        lines, _cut = _clip(_wrap(_words(src.ref, ref), sh.width, ref_rtl), 2, sh.width, ref_rtl)
        head = [w for line in lines for w in line]
        dash = [_W("—", quiet, tie=True)] if head else []
        grades = [g for g in card.grades if g.text.strip()]
        if len(grades) == 1:
            g = grades[0]
            words = g.text.strip().splitlines()[0].split()  # the grading itself; a source's added remarks follow on later lines
            giver = _words(f"{comma} ".join(p for p in (g.scholar, g.source_name) if p), quiet)
            grading = [_W(("«" if i == 0 else "") + w + ("»" if i == len(words) - 1 else ""), sh.ink("naskh", 36)) for i, w in enumerate(words)]
            whole = build(head + dash + grading + ([_W(comma, quiet, tie=True, space=0)] + giver if giver else []))
            if len(whole.lines) <= 5:
                return whole
            tail = sh.say("one_grading")  # longer than the card can carry: it is not shortened, it is not drawn
        elif grades:
            tail = _grades_count(len(grades), sh.en)
        elif card.grade_unavailable:
            tail = sh.say("no_grading")
        else:
            tail = src.source_name
        tokens = head + (dash + _words(tail, quiet) if tail else [])
        return build(tokens) if tokens else None

    def items(
        self, step: int, *, wording: tuple[int, int] | str | None, claim_lines: int | None = None,
        source_lines: int | None = None, verdict_lines: int | None = None, source_size: int | None = None,
    ) -> tuple[list[_Item], dict]:  # fmt: skip
        """The card's body at one step of the ladder. ``wording`` is the slice of the source's words
        to draw, or the name of the sentence that stands in for it, or None for no wording at all."""
        sh = self.sh
        claim_size = _step(_CLAIM_SIZES, step)
        source_size = source_size or _step(_VERSE_SIZES if self.verse else _QUOTE_SIZES, step)
        label = sh.ink("plex", 26, "quiet")
        facts: dict = {"claim_size": claim_size, "source_size": source_size, "claim_cut": self.claim_trimmed, "verdict_cut": False}

        items = self._state_row()
        if self.verdict:
            verdict = sh.tool(self.verdict, sh.ink("plex", 34), max_lines=verdict_lines or (3 if sh.k == 1.0 else 2))
            facts["verdict_cut"] = verdict.cut
            items += [_gap(sh.px(12)), sh.item("verdict", verdict)]

        claim = _para(
            _words(self.claim, _Ink("naskh", claim_size, self.state_ink)), sh.width, self.claim_rtl,
            strut=("naskh", claim_size), leading=1.9, max_lines=claim_lines, line_rule=self.solid,
        )  # fmt: skip
        facts["claim_cut"] = self.claim_trimmed or claim.cut
        facts["claim_lines"] = len(claim.lines)
        items += [_gap(sh.px(26), sh.px(30)), sh.item("claim-label", sh.tool(sh.say("claim"), label, leading=1.45)), sh.item("claim", claim)]

        body: _Para | None = None
        if isinstance(wording, tuple):
            body = self._wording_para(self._wording(*wording, source_size), source_size, source_lines)
            facts["source_lines"] = len(body.lines)
        elif isinstance(wording, str):
            body = sh.tool(sh.say(wording), sh.ink("plex", 28, "quiet"))
        ruled = [_gap(sh.px(8)), _Item(HAIRLINE, sh.hairline), _gap(sh.px(6))]

        if self.mode == "source":
            items += [_gap(sh.px(22), sh.px(26)), sh.item("source-label", sh.tool(sh.say("source"), label, leading=1.45))]
            if body is not None:
                items += ruled + [sh.item("source" if isinstance(wording, tuple) else "source-note", body), _gap(sh.px(6)), _Item(HAIRLINE, sh.hairline)]
            if self.takhrij is not None:
                items += [_gap(sh.px(12)), sh.item("takhrij", self.takhrij)]
        elif self.mode == "abstain":
            items += [_gap(sh.px(22), sh.px(26)), sh.item("abstention", sh.tool(sh.say("abstain"), sh.ink("plex", 30)))]
            if body is not None:
                items += ruled + [sh.item("abstention-verse", body), _gap(sh.px(6)), _Item(HAIRLINE, sh.hairline)]
                items += [_gap(sh.px(10)), sh.item("abstention-ref", sh.tool(self.verse_ref, label, leading=1.45, max_lines=1))]
        else:  # "refer": nothing is quoted — the reason is the sentence under the state; the referral stands here
            items += [_gap(sh.px(22), sh.px(26)), _Item(HAIRLINE, sh.hairline), _gap(sh.px(14))]
            items += [sh.item("referral", sh.tool(sh.say("referral"), sh.ink("plex", 30), max_lines=3)), _gap(sh.px(14)), _Item(HAIRLINE, sh.hairline)]
        items += [_gap(sh.px(22), sh.px(26), spring=1), sh.item("action", sh.tool(self.action, sh.ink("plex600", 30), max_lines=2))]
        return items, facts

    # ---- fitting

    def fit(self, room: int) -> tuple[list[_Item], dict]:
        """Choose what is drawn so that the body is at most ``room`` high.

        1. Everything whole, at the largest step of the ladder that fits.
        2. A verse that does not fit whole even at the smallest size: only the part that corresponds
           to the quotation, «…» on each side that was cut — never a cut inside that part. If that
           part still does not fit, the claim gives up lines for it, then its own type goes below
           the range (down to 22); if it cannot fit even so, the verse's words are not drawn and a
           sentence says so (its reference always is drawn).
        3. Any other wording: cut at a word boundary with «…», starting at the quoted part when the
           text before it would push that part off the card.
        """
        n = len(self.words)
        whole = (0, n) if n else None
        last = _LADDER[-1]

        def height(items: list[_Item]) -> int:
            return sum(i.height for i in items)

        def attempt(source: str | None, step: int, **kw) -> tuple[list[_Item], dict] | None:
            items, facts = self.items(step, **kw)
            return (items, {**facts, "source": source}) if height(items) <= room else None

        for step in _LADDER:
            if done := attempt("whole" if whole else None, step, wording=whole):
                return done

        # From here on everything is at the smallest sizes.
        source_size = _step(_VERSE_SIZES if self.verse else _QUOTE_SIZES, last)
        claim_h = round(_step(_CLAIM_SIZES, last) * 1.9)
        source_h = round(source_size * (2.2 if self.verse else 2.0))
        claim_needed = self.items(last, wording=None)[1]["claim_lines"]
        stand_in: str | None = None

        def lines_of(a: int, b: int, size: int = source_size) -> int:
            return len(self._wording_para(self._wording(a, b, size), size).lines)

        if whole:
            # the body without the claim's lines and without the wording's lines
            probe, facts = self.items(last, wording=(0, 1), claim_lines=1)
            fixed = height(probe) - claim_h * facts["claim_lines"] - source_h * facts["source_lines"]
            if self.verse:
                # What must be drawn uncut: the quoted part, or the whole verse when that part is not known.
                uncut = self.span or whole
                kind = "whole" if uncut == whole else "excerpt"
                if uncut != whole:
                    for step in _LADDER:
                        if done := attempt(kind, step, wording=uncut):
                            return done
                for size in range(source_size, _VERSE_FLOOR - 1, -2):  # the claim makes room for it; then its type gives way
                    keep = (room - fixed - lines_of(*uncut, size) * round(size * 2.2)) // claim_h
                    if keep >= 1 and (done := attempt(kind, last, wording=uncut, claim_lines=min(keep, claim_needed), source_size=size)):
                        return done
                stand_in = "verse_too_long" if self.mode == "source" else None
            else:

                def cut(keep: int) -> tuple[list[_Item], dict] | None:
                    """The claim on ``keep`` lines, the wording on the lines that are left."""
                    lines = (room - fixed - keep * claim_h) // source_h
                    if keep < 1 or lines < 1:
                        return None
                    start = self.span[0] if self.span and lines_of(0, self.span[1]) > lines else 0
                    return attempt("cut", last, wording=(start, n), claim_lines=keep, source_lines=lines)

                # The claim stays whole while the wording has two lines, then one; after that the
                # claim gives up lines so that the wording keeps two, then one.
                for least in (2, 1):
                    if (room - fixed - claim_needed * claim_h) // source_h >= least and (done := cut(claim_needed)):
                        return done
                for least in (2, 1):
                    if done := cut(min(claim_needed, (room - fixed - least * source_h) // claim_h)):
                        return done
                stand_in = "text_too_long"

        # The wording cannot be drawn as the rules require: a sentence stands in for it and the
        # reference stays. Then, in turn, the claim and the verdict sentence give up lines.
        source = "omitted" if whole else None
        for step in _LADDER:
            if done := attempt(source, step, wording=stand_in):
                return done
        for wording in dict.fromkeys((stand_in, None)):
            for verdict_lines in (None, 1):
                for lines in range(claim_needed, 0, -1):
                    if done := attempt(source, last, wording=wording, claim_lines=lines, verdict_lines=verdict_lines):
                        return done
        items, facts = self.items(last, wording=None, claim_lines=1, verdict_lines=1)
        return items, {**facts, "source": source}


def draw_claim_card(card: Card, *, size: str, theme: str, lang: str, app_url: str, abstention_verse: dict | None, override_state: EvidenceState | None = None) -> Drawn:
    state = (override_state or card.state).value
    sheet = _Sheet(size, theme, lang)
    top = sheet.header("title")
    bottom = sheet.footer(app_url)
    claim = _Claim(sheet, card, state, bool(override_state and override_state != card.state), abstention_verse)
    items, facts = claim.fit(bottom - top)
    sheet.place(items, top, bottom)
    return sheet.done({**facts, "body": (top, bottom)})


def render_claim_card(card: Card, *, size: str, theme: str, lang: str, app_url: str, abstention_verse: dict | None, override_state: EvidenceState | None = None) -> bytes:
    return draw_claim_card(card, size=size, theme=theme, lang=lang, app_url=app_url, abstention_verse=abstention_verse, override_state=override_state).png()


# --------------------------------------------------------------------------- the summary card

# The report in one sentence, with number words and agreement — the same sentence as the page's
# summary (frontend `summary.ts` and its dictionaries).
_AR_NUMBER = ("", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة")
_EN_NUMBER = ("", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten")
_AR_FORMS = {  # one, two, many, alone, all of
    "supported": ("مؤيَّد", "مؤيَّدان", "مؤيَّدة", "مؤيَّد", "مؤيَّدة"),
    "supported_with_note": ("مع ملاحظة", "مع ملاحظة", "مع ملاحظة", "مؤيَّد مع ملاحظة", "مؤيَّدة مع ملاحظة"),
    "needs_review": ("يحتاج مراجعة", "يحتاجان مراجعة", "تحتاج مراجعة", "يحتاج مراجعة", "تحتاج مراجعة"),
    "not_found": ("بلا مصدر", "بلا مصدر", "بلا مصدر", "بلا مصدر", "بلا مصدر"),
    "contradicted": ("مخالف للمصدر", "مخالفان للمصدر", "مخالفة للمصدر", "مخالف للمصدر", "مخالفة للمصدر"),
}
_EN_FORMS = {  # one, many
    "supported": ("supported", "supported"),
    "supported_with_note": ("with a note", "with a note"),
    "needs_review": ("needs review", "need review"),
    "not_found": ("with no source", "with no source"),
    "contradicted": ("contradicts the source", "contradict the source"),
}


def _number(n: int, en: bool) -> str:
    return (_EN_NUMBER if en else _AR_NUMBER)[n] if 1 <= n <= 10 else f"{n:,}"


def _total(n: int, en: bool) -> str:
    if en:
        return "No citations" if n == 0 else f"{_number(n, True).capitalize()} {'citation' if n == 1 else 'citations'}"
    if n <= 2:
        return ("لا استشهادات", "استشهاد واحد", "استشهادان")[n]
    if n <= 10:
        return f"{_AR_NUMBER[n]} استشهادات"
    return f"{n} {'استشهادات' if 3 <= n % 100 <= 10 else 'استشهاداً'}"


def summary_parts(total: int, counts: dict[str, int], en: bool) -> tuple[str, list[tuple[str, str]]]:
    """The summary sentence as its head and its clauses, one per state present: (state, words).
    Joined in order they read as the page's sentence («سبعة استشهادات: أربعة مؤيَّدة، … وواحد بلا مصدر»)."""
    present = [s for s in STATES_FOR_SUMMARY if counts.get(s, 0) > 0]
    head = _total(total, en)
    if total == 0 or not present:
        return head, []
    if len(present) == 1:
        state = present[0]
        if en:
            one, many = _EN_FORMS[state]
            return head + ":", [(state, one if total == 1 else f"{'both' if total == 2 else 'all'} {many}")]
        alone, all_of = _AR_FORMS[state][3], _AR_FORMS[state][4]
        if total == 1:
            return head, [(state, alone)]
        return head + "،", [(state, f"كلاهما {alone}" if total == 2 else f"كلها {all_of}")]
    comma, last_joiner = (",", "and ") if en else ("،", "و")
    clauses: list[tuple[str, str]] = []
    for i, state in enumerate(present):
        n = counts[state]
        if en:
            form = _EN_FORMS[state][0 if n == 1 else 1]
        else:
            form = _AR_FORMS[state][0 if n == 1 else 1 if n == 2 else 2]
        final = i == len(present) - 1
        clauses.append((state, (last_joiner if final else "") + f"{_number(n, en)} {form}" + ("" if final else comma)))
    return head + ":", clauses


def draw_summary_card(summary: Summary, *, size: str, theme: str, lang: str, app_url: str, human_reviewed: bool = False) -> Drawn:
    sh = _Sheet(size, theme, lang)
    top = sh.header("summary_title")
    bottom = sh.footer(app_url)
    counts = {state.value: n for state, n in summary.by_state.items()}
    head, clauses = summary_parts(summary.total, counts, sh.en)
    type_size, glyph, gap = sh.px(44), sh.px(46), sh.px(18)
    row = round(type_size * 1.65)

    items = [_gap(0, spring=2), sh.item("summary-head", sh.tool(head, sh.ink("plex600", 44), leading=1.65))]
    for state, words in clauses:
        ink = _Ink("plex600", type_size, sh.states[state][1])
        clause = _para(_words(words, ink), sh.width - glyph - gap, sh.rtl, strut=("plex600", type_size), leading=1.65, max_lines=1)

        def draw(y: int, state: str = state, clause: _Para = clause) -> None:
            x = sh.right - glyph if sh.rtl else sh.left
            sh.glyph(f"summary-glyph-{state}", state, x, y + (row - glyph) // 2, glyph)
            start = x - gap if sh.rtl else x + glyph + gap
            ink_box, end = sh._line(clause.lines[0], sh.rtl, y + clause.baseline, start)
            sh.blocks.append(Block(f"summary-{state}", (math.floor(min(start, end)), y, math.ceil(max(start, end)), y + row), ink_box, clause.text))

        items.append(_Item(row, draw))
    if human_reviewed:  # some counted states were set by a human reviewer; no name is drawn
        items += [_gap(sh.px(16)), sh.item("review-mark", sh.tool(sh.say("overridden"), sh.ink("plex", 26, "quiet"), max_lines=1))]
    items.append(_gap(0, spring=3))
    sh.place(items, top, bottom)
    return sh.done({"body": (top, bottom)})


def render_summary_card(summary: Summary, *, size: str, theme: str, lang: str, app_url: str, human_reviewed: bool = False) -> bytes:
    return draw_summary_card(summary, size=size, theme=theme, lang=lang, app_url=app_url, human_reviewed=human_reviewed).png()
