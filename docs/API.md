# Tabayyun API contract

Base path: `/api`. The backend stores nothing about a request; every response is computed and
streamed. Types below mirror `backend/tabayyun/schemas.py` (source of truth) and
`frontend/src/lib/types.ts`.

## `GET /api/health` (also `GET /health`)

```json
{
  "status": "ok",
  "version": "0.1.0",
  "mode": "full | lexical_only",
  "llm": { "anthropic": true, "openai": false },
  "transcription": { "captions": true, "cloud": false, "local": false },
  "sources": { "quran_ayahs": 6236, "hadeethenc": 4000, "hadith_books": 60000, "dorar": "unreachable | ok | unknown" }
}
```

## `GET /api/meta`

Static content the UI must not hard-code (religious text always comes from source data):

```json
{
  "terms": [ { "ar": "التوحيد", "en": "Tawhid / Oneness of God", "usage_ar": "…" }, … ],
  "abstention_verse": { "text": "…verbatim Uthmani text…", "ref": "النحل: 43", "ref_en": "An-Nahl 43", "url": "…" },
  "motto_verse": { "text": "…", "ref": "الحجرات: 6", "ref_en": "…", "url": "…" },
  "referral_links": [ { "name_ar": "الإسلام سؤال وجواب", "name_en": "IslamQA", "url": "https://islamqa.info/ar" }, … ],
  "examples": [
    { "id": "text", "input_type": "text", "label_ar": "نص فيه آية وحديث", "label_en": "Text with a verse and a hadith", "text": "…" },
    { "id": "video", "input_type": "video_url", "label_ar": "رابط مقطع يوتيوب", "label_en": "YouTube link", "url": "…" },
    { "id": "fabrication", "input_type": "text", "label_ar": "طلب اختلاق حديث", "label_en": "A request to fabricate a hadith", "text": "…" }
  ],
  "limits": { "max_text_chars": 60000, "max_upload_mb": 50, "max_media_minutes": 30 }
}
```

An example whose `url`/`text` is `null` is not configured and must be hidden. `terms` is the
approved Arabic→English terminology list (`{ar, en, usage_ar}`) from the challenge's scientific
package, for the English UI.

## `POST /api/verify` → `text/event-stream`

Request body:

```json
{ "input_type": "text | article_url | video_url", "text": "…", "url": "…", "ui_lang": "ar | en" }
```

## `POST /api/verify/file` → `text/event-stream`

`multipart/form-data` with `file` (audio/video, ≤ 50 MB) and `ui_lang`.

### Stream events

Standard SSE framing: `event: <name>\ndata: <json>\n\n` (plus `: keep-alive` comment lines during
slow stages). Order: `stage` events interleaved with `source` → `segments` → `claims` → `card` × N →
`summary` → `done`. An `error` event may arrive at any point; a fatal one is followed by `done`.

`claims` is **additive and may arrive more than once**: verbatim verses and narrations found by the
model-free scans are announced (and their `card` events may arrive) before the LLM extraction has
finished; a second `claims` event then adds the rest. Clients upsert skeletons by `id`. For the same
reason a `match` stage `start` can precede `extract` `done`.

| event | data |
|---|---|
| `stage` | `{ "stage": "ingest\|extract\|match\|rules\|report", "index": 1-5, "status": "start\|progress\|done", "done": 2, "total": 5, "eta_seconds": 12, "detail_ar": "…", "detail_en": "…" }` (`done`/`total` only for `match`) |
| `source` | `SourceInfo` |
| `segments` | `{ "segments": Segment[] }` — the text/transcript, in order |
| `claims` | `{ "claims": ClaimStub[] }` — one skeleton per claim, sent right after extraction |
| `card` | `Card` — replaces the skeleton with the same `id` |
| `summary` | `Summary` |
| `error` | `{ "code": "…", "stage": "…", "fatal": true, "message_ar": "…", "message_en": "…", "hint_ar": "…", "hint_en": "…" }` |
| `done` | `{}` |

Error codes: `empty_input`, `input_too_long`, `invalid_url`, `article_fetch_failed`,
`video_download_failed`, `video_too_long`, `no_speech`, `transcription_unavailable`,
`unsupported_file`, `file_too_large`, `no_claims` (non-fatal: the text has no religious citation),
`llm_unavailable` (non-fatal: lexical-only mode), `rate_limited`, `internal`.

### Types

```ts
type ClaimType = "ayah" | "hadith" | "ruling" | "attributed_quote" | "fact" | "request";
type ContentLevel = "A" | "B" | "C" | "D";
type EvidenceState = "supported" | "supported_with_note" | "needs_review" | "not_found" | "contradicted";
type Action = "adopt" | "correct_wording" | "refer_to_scholars" | "remove_or_request_source" | "remove_and_warn";
type Certainty = "definitive" | "ijtihadi" | "not_applicable";

interface Segment { id: number; text: string; start: number | null; end: number | null }   // seconds

interface SourceInfo {
  input_type: "text" | "article_url" | "video_url" | "file";
  title: string | null; url: string | null; duration: number | null;
  transcript_origin: string | null;   // "captions" | "cloud-stt" | "local-stt" | null
  language: string | null;
}

interface Span { segment_id: number; start: number; end: number }   // char offsets inside the segment text
interface Timestamp { start: number; end: number | null }

interface ClaimStub {
  id: string; index: number; claim_type: ClaimType; text_as_quoted: string;
  span: Span | null; timestamp: Timestamp | null;
  position: number;          // character offset in the whole text: the chronological sort key
}

interface DiffOp { op: "equal" | "replace" | "delete" | "insert"; quoted: string; source: string }

interface Grade {            // copied verbatim from the source — never generated
  text: string; scholar: string | null;
  book: string | null;       // book and page/number, verbatim
  narrator: string | null;   // narrating Companion of the graded chain, verbatim
  source_name: string; source_url: string;
}

interface Translation { lang: string; text: string; source_name: string; source_url: string }

interface SourceRef {
  kind: "quran" | "hadith" | "fatwa" | "book";
  source_name: string;
  text: string;              // verbatim source text
  ref: string;               // e.g. surah + ayah, or the source's own reference line
  url: string;
  attribution: string | null;  // takhrij line verbatim (e.g. HadeethEnc "attribution")
  explanation: string | null;  // publisher's commentary, verbatim — label it as commentary
  translation: Translation | null;   // present when ui_lang = "en" and a translation exists
}

interface Card {
  id: string; index: number;
  claim_type: ClaimType; content_level: ContentLevel; certainty: Certainty;
  text_as_quoted: string; attributed_to: string | null; explicit_attribution: boolean;
  state: EvidenceState; action: Action;
  rule_id: string;           // which deterministic rule fired, e.g. "ayah.exact"
  similarity: number | null; // 0..1
  match_kind: "exact" | "near" | "partial" | "paraphrase" | "topic" | "none";
  source: SourceRef | null;  // always present for supported / supported_with_note
  other_sources: SourceRef[];
  grades: Grade[];           // more than one => show all, no preference
  grade_unavailable: boolean; // show "الحكم غير متاح من المصدر"
  diff: DiffOp[] | null;     // word-level, quoted vs source
  note_ar: string; note_en: string;   // rule-generated explanation
  ai_explanation: string | null;      // optional, must be labelled as AI-written
  referral: boolean;         // show "إحالة إلى أهل العلم"
  personal_case: boolean;    // level D: show "هذه حالة شخصية تستوجب فتوى من جهة مؤهلة"
  disagreement_noted: boolean; // level C
  timestamp: Timestamp | null; span: Span | null;
  position: number;          // chronological sort key (same as the stub's)
  warnings: string[];
}

interface Summary {
  total: number;
  by_state: Record<EvidenceState, number>;
  mode: "full" | "lexical_only";     // lexical_only => show the "reduced coverage" warning
  llm_provider: string | null;
  warnings: string[];                // e.g. "dorar_unreachable", "partial_llm_extraction"
  elapsed_seconds: number;
}
```

## `POST /api/export/html`

Body: a `Report` (`{ source, segments, cards, summary, generated_at, reviewer_overrides }`) assembled
by the client, including reviewer overrides
(`{ card_id, original_state, state, note, reviewer, at }`). Returns a standalone printable HTML
document (`text/html`). Nothing is stored. JSON export is done entirely client-side.
