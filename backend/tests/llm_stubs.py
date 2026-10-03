"""Stand-ins for the LLM client used by tests (no network, no key)."""
from __future__ import annotations

from tabayyun.extract.models import LLMSelection, LLMClaim, LLMClaims, LLMJudgement
from tabayyun.extract.prompts import EXTRACT_SYSTEM, JUDGE_SYSTEM
from tabayyun.llm.base import LLMError


class NoLLM:
    """No key configured: the pipeline runs in lexical-only mode."""

    available = False
    fallback_used = False
    spend_guard = False
    models_used: list[str] = []

    def session(self):
        return self

    def can(self, _task: str) -> bool:
        return False

    def status(self) -> dict:
        return {"provider": "openrouter", "configured": False, "models": {}, "spend_guard_active": False}

    async def complete_json(self, **_kw):
        raise LLMError("no model configured")


class ScriptedLLM:
    """Returns what a model would be asked to return: claim locations, or an index into retrieved texts."""

    available = True
    spend_guard = False

    def __init__(self, claims=None, judge_index=-1, fail=False, fallback=False, judge_from_fallback=False, evidence_relation="explicit_support", select=()):
        self.evidence_relation = evidence_relation
        self.select = list(select)  # indices the "model" picks for «الثابت في الباب»
        self.claims = claims or []
        self.judge_index = judge_index
        self.fail = fail
        self.fallback_used = fallback or judge_from_fallback
        self.judge_from_fallback = judge_from_fallback
        self.last_call_fallback = False
        self.models_used = ["scripted/model"]
        self.calls: list[str] = []

    def session(self):
        return self

    def can(self, _task: str) -> bool:
        return True

    async def complete_json(self, *, task, system, user, schema, model_cls, max_tokens=None, model=None, use_fallback=True):
        if self.fail:
            raise LLMError("scripted failure")
        if task == "extract":
            assert system == EXTRACT_SYSTEM
            self.calls.append("extract")
            self.last_call_fallback = False
            return LLMClaims(claims=self.claims)
        if task == "select":
            self.calls.append("select")
            self.last_call_fallback = False
            return LLMSelection(indices=self.select)
        assert task == "judge" and system == JUDGE_SYSTEM
        self.calls.append("judge")
        self.last_call_fallback = self.judge_from_fallback
        relation = "none" if self.judge_index < 0 else ("same_narration" if 'task = "hadith_match"' in user else self.evidence_relation)
        return LLMJudgement(best_index=self.judge_index, relation=relation)


def claim(**kw) -> LLMClaim:
    base = dict(
        type="ruling", quote="", attributed_to="", explicit_attribution=False, content_level="A", certainty="definitive", search_query="",
        evidence_ref="", level_reason_ar="مسألة من المعلوم من الدين", level_reason_en="A matter known to be settled",
    )  # fmt: skip
    return LLMClaim(**{**base, **kw})
