#!/usr/bin/env python3
"""Three-system comparison on eval/testset/claims.jsonl.

  1. lexical   — plain keyword search over the same corpora, no extraction, no gradings, no rules
                 (what pasting the text into a search box gives you).
  2. llm       — a general LLM asked directly, with no retrieval (skipped when no key is configured).
  3. tabayyun  — the full pipeline (reported as "lexical-only mode" when no LLM key is configured).

Metrics: overall accuracy, per-state precision/recall, fabricated-attribution rate, correct-abstention
rate on fabrication requests and no-source texts, seconds per claim. Every system runs RUNS times;
mean and standard deviation are reported.

Usage: backend/.venv/bin/python eval/run.py [--runs 3] [--only tabayyun,lexical]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from pydantic import BaseModel  # noqa: E402

from tabayyun import pipeline  # noqa: E402
from tabayyun.config import settings  # noqa: E402
from tabayyun.ingest.text import ingest_text  # noqa: E402
from tabayyun.llm.base import LLMError  # noqa: E402
from tabayyun.llm.openrouter import get_llm  # noqa: E402
from tabayyun.normalize import normalize_ar, normalize_latin  # noqa: E402
from tabayyun.sources.hadith import get_hadith_index  # noqa: E402
from tabayyun.sources.quran import get_quran_index  # noqa: E402

TESTSET = ROOT / "eval" / "testset" / "claims.jsonl"
RESULTS = ROOT / "eval" / "results"
STATES = ["supported", "supported_with_note", "needs_review", "not_found", "contradicted"]
SUPPORTED = {"supported", "supported_with_note"}
ABSTAIN_CATEGORIES = {"fabrication_request", "no_source"}
_STOP = {"قال", "الله", "تعالي", "رسول", "صلي", "عليه", "وسلم", "النبي", "في", "من", "علي", "ان", "عن", "ما", "لا", "الحديث", "الشريف", "ورد", "جاء", "القران", "الكريم"}


class Prediction(BaseModel):
    state: str  # one of STATES, or "no_output"
    ref: str | None = None  # "quran:s:a" | "hadeethenc:id" | "books:key" | "dorar" | free text (LLM)
    has_source: bool = False
    seconds: float = 0.0
    detail: str = ""


# --------------------------------------------------------------------------- system 1: lexical search


def _content_tokens(text: str) -> set[str]:
    return {t for t in normalize_ar(text).split() if len(t) >= 2 and t not in _STOP}


async def system_lexical(row: dict) -> Prediction:
    quran, hadith = get_quran_index(), get_hadith_index()
    text = row["input_text"]
    q = _content_tokens(text)
    best: tuple[float, str | None] = (0.0, None)
    if q:
        scores: dict[int, float] = {}
        for w in q:
            for a in quran.word_ayahs.get(w, ())[:400]:
                scores[a] = scores.get(a, 0.0) + quran.idf[w]
        for a, _ in sorted(scores.items(), key=lambda kv: -kv[1])[:5]:
            s, n, _u, clean = quran.ayahs[a]
            cont = len(q & _content_tokens(clean)) / len(q)
            if cont > best[0]:
                best = (cont, f"quran:{s}:{n}")
        for c in sorted(hadith.search(text, k=40), key=lambda c: c.lexical_rank)[:5]:
            cont = len(q & _content_tokens(c.text)) / len(q)
            if cont > best[0]:
                best = (cont, f"hadeethenc:{c.key}" if c.corpus == "hadeethenc" else f"books:{c.key}")
    else:  # non-Arabic input: match against published English translations
        ql = {w for w in normalize_latin(text).split() if len(w) > 3}
        for c in hadith.search(text, k=5):
            cont = len(ql & set(normalize_latin((c.en or {}).get("hadeeth", "")).split())) / max(1, len(ql))
            if cont > best[0]:
                best = (cont, f"hadeethenc:{c.key}")
    if best[0] >= 0.6:
        return Prediction(state="supported", ref=best[1], has_source=True, detail=f"containment {best[0]:.2f}")
    return Prediction(state="not_found", detail=f"containment {best[0]:.2f}")


# --------------------------------------------------------------------------- system 2: general LLM


class LLMVerdict(BaseModel):
    state: Literal["supported", "supported_with_note", "needs_review", "not_found", "contradicted"]
    reference: str
    surah: int
    ayah: int


LLM_SCHEMA = {
    "type": "object",
    "properties": {
        "state": {"type": "string", "enum": STATES},
        "reference": {"type": "string"},
        "surah": {"type": "integer"},
        "ayah": {"type": "integer"},
    },
    "required": ["state", "reference", "surah", "ayah"],
    "additionalProperties": False,
}
LLM_SYSTEM = """You are a knowledgeable assistant. The user gives a short text containing an Islamic \
religious citation or statement. Judge it from your own knowledge and answer in JSON:
- state: "supported" (authentic and accurately quoted), "supported_with_note" (authentic but the \
wording differs slightly), "needs_review" (disputed, weak, or a personal case needing a scholar), \
"not_found" (you know of no source for it), or "contradicted" (misquoted, misattributed or fabricated).
- reference: the source reference as you would cite it (book and number, or surah and verse); "" if none.
- surah, ayah: for a Quran verse, the surah number and verse number; 0 and 0 otherwise."""


async def system_llm(row: dict) -> Prediction:
    """MODEL_BASELINE_LLM asked directly, no retrieval and no fallback: what a general chatbot says."""
    try:
        v, _calls = await get_llm().complete_json(task="baseline", system=LLM_SYSTEM, user=row["input_text"], schema=LLM_SCHEMA, model_cls=LLMVerdict)
    except LLMError as e:
        return Prediction(state="no_output", detail=str(e)[:120])
    ref = f"quran:{v.surah}:{v.ayah}" if v.surah and v.ayah else (v.reference.strip() or None)
    return Prediction(state=v.state, ref=ref, has_source=False, detail=v.reference[:120])


# --------------------------------------------------------------------------- system 3: Tabayyun


def _card_ref(card: dict) -> str | None:
    src = card.get("source")
    if not src:
        return None
    url = src["url"]
    m = re.search(r"quranenc\.com/\w+/browse/\w+/(\d+)/(\d+)", url)
    if m:
        return f"quran:{m.group(1)}:{m.group(2)}"
    m = re.search(r"hadeethenc\.com/\w+/browse/hadith/(\d+)", url)
    if m:
        return f"hadeethenc:{m.group(1)}"
    return "dorar" if "الدرر" in src["source_name"] else "books"


async def system_tabayyun(row: dict) -> Prediction:
    async def ingest():
        return ingest_text(row["input_text"])

    report = await pipeline.collect(ingest)
    cards = report["cards"]
    if not cards:
        return Prediction(state="no_output", detail=";".join(e["code"] for e in report["errors"]))
    same_type = [c for c in cards if c["claim_type"] == row["claim_type"]]
    card = max(same_type or cards, key=lambda c: len(c["text_as_quoted"]))
    src = card.get("source")
    return Prediction(
        state=card["state"],
        ref=_card_ref(card),
        has_source=bool(src and src["text"] and src["ref"] and src["url"]),
        detail=f"{card['claim_type']}/{card['rule_id']}/{report['summary']['mode']}",
    )


# --------------------------------------------------------------------------- scoring


def same_reference(pred_ref: str | None, row: dict) -> bool:
    expected = row.get("expected_ref")
    if not expected or not pred_ref:
        return False
    if pred_ref == expected:
        return True
    kind = expected.split(":")[0]
    if kind == "quran" and pred_ref.startswith("quran:"):
        # The same words can occur in several places; accept a location whose text contains the quote.
        quran = get_quran_index()
        _, s, a = pred_ref.split(":")
        idx = quran.by_ref.get((int(s), int(a)))
        _, es, ea = expected.split(":")
        exp = quran.ayahs[quran.by_ref[(int(es), int(ea))]][3]
        return idx is not None and (normalize_ar(exp) in normalize_ar(quran.ayahs[idx][3]) or normalize_ar(quran.ayahs[idx][3]) in normalize_ar(exp))
    if kind == "hadeethenc":
        # the same narration is also in the hadith books and may be a different HadeethEnc record
        return pred_ref.startswith(("hadeethenc:", "books", "dorar"))
    if kind == "dorar":
        return pred_ref.startswith(("dorar", "books", "hadeethenc:"))
    return False


def fabricated_attribution(pred: Prediction, row: dict, system: str) -> bool:
    """A "supported" verdict with no matching source behind it:
    (a) the system shows no source text, reference and URL (always a failure for Tabayyun);
    (b) the test set says no source exists for the text (invented text, request to fabricate);
    (c) the cited Quran location does not contain the quoted words.
    """
    if pred.state not in SUPPORTED:
        return False
    if system == "tabayyun" and not pred.has_source:
        return True
    if row["category"] in ABSTAIN_CATEGORIES:
        return True
    if (row.get("expected_ref") or "").startswith("quran:"):
        return not same_reference(pred.ref, row)
    return False


def wrongly_endorsed(pred: Prediction, row: dict) -> bool:
    """A "supported" verdict on something the sources do not support (weak, fabricated, disputed, personal)."""
    return pred.state in SUPPORTED and row["expected_state"] not in SUPPORTED and row["category"] != "quote_misattributed"


def score(rows: list[dict], preds: list[Prediction], system: str) -> dict:
    n = len(rows)
    correct = [p.state == r["expected_state"] for r, p in zip(rows, preds)]
    per_state = {}
    for s in STATES:
        tp = sum(1 for r, p in zip(rows, preds) if p.state == s and r["expected_state"] == s)
        fp = sum(1 for r, p in zip(rows, preds) if p.state == s and r["expected_state"] != s)
        fn = sum(1 for r, p in zip(rows, preds) if p.state != s and r["expected_state"] == s)
        per_state[s] = {
            "precision": round(tp / (tp + fp), 4) if tp + fp else None,
            "recall": round(tp / (tp + fn), 4) if tp + fn else None,
            "support": tp + fn,
        }
    per_category: dict[str, dict] = {}
    for r, ok in zip(rows, correct):
        c = per_category.setdefault(r["category"], {"n": 0, "correct": 0})
        c["n"] += 1
        c["correct"] += int(ok)
    fabricated = [fabricated_attribution(p, r, system) for r, p in zip(rows, preds)]
    endorsed = [wrongly_endorsed(p, r) for r, p in zip(rows, preds)]
    abst_rows = [(r, p) for r, p in zip(rows, preds) if r["category"] in ABSTAIN_CATEGORIES]
    abstained = sum(1 for _r, p in abst_rows if p.state == "not_found" and not p.has_source)
    return {
        "accuracy": round(sum(correct) / n, 4),
        "fabricated_attribution_rate": round(sum(fabricated) / n, 4),
        "fabricated_attribution_ids": [r["id"] for r, f in zip(rows, fabricated) if f],
        "wrongly_endorsed_rate": round(sum(endorsed) / n, 4),
        "wrongly_endorsed_ids": [r["id"] for r, f in zip(rows, endorsed) if f],
        "correct_abstention_rate": round(abstained / len(abst_rows), 4) if abst_rows else None,
        "no_output": sum(1 for p in preds if p.state == "no_output"),
        # Tabayyun items the model did not answer (refused, failed): they were decided in lexical-only mode
        "without_model": sum(1 for p in preds if p.detail.endswith("/lexical_only")) if system == "tabayyun" else 0,
        "seconds_per_claim": round(statistics.mean(p.seconds for p in preds), 3),
        "per_state": per_state,
        "per_category": {k: {**v, "accuracy": round(v["correct"] / v["n"], 3)} for k, v in per_category.items()},
    }


SYSTEMS = {"lexical": system_lexical, "llm": system_llm, "tabayyun": system_tabayyun}
LABELS = {"lexical": "Lexical search only", "llm": "General LLM, no retrieval", "tabayyun": "Tabayyun"}


async def run_system(name: str, rows: list[dict], concurrency: int) -> list[Prediction]:
    sem = asyncio.Semaphore(concurrency)
    fn = SYSTEMS[name]

    async def one(row: dict) -> Prediction:
        async with sem:
            t0 = time.perf_counter()
            try:
                p = await fn(row)
            except Exception as e:  # a crash is a wrong answer, not a reason to stop the run
                p = Prediction(state="no_output", detail=f"{type(e).__name__}: {e}"[:160])
            p.seconds = round(time.perf_counter() - t0, 3)
            return p

    return list(await asyncio.gather(*(one(r) for r in rows)))


def mean_std(values: list[float]) -> dict:
    return {"mean": round(statistics.mean(values), 4), "std": round(statistics.pstdev(values), 4) if len(values) > 1 else 0.0}


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--only", default="lexical,llm,tabayyun")
    ap.add_argument("--concurrency", type=int, default=4, help="model calls in flight at once (lower it on a small balance)")
    args = ap.parse_args()

    rows = [json.loads(line) for line in TESTSET.read_text(encoding="utf-8").splitlines() if line.strip()]
    llm = get_llm()
    out: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "testset": {"path": str(TESTSET.relative_to(ROOT)), "claims": len(rows), "reviewed_by_sulaiman": sum(1 for r in rows if r["reviewed_by_sulaiman"])},
        "runs": args.runs,
        "llm_available": llm.available,
        "llm_models": llm.status()["models"],
        "systems": {},
    }
    for name in [s for s in args.only.split(",") if s in SYSTEMS]:
        if name == "llm" and not llm.can("baseline"):
            out["systems"][name] = {"label": LABELS[name], "status": "not_run", "reason": "no OpenRouter key or MODEL_BASELINE_LLM configured"}
            print(f"{name}: skipped (no key / baseline model)")
            continue
        per_run = []
        last_preds: list[Prediction] = []
        for i in range(args.runs):
            preds = await run_system(name, rows, concurrency=args.concurrency if name != "lexical" else 1)
            per_run.append(score(rows, preds, name))
            last_preds = preds
            print(f"{name} run {i + 1}: accuracy {per_run[-1]['accuracy']:.3f}  fabricated {per_run[-1]['fabricated_attribution_rate']:.3f}  abstention {per_run[-1]['correct_abstention_rate']}  {per_run[-1]['seconds_per_claim']}s/claim")
        mode = "full" if (name != "tabayyun" or llm.available) else "lexical_only"
        degraded = max(r["without_model"] for r in per_run) if mode == "full" else 0
        if degraded:
            mode = "partial"
            print(f"WARNING: {degraded} of {len(rows)} items were answered without the model — this run does not measure full mode")
        model_note = f" ({settings.model_baseline_llm})" if name == "llm" else (f" ({settings.model_extract})" if name == "tabayyun" and mode == "full" else "")
        out["systems"][name] = {
            "label": LABELS[name] + model_note + (" (lexical-only mode)" if name == "tabayyun" and mode == "lexical_only" else "") + (f" (incomplete: {degraded} items without the model)" if degraded else ""),
            "status": "ok",
            "mode": mode,
            "accuracy": mean_std([r["accuracy"] for r in per_run]),
            "fabricated_attribution_rate": mean_std([r["fabricated_attribution_rate"] for r in per_run]),
            "wrongly_endorsed_rate": mean_std([r["wrongly_endorsed_rate"] for r in per_run]),
            "correct_abstention_rate": mean_std([r["correct_abstention_rate"] for r in per_run]),
            "seconds_per_claim": mean_std([r["seconds_per_claim"] for r in per_run]),
            "last_run": per_run[-1],
            "predictions": [{"id": r["id"], "expected": r["expected_state"], **p.model_dump()} for r, p in zip(rows, last_preds)],
        }

    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "results.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    from report import write_markdown_and_chart

    write_markdown_and_chart(out, RESULTS)
    print(f"wrote {RESULTS}/results.json, results.md, comparison.png")


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))
    asyncio.run(main())
