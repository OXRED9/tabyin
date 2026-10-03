#!/usr/bin/env python3
"""Transcribe a short piece of a real recording with MODEL_AUDIO and print the first segments.

The sample is cut to --seconds (default 60) before it is sent, so a run costs a fraction of a cent.
Source: a local file, or a YouTube/TikTok URL (default: EXAMPLE_VIDEO_URL from .env).

Usage: backend/.venv/bin/python scripts/transcribe_sample.py [path-or-url] [--seconds 60] [--show 3]
"""
from __future__ import annotations

import argparse
import asyncio
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from tabayyun.config import settings  # noqa: E402
from tabayyun.ingest.video import _download_audio  # noqa: E402
from tabayyun.llm.openrouter import get_llm  # noqa: E402
from tabayyun.transcribe.service import _cloud, ffmpeg_exe  # noqa: E402


def stamp(seconds: float) -> str:
    return f"{int(seconds // 60):02d}:{seconds % 60:04.1f}"


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?", default=settings.example_video_url)
    ap.add_argument("--seconds", type=int, default=60)
    ap.add_argument("--show", type=int, default=3)
    args = ap.parse_args()
    llm = get_llm()
    if not llm.can("audio"):
        print("OPENROUTER_API_KEY or MODEL_AUDIO is not set.", file=sys.stderr)
        return 2
    if not args.source:
        print("Give a file path or a URL (EXAMPLE_VIDEO_URL is empty).", file=sys.stderr)
        return 2
    with tempfile.TemporaryDirectory() as tmp:
        source = args.source
        if source.startswith(("http://", "https://")):
            source = await asyncio.to_thread(_download_audio, source, tmp)
        clip = str(Path(tmp) / "sample.mp3")
        subprocess.run([ffmpeg_exe(), "-y", "-loglevel", "error", "-i", source, "-t", str(args.seconds), "-ac", "1", "-ar", "16000", "-b:a", "32k", clip], check=True)
        session = llm.session()
        segments = await _cloud(clip, session)
    call = session.calls[-1]
    print(f"model {call.model} · {len(segments)} segments from the first {args.seconds} s · {call.latency_ms / 1000:.1f} s · ${call.cost_usd:.5f}" + (" · served by the fallback model" if call.fallback else ""))
    for seg in segments[: args.show]:
        print(f"  [{stamp(seg.start)} → {stamp(seg.end)}] {seg.text}")
    return 0 if segments else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
