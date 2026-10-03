"""Anthropic (Claude) provider — primary."""
from __future__ import annotations

import logging

import anthropic
from pydantic import ValidationError

from ..config import settings
from .base import LLMError, T

log = logging.getLogger("tabayyun.llm.anthropic")

# Models that accept output_config.effort (Haiku 4.5 rejects it).
_EFFORT_PREFIXES = ("claude-opus-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-5", "claude-sonnet-4-6", "claude-fable")
# Models whose safety classifiers can decline a request and that support server-side fallbacks.
_FALLBACK_PREFIXES = ("claude-opus-5", "claude-fable")
_FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicProvider:
    name = "anthropic"

    def __init__(self) -> None:
        self._client: anthropic.AsyncAnthropic | None = None
        self._server_fallback = settings.anthropic_server_fallback
        if settings.anthropic_api_key:
            self._client = anthropic.AsyncAnthropic(
                api_key=settings.anthropic_api_key,
                timeout=settings.llm_timeout_seconds,
                max_retries=settings.llm_max_retries,
            )

    @property
    def available(self) -> bool:
        return self._client is not None

    async def complete_json(self, *, system: str, user: str, schema: dict, model_cls: type[T], max_tokens: int = 8000) -> T:
        if self._client is None:
            raise LLMError("anthropic: no API key configured", cooldown=600)
        model = settings.anthropic_model
        output_config: dict = {"format": {"type": "json_schema", "schema": schema}}
        if model.startswith(_EFFORT_PREFIXES):
            output_config["effort"] = settings.anthropic_effort
        kwargs: dict = dict(
            model=model,
            max_tokens=max_tokens,
            # The system prompt is frozen text: cache it so repeated requests only pay for the content.
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            output_config=output_config,
        )
        use_fallback = self._server_fallback and model.startswith(_FALLBACK_PREFIXES)
        try:
            response = await self._create(kwargs, use_fallback)
        except anthropic.BadRequestError as e:
            if use_fallback and "fallback" in str(e).lower():
                # The account or SDK does not accept the server-side fallback beta: carry on without it.
                log.warning("server-side fallbacks rejected, disabling: %s", e)
                self._server_fallback = False
                try:
                    response = await self._create(kwargs, False)
                except anthropic.APIError as e2:
                    raise LLMError(f"anthropic: {type(e2).__name__}: {e2}") from e2
            else:
                raise LLMError(f"anthropic: bad request: {e}") from e
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as e:
            raise LLMError(f"anthropic: credentials rejected: {e}", cooldown=600) from e
        except anthropic.RateLimitError as e:
            raise LLMError(f"anthropic: rate limited: {e}", cooldown=30) from e
        except anthropic.APIStatusError as e:
            raise LLMError(f"anthropic: HTTP {e.status_code}: {e}", cooldown=30 if e.status_code >= 500 else 0) from e
        except anthropic.APIConnectionError as e:  # includes timeouts
            raise LLMError(f"anthropic: connection error: {e}", cooldown=30) from e

        if response.stop_reason == "refusal":
            raise LLMError("anthropic: request declined (refusal)")
        if response.stop_reason == "max_tokens":
            raise LLMError("anthropic: output truncated (max_tokens)")
        text = next((b.text for b in response.content if b.type == "text"), None)
        if not text:
            raise LLMError("anthropic: empty response")
        try:
            return model_cls.model_validate_json(text)
        except ValidationError as e:
            # count only: the validation message quotes the model's output, which quotes the user's text
            raise LLMError(f"anthropic: response failed validation ({e.error_count()} errors)") from e

    async def _create(self, kwargs: dict, use_fallback: bool):
        assert self._client is not None
        if use_fallback:
            return await self._client.beta.messages.create(**kwargs, betas=[_FALLBACK_BETA], fallbacks="default")
        return await self._client.messages.create(**kwargs)
