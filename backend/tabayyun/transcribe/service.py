"""Speech-to-text behind one interface: cloud provider first, local faster-whisper as fallback.

Both return time-stamped segments. Audio is read from a temporary file that the caller deletes;
nothing is kept after the request.
"""
from __future__ import annotations

import asyncio
import importlib.util
import logging
import shutil
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

from ..config import settings
from ..ingest.document import IngestError
from ..schemas import Segment

log = logging.getLogger("tabayyun.transcribe")
_OPENAI_MAX_BYTES = 24 * 1024 * 1024


def local_available() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None and settings.transcription_provider in ("auto", "local")


def cloud_available() -> bool:
    return bool(settings.openai_api_key) and settings.transcription_provider in ("auto", "openai")


def transcription_status() -> dict:
    return {"captions": True, "cloud": cloud_available(), "local": local_available()}


def ffmpeg_exe() -> str | None:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def to_speech_audio(path: str) -> str:
    """Re-encode any media file to small mono 16 kHz audio. Returns a new temp path (caller deletes)."""
    exe = ffmpeg_exe()
    if exe is None:
        raise IngestError("transcription_unavailable", "ffmpeg not available")
    out = tempfile.NamedTemporaryFile(prefix="tabayyun-", suffix=".mp3", delete=False).name
    proc = subprocess.run([exe, "-y", "-loglevel", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", out], capture_output=True)
    if proc.returncode != 0 or not Path(out).exists() or Path(out).stat().st_size == 0:
        Path(out).unlink(missing_ok=True)
        raise IngestError("unsupported_file", proc.stderr.decode("utf-8", "replace")[-300:])
    return out


def media_duration(path: str) -> float | None:
    exe = ffmpeg_exe()
    if exe is None:
        return None
    proc = subprocess.run([exe, "-i", path], capture_output=True)
    import re

    m = re.search(rb"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", proc.stderr)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else None


async def _cloud(path: str) -> list[Segment]:
    import openai

    client = openai.AsyncOpenAI(api_key=settings.openai_api_key, timeout=180, max_retries=1)
    with open(path, "rb") as fh:
        result = await client.audio.transcriptions.create(
            model=settings.openai_transcribe_model, file=fh, response_format="verbose_json", timestamp_granularities=["segment"]
        )
    segments = getattr(result, "segments", None) or []
    return [Segment(id=i, text=s.text.strip(), start=float(s.start), end=float(s.end)) for i, s in enumerate(segments) if s.text.strip()]


@lru_cache(maxsize=1)
def _local_model():
    from faster_whisper import WhisperModel

    return WhisperModel(settings.local_whisper_model, device="cpu", compute_type="int8")


def _local(path: str) -> list[Segment]:
    segments, _info = _local_model().transcribe(path, vad_filter=True, beam_size=5)
    return [Segment(id=i, text=s.text.strip(), start=float(s.start), end=float(s.end)) for i, s in enumerate(segments) if s.text.strip()]


async def transcribe(path: str) -> tuple[list[Segment], str]:
    """Transcribe an audio/video file. Returns (segments, origin)."""
    if not cloud_available() and not local_available():
        raise IngestError("transcription_unavailable")
    audio = await asyncio.to_thread(to_speech_audio, path)
    try:
        if cloud_available() and Path(audio).stat().st_size <= _OPENAI_MAX_BYTES:
            try:
                segments = await _cloud(audio)
                if segments:
                    return segments, "cloud-stt"
            except Exception as e:
                log.warning("cloud transcription failed, trying local: %s", type(e).__name__)
        if local_available():
            segments = await asyncio.to_thread(_local, audio)
            if segments:
                return segments, "local-stt"
            raise IngestError("no_speech")
        raise IngestError("transcription_unavailable")
    finally:
        Path(audio).unlink(missing_ok=True)


def merge_segments(raw: list[Segment], *, max_chars: int = 320, max_seconds: float = 30.0, max_gap: float = 2.5) -> list[Segment]:
    """Join short caption/STT lines into readable, time-stamped paragraphs."""
    merged: list[Segment] = []
    cur: Segment | None = None
    for s in raw:
        text = " ".join(s.text.split())
        if not text:
            continue
        if cur is not None and s.start is not None and cur.end is not None:
            gap = s.start - cur.end
            span = (s.end or s.start) - (cur.start or 0.0)
            if gap <= max_gap and len(cur.text) + len(text) + 1 <= max_chars and span <= max_seconds:
                cur.text += " " + text
                cur.end = s.end if s.end is not None else cur.end
                continue
        if cur is not None:
            merged.append(cur)
        cur = Segment(id=len(merged), text=text, start=s.start, end=s.end)
    if cur is not None:
        cur.id = len(merged)
        merged.append(cur)
    return merged
