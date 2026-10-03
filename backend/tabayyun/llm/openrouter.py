"""The only model provider: OpenRouter, through one OpenAI-compatible client and one API key.

Text, vision and audio calls all go to ``POST {OPENROUTER_BASE_URL}/chat/completions``. Each task
has its own model (MODEL_* in .env). Failure handling, per request:

    primary model -> one retry on 429 / 5xx / timeout -> MODEL_FALLBACK (flagged for the UI) -> LLMError

After LLMError the caller degrades (lexical-only verification, or a readable error for OCR/audio).
Every call is logged to the usage table with its cost (never its content), and a daily spend guard
switches everything to the fallback model once DAILY_SPEND_LIMIT_USD is reached.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import time
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import openai
from pydantic import ValidationError

from ..config import settings
from .base import LLMError, T
from .catalog import model_info
from .usage import get_usage_log

log = logging.getLogger("tabayyun.llm")

# Output budgets per task: enough for the job, small enough that a runaway answer cannot cost much.
# Reasoning tokens count against the budget, which is why "judge" (a two-field answer) is not smaller:
# measured answers needed up to 460 tokens; the one that ran away did so at 1200 and at 2500 alike,
# so a larger budget only makes the runaway dearer.
MAX_TOKENS = {"extract": 8000, "judge": 1500, "vision": 4000, "audio": 12000, "cheap": 800, "baseline": 1200}
TIMEOUT_SECONDS = {"audio": 240.0, "vision": 90.0}
_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)
_RETRYABLE = (openai.RateLimitError, openai.APITimeoutError, openai.APIConnectionError, openai.InternalServerError)


@dataclass
class CallInfo:
    """What happened in one call. Kept for the usage log and for scripts; holds no content."""

    task: str
    model: str
    ok: bool = False
    fallback: bool = False
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    error: str | None = None


@dataclass
class LLMSession:
    """Per-request view of the client: remembers whether this request had to use the fallback."""

    llm: "OpenRouterLLM"
    fallback_used: bool = False
    last_call_fallback: bool = False  # the most recent answer came from the fallback model
    spend_guard: bool = False
    models_used: list[str] = field(default_factory=list)
    calls: list[CallInfo] = field(default_factory=list)

    @property
    def available(self) -> bool:
        return self.llm.available

    async def complete_json(self, *, task: str, system: str, user: Any, schema: dict, model_cls: type[T], max_tokens: int | None = None, model: str | None = None, use_fallback: bool = True) -> T:
        try:
            result, infos = await self.llm.complete_json(task=task, system=system, user=user, schema=schema, model_cls=model_cls, max_tokens=max_tokens, model=model, use_fallback=use_fallback)
        except LLMError as e:
            self.calls += e.calls
            raise
        self.calls += infos
        final = infos[-1]
        if final.model not in self.models_used:
            self.models_used.append(final.model)
        self.fallback_used = self.fallback_used or final.fallback
        self.last_call_fallback = final.fallback
        self.spend_guard = self.spend_guard or self.llm.spend_guard_active()
        return result


class OpenRouterLLM:
    def __init__(self) -> None:
        self._client: openai.AsyncOpenAI | None = None
        if settings.openrouter_api_key:
            headers = {"X-Title": settings.openrouter_app_title}
            referer = settings.openrouter_app_url or settings.public_url
            if referer:
                headers["HTTP-Referer"] = referer
            self._client = openai.AsyncOpenAI(
                api_key=settings.openrouter_api_key,
                base_url=settings.openrouter_base_url,
                timeout=settings.llm_timeout_seconds,
                max_retries=0,  # retry and failover are handled here, explicitly
                default_headers=headers,
            )
        self._guard_warned = False

    # ------------------------------------------------------------------ configuration

    @property
    def available(self) -> bool:
        """A key and an extraction model are configured (the minimum for full mode)."""
        return self._client is not None and bool(settings.model_extract)

    def model_for(self, task: str) -> str:
        return {
            "extract": settings.model_extract,
            "judge": settings.model_extract,
            "vision": settings.model_vision,
            "audio": settings.model_audio,
            "cheap": settings.model_cheap or settings.model_extract,
            "baseline": settings.model_baseline_llm,
        }[task]

    def can(self, task: str) -> bool:
        return self._client is not None and bool(self.model_for(task))

    def status(self) -> dict:
        return {
            "provider": "openrouter",
            "configured": self._client is not None,
            "models": {t: self.model_for(t) or None for t in ("extract", "vision", "audio", "cheap", "baseline")} | {"fallback": settings.model_fallback or None},
            "spend_guard_active": self.spend_guard_active(),
        }

    def session(self) -> LLMSession:
        return LLMSession(self)

    def spend_guard_active(self) -> bool:
        limit = settings.daily_spend_limit_usd
        return limit > 0 and get_usage_log().spent_today() >= limit

    # ------------------------------------------------------------------ the call

    def _request(self, model: str, task: str, system: str, user: Any, schema: dict, max_tokens: int) -> dict:
        info = model_info(model)
        strict = bool(info and info.supports("structured_outputs"))
        json_mode = bool(info and info.supports("response_format"))
        system_text = system
        if not strict:  # the schema then travels in the prompt, and the answer is validated here
            system_text += "\n\nReply with one JSON object only, no prose and no code fences, matching this JSON Schema:\n" + json.dumps(schema, ensure_ascii=False)
        # Explicit cache breakpoint where the provider needs one (Anthropic, Gemini); OpenAI- and
        # DeepSeek-style providers cache a repeated prefix automatically.
        system_content: Any = system_text
        if model.startswith(("anthropic/", "google/")):
            system_content = [{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}]
        body: dict = {
            "model": model,
            "messages": [{"role": "system", "content": system_content}, {"role": "user", "content": user}],
            "max_tokens": max_tokens,
            "extra_body": {"usage": {"include": True}},
        }
        if strict:
            body["response_format"] = {"type": "json_schema", "json_schema": {"name": "result", "strict": True, "schema": schema}}
            body["extra_body"]["provider"] = {"require_parameters": True}  # only providers that honour the schema
        elif json_mode:
            body["response_format"] = {"type": "json_object"}
        if info is None or info.supports("temperature"):
            body["temperature"] = 0
        # Per task, as measured: extraction and pointing have their own settings; the other tasks keep
        # "low" (some endpoints, e.g. the audio model's, reject a request that switches reasoning off).
        effort = {"extract": settings.llm_reasoning_effort, "judge": settings.llm_reasoning_effort_judge}.get(task, "low")
        if info and info.supports("reasoning") and effort:
            body["extra_body"]["reasoning"] = {"effort": effort, "exclude": True}
        return body

    async def _once(self, model: str, task: str, system: str, user: Any, schema: dict, model_cls: type[T], max_tokens: int, fallback: bool) -> tuple[T | None, CallInfo, Exception | None]:
        assert self._client is not None
        info = CallInfo(task=task, model=model, fallback=fallback)
        started = time.perf_counter()
        error: Exception | None = None
        parsed: T | None = None
        try:
            body = self._request(model, task, system, user, schema, max_tokens)
            response = await self._client.chat.completions.create(**body, timeout=TIMEOUT_SECONDS.get(task, settings.llm_timeout_seconds))
            usage = response.usage
            if usage is not None:
                info.prompt_tokens = usage.prompt_tokens or 0
                info.completion_tokens = usage.completion_tokens or 0
                details = getattr(usage, "prompt_tokens_details", None)
                info.cached_tokens = int(getattr(details, "cached_tokens", 0) or 0)
                cost = (usage.model_extra or {}).get("cost")
                catalog = model_info(model)
                info.cost_usd = float(cost) if cost is not None else (catalog.cost(info.prompt_tokens, info.completion_tokens) if catalog else 0.0)
            choices = response.choices or []
            if not choices:
                raise ValueError("no choices in the response")
            choice = choices[0]
            if getattr(choice.message, "refusal", None):
                raise ValueError("the model declined the request")
            if choice.finish_reason == "length":
                raise ValueError("output truncated at max_tokens")
            text = _FENCE.sub("", (choice.message.content or "").strip())
            if not text:
                raise ValueError("empty response")
            parsed = model_cls.model_validate_json(text)
            info.ok = True
        except ValidationError as e:
            # count only: the validation message quotes the model's output, which quotes the user's text
            error = ValueError(f"response failed validation ({e.error_count()} errors)")
        except openai.APIStatusError as e:
            error = e
        except (openai.APIError, ValueError) as e:
            error = e
        info.latency_ms = int((time.perf_counter() - started) * 1000)
        if error is not None:
            status = getattr(error, "status_code", None)
            info.error = f"{type(error).__name__}" + (f" {status}" if status else "") + (f": {error}" if isinstance(error, ValueError) else "")
        get_usage_log().record(
            task=task, model=model, prompt_tokens=info.prompt_tokens, completion_tokens=info.completion_tokens, cached_tokens=info.cached_tokens,
            cost_usd=info.cost_usd, latency_ms=info.latency_ms, ok=info.ok, fallback=fallback, error=info.error,
        )  # fmt: skip
        return parsed, info, error

    async def complete_json(self, *, task: str, system: str, user: Any, schema: dict, model_cls: type[T], max_tokens: int | None = None, model: str | None = None, use_fallback: bool = True) -> tuple[T, list[CallInfo]]:
        """Returns (validated result, the calls made). Raises LLMError when primary and fallback both fail.
        ``use_fallback=False`` is for answers that are only honoured from the primary model (pointing)."""
        if self._client is None:
            raise LLMError("no OpenRouter API key configured")
        budget = max_tokens or MAX_TOKENS[task]
        primary = model or self.model_for(task)
        fallback_model = settings.model_fallback
        infos: list[CallInfo] = []

        guard = self.spend_guard_active()
        if guard:
            if not self._guard_warned:
                log.warning("daily spend limit of $%.2f reached: using the fallback model for the rest of the day", settings.daily_spend_limit_usd)
                self._guard_warned = True
            primary = ""  # go straight to the fallback

        if primary:
            for attempt in (1, 2):
                parsed, info, error = await self._once(primary, task, system, user, schema, model_cls, budget, fallback=False)
                infos.append(info)
                if parsed is not None:
                    return parsed, infos
                # An answer cut off at the output budget is not retried: the same request runs to the
                # same length again and is paid for twice (seen in the bake-off: 2 x 41 s, 2 x $0.0013).
                truncated = isinstance(error, ValueError) and "truncated" in str(error)
                retry = attempt == 1 and not truncated and (isinstance(error, _RETRYABLE) or isinstance(error, ValueError))
                log.warning("model call failed (task=%s model=%s attempt=%d): %s", task, primary, attempt, info.error)
                if not retry:
                    break

        if use_fallback and fallback_model and fallback_model != primary and self._fallback_fits(fallback_model, task):
            parsed, info, _error = await self._once(fallback_model, task, system, user, schema, model_cls, budget, fallback=True)
            infos.append(info)
            if parsed is not None:
                log.warning("task=%s served by the fallback model %s", task, fallback_model)
                return parsed, infos
            log.warning("fallback model failed (task=%s model=%s): %s", task, fallback_model, info.error)
        raise LLMError("; ".join(f"{i.model}: {i.error}" for i in infos) or f"no model configured for task '{task}'", calls=infos)

    @staticmethod
    def _fallback_fits(model: str, task: str) -> bool:
        """The fallback is only tried for a task whose input it can read (image, audio)."""
        need = {"vision": "image", "audio": "audio"}.get(task)
        if need is None:
            return True
        info = model_info(model)
        return bool(info and info.accepts(need))


# ---------------------------------------------------------------------- content helpers


def image_part(data: bytes, mime: str = "image/png") -> dict:
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"}}


def audio_part(data: bytes, fmt: str = "mp3") -> dict:
    return {"type": "input_audio", "input_audio": {"data": base64.b64encode(data).decode("ascii"), "format": fmt}}


def text_part(text: str) -> dict:
    return {"type": "text", "text": text}


@lru_cache(maxsize=1)
def get_llm() -> OpenRouterLLM:
    return OpenRouterLLM()
