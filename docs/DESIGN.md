# Design — the page and its margin (v2)

The brief is `DESIGN_V2_BRIEF.md` (kept verbatim). This document is the plan written before any
component code (Pass 1), the review of that plan against the brief's list of generic tells
(Pass 2), and the screenshot critiques (Pass 3). The personas, the five layers and the record of
the first UI are in `DESIGN_V1.md`; they still hold — the people and the journey did not change,
the surface did.

## 1. Three principles

1. **The page, not the card.** The user's own text is the interface. It is set as a page — one
   block of Naskh on a sheet with a hairline frame — and every verdict is a note in its margin, tied
   by a hairline to the words it is about. Nothing is boxed unless it lies over the page (a sheet,
   a dialog, a menu).
2. **Two voices that never mix.** Naskh is the text under examination and the words of the
   sources. Plex is the tool speaking about them. A reader can tell at a glance which words belong
   to a verse, a narration or the user, and which belong to Tabayyun — the same line the product
   draws in its rules (the tool never speaks in a source's voice).
3. **Gold is earned.** There is exactly one gold thing: the ring that closes a verified quotation,
   as the marker closes an ayah. No gold button, focus ring, selection, logo or flash. Everything
   else is ink on paper, and a state is always a word and a glyph before it is a colour.

## 2. Tokens

### 2.1 Base colours

| Name | Light | Dark | Role |
|---|---|---|---|
| `desk` | `#F5F8F7` | `#0B1A16` | the surface the sheet lies on (page background) |
| `paper` | `#FFFFFF` | `#10231E` | the sheet, overlays |
| `ink` | `#11221E` | `#E7EFEB` | text |
| `quiet` | `#4F615B` | `#9DB1AA` | secondary text (the tool's asides) |
| `green` | `#1B6B5E` | `#7DBFB0` text, `#1F7867` fills | the tool's own ink: actions, links, focus ring, the verified state |
| `rule` | `#D3DDD9` hairlines, `#7C8F88` field edges | `#24392F`, `#6A857A` | frames, separators, connectors; the stronger value wherever a boundary must be seen (3:1) |
| `gold` | `#C9A227` | `#D9B648` | the verified ring — nothing else |

Dark mode is a deep green-black, not grey, and its green is a muted sage (`#7DBFB0`), not a bright
mint: a near-black screen with one acid accent is a tell (Pass 2, item 6).

### 2.2 The five states — one family

The hue walks from the brand green through olive and amber to two reds; lightness and chroma stay
close so they read as siblings. Each state has `solid` (glyph, underline), `ink` (words) and `soft`
(the tint behind an active highlight). A state is never colour alone: glyph + word always.

| State | Word | Glyph | solid / ink / soft (light) | solid / ink / soft (dark) |
|---|---|---|---|---|
| `supported` | مؤيَّد | gold ring with a green check | `#1B6B5E` `#14584D` `#E4F0EC` | `#6FC3A9` `#9AD9C5` `#16332B` |
| `supported_with_note` | مؤيَّد مع ملاحظة | ring (ink, no gold) with a dot | `#6E7B1E` `#56611A` `#EFF2DC` | `#B3C25A` `#CBD784` `#2A3219` |
| `needs_review` | يحتاج مراجعة | open half-ring | `#A66A00` `#7A4E00` `#FAEFD4` | `#E0A63A` `#EFC670` `#3A2E14` |
| `not_found` | لا مصدر | broken ring (a gap) | `#B5524A` `#8F3B34` `#F8E8E5` | `#E08A80` `#F0ACA4` `#3A2421` |
| `contradicted` | مخالف للمصدر | ring struck through | `#8C1D18` `#73130F` `#F2D9D6` | `#E0605A` `#F4A29D` `#3F1D1B` |

Every text pair was computed: ink on paper, desk and soft is at least 5.9:1 in light and 7.4:1 in
dark; every solid is at least 4.4:1 against paper. Gold on white is 2.4:1 and therefore carries
no meaning by itself: the check inside the ring and the word «مؤيَّد» are green.

The five glyphs are one drawing — a ring — in five conditions (closed and checked, closed with a
dot, half open, broken, struck). They are our own SVGs, 1.5px stroke, drawn on a 20px grid.

### 2.3 Type

| Family | Role | Where |
|---|---|---|
| **Amiri Quran** | the Mushaf's words | a verse quoted from the source, 26/2.3 |
| **Amiri** (400, 700) | the text being verified and the words of other sources | the page (20/2.0), narrations and source quotes (22/2.0), the headline (44 → 34 on phones, 700) and the logotype |
| **IBM Plex Sans Arabic** (400, 500, 600) + **IBM Plex Sans** for Latin | the tool talking | everything else |

Scale: **14 / 16 / 20 / 26 / 34 / 44**. Weight does the hierarchy before size: 400 for reading,
500 for labels and controls, 600 for the few titles. Arabic is right-aligned and never justified.
The page measure is at most 36rem (about 65 characters at 20px); the tool's paragraphs stay under
34rem. Numbers that line up (timestamps, similarity) use Plex's tabular figures; there is no
monospace family.

**The King Fahd Complex fonts are not used for verses — tested, not assumed.** The Complex's
Uthmanic Hafs font (v3.0, from its developer files) is built for the Complex's own digital text.
Our verses are the Tanzil Uthmani text, which encodes the same Mushaf with different code points
(6,158 of 6,236 verses differ; the sukun alone is U+0652 in ours and U+06E1 in theirs). Set in the
Complex's font, our text renders differently from the Complex's own text in 288 of 300 sampled
verses and shows stray filled circles where the silent-letter mark stands
(`screenshots/v2/font-test-kfgqpc-vs-amiri.png`). A product about exact wording cannot show a
verse with wrong marks, so verses stay in Amiri Quran, which is drawn for this encoding. The
Complex's general Naskh (Uthman Taha Naskh v2.0) lacks 14 Quranic characters, including alef
wasla, so it cannot set them either. Using the Complex's font properly means also switching the
*displayed* Mushaf text to the Complex's dataset — a source change that needs the team's and the
Sharia reviewer's decision, so it is listed in `DECISIONS.md` rather than done inside a visual
rebuild. Both Complex fonts allow free use, copying and distribution, unmodified (licence text in
the font files).

### 2.4 Space, radius, edges, motion

- **Spacing**: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 72. The sheet's inner margin is 48 (desktop), 32
  (tablet), 20 (phone). The gutter between text and margin is 32.
- **Radius — each one means something**:
  `2px` *sheet*: paper — the page, the composer field (it is part of the page);
  `6px` *control*: something you press — buttons, menu items, the file row;
  `999px` *tag*: a label attached to something else — example chips, the recognised-link chip;
  `14px` *overlay*, top corners only: a sheet that slides over the page. Dialogs and menus use 6px.
- **Edges**: hairlines only (1px `rule`). The sheet has a single hairline frame. A margin note has
  no box: a 2px tick of its state colour on its text-side edge and nothing else.
- **Shadow**: one token, used only by things that lie over the page (sheet, dialog, menu). Nothing
  in the flow of the page has a shadow.
- **Motion**: one orchestrated moment — when the report is complete the underlines ink in along
  the text in reading order and the margin notes settle (≤ 600ms in total, each underline 240ms,
  staggered). Everything else answers a user action in 150–200ms (open a note, switch language,
  confirm as reviewer). No hover lift, no fade-on-scroll, no shimmer. `prefers-reduced-motion`
  removes the orchestrated moment entirely.

## 3. Layout

One sheet of paper on a desk. Before verification the sheet is narrow (720px) and almost empty:
a one-line Naskh headline, then the composer as the first lines of the page, its labelled attach
actions, the wide «تحقّق» button, and three example chips. While the request runs, the same sheet
shows the five stages as one line and the text is laid out as soon as it arrives, on faint ruled
lines that reserve the height. When the report is complete the sheet widens: the text block on the
start side, and beside it the margin, where each claim's note sits level with the line it is about
and is tied to its underline by a hairline. Opening a note unfolds the source's words, the takhrij
line, the collation and the actions in place. Under the text, the sheet ends with a quiet footer:
the transparency line and «تحقّق من نص آخر». On a phone there is no margin: the notes follow the
text as a list, each starting with the words it is about, and open as a sheet from the bottom.

Diagrams are drawn right-to-left, as the Arabic UI is (the start side is the right).

### 3.1 Empty state

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ع | EN   ◐   وضع المراجِع ○                                            تبيّن │  thin bar, hairline under it
└──────────────────────────────────────────────────────────────────────────────┘
              ┌────────────────────────────────────────────────┐
              │                                                │   the sheet, 720px
              │        فتبيّنوا — تحقّق قبل أن تصدّق أو تنشر        │   Amiri 700, 44
              │                                                │
              │     تحقّق من صحة الآيات والأحاديث في أي نص       │   the field's label, Plex 16/500
              │  ┌──────────────────────────────────────────┐  │
              │  │ الصق نصاً أو رابط مقطع أو مقال…             │  │   composer: ruled lines, Amiri 20
              │  │ ________________________________________ │  │
              │  │ ________________________________________ │  │
              │  │ ________________________________________ │  │
              │  └──────────────────────────────────────────┘  │
              │  [ مقطع يوتيوب — سيُفرَّغ ويُتحقق منه  × ]         │   shown when a link is recognised
              │    صوت ♪     ملف ▤     صورة ▣     رابط ⛓        │   labelled attach actions
              │  ┌──────────────────────────────────────────┐  │
              │  │                  تحقّق                    │  │   wide primary button, green
              │  └──────────────────────────────────────────┘  │
              │  جرّب: (رسالة محوَّلة فيها حديث) (رابط مقطع) (طلب اختلاق حديث) │   example chips
              │                                                │
              │  آخر ما تحققتَ منه (٣)                           │   opens the local-history panel
              │ ────────────────────────────────────────────── │
              │  تبيّن أداة مدعومة بالذكاء الاصطناعي، لا تغني عن   │   transparency line: the sheet's footer
              │  الرجوع إلى أهل العلم                            │
              └────────────────────────────────────────────────┘
```

### 3.2 Processing

```
              ┌────────────────────────────────────────────────┐
              │  جارٍ التحقق — مطابقة المصادر            [ إلغاء ] │   one sentence, the current stage named
              │  ①━━━━━②━━━━━③━━━━━④┄┄┄┄┄⑤                     │   five stages: the only numbered thing
              │  النص  الاستخراج  المطابقة  الحكم  التقرير          │
              │ ────────────────────────────────────────────── │
              │  قال الخطيب في أول خطبته إن …                    │   the text appears as soon as it arrives
              │  ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾ │   …on ruled lines that hold the height
              │  ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾ │   until it does
              │  ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾                   │
              └────────────────────────────────────────────────┘
   Notes that are already decided (verbatim verses and narrations) take their place in the margin
   at once, at their final height; the rest are held by a placeholder of the same height.
```

### 3.3 Report, desktop (≥ 1024)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ع | EN   ◐   وضع المراجِع ○   تصدير ⤓                                                    تبيّن │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │  [ تحقّق من نص آخر ]        أربعة استشهادات: اثنان مؤيَّدان، واحد مع ملاحظة، وواحد بلا مصدر │
   │ ────────────────────────────────────────────────────────────────────────────────────── │
   │        the margin (22rem)                 │            the text (≤ 36rem)              │
   │                                           │                                            │
   │  ◎ مؤيَّد — آية                            │  قال الخطيب في أول خطبته: قال الله تعالى     │
   │  ▏البقرة: 183                    ─────────┼─ ﴿يا أيها الذين آمنوا كتب عليكم الصيام﴾ ◎   │
   │                                           │  ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾     │
   │  ◌ لا مصدر — حديث                          │  ثم ذكر أن النبي ﷺ قال: «…» وأضاف أن         │
   │  ▏لم يُعثر على مصدر موثوق         ─────────┼─ ‾‾‾‾‾‾‾‾‾‾‾‾                               │
   │                                           │                                            │
   │  ◎ مؤيَّد مع ملاحظة — حديث  (open)          │  وقال في آخرها: «…»                         │
   │  ▏┌ the source's words, Amiri 22 ───┐─────┼─ ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾                        │
   │  ▏│ عن أبي هريرة … قال: «…»         │     │                                            │
   │  ▏└─────────────────────────────────┘     │                                            │
   │  ▏رواه البخاري (1904) — «صحيح»، الدرر     │                                            │
   │  ▏في النص: … / في المصدر: …               │                                            │
   │  ▏نسخ النص الصحيح   بطاقة مشاركة            │                                            │
   │  ▏لماذا هذا الحكم؟ ▾                       │                                            │
   │ ────────────────────────────────────────────────────────────────────────────────────── │
   │  تبيّن أداة مدعومة بالذكاء الاصطناعي، لا تغني عن الرجوع إلى أهل العلم                         │
   └────────────────────────────────────────────────────────────────────────────────────────┘
   For a clip, each transcript segment carries its time in the outer gutter of the text block
   (tabular figures, a link to that second), like line numbers in a critical edition.
```

Between 768 and 1023 the same layout holds with a 16rem margin and shorter collapsed notes (state
and reference only).

### 3.4 Report, phone

```
┌──────────────────────────────┐
│ ع|EN  ◐  ⋯               تبيّن │   reviewer mode and export move into ⋯
├──────────────────────────────┤
│ أربعة استشهادات: اثنان مؤيَّدان، │
│ واحد مع ملاحظة، وواحد بلا مصدر  │
│ ──────────────────────────── │
│ قال الخطيب في أول خطبته: قال   │   the page, Amiri 19/2.0
│ الله تعالى ﴿يا أيها الذين…﴾ ◎  │   tapping an underlined passage opens its sheet
│ ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾   │
│ ثم ذكر أن النبي ﷺ قال: «…»     │
│ ──────────────────────────── │
│ الحواشي                        │   the notes, in the order of the text
│ ◎ مؤيَّد — «يا أيها الذين آمنوا…» │   each starts with the words it is about
│    البقرة: 183               ‹ │
│ ◌ لا مصدر — «…»               ‹ │
│ ──────────────────────────── │
│ [      تحقّق من نص آخر       ] │
│ تبيّن أداة مدعومة بالذكاء…      │
└──────────────────────────────┘
        ╭──────────────────────╮      a note opens as a sheet from the bottom:
        │ ◎ مؤيَّد مع ملاحظة      │      the source's words in Naskh, the takhrij line,
        │ the source's words…  │      the collation, the actions
        ╰──────────────────────╯
```

## 4. What each existing part becomes

Nothing is dropped; every part of the first UI is rebuilt on the tokens above.

| Part | Becomes |
|---|---|
| Header | a 48px bar in `paper` with a hairline under it: the logotype (Amiri 700), language, theme, reviewer switch, export (only when there is a report). On phones the last two fold into one menu. No green slab, no blur. |
| Input tabs | **one composer** (addendum): the purpose line as the field's visible label; a placeholder that names the inputs; labelled attach actions (رابط / صورة / ملف / صوت); a link is recognised as typed and confirmed by a tag («مقطع يوتيوب — سيُفرَّغ ويُتحقق منه», «رابط مقال — سيُقرأ نصه ويُتحقق منه»); a chosen file shows as a row with its name, size and a remove button; a wide «تحقّق» button. After a report there is no field — only «تحقّق من نص آخر». |
| Examples | three chips from `/api/meta` (never typed here): a forwarded-message text with a narration, a clip link, a request to fabricate. |
| History menu | a side panel that opens from «آخر ما تحققتَ منه»; local to the browser, with «مسح السجل». |
| Progress panel | one sentence naming the stage, a five-step line (the only numbering in the product), a cancel button. |
| Transcript pane + cards list | **the page and its margin** (section 3.3). The pane stops being a scrolling card beside a list: it is the sheet itself. |
| Highlight in the text | a 2px underline in the state's colour that draws in along the reading direction; the words take the state's ink (rubrication); the passage ends with the state's ring glyph — gold only for «مؤيَّد». A soft tint appears behind it only while its note is open or focused. |
| Claim card | **a margin note**: state glyph and word, claim type, one line of reference. Open, it shows in order: the source's words (Amiri Quran for a verse, Amiri for a narration) between two hairlines; the takhrij line (book, number, link; the grading in the source's words with its scholar and link, or «الحكم غير متاح من المصدر»); the collation («في النص / في المصدر», differing words underlined); the recommended action as a sentence; the actions (نسخ النص الصحيح، بطاقة مشاركة، لماذا هذا الحكم؟); the referral for unanswered and personal cases. |
| Summary line | a sentence with number words and agreement: «أربعة استشهادات: اثنان مؤيَّدان، واحد مع ملاحظة، وواحد بلا مصدر». Each clause filters the notes when pressed. |
| Sort toggle | removed from the desktop margin (notes are in the order of the text by construction); on phones the list keeps «حسب الترتيب / الأهم أولاً». |
| Reviewer mode | each open note gains the reviewer's line: confirm, change the state, add a remark; a changed note shows both the tool's state and the reviewer's, as before. |
| Why this verdict / copy / share card | same content and behaviour, re-set in the new type; the share card's gold is confined to the verified ring. |
| Reduced-coverage and source notices | sentences at the top of the margin, in `quiet`, with the state's glyph — not banners. |
| Errors | inside the sheet, where the result would have been: what happened, then what to do, with the action as a button. |
| Transparency line | the sheet's footer in every state. |
| Dark mode, English mode | tokens above; English uses IBM Plex Sans, sentence case, no tracked capitals. |

## 5. Where this plan departs from the brief, and why

- **King Fahd Complex fonts**: not used for verses (section 2.3) — the test shows wrong marks.
- **Image input, authentic alternatives, PWA** are named in the brief as existing parts. They are
  Phase 2 features F1, F2 and F6 and have not been built; this rebuild cannot restyle what does
  not exist and the brief rules out new features. The composer has the «صورة» action and the
  third example chip ready behind `features.image`; they appear when the backend offers it.
  Until then the placeholder does not promise a picture.
- **Example chips** come from `/api/meta`, which offers a text, a clip link and a fabrication
  request. A TikTok link and a WhatsApp screenshot need a real, configured example each.
- **«رابط» and «صوت» actions**: a link needs no upload, so «رابط» puts the cursor in the field and
  pastes the clipboard's link when the browser allows; «صوت» and «ملف» open the same picker with
  different filters.

## 6. Pass 2 — the plan against the generic tells

For each item of Section 4 of the brief: what the first draft of this plan had, and what changed.

| # | Tell | What the first draft had | What changed, and why |
|---|---|---|---|
| 1 | The card kit | Margin notes as bordered, rounded boxes; the composer as a card on the desk; examples as three tiles with icons (as in v1). | Notes lost their box (a 2px state tick only); the composer became part of the sheet; examples became chips on one line. Only overlays keep a surface and a shadow. A note is not a container — it is a remark beside a line. |
| 2 | Gradients, glass, glows | A sticky header with a blurred translucent background (the usual default). | Solid `paper` and a hairline. The underline's draw-in is a solid colour revealed by width, not a wash. |
| 3 | Geometric pattern | A double-rule frame with corner pieces, "like a Mushaf frame". | One plain hairline, no corners. The frame's job is to say "this is a sheet"; an ornate one would say "Islamic app". The ring glyph is the single piece of Mushaf ornament, and it carries meaning. |
| 4 | Marketing hero | The headline, then a line of explanation, then counters of what the tool checks. | The headline alone; the purpose line became the field's label. No counters, no feature tiles. |
| 5 | Caps, middle dots, arrows, 01/02/03 | Collapsed notes numbered ١ ٢ ٣ to pair them with highlights; a meta line «حديث · البخاري · 1904»; counts as chips. | Notes are tied to their words by a hairline (desktop) or begin with those words (phone) — no numbers. References read as phrases («رواه البخاري (1904)»). The summary is a sentence with number words. Numbers remain only on the five stages. |
| 6 | Cream + terracotta, or black + acid green | Dark mode with the brand green brightened to a mint accent on near-black. | The accent in dark mode is a muted sage and the surfaces are green-black; state inks carry the colour. |
| 7 | Fade-and-slide everywhere | The `rise` animation v1 puts on every card; skeleton shimmer. | Removed. One orchestrated moment; placeholders are still ruled lines. |
| 8 | Default palette, Inter | Inter for English (v1). | IBM Plex Sans; every shadcn component reads the tokens above (radius, edges, type), so none looks like its documentation. |
| 9 | Emoji as icons | — | None. Lucide line icons for actions, our own ring glyphs for states. |
| 10 | Invented religious text | — | Examples come from `/api/meta`; mock mode replays `fixtures.json`, which is generated from the source data. |

Two more defaults were caught that the list does not name:

- **Highlighter-pen backgrounds** on quoted passages (every annotation tool). Replaced by what a
  copyist does: an underline in coloured ink, the words themselves in that ink, and a closing mark.
- **Pill badges for state** (traffic-light chips). In the margin the state is a word in ink beside
  its glyph; pills remain only where something is a tag of something else.

## 7. Pass 3 — critiques

Each round: look at the screenshots, write what is memorable, what is noise and what is
inconsistent, fix, capture again. The captures in `screenshots/v2/` are always the latest round.

### Round 1 — the first build

Looked at 14 of the 30 captures in this round (every state at 1440 except the dark empty state;
report, open note and empty at 390; report and open note at 820). The rest were looked at in round 2.

**Empty and examples (1440, 390).**
- Memorable: the Naskh headline over an almost bare sheet; the field ruled like writing paper.
- Memorable: the recognised-link tag says what will happen («مقطع يوتيوب — سيُفرَّغ ويُتحقق منه»).
- Noise: nothing to remove yet; the three chips and the footer line are the whole of the rest.
- Inconsistent: a pasted link is set in Amiri — a URL is the tool's business, not text under examination.
- Inconsistent: the header's content sits in a wide centred box that lines up with nothing on a 720px sheet; the reviewer switch looks on when it is off.

**Processing (1440).**
- Memorable: the text is already a page while the verdicts are still coming; decided notes are in place beside undecided ones.
- Works: the five stages are the only numbered thing on the screen, and they read as a sequence.
- Noise: the connectors of the pending notes already form a fan (see the report).
- Inconsistent: pending notes carry a hairline under each, decided notes a coloured tick — two languages for one object, acceptable only because one is a placeholder.
- No shift when a verdict lands: the placeholder and the note have the same height.

**Report (1440, 820, 390).**
- Memorable: at 820 this is the product — every note level with its passage, a short tie, coloured ink in the text, times in the outer gutter like line numbers.
- Noise at 1440: a collapsed note (two lines, 58px) is taller than a line of text (40px), so notes drift down and their ties pile into a fan of nested elbows in the gutter.
- Noise: the tie starts at the end of the passage and runs under the following words before it reaches the gutter; it reads as a stray underline.
- Works at 390: the list of notes begins each item with the words it is about; no numbering was needed.
- Inconsistent: none in colour or type — the summary sentence, the underlines and the notes use the same five inks.

**Open note (1440, 820, 390).**
- Memorable: the source's words between two hairlines in Naskh, then the takhrij line and the grading in the source's own word — it reads like a page excerpt, not a card.
- Noise: in a partial quotation nearly every word of the source carries a dotted underline to say "not quoted"; the eye sees dots, not the hadith.
- Noise: with a note open the others are pushed below the text and their ties become a bundle of long verticals.
- Noise: a sparkle icon marks the AI explanation — the stock sign for "AI"; the label already says it in words.
- Inconsistent at 820: a 16rem margin makes an open note a long, narrow column while the same content on a phone gets a full-width sheet.

**Reviewer mode (1440).**
- Works: the reviewer's line sits at the foot of the open note and the summary says one citation was reviewed by a person.
- Works: a changed note shows both states, the tool's and the reviewer's.
- Noise: the same bundle of ties as in every open note.
- Inconsistent: three buttons in two rows where the narrow margin breaks them unevenly.
- The collation («في النص / في المصدر») with the differing words underlined is the clearest thing on the screen.

**Not found (1440).**
- Memorable: the abstention is typographic — the sentence «لا نُصدر حكماً بلا مصدر، ولا نولّد بديلاً», then the verse from the source data in Amiri Quran, then the referral. Nothing is offered in place of a source.
- Works: muted red is clearly a sibling of the deeper red of «مخالف للمصدر», and both differ from amber at a glance.
- Noise: the ties again.
- Inconsistent: none.
- The referral is the only filled button in the note, which is right: it is the one thing to do.

**Error (1440).**
- Works: what happened, then what to do, with the two remedies as buttons, inside the sheet where the result would have been.
- Works: the field keeps the link, so nothing has to be typed again.
- Noise: red edge on the field, red tick on the message, and the link tag still promising «سيُفرَّغ» — after a failure the tag should not promise.
- Inconsistent: the link in Amiri, as above.
- The message is dismissible and the composer stays usable.

**Dark (report, 1440).**
- Works: green-black, not grey; the sheet is one step lighter than the desk and still reads as paper.
- Works: the state inks keep their order of alarm; amber is the brightest and it is the one that asks for a human.
- Noise: none beyond the ties.
- Inconsistent: none found.
- The gold ring is more visible here than in light mode, where it is deliberately faint.

**Fixes sent for round 2**: one-line collapsed notes no taller than a text line; resting ties only
as a short stub in the gutter, none for a displaced note, the full tie in state colour on
hover/focus/open; notes open in the bottom sheet below 1024; quoted words in ink and the rest of
the source in `quiet`, no dots; no sparkle; a readable off state for the reviewer switch; links in
Plex; the header spans the viewport.

### Round 2 — after the first fixes

Looked at `report-1440` and `note-open-1440` at full size and at the sixteen captures not seen in
round 1 (every other state at 390 and 820) on contact sheets, so each of the thirty has now been
looked at at least once.

**Report (1440).**
- Memorable: the margin is now what the plan drew — nine one-line notes, each level with its line, a short stub across the gutter, nothing else. The fan is gone.
- Works: the chevrons fall into one column at the sheet's edge; the references in `quiet` read as the second voice of each note.
- Noise: each collapsed note still has a 2px tick of its state colour beside a glyph and a word in the same colour — the same thing said three times.
- Inconsistent: none.
- The summary sentence is the only large coloured text on the page, which is right: it is also the filter.

**Open note (1440, 820, 390).**
- Memorable: one straight tie in the state's colour from the words to their note; every other tie stays quiet.
- Works: below 1024 the note opens as a sheet at a readable measure and the margin stays level behind it.
- Noise: none left in the note's body; the sparkle and the dots are gone.
- Inconsistent: quoted and unquoted words of the source differ only by `ink` against `quiet` — too faint in light mode, and greying a narration is the wrong signal. The page already has a language for "these are the quoted words": the state's ink.
- The mock's note still says the rest of the text is «مظلَّلة»; nothing is shaded any more.

**Processing (390, 820).**
- Works: the sentence and the five stages fit a phone without wrapping the stage names.
- Works at 820: pending notes are a ruled line and a dotted ring, the same placeholder language as the ruled field.
- Noise: none.
- Inconsistent: none.
- The text is readable from the first second, which is the point of the state.

**Examples and error (390, 820).**
- Works: a link is in the tool's face now, left-to-right, on the same ruled lines.
- Works: after a failure the tag says only what was recognised; the promise is gone.
- Noise: none.
- Inconsistent: a long link wraps onto a second ruled line on a phone — acceptable, it is still one field.
- The two remedies stay side by side at 390.

**Reviewer and not-found (390, 820).**
- Works: the reviewer's line is the last thing in the sheet, after the tool has said everything it has to say.
- Works: the abstention reads the same in a sheet as in the margin — sentence, verse, referral.
- Noise: none.
- Inconsistent: «موضعه في النص» appears in the sheet but not in the margin note; correct, since in the margin the tie already shows it.
- The reviewer switch now looks off when it is off.

**Dark (empty and report, 390, 820).**
- Works: the ruled field survives in dark mode without becoming a grid.
- Works: the sheet's edge is still visible against the desk at both widths.
- Noise: none.
- Inconsistent: none found.
- The amber of «يحتاج مراجعة» is the brightest ink on the dark page; it stays because it is the state that asks for a person.

**Measured in this round** (Lighthouse 12.8, report page of the production build): accessibility 100
and best practices 100 on both presets. Performance was 89 desktop and 58 on the phone preset with
uncompressed assets; with compression and immutable caching on the API, 99 desktop and 68 phone
(first paint 5.1 s on the simulated slow connection — fonts and up-front script).

**Fixes sent for round 3**: quoted words in the state's ink; the collapsed note's tick removed (the
final-pass removal); the mock's wording; and a performance pass — a static shell painted before any
script, one Naskh weight, two Plex weights, and code-splitting of everything the first paint does
not need.

## 8. The verdict card («بطاقة تثبّت»), v2

The card is the one piece of Tabayyun that travels without the app: it is forwarded into the same
chats the claim came from. The first card (green header band, pill badge, a list of labelled
fields) had two faults. It looked like the UI that was replaced, and it lacked context: a card
that says «مخالف للمصدر» over a narration, then «رواه مسلم — صحيح», leaves the reader asking what
exactly is wrong. The v2 card answers, in this order, the questions of someone who sees only the
image:

1. **What is this about?** — the words as they were circulating.
2. **Is it right?** — the state (ring glyph + word) and one plain sentence.
3. **What does the source say?** — the source's own wording, its reference, and for a narration the
   grading in the source's word with who gave it.
4. **What should I do with it?** — the suggested action as a sentence.
5. **Can I check?** — the address and its QR code, and the transparency line.

It is drawn twice from one content table — in the browser (`verdict-card.tsx`) and on the server
(`report/share_card.py`, the fallback) — and both must show the same content in the same order.

### Layout (1080 × 1350 portrait, 1080 × 1080 square; light and dark; Arabic and English)

```
┌──────────────────────────────────────────────┐   paper, one hairline frame inset 36px
│ بطاقة تثبّت                              تبيّن │   logotype in Amiri; label in Plex, quiet
│ ──────────────────────────────────────────── │
│ ◎ مخالف للمصدر                                │   ring glyph 64 + state word, Plex 600 / 52, state ink
│ نُسب هذا النص إلى القرآن الكريم ولم يُعثر عليه…   │   the verdict sentence, Plex 400 / 34, ink, ≤ 3 lines
│                                              │
│ النص المتداول                                 │   label, Plex 26, quiet
│ رباط يوم وليلة خير من صيام شهر وقيامه           │   Amiri 44 / 1.9 in the state's ink, underlined 3px in
│ ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾          │   the state's colour — as the passage looks on the page
│                                              │
│ في المصدر                                     │   label
│ ──────────────────────────────────────────── │
│ the source's wording, Naskh                  │   a verse: Amiri Quran 46 / 2.2 · otherwise Amiri 40 / 2.0;
│ ──────────────────────────────────────────── │   words that differ from the claim underlined (collation)
│ رواه مسلم — «صحيح»، موسوعة الأحاديث النبوية      │   takhrij line: reference, Plex 30; grading verbatim in
│                                              │   Amiri 36; its source in Plex 26 quiet
│ الإجراء المقترح: حذف النسبة والتنبيه عليها.       │   Plex 600 / 30
│ ──────────────────────────────────────────── │
│ ▣ QR            تحقّق بنفسك على تبيّن           │   address in green, Plex 30; QR 150
│                 tabayyun.example              │
│ تبيّن أداة مدعومة بالذكاء الاصطناعي، لا تغني…     │   Plex 22, quiet
└──────────────────────────────────────────────┘
```

- **No band, no pill, no shadow.** Paper, hairlines, ink — the page's language. Gold appears only in
  the verified ring.
- **States with nothing to quote**: `not_found` shows the abstention sentence and the abstention
  verse (from `meta.abstention_verse`) in place of "في المصدر", as before; a `needs_review` or
  level C/D card without a source shows the reason and the referral sentence there instead.
- **Fitting**: type is reduced before anything is cut (claim down to 34, source down to 30, in steps
  of 2). The claim is cut at 240 characters at a word boundary with «…». A narration or quotation
  that still does not fit is cut at a word boundary with «…». **⚑ A verse is never cut in the
  middle of the quoted span**: if the whole verse does not fit at the smallest size, the card shows
  the part of the verse that corresponds to the quotation, with «…» on each side that was cut, and
  always its reference (for the Sharia reviewer to confirm).
- **Reviewed by a person**: when the state was changed by a reviewer, «حالة معدَّلة بمراجعة بشرية»
  follows the state word; no name is drawn.
- **The summary card** (`kind = "summary"`) uses the same frame and footer: the summary sentence
  («تسعة استشهادات: ثلاثة مؤيَّدة، …») in Plex 600 / 44 with each clause in its state's ink and its
  ring glyph, then the title of what was checked when the report has one.
- Nothing identifying is drawn: no date, time, reviewer name or link to the clip.
