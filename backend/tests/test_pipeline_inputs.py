"""One integration test per input type (text, article URL, video URL, uploaded file)."""
import asyncio
import json

import httpx
import pytest

from tabayyun import pipeline
from tabayyun.ingest.article import ingest_article
from tabayyun.ingest.document import IngestError
from tabayyun.ingest.video import _parse_json3, ingest_video
from tabayyun.schemas import Segment
from tabayyun.transcribe.service import cloud_available, local_available, merge_segments


def by_type(report, kind):
    return [c for c in report["cards"] if c["claim_type"] == kind]


# ------------------------------------------------------------------ text
def test_text_with_a_verse_a_hadith_a_request_and_a_personal_case(verify_text, ayah, matn):
    verse = ayah(49, 6)[1]
    narration = matn("4560")
    text = (
        f"قال الله تعالى: ﴿{verse}﴾ وهذا أصل في التثبت.\n"
        f"وقال رسول الله صلى الله عليه وسلم: «{narration}»\n"
        "أعطني حديثاً يثبت أن شرب الماء واقفاً يطيل العمر.\n"
        "أنا مسافر غداً فهل يجوز لي أن أفطر في رمضان؟"
    )
    report = verify_text(text)
    assert report["summary"]["mode"] == "lexical_only"
    assert any(e["code"] == "llm_unavailable" and not e["fatal"] for e in report["errors"])

    (verse_card,) = by_type(report, "ayah")
    assert verse_card["state"] == "supported" and verse_card["explicit_attribution"]
    assert verse_card["source"]["kind"] == "quran" and "الحجرات" in verse_card["source"]["ref"]
    assert verse_card["source"]["url"].startswith("https://quranenc.com/")

    (hadith_card,) = by_type(report, "hadith")
    assert hadith_card["state"] == "supported"
    assert hadith_card["source"]["url"].startswith("https://hadeethenc.com/")
    assert hadith_card["grades"] and all(g["text"] and g["source_url"] for g in hadith_card["grades"])

    (request_card,) = by_type(report, "request")
    assert request_card["state"] == "not_found" and request_card["source"] is None and request_card["referral"]

    (personal,) = by_type(report, "ruling")
    assert personal["content_level"] == "D" and personal["personal_case"] and personal["state"] == "needs_review"

    # cards carry a span that points back at the quoted words
    seg = {s["id"]: s["text"] for s in report["segments"]}
    for card in report["cards"]:
        span = card["span"]
        assert card["text_as_quoted"].startswith(seg[span["segment_id"]][span["start"] : span["end"]][:20])


def test_supported_cards_always_carry_text_reference_and_url(verify_text, ayah, matn):
    text = " ".join([ayah(2, 255)[1], "ثم قال الخطيب:", matn("2962"), "وذكر أيضاً", ayah(103, 3)[1]])
    report = verify_text(text)
    assert len(report["cards"]) >= 3
    for card in report["cards"]:
        if card["state"] in ("supported", "supported_with_note"):
            src = card["source"]
            assert src and src["text"] and src["ref"] and src["url"]
        assert card["ai_explanation"] is None  # nothing model-written in lexical mode


def test_text_without_any_citation_reports_no_claims(verify_text):
    report = verify_text("اجتمع الفريق صباح اليوم لمناقشة خطة العمل للأسبوع القادم وتوزيع المهام على الأعضاء.")
    assert report["cards"] == [] and any(e["code"] == "no_claims" for e in report["errors"])


def test_empty_input_is_a_fatal_readable_error(verify_text):
    report = verify_text("   ")
    assert report["errors"][0]["code"] == "empty_input" and report["errors"][0]["fatal"]
    assert report["errors"][0]["message_ar"] and report["errors"][0]["hint_ar"]


def test_english_ui_gets_english_reference(verify_text, ayah, monkeypatch):
    from tabayyun.sources import quranenc

    async def no_network(*_a, **_k):
        return None

    monkeypatch.setattr(quranenc, "translation", no_network)
    report = verify_text(ayah(112, 1)[1] + " " + ayah(112, 2)[1], ui_lang="en")
    (card,) = report["cards"]
    assert card["source"]["ref"].startswith("Surah") and card["note_en"]


# ------------------------------------------------------------------ article URL
def test_article_url_rejects_non_public_hosts():
    for url in ("http://localhost/x", "http://127.0.0.1:8000/", "http://169.254.169.254/latest/meta-data", "ftp://example.com/a", ""):
        with pytest.raises(IngestError):
            asyncio.run(ingest_article(url))


@pytest.mark.network
def test_article_url_end_to_end(offline):
    async def ingest():
        return await ingest_article("https://hadeethenc.com/ar/browse/hadith/4560")

    report = asyncio.run(pipeline.collect(ingest))
    assert report["source"]["input_type"] == "article_url" and report["source"]["title"]
    assert any(c["claim_type"] == "hadith" and c["state"] == "supported" for c in report["cards"])


# ------------------------------------------------------------------ video URL
def test_caption_events_become_timestamped_paragraphs(ayah):
    words = ayah(2, 255)[1].split()
    events = [{"tStartMs": 1000 * i * 2, "dDurationMs": 2500, "segs": [{"utf8": " ".join(words[i * 5 : i * 5 + 5])}]} for i in range(6)]
    events.insert(2, {"tStartMs": 3000, "aAppend": 1, "segs": [{"utf8": "\n"}]})
    raw = _parse_json3({"events": events})
    assert len(raw) == 6 and raw[0].start == 0.0 and raw[0].end <= raw[1].start
    merged = merge_segments(raw)
    assert merged[0].start == 0.0 and " ".join(s.text for s in merged) == " ".join(words[:30])


def test_transcript_cards_carry_timestamps(offline, ayah):
    verse = ayah(49, 6)[1].split()
    segments = [
        Segment(id=0, text="مرحبا بكم في هذا اللقاء ونبدأ اليوم بالحديث عن التثبت من الأخبار", start=0.0, end=20.0),
        Segment(id=1, text="يقول الله تعالى " + " ".join(verse[:9]), start=20.0, end=40.0),
        Segment(id=2, text=" ".join(verse[9:]) + " وهذه الآية أصل عظيم", start=40.0, end=60.0),
    ]

    async def ingest():
        from tabayyun.ingest.document import Document
        from tabayyun.schemas import SourceInfo

        return Document(source=SourceInfo(input_type="video_url", url="https://www.youtube.com/watch?v=x", transcript_origin="captions"), segments=segments)

    report = asyncio.run(pipeline.collect(ingest))
    (card,) = report["cards"]
    assert card["state"] == "supported" and card["span"]["segment_id"] == 1
    assert 20.0 <= card["timestamp"]["start"] < 40.0


def test_machine_transcript_never_accuses_the_speaker_of_altering_a_verse(offline, ayah):
    verse = ayah(49, 6)[1].split()
    donor = ayah(2, 282)[1].split()
    garbled = verse.copy()
    for k, i in enumerate((2, 6, 9, 13)):
        garbled[i] = donor[20 + k * 3]

    def run(origin):
        async def ingest():
            from tabayyun.ingest.document import Document
            from tabayyun.schemas import SourceInfo

            seg = Segment(id=0, text="قال الله تعالى: " + " ".join(garbled) + ".", start=0.0, end=30.0)
            return Document(source=SourceInfo(input_type="file", transcript_origin=origin), segments=[seg])

        return asyncio.run(pipeline.collect(ingest))["cards"][0]

    assert run("local-stt")["state"] == "needs_review"
    assert run("captions")["state"] == "contradicted"  # human-written captions are held to the text


def test_video_url_rejects_unsupported_platforms():
    with pytest.raises(IngestError) as e:
        asyncio.run(ingest_video("https://example.com/video.mp4"))
    assert e.value.code == "video_download_failed"


@pytest.mark.network
def test_youtube_url_end_to_end(offline):
    async def ingest():
        return await ingest_video("https://www.youtube.com/watch?v=ObnvFG3KcLs")

    report = asyncio.run(pipeline.collect(ingest))
    assert report["source"]["transcript_origin"] in ("captions", "auto-captions")
    assert report["segments"][0]["start"] is not None
    card = next(c for c in report["cards"] if c["claim_type"] == "hadith")
    assert card["state"] in ("supported", "supported_with_note") and card["timestamp"]["start"] >= 0


# ------------------------------------------------------------------ uploaded file
def test_upload_without_any_speech_to_text_reports_a_clear_error(offline, monkeypatch, tmp_path):
    from tabayyun.ingest import upload
    from tabayyun.transcribe import service

    monkeypatch.setattr(service, "cloud_available", lambda: False)
    monkeypatch.setattr(service, "local_available", lambda: False)
    audio = tmp_path / "clip.mp3"
    audio.write_bytes(b"\x00" * 128)

    async def ingest():
        return await upload.ingest_file(str(audio), "clip.mp3")

    report = asyncio.run(pipeline.collect(ingest))
    (error,) = [e for e in report["errors"] if e["fatal"]]
    assert error["code"] == "transcription_unavailable" and error["hint_ar"]


@pytest.mark.network
@pytest.mark.skipif(not (cloud_available() or local_available()), reason="no speech-to-text provider configured")
def test_uploaded_recitation_is_transcribed_and_matched(offline, tmp_path):
    """A verse recitation from the approved audio library, fetched through the association's MCP server."""
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_quran_audio", "arguments": {"surah": 112, "ayah": 1, "reciter": "husary"}}}
    r = httpx.post("https://mcp.islamiccontent.org/mcp", json=body, headers={"Accept": "application/json, text/event-stream"}, timeout=30)
    payload = json.loads(next(line[6:] for line in r.text.splitlines() if line.startswith("data: ")))
    text = payload["result"]["content"][0]["text"]
    import re

    url = re.search(r"https?://\S+?\.mp3", text).group(0)
    audio = tmp_path / "ayah.mp3"
    audio.write_bytes(httpx.get(url, timeout=60, follow_redirects=True).content)

    async def ingest():
        from tabayyun.ingest.upload import ingest_file

        return await ingest_file(str(audio), "ayah.mp3")

    report = asyncio.run(pipeline.collect(ingest))
    assert report["source"]["input_type"] == "file" and report["segments"]
    assert report["segments"][0]["start"] is not None


# ------------------------------------------------------------------ extraction precision
def test_opening_basmala_and_ordinary_prose_are_not_claims(verify_text, ayah):
    basmala = ayah(1, 1)[1]
    report = verify_text(f"{basmala}\nتسهل هذه الخدمة على المستخدم التحكم بتنسيق العرض بما يناسب موقعه.\nوهل على الزائر أن يسجل قبل البحث؟")
    assert report["cards"] == []
    report = verify_text(f"قال الله تعالى: ﴿{basmala}﴾")
    assert len(report["cards"]) == 1 and report["cards"][0]["state"] == "supported"
