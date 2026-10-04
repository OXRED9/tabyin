from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel

from ..schemas import Certainty, ClaimType, ContentLevel


@dataclass
class RawClaim:
    """A candidate claim located in the document. Produced by an extractor, decided by the rules."""

    type: ClaimType
    quote: str
    start: int  # absolute character offsets into Document.full_text
    end: int
    attributed_to: str | None = None
    explicit_attribution: bool = False
    content_level: ContentLevel = ContentLevel.A
    certainty: Certainty = Certainty.not_applicable
    search_query: str = ""
    evidence_ref: str = ""  # an LLM-*proposed* "surah:ayah" for a ruling; only ever used to look the text up
    origin: Literal["quran_scan", "marker", "hadith_scan", "llm"] = "llm"
    closed: bool = False  # a marker quotation delimited by quotation marks or Quranic brackets
    is_question: bool = False  # a question put to the tool: referred, never answered
    level_reason_ar: str = ""  # one line: why this content level (the classifier's own words when origin == "model")
    level_reason_en: str = ""
    level_reason_origin: Literal["rule", "model"] = "rule"
    prematched: object | None = field(default=None, repr=False)  # a QuranMatch found during the scan


# ---- LLM output contracts (kept flat and null-free so both providers' strict JSON modes accept them)


class LLMClaim(BaseModel):
    type: Literal["ayah", "hadith", "ruling", "attributed_quote", "fact", "request"]
    quote: str
    attributed_to: str
    explicit_attribution: bool
    content_level: Literal["A", "B", "C", "D"]
    certainty: Literal["definitive", "ijtihadi", "not_applicable"]
    search_query: str
    evidence_ref: str
    level_reason_ar: str
    level_reason_en: str


class LLMClaims(BaseModel):
    claims: list[LLMClaim]


CLAIMS_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["ayah", "hadith", "ruling", "attributed_quote", "fact", "request"]},
                    "quote": {"type": "string"},
                    "attributed_to": {"type": "string"},
                    "explicit_attribution": {"type": "boolean"},
                    "content_level": {"type": "string", "enum": ["A", "B", "C", "D"]},
                    "certainty": {"type": "string", "enum": ["definitive", "ijtihadi", "not_applicable"]},
                    "search_query": {"type": "string"},
                    "evidence_ref": {"type": "string"},
                    "level_reason_ar": {"type": "string"},
                    "level_reason_en": {"type": "string"},
                },
                "required": ["type", "quote", "attributed_to", "explicit_attribution", "content_level", "certainty", "search_query", "evidence_ref", "level_reason_ar", "level_reason_en"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["claims"],
    "additionalProperties": False,
}


class LLMJudgement(BaseModel):
    best_index: int
    relation: Literal["same_narration", "explicit_support", "referenced", "none"]


class LLMSelection(BaseModel):
    indices: list[int]


SELECTION_SCHEMA: dict = {
    "type": "object",
    "properties": {"indices": {"type": "array", "items": {"type": "integer"}}},
    "required": ["indices"],
    "additionalProperties": False,
}


JUDGEMENT_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "best_index": {"type": "integer"},
        "relation": {"type": "string", "enum": ["same_narration", "explicit_support", "referenced", "none"]},
    },
    "required": ["best_index", "relation"],
    "additionalProperties": False,
}


# ---- vision (OCR) and audio (speech-to-text) contracts


class OCRResult(BaseModel):
    text: str
    confidence: float
    notes: str


OCR_SCHEMA: dict = {
    "type": "object",
    "properties": {"text": {"type": "string"}, "confidence": {"type": "number"}, "notes": {"type": "string"}},
    "required": ["text", "confidence", "notes"],
    "additionalProperties": False,
}


class AudioSegment(BaseModel):
    start: float
    end: float
    text: str


class AudioTranscript(BaseModel):
    segments: list[AudioSegment]


AUDIO_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"start": {"type": "number"}, "end": {"type": "number"}, "text": {"type": "string"}},
                "required": ["start", "end", "text"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["segments"],
    "additionalProperties": False,
}


class TopicSummary(BaseModel):
    topic_ar: str


TOPIC_SCHEMA: dict = {
    "type": "object",
    "properties": {"topic_ar": {"type": "string"}},
    "required": ["topic_ar"],
    "additionalProperties": False,
}
