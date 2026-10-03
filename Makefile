# Tabayyun — common tasks. `make help` lists them.
PY := backend/.venv/bin/python

.PHONY: help setup data api web test test-live eval testset audio-scripts build docker

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

test:            ## offline tests (deterministic, no network, no LLM)
	cd backend && .venv/bin/pytest -q -m "not network"

test-live:       ## tests that call the live sources
	cd backend && .venv/bin/pytest -q -m network

testset:         ## rebuild eval/testset/claims.jsonl from the sources
	$(PY) eval/build_testset.py

eval:            ## three-system comparison, 3 runs; updates eval/results and the README block
	$(PY) eval/run.py --runs 3

audio-scripts:   ## 20 reading scripts for the audio test
	$(PY) eval/make_audio_scripts.py

build:           ## production build of the frontend into frontend/dist (served by the API)
	cd frontend && npm run build

docker:          ## build and run the single container on :8080
	docker compose up --build
