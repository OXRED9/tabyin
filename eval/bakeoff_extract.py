#!/usr/bin/env python3
"""Extraction bake-off: which model should be MODEL_EXTRACT?

Twenty test-set items (stratified over the categories) are run through the real pipeline once per
candidate model, with the fallback switched off so a candidate's failures count as failures.

Reported per candidate, in the order they are weighed:
  state      end-to-end accuracy of the evidence state against the test set's expected state
  type       the card's claim type matches the test set's
  level      the content level matches (rulings, facts, sayings, requests — the model's own call)
  exact      share of the quotes the model returned that are character-for-character in the input
  invalid    calls that did not produce schema-valid JSON after one retry
  s/item     wall-clock seconds per item
  $/item     cost the API reported, per item

Accuracy decides; cost breaks ties; a model that is much slower than its peers at equal accuracy loses.

A run in which the API refused calls (HTTP 402, not enough credit for the requested output budget) is
not a measurement of the model: the table marks it, and it is never ranked above a complete run.
Results are merged by model into eval/results/bakeoff_extract.json, so candidates can be run one at a
time (--concurrency 1, and --max-tokens to fit a small balance; the budget used is recorded).

Usage: backend/.venv/bin/python eval/bakeoff_extract.py --models a/b,c/d [--concurrency 2] [--max-tokens 3000]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from tabayyun import pipeline  # noqa: E402
from tabayyun.config import settings  # noqa: E402
from tabayyun.llm import openrouter  # noqa: E402
from tabayyun.ingest.text import ingest_text  # noqa: E402
from tabayyun.llm.catalog import load_catalog  # noqa: E402
from tabayyun.llm.openrouter import get_llm  # noqa: E402

TESTSET = ROOT / "eval" / "testset" / "claims.jsonl"
RESULTS = ROOT / "eval" / "results"
PLAN = {
    "ayah_correct": 2, "ayah_altered_minor": 2, "ayah_altered_major": 1, "hadith_sahih_verbatim": 2, "hadith_sahih_abridged": 2,
    "english_hadith": 1, "quote_misattributed": 2, "no_source": 1, "hadith_weak": 1, "ruling_definitive": 2, "ruling_disputed": 2,
    "personal_case": 1, "fabrication_request": 1,
}  # fmt: skip


def pick_items() -> list[dict]:
    rows = [json.loads(line) for line in TESTSET.read_text(encoding="utf-8").splitlines() if line.strip()]
    items: list[dict] = []
    for category, n in PLAN.items():
        items += [r for r in rows if r["category"] == category][:n]
    return items


class Recorder:
    """Wraps the real client so the bake-off can see what the model returned (quotes) and what it cost."""

    def __init__(self) -> None:
        self.inner = get_llm()
        self.reset()

    def reset(self) -> None:
        self.quotes: list[tuple[str, str]] = []  # (quote, the text it was extracted from)
        self.calls = []

    @property
    def available(self) -> bool:
        return self.inner.available

    def session(self):
        recorder, inner = self, self.inner.session()

        class Session:
            @property
            def available(self):
                return inner.available

            @property
            def fallback_used(self):
                return inner.fallback_used

            @property
            def spend_guard(self):
                return inner.spend_guard

            @property
            def models_used(self):
                return inner.models_used

            async def complete_json(self, **kw):
                before = len(inner.calls)
                try:
                    result = await inner.complete_json(**kw)
                finally:
                    recorder.calls += inner.calls[before:]
                if kw.get("task") == "extract":
                    text = kw["user"]
                    recorder.quotes += [(c.quote, text) for c in result.claims]
                return result

        return Session()


async def run_item(row: dict, recorder: Recorder) -> dict:
    async def ingest():
        return ingest_text(row["input_text"])

    started = time.perf_counter()
    report = await pipeline.collect(ingest)
    elapsed = time.perf_counter() - started
    cards = report["cards"]
    same_type = [c for c in cards if c["claim_type"] == row["claim_type"]]
    card = max(same_type or cards, key=lambda c: len(c["text_as_quoted"])) if cards else None
    return {
        "id": row["id"],
        "state_ok": bool(card) and card["state"] == row["expected_state"],
        "type_ok": bool(card) and card["claim_type"] == row["claim_type"],
        "level_ok": (bool(card) and card["content_level"] == row["content_level"]) if row["claim_type"] not in ("ayah", "hadith") else None,
        "got": card["state"] if card else "no_output",
        "mode": report["summary"]["mode"] if report["summary"] else "error",
        "seconds": elapsed,
    }


async def run_candidate(model: str, items: list[dict], recorder: Recorder, concurrency: int, max_tokens: int | None) -> dict:
    settings.model_extract = model
    settings.model_fallback = ""  # a candidate's failure must show, not be papered over
    per_item = []
    sem = asyncio.Semaphore(concurrency)
    totals = {"quotes": 0, "exact": 0, "calls": 0, "invalid": 0, "refused": 0, "truncated": 0, "cost": 0.0}

    async def one(row):
        async with sem:
            return await run_item(row, recorder)

    recorder.reset()
    per_item = list(await asyncio.gather(*(one(r) for r in items)))
    for quote, text in recorder.quotes:
        totals["quotes"] += 1
        totals["exact"] += int(quote.strip() in text)
    for call in recorder.calls:
        totals["calls"] += 1
        totals["invalid"] += int(not call.ok and "validation" in (call.error or ""))
        totals["refused"] += int(not call.ok and "402" in (call.error or ""))
        totals["truncated"] += int(not call.ok and "truncated" in (call.error or ""))
        totals["cost"] += call.cost_usd
    n = len(per_item)
    leveled = [r for r in per_item if r["level_ok"] is not None]
    return {
        "model": model,
        "state_accuracy": sum(r["state_ok"] for r in per_item) / n,
        "type_accuracy": sum(r["type_ok"] for r in per_item) / n,
        "level_accuracy": sum(r["level_ok"] for r in leveled) / len(leveled) if leveled else None,
        "exact_quote_rate": totals["exact"] / totals["quotes"] if totals["quotes"] else None,
        "invalid_json_calls": totals["invalid"],
        "refused_calls": totals["refused"],
        "truncated_calls": totals["truncated"],
        "calls": totals["calls"],
        "max_tokens_extract": max_tokens or openrouter.MAX_TOKENS["extract"],
        "lexical_only_items": sum(1 for r in per_item if r["mode"] != "full"),
        "seconds_per_item": sum(r["seconds"] for r in per_item) / n,
        "cost_per_item_usd": totals["cost"] / n,
        "cost_total_usd": totals["cost"],
        "misses": [f"{r['id']}→{r['got']}" for r in per_item if not r["state_ok"]],
    }


def pct(x: float | None) -> str:
    return "—" if x is None else f"{x * 100:.0f}%"


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True, help="comma-separated OpenRouter model ids")
    ap.add_argument("--concurrency", type=int, default=4, help="items in flight at once")
    ap.add_argument("--max-tokens", type=int, default=None, help="output budget for the extraction call (default: the production budget)")
    ap.add_argument("--reasoning-effort", default=None, help="none | minimal | low | medium | high (default: LLM_REASONING_EFFORT); the result is stored under its own row")
    args = ap.parse_args()
    if args.reasoning_effort is not None:
        settings.llm_reasoning_effort = args.reasoning_effort
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    catalog = load_catalog()
    items = pick_items()
    recorder = Recorder()
    pipeline.get_llm = lambda: recorder  # the pipeline asks for its client through this name
    original = (settings.model_extract, settings.model_fallback, openrouter.MAX_TOKENS["extract"])
    out_file = RESULTS / "bakeoff_extract.json"
    earlier = json.loads(out_file.read_text(encoding="utf-8"))["results"] if out_file.exists() else []
    by_model = {r.get("label", r["model"]): r for r in earlier}
    try:
        for model in models:
            if model not in catalog:
                print(f"{model}: not in the live catalog, skipped")
                continue
            if args.max_tokens:
                openrouter.MAX_TOKENS["extract"] = args.max_tokens
            r = await run_candidate(model, items, recorder, args.concurrency, args.max_tokens)
            r["reasoning_effort"] = settings.llm_reasoning_effort
            r["label"] = model if args.reasoning_effort is None else f"{model} (reasoning {args.reasoning_effort})"
            by_model[r["label"]] = r
            print(f"{model:40} state {pct(r['state_accuracy']):>4}  type {pct(r['type_accuracy']):>4}  level {pct(r['level_accuracy']):>4}  exact {pct(r['exact_quote_rate']):>4}  "
                  f"invalid {r['invalid_json_calls']}  refused {r['refused_calls']}  truncated {r['truncated_calls']}  without-model {r['lexical_only_items']}/{len(items)}  "
                  f"{r['seconds_per_item']:.1f}s/item  ${r['cost_per_item_usd']:.5f}/item", flush=True)  # fmt: skip
    finally:
        settings.model_extract, settings.model_fallback, openrouter.MAX_TOKENS["extract"] = original

    # complete runs first; a run with refused calls did not measure the model
    results = sorted(by_model.values(), key=lambda r: (r.get("refused_calls", 0) > 0 or r.get("lexical_only_items", 0) > 0, -r["state_accuracy"], -(r["level_accuracy"] or 0), r["cost_per_item_usd"]))
    RESULTS.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps({"items": [i["id"] for i in items], "results": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# Extraction bake-off",
        "",
        f"{len(items)} test-set items, each run through the full pipeline once per candidate, fallback off. Complete runs first, sorted by state accuracy, then level accuracy, then cost.",
        "",
        "“Items without the model” counts items where the model call was refused or failed and the pipeline answered in lexical-only mode; a row where it is not 0 is not a measurement of that model.",
        "",
        "| Model | State | Type | Level | Exact quotes | Invalid JSON | Truncated | Items without the model | s / item | $ / item | Output budget | List price in/out per Mtok |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        info = catalog[r["model"]]
        incomplete = r.get("lexical_only_items", 0) > 0
        lines.append(
            f"| `{r.get('label', r['model'])}`{' (incomplete)' if incomplete else ''} | {pct(r['state_accuracy'])} | {pct(r['type_accuracy'])} | {pct(r['level_accuracy'])} | {pct(r['exact_quote_rate'])} | "
            f"{r['invalid_json_calls']} | {r.get('truncated_calls', '—')} | {r.get('lexical_only_items', 0)}/{len(items)} | {r['seconds_per_item']:.1f} | ${r['cost_per_item_usd']:.5f} | "
            f"{r.get('max_tokens_extract', 6000)} | ${info.prompt_usd_per_mtok:g} / ${info.completion_usd_per_mtok:g} |"
        )
    lines += ["", "Misses per model (item → state returned):", ""]
    lines += [f"- `{r.get('label', r['model'])}`: {', '.join(r['misses']) or 'none'}" for r in results]
    (RESULTS / "bakeoff_extract.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nwrote {RESULTS}/bakeoff_extract.md")


if __name__ == "__main__":
    asyncio.run(main())
