"""Public data contract (mirrored in docs/API.md and frontend/src/lib/types.ts)."""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ClaimType(str, Enum):
    ayah = "ayah"
    hadith = "hadith"
    ruling = "ruling"
    attributed_quote = "attributed_quote"
    fact = "fact"
    # A request to produce evidence ("give me a hadith that proves X"). Never answered by generation.
    request = "request"


class ContentLevel(str, Enum):
    A = "A"  # stable foundational information
    B = "B"  # explanation, definition, argumentation
    C = "C"  # disputed or highly sensitive
    D = "D"  # fatwa or personal case


class EvidenceState(str, Enum):
    supported = "supported"
    supported_with_note = "supported_with_note"
    needs_review = "needs_review"
    not_found = "not_found"
    contradicted = "contradicted"


class Action(str, Enum):
    adopt = "adopt"  # اعتماد
    correct_wording = "correct_wording"  # تصحيح اللفظ
    refer_to_scholars = "refer_to_scholars"  # إحالة إلى أهل العلم
    remove_or_request_source = "remove_or_request_source"  # حذف أو طلب مصدر
    remove_and_warn = "remove_and_warn"  # حذف وتنبيه


class Certainty(str, Enum):
    definitive = "definitive"  # قطعي
    ijtihadi = "ijtihadi"  # اجتهادي
    not_applicable = "not_applicable"


STATE_ACTION: dict[EvidenceState, Action] = {
    EvidenceState.supported: Action.adopt,
    EvidenceState.supported_with_note: Action.correct_wording,
    EvidenceState.needs_review: Action.refer_to_scholars,
    EvidenceState.not_found: Action.remove_or_request_source,
    EvidenceState.contradicted: Action.remove_and_warn,
}


class DiffOp(BaseModel):
    """One word-level alignment step between the text as quoted and the source text."""

    op: Literal["equal", "replace", "delete", "insert"]
    quoted: str = ""  # words on the quoted side (empty for insert)
    source: str = ""  # words on the source side (empty for delete)


class Grade(BaseModel):
    """A hadith grading copied verbatim from an approved source. Never generated."""

    text: str  # verbatim wording of the grading, e.g. as returned by the source
    scholar: str | None = None  # the muhaddith, verbatim, when the source names one
    book: str | None = None  # the book (and page or number) the grading comes from, verbatim
    narrator: str | None = None  # the narrating Companion of the graded chain, verbatim
    source_name: str
    source_url: str


class Translation(BaseModel):
    lang: str
    text: str
    source_name: str
    source_url: str


class SourceRef(BaseModel):
    kind: Literal["quran", "hadith", "fatwa", "book"]
    source_name: str  # e.g. the corpus the text was retrieved from
    text: str  # verbatim source text
    ref: str  # human-readable reference built only from source fields
    url: str
    attribution: str | None = None  # takhrij line verbatim from the source (e.g. HadeethEnc "attribution")
    explanation: str | None = None  # the publisher's commentary, verbatim, labelled as commentary
    translation: Translation | None = None


class Timestamp(BaseModel):
    start: float
    end: float | None = None


class Span(BaseModel):
    segment_id: int
    start: int  # character offsets inside the segment text
    end: int


class Card(BaseModel):
    id: str
    index: int
    claim_type: ClaimType
    content_level: ContentLevel
    certainty: Certainty = Certainty.not_applicable
    text_as_quoted: str
    attributed_to: str | None = None  # who the content attributes the text to, as stated in the content
    explicit_attribution: bool = False

    state: EvidenceState
    action: Action
    rule_id: str  # which deterministic rule produced the state (transparency / debugging)
    similarity: float | None = None
    match_kind: Literal["exact", "near", "partial", "paraphrase", "topic", "none"] = "none"

    source: SourceRef | None = None
    other_sources: list[SourceRef] = Field(default_factory=list)
    grades: list[Grade] = Field(default_factory=list)
    grade_unavailable: bool = False  # hadith found but no grading could be copied from a source
    diff: list[DiffOp] | None = None

    note_ar: str = ""
    note_en: str = ""
    ai_explanation: str | None = None  # optional LLM-written explanation, always labelled as AI text
    referral: bool = False  # show the "إحالة إلى أهل العلم" affordance
    personal_case: bool = False  # level D
    disagreement_noted: bool = False  # level C

    timestamp: Timestamp | None = None
    span: Span | None = None
    position: int = 0  # character offset in the whole text: the chronological sort key
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _supported_requires_source(self) -> "Card":
        if self.state in (EvidenceState.supported, EvidenceState.supported_with_note):
            if not (self.source and self.source.text and self.source.ref and self.source.url):
                raise ValueError("a supported state requires source text, reference and URL")
        return self


class Segment(BaseModel):
    id: int
    text: str
    start: float | None = None  # seconds, for audio/video
    end: float | None = None


class SourceInfo(BaseModel):
    input_type: Literal["text", "article_url", "video_url", "file"]
    title: str | None = None
    url: str | None = None
    duration: float | None = None
    transcript_origin: str | None = None  # e.g. "captions", "cloud-stt", "local-stt"
    language: str | None = None


class ClaimStub(BaseModel):
    """Announced as soon as extraction finishes so the UI can render skeleton cards."""

    id: str
    index: int
    claim_type: ClaimType
    text_as_quoted: str
    span: Span | None = None
    timestamp: Timestamp | None = None
    position: int = 0


class Summary(BaseModel):
    total: int
    by_state: dict[EvidenceState, int]
    mode: Literal["full", "lexical_only"]
    llm_provider: str | None = None
    warnings: list[str] = Field(default_factory=list)
    elapsed_seconds: float


class VerifyRequest(BaseModel):
    input_type: Literal["text", "article_url", "video_url"]
    text: str | None = Field(default=None, max_length=60_000)
    url: str | None = Field(default=None, max_length=2_000)
    ui_lang: Literal["ar", "en"] = "ar"


class Report(BaseModel):
    """What the client assembles from the stream; also the JSON export / HTML export input."""

    source: SourceInfo
    segments: list[Segment]
    cards: list[Card]
    summary: Summary
    generated_at: str
    tool: str = "Tabayyun"
    disclaimer_ar: str = "تبيّن أداة مدعومة بالذكاء الاصطناعي، لا تغني عن الرجوع إلى أهل العلم"
    reviewer_overrides: list[dict] = Field(default_factory=list)
