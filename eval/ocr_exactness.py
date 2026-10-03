#!/usr/bin/env python3
"""OCR exactness test: does a vision model transcribe a misquoted verse AS WRITTEN?

Ten chat-style images are rendered with Pillow. Each shows a verse from the Mushaf data in which one
word has been replaced, programmatically, by a word from another verse. A model passes an image only
if its transcription contains the altered wording; a model that "restores" the original verse fails,
because that would hide exactly the error Tabayyun exists to detect.

Fifteen more images carry claims from the test set (eval/testset/claims.jsonl) as they would be
forwarded, to measure the character error rate on ordinary citations (F1's OCR evaluation).

Reported per model: exact (altered wording kept), corrected (original restored — the dangerous
failure), character error rate over the altered-verse images and over the test-set images, latency, cost.

Usage: backend/.venv/bin/python eval/ocr_exactness.py --models a/b,c/d [--save-images]
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from rapidfuzz.distance import Levenshtein  # noqa: E402

from tabayyun.extract.models import OCR_SCHEMA, OCRResult  # noqa: E402
from tabayyun.extract.prompts import OCR_SYSTEM  # noqa: E402
from tabayyun.llm.catalog import load_catalog  # noqa: E402
from tabayyun.llm.openrouter import get_llm, image_part, text_part  # noqa: E402
from tabayyun.normalize import normalize_ar  # noqa: E402
from tabayyun.sources.quran import get_quran_index  # noqa: E402

RESULTS = ROOT / "eval" / "results"
IMAGES = ROOT / "eval" / "testset" / "images"
SEED = 1448
N_IMAGES = 10
N_TESTSET = 15
TESTSET = ROOT / "eval" / "testset" / "claims.jsonl"
HEADERS = ["رسالة محوَّلة", "منقول", "وصلتني هذه الرسالة", "للفائدة"]
INTROS = ["قال الله تعالى:", "يقول الله عز وجل:", "جاء في القرآن الكريم:"]
FOOTERS = ["انشرها تؤجر", "لا تدعها تقف عندك", "أرسلها لمن تحب"]


def build_cases() -> list[dict]:
    """Verses of 8–14 words, one word replaced by a word from another verse (never typed by hand)."""
    rng = random.Random(SEED)
    quran = get_quran_index()
    pool = [a for a in quran.ayahs if 8 <= len(a[3].split()) <= 14]
    donors = [w for a in rng.sample(quran.ayahs, 80) for w in a[3].split() if len(w) >= 4]
    cases = []
    for s, a, _uthmani, clean in rng.sample(pool, N_IMAGES):
        words = clean.split()
        pos = rng.randrange(2, len(words) - 1)
        donor = next(d for d in donors if normalize_ar(d) not in {normalize_ar(w) for w in words})
        donors.remove(donor)
        altered = words.copy()
        altered[pos] = donor
        cases.append(
            {
                "ref": f"{s}:{a}",
                "original_word": words[pos],
                "inserted_word": donor,
                "altered": " ".join(altered),
                "lines": [rng.choice(HEADERS), rng.choice(INTROS), " ".join(altered), rng.choice(FOOTERS)],
            }
        )
    return cases


def build_testset_cases() -> list[dict]:
    """Fifteen Arabic test-set inputs of message length, taken round-robin over the categories."""
    rng = random.Random(SEED)
    rows = [json.loads(line) for line in TESTSET.read_text(encoding="utf-8").splitlines() if line.strip()]
    by_category: dict[str, list[dict]] = {}
    for r in rows:
        text = r["input_text"]
        if 30 <= len(text) <= 220 and sum("\u0600" <= ch <= "\u06ff" for ch in text) > len(text) * 0.5:
            by_category.setdefault(r["category"], []).append(r)
    picked: list[dict] = []
    while len(picked) < N_TESTSET and any(by_category.values()):
        for rows_ in by_category.values():
            if rows_ and len(picked) < N_TESTSET:
                picked.append(rows_.pop(0))
    return [{"ref": r["id"], "altered": r["input_text"], "testset": True, "lines": [rng.choice(HEADERS), "", r["input_text"], rng.choice(FOOTERS)]} for r in picked]


def render(case: dict) -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    fonts = ROOT / "backend" / "tabayyun" / "assets" / "fonts"
    regular = ImageFont.truetype(str(fonts / "IBMPlexSansArabic-Regular.ttf"), 32, layout_engine=ImageFont.Layout.RAQM)
    bold = ImageFont.truetype(str(fonts / "IBMPlexSansArabic-SemiBold.ttf"), 34, layout_engine=ImageFont.Layout.RAQM)
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    kw = dict(direction="rtl", language="ar")
    # wrap the verse to the bubble width
    verse_lines, current = [], ""
    for word in case["altered"].split():
        trial = f"{current} {word}".strip()
        if current and probe.textlength(trial, font=bold, **kw) > 760:
            verse_lines.append(current)
            current = word
        else:
            current = trial
    verse_lines.append(current)
    height = 250 + 62 * len(verse_lines)
    img = Image.new("RGB", (900, height), "#E5DDD5")
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([36, 30, 864, height - 30], radius=22, fill="#DCF8C6")
    y = 54
    d.text((828, y), case["lines"][0], font=regular, fill="#667781", anchor="ra", **kw)
    y += 58
    if case["lines"][1]:
        d.text((828, y), case["lines"][1], font=regular, fill="#111B21", anchor="ra", **kw)
        y += 58
    for ln in verse_lines:
        d.text((828, y), ln, font=bold, fill="#111B21", anchor="ra", **kw)
        y += 62
    d.text((828, y + 6), case["lines"][3], font=regular, fill="#111B21", anchor="ra", **kw)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def cer(expected: str, got: str) -> float:
    e, g = normalize_ar(expected), normalize_ar(got)
    return Levenshtein.distance(e, g) / max(1, len(e))


async def run_model(model: str, cases: list[dict], images: list[bytes], concurrency: int = 2) -> dict:
    llm = get_llm()
    sem = asyncio.Semaphore(concurrency)

    async def one(case: dict, image: bytes) -> dict:
        user = [text_part("Transcribe the text in this image as instructed."), image_part(image, "image/png")]
        async with sem:
            parsed, info, _err = await llm._once(model, "vision", OCR_SYSTEM, user, OCR_SCHEMA, OCRResult, 2000, False)
        testset = bool(case.get("testset"))
        if parsed is None:
            return {"ref": case["ref"], "testset": testset, "exact": False, "corrected": False, "failed": True, "refused": "402" in (info.error or ""), "cer": 1.0, "ms": info.latency_ms, "cost": info.cost_usd}
        got = normalize_ar(parsed.text)
        exact = " ".join(normalize_ar(case["altered"]).split()) in " ".join(got.split())
        tokens = got.split()
        corrected = (not testset) and normalize_ar(case["original_word"]) in tokens and normalize_ar(case["inserted_word"]) not in tokens
        return {"ref": case["ref"], "testset": testset, "exact": exact, "corrected": corrected, "failed": False, "cer": cer(" ".join(x for x in case["lines"] if x), parsed.text), "ms": info.latency_ms, "cost": info.cost_usd}

    everything = list(await asyncio.gather(*(one(c, i) for c, i in zip(cases, images))))
    extra = [r for r in everything if r["testset"]]
    rows = [r for r in everything if not r["testset"]]
    n = len(rows)
    read = [r for r in extra if not r["failed"]]
    return {
        "testset_n": len(extra),
        "testset_exact": sum(r["exact"] for r in extra),
        "testset_failed_calls": sum(r["failed"] for r in extra),
        "testset_mean_cer": (sum(r["cer"] for r in read) / len(read)) if read else None,
        "testset_cost_per_image_usd": (sum(r["cost"] for r in extra) / len(extra)) if extra else None,
        "model": model,
        "exact": sum(r["exact"] for r in rows),
        "corrected": sum(r["corrected"] for r in rows),
        "failed_calls": sum(r["failed"] for r in rows),
        "refused_calls": sum(r.get("refused", False) for r in rows),  # HTTP 402: not a measurement of the model
        "n": n,
        "mean_cer": sum(r["cer"] for r in rows if not r["failed"]) / max(1, sum(not r["failed"] for r in rows)),
        "seconds_per_image": sum(r["ms"] for r in rows) / n / 1000,
        "cost_per_image_usd": sum(r["cost"] for r in rows) / n,
        "missed": [r["ref"] for r in rows if not r["exact"]],
    }


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True)
    ap.add_argument("--save-images", action="store_true", help=f"write the rendered PNGs to {IMAGES.relative_to(ROOT)}")
    ap.add_argument("--concurrency", type=int, default=2, help="images in flight at once")
    args = ap.parse_args()
    catalog = load_catalog()
    cases = build_cases() + build_testset_cases()
    images = [render(c) for c in cases]
    if args.save_images:
        IMAGES.mkdir(parents=True, exist_ok=True)
        for i, (case, png) in enumerate(zip(cases, images), start=1):
            (IMAGES / f"altered-verse-{i:02d}.png").write_bytes(png)
        (IMAGES / "manifest.json").write_text(
            json.dumps([{"file": f"altered-verse-{i:02d}.png", **{k: c.get(k) for k in ("ref", "original_word", "inserted_word", "altered")}} for i, c in enumerate(cases, start=1)], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    out_file = RESULTS / "ocr_exactness.json"
    by_model = {r["model"]: r for r in json.loads(out_file.read_text(encoding="utf-8"))} if out_file.exists() else {}
    for model in [m.strip() for m in args.models.split(",") if m.strip()]:
        if model not in catalog:
            print(f"{model}: not in the live catalog, skipped")
            continue
        r = await run_model(model, cases, images, args.concurrency)
        by_model[model] = r
        print(f"{model:38} exact {r['exact']:2}/{r['n']}  corrected {r['corrected']}  failed calls {r['failed_calls']}  CER {r['mean_cer'] * 100:4.1f}%  {r['seconds_per_image']:.1f}s  ${r['cost_per_image_usd']:.6f}/image", flush=True)
    # complete runs first: a run with failed calls did not measure the model on every image
    results = sorted(by_model.values(), key=lambda r: (r["failed_calls"] > 0, -r["exact"], r["corrected"], r["cost_per_image_usd"]))
    RESULTS.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# OCR exactness",
        "",
        f"{N_IMAGES} rendered chat-style images, each with a verse in which one word was replaced programmatically. "
        "“Exact” = the altered wording came back as written; “corrected” = the model restored the original verse (the failure that matters). "
        "A row with failed calls is incomplete: those images were not read at all (HTTP 402 when the balance was too low, or an invalid answer), "
        "so its “exact” count is a lower bound. Mean CER is over the images that were read.",
        "",
        "| Model | Exact | Corrected | Failed calls | Mean CER | s / image | $ / image | List price in/out per Mtok |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        info = catalog[r["model"]]
        lines.append(
            f"| `{r['model']}`{' (incomplete)' if r['failed_calls'] else ''} | {r['exact']}/{r['n']} | {r['corrected']} | {r['failed_calls']} | {r['mean_cer'] * 100:.1f}% | {r['seconds_per_image']:.1f} | "
            f"${r['cost_per_image_usd']:.6f} | ${info.prompt_usd_per_mtok:g} / ${info.completion_usd_per_mtok:g} |"
        )
    with_testset = [r for r in results if r.get("testset_n")]
    if with_testset:
        lines += [
            "",
            f"## Test-set claims as forwarded messages ({N_TESTSET} images)",
            "",
            "“Exact” = the whole claim came back character for character (after the usual normalisation of diacritics and letter forms).",
            "",
            "| Model | Exact | Failed calls | Mean CER | $ / image |",
            "|---|---|---|---|---|",
        ]
        for r in with_testset:
            mean = "—" if r["testset_mean_cer"] is None else f"{r['testset_mean_cer'] * 100:.1f}%"
            lines.append(f"| `{r['model']}` | {r['testset_exact']}/{r['testset_n']} | {r['testset_failed_calls']} | {mean} | ${r['testset_cost_per_image_usd']:.6f} |")
    (RESULTS / "ocr_exactness.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {RESULTS}/ocr_exactness.md")


if __name__ == "__main__":
    asyncio.run(main())
