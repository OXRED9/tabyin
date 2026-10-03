"""OpenAI provider — fallback when the primary provider fails."""
from __future__ import annotations

import openai
from pydantic import ValidationError

from ..config import settings
from .base import LLMError, T


class OpenAIProvider:
    name = "openai"

    def __init__(self) -> None:
        self._client: openai.AsyncOpenAI | None = None
        if settings.openai_api_key:
            self._client = openai.AsyncOpenAI(
                api_key=settings.openai_api_key,
                timeout=settings.llm_timeout_seconds,
                max_retries=settings.llm_max_retries,
            )

    @property
    def available(self) -> bool:
        return self._client is not None

    async def complete_json(self, *, system: str, user: str, schema: dict, model_cls: type[T], max_tokens: int = 8000) -> T:
        if self._client is None:
            raise LLMError("openai: no API key configured")
        try:
            response = await self._client.chat.completions.create(
                model=settings.openai_model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                response_format={"type": "json_schema", "json_schema": {"name": "result", "schema": schema, "strict": True}},
                max_completion_tokens=max_tokens,
            )
        except openai.APIError as e:
            raise LLMError(f"openai: {type(e).__name__}: {e}") from e
        choice = response.choices[0]
        if getattr(choice.message, "refusal", None):
            raise LLMError("openai: request declined (refusal)")
        if choice.finish_reason == "length":
            raise LLMError("openai: output truncated")
        try:
            return model_cls.model_validate_json(choice.message.content or "")
        except ValidationError as e:
            raise LLMError(f"openai: response failed validation: {e}") from e
