# Tabayyun — common tasks. `make help` lists them.
PY := backend/.venv/bin/python

.PHONY: help setup data api web test test-llm test-live eval testset audio-scripts build docker key models-check models-verify models-compare

help:            ## list tasks
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

setup:           ## create the backend virtualenv and install frontend packages
	cd backend && uv venv --python 3.11 .venv && uv pip install -e '.[dev]'
	cd frontend && npm install

data:            ## build/download the data files (Quran, HadeethEnc, hadith books index)
	$(PY) scripts/bootstrap_data.py

api:             ## run the API on :8765 with reload
	cd backend && .venv/bin/uvicorn tabayyun.main:app --reload --port 8765

web:             ## run the frontend dev server (proxies /api to :8765)
	cd frontend && npm run dev

test:            ## offline tests (deterministic, no network, no model calls)
	cd backend && .venv/bin/pytest -q

test-llm:        ## the 8 content-safety cases through the real model (paid: about half a cent)
	cd backend && .venv/bin/pytest -q -m llm

test-live:       ## tests that call the live sources
	cd backend && .venv/bin/pytest -q -m network

testset:         ## rebuild eval/testset/claims.jsonl from the sources
	$(PY) eval/build_testset.py

eval:            ## three-system comparison, 3 runs; updates eval/results and the README block
	$(PY) eval/run.py --runs 3

key:             ## prompt for the OpenRouter key (not echoed), validate it, write it to .env
	$(PY) scripts/set_openrouter_key.py

models-check:    ## one tiny Arabic test per configured model: latency, cost, pass/fail (about 1 cent)
	$(PY) scripts/check_models.py

# Paid measurements. Run by hand, once, when a model or a prompt changes; amounts are what the
# same runs cost on 3 Oct 2026.
models-verify:   ## model check, one 60-second transcription, the three-system evaluation once (about $0.17)
	$(PY) scripts/check_models.py
	$(PY) scripts/transcribe_sample.py --seconds 60
	$(PY) eval/run.py --runs 1 --concurrency 4

AUDIO_CANDIDATES := google/gemini-3.5-flash-lite,google/gemini-3.1-flash-lite,qwen/qwen3.8-omni-flash,xiaomi/mimo-v2.6-flash
OCR_RERUN := google/gemini-3.5-flash-lite,google/gemini-3.1-flash-lite,qwen/qwen3.8-flash,z-ai/glm-5.3-flash

models-compare:  ## optional comparisons that were left unmeasured on purpose (about $0.11) — see docs/DECISIONS.md
	$(PY) eval/bakeoff_extract.py --concurrency 4 --models "google/gemini-3.8-flash,qwen/qwen3.7-plus,deepseek/deepseek-v4-pro-0813"
	$(PY) eval/ocr_exactness.py --concurrency 2 --models "$(OCR_RERUN)"
	$(PY) scripts/check_models.py --only audio --audio "$(AUDIO_CANDIDATES)" --write eval/results/model_check_audio.md

build:           ## production build of the frontend into frontend/dist (served by the API)
	cd frontend && npm run build

docker:          ## build and run the single container on :8080
	docker compose up --build
