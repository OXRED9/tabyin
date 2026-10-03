"""F3 — the shareable verdict card, server-side renderer and endpoint."""
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from tabayyun import main, pipeline
from tabayyun.config import settings
from tabayyun.llm.router import LLMRouter
from tabayyun.meta import build_meta
from tabayyun.report.share_card import SIZES, _first_sentence, render_claim_card, render_summary_card
from tabayyun.schemas import Card, EvidenceState, Summary
from tabayyun.sources.dorar import DorarClient

URL = "https://tabayyun.example.org"


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


def png(data: bytes) -> Image.Image:
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    return Image.open(io.BytesIO(data)).convert("RGB")


def render(card, **kw):
    base = dict(size="portrait", theme="light", lang="ar", app_url=URL, abstention_verse=build_meta()["abstention_verse"])
    return png(render_claim_card(Card.model_validate(card), **{**base, **kw}))


@pytest.mark.parametrize("size", ["portrait", "square"])
@pytest.mark.parametrize("theme", ["light", "dark"])
@pytest.mark.parametrize("lang", ["ar", "en"])
def test_every_card_renders_at_the_exact_size_in_both_themes_and_languages(report, size, theme, lang):
    for card in report["cards"]:
        img = render(card, size=size, theme=theme, lang=lang)
        assert img.size == SIZES[size]
        assert len(img.getcolors(maxcolors=1 << 20) or []) > 60  # drawn, anti-aliased content — not a blank frame


def test_the_state_colour_is_on_the_card(report):
    from tabayyun.report.labels import STATE_COLOR

    for card in report["cards"]:
        want = tuple(int(STATE_COLOR[card["state"]][i : i + 2], 16) for i in (1, 3, 5))
        assert want in {c for _n, c in render(card).getcolors(maxcolors=1 << 20)}


def test_a_reviewers_state_is_drawn_instead_when_given(report):
    from tabayyun.report.labels import STATE_COLOR

    card = next(c for c in report["cards"] if c["state"] == "supported")
    colours = {c for _n, c in render(card, override_state=EvidenceState.needs_review).getcolors(maxcolors=1 << 20)}
    amber = tuple(int(STATE_COLOR["needs_review"][i : i + 2], 16) for i in (1, 3, 5))
    green = tuple(int(STATE_COLOR["supported"][i : i + 2], 16) for i in (1, 3, 5))
    assert amber in colours and green not in colours


def test_long_claims_are_truncated_not_overflowed(report):
    card = dict(next(c for c in report["cards"] if c["claim_type"] == "hadith"))
    card["text_as_quoted"] = (card["source"]["text"] + " ") * 6  # far longer than a card can hold
    a = render(card, size="square")
    b = render(card, size="portrait")
    assert a.size == SIZES["square"] and b.size == SIZES["portrait"]
    # the footer rule and QR area stay intact: bottom-left QR block is black-and-white only
    qr = a.crop((104, 1080 - 48 - 84 - 132, 104 + 132, 1080 - 48 - 84))
    assert len(qr.getcolors(maxcolors=4096)) <= 2


def test_summary_card(report):
    img = png(render_summary_card(Summary.model_validate(report["summary"]), size="square", theme="dark", lang="en", app_url=URL))
    assert img.size == SIZES["square"]


def test_first_sentence():
    assert _first_sentence("الأولى. الثانية.") == "الأولى."
    assert _first_sentence("جملة واحدة") == "جملة واحدة"


# ------------------------------------------------------------------ endpoint
@pytest.fixture()
def client(monkeypatch):
    dorar = DorarClient()
    dorar.status = "disabled"
    monkeypatch.setattr(pipeline, "get_llm", lambda: LLMRouter(providers=[]))
    monkeypatch.setattr(pipeline, "get_dorar", lambda: dorar)
    main._recent.clear()
    with TestClient(main.app) as c:
        yield c


def test_endpoint_returns_a_png_and_stores_nothing(client, report):
    card = report["cards"][0]
    r = client.post("/api/share-card", json={"kind": "claim", "size": "square", "theme": "light", "lang": "ar", "card": card})
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.headers["cache-control"] == "no-store"
    assert png(r.content).size == SIZES["square"]
    r = client.post("/api/share-card", json={"kind": "summary", "size": "portrait", "theme": "dark", "lang": "en", "summary": report["summary"]})
    assert r.status_code == 200 and png(r.content).size == SIZES["portrait"]


def test_endpoint_refuses_a_supported_card_without_a_source(client, report):
    forged = dict(report["cards"][0], source=None)
    assert client.post("/api/share-card", json={"kind": "claim", "card": forged}).status_code == 422
    assert client.post("/api/share-card", json={"kind": "claim"}).status_code == 422


def test_endpoint_ignores_an_override_the_rules_do_not_allow(client, report):
    from tabayyun.report.labels import STATE_COLOR

    personal = next(c for c in report["cards"] if c["personal_case"])
    r = client.post("/api/share-card", json={"kind": "claim", "card": personal, "override_state": "supported"})
    colours = {c for _n, c in png(r.content).getcolors(maxcolors=1 << 20)}
    green = tuple(int(STATE_COLOR["supported"][i : i + 2], 16) for i in (1, 3, 5))
    assert r.status_code == 200 and green not in colours  # a personal case can never be shared as "supported"


def test_endpoint_is_off_with_the_flag(client, report, monkeypatch):
    monkeypatch.setattr(settings, "features_share_card", False)
    assert client.post("/api/share-card", json={"kind": "claim", "card": report["cards"][0]}).status_code == 404


def test_a_240_character_claim_is_shown_whole_by_reducing_type_before_cutting(report):
    from tabayyun.report import share_card

    card = Card.model_validate(next(c for c in report["cards"] if c["claim_type"] == "hadith"))
    words = card.source.text.split()
    text = " ".join(words)
    while len(text) < 230:
        text += " " + " ".join(words)
    card.text_as_quoted = text[:236].rsplit(" ", 1)[0]
    kw = dict(theme="light", lang="ar", app_url=URL, abstention_verse=None, override_state=None)
    for size in ("portrait", "square"):
        results = [share_card._draw_claim(card, size, kw["theme"], kw["lang"], URL, None, None, q, v, k)[1:] for q, v, k in share_card._FIT[size]]
        assert any(fits and not truncated for fits, truncated in results), f"{size}: no layout shows the whole claim"
        assert png(render_claim_card(card, size=size, **kw)).size == SIZES[size]


def test_summary_card_marks_human_review_only_when_told(report):
    summary = Summary.model_validate(report["summary"])
    plain = render_summary_card(summary, size="portrait", theme="light", lang="ar", app_url=URL)
    marked = render_summary_card(summary, size="portrait", theme="light", lang="ar", app_url=URL, human_reviewed=True)
    assert plain != marked
