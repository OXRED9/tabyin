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
  "llm": {
    "provider": "openrouter", "configured": true, "spend_guard_active": false,
    "models": { "extract": "…", "vision": "…", "audio": "…", "cheap": "…", "baseline": "…", "fallback": "…" }
  },
  "transcription": { "captions": true, "cloud": false, "local": false },
  "sources": { "quran_ayahs": 6236, "hadeethenc": 4000, "hadith_books": 60000, "dorar": "unreachable | ok | unknown" }
}
```

## `POST /api/ocr` (image input, F1)

`multipart/form-data` with one field, `file`: PNG, JPG, WebP or HEIC, at most `limits.max_image_mb`.
Returns the text of the image **exactly as written** — the vision model is instructed never to
correct a verse or a narration — for the user to check, edit and then send to `/api/verify` as text.
404 when `features.image` is off.

```json
{
  "text": "…the text, without decorative noise…",
  "confidence": 0.95,
  "low_confidence": false,        // confidence < 0.8, or any unreadable word
  "unreadable": 0,                // words the model could not read; each is written "[?]" in text
  "notes": null,                  // the model's remark about legibility, if any
  "removed": ["🌹", "انشرها تؤجر"] // emoji, "share this" footers, app labels — shown in a collapsible list
}
```

Errors are JSON, `{"detail": {code, message_ar, message_en, hint_ar, hint_en}}`: `unsupported_image`
(415), `image_too_large` (413), `no_text_in_image` (422), `ocr_failed` (502), `ocr_unavailable`
(503), `rate_limited` (429).

The image is held in memory, re-encoded without its metadata (a photo's EXIF location never leaves
the process), reduced to 2000 px on its longest side, sent to the vision model and dropped. Nothing
is written to disk and no content is logged.

## `GET /admin/usage` (development only)

404 unless `DEV_MODE=true`. Totals of model calls and cost per day, task and model, from the local
usage log. The log holds no prompt, answer or user text.

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
  match_kind: "exact" | "near" | "partial" | "paraphrase" | "topic" | "referenced" | "none";
  // match_kind "referenced": `source` and `grades` hold the evidence a ruling or statement points at; the state is not raised by it
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
  llm_provider: string | null;       // the model id(s) that answered, comma-separated
  warnings: string[];                // "dorar_unreachable", "partial_llm_extraction",
                                     // "llm_fallback" (the backup model answered: show "reduced coverage")
  elapsed_seconds: number;
}
```

## `POST /api/export/html`

Body: a `Report` (`{ source, segments, cards, summary, generated_at }`) assembled by the client.
Returns a standalone printable HTML document (`text/html`), each citation under its own state.
Nothing is stored. JSON export is done entirely client-side. A report saved by an older client may
carry fields this API has dropped; they are ignored, not rejected.

---

# Phase 2 additions (F3 verdict card · F4 copy · F5 explainability)

Each feature has a flag in `.env` (`FEATURES_SHARE_CARD`, `FEATURES_COPY`, `FEATURES_EXPLAIN`,
default `true`). The UI hides a feature whose flag is off; the API then omits its data.

## `GET /api/meta` — new keys

```json
{
  "features": { "share_card": true, "copy": true, "explain": true },
                                      // plus `image` (F1): true when `POST /api/ocr` is available. The
                                      // UI shows the composer's «صورة» action, takes pictures through
                                      // «ملف», drop and paste, and shows the image example only then;
                                      // a missing key means false.
  "app_url": "https://…",            // PUBLIC_URL; null → the UI uses window.location.origin
  "data_version": "2026.10.03 · quran 6236 · hadeethenc 3574 · books 58802"
}
```

## `Card` — new fields

```ts
interface Card {
  // …existing fields…
  copy_text: string | null;   // F4. The *source's* wording, ready to paste. Never the user's wording.
                              //   ayah:   ﴿<Uthmani text>﴾ [<surah>: <ayah>]
                              //   hadith: <source text>\n<reference> — <grading verbatim> (<grading source>)\n<url>
                              //   null when the card has no source (not_found, requests, personal cases)
  explain: Explain | null;    // F5. null when FEATURES_EXPLAIN is off
}

interface Explain {
  rule_ar: string; rule_en: string;       // the rule that fired, in words, with its numbers
  limits_ar: string; limits_en: string;   // "حدود هذا الحكم" — generated from the rule, never by a model
  similarity: number | null;              // 0..1
  threshold: number | null;               // the threshold the similarity was compared with, if any
  candidates: ExplainCandidate[];         // up to 5 retrieved candidates, best first
  level_reason_ar: string; level_reason_en: string;   // one line: why this content level
  level_reason_origin: "rule" | "model";  // "model" = the LLM classifier's own words (label it as such)
  match_ms: number;                       // retrieval + decision time for this claim
  data_version: string;                   // same string as meta.data_version
}

interface ExplainCandidate {
  rank: number;               // 1-based
  source_name: string;
  ref: string;
  url: string | null;
  similarity: number | null;  // null when the candidate was retrieved by topic, not by wording
  chosen: boolean;            // the candidate the card's source came from
  grade_text: string | null;  // verbatim, when the corpus carries one
  excerpt: string;            // first ~160 characters of the candidate's verbatim text
}
```

## `Summary` — new field

```ts
stage_seconds: { ingest: number; extract: number; match: number; total: number }
```

## `POST /api/share-card` → `image/png` (F3 server-side fallback)

Used only when client-side rendering fails. Nothing is stored; no timestamp or identifier is drawn.

```json
{
  "kind": "claim | summary",
  "size": "portrait | square",          // 1080×1350 | 1080×1080
  "theme": "light | dark",
  "lang": "ar | en",
  "card": Card,                          // kind = "claim"
  "summary": Summary,                    // kind = "summary": the counts the sentence says
  "cards": [Card, …],                    // kind = "summary": the citations listed on the card, at most 60 (default [])
  "title": "…" | null                    // kind = "summary": what was checked, at most 300 characters
}
```

A card is drawn in its own state (`card.state`) under the levels' ceilings, whatever the request
says: a personal case (level D) is always «يحتاج مراجعة» and shows no source, and a level C claim is
never drawn as «له مرجعية» or «مخالف للمصدر». Fields this API has dropped are ignored, not rejected.

### What a verdict card shows (client and server render the same content)

The v2 card (`docs/DESIGN.md` §8): paper inside one hairline frame, no band, pill or shadow. The
blocks, top to bottom:

| Block | What is drawn | Source |
|---|---|---|
| Header | the brand's mark (as in `favicon.svg`) and, beside it, the logotype «تبيّن» in Naskh; the label «بطاقة تثبّت» / "Verification card" in Plex, quiet; a hairline | fixed |
| State | the ring glyph and the state's short name in the state's ink (`DESIGN.md` §8.2): «له مرجعية», «له مرجعية مع ملاحظة», «يحتاج مراجعة», «بلا مرجعية», «مخالف للمصدر» — "Has a reference", "Has a reference, with a note", "Needs review", "No reference found", "Differs from the source". Gold appears only in the ring of «له مرجعية» (the mark in the header keeps the brand's own gold) | `card.state`; the words are `STATE_SHORT` in `report/labels.py` |
| Verdict sentence | one sentence in Plex, at most 3 lines (2 on the square card) | first sentence of `note_ar` / `note_en` (up to the first `.`, `؟`, `?` or `!`) |
| «النص المتداول» | the claim in Naskh, in the state's ink, underlined in the state's colour — as the passage looks on the page | `card.text_as_quoted`, cut at 240 characters at a word boundary with «…» |
| «في المصدر» | the source's own wording between two hairlines: Amiri Quran inside ﴿ ﴾ for a verse, Amiri for anything else. Words that differ from the claim are underlined in the state's colour. For a ruling or statement that points at its evidence (`match_kind = "referenced"`) the label is «الدليل المشار إليه في المصادر» / "The evidence referred to, in the sources": the text, takhrij line and grading are drawn as for any source (a weak grading verbatim like any other), nothing is underlined, and the state stays «يحتاج مراجعة» | `card.source.text`; the underlined words are the source side of `card.diff`'s `replace` steps; `card.match_kind` |
| Takhrij line | the reference, a dash, then: **one grading** — «its first line, verbatim» in Naskh, the muhaddith when the source names one, and the grading's source; **several gradings** — their count («3 أحكام في المصادر»), so that none is singled out; **none** — «الحكم غير متاح من المصدر» when `grade_unavailable`, otherwise the name of the source the text was retrieved from. A grading is never shortened | `card.source.ref`, `card.grades[].text` / `.scholar` / `.source_name`, `card.grade_unavailable`, `card.source.source_name` |
| …instead, `not_found` | between two hairlines: «لا نُصدر حكماً بلا مصدر، ولا نولّد بديلاً.», the abstention verse inside ﴿ ﴾ and its reference. A source the card may carry is not drawn | `meta.abstention_verse` |
| …instead, no source (`needs_review`, level C) or level D | nothing is quoted. Between two hairlines: the reason — «هذه حالة شخصية تستوجب فتوى من جهة مؤهلة» for a personal case, «مسألة خلافية: يعرض تبيّن ما ورد في المصادر كما هو، دون ترجيح.» for a disputed matter, left out when it is already the verdict sentence above — then the referral: «تبيّن لا يفتي ولا يرجّح؛ يُرجع في هذه المسألة إلى أهل العلم.» A personal case (level D) never shows a source | `card.personal_case`, `card.disagreement_noted` |
| Action | the canonical action of the drawn state, as a sentence: «الإجراء المقترح: نقله كما ورد مع ذكر مرجعه.» / "Suggested action: cite it as quoted, with its reference." for «له مرجعية»; correct the wording; refer the matter to scholars; remove it or ask for its source; remove it and warn | `STATE_ACTION[state]` |
| Footer | a hairline; «تحقّق بنفسك على تبيّن», the app address without its scheme, and its QR code; the transparency line | app URL |

Never drawn: date or time, any person's name, the source's URL, video URL or timestamp, who the
content attributes the text to, anything about the user.

**Fitting** (`docs/DESIGN.md` §8, as the server applies it — deterministic). Type is reduced
before anything is cut: the claim from 44px down to 34 and the source's wording from 46 (a verse)
or 40 down to 30, two pixels at a step, together. The square card sets its other type and spacing
at 0.86 of the portrait's. If the card still does not hold everything at the smallest sizes:

- **a verse is never cut inside the quoted span.** The card shows the part of the verse that
  corresponds to the quotation, with «…» on each side that was cut; if that part does not fit
  beside the claim, the claim gives up lines (down to one, ending in «…»), then the verse's type
  goes below 30 (down to 22) rather than its words; if it cannot fit even so, the verse's words are
  not drawn and a sentence says so. Its reference is always drawn.
- **a narration or any other wording** is cut at a word boundary with «…». It starts at the quoted
  part (with a leading «…») when the text before it would push that part off the card. The claim
  stays whole as long as one line of the wording fits; on the square card a claim near 240
  characters gives up lines so that the wording keeps at least one.

**The summary card** (`kind = "summary"`, `DESIGN.md` §8.1) has the same frame, header and footer,
and carries the details. Top to bottom:

| Block | What is drawn | Source |
|---|---|---|
| Heading | «خلاصة التحقق» / "Verification summary", Plex 600 | fixed |
| What was checked | the title on one line, quiet, cut at a word boundary with «…»; left out when there is none | `title` |
| Summary sentence | Plex 600, the page's sentence with agreement — «تسعة استشهادات:» then one clause per state present, each in its state's ink behind its ring glyph and never broken across lines: «واحد له مرجعية» / «اثنان لهما مرجعية» / «ثلاثة لها مرجعية» (the same with «… مع ملاحظة»), «اثنان يحتاجان مراجعة», «واحد بلا مرجعية», «وواحد مخالف للمصدر» | `summary.total`, `summary.by_state` |
| The list | after a hairline, one row per citation: the ring glyph and the short state word in the state's ink; beside them the quoted words between «» on one line, cut at a word boundary with «…»; under them the reference and, for a narration, the grading word verbatim («رواه مسلم — «صحيح»»). Several gradings are counted («3 أحكام في المصادر»); a grading too long for the line is counted, never shortened; the reference gives way first («…»). No reference line for «بلا مرجعية» or a personal case | `cards[]`: `state`, `text_as_quoted`, `source.ref`, `grades`, `grade_unavailable` |
| Closing line | when not every citation fits: «وثلاثة استشهادات أخرى» / "and three more citations" | `max(summary.total, cards.length)` − rows shown |

Order of the rows: what most needs attention first — «مخالف للمصدر», «بلا مرجعية», «يحتاج مراجعة»,
«له مرجعية مع ملاحظة», «له مرجعية» — and the text's order (`position`) inside each group. As many
whole rows as fit above the footer are drawn (about six on the portrait card, four or five on the
square); a row is never cut in half. Without `cards` the card shows the heading, the title and the
sentence alone.
