"""Provider-neutral LLM interface.

The LLM has exactly two jobs in Tabayyun, and neither is a decision:
  * propose  — extract candidate claims from text, or point at which retrieved source text (if any)
               corresponds to a claim;
  * explain  — nothing it writes is ever shown as a source text, a reference or a grading.
Every call returns JSON constrained by a schema and validated with Pydantic.
"""
from __future__ import annotations

from typing import Protocol, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """A provider failed in a way that should trigger failover (network, auth, rate limit, refusal).

    ``cooldown``: seconds to skip this provider afterwards. Zero for failures tied to one request
    (a refusal, a truncated or invalid answer); non-zero when the provider itself is unavailable.
    """

    def __init__(self, message: str, cooldown: float = 0.0) -> None:
        super().__init__(message)
        self.cooldown = cooldown


class LLMProvider(Protocol):
    name: str

    @property
    def available(self) -> bool: ...

    async def complete_json(self, *, system: str, user: str, schema: dict, model_cls: type[T], max_tokens: int = 8000) -> T: ...
