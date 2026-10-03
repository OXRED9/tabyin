"""The live OpenRouter model catalog (GET /api/v1/models): IDs, prices, modalities, parameters.

Model IDs and prices are never hard-coded in the code base: selection scripts and the runtime both
read them from here. The catalog endpoint is public, so this works without a key.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass

import httpx

from ..config import settings

_TTL_SECONDS = 24 * 3600
_memory: tuple[float, dict[str, "ModelInfo"]] | None = None


@dataclass(frozen=True)
class ModelInfo:
    id: str
    name: str
    family: str
    input_modalities: tuple[str, ...]
    supported_parameters: tuple[str, ...]
    context_length: int
    prompt_usd_per_mtok: float
    completion_usd_per_mtok: float
    audio_usd_per_mtok: float | None
    created: int

    def supports(self, parameter: str) -> bool:
        return parameter in self.supported_parameters

    def accepts(self, modality: str) -> bool:
        return modality in self.input_modalities

    @property
    def is_free(self) -> bool:
        return self.prompt_usd_per_mtok == 0 and self.completion_usd_per_mtok == 0

    def cost(self, prompt_tokens: int, completion_tokens: int) -> float:
        """List-price estimate; the logged cost of a real call comes from the response's usage."""
        return (prompt_tokens * self.prompt_usd_per_mtok + completion_tokens * self.completion_usd_per_mtok) / 1e6


def _parse(raw: dict) -> dict[str, ModelInfo]:
    out: dict[str, ModelInfo] = {}
    for m in raw.get("data", []):
        pricing = m.get("pricing") or {}
        try:
            prompt = float(pricing.get("prompt") or 0) * 1e6
            completion = float(pricing.get("completion") or 0) * 1e6
            audio = float(pricing["audio"]) * 1e6 if pricing.get("audio") not in (None, "", "0") else None
        except (TypeError, ValueError):
            continue
        if prompt < 0 or completion < 0:  # router pseudo-models advertise negative prices
            continue
        arch = m.get("architecture") or {}
        out[m["id"]] = ModelInfo(
            id=m["id"],
            name=m.get("name") or m["id"],
            family=m["id"].split("/")[0].lstrip("~"),
            input_modalities=tuple(arch.get("input_modalities") or ("text",)),
            supported_parameters=tuple(m.get("supported_parameters") or ()),
            context_length=int(m.get("context_length") or 0),
            prompt_usd_per_mtok=prompt,
            completion_usd_per_mtok=completion,
            audio_usd_per_mtok=audio,
            created=int(m.get("created") or 0),
        )
    return out


def load_catalog(*, refresh: bool = False) -> dict[str, ModelInfo]:
    """Catalog keyed by model id: memory -> disk cache (24 h) -> network. Empty dict if unreachable."""
    global _memory
    now = time.time()
    if _memory and not refresh and now - _memory[0] < _TTL_SECONDS:
        return _memory[1]
    path = settings.data_dir / "cache" / "openrouter_models.json"
    if not refresh and path.exists() and now - path.stat().st_mtime < _TTL_SECONDS:
        try:
            _memory = (path.stat().st_mtime, _parse(json.loads(path.read_text(encoding="utf-8"))))
            return _memory[1]
        except (ValueError, OSError):
            pass
    try:
        r = httpx.get(f"{settings.openrouter_base_url.rstrip('/')}/models", timeout=30, headers={"User-Agent": settings.user_agent})
        r.raise_for_status()
        raw = r.json()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(raw), encoding="utf-8")
        _memory = (now, _parse(raw))
    except (httpx.HTTPError, ValueError, OSError):
        if path.exists():  # a stale copy beats none
            try:
                _memory = (now, _parse(json.loads(path.read_text(encoding="utf-8"))))
            except (ValueError, OSError):
                _memory = (now, {})
        else:
            _memory = (now, {})
    return _memory[1]


def model_info(model_id: str) -> ModelInfo | None:
    return load_catalog().get(model_id) if model_id else None
