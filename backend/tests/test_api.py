"""HTTP layer: SSE framing, meta, export, rate limit."""
import json

import pytest
from fastapi.testclient import TestClient

from tabayyun import main, pipeline
from tabayyun.config import settings
from tabayyun.sources.dorar import DorarClient
from tests.llm_stubs import NoLLM


@pytest.fixture()
def client(monkeypatch):
    dorar = DorarClient()
    dorar.status = "disabled"
    monkeypatch.setattr(pipeline, "get_llm", lambda: NoLLM())
    monkeypatch.setattr(pipeline, "get_dorar", lambda: dorar)
    main._recent.clear()
    with TestClient(main.app) as c:
        yield c


def sse(response) -> list[tuple[str, dict]]:
    events, name = [], None
    for line in response.text.splitlines():
        if line.startswith("event: "):
            name = line[7:]
        elif line.startswith("data: "):
            events.append((name, json.loads(line[6:])))
    return events


def test_health_and_meta(client):
    h = client.get("/health").json()
    assert h["status"] == "ok" and h["sources"]["quran_ayahs"] == 6236 and h["sources"]["hadeethenc"] > 3000
    m = client.get("/api/meta").json()
    assert m["abstention_verse"]["text"] and "النحل" in m["abstention_verse"]["ref"]
    assert m["motto_verse"]["text"] and len(m["referral_links"]) >= 2 and len(m["terms"]) >= 10
    assert {e["id"] for e in m["examples"]} - {"image"} == {"text", "video", "fabrication"}  # "image" only with a vision model


def test_built_in_text_example_verifies_cleanly(client):
    example = next(e for e in client.get("/api/meta").json()["examples"] if e["id"] == "text")
    r = client.post("/api/verify", json={"input_type": "text", "text": example["text"]})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    assert "content-encoding" not in r.headers  # the stream is never compressed (it would be buffered)
    events = sse(r)
    names = [n for n, _ in events]
    assert names[0] == "stage" and names[-1] == "done" and "summary" in names
    cards = [d for n, d in events if n == "card"]
    assert {c["claim_type"] for c in cards} == {"ayah", "hadith"}
    assert all(c["state"] in ("supported", "supported_with_note") and c["source"]["url"] for c in cards)
    stub_ids = {c["id"] for n, d in events if n == "claims" for c in d["claims"]}
    assert stub_ids == {c["id"] for c in cards}  # every skeleton is replaced by exactly one card


def test_fabrication_example_is_refused(client):
    example = next(e for e in client.get("/api/meta").json()["examples"] if e["id"] == "fabrication")
    cards = [d for n, d in sse(client.post("/api/verify", json={"input_type": "text", "text": example["text"]})) if n == "card"]
    assert len(cards) == 1 and cards[0]["state"] == "not_found" and cards[0]["source"] is None


def test_export_html_marks_human_overrides(client, ayah):
    events = sse(client.post("/api/verify", json={"input_type": "text", "text": f"قال الله تعالى: ﴿{ayah(49, 6)[1]}﴾"}))
    cards = [d for n, d in events if n == "card"]
    report = {
        "source": next(d for n, d in events if n == "source"),
        "segments": next(d for n, d in events if n == "segments")["segments"],
        "cards": cards,
        "summary": next(d for n, d in events if n == "summary"),
        "generated_at": "2026-10-03T18:00:00+03:00",
        "reviewer_overrides": [{"card_id": cards[0]["id"], "original_state": "supported", "state": "needs_review", "note": "تحتاج مراجعة السياق", "reviewer": "سليمان", "at": "2026-10-03T18:05:00+03:00"}],
    }
    r = client.post("/api/export/html", json=report)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    html = r.text
    assert "حالة معدَّلة بمراجعة بشرية" in html and "سليمان" in html and "يحتاج مزيد تحقق" in html
    assert "لا تغني عن الرجوع إلى أهل العلم" in html and cards[0]["source"]["url"] in html
    assert 'dir="rtl"' in html
    assert 'dir="ltr"' in client.post("/api/export/html?lang=en", json=report).text


def test_invalid_request_is_rejected(client):
    assert client.post("/api/verify", json={"input_type": "nonsense", "text": "x"}).status_code == 422
    r = client.post("/api/verify/file", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert [d["code"] for n, d in sse(r) if n == "error"] == ["unsupported_file"]


def test_rate_limit_returns_a_readable_error(client, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_requests", 2)
    body = {"input_type": "text", "text": "نص قصير للتجربة"}
    assert all("rate_limited" not in client.post("/api/verify", json=body).text for _ in range(2))
    events = sse(client.post("/api/verify", json=body))
    assert events[0][1]["code"] == "rate_limited" and events[0][1]["hint_ar"] and events[-1][0] == "done"


def test_user_text_never_reaches_the_logs(client, caplog, ayah, matn):
    """Request URLs to sources contain the user's words; nothing of the input may be logged."""
    import logging

    for name in ("httpx", "httpcore"):
        assert logging.getLogger(name).getEffectiveLevel() >= logging.WARNING
    secret = "عبارةفريدةللاختبار"
    text = f"{secret} قال رسول الله صلى الله عليه وسلم: «{matn('4560')}» ثم {ayah(49, 6)[1]}"
    with caplog.at_level(logging.DEBUG):
        r = client.post("/api/verify", json={"input_type": "text", "text": text})
    assert any(n == "card" for n, _ in sse(r))
    logged = "\n".join(rec.getMessage() for rec in caplog.records if rec.name.startswith("tabayyun"))
    assert secret not in logged and matn("4560")[:20] not in logged


def test_json_is_compressed_but_the_event_stream_is_not(client):
    big = client.get("/api/meta", headers={"Accept-Encoding": "gzip"})
    assert big.status_code == 200 and big.headers.get("content-encoding") == "gzip"
    stream = client.post("/api/verify", json={"input_type": "text", "text": "نص قصير بلا استشهاد."}, headers={"Accept-Encoding": "gzip"})
    assert stream.headers["content-type"].startswith("text/event-stream") and "content-encoding" not in stream.headers

