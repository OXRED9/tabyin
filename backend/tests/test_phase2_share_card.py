"""F3 — the shareable verdict card (v2, docs/DESIGN.md §8): server-side renderer and endpoint.

House rule: no verse, narration or grading is typed here. Cards come from the real pipeline run on
texts read from the data files by reference; faults and extreme lengths are produced from them.
"""
import io
from datetime import date

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from tabayyun import main, pipeline
from tabayyun.config import settings
from tabayyun.meta import build_meta
from tabayyun.normalize import normalize_ar
from tabayyun.report import share_card
from tabayyun.report.labels import STATE_SHORT
from tabayyun.report.share_card import (
    ACTION_SENTENCE,
    SIZES,
    STATE_TOKENS,
    TEXT,
    THEMES,
    Drawn,
    _collate,
    _first_sentence,
    _more,
    draw_claim_card,
    draw_summary_card,
    render_claim_card,
    render_summary_card,
    summary_parts,
)
from tabayyun.schemas import STATE_ACTION, Card, EvidenceState, Summary
from tabayyun.sources.dorar import DorarClient
from tabayyun.textalign import similarity
from tests.llm_stubs import NoLLM

URL = "https://tabayyun.example.org"
HEADER = {"logotype", "label"}
FOOTER = {"qr", "check", "address", "transparency"}


@pytest.fixture()
def report(verify_text, ayah, matn):
    words = ayah(2, 255)[1].split()[:22]
    words[10] = ayah(55, 46)[1].split()[-1]
    return verify_text(
        f"قال الله تعالى: ﴿{ayah(49, 6)[1]}﴾\n"
        f"قال رسول الله صلى الله عليه وسلم: «{matn('4560')}»\n"
        "قال الله تعالى: ﴿" + " ".join(words) + "﴾\n"
        "أعطني حديثاً يثبت أن السهر يزيد العمر.\n"
        "أنا مسافر غداً فهل يجوز لي أن أفطر؟"
    )


@pytest.fixture()
def card_of(verify_text):
    """card_of(text) -> the first card the pipeline produces for a pasted text."""

    def _one(text: str) -> Card:
        return Card.model_validate(verify_text(text)["cards"][0])

    return _one


def by(report, **want) -> Card:
    return Card.model_validate(next(c for c in report["cards"] if all(c[k] == v for k, v in want.items())))


def png(data: bytes) -> Image.Image:
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    return Image.open(io.BytesIO(data)).convert("RGB")


def draw(card, **kw) -> Drawn:
    base = dict(size="portrait", theme="light", lang="ar", app_url=URL, abstention_verse=build_meta()["abstention_verse"])
    return draw_claim_card(card if isinstance(card, Card) else Card.model_validate(card), **{**base, **kw})


def rgb(colour: str) -> tuple[int, int, int]:
    return tuple(int(colour[i : i + 2], 16) for i in (1, 3, 5))


def colours(image: Image.Image, box=None) -> set:
    return {c for _n, c in (image.crop(box) if box else image).getcolors(maxcolors=1 << 21)}


def body(drawn: Drawn):
    """The body of a card as an image: everything between the header's and the footer's hairlines."""
    top, bottom = drawn.fit["body"]
    return drawn.image.crop((0, top, drawn.image.width, bottom))


def names(drawn: Drawn) -> list[str]:
    return [b.name for b in sorted(drawn.blocks, key=lambda b: (b.box[1], b.name)) if b.name not in HEADER | FOOTER]


def text_of(drawn: Drawn, name: str) -> str:
    block = drawn.block(name)
    assert block is not None, f"no «{name}» block among {[b.name for b in drawn.blocks]}"
    return " ".join(block.text.split())


# ------------------------------------------------------------------ what the card shows


@pytest.mark.parametrize("size", ["portrait", "square"])
@pytest.mark.parametrize("theme", ["light", "dark"])
@pytest.mark.parametrize("lang", ["ar", "en"])
def test_every_card_renders_at_the_exact_size_in_both_themes_and_languages(report, size, theme, lang):
    verse = build_meta()["abstention_verse"]
    for card in report["cards"]:
        img = png(render_claim_card(Card.model_validate(card), size=size, theme=theme, lang=lang, app_url=URL, abstention_verse=verse))
        assert img.size == SIZES[size]
        assert img.getpixel((4, 4)) == rgb(THEMES[theme]["paper"])  # paper to the edge: no band, no desk
        assert len(img.getcolors(maxcolors=1 << 20) or []) > 60  # drawn, anti-aliased content — not a blank frame


def test_the_blocks_come_in_the_order_of_the_design(report):
    drawn = draw(by(report, claim_type="hadith"))
    assert names(drawn) == ["state", "state-glyph", "verdict", "claim-label", "claim", "source-label", "source", "takhrij", "action"]
    assert {b.name for b in drawn.blocks} >= HEADER | FOOTER
    card = by(report, claim_type="hadith")
    assert text_of(drawn, "state") == STATE_SHORT["supported"][0]
    assert text_of(drawn, "verdict") == _first_sentence(card.note_ar)
    assert text_of(drawn, "claim-label") == TEXT["claim"][0] and text_of(drawn, "source-label") == TEXT["source"][0]
    assert text_of(drawn, "action") == ACTION_SENTENCE["adopt"][0] == "الإجراء المقترح: نقله كما ورد مع ذكر مرجعه."
    assert text_of(draw(card, lang="en"), "action") == "Suggested action: cite it as quoted, with its reference."
    assert text_of(drawn, "transparency") == "تبيّن أداة مدعومة بالذكاء الاصطناعي، لا تغني عن الرجوع إلى أهل العلم"
    assert text_of(drawn, "address") == "tabayyun.example.org"
    assert text_of(drawn, "logotype") == TEXT["brand"][0] and text_of(drawn, "label") == TEXT["title"][0]


@pytest.mark.parametrize("theme", ["light", "dark"])
def test_a_state_is_a_glyph_a_word_and_its_colour_and_gold_is_only_on_the_verified_ring(report, theme):
    gold = rgb(THEMES[theme]["gold"])
    for raw in report["cards"]:
        drawn = draw(raw, theme=theme)
        state = raw["state"]
        solid, ink = STATE_TOKENS[theme][state]
        seen = colours(body(drawn))
        assert rgb(solid) in seen and rgb(ink) in seen  # the underline and the words
        assert drawn.block("state-glyph") is not None and text_of(drawn, "state") == STATE_SHORT[state][0]
        assert (gold in colours(drawn.image)) == (state == "supported")


def in_state(card: Card, state: str) -> Card:
    """The same card in another state, as a request could carry it (the texts stay the data's)."""
    wanted = EvidenceState(state)
    return card.model_copy(update={"state": wanted, "action": STATE_ACTION[wanted]})


def test_the_states_are_named_by_what_was_found_about_the_source(report):
    card = by(report, claim_type="hadith")
    words = {state: (text_of(draw(in_state(card, state)), "state"), text_of(draw(in_state(card, state), lang="en"), "state")) for state in STATE_SHORT}
    assert words == STATE_SHORT  # the short names, from the one table the exports share
    assert words["supported"] == ("له مرجعية", "Has a reference") and words["not_found"] == ("بلا مرجعية", "No reference found")


def test_the_claim_is_in_the_states_ink_and_underlined(report):
    card = by(report, state="supported_with_note")
    drawn = draw(card)
    solid, ink = STATE_TOKENS["light"]["supported_with_note"]
    claim = drawn.block("claim")
    seen = colours(drawn.image, claim.ink)
    assert rgb(ink) in seen and rgb(solid) in seen
    assert text_of(drawn, "claim") == " ".join(card.text_as_quoted.split())


def test_the_sources_wording_is_drawn_and_the_words_that_differ_are_underlined(report, ayah):
    noted = by(report, state="supported_with_note")
    words, span, marks = _collate(noted)
    assert " ".join(words) == " ".join(noted.source.text.split())  # the source's words, untouched
    # exactly the word the quotation changed: the 11th word of the verse (the fixture swapped it)
    assert span is not None and span[0] == 0 and len(marks) == 1
    changed = ayah(2, 255)[1].split()[10]
    assert similarity(normalize_ar(words[next(iter(marks))]), normalize_ar(changed)) >= 0.5

    solid = rgb(STATE_TOKENS["light"]["supported_with_note"][0])
    drawn = draw(noted)
    assert solid in colours(drawn.image, drawn.block("source").ink)  # the collation's underline
    assert noted.source.text.split()[0] in text_of(drawn, "source")
    assert text_of(drawn, "takhrij") == f"{noted.source.ref} — {noted.source.source_name}"  # a verse: its reference and where its text is from, no grading

    exact = by(report, state="supported", claim_type="ayah")
    drawn = draw(exact)
    assert rgb(STATE_TOKENS["light"]["supported"][0]) not in colours(drawn.image, drawn.block("source").ink)
    assert text_of(drawn, "source") == "﴿" + " ".join(exact.source.text.split()) + "﴾"


def test_a_grading_is_drawn_verbatim_with_its_source_and_never_shortened(report, hadith):
    card = by(report, claim_type="hadith")
    grade = card.grades[0]
    for size in SIZES:
        for lang, comma in (("ar", "،"), ("en", ",")):
            takhrij = text_of(draw(card, size=size, lang=lang), "takhrij")
            assert takhrij == f"{card.source.ref} — «{grade.text}»{comma} {grade.source_name}"

    # the longest one-line grading in the data, on the smaller card: whole, never shortened
    longest = max((r["grade"].splitlines()[0] for r in hadith.hadeethenc.values() if r.get("grade")), key=len)
    assert len(longest) > 40
    takhrij = text_of(draw(card.model_copy(update={"grades": [grade.model_copy(update={"text": longest})]}), size="square"), "takhrij")
    assert f"«{longest}»" in takhrij and "…" not in takhrij
    # the muhaddith, when the source names one, stands between the grading and its source
    named = grade.model_copy(update={"scholar": "SCHOLAR-AS-THE-SOURCE-NAMES-HIM"})
    assert "»، SCHOLAR-AS-THE-SOURCE-NAMES-HIM، " + grade.source_name in text_of(draw(card.model_copy(update={"grades": [named]})), "takhrij")

    # several gradings are counted, not listed: none is singled out
    several = card.model_copy(update={"grades": [grade, grade, grade]})
    assert text_of(draw(several), "takhrij") == f"{card.source.ref} — 3 أحكام في المصادر"
    assert text_of(draw(several, lang="en"), "takhrij") == f"{card.source.ref} — 3 gradings in the sources"

    unavailable = card.model_copy(update={"grades": [], "grade_unavailable": True})
    assert text_of(draw(unavailable), "takhrij") == f"{card.source.ref} — الحكم غير متاح من المصدر"
    assert text_of(draw(unavailable, lang="en"), "takhrij").endswith(TEXT["no_grading"][1])


def test_not_found_shows_the_abstention_sentence_and_verse_and_no_source(report):
    verse = build_meta()["abstention_verse"]
    card = by(report, state="not_found")
    for size in SIZES:
        drawn = draw(card, size=size)
        assert names(drawn) == ["state", "state-glyph", "verdict", "claim-label", "claim", "abstention", "abstention-verse", "abstention-ref", "action"]
        assert text_of(drawn, "abstention") == TEXT["abstain"][0]
        assert text_of(drawn, "abstention-verse") == f"﴿{verse['text']}﴾"
        assert text_of(drawn, "abstention-ref") == verse["ref"]
        assert text_of(drawn, "action") == ACTION_SENTENCE["remove_or_request_source"][0]
    assert text_of(draw(card, lang="en"), "abstention-ref") == verse["ref_en"]
    # a card that says nothing was found never shows a source, even if the request attaches one
    forged = draw(in_state(by(report, claim_type="hadith"), "not_found"))
    assert forged.block("source") is None and forged.block("takhrij") is None and forged.block("abstention-verse") is not None


def test_a_personal_case_gets_no_source_and_is_referred(report):
    card = by(report, personal_case=True)
    drawn = draw(card)
    # the reason is the sentence under the state (said once); the referral stands in the source's place
    assert names(drawn) == ["state", "state-glyph", "verdict", "claim-label", "claim", "referral", "action"]
    assert text_of(drawn, "verdict") == card.note_ar == TEXT["personal_case"][0]
    assert text_of(drawn, "referral") == TEXT["referral"][0]
    assert text_of(drawn, "action") == ACTION_SENTENCE["refer_to_scholars"][0]
    # whatever a request says, a personal case gets no verdict and shows no source
    forged = in_state(card.model_copy(update={"source": by(report, claim_type="hadith").source}), "supported")
    drawn = draw(forged)
    assert drawn.block("source") is None and text_of(drawn, "state") == STATE_SHORT["needs_review"][0]
    assert rgb(THEMES["light"]["gold"]) not in colours(drawn.image) and text_of(drawn, "action") == ACTION_SENTENCE["refer_to_scholars"][0]
    # and a disputed matter is never drawn as having a reference, nor as differing from its source
    for state in ("supported", "contradicted"):
        capped = draw(in_state(by(report, claim_type="hadith").model_copy(update={"content_level": "C"}), state))
        assert text_of(capped, "state") == STATE_SHORT["needs_review"][0]
    # a disputed matter with no source: its reason, then the referral — nothing quoted, no preference
    disputed = card.model_copy(update={"personal_case": False, "content_level": "C", "disagreement_noted": True, "note_ar": "", "note_en": ""})
    drawn = draw(disputed)
    assert names(drawn) == ["state", "state-glyph", "claim-label", "claim", "reason-1", "referral", "action"]
    assert text_of(drawn, "reason-1") == TEXT["disagreement"][0]


def test_nothing_about_the_user_is_drawn(report):
    raw = dict(next(c for c in report["cards"] if c["claim_type"] == "hadith"))
    raw["timestamp"] = {"start": 754.0, "end": 760.0}
    raw["attributed_to"] = "THE-SPEAKER'S-NAME"
    for lang in ("ar", "en"):
        drawn = draw(raw, lang=lang)
        drawn_text = " ".join(b.text for b in drawn.blocks)
        assert "THE-SPEAKER'S-NAME" not in drawn_text
        assert "://" not in drawn_text and raw["source"]["url"] not in drawn_text  # no link but the app's address, without scheme
        assert str(date.today().year) not in drawn_text and "12:34" not in drawn_text  # no date, no clip time
        assert {b.name for b in drawn.blocks} <= HEADER | FOOTER | {"state", "state-glyph", "verdict", "claim-label", "claim", "source-label", "source", "takhrij", "action"}


def test_first_sentence():
    assert _first_sentence("الأولى. الثانية.") == "الأولى."
    assert _first_sentence("جملة واحدة") == "جملة واحدة"
    assert _first_sentence("أولى؛ تتمتها.  ثانية.") == "أولى؛ تتمتها."


# ------------------------------------------------------------------ fitting


def test_type_is_reduced_before_anything_is_cut(report):
    card = by(report, claim_type="hadith")
    words = card.source.text.split()
    text = " ".join(words)
    while len(text) < 230:
        text += " " + " ".join(words)
    card.text_as_quoted = text[:236].rsplit(" ", 1)[0]
    for size in SIZES:
        drawn = draw(card, size=size)
        assert not drawn.fit["claim_cut"], f"{size}: a claim under 240 characters was cut"
        assert text_of(drawn, "claim") == card.text_as_quoted
        assert drawn.fit["claim_size"] < 44  # it fits because the type stepped down
    short = draw(by(report, state="supported", claim_type="ayah"))
    assert (short.fit["claim_size"], short.fit["source_size"], short.fit["source"]) == (44, 46, "whole")


def test_a_long_claim_is_cut_at_240_characters_at_a_word_boundary(report):
    card = by(report, claim_type="hadith")
    card.text_as_quoted = (card.source.text + " ") * 6  # far longer than a card can hold
    for size in SIZES:
        drawn = draw(card, size=size)
        claim = text_of(drawn, "claim")
        assert drawn.fit["claim_cut"] and claim.endswith("…") and len(claim) <= 241
        assert card.text_as_quoted.startswith(claim[:-1])  # whole words of the claim, in order
        qr = drawn.block("qr")
        assert len(drawn.image.crop(qr.box).getcolors(maxcolors=4096)) == 2  # the QR code is intact


def test_a_narration_that_does_not_fit_is_cut_at_a_word_boundary_and_keeps_the_quoted_part(card_of, hadith):
    longest = max(hadith.hadeethenc.values(), key=lambda r: len(r["hadeeth"]))
    # from deep inside the narration: its opening would fill the card before the quoted part came
    quoted = [w.strip("«»") for w in longest["hadeeth"].split()[150:180]]
    card = card_of("قال رسول الله صلى الله عليه وسلم: «" + " ".join(quoted) + "»")
    assert card.source is not None and len(card.source.text) > 5000
    for size in SIZES:
        drawn = draw(card, size=size)
        shown = text_of(drawn, "source")
        assert drawn.fit["source"] == "cut" and shown.startswith("…") and shown.endswith("…")
        kept = shown.strip("… ").split()
        source_words = card.source.text.split()
        at = next(i for i in range(len(source_words)) if source_words[i : i + len(kept) - 1] == kept[:-1])
        assert source_words[at + len(kept) - 1].startswith(kept[-1].rstrip("،؛:,;."))  # whole words, in the source's order
        assert kept[:3] == card.text_as_quoted.split()[:3]  # it starts at the quoted part, not at the narration's opening


def test_a_verse_is_never_cut_inside_the_quoted_span(card_of, ayah):
    uthmani, clean = ayah(2, 282)
    assert len(uthmani) > 1000  # the longest verse of the Mushaf

    # a quotation from the middle of it: the card shows that part, «…» on both sides, between its brackets
    quoted = clean.split()[40:54]
    card = card_of("قال الله تعالى: ﴿" + " ".join(quoted) + "﴾")
    assert card.state == EvidenceState.supported and card.source.text == uthmani
    for size in SIZES:
        drawn = draw(card, size=size)
        shown = text_of(drawn, "source")
        assert drawn.fit["source"] == "excerpt" and shown.startswith("﴿…") and shown.endswith("…﴾")
        part = shown[2:-2].split()
        verse = uthmani.split()
        assert any(verse[i : i + len(part)] == part for i in range(len(verse)))  # consecutive words of the verse, untouched
        assert abs(len(part) - len(quoted)) <= 2
        at = 0
        for word in quoted:  # every quoted word is there, in order
            at = next(i for i in range(at, len(part)) if similarity(normalize_ar(part[i]), normalize_ar(word)) >= 0.5) + 1
        assert text_of(drawn, "takhrij").startswith(card.source.ref)  # and always its reference

    # the whole of it quoted. The tall card holds it whole: the claim gives up lines, then the verse's type goes below 30
    whole = card_of(f"قال الله تعالى: ﴿{clean}﴾")
    drawn = draw(whole, size="portrait")
    assert drawn.fit["source"] == "whole" and 22 <= drawn.fit["source_size"] < 30 and drawn.fit["claim_cut"]
    assert text_of(drawn, "source") == "﴿" + " ".join(uthmani.split()) + "﴾"
    # the square card cannot hold it: its words are not drawn at all — never a part of them
    drawn = draw(whole, size="square")
    assert drawn.fit["source"] == "omitted" and drawn.block("source") is None
    assert text_of(drawn, "source-note") == TEXT["verse_too_long"][0]
    assert text_of(drawn, "takhrij").startswith(whole.source.ref)

    # a verse that fits only if the claim gives up lines: the verse stays whole, the claim is cut
    kursi = card_of(f"قال الله تعالى: ﴿{ayah(2, 255)[1]}﴾")
    drawn = draw(kursi, size="square")
    assert drawn.fit["source"] == "whole" and drawn.fit["claim_cut"]
    assert text_of(drawn, "source") == "﴿" + " ".join(kursi.source.text.split()) + "﴾"


def assert_inside_the_frame(drawn: Drawn, theme: str = "light") -> None:
    """Every block's ink is inside the hairline frame and the paper's margin; the body's blocks lie
    between the header and the footer, one after another; nothing is drawn over the frame or outside it."""
    image = drawn.image
    x0, y0, x1, y1 = drawn.frame
    top, bottom = drawn.fit["body"]
    margin = min(b.box[0] for b in drawn.blocks if b.name in ("logotype", "label")) - x0  # the paper's inner margin
    for b in drawn.blocks:
        assert x0 + 2 < b.ink[0] and y0 + 2 < b.ink[1] and b.ink[2] < x1 - 2 and b.ink[3] < y1 - 2, f"{b.name} leaves the frame: {b.ink}"
        # shaped Arabic may overhang its advance by a few pixels, never by the margin
        assert b.ink[0] >= x0 + margin - 8 and b.ink[2] <= x1 - margin + 8, f"{b.name} leaves the column: {b.ink}"
    parts = [b for b in drawn.blocks if b.name not in HEADER | FOOTER]
    assert parts, "an empty card"
    for b in parts:
        assert top <= b.box[1] and b.box[3] <= bottom, f"{b.name} leaves the body ({top}–{bottom}): {b.box}"

    def within(a, b) -> bool:
        return b[0] <= a[0] and b[1] <= a[1] and a[2] <= b[2] and a[3] <= b[3]

    for i, a in enumerate(parts):  # no two parts share ground — except a ring set inside its own line
        for b in parts[i + 1 :]:
            apart = a.box[2] <= b.box[0] or b.box[2] <= a.box[0] or a.box[3] <= b.box[1] or b.box[3] <= a.box[1]
            assert apart or within(a.box, b.box) or within(b.box, a.box), f"{a.name} and {b.name} overlap: {a.box} {b.box}"
    paper, rule = rgb(THEMES[theme]["paper"]), rgb(THEMES[theme]["rule"])
    w, h = image.size
    for strip in ((0, 0, w, y0), (0, y1, w, h), (0, 0, x0, h), (x1, 0, w, h)):
        assert colours(image, strip) == {paper}, f"ink outside the frame in {strip}"
    for edge in ((x0, y0, x1, y0 + 2), (x0, y1 - 2, x1, y1), (x0, y0, x0 + 2, y1), (x1 - 2, y0, x1, y1)):
        assert colours(image, edge) == {rule}, f"something is drawn over the frame at {edge}"
    qr = drawn.block("qr")
    assert len(image.crop(qr.box).getcolors(maxcolors=4096)) == 2


@pytest.fixture()
def longest_cases(report, card_of, hadith, ayah, matn):
    """The longest realistic cards, built from the data: (name, card)."""
    record = max(hadith.hadeethenc.values(), key=lambda r: len(r["hadeeth"]))
    reference = max((r["attribution"] for r in hadith.hadeethenc.values() if r.get("attribution")), key=len)
    grading = max((r["grade"].splitlines()[0] for r in hadith.hadeethenc.values() if r.get("grade")), key=len)
    narration = card_of("قال رسول الله صلى الله عليه وسلم: «" + " ".join(matn(record["id"]).split()[:120]) + "»")
    assert len(narration.text_as_quoted) > 240 and len(narration.source.text) > 5000 and len(reference) > 300
    grade = narration.grades[0]
    narration.source.ref = reference
    narration.grades = [grade.model_copy(update={"text": grading}), grade, grade, grade]

    hadith_card = by(report, claim_type="hadith")
    wide = hadith_card.model_copy(update={"text_as_quoted": normalize_ar(hadith_card.source.text * 3)})  # no marks: the widest 240 characters
    unbroken = by(report, state="not_found").model_copy(update={"text_as_quoted": "https://example.org/" + "a-very-long-path/" * 20})
    verse = ayah(2, 282)[1]
    return [
        ("a long narration, reference and gradings", narration),
        ("240 wide characters", wide),
        ("the longest verse, whole", card_of(f"قال الله تعالى: ﴿{verse}﴾")),
        ("the longest verse, a part", card_of("قال الله تعالى: ﴿" + " ".join(verse.split()[40:70]) + "﴾")),
        ("a verse with a changed word", by(report, state="supported_with_note")),
        ("an unbroken address", unbroken),
        ("a personal case", by(report, personal_case=True)),
        ("a long narration, differing from its source", in_state(narration, "contradicted")),
        ("240 wide characters and nothing found", in_state(wide, "not_found")),
    ]


@pytest.mark.parametrize("size", ["portrait", "square"])
@pytest.mark.parametrize("lang", ["ar", "en"])
def test_the_longest_cards_never_leave_the_frame(longest_cases, size, lang):
    for n, (name, card) in enumerate(longest_cases):
        theme = "dark" if n % 2 else "light"
        drawn = draw(card, size=size, lang=lang, theme=theme)
        try:
            assert_inside_the_frame(drawn, theme)
        except AssertionError as failure:
            raise AssertionError(f"{name} ({size}, {lang}): {failure}") from failure
        assert drawn.block("claim") is not None and drawn.block("action") is not None


# ------------------------------------------------------------------ the summary card


def test_the_summary_sentence_agrees_in_number_with_each_state():
    counts = {"supported": 3, "supported_with_note": 1, "needs_review": 2, "not_found": 2, "contradicted": 1}
    head, clauses = summary_parts(9, counts, False)
    assert head == "تسعة استشهادات:" and [s for s, _ in clauses] == ["supported", "supported_with_note", "needs_review", "not_found", "contradicted"]
    assert dict(clauses) == {
        "supported": "ثلاثة لها مرجعية",
        "supported_with_note": "واحد له مرجعية مع ملاحظة",
        "needs_review": "اثنان يحتاجان مراجعة",
        "not_found": "اثنان بلا مرجعية",
        "contradicted": "وواحد مخالف للمصدر",  # «و» joins the last clause only
    }
    said = {n: dict(summary_parts(n + 1, {"supported": n, "supported_with_note": n, "not_found": 1}, False)[1]) for n in (1, 2, 3)}
    assert [said[n]["supported"] for n in (1, 2, 3)] == ["واحد له مرجعية", "اثنان لهما مرجعية", "ثلاثة لها مرجعية"]
    assert [said[n]["supported_with_note"] for n in (1, 2, 3)] == ["واحد له مرجعية مع ملاحظة", "اثنان لهما مرجعية مع ملاحظة", "ثلاثة لها مرجعية مع ملاحظة"]
    assert said[1]["not_found"] == "وواحد بلا مرجعية"
    assert all(words.split(" ", 1)[1] == STATE_SHORT[state][0] for state, words in summary_parts(4, {s: 1 for s in list(STATE_SHORT)[:4]}, False)[1][:3])  # one: the short name itself

    head, clauses = summary_parts(9, counts, True)
    assert head == "Nine citations:" and clauses[0] == ("supported", "three have a reference") and clauses[-1] == ("contradicted", "and one differs from the source")
    for en in (False, True):
        for total in (1, 2, 5):  # one state only: no list, one clause that says so
            assert [s for s, _ in summary_parts(total, {"supported": total}, en)[1]] == ["supported"]
        assert summary_parts(0, {}, en)[1] == []
        assert summary_parts(25, {"supported": 20, "not_found": 5}, en)[0].startswith("25")
    assert summary_parts(2, {"supported": 2}, False) == ("استشهادان،", [("supported", "كلاهما له مرجعية")])
    assert [_more(n, False) for n in (1, 2, 3)] == ["واستشهاد واحد آخر", "واستشهادان آخران", "وثلاثة استشهادات أخرى"]
    assert [_more(n, True) for n in (1, 3)] == ["and one more citation", "and three more citations"]


def draw_summary(report_or_summary, **kw) -> Drawn:
    summary = report_or_summary if isinstance(report_or_summary, Summary) else Summary.model_validate(report_or_summary["summary"])
    return draw_summary_card(summary, **{**dict(size="portrait", theme="light", lang="ar", app_url=URL), **kw})


@pytest.mark.parametrize("size", ["portrait", "square"])
@pytest.mark.parametrize("theme", ["light", "dark"])
@pytest.mark.parametrize("lang", ["ar", "en"])
def test_a_summary_without_its_cards_is_the_sentence_alone(report, size, theme, lang):
    summary = Summary.model_validate(report["summary"])
    drawn = draw_summary(summary, size=size, theme=theme, lang=lang)
    assert drawn.image.size == SIZES[size]
    head, clauses = summary_parts(summary.total, {s.value: n for s, n in summary.by_state.items()}, lang == "en")
    assert len(clauses) == len([n for n in summary.by_state.values() if n]) > 1
    assert text_of(drawn, "label") == TEXT["title"][lang == "en"] and text_of(drawn, "summary-title") == TEXT["summary_title"][lang == "en"]
    # one sentence: the head, then the clauses with a comma between them
    comma = ", " if lang == "en" else "، "
    assert text_of(drawn, "summary") == f"{head} " + comma.join(words for _state, words in clauses)
    seen = colours(drawn.image, drawn.block("summary").ink)
    for state, _words in clauses:
        assert drawn.block(f"ring-{state}") is not None  # its ring before each clause
        assert rgb(STATE_TOKENS[theme][state][1]) in seen  # and each clause in its state's ink
    assert names(drawn)[:2] == ["summary-title", "summary"] and drawn.fit["rows"] == 0
    assert not [b for b in drawn.blocks if b.name.startswith("row-") or b.name in ("more", "checked", "claim")]
    assert_inside_the_frame(drawn, theme)
    assert png(render_summary_card(summary, size=size, theme=theme, lang=lang, app_url=URL)).size == SIZES[size]


def test_the_summary_card_lists_the_citations_what_needs_attention_first(report):
    cards = [Card.model_validate(c) for c in report["cards"]]
    verse, narration = by(report, state="supported", claim_type="ayah"), by(report, claim_type="hadith")
    differing = in_state(by(report, state="supported_with_note"), "contradicted").model_copy(update={"position": 10_000, "index": 99})
    listed = cards + [differing]
    drawn = draw_summary(report, cards=listed, title="  a title\nof what was checked ")
    assert names(drawn)[:3] == ["summary-title", "checked", "summary"] and text_of(drawn, "checked") == "a title of what was checked"
    assert drawn.fit == {"rows": 6, "rest": 0, "body": drawn.fit["body"]} and drawn.block("more") is None

    # differs from its source → no reference → needs review → with a note → has a reference; the text's order inside a group
    order = ["contradicted", "not_found", "needs_review", "supported_with_note", "supported", "supported"]
    assert [text_of(drawn, f"row-{n}-state") for n in range(1, 7)] == [STATE_SHORT[s][0] for s in order]
    expected = sorted(listed, key=lambda c: (order.index(c.state.value), c.position))
    for n, card in enumerate(expected, start=1):
        quote = text_of(drawn, f"row-{n}-quote")
        assert quote.startswith("«") and quote.endswith("»") and drawn.block(f"row-{n}-glyph") is not None
        assert " ".join(card.text_as_quoted.split()).startswith(quote.strip("«»").rstrip("…").rstrip())  # its own words, one line, cut at a word
        assert len(drawn.block(f"row-{n}-quote").text.splitlines()) == 1
        assert rgb(STATE_TOKENS["light"][card.state.value][1]) in colours(drawn.image, drawn.block(f"row-{n}-state").ink)
    assert [c.id for c in expected[-2:]] == [verse.id, narration.id]  # the verse came before the narration in the text

    # under the quoted words: the reference and, for a narration, the grading word verbatim
    assert text_of(drawn, "row-5-ref") == verse.source.ref
    assert text_of(drawn, "row-6-ref") == f"{narration.source.ref} — «{narration.grades[0].text}»"
    assert drawn.block("row-2-ref") is None and drawn.block("row-3-ref") is None  # nothing found; a personal case
    several = narration.model_copy(update={"grades": narration.grades * 3})
    assert text_of(draw_summary(report, cards=[several]), "row-1-ref") == f"{narration.source.ref} — 3 أحكام في المصادر"
    assert_inside_the_frame(drawn)

    # a request cannot list a personal case as having a reference, whatever state it sends
    forged = in_state(by(report, personal_case=True).model_copy(update={"source": narration.source}), "supported")
    drawn = draw_summary(report, cards=[forged])
    assert text_of(drawn, "row-1-state") == STATE_SHORT["needs_review"][0] and drawn.block("row-1-ref") is None


@pytest.fixture()
def longest_list(longest_cases, report, hadith):
    """Sixty citations, the longest quotations, references and gradings among them, in every state."""
    grading = max((r["grade"].splitlines()[0] for r in hadith.hadeethenc.values() if r.get("grade")), key=len)
    narration = by(report, claim_type="hadith")
    long_grading = narration.model_copy(update={"grades": [narration.grades[0].model_copy(update={"text": grading})]})
    pool = [card for _name, card in longest_cases] + [Card.model_validate(c) for c in report["cards"]] + [long_grading]
    states = list(STATE_SHORT)
    cards = []
    for n in range(60):
        card = pool[n % len(pool)]
        if card.source is not None and not card.personal_case:
            card = in_state(card, states[n % 5])
        cards.append(card.model_copy(update={"id": f"c{n}", "index": n, "position": n * 100}))
    return cards


@pytest.mark.parametrize("size", ["portrait", "square"])
@pytest.mark.parametrize("lang", ["ar", "en"])
def test_the_fullest_summary_card_never_leaves_the_frame_and_never_shows_half_a_row(longest_list, size, lang):
    counts = {state: sum(c.state == state for c in longest_list) for state in EvidenceState}
    summary = Summary(total=len(longest_list), by_state=counts, mode="full", elapsed_seconds=1.0)
    title = " ".join([TEXT["summary_title"][lang == "en"]] * 40)[:300]
    for theme in ("light", "dark"):
        drawn = draw_summary(summary, size=size, lang=lang, theme=theme, cards=longest_list, title=title)
        assert_inside_the_frame(drawn, theme)
        shown, rest = drawn.fit["rows"], drawn.fit["rest"]
        assert shown >= (5 if size == "portrait" else 3) and shown + rest == 60
        for n in range(1, shown + 1):  # every row that is there is whole: its ring, its state, its words
            assert all(drawn.block(f"row-{n}-{part}") is not None for part in ("glyph", "state", "quote"))
            assert len(drawn.block(f"row-{n}-quote").text.splitlines()) == 1
            if (ref := drawn.block(f"row-{n}-ref")) is not None:
                assert len(ref.text.splitlines()) == 1
        assert not [b.name for b in drawn.blocks if b.name.startswith(f"row-{shown + 1}-")]
        assert text_of(drawn, "more") == _more(rest, lang == "en")  # the rest are counted, in one closing line
        assert text_of(drawn, "checked").endswith("…")  # a long title is cut at a word, on its one line
        refs = [text_of(drawn, f"row-{n}-ref") for n in range(1, shown + 1) if drawn.block(f"row-{n}-ref")]
        assert all(r.count("«") == r.count("»") for r in refs)  # a grading word is never cut: whole, or counted

    # the list on the summary: twelve citations fit neither card; the sentence still says all twelve
    few = draw_summary(Summary(total=12, by_state=dict(zip(EvidenceState, (3, 2, 3, 2, 2), strict=True)), mode="full", elapsed_seconds=1.0), size=size, lang=lang, cards=longest_list[:12])
    assert few.fit["rows"] + few.fit["rest"] == 12 and few.fit["rest"] > 0


def test_a_summary_of_every_state_with_large_counts_stays_inside_the_frame():
    summary = Summary(total=2468, by_state=dict(zip(EvidenceState, (1200, 345, 678, 123, 122), strict=True)), mode="full", elapsed_seconds=1.0)
    for size in SIZES:
        for lang in ("ar", "en"):
            assert_inside_the_frame(draw_summary(summary, size=size, lang=lang))


# ------------------------------------------------------------------ endpoint
@pytest.fixture()
def client(monkeypatch):
    dorar = DorarClient()
    dorar.status = "disabled"
    monkeypatch.setattr(pipeline, "get_llm", lambda: NoLLM())
    monkeypatch.setattr(pipeline, "get_dorar", lambda: dorar)
    main._recent.clear()
    with TestClient(main.app) as c:
        yield c


def test_endpoint_returns_a_png_and_stores_nothing(client, report):
    card = report["cards"][0]
    r = client.post("/api/share-card", json={"kind": "claim", "size": "square", "theme": "light", "lang": "ar", "card": card})
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.headers["cache-control"] == "no-store"
    assert png(r.content).size == SIZES["square"]
    request = {"kind": "summary", "size": "portrait", "theme": "dark", "lang": "en", "summary": report["summary"]}
    r = client.post("/api/share-card", json=request)
    assert r.status_code == 200 and png(r.content).size == SIZES["portrait"]
    # the summary's list and its title reach the renderer
    listed = client.post("/api/share-card", json={**request, "cards": report["cards"], "title": "a title"})
    assert listed.status_code == 200 and png(listed.content).size == SIZES["portrait"] and listed.content != r.content
    assert client.post("/api/share-card", json={**request, "cards": report["cards"] * 13}).status_code == 422  # at most sixty


def test_endpoint_refuses_a_supported_card_without_a_source(client, report):
    forged = dict(report["cards"][0], source=None)
    assert client.post("/api/share-card", json={"kind": "claim", "card": forged}).status_code == 422
    assert client.post("/api/share-card", json={"kind": "claim"}).status_code == 422


def test_endpoint_never_draws_a_personal_case_as_having_a_reference(client, report):
    personal = next(c for c in report["cards"] if c["personal_case"])
    source = next(c for c in report["cards"] if c["claim_type"] == "hadith")["source"]
    forged = dict(personal, state="supported", action="adopt", source=source)
    r = client.post("/api/share-card", json={"kind": "claim", "theme": "dark", "card": forged})
    seen = colours(png(r.content))
    # no verified ring, no ink of that state: the card says «يحتاج مراجعة» and refers
    assert r.status_code == 200 and rgb(THEMES["dark"]["gold"]) not in seen and rgb(STATE_TOKENS["dark"]["supported"][1]) not in seen
    assert rgb(STATE_TOKENS["dark"]["needs_review"][1]) in seen


def test_endpoint_ignores_fields_it_no_longer_knows(client, report):
    """A request or a saved report from an older client is accepted; what the API dropped is ignored."""
    card = report["cards"][0]
    plain = client.post("/api/share-card", json={"kind": "claim", "card": card})
    older = client.post("/api/share-card", json={"kind": "claim", "card": card, "a_field_the_api_dropped": "supported", "another": True})
    assert plain.status_code == older.status_code == 200 and plain.content == older.content


def test_endpoint_is_off_with_the_flag(client, report, monkeypatch):
    monkeypatch.setattr(settings, "features_share_card", False)
    assert client.post("/api/share-card", json={"kind": "claim", "card": report["cards"][0]}).status_code == 404


def test_endpoint_refuses_when_arabic_shaping_is_missing(client, report, monkeypatch):
    """Without libraqm the letters would be drawn unjoined and in the wrong order: no card is better."""
    assert share_card.renderer_available()  # this environment can shape Arabic
    monkeypatch.setattr(share_card, "renderer_available", lambda: False)
    r = client.post("/api/share-card", json={"kind": "claim", "card": report["cards"][0]})
    assert r.status_code == 503
    assert client.post("/api/share-card", json={"kind": "summary", "summary": report["summary"]}).status_code == 503
