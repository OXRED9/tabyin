#!/usr/bin/env python3
"""Call every configured model with a tiny Arabic test and print: model, task, latency, cost, pass/fail.

  text    extract one citation from two Arabic sentences — the quote must come back character for
          character and be typed as a verse (the real extraction prompt and schema are used).
  vision  read Arabic from a PNG rendered here with Pillow, containing a verse whose wording was
          deliberately altered (programmatically, from the Mushaf text). PASS only if the altered
          wording comes back as written — a model that "corrects" it fails.
  audio   transcribe a short Arabic clip into timestamped segments. The clip is a verse recitation
          from the approved audio library (fetched through the association's MCP server); if that
          is unreachable an ffmpeg-synthesised tone validates the request shape only. A real
          recording from eval/testset/audio/ is used instead when one exists.

Model IDs and list prices come from the live catalog; the cost column is the cost the API reported
for the call. No religious text is typed in this file: the verse is read from data/quran.json.

Usage:
  backend/.venv/bin/python scripts/check_models.py                    # the models in .env
  backend/.venv/bin/python scripts/check_models.py --vision a/b,c/d   # compare candidates for a task
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from tabayyun.config import settings  # noqa: E402
from tabayyun.extract.llm_extractor import locate  # noqa: E402
from tabayyun.extract.models import AUDIO_SCHEMA, CLAIMS_SCHEMA, OCR_SCHEMA, AudioTranscript, LLMClaims, OCRResult  # noqa: E402
from tabayyun.extract.prompts import EXTRACT_SYSTEM, OCR_SYSTEM, TRANSCRIBE_SYSTEM  # noqa: E402
from tabayyun.llm.catalog import load_catalog  # noqa: E402
from tabayyun.llm.openrouter import audio_part, get_llm, image_part, text_part  # noqa: E402
from tabayyun.normalize import normalize_ar  # noqa: E402
from tabayyun.sources.quran import get_quran_index  # noqa: E402
from tabayyun.textalign import similarity  # noqa: E402

VERSE = (49, 6)  # the "tabayyun" verse
AUDIO_VERSE = (112, 1)


@dataclass
class Row:
    task: str
    model: str
    ok: bool
    latency_ms: int
    cost_usd: float
    note: str


def verse_words() -> list[str]:
    quran = get_quran_index()
    return quran.ayahs[quran.by_ref[VERSE]][3].split()


# ---------------------------------------------------------------------------------------- text


async def check_text(model: str) -> Row:
    fragment = " ".join(verse_words()[:9])
    text = f"اجتمع أهل الحي مساء أمس لمناقشة ما يُتداول من أخبار. وذكّرهم الإمام بقول الله تعالى: ﴿{fragment}﴾."
    llm = get_llm()
    parsed, info, _err = await llm._once(model, "extract", EXTRACT_SYSTEM, f"<text>\n{text}\n</text>", CLAIMS_SCHEMA, LLMClaims, 2000, False)
    if parsed is None:
        return Row("text", model, False, info.latency_ms, info.cost_usd, info.error or "failed")
    verses = [c for c in parsed.claims if c.type == "ayah"]
    if not verses:
        return Row("text", model, False, info.latency_ms, info.cost_usd, f"no verse reported ({len(parsed.claims)} claims)")
    quote = verses[0].quote.strip().strip("﴿﴾ ")
    exact = quote in text and normalize_ar(quote) == normalize_ar(fragment)
    note = "quote exact" if exact else ("quote not verbatim" if locate(quote, text) is None else "quote differs from the cited words")
    return Row("text", model, exact, info.latency_ms, info.cost_usd, f"{note}; {len(parsed.claims)} claim(s)")


# ---------------------------------------------------------------------------------------- vision


def altered_verse() -> tuple[str, str, str]:
    """(altered text, the original word, the word put in its place) — a programmatic alteration."""
    words = verse_words()[:9]
    quran = get_quran_index()
    donor = quran.ayahs[quran.by_ref[(2, 153)]][3].split()[-1]  # a word from another verse
    position = 6
    original = words[position]
    altered = words.copy()
    altered[position] = donor
    return " ".join(altered), original, donor


def render_test_image() -> bytes:
    """A chat-style screenshot: a sender line, the altered verse, and a 'share it' footer."""
    from PIL import Image, ImageDraw, ImageFont

    fonts = ROOT / "backend" / "tabayyun" / "assets" / "fonts"
    regular = ImageFont.truetype(str(fonts / "IBMPlexSansArabic-Regular.ttf"), 34, layout_engine=ImageFont.Layout.RAQM)
    bold = ImageFont.truetype(str(fonts / "IBMPlexSansArabic-SemiBold.ttf"), 38, layout_engine=ImageFont.Layout.RAQM)
    altered, _orig, _donor = altered_verse()
    img = Image.new("RGB", (900, 420), "#E5DDD5")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([40, 40, 860, 380], radius=24, fill="#FFFFFF")
    kw = dict(direction="rtl", language="ar", anchor="ra")
    d.text((820, 70), "رسالة محوَّلة", font=regular, fill="#6B7280", **kw)
    d.text((820, 130), "قال الله تعالى:", font=regular, fill="#111827", **kw)
    d.text((820, 195), altered, font=bold, fill="#111827", **kw)
    d.text((820, 290), "انشرها تؤجر", font=regular, fill="#111827", **kw)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


async def check_vision(model: str, image: bytes) -> Row:
    altered, original, donor = altered_verse()
    llm = get_llm()
    user = [text_part("Transcribe the text in this image as instructed."), image_part(image, "image/png")]
    parsed, info, _err = await llm._once(model, "vision", OCR_SYSTEM, user, OCR_SCHEMA, OCRResult, 2000, False)
    if parsed is None:
        return Row("vision", model, False, info.latency_ms, info.cost_usd, info.error or "failed")
    got = normalize_ar(parsed.text)
    kept_alteration = normalize_ar(altered) in got
    corrected = normalize_ar(original) in got.split() and normalize_ar(donor) not in got.split()
    if kept_alteration:
        note = f"altered wording kept as written (confidence {parsed.confidence:.2f})"
    elif corrected:
        note = "FAILED EXACTNESS: the model restored the original verse wording"
    else:
        best = max((similarity(normalize_ar(altered), " ".join(got.split()[i : i + 9])) for i in range(max(1, len(got.split()) - 8))), default=0.0)
        note = f"altered verse not read exactly (best similarity {best:.2f})"
    return Row("vision", model, kept_alteration, info.latency_ms, info.cost_usd, note)


# ---------------------------------------------------------------------------------------- audio


def ffmpeg() -> str:
    from tabayyun.transcribe.service import ffmpeg_exe

    exe = ffmpeg_exe()
    if not exe:
        raise RuntimeError("ffmpeg not available")
    return exe


def test_clip() -> tuple[bytes, str, str | None]:
    """(mp3 bytes, description, expected normalised text or None when the clip has no speech)."""
    recordings = sorted((ROOT / "eval" / "testset" / "audio").glob("*.m*")) if (ROOT / "eval" / "testset" / "audio").exists() else []
    if recordings:
        out = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
        subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", str(recordings[0]), "-t", "60", "-ac", "1", "-ar", "16000", "-b:a", "32k", out], check=True)
        return Path(out).read_bytes(), f"team recording {recordings[0].name} (first 60 s)", None
    try:  # a verse recitation from the approved audio library, through the association's MCP server
        import re

        import httpx

        body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_quran_audio", "arguments": {"surah": AUDIO_VERSE[0], "ayah": AUDIO_VERSE[1], "reciter": "husary"}}}
        r = httpx.post("https://mcp.islamiccontent.org/mcp", json=body, headers={"Accept": "application/json, text/event-stream"}, timeout=30)
        payload = json.loads(next(line[6:] for line in r.text.splitlines() if line.startswith("data: ")))
        url = re.search(r"https?://\S+?\.mp3", payload["result"]["content"][0]["text"]).group(0)
        raw = httpx.get(url, timeout=60, follow_redirects=True).content
        src = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
        Path(src).write_bytes(raw)
        out = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
        subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "16000", "-b:a", "32k", out], check=True)
        quran = get_quran_index()
        expected = normalize_ar(quran.ayahs[quran.by_ref[AUDIO_VERSE]][3])
        return Path(out).read_bytes(), f"recitation of {AUDIO_VERSE[0]}:{AUDIO_VERSE[1]} (approved audio library)", expected
    except Exception:
        out = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
        subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ac", "1", "-ar", "16000", "-b:a", "32k", out], check=True)
        return Path(out).read_bytes(), "synthesised tone (request shape only)", ""


async def check_audio(model: str, clip: tuple[bytes, str, str | None]) -> Row:
    data, what, expected = clip
    llm = get_llm()
    user = [text_part("Transcribe this recording as instructed."), audio_part(data, "mp3")]
    parsed, info, _err = await llm._once(model, "audio", TRANSCRIBE_SYSTEM, user, AUDIO_SCHEMA, AudioTranscript, 4000, False)
    if parsed is None:
        return Row("audio", model, False, info.latency_ms, info.cost_usd, f"{info.error or 'failed'} — {what}")
    stamps_ok = all(s.end >= s.start >= 0 for s in parsed.segments)
    heard = normalize_ar(" ".join(s.text for s in parsed.segments))
    if expected == "":  # tone: only the shape can be judged
        return Row("audio", model, stamps_ok, info.latency_ms, info.cost_usd, f"valid JSON, {len(parsed.segments)} segment(s) — {what}")
    if expected is None:
        ok = stamps_ok and bool(heard)
        return Row("audio", model, ok, info.latency_ms, info.cost_usd, f"{len(parsed.segments)} segment(s), {len(heard.split())} words — {what}")
    sim = similarity(expected, heard) if heard else 0.0
    ok = stamps_ok and bool(parsed.segments) and (expected in heard or sim >= 0.7)
    return Row("audio", model, ok, info.latency_ms, info.cost_usd, f"similarity to the verse {sim:.2f}, {len(parsed.segments)} segment(s) — {what}")


# ---------------------------------------------------------------------------------------- main


def price(model: str) -> str:
    info = load_catalog().get(model)
    if info is None:
        return "not in catalog"
    return "free" if info.is_free else f"${info.prompt_usd_per_mtok:g}/${info.completion_usd_per_mtok:g} per Mtok"


async def main() -> int:
    ap = argparse.ArgumentParser()
    for task in ("text", "vision", "audio"):
        ap.add_argument(f"--{task}", default="", help=f"comma-separated model ids to test for {task} instead of the configured ones")
    ap.add_argument("--only", default="text,vision,audio", help="comma-separated tasks to run")
    ap.add_argument("--write", default=str(ROOT / "eval" / "results" / "model_check.md"))
    args = ap.parse_args()

    if not settings.openrouter_api_key:
        print("OPENROUTER_API_KEY is not set — run scripts/set_openrouter_key.py first.", file=sys.stderr)
        return 2
    catalog = load_catalog(refresh=True)
    configured = {
        "text": [m for m in dict.fromkeys([settings.model_extract, settings.model_cheap, settings.model_fallback, settings.model_baseline_llm]) if m],
        "vision": [m for m in [settings.model_vision] if m],
        "audio": [m for m in [settings.model_audio] if m],
    }
    wanted = {t.strip() for t in args.only.split(",")}
    plan = {task: (([m.strip() for m in getattr(args, task).split(",") if m.strip()] or configured[task]) if task in wanted else []) for task in configured}
    unknown = [m for models in plan.values() for m in models if m not in catalog]
    if unknown:
        print("Not in the live catalog:", ", ".join(unknown), file=sys.stderr)

    rows: list[Row] = []
    jobs = [check_text(m) for m in plan["text"]]
    if plan["vision"]:
        image = render_test_image()
        jobs += [check_vision(m, image) for m in plan["vision"]]
    if plan["audio"]:
        clip = test_clip()
        jobs += [check_audio(m, clip) for m in plan["audio"]]
    sem = asyncio.Semaphore(4)

    async def guarded(job):
        async with sem:
            return await job

    rows = list(await asyncio.gather(*(guarded(j) for j in jobs)))

    header = f"{'task':7} {'model':46} {'result':6} {'latency':>8} {'cost':>10}  {'list price':28} note"
    lines = [header, "-" * len(header)]
    for r in rows:
        lines.append(f"{r.task:7} {r.model:46} {'PASS' if r.ok else 'FAIL':6} {r.latency_ms / 1000:7.1f}s ${r.cost_usd:9.6f}  {price(r.model):28} {r.note}")
    print("\n".join(lines))
    md = ["# Model check", "", "Produced by `scripts/check_models.py` — one tiny Arabic test per task; cost is what the API reported for the call.", "",
          "| Task | Model | Result | Latency | Cost | List price | Note |", "|---|---|---|---|---|---|---|"]  # fmt: skip
    md += [f"| {r.task} | `{r.model}` | {'PASS' if r.ok else 'FAIL'} | {r.latency_ms / 1000:.1f} s | ${r.cost_usd:.6f} | {price(r.model)} | {r.note} |" for r in rows]
    Path(args.write).parent.mkdir(parents=True, exist_ok=True)
    Path(args.write).write_text("\n".join(md) + "\n", encoding="utf-8")
    return 0 if rows and all(r.ok for r in rows) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
