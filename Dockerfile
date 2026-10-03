# Tabayyun — single image: FastAPI backend + built frontend + data indexes.
# Build:  docker build -t tabayyun .
# Run:    docker run --env-file .env -p 8080:8080 tabayyun

# ---- 1) frontend ---------------------------------------------------------------------------
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2) python deps + data -----------------------------------------------------------------
FROM python:3.11-slim AS runtime
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/tabayyun backend/tabayyun
RUN pip install ./backend

# Data: the Quran text is in the repo; HadeethEnc is downloaded from its public API and the hadith
# books index is built from Open-Hadith-Data. Both steps are cached as image layers.
COPY data/quran.json data/quran.json
COPY data/raw/tanzil data/raw/tanzil
COPY scripts scripts
RUN python scripts/bootstrap_data.py && rm -rf data/raw/open-hadith-data

COPY --from=frontend /app/frontend/dist frontend/dist

RUN useradd --create-home --uid 10001 tabayyun && mkdir -p data/cache && chown -R tabayyun data/cache
USER tabayyun
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import os,urllib.request;urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8080\")}/health',timeout=4)"
# `pip install ./backend` puts the package in site-packages; data and frontend paths come from env.
ENV DATA_DIR=/app/data FRONTEND_DIST=/app/frontend/dist
CMD ["sh", "-c", "uvicorn tabayyun.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --no-access-log"]
