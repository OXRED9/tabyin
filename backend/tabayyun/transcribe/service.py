"""Speech-to-text behind one interface: cloud provider first, local faster-whisper as fallback."""
from __future__ import annotations

import importlib.util

from ..config import settings


def local_available() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None


def cloud_available() -> bool:
    return bool(settings.openai_api_key) and settings.transcription_provider in ("auto", "openai")


def transcription_status() -> dict:
    return {"captions": True, "cloud": cloud_available(), "local": local_available()}
