# Design brief — binding UI requirements

This is the product owner's brief for the UI, kept verbatim. `docs/DESIGN_V1.md` records how it was
applied. The visual reference is `docs/deck-ui-reference.png` (page 7 of the accepted pitch deck).

## Design and UI — top standard; this is half the score in the demo

**Stack**: shadcn/ui (official install via `npx shadcn@latest init` then `add`), Tailwind with
logical properties (`ms-/me-/ps-/pe-/start/end`, never `ml/mr`), `dir="rtl"` on `<html>` with
`lang="ar"`, **IBM Plex Sans Arabic** (web) with Noto Sans Arabic fallback; Inter for English. Light
and dark modes via shadcn CSS variables, brand identity from the deck: primary deep green `#1B6B5E`,
accent gold `#C9A227`, background `#F6F7F5`, text `#0F1F1B`. Do not ship shadcn's default colors
unmodified.

Components: `Tabs`, `Card`, `Badge`, `Button`, `Textarea`, `Input`, `Progress`, `Skeleton`,
`Tooltip`, `Collapsible`, `Accordion`, `Sheet` (source details on mobile), `Dialog`, `Switch`,
`ScrollArea`, `Separator`, `DropdownMenu`, `Sonner` for toasts, `Command` optional. Icons from
`lucide-react`.

**Binding design rules** (distilled from The Design of Everyday Things, Don't Make Me Think,
Refactoring UI, Laws of UX, 100 Things Every Designer Needs to Know About People, About Face, The
Elements of User Experience, Lean UX, Sprint, Hooked). Apply as a checklist, not slogans:

### Self-evidence (Krug, Norman)
- The first screen is understood in 5 seconds with no instructions: one headline "تحقّق قبل أن تصدّق
  أو تنشر", one large input, one primary button "تحقّق". No explanatory text longer than one line.
- Every clickable element looks clickable (signifiers); no links in body-text color.
- Every action gets immediate feedback within 100ms (button press → loading state on the button
  itself), and visible progress within 400ms (Doherty threshold): a five-stage progress bar with the
  current stage name and an estimated time.
- Errors in human language that say what happened and what to do now ("تعذر تحميل هذا المقطع من تيك
  توك — ارفع الملف أو الصق التفريغ"), placed where the error occurred, not in a modal. No
  unnecessary confirmations. Undo available in reviewer mode.

### Visual hierarchy (Refactoring UI)
- Spacing scale 4/8/12/16/24/32/48. Only two heading sizes inside the report; hierarchy by weight
  and color, not size.
- Secondary text is dark gray on light; **never** gray text on colored backgrounds (use the same hue
  with opacity).
- State is expressed in three layers: badge color + icon + word (never color alone — colorblind
  accessibility).
- Light borders and soft shadows on cards; no heavy borders. Labels secondary, values primary
  ("المرجع:" small gray, the reference value regular dark).
- Designed empty state: before input, show 3 clickable examples (text with a verse and a hadith, a
  YouTube link, a fabrication request) that fill the field instantly.

### UX laws (Laws of UX, 100 Things)
- Fitts: the "تحقّق" button is large and adjacent to the input; on mobile, fixed at the bottom.
- Hick: only 4 input tabs, no settings on the first screen. Advanced options behind "المزيد".
- Miller/chunking: a one-line report summary "4 استشهادات · 2 مؤيَّد · 1 مع ملاحظة · 1 بلا مصدر"
  above the cards; cards grouped by state with an option to sort chronologically.
- Von Restorff: the riskiest cards (`contradicted` / `not_found`) stand out visually more than green
  ones.
- Jakob: familiar patterns — tabs above the field, collapsible cards, details on click.
- Progressive disclosure: collapsed card shows (state, type, text as quoted, one-line reference);
  expanded shows (original text, word-level highlighted diff, verbatim grading with scholar, source
  link, level, action, "ورد في الدقيقة 02:14").
- Peak-End: a strong finish — summary card at the bottom + prominent "تصدير التقرير" + "تحقق من نص
  آخر".
- Zeigarnik: cards appear progressively via SSE as each is ready (no waiting for all) with Skeletons
  for the rest.

### Goal-directed design (About Face, Elements of UX)
- Two personas in `docs/DESIGN_V1.md`: "Primary user" (a da'i / content creator reviewing before
  publishing — needs the full report, export, reviewer mode) and "Extended user" (a Muslim who heard
  a hadith in a clip — needs a clear answer readable in under 3 seconds). The first screen serves
  the second; depth serves the first.
- Layers: strategy (verification) → scope (4 inputs, 5 states) → structure (one linear journey) →
  skeleton (page layout below) → surface (brand). Do not start with the surface.
- Modeless interaction: no dialogs interrupt the flow except for export.

### Lean UX / Sprint
- After P0 is complete, create `docs/USABILITY_TEST.md`: 5 tasks for 3 people to try tonight (paste
  text and understand the result / open a hadith's details / try a YouTube link / export the report
  / switch to English) with a notes table.

### Hooked — ethical parts only
- Trigger: instant input, no sign-up. Action: paste → verify. Reward: a clear, sourced verdict.
  Investment: export the report, plus a local browser history (localStorage) of the last 10
  verifications. **No** dark patterns, notifications, or artificial engagement mechanics.

## Main page layout (match page 7 of the deck)

- Header: "تبيّن" logo + mark; on the opposite side: عربي/English, dark-mode toggle, "وضع المراجع"
  (Switch), "تصدير التقرير" (visible only when a report exists).
- Permanent transparency line under the header, small and unobtrusive: "تبيّن أداة مدعومة بالذكاء
  الاصطناعي، لا تغني عن الرجوع إلى أهل العلم".
- Input area: Tabs (نص / رابط مقال / رابط مقطع / رفع ملف) + field + "تحقّق" button + quick examples.
- During processing: five-stage progress bar with stage name and card Skeletons.
- After processing, on wide screens two panes: transcript/text (timestamps, claims highlighted in
  their state color, click scrolls to and highlights the card) + verification report. On mobile, one
  pane with a "عرض النص الأصلي" button opening a Sheet.
- `not_found` cards carry the abstention message with the abstention verse (An-Nahl 43, text served
  by `GET /api/meta` — never typed by hand) and a "إحالة إلى أهل العلم" button opening a Dialog with
  links to islamqa and binbaz.
- Reviewer mode: in each card a dropdown to change the state + note field + reviewer name; stored as
  `reviewer_override` and shown in the export as "حالة معدَّلة بمراجعة بشرية", with undo.
- Export: JSON + printable HTML/PDF page with full attribution.
- Fully responsive, at least AA contrast, `aria-label` on every icon button, keyboard navigation,
  `prefers-reduced-motion` respected. Subtle motion (150–250ms) only for entry and expansion.

After building the UI: run it in the browser, take screenshots of every state (empty, loading,
report, error, mobile, dark), save them in `docs/screenshots/`, review them against the checklist
above, and fix violations.

## Evidence states (labels, colours, actions)

| state | Arabic label | colour | action |
|---|---|---|---|
| `supported` | مؤيَّد بمصدر معتمد | green | اعتماد |
| `supported_with_note` | مؤيَّد مع ملاحظة | light green | تصحيح اللفظ |
| `needs_review` | يحتاج مزيد تحقق | amber | إحالة إلى أهل العلم |
| `not_found` | لم يُعثر على مصدر موثوق | light red | حذف أو طلب مصدر |
| `contradicted` | مخالف للمصدر | dark red | حذف وتنبيه |

Claim types: `ayah` آية · `hadith` حديث · `ruling` حكم · `attributed_quote` قول منسوب · `fact` معلومة
· `request` طلب دليل. Content levels: A أصلي مستقر · B شرح وتعريف واستدلال · C خلافي أو عالي الحساسية
· D فتوى أو حالة شخصية. Certainty: `definitive` قطعي · `ijtihadi` اجتهادي.

Five stages (deck page 5): 1 الحصول على النص · 2 استخراج الادّعاءات · 3 المطابقة مع المصادر ·
4 تحديد حالة الدليل · 5 تقرير التحقق.

## Performance targets

A text with 5 claims < 20 s; a 5-minute video < 90 s; first card visible in < 5 s via SSE.
