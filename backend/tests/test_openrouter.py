"""The OpenRouter client: request shape, retry -> fallback -> error, usage log, spend guard.

The OpenAI-compatible SDK client is replaced by a scripted fake; no network, no key.
"""
import asyncio
import sqlite3
from types import SimpleNamespace

import httpx
import openai
import pytest
from pydantic import BaseModel

from tabayyun.config import settings
from tabayyun.llm import catalog, openrouter, usage
from tabayyun.llm.base import LLMError
from tabayyun.llm.catalog import ModelInfo

SCHEMA = {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"], "additionalProperties": False}


class Answer(BaseModel):
    answer: str


def info(model_id, *, structured=True, modalities=("text",), prompt=1.0, completion=2.0):
    params = ["max_tokens", "temperature", "response_format"] + (["structured_outputs"] if structured else [])
    return ModelInfo(model_id, model_id, model_id.split("/")[0], tuple(modalities), tuple(params), 100_000, prompt, completion, None, 0)


def reply(content='{"answer": "ok"}', cost=0.0012, finish="stop"):
    usage_obj = SimpleNamespace(prompt_tokens=120, completion_tokens=30, prompt_tokens_details=SimpleNamespace(cached_tokens=100), model_extra={"cost": cost})
    return SimpleNamespace(usage=usage_obj, choices=[SimpleNamespace(message=SimpleNamespace(content=content, refusal=None), finish_reason=finish)])


def http_error(cls, status):
    request = httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
    return cls("boom", response=httpx.Response(status, request=request), body=None)


class FakeCompletions:
    def __init__(self, script):
        self.script = list(script)
        self.requests: list[dict] = []

    async def create(self, **kwargs):
        self.requests.append(kwargs)
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


@pytest.fixture()
def llm(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "openrouter_api_key", "sk-or-test")
    monkeypatch.setattr(settings, "openrouter_app_url", "https://tabayyun.example.org")
    monkeypatch.setattr(settings, "model_extract", "alpha/primary")
    monkeypatch.setattr(settings, "model_vision", "alpha/vision")
    monkeypatch.setattr(settings, "model_fallback", "beta/backup:free")
    monkeypatch.setattr(settings, "daily_spend_limit_usd", 10.0)
    models = {
        "alpha/primary": info("alpha/primary"),
        "alpha/vision": info("alpha/vision", modalities=("text", "image")),
        "beta/backup:free": info("beta/backup:free", structured=False, prompt=0.0, completion=0.0),
    }
    monkeypatch.setattr(openrouter, "model_info", lambda mid: models.get(mid))
    client = openrouter.OpenRouterLLM()

    def script(*items):
        fake = FakeCompletions(items)
        client._client = SimpleNamespace(chat=SimpleNamespace(completions=fake))
        return fake

    client.script = script
    return client


def call(llm, task="extract", **kw):
    return asyncio.run(llm.complete_json(task=task, system="SYSTEM", user="USER TEXT", schema=SCHEMA, model_cls=Answer, **kw))


def test_headers_identify_the_app(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "sk-or-test")
    monkeypatch.setattr(settings, "openrouter_app_url", "https://tabayyun.example.org")
    client = openrouter.OpenRouterLLM()._client
    assert str(client.base_url).startswith("https://openrouter.ai/api/v1")
    assert client.default_headers["HTTP-Referer"] == "https://tabayyun.example.org" and client.default_headers["X-Title"] == "Tabayyun"


def test_request_uses_strict_schema_asks_for_cost_and_caps_output(llm):
    fake = llm.script(reply())
    result, infos = call(llm)
    assert result.answer == "ok" and len(infos) == 1 and infos[0].ok and not infos[0].fallback
    req = fake.requests[0]
    assert req["model"] == "alpha/primary" and req["max_tokens"] == openrouter.MAX_TOKENS["extract"] and req["temperature"] == 0
    assert req["response_format"]["type"] == "json_schema" and req["response_format"]["json_schema"]["strict"] is True
    assert req["extra_body"]["usage"] == {"include": True} and req["extra_body"]["provider"] == {"require_parameters": True}
    assert infos[0].cost_usd == 0.0012 and infos[0].cached_tokens == 100  # cost comes from the response's usage


def test_one_retry_on_rate_limit_then_success_without_fallback(llm):
    fake = llm.script(http_error(openai.RateLimitError, 429), reply())
    _result, infos = call(llm)
    assert [i.model for i in infos] == ["alpha/primary", "alpha/primary"] and [i.ok for i in infos] == [False, True]
    assert not infos[-1].fallback and len(fake.requests) == 2


def test_two_failures_switch_to_the_fallback_and_flag_it(llm):
    fake = llm.script(http_error(openai.InternalServerError, 503), http_error(openai.InternalServerError, 503), reply(cost=0.0))
    session = llm.session()
    result = asyncio.run(session.complete_json(task="extract", system="S", user="U", schema=SCHEMA, model_cls=Answer))
    assert result.answer == "ok" and session.fallback_used and session.models_used == ["beta/backup:free"]
    assert [r["model"] for r in fake.requests] == ["alpha/primary", "alpha/primary", "beta/backup:free"]
    # the fallback has no strict structured outputs: the schema travels in the prompt instead
    assert "JSON Schema" in fake.requests[2]["messages"][0]["content"] and fake.requests[2]["response_format"] == {"type": "json_object"}


def test_a_non_retryable_error_goes_straight_to_the_fallback(llm):
    fake = llm.script(http_error(openai.APIStatusError, 402), reply())
    _result, infos = call(llm)
    assert [r["model"] for r in fake.requests] == ["alpha/primary", "beta/backup:free"] and infos[-1].fallback


def test_an_invalid_answer_is_retried_then_falls_back(llm):
    fake = llm.script(reply(content="not json"), reply(content='{"wrong": 1}'), reply())
    _result, infos = call(llm)
    assert len(fake.requests) == 3 and infos[-1].fallback
    assert "validation" in infos[0].error and "USER TEXT" not in (infos[0].error or "")


def test_code_fences_around_json_are_tolerated(llm):
    llm.script(reply(content='```json\n{"answer": "fenced"}\n```'))
    assert call(llm)[0].answer == "fenced"


def test_everything_failing_raises_llm_error(llm):
    llm.script(http_error(openai.RateLimitError, 429), http_error(openai.RateLimitError, 429), http_error(openai.RateLimitError, 429))
    with pytest.raises(LLMError):
        call(llm)


def test_fallback_is_skipped_for_a_task_it_cannot_read(llm):
    fake = llm.script(http_error(openai.InternalServerError, 500), http_error(openai.InternalServerError, 500))
    with pytest.raises(LLMError):
        call(llm, task="vision")
    assert [r["model"] for r in fake.requests] == ["alpha/vision", "alpha/vision"]  # the text-only backup was not tried


def test_every_call_is_logged_with_cost_and_no_content(llm, tmp_path):
    log = usage.UsageLog(tmp_path / "u.sqlite")
    openrouter.get_usage_log = lambda: log  # the autouse fixture restores it
    llm.script(http_error(openai.RateLimitError, 429), reply(cost=0.004))
    call(llm)
    rows = sqlite3.connect(tmp_path / "u.sqlite").execute("SELECT task, model, ok, fallback, cost_usd, error FROM usage ORDER BY ts").fetchall()
    assert rows == [("extract", "alpha/primary", 0, 0, 0.0, "RateLimitError 429"), ("extract", "alpha/primary", 1, 0, 0.004, None)]
    dump = " ".join(str(v) for r in sqlite3.connect(tmp_path / "u.sqlite").execute("SELECT * FROM usage") for v in r)
    assert "USER TEXT" not in dump and "SYSTEM" not in dump and "ok" not in dump.replace("tokens", "")
    summary = log.summary()
    assert summary["spent_today_usd"] == 0.004 and summary["spend_guard_active"] is False


def test_daily_spend_guard_switches_to_the_fallback(llm, tmp_path, monkeypatch):
    log = usage.UsageLog(tmp_path / "u.sqlite")
    monkeypatch.setattr(openrouter, "get_usage_log", lambda: log)
    log.record(task="extract", model="alpha/primary", cost_usd=10.5, ok=True)
    fake = llm.script(reply(cost=0.0))
    session = llm.session()
    asyncio.run(session.complete_json(task="extract", system="S", user="U", schema=SCHEMA, model_cls=Answer))
    assert [r["model"] for r in fake.requests] == ["beta/backup:free"]
    assert session.fallback_used and session.spend_guard and llm.status()["spend_guard_active"]


def test_no_key_means_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", None)
    client = openrouter.OpenRouterLLM()
    assert not client.available and not client.can("extract")
    with pytest.raises(LLMError):
        asyncio.run(client.complete_json(task="extract", system="S", user="U", schema=SCHEMA, model_cls=Answer))


def test_catalog_parses_prices_modalities_and_skips_router_pseudo_models():
    raw = {
        "data": [
            {"id": "x/one", "name": "One", "architecture": {"input_modalities": ["text", "image"]}, "supported_parameters": ["structured_outputs"],
             "context_length": 1000, "pricing": {"prompt": "0.000002", "completion": "0.00001", "audio": "0.000003"}, "created": 5},
            {"id": "x/router", "architecture": {"input_modalities": ["text"]}, "pricing": {"prompt": "-1", "completion": "-1"}},
        ]
    }  # fmt: skip
    parsed = catalog._parse(raw)
    assert set(parsed) == {"x/one"}
    one = parsed["x/one"]
    assert one.prompt_usd_per_mtok == 2.0 and one.completion_usd_per_mtok == 10.0 and one.audio_usd_per_mtok == 3.0
    assert one.accepts("image") and one.supports("structured_outputs") and not one.is_free
    assert round(one.cost(5000, 1000), 4) == 0.02


def test_transcript_timestamps_are_offset_ordered_and_clamped():
    from tabayyun.extract.models import AudioSegment
    from tabayyun.transcribe.service import clean_segments

    raw = [AudioSegment(start=0, end=6.5, text=" first "), AudioSegment(start=5.0, end=4.0, text="rewound"), AudioSegment(start=700, end=900, text="past the end"), AudioSegment(start=8, end=9, text="  ")]
    out = clean_segments(raw, offset=600.0, limit=600.0)
    assert [(s.start, s.end, s.text) for s in out] == [(600.0, 606.5, "first"), (606.5, 606.5, "rewound"), (1200.0, 1200.0, "past the end")]
