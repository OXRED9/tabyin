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
/**
 * `referenced`: `source` and `grades` hold the evidence a ruling or statement points at. Nothing
 * is quoted from it and the state is not raised by it (docs/API.md).
 */
export type MatchKind = 'exact' | 'near' | 'partial' | 'paraphrase' | 'topic' | 'referenced' | 'none'
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
  /** The clip's thumbnail, embedded by the server (a data: URL); absent on older reports. */
  thumbnail?: string | null
  channel?: string | null
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
  /** Every segment the quotation covers, in order (`span` is the first). Absent on older reports. */
  spans?: Span[]
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
  /** A verse's commentary (التفسير الميسر), verbatim from QuranEnc; absent on older reports. */
  tafsir?: Translation | null
}

/** F5: one retrieved candidate, as listed under "لماذا هذا الحكم؟". */
export interface ExplainCandidate {
  /** 1-based */
  rank: number
  source_name: string
  ref: string
  url: string | null
  /** null when the candidate was retrieved by topic, not by wording */
  similarity: number | null
  /** the candidate the card's source came from */
  chosen: boolean
  /** verbatim, when the corpus carries one */
  grade_text: string | null
  /** first ~160 characters of the candidate's verbatim text */
  excerpt: string
}

/** F5: why the verdict was reached. Everything here is produced by rules, never by a model. */
export interface Explain {
  rule_ar: string
  rule_en: string
  limits_ar: string
  limits_en: string
  similarity: number | null
  threshold: number | null
  candidates: ExplainCandidate[]
  level_reason_ar: string
  level_reason_en: string
  /** "model" = the LLM classifier's own words, to be labelled as such */
  level_reason_origin: 'rule' | 'model'
  match_ms: number
  data_version: string
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
  /**
   * A question put to the tool: referred to the approved scholars' sites, never answered (rule
   * `question.referral`). Its state is `needs_review`, but it is shown as a question, not as that.
   */
  is_question?: boolean
  /** Topic words for the referral links' search; null opens each site's first page. */
  referral_query?: string | null
  /** The nearest page by title on an approved scholar's site (a link; nothing of it is fetched). */
  referral_matches?: ReferralMatch[]
  /**
   * F2 «الثابت في الباب»: up to three accepted narrations on the same subject, for a hadith with
   * no reference or a weak or rejected one. Retrieved, never generated. Absent on a report saved
   * before the feature.
   */
  alternatives?: Alternative[]
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
  /** Every segment the quotation covers, in order (`span` is the first). Absent on older reports. */
  spans?: Span[]
  /** Character offset in the whole text: the chronological sort key. */
  position?: number
  warnings: string[]
  /** F4. The source's wording, ready to paste; never the user's. null when there is no source. */
  copy_text?: string | null
  /** F5. null when the feature is off. */
  explain?: Explain | null
}

export interface StageSeconds {
  ingest: number
  extract: number
  match: number
  total: number
}

export interface Summary {
  total: number
  by_state: Record<EvidenceState, number>
  mode: 'full' | 'lexical_only'
  llm_provider: string | null
  warnings: string[]
  elapsed_seconds: number
  stage_seconds?: StageSeconds
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
  /** Only `fatwa` sites are offered for questions and rulings. Absent on an older backend. */
  kind?: 'fatwa' | 'hadith'
  /** The site's own search, with `{q}` for the words; null when it has none to link to. */
  search_url?: string | null
  /** How many topic words that site's search still answers. */
  max_words?: number
}

export interface MetaExample {
  id: string
  /** `image`: a screenshot to read first (`url` is the picture); present only when image input is on. */
  input_type: InputType | 'image'
  label_ar: string
  label_en: string
  text?: string | null
  url?: string | null
}

/** F2: an accepted narration on the same subject, verbatim from the source, with its grading. */
export interface Alternative {
  text: string
  ref: string
  source_name: string
  source_url: string
  grade_text: string
  grade_source_name: string
  grade_source_url: string
}

export interface Meta {
  abstention_verse: VerseRef | null
  motto_verse: VerseRef | null
  referral_links: ReferralLink[]
  examples: MetaExample[]
  limits: { max_text_chars: number; max_upload_mb: number; max_media_minutes: number; max_image_mb?: number }
  /** Phase 2 feature flags. A missing key means the backend predates the flag: treated as on. */
  features?: Partial<Features>
  /** PUBLIC_URL; null → the UI uses window.location.origin */
  app_url?: string | null
  data_version?: string
  engines?: Engines
  /**
   * Where a reader's "report an error" message is addressed. The message is composed in the
   * browser and sent by the reader's own mail or WhatsApp: no endpoint of ours receives it.
   */
  feedback?: { email: string | null; whatsapp: string | null }
}

export interface Features {
  share_card: boolean
  copy: boolean
  explain: boolean
  /** F1 (image input, `POST /api/ocr`): off unless the backend says `true`. */
  image: boolean
  /** F2 («الثابت في الباب»): off unless the backend says `true`. */
  alternatives: boolean
}

/**
 * `POST /api/ocr`: the text of a picture exactly as written, for the user to check and edit
 * before it is verified as text. A word the model could not read is written `[?]` inside `text`.
 */
export interface OcrResult {
  text: string
  confidence: number
  /** confidence below the threshold, or any unreadable word */
  low_confidence: boolean
  unreadable: number
  notes: string | null
  /** decorative noise taken out of the text (emoji, "share this" footers, app labels), verbatim */
  removed: string[]
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
  /** The run's trace, kept so a finished report can replay its investigation. Absent on older reports. */
  trace?: Trace[]
}

export type VerifyInput =
  | { input_type: 'text'; text: string }
  | { input_type: 'article_url'; url: string }
  | { input_type: 'video_url'; url: string }
  | { input_type: 'file'; file: File }

/**
 * `trace` events: what was done, in numbers. Counts, timings and model names only — never the
 * user's text. The investigation shown on screen is drawn from these and from nothing else.
 */
export type Trace =
  | {
      step: 'ingest'
      input_type: InputType
      characters: number
      segments: number
      transcript_origin: string | null
      ms: number
    }
  | {
      step: 'scan'
      quran_verses: number
      quran_hits: number
      narrations: number
      narration_hits: number
      markers: number
      ms: number
    }
  /** Only when a model extracted claims: absent in lexical-only mode. */
  | { step: 'model'; model: string; proposed: number; ms: number }
  | {
      step: 'verify'
      notes: number
      pointer_calls: number
      selection_calls: number
      gradings: number
      /** `ok`, `unreachable`, or `unknown` when Dorar was not called. */
      dorar: string
      ms: number
    }

/** `meta.engines`: what does the work, for the interface to show truthfully. */
export interface Engines {
  quran_verses: number
  graded_narrations: number
  book_narrations: number
  /** Model ids; null when no key is configured. */
  models: { extract: string | null; vision: string | null; audio: string | null }
  live_gradings: boolean
}

export type StreamEvent =
  | { event: 'trace'; data: Trace }
  | { event: 'stage'; data: StageEvent }
  | { event: 'source'; data: SourceInfo }
  | { event: 'segments'; data: { segments: Segment[] } }
  | { event: 'claims'; data: { claims: ClaimStub[] } }
  | { event: 'card'; data: Card }
  | { event: 'summary'; data: Summary }
  | { event: 'error'; data: ApiError }
  | { event: 'done'; data: Record<string, never> }

export interface ReferralMatch {
  site_ar: string
  site_en: string
  title: string
  url: string
}
