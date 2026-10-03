# Operations

## Run it

### Docker (one command after the env file)

```bash
backend/.venv/bin/python scripts/set_openrouter_key.py   # optional: prompts for the OpenRouter key, validates it, writes .env
docker compose up --build   # → http://localhost:8080
```

The image build downloads HadeethEnc through its public API and builds the hadith index from
Open-Hadith-Data (a few minutes, cached as image layers afterwards).

### Local development

```bash
cd backend && uv venv --python 3.11 .venv && uv pip install -e '.[dev]' && cd ..
backend/.venv/bin/python scripts/bootstrap_data.py           # Quran, HadeethEnc, hadith books index
cd backend && .venv/bin/uvicorn tabayyun.main:app --reload --port 8765
cd frontend && npm install && npm run dev                    # http://localhost:5173, proxies /api → :8765
```

Tests: `cd backend && .venv/bin/pytest -q` (offline, deterministic, no model calls); `-m network`
runs the live-source tests and `-m llm` the eight content-safety cases through the real model
(paid, about half a cent). Evaluation: `backend/.venv/bin/python eval/run.py`.
Model checks (paid, run by hand): `make models-check` (one tiny test per configured model, about a
cent) and `make models-verify` (that check, one transcription and the evaluation once, about $0.17).

## Configuration (`.env`, documented in `.env.example`)

| Variable | Default | Effect |
|---|---|---|
| `OPENROUTER_API_KEY` | — | the only model key. Without it the app runs in lexical-only mode. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | one OpenAI-compatible endpoint for text, vision and audio |
| `OPENROUTER_APP_URL` / `OPENROUTER_APP_TITLE` | `PUBLIC_URL` / `Tabayyun` | sent as `HTTP-Referer` and `X-Title` |
| `MODEL_EXTRACT` | `qwen/qwen3.8-flash` | finds citations, classifies the level, points at retrieved texts |
| `MODEL_VISION` | `qwen/qwen3.7-flash` | reads the text of an image exactly as written |
| `MODEL_AUDIO` | `google/gemini-3.5-flash-lite` | speech → timestamped segments |
| `MODEL_CHEAP` | `deepseek/deepseek-v4-flash` | one-line topic summaries, build-time chores |
| `MODEL_FALLBACK` | `nvidia/nemotron-3-super-120b-a12b:free` | used after the primary fails twice, or past the daily limit |
| `MODEL_BASELINE_LLM` | `openai/gpt-6.1-sol` | the "general chatbot" baseline in `eval/run.py` only |
| `LLM_REASONING_EFFORT` | `none` | reasoning depth of the extraction call (`none`/`minimal`/`low`/`medium`/`high`) |
| `LLM_REASONING_EFFORT_JUDGE` | `low` | reasoning depth of the pointing call; with `none` the model accepted a no-source text as a paraphrase |
| `DAILY_SPEND_LIMIT_USD` | `1` | past it, every call uses `MODEL_FALLBACK` until midnight UTC (about 800 verifications a day at measured prices) |
| `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` | `local` / `intfloat/multilingual-e5-small` | local only, never through OpenRouter (not used by a shipped feature yet) |
| `TRANSCRIPTION_PROVIDER` | `auto` | captions → `MODEL_AUDIO` → local faster-whisper (if installed) |
| `AUDIO_CHUNK_SECONDS` | `600` | longer recordings are split and their timestamps offset |
| `DEV_MODE` | `false` | `true` enables `GET /admin/usage` |
| `DORAR_ENABLED` | `true` | live gradings from Dorar |
| `MAX_TEXT_CHARS` / `MAX_UPLOAD_MB` / `MAX_MEDIA_MINUTES` | 60000 / 50 / 30 | input limits |
| `EXAMPLE_VIDEO_URL` | — | the YouTube example on the first screen (hidden when empty) |
| `CORS_ORIGINS` | — | only needed if the frontend is hosted on another origin |

## Deploy

One container serves the API and the built frontend.

- **Fly.io** (`fly.toml`): `fly launch --copy-config --no-deploy`, then
  `fly secrets set OPENROUTER_API_KEY=… PUBLIC_URL=https://<app>.fly.dev OPENROUTER_APP_URL=https://<app>.fly.dev`
  and `fly deploy`. The model IDs are in `fly.toml` (they are not secrets). One shared-CPU machine
  with 1 GB that sleeps when idle.
- **Render** (`render.yaml`): a Blueprint for a Docker web service with `/health` as the health
  check. Create the service from the repository and enter `OPENROUTER_API_KEY` in the dashboard.
- **Any Docker host**: `docker run --env-file .env -p 8080:8080 tabayyun`.
- **Keep-alive**: `.github/workflows/keepalive.yml` requests `/health` every 10 minutes once the
  repository variable `TABAYYUN_URL` is set. `.github/workflows/tests.yml` runs the offline tests.

`GET /health` reports the mode (`full` / `lexical_only`), the model configured for each task, whether
the daily spend guard is active, index sizes and whether Dorar was reachable on the last call.

## Dependencies and what happens when each fails

| Dependency | Needed for | If it is down |
|---|---|---|
| OpenRouter (the primary model of a task) | claim extraction, paraphrase and evidence pointing, image reading, speech-to-text | one retry on 429/5xx/timeout, then `MODEL_FALLBACK` for that request; the report says coverage is reduced, and nothing the backup model points at can become `supported` |
| OpenRouter (primary and fallback both failing, or no key) | the same | lexical-only mode with a visible "reduced coverage" notice; captions or local Whisper for audio; a readable error for images |
| Dorar.net | scholars' gradings | «الحكم غير متاح حالياً»; `needs_review` unless the narration is in al-Bukhari/Muslim or HadeethEnc |
| QuranEnc.com | English translation of verses | the verse is shown without a translation |
| YouTube / TikTok | video input | readable error asking for a file upload or a pasted transcript |
| HadeethEnc API, Open-Hadith-Data | **build time only** | the running service is unaffected (local copies) |
| Tanzil | nothing at run time | text is in the repository |

Quran matching, hadith retrieval, the rules and the report need no network at all.

## Resource use (measured on the development machine, 3 Oct 2026)

- Memory: about 320 MB resident on the host (281 MiB inside the container) with every index loaded and after serving requests. Local Whisper
  (`small`) adds more than 1 GB and is for development machines only.
- Disk: image data ≈ 110 MB (hadith books index 85 MB, HadeethEnc 17 MB, Quran 2 MB); the whole
  image is 1.42 GB (Python, ffmpeg and the dependencies), built in about 5 minutes.
- Startup: indexes build in about 1 second.
- Latency in lexical-only mode: a pasted text with a verse, a narration and a request — 0.6 s end
  to end (first card under 0.1 s); a 3-minute YouTube clip with captions — about 3 s; the same
  length without captions, local Whisper `small` on CPU — about 57 s. Evaluation: 0.08–0.13 s per
  claim (Dorar answers cached after the first run).
- With the model: the extraction call takes about 3 s on a short text; a claim that needs the pointing call
  (a paraphrase, a ruling) takes 6–9 s more. Evaluation in full mode: 6.2 s per claim on average.

## Models (all through OpenRouter)

IDs and list prices were read from the live catalog (`GET /api/v1/models`) on 3 October 2026; costs
marked "measured" are what the API reported for the calls made that day. Reasons for each choice,
and what is still unmeasured, are in `DECISIONS.md` (items 33–48).

| Task | Model (`.env`) | List price per million tokens (in / out) | Cost | Latency |
|---|---|---|---|---|
| Claim extraction, level, pointing | `MODEL_EXTRACT=qwen/qwen3.8-flash` | $0.15 / $0.47 | measured: $0.0003 per short text ($0.0001 extraction, $0.0004 for each pointing call when one is needed) | measured: 3.3 s extraction; 6–9 s per pointing call |
| Image → text | `MODEL_VISION=qwen/qwen3.7-flash` | $0.03 / $0.13 | measured: $0.00006 per image | measured: 4–6 s |
| Speech → timestamped segments | `MODEL_AUDIO=google/gemini-3.5-flash-lite` | $0.30 / $2.50 (audio input $0.30) | measured: $0.0013 for 60 seconds — about $0.013 per 10 minutes | measured: 3.1 s for 60 seconds |
| Topic line, build-time chores | `MODEL_CHEAP=deepseek/deepseek-v4-flash` | $0.028 / $0.056 | measured: $0.00005–$0.0003 per call | measured: 7 s once, 124 s another time — fine for build-time work, not for anything a user waits on |
| Fallback | `MODEL_FALLBACK=nvidia/nemotron-3-super-120b-a12b:free` | free | $0 | measured: 7–8 s |
| Eval baseline only | `MODEL_BASELINE_LLM=openai/gpt-6.1-sol` | $2 / $10 | measured: $0.0016 per item, $0.14 per 79-item run | measured: 4.1 s |
| Sources | Tanzil, QuranEnc, HadeethEnc, Dorar, Open-Hadith-Data | free | | |
| Hosting | one shared-CPU machine, 1 GB, sleeps when idle | | a few dollars a month if it never sleeps | |

A typical verification (an article or a five-minute captioned clip) therefore costs well under a
tenth of a cent; a five-minute clip without captions adds about two thirds of a cent for the transcript. Verbatim verses and narrations cost nothing: they are decided before any model is called.

### Cost control

The whole project has a small OpenRouter budget (about 100 SAR, roughly 27 USD); $12 was added on
3 October and $0.34 of it has been used by everything described on this page. The defaults are
set for that: a 1 USD daily guard, cheap per-task models, free tests, and paid measurements that are
run once, on purpose, with small inputs.

- **Nothing spends by itself.** Model calls happen only when a verification is submitted or when a
  `models-*` / `test-llm` / `eval` target is run by hand. `pytest` and the screenshots (mock mode)
  make no model call.

- **Usage log**: every model call is written to `data/cache/usage.sqlite` — time, task, model, token
  counts, cost as reported by the API, latency, success, whether it was the fallback, and the error
  *type*. No prompt, no answer, no user text.
- **`GET /admin/usage`** (only when `DEV_MODE=true`; 404 otherwise) returns the totals per day, task
  and model.
- **Daily guard**: once the day's logged cost reaches `DAILY_SPEND_LIMIT_USD`, every call goes to
  `MODEL_FALLBACK` until midnight UTC, a warning is logged once, and reports carry the reduced-coverage
  notice. The log is a file: on a host without a persistent volume it restarts with the machine, so
  also set a credit limit on the OpenRouter key itself — the key used here is capped at $50, which is
  more than the budget: lower it in the OpenRouter dashboard to the amount you are willing to spend.
- **Output budgets** per task (`MAX_TOKENS` in `llm/openrouter.py`): extract 8000, pointing 1500,
  image 4000, audio 12000, cheap 800, baseline 1200. Reasoning tokens count against them. An answer
  cut off at its budget is not retried (it would be cut off again and paid for twice), and a
  pointing call never goes to the fallback model, whose answer would not be used.
- **No loops**: a request makes one extraction call, at most one pointing call per paraphrased
  narration or ruling, one retry and one fallback attempt per call — never more.
- **Prompt caching**: system prompts are byte-stable and sent first. An explicit cache breakpoint
  is added for Anthropic and Gemini models; other providers cache a repeated prefix themselves.
  Cached tokens are recorded in the usage log: in the bake-off 84% of the extraction model's prompt
  tokens (22.5k of 26.7k) were served from cache.

### What was measured, and what was left out on purpose

The first session ran on an account with no credit and many calls were refused (HTTP 402). After
credit was added (3 October 2026) these were run, once each, for $0.17 in total:

| Run | Result | Cost |
|---|---|---|
| `scripts/check_models.py` (`eval/results/model_check.md`) | all six configured models pass | $0.005 |
| Bake-off rows for the reasoning setting (20 items each) | extraction without reasoning + pointing with it: 85%, same as with reasoning everywhere, a third of the cost; without reasoning anywhere: 80% and one fabricated attribution | $0.009 |
| `scripts/transcribe_sample.py --seconds 60` | first transcript through OpenRouter, with timestamps | $0.0013 |
| `eval/run.py --runs 1` (79 items, three systems) | Tabayyun 88.6%, no fabricated attribution; baseline 77.2% | $0.17 ($0.14 of it the baseline) |

Left unmeasured because the answer would not change a decision at this budget (`make models-compare`
runs them, about $0.11): the other extraction candidates (on the 20 items only one is left that any
model could still gain — the two leaders already miss only that one and two rows that are artefacts
of the test set), the dearer image candidates (image input is not exposed yet, and the chosen model
is already the cheapest and never corrected a verse), and the other audio candidates. Claude
Sonnet 5.5 is not in that command either: about $0.17 to measure, and at $2 / $10 per million
tokens it would cost 16 times as much to run.

### Phase 2 features — cost and flags

| Feature | Flag | LLM calls | Extra cost |
|---|---|---|---|
| F3 verdict card (PNG) | `FEATURES_SHARE_CARD` | none | none: rendered in the browser; the server fallback draws it with Pillow in about 0.15 s |
| F4 copy the correct text | `FEATURES_COPY` | none | none: the text is assembled from the source record already retrieved |
| F1 image input | `FEATURES_IMAGE` | one vision call per image (`MODEL_VISION`) | measured: about $0.00005 per image, 4–14 s; the verification that follows is an ordinary text request |
| F2 «الثابت في الباب» | `FEATURES_ALTERNATIVES` | one short call without reasoning, only for a narration with no reference or a weak / rejected one | measured: about $0.0002 per such narration, 1–2 s |
| Report an error | `FEEDBACK_EMAIL` / `FEEDBACK_WHATSAPP` | none | none: composed in the browser, sent by the reader |
| F6 installable app, share target | — | none | none: a manifest and a service worker that caches the app shell only, never `/api/*` |
| F5 "why this verdict?" | `FEATURES_EXPLAIN` | none of its own (the classifier's one-line level reason rides on the existing extraction call, ≈ 30 output tokens per claim) | negligible |

`PUBLIC_URL` sets the address printed and QR-encoded on verdict cards; without it the card shows
the address the request came to.

## Privacy

- Inputs are processed in memory and streamed back; nothing about a request is written to a database.
- Uploaded media is written to a temporary file, transcribed, and deleted in a `finally` block.
- The disk cache stores responses **from sources** (Dorar, QuranEnc) keyed by SHA-256 digests; no
  user text is stored in readable form.
- The server keeps no history; the "last 10 verifications" list lives in the browser's
  `localStorage` and can be cleared there.
- No analytics, no third-party scripts, self-hosted fonts.
- No religious or personal attribute of the user is inferred or stored.
- Verdict cards carry no date, time, name or video link. The server-side card endpoint
  receives the card to draw, returns the image with `Cache-Control: no-store`, and keeps nothing.
- Disclosed data flows to third parties: the text being verified is sent to OpenRouter, which
  forwards it to the provider of the configured model; a quoted narration (its first words) is sent
  to Dorar's search; audio is sent the same way when `MODEL_AUDIO` transcribes it; a video URL is
  requested from its platform. The container runs with `--no-access-log`.
- The usage log (`data/cache/usage.sqlite`) holds call metadata and cost only — never content.
- Logs carry no user text: HTTP client loggers that print request URLs are silenced, and errors are
  logged by type and code location only (a test enforces this).

## Maintenance

- **Content review**: Sulaiman (Sharia reviewer) owns the approved-source list, the evidence rules
  and the test set. Every test row carries `reviewed_by_sulaiman`.
- **Data refresh**: rebuild the image to pull the current HadeethEnc collection; the Quran text
  changes only with a Tanzil release (`scripts/build_quran.py`).
- **Threshold changes** go through `eval/run.py` and are recorded in `METHODOLOGY.md`.
