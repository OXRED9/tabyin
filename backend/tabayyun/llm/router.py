"""Failover across providers: Anthropic -> OpenAI -> (caller falls back to lexical-only mode)."""
from __future__ import annotations

import logging
import time
from functools import lru_cache

from .anthropic_provider import AnthropicProvider
from .base import LLMError, LLMProvider, T
from .openai_provider import OpenAIProvider

log = logging.getLogger("tabayyun.llm")


class LLMRouter:
    def __init__(self, providers: list[LLMProvider] | None = None) -> None:
        self.providers: list[LLMProvider] = providers if providers is not None else [AnthropicProvider(), OpenAIProvider()]
        self._down_until: dict[str, float] = {}
        self.last_provider: str | None = None

    @property
    def available(self) -> bool:
        return any(p.available for p in self.providers)

    def status(self) -> dict[str, bool]:
        return {p.name: p.available for p in self.providers}

    async def complete_json(self, *, system: str, user: str, schema: dict, model_cls: type[T], max_tokens: int = 8000) -> T:
        errors: list[str] = []
        now = time.monotonic()
        for p in self.providers:
            if not p.available:
                continue
            if self._down_until.get(p.name, 0) > now:
                errors.append(f"{p.name}: cooling down after a recent failure")
                continue
            try:
                result = await p.complete_json(system=system, user=user, schema=schema, model_cls=model_cls, max_tokens=max_tokens)
                self.last_provider = p.name
                return result
            except LLMError as e:
                log.warning("LLM provider failed, trying next: %s", e)
                errors.append(str(e))
                if e.cooldown:
                    self._down_until[p.name] = time.monotonic() + e.cooldown
        raise LLMError("; ".join(errors) or "no LLM provider configured")


@lru_cache(maxsize=1)
def get_llm() -> LLMRouter:
    return LLMRouter()
