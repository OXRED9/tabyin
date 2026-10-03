"""LLM interface.

The LLM has exactly two jobs in Tabayyun, and neither is a decision:
  * propose  — locate candidate claims in text, read text from an image or from speech, or point
               at which retrieved source text (if any) corresponds to a claim;
  * explain  — nothing it writes is ever shown as a source text, a reference or a grading.
Every call returns JSON constrained by a schema and validated with Pydantic.

All model calls go through one provider, OpenRouter (``llm/openrouter.py``), with one API key.
"""
from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

# What a call is for. Each task has its own model (MODEL_* in .env) and output budget.
TASKS = ("extract", "judge", "vision", "audio", "cheap", "baseline")


class LLMError(Exception):
    """The primary model and the fallback model both failed (or no key is configured).
    The caller then degrades: lexical-only verification, or a readable error for OCR/audio."""

    def __init__(self, message: str, calls: list | None = None) -> None:
        super().__init__(message)
        self.calls = calls or []  # the CallInfo of every attempt (no content), for the session's record
