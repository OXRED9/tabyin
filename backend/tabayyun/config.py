"""Runtime configuration. Everything secret comes from the environment (.env locally)."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(REPO_ROOT / ".env"), env_file_encoding="utf-8", extra="ignore")

    data_dir: Path = REPO_ROOT / "data"
    frontend_dist: Path = REPO_ROOT / "frontend" / "dist"

    # --- Models: every call goes through OpenRouter with one key ---
    llm_provider: str = "openrouter"  # the only supported value
    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_app_url: str | None = None  # sent as HTTP-Referer; defaults to PUBLIC_URL
    openrouter_app_title: str = "Tabayyun"  # sent as X-Title
    # One model per task. IDs come from the live catalog (scripts/check_models.py lists and tests
    # them); they are set in .env / the deployment's environment, never guessed in code.
    model_extract: str = ""  # claim extraction, level classification, pointing at retrieved texts
    model_vision: str = ""  # reading text from images exactly as written
    model_audio: str = ""  # speech -> timestamped segments
    model_cheap: str = ""  # one-line topic summaries and build-time chores
    model_fallback: str = ""  # free/near-free, a different family from the primaries
    model_baseline_llm: str = ""  # the "general LLM without retrieval" baseline in eval/run.py
    llm_reasoning_effort: str = "low"  # for models that reason before answering; "" leaves the default
    llm_timeout_seconds: float = 60.0
    daily_spend_limit_usd: float = 10.0  # beyond this, every call uses MODEL_FALLBACK until midnight UTC

    # --- Embeddings (local, never via OpenRouter; used by the "authentic alternatives" feature) ---
    embedding_provider: str = "local"
    embedding_model: str = "intfloat/multilingual-e5-small"

    # --- Speech-to-text ---
    # "auto": platform captions -> MODEL_AUDIO via OpenRouter -> local faster-whisper (if installed)
    transcription_provider: str = "auto"
    local_whisper_model: str = "small"
    audio_chunk_seconds: int = 600  # longer recordings are split and their timestamps offset

    # --- Sources ---
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

    # --- Phase 2 feature flags (a feature that is not finished is switched off, not half-shipped) ---
    features_share_card: bool = True  # F3: shareable verdict card
    features_copy: bool = True  # F4: one-click copy of the correct text
    features_explain: bool = True  # F5: "why this verdict?" panel
    # Public base URL of this deployment, printed (and QR-encoded) on verdict cards.
    public_url: str | None = None

    # --- Optional demo content (no religious text is hard-coded; see /api/meta) ---
    example_video_url: str | None = None

    # --- Development ---
    dev_mode: bool = False  # enables /admin/usage (the per-call cost log summary)

    cors_origins: str = ""  # comma-separated; empty = same-origin only


settings = Settings()
