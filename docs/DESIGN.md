# Design — how the UI brief was applied

`docs/DESIGN_BRIEF.md` is the binding brief. This document records who the UI is for, the order in
which it was designed (strategy first, surface last), and, rule by rule, what the frontend does
about each line of the brief. Statuses are honest: **Done**, **Partial** (with what is missing) or
**Not done**.

Screenshots of every state are in `docs/screenshots/` and are regenerated with
`cd frontend && npm run screenshots` (dev server running, mock mode, headless Chromium).

## 1. Personas

### Primary user — the da'i or content creator, before publishing

Reviews a script, an article or a recorded clip before it goes out. Has ten minutes, not ten
seconds, and is accountable for what is published.

- **Goal**: publish nothing with a wrong verse, an unsourced hadith or a misattributed saying.
- **Needs**: the full report, the source text beside what was said, the grading exactly as the
  source words it, the position in the clip, an export to hand to a reviewer, and a way for a
  qualified person to record a correction (reviewer mode).
- **Served by**: expanded cards, the transcript pane, word-level comparison, reviewer mode, JSON
  and printable export, local history.

### Extended user — a Muslim who heard a hadith in a clip

Pastes a sentence or a link once, on a phone, and wants to know whether to trust it.

- **Goal**: a clear answer, readable in under three seconds.
- **Needs**: one field, one button, a verdict in plain words, and a pointer to scholars when the
  tool cannot answer.
- **Served by**: the first screen (headline, one input, one button, three examples), the collapsed
  card (state badge, the quoted text, one line of reference), the red not-found card with the
  referral button.

**The first screen serves the extended user; depth serves the primary user.** Nothing the primary
user needs is on the first screen except a switch in the header.

## 2. The five layers (Elements of User Experience)

Designed in this order; the surface came last.

| Layer | Decision |
|---|---|
| **Strategy** | One job: verification. The product shows where a religious text comes from and how it compares to its source. It does not rule, prefer an opinion, or generate a substitute. Every screen is judged against "does this help someone verify before believing or sharing?". |
| **Scope** | Four inputs (text, article link, video link, file). Five evidence states. Six claim types, four content levels, two certainty labels. Export (JSON, printable page). Reviewer override. Local history of ten. Arabic and English. Nothing else: no accounts, no settings page, no sharing, no notifications. |
| **Structure** | One linear journey on one page: input → progress → report → export or start again. No routes, no wizard. The only branches are user-invoked and reversible: expand a card, open the transcript sheet, open the referral dialog, turn reviewer mode on. |
| **Skeleton** | Header bar (brand at the start; language, theme, reviewer switch, history and export at the end). Permanent transparency line. Input card with four tabs, the field, and the primary button beside it. While running: a five-stage progress card and skeleton cards. After: two panes on wide screens (transcript at the start, report at the end), one pane plus a transcript sheet on phones. The report is a one-line summary, cards grouped by state with the riskiest first, and a closing summary card. |
| **Surface** | Brand from the pitch deck: deep green `#1B6B5E`, gold `#C9A227`, background `#F6F7F5`, text `#0F1F1B`. IBM Plex Sans Arabic for Arabic, Inter for Latin, Amiri Quran for Quranic text, all self-hosted. Light borders, soft shadows, a 6px coloured edge per state, a large red card for "not found". Dark theme with the same roles. |

## 3. Brief rule → implementation

### Stack

| Brief | Implementation | Status |
|---|---|---|
| shadcn/ui via the official CLI | `npx shadcn@latest init -b radix -p nova --rtl`, then `add`. Tailwind v4, Vite 8, React 19, TypeScript 6. | Done |
| Logical properties only | Own code uses `ms-/me-/ps-/pe-/start-/end-/text-start` only. The generated `sheet` was rewritten to `side="start" \| "end"`; physical slide classes were removed from `dropdown-menu` and `tooltip`; `progress` fills by width so it grows from the inline start in both directions. A grep for `ml-/mr-/pl-/pr-/left-/right-` over `src/` is empty. | Done |
| `dir="rtl"`, `lang="ar"` on `<html>` | Set in `index.html`; `I18nProvider` flips both on language change; Radix gets the direction through `DirectionProvider`. | Done |
| IBM Plex Sans Arabic, Noto fallback, Inter for English | Self-hosted from `@fontsource` (no Google Fonts request). Noto Sans Arabic is named in the stack as a system fallback, not bundled. Amiri Quran for verses. | Done |
| Light and dark via shadcn CSS variables, brand palette | `src/index.css` defines every shadcn token plus brand and state tokens for both themes. No default shadcn colour remains. | Done |
| Components list | Used: Tabs, Card, Badge, Button, Textarea, Input, Progress, Skeleton, Tooltip, Collapsible, Accordion, Sheet, Dialog, Switch, ScrollArea, Separator, DropdownMenu, Sonner, Label. `Command` (optional) is not used. | Done |
| Icons from `lucide-react` | Yes, everywhere. | Done |

### Self-evidence

| Brief | Implementation | Status |
|---|---|---|
| First screen understood in five seconds: one headline, one large input, one primary button, no text longer than a line | Headline "تحقّق قبل أن تصدّق أو تنشر", a one-line subline, the input card, the gold "تحقّق". Screenshot `01-empty.png`. Not yet measured with users (see `docs/USABILITY_TEST.md`). | Done (untested with users) |
| Clickable things look clickable; no links in body-text colour | Links are brand green and underlined, with an "opens elsewhere" arrow for external ones. Buttons have a fill or a border. The card header also toggles on click (pointer cursor, lifted shadow) and has an explicit "عرض التفاصيل" button. Transcript highlights are underlined. | Done |
| Feedback within 100ms on the button itself | The button switches to a spinner and "جارٍ التحقق…" in the same render as the click. | Done |
| Visible progress within 400ms; five stages with name and estimate | The progress card renders immediately with stage 1 active, before the first server event. It shows "المرحلة n من 5", the stage name, `done/total` for matching, and the server's `eta_seconds` counted down locally. Stages can overlap (matching starts before extraction ends), so each step has its own status and the bar follows the highest stage seen. Screenshot `02-loading.png`. | Done |
| Errors in human language, where they happened, not in a modal | `InlineError` renders under the field with what happened (`message_*`), what to do (`hint_*`) and buttons that do it ("ارفع الملف", "الصق التفريغ", "أعد المحاولة"). Empty input, bad URL, oversize or unsupported files are caught before any request. Screenshots `07-error.png`, `07-error-empty-input.png`. | Done |
| No unnecessary confirmations | None. Clearing history and removing a review are instant, each with an undo toast. | Done |
| Undo in reviewer mode | Toast with "تراجع" after saving or removing a review, plus "إلغاء المراجعة" on the card. | Done |

### Visual hierarchy

| Brief | Implementation | Status |
|---|---|---|
| Spacing scale 4/8/12/16/24/32/48 | Own layout code uses Tailwind 1/2/3/4/6/8/12 for padding, margin and gap. shadcn's generated primitives keep their own internal metrics (for example 6px gaps inside menu items). | Partial (own code only) |
| Two heading sizes in the report | `text-lg` (report title, transcript title, closing card) and `text-base` (group headers, the quoted text). Everything else is a label (`text-xs`/`text-sm`), separated by weight and colour. | Done |
| Secondary text dark gray on light; never gray on coloured surfaces | Secondary text is `#4A5B56` on white or the page background. Inside the red-tinted cards and the gold review panel, secondary text takes the surface's own hue (the `--muted-foreground` token is overridden on the card). | Done |
| State in three layers: colour + icon + word | `StateBadge` (colour, icon, label), the coloured card edge, group headers with icon and label, the summary line, and transcript highlights (colour, icon, and the state in the accessible name and tooltip). Each state has a distinct icon shape. | Done |
| Light borders, soft shadows; labels secondary, values primary | 1px ring and a soft two-layer shadow on cards. `Field` renders a small gray label over a regular dark value. | Done |
| Designed empty state with three examples that fill the field | Three example buttons from `GET /api/meta`; clicking fills the field and switches the tab. An example whose `text`/`url` is `null` is hidden, so the real backend currently shows two (its video example is not configured). The motto verse served by `/api/meta` closes the screen. | Done |

### UX laws

| Brief | Implementation | Status |
|---|---|---|
| Fitts: large button beside the input; fixed at the bottom on mobile | 48px gold button beside the URL field or under the textarea; on phones a fixed bottom bar holds it (with "إلغاء" while running). Screenshot `10-mobile-empty.png`. | Done |
| Hick: four tabs, no settings on the first screen, advanced behind "المزيد" | Four tabs. On phones the reviewer switch and history sit behind the "المزيد" menu. On wide screens the header shows the reviewer switch and history directly, as the page-layout section of the brief specifies. | Done |
| Miller: one-line summary; grouped by state with a chronological option | "9 استشهادات · 3 مؤيَّد · 1 مع ملاحظة · …" above the cards; groups ordered contradicted → not found → needs review → with note → supported; a two-way toggle switches to reading order (sorted by `position`). While cards are still streaming they stay in reading order so skeletons are replaced in place. | Done |
| Von Restorff: risky cards stand out | `contradicted` and `not_found` get a tinted red surface, a coloured ring and a large icon disc; supported cards are plain white with only the edge. They are also listed first. | Done |
| Jakob: familiar patterns | Tabs above the field, collapsible cards, details on click, sheet on mobile, menu for export. | Done |
| Progressive disclosure | Collapsed: state, type, quoted text, one line of reference (plus the timestamp chip). Expanded: rule note, word-level comparison, source text, verbatim grading(s) with scholar and book, source link, level, certainty, action, "ورد في الدقيقة 02:14", then accordions for the publisher's commentary, other sources and technical details. Screenshots `05-card-expanded-diff*.png`, `14-…png`. | Done |
| Peak-End: strong finish | Closing card with the summary, sources used, a prominent "تصدير التقرير" and "تحقّق من نص آخر". | Done |
| Zeigarnik: cards arrive progressively with skeletons | `claims` events create skeletons that already show the claim's type and text; each `card` event replaces its skeleton. `claims` is additive (upsert by id) and cards may arrive between `claims` events. | Done |

### Goal-directed design

| Brief | Implementation | Status |
|---|---|---|
| Two personas in this document | Section 1. | Done |
| Layers, surface last | Section 2. | Done |
| Modeless: no dialog interrupts the flow except export | Nothing opens by itself. Export is a menu, not a dialog. The one Dialog is the referral list, which the brief asks for and which only opens when the user presses "إحالة إلى أهل العلم". | Done |

### Lean UX / Hooked

| Brief | Implementation | Status |
|---|---|---|
| `docs/USABILITY_TEST.md`: five tasks, three people, notes table | Written (Arabic). **The sessions have not been run yet.** | Partial (plan only) |
| Trigger / action / reward / investment, ethical only | No sign-up; paste → verify; a sourced verdict; export and a local history of the last ten reports (`localStorage`, capped, clearable, never sent anywhere). No notifications, streaks, or engagement mechanics. | Done |

### Main page layout

| Brief | Implementation | Status |
|---|---|---|
| Header: logo + mark; عربي/English, dark toggle, "وضع المراجع" switch, "تصدير التقرير" only with a report | As specified. The export button appears when a finished report with at least one card exists. | Done |
| Permanent transparency line | Under the header on every state, small and muted. | Done |
| Input area: tabs + field + button + quick examples | As specified. Ctrl/⌘+Enter also submits. | Done |
| Processing: five-stage bar with stage name and skeletons | As above. | Done |
| Two panes on wide screens; sheet on mobile | From 1024px: transcript pane (sticky, scrolls internally) beside the report. Below: "عرض النص الأصلي" opens a bottom Sheet. Highlight → card and card → highlight both scroll and mark the target (a steady gold ring, so it survives reduced motion). Screenshots `03`, `11`, `12`. | Done |
| Timestamps; clickable for video | "الدقيقة 02:14" chip and "ورد في الدقيقة 02:14" in the details. For `video_url` sources they are links that open the video at that second in a new tab (YouTube `t=`, Vimeo `#t=`, media fragment otherwise). For uploaded files they are plain text. Only exercised with the mock video; no real video link was run end to end. | Done (mock only) |
| `not_found`: abstention message, verse from `/api/meta`, referral Dialog | The card shows the abstention line, the verse and its reference exactly as `/api/meta` serves them (never typed in the code), and the button opens a Dialog listing `referral_links`. Screenshot `06-…png`. | Done |
| Level D / level C | `personal_case` → "هذه حالة شخصية تستوجب فتوى من جهة مؤهلة" plus referral, visible without expanding. `disagreement_noted` → the disagreement note plus referral. | Done |
| Gradings | All `grades` are listed in the order received, each with its verbatim text, scholar, book and source link, with the line "وردت عدة أحكام… دون ترجيح" when there are several. The collapsed line shows the grading only when there is exactly one; with several it shows the count, so no single grading is singled out. `grade_unavailable` → "الحكم غير متاح من المصدر". | Done |
| AI text is labelled | `ai_explanation` renders in a dashed box titled "شرح مولَّد بالذكاء الاصطناعي · ليس مصدراً ولا حكماً، وقد يخطئ". The publisher's commentary is labelled as the source's, not Tabayyun's. | Done |
| `lexical_only` | A calm gold note, "تغطية مخفَّضة", with the backend's own message when it sent one. `dorar_unreachable` gets a one-line note of the same kind. Screenshot `13-…png`. | Done |
| `no_claims` | Its own friendly empty result with the backend's message, a hint and "تحقّق من نص آخر". Screenshot `15-no-claims-and-request.png`. | Done |
| Reviewer mode | Per card: state dropdown, note, reviewer name. Stored as `reviewer_overrides` (`card_id, original_state, state, note, reviewer, at`); the card's own state is never overwritten. Marked "حالة معدَّلة بمراجعة بشرية" with the original state, in the card, the summary and the export. Undo by toast or button. Screenshots `08-…png`. See "Decisions" for the limits placed on a reviewer. | Done |
| Export: JSON + printable HTML/PDF | JSON is built and downloaded in the browser. Printable HTML: the assembled `Report` is posted to `/api/export/html` and opened in a new tab; if that call fails, a standalone page is built in the browser instead (tested both ways). PDF is the browser's "print to PDF" from that page; no PDF file is generated directly. | Done (PDF via print) |
| Responsive, AA contrast, `aria-label` on icon buttons, keyboard, reduced motion | Tested at 1440px and 390px. `npm run a11y` runs two checks on the empty state, the error state, the report with every card expanded, reviewer mode and the referral dialog, in both themes and both languages: axe-core (WCAG 2.1 A/AA) reports no violations, and an own contrast pass over every visible text node finds none below AA (lowest ratio 4.8:1 light, 5.3:1 dark). The second pass exists because axe's contrast rule skips most Arabic text: its icon-ligature heuristic mistakes joined Arabic letters for an icon font. Every icon button has an `aria-label`; there is a skip link; tabs, menus, dialog and sheet are Radix primitives with full keyboard support. `prefers-reduced-motion` reduces every animation and transition to an instant change. Motion is 200–220ms, for entry and expansion only. Not tested with a screen reader. | Done (no screen-reader pass) |
| Screenshots of every state, reviewed against the checklist | `docs/screenshots/`, 24 files. Violations found in review and fixed are listed below. | Done |

### Performance targets

The targets (5 claims < 20s, 5-minute video < 90s, first card < 5s) depend on the backend. The
frontend adds no waiting: it renders each SSE event as it arrives and never buffers the stream.
**They were not measured here.**

## 4. Decisions and deviations

- **Dark text on the gold button.** The deck draws white on gold; that is 2.4:1 and fails AA. The
  button uses near-black on gold (7.4:1).
- **"Supported with a note", "needs review" and "not found" badges are tinted, not solid.** White on
  light green, amber or light red fails AA. Solid fills are kept for `supported` and
  `contradicted`, where white passes.
- **Limits on a reviewer's override** (in `allowedReviewerStates`, `src/lib/states.ts`). The export
  goes out under the tool's name, so the non-negotiable rules were applied to human overrides too:
  no "supported" state on a card that has no retrieved source; level C can only be "needs review"
  or "not found"; level D cannot be given a state at all. **This touches religious behaviour and
  needs Abdulaziz's confirmation**; it is one function to change.
- **The grading in the collapsed card** is shown only when there is one. Showing the first of
  several would be a preference.
- **Card order while streaming** is reading order; grouping by state applies when the report is
  complete, so nothing jumps while cards are arriving.
- **Mock mode** (`?mock=1` or `VITE_MOCK=1`) replays fixture streams. Every religious text in
  `src/mocks/fixtures.json` is read from `data/quran.json`, `data/hadeethenc.json` and the
  Open-Hadith-Data files by number or id by `frontend/scripts/build-fixtures.mjs`; none is typed.
  The two claims that would need an invented saying use a bracketed description, as the deck does.
- **History** stores the submitted text and the report in `localStorage` only. If the quota is
  exceeded the oldest reports are dropped.

## 5. Violations found in the screenshot review, and fixed

- The URL field's icon overlapped the link on phones (direction mismatch between wrapper and field).
- The transcript sheet overflowed the top of the phone screen (height class lost to a variant).
- The sort toggle wrapped onto two lines at 390px.
- A card that changed group after a reviewer edit collapsed and jumped out of view.
- Gray secondary text sat on the red-tinted cards and on the gold review panel.
- The "reviewer mode on" state in the header dropped white text to 4.06:1.
- The transcript pane grew with long texts instead of scrolling inside itself.
- The highlight after "show in text" vanished under reduced motion (it was animation-only).
- Spacing values outside the scale (2px, 10px, 40px) in own components.
- With two examples (real backend) the examples row was off-centre.

## 6. Known gaps

- No usability sessions have been run yet.
- No screen-reader pass.
- Switching to English after a report was produced in Arabic shows the English UI and `note_en`,
  but translations of source texts only exist if the verification itself ran with `ui_lang: "en"`.
- Timestamp links were only exercised against the mock video.
- shadcn's generated primitives keep some internal spacing values outside the 4/8/12… scale.

## 7. Phase 2 — F3 verdict card, F4 copy, F5 explainability

Brief: `docs/PHASE2_BRIEF.md`, sections F3–F5. Contract: "Phase 2 additions" in `docs/API.md`.
Each feature is hidden when its flag in `GET /api/meta` (`features.share_card`, `features.copy`,
`features.explain`) is `false`; a missing flag counts as on, like the `.env` default. Captures:
`docs/screenshots/phase2-*.png`, regenerated with `npm run screenshots:phase2` (add `REAL=1` for the
ones that need the backend).

### The three flows

**F4 — copy the correct text.** Card (collapsed or expanded) → "نسخ الآية" / "نسخ نص الحديث" /
"نسخ نص المصدر" → the clipboard holds `card.copy_text` exactly as the API built it → toast
«تم النسخ ✓» and a check mark on the button for two seconds. Report level: "تصدير التقرير" →
"نسخ التقرير كنص" → the whole report as Markdown on the clipboard → toast.

**F5 — «لماذا هذا الحكم؟».** Expand a card → the block already shows the rule in words → open it →
similarity against its threshold, the retrieved candidates, the content level and why, timing, data
version → the last line is always «حدود هذا الحكم».

**F3 — «مشاركة بطاقة التثبّت».** Button on a card, or on the closing summary → dialog with a live
preview → choose size (1080×1350, 1080×1080) and theme (light, dark) → on a device with a share
sheet: "مشاركة"; elsewhere: "تنزيل الصورة" and "نسخ الصورة" → toast. The language of the card is the
language of the interface.

### Brief bullet → implementation

| Brief (F4) | Implementation | Status |
|---|---|---|
| Ayah cards copy the Uthmani text in ﴿ ﴾ with [surah: ayah]; hadith cards copy source wording + reference + grading verbatim; `supported_with_note` copies the corrected wording, not the user's | The button copies `card.copy_text` unchanged; the frontend never builds this text itself. Checked: the clipboard equals the API's `copy_text` byte for byte, on mock fixtures and on the real backend, and differs from the quoted wording. The button is absent when `copy_text` is null. | Done |
| Toast "تم النسخ ✓" | Exactly that text (Arabic) / "Copied ✓" (English). | Done |
| Keyboard accessible | A real button; tested with focus + Enter. Where `navigator.clipboard` is missing or denied it falls back to a hidden textarea and `execCommand('copy')`, then restores focus and selection (tested by removing `writeText`). | Done |
| "Copy full report as text" in the export menu (Markdown) | `src/lib/markdown.ts`: summary line, then per card state, type, quoted text, source text, reference, gradings verbatim with scholar / book / narrator and link, level, certainty, action, note, timestamp, reviewer override when present, the F5 block; sources used and the transparency line at the end. The report date and video timestamps are kept (owner's decision). | Done |

| Brief (F5) | Implementation | Status |
|---|---|---|
| Collapsible section inside each expanded card | `ExplainPanel`, its own collapsible block. Collapsed, it shows the title and the rule sentence, so the reason is readable without another click. It replaces "تفاصيل تقنية" when the flag is on and `explain` is present; that item remains as the fallback. | Done |
| The human-readable rule that fired | `rule_ar` / `rule_en`, as the first thing in the block. The rule id and match type are listed further down. | Done |
| The similarity score | Both numbers printed ("التشابه 0.82", "العتبة 0.85"), a meter with a tick at the threshold, and the outcome as a word with an icon ("يبلغ العتبة" / "دون العتبة"). `role="meter"` with the same sentence as its value text. When no similarity was computed, it says so. | Done |
| Top 5 retrieved candidates with scores and sources | A table: rank, reference (a link), source name, excerpt, similarity (or "بالموضوع" when retrieved by topic), grading, and a "✓ المعتمد" mark on the chosen row. A stacked list on phones. "لم يُسترجَع أي مرشح" when empty. | Done |
| Content level and the classifier's one-line reason | Level, its name, the reason, and where the reason came from: "حُدِّد بقاعدة" or, for `level_reason_origin: "model"`, "تعليل المصنِّف الآلي، وليس حكماً شرعياً". | Done |
| Timing per stage | `match_ms` for the claim and `summary.stage_seconds` (ingest, extract, match, total). Under one second they are shown in milliseconds. | Done |
| Data snapshot/version | `explain.data_version`, verbatim. | Done |
| Always ends with a plain "حدود هذا الحكم" line generated from the rule | The last line of the block, plainly styled, from `limits_ar` / `limits_en`. | Done |
| Included in JSON/HTML export | JSON: `explain` travels inside each card. The client-side printable fallback and the Markdown report render the full block. The server's `/api/export/html` is the backend's. | Done (client side) |
| Legible, not a debug dump | Reviewed in `phase2-f5-*.png`: light, dark, English, phone, and on real backend data. | Done |

| Brief (F3) | Implementation | Status |
|---|---|---|
| Button on each claim card and on the report summary | "مشاركة بطاقة التثبّت" in each card's action row and in the closing summary card. | Done |
| PNG at 1080×1350 and 1080×1080 from an HTML template in the brand identity | `src/components/share/verdict-card.tsx`: a fixed 1080px template with its own palette and pixel sizes, so the output does not depend on the page theme or viewport. The dialog previews the same node scaled down; `html-to-image` draws it at full size. | Done |
| Contents: state badge (colour + icon + word), claim (truncated), verdict line, reference + grading verbatim, source domain, footer + app URL + QR | Follows the table "What a verdict card shows" in `docs/API.md`: claim cut to 240 characters with «…», verdict = first sentence of the note, `grades[0].text` with its source name and «+N», "الحكم غير متاح من المصدر" when unavailable, hostname of the source URL, QR of `meta.app_url ?? window.location.origin` drawn as inline SVG. The layout mirrors the server-side renderer. | Done |
| `not_found`: the abstention line with the Nahl 43 verse | The verdict line, then the verse and its reference from `meta.abstention_verse`, in Amiri Quran. Never typed in the code. | Done |
| No personal data, no timestamps, nothing identifying | No date or time, no reviewer name (a reviewed state shows only "حالة معدَّلة بمراجعة بشرية"), no video link or timestamp. Checked on a card whose report had all of these. The file name carries no date either. | Done |
| Client-side with a server-side fallback | If drawing throws, the same content is requested from `POST /api/share-card` and that PNG is used. Tested against the real backend by disabling the canvas: one call, and the card was delivered. | Done |
| Mobile: Web Share API with files; desktop: download + copy to clipboard; toast | `navigator.canShare({ files })` decides. Share sheet: the PNG file plus a one-line caption with the app address. Otherwise two buttons, download and copy image (`ClipboardItem`). A toast confirms each. The share-sheet path was exercised with `canShare`/`share` stubbed in headless Chromium; **it has not been run on a real phone.** | Done (no real-device run) |
| Light and dark; Arabic and English | Both themes and both sizes are choices in the dialog; the language follows the interface. | Done |
| Arabic renders correctly in the PNG | The generated files were opened and checked: shaping, right-to-left order, the Uthmani verse, no clipped text, long claims truncated, for all five states and the summary, both sizes, both themes, both languages (80 files). 20 are kept as `phase2-f3-card-*.png`: 19 drawn in the browser, plus the one the server fallback returned. Chromium only; Safari and Firefox output was not checked. | Done (Chromium only) |

**Accessibility.** `npm run a11y` now opens every «لماذا هذا الحكم؟» panel and the share dialog (claim
and summary cards, light and dark) before auditing: axe-core reports no WCAG A/AA violation and the
contrast pass finds no text below AA, including the text on the card preview.

### Decisions

- **Text that does not fit shrinks, it is never cut.** The card measures its body after layout and
  steps the type scale down until everything fits (tested with fields stretched far beyond anything
  realistic). Font sizes are whole pixels, because html-to-image redraws text at `floor(size) − 0.1px`
  and a fractional size re-wraps differently from the preview.
- **The summary card counts the states as shown**, reviewer changes included, and then carries the
  "حالة معدَّلة بمراجعة بشرية" mark. The same counts are sent to the server fallback.
- **The first grading on the card.** The contract puts `grades[0]` on the verdict card with «+N».
  In the report itself the collapsed card still shows only a count when there are several.
- **The copy button's label names what is copied** (verse, hadith text, source text), and its
  tooltip says it is the source's wording, not the wording as quoted.

### Violations found in review, and fixed

- The verse on a `not_found` card fell back to the UI font: the embedded-font CSS was cached from a
  card that had no verse.
- The verse's reference was drawn over the verse when it wrapped.
- A blank line appeared under the verdict in the PNG: fractional font sizes wrapped differently
  from the preview.
- The fit loop read stale sizes under `prefers-reduced-motion`: the global rule gave every element
  a 0.01ms transition, so layout measured right after a change returned the old value. The rule now
  sets `transition-duration: 0s`.
- On phones the preview overflowed the dialog: its frame was measured before the dialog's content
  had mounted.
- The source domain and the app address were left-aligned on Arabic cards.
- The size toggle's labels were cut at half width.
- `0 ث` four times in the timing row on fast runs: durations under a second are now milliseconds.

### Known gaps

- The share sheet was not run on a real phone, and the PNG was only inspected from Chromium.
- Copying an image needs `ClipboardItem` in a secure context; where it is missing the toast says to
  download instead.
- With no `PUBLIC_URL` the card prints and encodes the current origin (`localhost:…` in the captures).
