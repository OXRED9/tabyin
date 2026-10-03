/**
 * The API contract, mirrored from `docs/API.md` and `backend/tabayyun/schemas.py`.
 * Do not add fields here that the backend does not send.
 */

export type ClaimType = 'ayah' | 'hadith' | 'ruling' | 'attributed_quote' | 'fact' | 'request'
export type ContentLevel = 'A' | 'B' | 'C' | 'D'
export type EvidenceState =
  | 'supported'
  | 'supported_with_note'
  | 'needs_review'
  | 'not_found'
  | 'contradicted'
export type Action =
  | 'adopt'
  | 'correct_wording'
  | 'refer_to_scholars'
  | 'remove_or_request_source'
  | 'remove_and_warn'
export type Certainty = 'definitive' | 'ijtihadi' | 'not_applicable'
export type MatchKind = 'exact' | 'near' | 'partial' | 'paraphrase' | 'topic' | 'none'
export type InputType = 'text' | 'article_url' | 'video_url' | 'file'
export type UiLang = 'ar' | 'en'

export interface Segment {
  id: number
  text: string
  /** seconds */
  start: number | null
  end: number | null
}

export interface SourceInfo {
  input_type: InputType
  title: string | null
  url: string | null
  duration: number | null
  /** "captions" | "cloud-stt" | "local-stt" | null */
  transcript_origin: string | null
  language: string | null
}

/** Character offsets inside the segment text. */
export interface Span {
  segment_id: number
  start: number
  end: number
}

export interface Timestamp {
  start: number
  end: number | null
}

export interface ClaimStub {
  id: string
  index: number
  claim_type: ClaimType
  text_as_quoted: string
  span: Span | null
  timestamp: Timestamp | null
  /** Character offset in the whole text: the chronological sort key. */
  position?: number
}

export interface DiffOp {
  op: 'equal' | 'replace' | 'delete' | 'insert'
  quoted: string
  source: string
}

/** Copied verbatim from the source, never generated. */
export interface Grade {
  text: string
  scholar: string | null
  book: string | null
  narrator?: string | null
  source_name: string
  source_url: string
}

export interface Translation {
  lang: string
  text: string
  source_name: string
  source_url: string
}

export interface SourceRef {
  kind: 'quran' | 'hadith' | 'fatwa' | 'book'
  source_name: string
  /** verbatim source text */
  text: string
  ref: string
  url: string
  /** takhrij line, verbatim */
  attribution: string | null
  /** the publisher's commentary, verbatim */
  explanation: string | null
  translation: Translation | null
}

export interface Card {
  id: string
  index: number
  claim_type: ClaimType
  content_level: ContentLevel
  certainty: Certainty
  text_as_quoted: string
  attributed_to: string | null
  explicit_attribution: boolean
  state: EvidenceState
  action: Action
  rule_id: string
  similarity: number | null
  match_kind: MatchKind
  source: SourceRef | null
  other_sources: SourceRef[]
  grades: Grade[]
  grade_unavailable: boolean
  diff: DiffOp[] | null
  note_ar: string
  note_en: string
  ai_explanation: string | null
  referral: boolean
  personal_case: boolean
  disagreement_noted: boolean
  timestamp: Timestamp | null
  span: Span | null
  /** Character offset in the whole text: the chronological sort key. */
  position?: number
  warnings: string[]
}

export interface Summary {
  total: number
  by_state: Record<EvidenceState, number>
  mode: 'full' | 'lexical_only'
  llm_provider: string | null
  warnings: string[]
  elapsed_seconds: number
}

export type StageId = 'ingest' | 'extract' | 'match' | 'rules' | 'report'

export interface StageEvent {
  stage: StageId
  index: number
  status: 'start' | 'progress' | 'done'
  done?: number
  total?: number
  eta_seconds?: number
  detail_ar?: string
  detail_en?: string
}

export type ErrorCode =
  | 'empty_input'
  | 'input_too_long'
  | 'invalid_url'
  | 'article_fetch_failed'
  | 'video_download_failed'
  | 'video_too_long'
  | 'no_speech'
  | 'transcription_unavailable'
  | 'unsupported_file'
  | 'file_too_large'
  | 'no_claims'
  | 'llm_unavailable'
  | 'internal'
  // Raised by the client itself, never sent by the backend.
  | 'network'
  | 'stream_interrupted'

export interface ApiError {
  code: ErrorCode | (string & {})
  stage?: string | null
  fatal: boolean
  message_ar: string
  message_en: string
  hint_ar?: string | null
  hint_en?: string | null
}

export interface VerseRef {
  text: string
  ref: string
  ref_en?: string | null
  url: string
}

export interface ReferralLink {
  name_ar: string
  name_en: string
  url: string
}

export interface MetaExample {
  id: string
  input_type: InputType
  label_ar: string
  label_en: string
  text?: string | null
  url?: string | null
}

export interface Meta {
  abstention_verse: VerseRef | null
  motto_verse: VerseRef | null
  referral_links: ReferralLink[]
  examples: MetaExample[]
  limits: { max_text_chars: number; max_upload_mb: number; max_media_minutes: number }
}

export interface ReviewerOverride {
  card_id: string
  original_state: EvidenceState
  state: EvidenceState
  note: string
  reviewer: string
  /** ISO timestamp */
  at: string
}

/** What the client assembles from the stream: the JSON export and the HTML export input. */
export interface Report {
  source: SourceInfo
  segments: Segment[]
  cards: Card[]
  summary: Summary
  generated_at: string
  tool: string
  disclaimer_ar: string
  reviewer_overrides: ReviewerOverride[]
}

export type VerifyInput =
  | { input_type: 'text'; text: string }
  | { input_type: 'article_url'; url: string }
  | { input_type: 'video_url'; url: string }
  | { input_type: 'file'; file: File }

export type StreamEvent =
  | { event: 'stage'; data: StageEvent }
  | { event: 'source'; data: SourceInfo }
  | { event: 'segments'; data: { segments: Segment[] } }
  | { event: 'claims'; data: { claims: ClaimStub[] } }
  | { event: 'card'; data: Card }
  | { event: 'summary'; data: Summary }
  | { event: 'error'; data: ApiError }
  | { event: 'done'; data: Record<string, never> }
