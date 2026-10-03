# Operations

## Run it

### Docker (one command after the env file)

```bash
cp .env.example .env        # optional: add ANTHROPIC_API_KEY / OPENAI_API_KEY
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

Tests: `cd backend && .venv/bin/pytest -q -m "not network"` (offline, deterministic) and
`-m network` for the live-source tests. Evaluation: `backend/.venv/bin/python eval/run.py`.

## Configuration (`.env`, documented in `.env.example`)

| Variable | Default | Effect |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | primary LLM. Without any key the app runs in lexical-only mode. |
| `ANTHROPIC_MODEL` | `claude-opus-5` | any Claude model id (`claude-sonnet-5`, `claude-haiku-4-5` cost less) |
| `ANTHROPIC_EFFORT` | `medium` | reasoning depth vs latency for extraction |
| `OPENAI_API_KEY` | — | fallback LLM, and cloud speech-to-text |
| `TRANSCRIPTION_PROVIDER` | `auto` | captions → OpenAI transcription → local faster-whisper (if installed) |
| `DORAR_ENABLED` | `true` | live gradings from Dorar |
| `MAX_TEXT_CHARS` / `MAX_UPLOAD_MB` / `MAX_MEDIA_MINUTES` | 60000 / 50 / 30 | input limits |
| `EXAMPLE_VIDEO_URL` | — | the YouTube example on the first screen (hidden when empty) |
| `CORS_ORIGINS` | — | only needed if the frontend is hosted on another origin |

## Deploy

One container serves the API and the built frontend.

- **Render**: `render.yaml` is a Blueprint for a Docker web service with `/health` as the health
  check. Create the service from the repository and enter the API keys in the dashboard.
- **Fly.io**: `fly launch --dockerfile Dockerfile` then `fly secrets set ANTHROPIC_API_KEY=…`;
  internal port 8080.
- **Any Docker host**: `docker run --env-file .env -p 8080:8080 tabayyun`.
- **Keep-alive**: `.github/workflows/keepalive.yml` requests `/health` every 10 minutes once the
  repository variable `TABAYYUN_URL` is set. `.github/workflows/tests.yml` runs the offline tests.

`GET /health` reports the mode (`full` / `lexical_only`), which providers are configured, index
sizes and whether Dorar was reachable on the last call.

## Dependencies and what happens when each fails

| Dependency | Needed for | If it is down |
|---|---|---|
| Anthropic API | claim extraction, paraphrase and evidence pointing | automatic failover to OpenAI |
| OpenAI API | LLM fallback; speech-to-text | lexical-only mode with a visible "reduced coverage" notice; captions or local Whisper for audio |
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
- LLM latency has not been measured (no key was available); see `LIMITATIONS.md`.

## Cost estimate

These are estimates from list prices, **not measurements** — no paid call has been made yet.

| Item | Assumption | Estimate |
|---|---|---|
| Claim extraction, per document | ≈ 4k input + 2k output tokens | Claude Opus 5 ($5/$25 per MTok): ≈ $0.07 · Claude Sonnet 5 ($2/$10): ≈ $0.03 · Claude Haiku 4.5 ($1/$5): ≈ $0.014 |
| Pointing call, per paraphrased narration or ruling | ≈ 2k input + 0.2k output | Opus 5: ≈ $0.015 |
| Speech-to-text | OpenAI `whisper-1`, $0.006 per minute | 5-minute clip: $0.03 (zero when the platform has captions) |
| Sources | Tanzil, QuranEnc, HadeethEnc, Dorar, Open-Hadith-Data | free |
| Hosting | one small container (512 MB) | free tier for the demo; a few dollars a month for an always-on instance |

A typical verification (one article or a five-minute clip) therefore costs a few cents with the
default model and about one cent with a smaller one. Verbatim verses and narrations cost nothing:
they are decided before any model is called.

## Privacy

- Inputs are processed in memory and streamed back; nothing about a request is written to a database.
- Uploaded media is written to a temporary file, transcribed, and deleted in a `finally` block.
- The disk cache stores responses **from sources** (Dorar, QuranEnc) keyed by SHA-256 digests; no
  user text is stored in readable form.
- The server keeps no history; the "last 10 verifications" list lives in the browser's
  `localStorage` and can be cleared there.
- No analytics, no third-party scripts, self-hosted fonts.
- No religious or personal attribute of the user is inferred or stored.
- Disclosed data flows to third parties: the text being verified is sent to the configured LLM
  provider; a quoted narration (its first words) is sent to Dorar's search; audio is sent to the
  speech-to-text provider when cloud transcription is used; a video URL is requested from its
  platform. The container runs with `--no-access-log`.
- Logs carry no user text: HTTP client loggers that print request URLs are silenced, and errors are
  logged by type and code location only (a test enforces this).

## Maintenance

- **Content review**: Sulaiman (Sharia reviewer) owns the approved-source list, the evidence rules
  and the test set. Every test row carries `reviewed_by_sulaiman`.
- **Data refresh**: rebuild the image to pull the current HadeethEnc collection; the Quran text
  changes only with a Tanzil release (`scripts/build_quran.py`).
- **Threshold changes** go through `eval/run.py` and are recorded in `METHODOLOGY.md`.
- **Reviewer mode** in the UI records a human decision next to the automatic one in the exported
  report; that is the operational path for correcting the tool.
