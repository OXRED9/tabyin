"""Video URL (YouTube first, TikTok best-effort) -> time-stamped transcript.

Order of attempts: the platform's own captions (instant, free) -> download the audio track and
transcribe it. Nothing is kept after the request.
"""
from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import httpx

from ..config import settings
from ..schemas import Segment, SourceInfo
from ..transcribe.service import cloud_available, local_available, merge_segments, transcribe
from .document import Document, IngestError
from .net import validate_public_url

log = logging.getLogger("tabayyun.video")
ALLOWED_HOSTS = ("youtube.com", "youtu.be", "tiktok.com")
_YDL_BASE = {"quiet": True, "no_warnings": True, "noplaylist": True, "socket_timeout": 20, "retries": 1, "skip_download": True}


def _allowed(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS)


def _info(url: str) -> dict:
    import yt_dlp

    with yt_dlp.YoutubeDL(_YDL_BASE) as ydl:
        return ydl.extract_info(url, download=False)


def _pick_captions(info: dict) -> tuple[str, str] | None:
    """(url, origin) of the best caption track: manual Arabic > auto Arabic > the video's own language."""
    manual, auto = info.get("subtitles") or {}, info.get("automatic_captions") or {}
    original = (info.get("language") or "").split("-")[0]

    def find(tracks: dict, prefixes: tuple[str, ...]) -> str | None:
        for prefix in prefixes:
            for lang in sorted(tracks, key=lambda k: (not k.endswith("-orig"), len(k))):
                if lang == prefix or lang.startswith(prefix + "-"):
                    for fmt in tracks[lang]:
                        if fmt.get("ext") == "json3" and fmt.get("url"):
                            return fmt["url"]
        return None

    order = ("ar",) if original in ("", "ar") else (original, "ar")
    for tracks, origin in ((manual, "captions"), (auto, "auto-captions")):
        url = find(tracks, order)
        if url:
            return url, origin
    return None


def _parse_json3(data: dict) -> list[Segment]:
    segments: list[Segment] = []
    for ev in data.get("events", []):
        if ev.get("aAppend") or "segs" not in ev:
            continue
        text = "".join(s.get("utf8", "") for s in ev["segs"]).replace("\n", " ").strip()
        if not text:
            continue
        start = ev.get("tStartMs", 0) / 1000.0
        segments.append(Segment(id=len(segments), text=text, start=start, end=start + ev.get("dDurationMs", 0) / 1000.0))
    # Auto-caption events overlap in time; clamp each end to the next start.
    for a, b in zip(segments, segments[1:]):
        if a.end is not None and b.start is not None and a.end > b.start:
            a.end = b.start
    return segments


def _download_audio(url: str, directory: str) -> str:
    import yt_dlp

    opts = {**_YDL_BASE, "skip_download": False, "format": "bestaudio[filesize<45M]/bestaudio/best[height<=360]", "outtmpl": str(Path(directory) / "audio.%(ext)s"), "max_filesize": 60 * 1024 * 1024}
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    files = [p for p in Path(directory).iterdir() if p.is_file()]
    if not files:
        raise IngestError("video_download_failed", "no audio file")
    return str(files[0])


async def _thumbnail(info: dict) -> str | None:
    """The clip's thumbnail as a small JPEG data URL (at most 480 px wide), or None."""
    url = info.get("thumbnail")
    if not url:
        thumbs = [t for t in info.get("thumbnails") or [] if t.get("url")]
        url = thumbs[-1]["url"] if thumbs else None
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": settings.user_agent}, follow_redirects=True) as client:
            r = await client.get(url)
        if r.status_code != 200 or len(r.content) > 3_000_000:
            return None

        def shrink(data: bytes) -> str:
            import base64
            import io

            from PIL import Image

            img = Image.open(io.BytesIO(data)).convert("RGB")
            img.thumbnail((480, 480))
            out = io.BytesIO()
            img.save(out, "JPEG", quality=72, optimize=True)
            return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode("ascii")

        return await asyncio.to_thread(shrink, r.content)
    except Exception as e:  # a missing thumbnail never stops a verification
        log.info("no thumbnail (%s)", type(e).__name__)
        return None


async def ingest_video(url: str | None) -> Document:
    url = await validate_public_url(url)
    if not _allowed(url):
        raise IngestError("video_download_failed", "unsupported platform")
    try:
        info = await asyncio.to_thread(_info, url)
    except Exception as e:
        raise IngestError("video_download_failed", str(e)[:200]) from e
    duration = info.get("duration")
    if duration and duration > settings.max_media_minutes * 60:
        raise IngestError("video_too_long")
    source = SourceInfo(
        input_type="video_url", title=info.get("title"), url=info.get("webpage_url") or url, duration=duration, language=info.get("language"),
        thumbnail=await _thumbnail(info), channel=info.get("channel") or info.get("uploader"),
    )  # fmt: skip

    picked = _pick_captions(info)
    if picked:
        try:
            async with httpx.AsyncClient(timeout=20, headers={"User-Agent": settings.user_agent}) as client:
                r = await client.get(picked[0])
                r.raise_for_status()
                segments = merge_segments(_parse_json3(r.json()))
            if segments:
                source.transcript_origin = picked[1]
                return Document(source=source, segments=segments)
        except Exception as e:
            log.warning("caption download failed, falling back to audio: %s", type(e).__name__)

    if not cloud_available() and not local_available():
        raise IngestError("transcription_unavailable")
    with tempfile.TemporaryDirectory(prefix="tabayyun-") as tmp:
        try:
            path = await asyncio.to_thread(_download_audio, url, tmp)
        except IngestError:
            raise
        except Exception as e:
            raise IngestError("video_download_failed", str(e)[:200]) from e
        raw, origin, warnings = await transcribe(path)
    segments = merge_segments(raw)
    if not segments:
        raise IngestError("no_speech")
    source.transcript_origin = origin
    return Document(source=source, segments=segments, warnings=warnings)
