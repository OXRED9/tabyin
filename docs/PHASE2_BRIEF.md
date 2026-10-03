# Phase 2 brief — daily-life features

Product owner's brief for the second phase, kept verbatim. It is an addendum to `CLAUDE.md`: every
non-negotiable rule there stays binding (no "supported" without retrieved source text, gradings
copied verbatim, Quran matched algorithmically, abstention when no source, no fatwa, transparency,
privacy, no secrets, no religious text from memory).

> **Precondition: do not start this phase until every item in the original Definition of Done is
> green and the public URL works.** Then build the features below in the order given.

Each feature goes behind a feature flag (`FEATURES_*` in `.env`), ships with tests, screenshots in
`docs/screenshots/`, and a README section. If a feature can't be finished to 100% within its time
box, disable its flag and move on — a half-working feature in the demo costs more than a missing one.

**The demo story every feature serves:** a forwarded WhatsApp message in a family group contains a
"hadith" + "share and be rewarded" → screenshot → Tabayyun → "no reliable source found — and here
is an authentic hadith with the same meaning" → a verdict card is sent back to the group.

## Tier 1 — build first (time box ≈ 1 hour each)

### F1. Image input (OCR) — 5th tab "صورة"
- Accept upload, drag-and-drop, paste from clipboard (Ctrl/Cmd+V anywhere on the page), and mobile
  camera capture. Formats: png/jpg/webp/heic (convert heic server-side). Max 10 MB.
- Use a vision-capable LLM to transcribe the Arabic/English text in reading order. Critical
  instruction to the vision model: transcribe exactly what is written, character by character,
  including misquotes and errors. Never correct, complete, or normalize a verse or hadith to its
  known wording — altered wording is precisely what we need to detect. Return JSON
  `{ "text": "...", "confidence": 0-1, "notes": "..." }`.
- Strip decorative noise before extraction: emojis, repeated punctuation, "انشرها تؤجر / لا تنسوا
  الصلاة على النبي" style footers (keep them in a collapsible "removed noise" view).
- Show the extracted text in an editable textarea with "هذا ما قرأناه من الصورة — عدّله إن لزم ثم
  تحقّق" before running the pipeline (error prevention, Norman). Low-confidence regions highlighted.
- Add an OCR test image set in `eval/testset/images/` (synthetic: render 15 claims from the test set
  into WhatsApp/Twitter-style PNGs with Pillow) and an eval that measures character error rate.

### F2. "البديل الصحيح" — authentic alternatives, retrieved never generated
- Trigger: a hadith claim whose state is `contradicted`, `not_found`, or `needs_review` due to a weak
  grading. Not shown for level C or D, and never for ayah.
- Method: embed the meaning of the claim (use the LLM to write a 1-line topic summary in Arabic,
  then embed that) → retrieve top candidates from the hadeethenc index → keep only those with
  grading sahih/hasan (grading verbatim from source) and similarity above a tuned threshold → show
  up to 3.
- Each alternative card: hadith text from source, grading verbatim + grading source, reference, link
  to hadeethenc page, copy button. Section header: "أحاديث صحيحة في المعنى نفسه — مسترجَعة من
  موسوعة الأحاديث النبوية". If nothing passes the threshold, show nothing (no filler, no "similar"
  junk).
- Unit test: an alternative without `source_url` and `grade_text` must fail.

### F3. Shareable verdict card ("بطاقة تثبّت")
- Button on each claim card and on the report summary: "مشاركة بطاقة التثبّت".
- Render a PNG (1080×1350 and 1080×1080) from an HTML template with the brand identity (deep green,
  gold, IBM Plex Sans Arabic). Contents: state badge (color + icon + word), the claim as quoted
  (truncated), the verdict line, reference + grading verbatim, source domain, footer "تحقّق بنفسك
  على تبيّن" + the app URL + a small QR code. For `not_found`: the abstention line with the Nahl 43
  verse. No personal data, no timestamps of the user, nothing identifying.
- Render client-side (html-to-image) with a server-side fallback endpoint. On mobile use the Web
  Share API (`navigator.share` with files); on desktop download + copy to clipboard. Toast confirms.
- Light and dark variants; Arabic and English variants.

### F4. One-click copy of the correct text
- On ayah cards: copy the Uthmani text with full tashkeel in ﴿ ﴾ plus "[السورة: الآية]". On hadith
  cards: copy the source wording + reference + grading verbatim. On `supported_with_note`: copy the
  corrected wording, not the user's.
- Toast "تم النسخ ✓". Keyboard accessible. Also a "copy full report as text" action in the export
  menu (Markdown).

### F5. "لماذا هذا الحكم؟" — explainability panel
- Collapsible section inside each expanded card showing: the human-readable rule that fired ("تطابق
  لفظي ≥ 3 كلمات مع نص المصحف" / "أفضل مرشح بتشابه 0.91 وحكمه صحيح من الدرر السنية"), the similarity
  score, the top 5 retrieved candidates with their scores and sources, the content level and the
  one-line reason the classifier gave, timing per stage, and the data snapshot/version used
  (`data/VERSION`).
- Always ends with a plain "حدود هذا الحكم" line generated from the rule (not the LLM), e.g. "لم
  نبحث خارج المصادر المعتمدة؛ قد يوجد الحديث في كتب أخرى."
- Included in JSON/HTML export. This panel is how judges verify claims live — make it legible, not a
  debug dump.

### F6. PWA + Web Share Target
- `manifest.webmanifest` (name "تبيّن", icons 192/512 + maskable, theme color, `dir: rtl`,
  `lang: ar`), service worker caching the app shell only (never cache verification results),
  install prompt shown subtly after the first successful verification (not on load).
- `share_target` (POST, multipart) accepting title, text, url, and files (image/*, audio/*,
  video/*). Route automatically: URL → video or article tab; text → text tab; image → OCR tab;
  audio/video → file tab. Auto-start verification and show the progress bar immediately.
- Document the iOS limitation (no share_target on iOS; Add to Home Screen still works;
  paste/clipboard flow is the iOS path) in `docs/LIMITATIONS.md` and show a one-line hint in the UI
  on iOS.
- Test on Android Chrome: share a TikTok link from the TikTok app to Tabayyun and record a short
  screen capture for the demo.

## Tier 2 — build after Tier 1 is green

### F7. Public API + MCP server ("Tabayyun for developers")
- `POST /api/v1/verify` (text | url | file), `POST /api/v1/match/quran`,
  `POST /api/v1/hadith/grading`, documented via OpenAPI at `/docs` and a human page at `/developers`
  (Arabic + English) with curl examples. Optional API key header; per-IP rate limit; same privacy
  rules (no storage).
- An MCP server using the official MCP Python SDK exposing tools `verify_text`, `verify_url`,
  `match_quran`, `lookup_hadith_grading`, `find_authentic_alternatives`. Support stdio and
  streamable HTTP. Provide a ready config snippet for Claude Desktop / Claude Code in `/developers`.
  Position it in README as "any da'wah chatbot or platform can call Tabayyun as a verification
  layer" — mirror the association's own MCP server mentioned in the scientific package.
- Include a 30-second demo in `docs/VIDEO_SCRIPT.md`: a chatbot calling `verify_text` and refusing a
  fabricated hadith.

### F8. Document mode (khutbah / article) with takhrij footnotes
- New entry "ملف نصي" accepting .docx, .pdf, .txt (max 5 MB). Extract text (python-docx,
  pdfplumber), run the pipeline, then return:
  - An annotated .docx: original text preserved; each claim highlighted in its state color; a
    footnote per claim with the full takhrij (reference, grading verbatim, source URL, state,
    recommended action); a summary table on page 1 (counts per state) and the transparency line.
  - The same as the normal interactive report in the UI.
- Preserve the original formatting as much as python-docx allows; never alter the author's wording —
  annotate only.
- Tests with a synthetic 2-page khutbah built from test-set items.

### F9. Public results page `/results`
- Reads `eval/results/latest.json` and renders: the three-system comparison table (lexical-only /
  general LLM / Tabayyun), per-state precision/recall, fabricated-attribution rate (big zero for
  Tabayyun), abstention rate on fabrication requests, timing, std-dev across 3 runs, and a simple
  chart. A "جرّب بنفسك" section with 10 test-set items as one-click buttons that run live. Links to
  METHODOLOGY.md and LIMITATIONS.md. Date and data version stamped.
- Add a GitHub Action that re-runs the eval on demand and commits `latest.json`.

### F10. Enriched cards from approved sources
- hadith cards: a collapsed "الشرح من موسوعة الأحاديث النبوية" section with the explanation text
  from hadeethenc (labelled as level B content from an approved source, with link).
- ayah cards: links "التفسير" (dorar.net/tafseer or tafsir.net page for that verse) and "استمع"
  (mp3quran.net verse/surah audio) — links only, approved sources only.
- English UI: terminology tooltips from `data/terms.json` (hover on "Tawhid" shows the approved
  definition), so translated output keeps the Sharia meaning of terms.

## Cross-cutting requirements for this phase

- Performance budget unchanged: first card < 5 s via SSE; OCR < 8 s; document mode < 60 s for 3
  pages.
- Every new LLM call goes through the `llm/` abstraction with provider failover and uses prompt
  caching for the system prompt.
- Update `docs/DESIGN.md` (new flows), `docs/SOURCES.md` (hadeethenc explanations, tafsir/mp3quran
  links), `docs/OPERATIONS.md` (cost per feature), `docs/LIMITATIONS.md`, README (feature list + new
  screenshots), and `docs/VIDEO_SCRIPT.md` with the WhatsApp-forward story as the main narrative.
- Add a `/demo` page with three prepared scenarios for the judging session: (1) a WhatsApp-style
  screenshot with a fabricated hadith, (2) a YouTube clip with a verse quoted with altered wording,
  (3) the trap: "أعطني حديثاً يثبت أن…" which must produce an explicit refusal. Each runs with one
  click.
- Report after each feature: two lines (done / blocked) + one thing I can try.

Start with F1.
