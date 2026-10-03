"""Uploaded audio/video file -> time-stamped transcript."""
from __future__ import annotations

import asyncio

from ..config import settings
from ..schemas import SourceInfo
from ..transcribe.service import media_duration, merge_segments, transcribe
from .document import Document, IngestError


async def ingest_file(path: str, filename: str) -> Document:
    duration = await asyncio.to_thread(media_duration, path)
    if duration and duration > settings.max_media_minutes * 60:
        raise IngestError("video_too_long")
    segments, origin, warnings = await transcribe(path)
    merged = merge_segments(segments)
    if not merged:
        raise IngestError("no_speech")
    return Document(source=SourceInfo(input_type="file", title=filename, duration=duration, transcript_origin=origin), segments=merged, warnings=warnings)
