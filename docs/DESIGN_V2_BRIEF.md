# Design rebuild brief (v2) — as given by the team, 3 October 2026

Saved verbatim so the requirements stay next to the code. The plan, the review against Section 4 and
the screenshot critiques are in `DESIGN.md`.

---

The current UI is functional but looks dated and generic. Rebuild the frontend's visual layer completely. All functionality, routes, API contracts, and the rules in CLAUDE.md stay exactly as they are — this is a design rebuild, not a feature change. Work as the design lead of a studio known for giving each product a visual identity that can't be mistaken for anyone else's. The client has already rejected a generic result; "clean shadcn defaults" is the thing being rejected.

## 1. Process — do not skip the planning pass

Pass 1 — Design plan (write to docs/DESIGN.md before touching code):

- A token system: 5–6 named base colors with hex, the five state colors, type families and roles, a spacing scale, a radius scale where each radius means something (container vs. card vs. chip), shadow/border policy.
- A layout concept in one paragraph plus ASCII wireframes for: empty state, processing, report on desktop (≥1024), report on mobile.
- Three principles that make this page unmistakably Tabayyun.

Pass 2 — Review the plan against the "generic tells" list in Section 4. For every item that reads like the default you'd produce for any verification app, revise it and write what you changed and why. Only then build.

Pass 3 — Build, then critique with screenshots. After building, screenshot every state (empty, examples, processing, report desktop, report mobile, expanded card, reviewer mode, not-found card, error, dark mode) at 390px, 820px, and 1440px into docs/screenshots/v2/. Look at each one and write a 5-line critique in docs/DESIGN.md: what's memorable, what's noise, what's inconsistent. Fix, re-screenshot, and repeat twice. Before finishing, remove one decorative thing you added that the content didn't need.

## 2. Design direction — grounded in the subject, not in SaaS

Tabayyun verifies quoted sacred text. Its visual world is the Mushaf page and the scholar's margin: a Quran page from the Madinah Mushaf (a dense, perfectly set text block; gold ayah markers ۝; a restrained frame), the takhrij footnote under a hadith, the collation notes a muhaddith writes in a manuscript's margin when wording differs between copies. That tradition is about precision, calm, and authority — never decoration. That is the personality: precise, quiet, authoritative, warm. Not "tech startup", not "Islamic pattern wallpaper".

The one memorable element: the verified text itself. After verification, the user's text is set like a page with inline highlights and margin annotations — on wide screens each claim's verdict sits in the margin beside the line it refers to (a hashiya), connected by a hairline; on mobile the annotations become a stacked list under the text with tap-to-open sheets. Everything else on the screen is quiet so that this moment carries the product. The quoted sacred text inside a verdict is set larger and in a proper Naskh so the ayah or hadith looks like it belongs on a page, not in a chat bubble.

Typography (carries the identity):

- Sacred quoted text (ayah, hadith wording from the source): the King Fahd Complex Uthmanic/Naskh fonts from fonts.qurancomplex.gov.sa for ayat (they're in our approved package — load them with proper license notes in docs/LICENSES.md), and Amiri for hadith and source quotes. Set with generous line-height and full tashkeel.
- UI and body: IBM Plex Sans Arabic (Latin: IBM Plex Sans for the English mode). Two families, clearly distinct in role: Naskh = the text being verified; Plex = the tool talking.
- A real type scale (e.g. 14 / 16 / 20 / 26 / 34 / 44) with weight doing the hierarchy work, not size alone. Body line length under 75 characters. Arabic text is right-aligned, never justified.

Color: build from the brand — deep green ink #1B6B5E, near-black green ink #11221E for text, gold #C9A227 reserved for the verified mark only (like the gold of an ayah marker — it should feel earned, so it appears nowhere else). Background: a cool, clean white with the faintest green cast (#F5F8F7), surfaces pure white; dark mode is a deep green-black (#0B1A16), not grey. State colors must read as a family: verified (brand green), with note (olive), needs review (amber), not found (muted red), contradicted (deep red) — each paired with an icon and a word, never color alone. The verified badge uses a ۝-inspired ring glyph; this is the one place Mushaf ornament is allowed.

Layout: at the start, one centered column (max-width ~720px) with the input as a calm empty page — the input is the hero, no marketing hero above it. Headline is one line in Naskh: "فتبيّنوا — تحقّق قبل أن تصدّق أو تنشر". After verification the page widens into the text-and-margin layout. The header is a thin bar: logotype, language, theme, reviewer mode, export — nothing else. The transparency line is a quiet footer of the report, not a banner.

Motion: exactly one orchestrated moment — when results arrive, highlights "ink in" along the text in reading order and the margin notes settle into place (≈600ms total, respects prefers-reduced-motion). Cards appear as the SSE stream delivers them. Every other transition only answers a user action (expand, switch, confirm) and is 150–200ms. No hover-lift on cards, no fade-in-on-scroll, no floating blobs.

Copy: sentence case, plain verbs, the same word through the whole flow ("تحقّق" → progress "جارٍ التحقق" → "اكتمل التحقق"). Errors say what happened and what to do next. The empty state shows three real-looking examples (a forwarded-message snippet, a YouTube link, a fabrication request) as one-tap chips — no explanatory paragraphs.

## 3. What stays from the existing spec

The information architecture is unchanged: 5 input tabs (text / article link / video link / upload / image), five-stage progress, summary line, claim cards with progressive disclosure, "why this verdict" panel, authentic alternatives, share card, copy buttons, reviewer mode, export, transcript pane with timestamps, English mode, dark mode, PWA. Rebuild each on the new system; do not drop any.

Keep shadcn/ui as the component base but re-skin it fully through tokens (CSS variables, radius, shadows, fonts) so no component looks like the shadcn documentation. Tailwind with logical properties only (ps/pe/ms/me/start/end). dir="rtl", lang="ar", and mirrored icons where direction matters.

## 4. Generic tells — if the build contains any of these, it is not finished

- The SaaS card kit: everything chopped into identical rounded cards with the same radius and the same grey shadow. Cards exist only where grouping carries meaning; the report text block is a page, not a card.
- Gradient washes, glassmorphism blur panels, floating gradient blobs, neon glows.
- Islamic geometric pattern as wallpaper or section dividers.
- A hero section with a big number and small label, three "feature" tiles, or a marketing headline above the tool.
- ALL-CAPS tracked-out labels in English mode; "A · B · C" middle-dot meta strings (the summary line reads as a sentence: "أربعة استشهادات: اثنان مؤيَّدان، واحد مع ملاحظة، وواحد بلا مصدر"); "→" appended to buttons; numbered 01/02/03 markers anywhere except the five-stage progress (which is a real sequence).
- Cream #F4F1EA background with a serif display and terracotta accent; or near-black with a single acid-green accent.
- Fade-and-slide-up on every section; hover transforms on every card.
- Default shadcn zinc/slate palette or Inter as the Arabic UI face.
- Emojis as icons.
- Placeholder religious text invented for mockups — examples come from the approved sources or the test set only.

## 5. Quality floor (not negotiable, not announced in the UI)

Responsive from 360px; visible keyboard focus rings in brand color; AA contrast in both themes; aria-label on icon buttons; sheets and dialogs trap focus; reduced motion respected; Lighthouse accessibility ≥ 95 and performance ≥ 90 on the report page; no layout shift when cards stream in (reserve space with skeletons of the right height).

## 6. Deliver

Updated docs/DESIGN.md (plan, review notes, critiques), docs/screenshots/v2/, Lighthouse report in docs/, and a redeploy. Report back with: the three principles you chose, the one memorable element as built, what you removed in the final pass, and the public URL.

Start with Pass 1. Do not write component code until the plan has been reviewed against Section 4.

---

## Addendum

Replace the five input tabs with a single composer, but make its affordances explicit so no one mistakes it for a chatbot: a one-line purpose heading above it ("تحقّق من صحة الآيات والأحاديث في أي نص"); a placeholder that names every input type ("الصق نصاً أو رابط مقطع أو مقال، أو أرفق صورة من واتساب"); a visible row of labeled attach actions beneath the field — icon + word each: رابط / صورة / ملف / صوت — not a hidden "+"; automatic URL detection with an inline chip confirming what was recognized ("مقطع يوتيوب — سيُفرَّغ ويُتحقق منه"); a wide primary button labeled "تحقّق", never a send-arrow circle; and three example chips below that cover the input types (forwarded message with a hadith, a TikTok link, a WhatsApp screenshot). Collapsible local-history side panel is fine. Results render as a report page with margin annotations, never chat bubbles; no message box after results — only "تحقّق من نص آخر".
