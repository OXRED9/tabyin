# Tabayyun (تبيّن) — project instructions

AI tool that verifies the authenticity and attribution of Islamic religious texts (Quran verses,
hadith, rulings, attributed sayings) inside any content: raw text, article URL, video URL, or an
uploaded audio/video file. Hackathon entry: "AI Challenge Serving Islamic Content" (Bathel
Foundation), Track 4 — knowledge and verification tools for those who introduce Islam.
Team: Abdulaziz (technical), Sulaiman (Sharia review).

Design principle: **"The LLM proposes and explains — rules and sources decide."**

The final authority on any source or religious-behaviour decision is the challenge's
"المرجعية والحزمة العلمية والبيانات" document (summarised in `docs/SOURCES.md`).

## Non-negotiable rules

- **No "supported" without an actual retrieved source text** from an approved source above the
  match threshold. A `supported` state lacking `source_text`, `source_ref`, and `source_url` is a
  bug that fails tests.
- **Hadith gradings are copied verbatim from the source** (`grade_text` + `grade_source_url`). The
  LLM is forbidden from generating a grading, degree, book name, or hadith number. If no grading is
  available: `grade = null` and the UI shows "الحكم غير متاح من المصدر".
- **Quran verses are matched algorithmically only** against the digital Madinah Mushaf text; no LLM
  in the decision.
- **When no source exists: explicit abstention** ("لم يُعثر على مصدر موثوق") and no substitute is
  generated. A request like "give me a hadith that proves X" → refuse to fabricate.
- **No fatwa, no tarjih (preferring one opinion)**: disputed matters are shown as they appear in
  sources with the disagreement noted, no preference, and referral to scholars. Personal cases
  (level D) get no ruling at all.
- **Distinguish definitive from ijtihadi** in every output.
- **Transparency**: a permanent line in the UI: "تبيّن أداة مدعومة بالذكاء الاصطناعي، لا تغني عن
  الرجوع إلى أهل العلم".
- **Privacy**: no server-side storage of user inputs, no analytics, no inference of any religious or
  personal attribute. History (if any) lives only in the browser.
- **No secrets in the repo**: `.env` + documented `.env.example`. The repo will be public.
- **Approved sources only** (see `docs/SOURCES.md`). No source outside the list without Abdulaziz's
  approval.
- You are **forbidden** from writing any hadith, verse, or attributed quote from memory into code,
  data, tests, or examples; every religious text is fetched programmatically from an approved
  source or tagged `TODO-SULAIMAN-REVIEW`.

## Content levels → allowed states

Every claim carries a `content_level`:

- **A — stable foundational information** (Quran, authentic hadith, pillars, core Seerah): all five
  states allowed based on matching.
- **B — explanation, definition, argumentation**: `supported` only with text from an approved
  source; otherwise `needs_review`.
- **C — disputed or highly sensitive**: maximum state is `needs_review`, showing what sources say
  and noting the disagreement; action is always "إحالة إلى أهل العلم". Never `supported` or
  `contradicted`.
- **D — fatwa or personal case**: no verification; display "هذه حالة شخصية تستوجب فتوى من جهة
  مؤهلة" + referral.

The LLM classifies the level conservatively: **when in doubt, pick the more sensitive level.**

## Evidence states (deterministic — `backend/tabayyun/evidence_rules/`)

`supported` (مؤيَّد بمصدر معتمد) · `supported_with_note` (مؤيَّد مع ملاحظة) · `needs_review`
(يحتاج مزيد تحقق) · `not_found` (لم يُعثر على مصدر موثوق) · `contradicted` (مخالف للمصدر).
Actions, in order: اعتماد / تصحيح اللفظ / إحالة إلى أهل العلم / حذف أو طلب مصدر / حذف وتنبيه.
Thresholds live in `evidence_rules/thresholds.py`; final values are documented in
`docs/METHODOLOGY.md`. Never move a decision from the rules into a prompt.

## When to ask Abdulaziz (otherwise decide and log in `docs/DECISIONS.md`)

1. Adding a source outside the approved list.
2. A decision touching religious behaviour.
3. Unexpected cloud cost.

## Phase 2 (daily-life features) — gated

`docs/PHASE2_BRIEF.md` is the product owner's brief for the next features (OCR tab, authentic
alternatives, verdict card, copy, explainability, PWA, public API/MCP, document mode, results page,
enriched cards). **Do not start it until every item of the original Definition of Done is green and
the public URL works.** Each feature sits behind a `FEATURES_*` flag and is disabled if not finished.

## Layout and commands

```
backend/tabayyun/   FastAPI app: ingest/ transcribe/ extract/ sources/ evidence_rules/ report/ llm/
backend/tests/      pytest (rules, normalisation, Quran matcher, one integration test per input type)
frontend/           Vite + React + TS + Tailwind + shadcn/ui (Arabic-first, RTL)
data/               quran.json, hadeethenc.json, terms.json (+ generated indexes, see .gitignore)
scripts/            one-off data builders (Quran, Hadeethenc, hadith books index)
eval/               test set, three-system baseline comparison, results
docs/               SOURCES, LICENSES, METHODOLOGY, OPERATIONS, LIMITATIONS, DESIGN, DECISIONS, API
```

- Backend env: `cd backend && uv venv --python 3.11 .venv && uv pip install -e '.[dev]'`
- Data (once): `backend/.venv/bin/python scripts/bootstrap_data.py`
- Run API: `cd backend && .venv/bin/uvicorn tabayyun.main:app --reload --port 8765`
  (port 8000 is taken by another app on the dev machine)
- Tests: `cd backend && .venv/bin/pytest -q -m "not network"` (add `-m network` for live-source tests)
- Frontend: `cd frontend && npm install && npm run dev` (proxies `/api` to `:8765`)
- Evaluation: `backend/.venv/bin/python eval/build_testset.py && backend/.venv/bin/python eval/run.py`

## Working conventions

- This directory is its own git repo (it sits inside an unrelated umbrella repo at `~/GitHub`; never
  commit there). Small commits with clear messages.
- Frontend uses Tailwind logical properties only (`ms-/me-/ps-/pe-/start/end`, never `ml/mr`).
- UI state is always expressed in three layers: colour + icon + word.
- The API contract between backend and frontend is `docs/API.md`; change both sides together.
- The challenge's development window is 4–6 Oct 2026; anything built earlier must be disclosed as
  the starting version (see `docs/DECISIONS.md`).
