"""F1 — image input: noise stripping, image preparation and the /api/ocr endpoint.

No model is called: a stand-in returns what the vision model would. The sentences used here are
ordinary prose, not religious text.
"""
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from tabayyun import main
from tabayyun.config import settings
from tabayyun.extract.models import OCRResult
from tabayyun.ingest.image import MAX_SIDE, ImageProblem, prepare_image
from tabayyun.ingest.noise import strip_noise
from tabayyun.llm.base import LLMError

PROSE = "اجتمع أهل الحي مساء أمس لمناقشة ما يُتداول من أخبار."


def png(size=(400, 200), mode="RGB") -> bytes:
    out = io.BytesIO()
    Image.new(mode, size, "white").save(out, "PNG")
    return out.getvalue()


def jpeg_with_location() -> bytes:
    img = Image.new("RGB", (640, 480), "white")
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    exif[0x8825] = {1: "N", 2: (24.0, 28.0, 0.0)}  # GPSInfo
    out = io.BytesIO()
    img.save(out, "JPEG", exif=exif)
    return out.getvalue()


# ----------------------------------------------------------------------------------------- noise


def test_emoji_and_share_footers_are_removed_and_reported():
    text = f"رسالة محوَّلة\n🌹🌹 {PROSE} 🌹\nانشرها تؤجر 🤲\nلا تدعها تقف عندك!!!\n10:42 م"
    clean, removed = strip_noise(text)
    assert clean == PROSE
    assert "رسالة محوَّلة" in removed and any("انشرها" in r for r in removed) and any("تقف عندك" in r for r in removed)
    assert any("🌹" in r for r in removed) and "10:42 م" in removed


def test_words_inside_a_sentence_are_never_dropped():
    sentence = "قال الكاتب إن عبارة «انشرها تؤجر» تتكرر في آخر كثير من الرسائل المتداولة بين الناس في المجموعات."
    clean, removed = strip_noise(sentence)
    assert clean == sentence and removed == []


def test_arabic_signs_and_unreadable_marks_survive():
    text = "قال ﷺ كذا ﴿…﴾ ثم كلمة [?] غير واضحة\n[?]"
    clean, _removed = strip_noise(text)
    assert "ﷺ" in clean and "﴿" in clean and clean.count("[?]") == 2


def test_repeated_punctuation_is_collapsed_and_paragraphs_kept():
    clean, _ = strip_noise("هل هذا صحيح؟؟؟؟\n\n\nنعم!!!")
    assert clean == "هل هذا صحيح؟\n\nنعم!"


# ----------------------------------------------------------------------------------------- image


def test_metadata_is_dropped_and_large_images_are_reduced():
    data, mime = prepare_image(jpeg_with_location())
    out = Image.open(io.BytesIO(data))
    assert mime == "image/jpeg" and not dict(out.getexif())  # no maker, no location
    data, mime = prepare_image(png(size=(5000, 1000)))
    assert mime == "image/png" and max(Image.open(io.BytesIO(data)).size) == MAX_SIDE


@pytest.mark.parametrize("payload", [b"not an image at all", b"%PDF-1.4 fake", b""])
def test_non_images_are_rejected(payload):
    with pytest.raises(ImageProblem) as e:
        prepare_image(payload)
    assert e.value.code == "unsupported_image"


# ----------------------------------------------------------------------------------------- endpoint


class VisionStub:
    """Stands in for the client: answers the vision task with a fixed reading."""

    available = True
    fallback_used = False

    def __init__(self, text=PROSE, confidence=0.95, fail=False, vision=True):
        self.text, self.confidence, self.fail, self.vision = text, confidence, fail, vision
        self.seen: list[tuple[str, int]] = []

    def can(self, task: str) -> bool:
        return self.vision if task == "vision" else True

    def session(self):
        return self

    async def complete_json(self, *, task, user, **_kw):
        assert task == "vision"
        url = user[1]["image_url"]["url"]
        self.seen.append((url.split(";")[0], len(url)))
        if self.fail:
            raise LLMError("vision model failed")
        return OCRResult(text=self.text, confidence=self.confidence, notes="")


@pytest.fixture()
def ocr(monkeypatch):
    def _post(stub, data=None, name="shot.png"):
        monkeypatch.setattr(main, "get_llm", lambda: stub)
        main._recent.clear()
        return TestClient(main.app).post("/api/ocr", files={"file": (name, data if data is not None else png(), "application/octet-stream")})

    return _post


def test_reading_returns_the_text_as_written_with_the_noise_listed(ocr):
    stub = VisionStub(text=f"🌹 {PROSE}\nكلمة [?] هنا\nانشرها تؤجر")
    r = ocr(stub)
    body = r.json()
    assert r.status_code == 200 and body["text"] == f"{PROSE}\nكلمة [?] هنا"
    assert body["removed"] == ["🌹", "انشرها تؤجر"] and body["unreadable"] == 1 and body["low_confidence"] is True
    assert stub.seen[0][0] == "data:image/png"  # the model received the re-encoded image


def test_a_confident_clean_reading_is_not_flagged(ocr):
    body = ocr(VisionStub()).json()
    assert body["low_confidence"] is False and body["removed"] == [] and body["confidence"] == 0.95


@pytest.mark.parametrize(
    "kwargs,data,status,code",
    [
        ({}, b"plain text, not an image", 415, "unsupported_image"),
        ({"fail": True}, None, 502, "ocr_failed"),
        ({"vision": False}, None, 503, "ocr_unavailable"),
        ({"text": "🌹🌹\nانشرها تؤجر"}, None, 422, "no_text_in_image"),
    ],
)
def test_failures_say_what_happened_and_what_to_do(ocr, kwargs, data, status, code):
    r = ocr(VisionStub(**kwargs), data=data)
    detail = r.json()["detail"]
    assert r.status_code == status and detail["code"] == code and detail["message_ar"] and detail["hint_ar"]


def test_size_limit_and_feature_flag(ocr, monkeypatch):
    monkeypatch.setattr(settings, "max_image_mb", 0)
    assert ocr(VisionStub()).status_code == 413
    monkeypatch.setattr(settings, "max_image_mb", 10)
    monkeypatch.setattr(settings, "features_image", False)
    assert ocr(VisionStub()).status_code == 404
