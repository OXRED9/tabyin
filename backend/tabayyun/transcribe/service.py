"""Speech-to-text behind one interface.

Order: an audio-capable chat model through OpenRouter (MODEL_AUDIO) -> local faster-whisper, if that
optional package is installed. Both return time-stamped segments. Audio is read from a temporary
file that the caller deletes; nothing is kept after the request.

The timestamps of the OpenRouter path are produced by a chat model asked for JSON segments, not by
a dedicated speech-recognition endpoint: they are approximate (see docs/LIMITATIONS.md).
"""
from __future__ import annotations

import asyncio
import importlib.util
import logging
import re
import shutil
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

from ..config import settings
from ..extract.models import AUDIO_SCHEMA, AudioTranscript
from ..extract.prompts import TRANSCRIBE_SYSTEM
from ..ingest.document import IngestError
from ..llm.base import LLMError
from ..llm.openrouter import LLMSession, audio_part, get_llm, text_part
from ..schemas import Segment

log = logging.getLogger("tabayyun.transcribe")
_PARALLEL_CHUNKS = 2


def local_available() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None and settings.transcription_provider in ("auto", "local")


def cloud_available() -> bool:
    return get_llm().can("audio") and settings.transcription_provider in ("auto", "openrouter")


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
    m = re.search(rb"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", proc.stderr)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else None


def split_audio(path: str, chunk_seconds: int, directory: str) -> list[tuple[float, str]]:
    """(offset_seconds, chunk_path) for an audio file; a short file is returned as a single chunk."""
    duration = media_duration(path) or 0.0
    if duration <= chunk_seconds + 15:
        return [(0.0, path)]
    exe = ffmpeg_exe()
    pattern = str(Path(directory) / "chunk-%03d.mp3")
    proc = subprocess.run([exe, "-y", "-loglevel", "error", "-i", path, "-f", "segment", "-segment_time", str(chunk_seconds), "-c", "copy", pattern], capture_output=True)
    chunks = sorted(Path(directory).glob("chunk-*.mp3"))
    if proc.returncode != 0 or not chunks:
        return [(0.0, path)]
    return [(i * float(chunk_seconds), str(p)) for i, p in enumerate(chunks)]


def clean_segments(raw: list, offset: float, limit: float | None) -> list[Segment]:
    """Model-produced timestamps are made usable: offset by the chunk start, ordered, clamped, non-overlapping."""
    out: list[Segment] = []
    previous_end = 0.0
    for seg in raw:
        text = " ".join((seg.text or "").split())
        if not text:
            continue
        start = max(0.0, float(seg.start))
        end = max(start, float(seg.end))
        if limit is not None:
            start, end = min(start, limit), min(end, limit)
        start = max(start, previous_end)  # a model may repeat or rewind a timestamp
        end = max(end, start)
        previous_end = end
        out.append(Segment(id=0, text=text, start=round(offset + start, 2), end=round(offset + end, 2)))
    return out


async def _cloud(audio: str, session: LLMSession) -> list[Segment]:
    """Transcribe with the audio-capable chat model, 10-minute chunks, timestamps offset per chunk."""
    with tempfile.TemporaryDirectory(prefix="tabayyun-chunks-") as tmp:
        chunks = await asyncio.to_thread(split_audio, audio, settings.audio_chunk_seconds, tmp)
        sem = asyncio.Semaphore(_PARALLEL_CHUNKS)

        async def one(offset: float, path: str) -> list[Segment]:
            data = await asyncio.to_thread(Path(path).read_bytes)
            length = await asyncio.to_thread(media_duration, path)
            async with sem:
                result = await session.complete_json(
                    task="audio",
                    system=TRANSCRIBE_SYSTEM,
                    user=[text_part("Transcribe this recording as instructed."), audio_part(data, "mp3")],
                    schema=AUDIO_SCHEMA,
                    model_cls=AudioTranscript,
                )
            return clean_segments(result.segments, offset, length)

        parts = await asyncio.gather(*(one(o, p) for o, p in chunks))
    segments = [s for part in parts for s in part]
    for i, s in enumerate(segments):
        s.id = i
    return segments


@lru_cache(maxsize=1)
def _local_model():
    from faster_whisper import WhisperModel

    return WhisperModel(settings.local_whisper_model, device="cpu", compute_type="int8")


def _local(path: str) -> list[Segment]:
    segments, _info = _local_model().transcribe(path, vad_filter=True, beam_size=5)
    return [Segment(id=i, text=s.text.strip(), start=float(s.start), end=float(s.end)) for i, s in enumerate(segments) if s.text.strip()]


async def transcribe(path: str) -> tuple[list[Segment], str, list[str]]:
    """Transcribe an audio/video file. Returns (segments, origin, warnings)."""
    if not cloud_available() and not local_available():
        raise IngestError("transcription_unavailable")
    audio = await asyncio.to_thread(to_speech_audio, path)
    try:
        if cloud_available():
            session = get_llm().session()
            try:
                segments = await _cloud(audio, session)
                if segments:
                    return segments, "cloud-stt", (["llm_fallback"] if session.fallback_used else [])
                if not local_available():
                    raise IngestError("no_speech")
            except LLMError as e:
                log.warning("cloud transcription failed: %s", type(e).__name__)
                if not local_available():
                    raise IngestError("transcription_unavailable") from e
        segments = await asyncio.to_thread(_local, audio)
        if segments:
            return segments, "local-stt", []
        raise IngestError("no_speech")
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
