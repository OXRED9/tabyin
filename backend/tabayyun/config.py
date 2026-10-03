"""Runtime configuration. Everything secret comes from the environment (.env locally)."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(REPO_ROOT / ".env"), env_file_encoding="utf-8", extra="ignore")

    data_dir: Path = REPO_ROOT / "data"
    frontend_dist: Path = REPO_ROOT / "frontend" / "dist"

    # --- LLM providers (Anthropic primary, OpenAI fallback) ---
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5"
    anthropic_effort: str = "medium"  # low | medium | high — depth vs. latency for extraction
    anthropic_server_fallback: bool = True  # re-run a classifier-declined request on Anthropic's recommended fallback model
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    llm_timeout_seconds: float = 40.0
    llm_max_retries: int = 2

    # --- Speech-to-text ---
    # "auto": platform captions -> cloud (if a key is set) -> local faster-whisper (if installed)
    transcription_provider: str = "auto"
    openai_transcribe_model: str = "whisper-1"
    local_whisper_model: str = "small"

    # --- Retrieval ---
    embeddings_provider: str = "none"  # "none" | "local" (fastembed, optional extra)
    embeddings_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    dorar_enabled: bool = True
    http_timeout_seconds: float = 12.0
    user_agent: str = "Tabayyun/0.1 (Islamic text verification tool)"

    # --- Limits ---
    max_text_chars: int = 60_000
    max_upload_mb: int = 50
    max_media_minutes: int = 30
    max_claims: int = 60
    # Abuse guard for a public demo that spends on paid APIs: per-address requests per window.
    rate_limit_requests: int = 30
    rate_limit_window_seconds: int = 600

    # --- Optional demo content (no religious text is hard-coded; see /api/meta) ---
    example_video_url: str | None = None

    cors_origins: str = ""  # comma-separated; empty = same-origin only


settings = Settings()
