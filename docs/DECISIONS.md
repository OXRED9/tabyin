# Decisions log

Decisions taken while building, with the reason. Items marked **⚑ needs confirmation** touch
religious behaviour or the challenge rules and were decided provisionally; they are listed first.

## ⚑ Needs confirmation (Abdulaziz / Sulaiman)

1. **Work done before the challenge window.** The participant guide sets the development days as
   4–6 October 2026 and says pre-existing work is allowed «مع توثيق نسخة البداية والإفصاح عن
   الحقوق، ويُقيَّم ما أُنجز من 4 إلى 6 أكتوبر فقط». Everything committed on 3 October is therefore
   a *starting version* that must be disclosed. The git history shows the dates honestly; tag the
   last 3-October commit (`git tag starting-version`) and mention it in the submission.
2. **A narration in al-Bukhari or Muslim is treated as accepted** even when Dorar lists a weak
   grading for another chain of the same wording. Reason: the brief's rule «grading sahih/hasan
   *or in Bukhari/Muslim* → supported»; all gradings are still displayed. Without this, well-known
   agreed-upon narrations were shown as "conflicting gradings".
3. **Dorar gradings are filtered to the same narrator** when our source names the narrating
   Companion. Reason: a grading belongs to one chain; showing «لم يصح» from another Companion's
   chain beside an agreed-upon narration misleads.
4. **A verse that differs from the Mushaf in a machine transcript is `needs_review`, not
   `contradicted`.** Reason: speech recognition garbles recitation; the tool must not say a speaker
   altered the Quran on that basis. Human-written text and human captions are still held to the text.
5. **For a level-A ruling the LLM may propose one verse by number** (`surah:ayah`). The system
   fetches that verse from the Mushaf, checks that it shares vocabulary with the claim, and asks
   the model a second, separate question: does this text state the claim explicitly? Only then is
   the ruling `supported`, with the verse shown verbatim. The model never writes the verse. This is
   the least-tested part of the system (no key was available) and the one most in need of review.
6. **Built-in examples contain no faulty religious text.** The first-screen example is a correct
   verse and a correct narration; misquoted verses exist only in the test set, generated
   programmatically and awaiting review.
7. **"No source" test rows are shuffled words**, not invented sayings: composing a fake narration
   attributed to the Prophet ﷺ, even as test data, was avoided.
8. **Misattribution test rows** attribute a sound narration to "أحد الدعاة المعاصرين" rather than
   to a named scholar, so no real person is misquoted.

9. **Reviewer overrides obey the same rules as the engine.** In reviewer mode a human can change a
   card's state, but the UI does not offer «مؤيَّد» for a card that has no retrieved source, limits
   level C to «يحتاج مزيد تحقق» / «لم يُعثر على مصدر», and offers no state change for level D
   (`allowedReviewerStates` in `frontend/src/lib/states.ts`). A reviewer who disagrees records it in
   the note. Whether a qualified reviewer should be able to go further is Sulaiman's call.

## Sources

10. **Quran text from Tanzil** (Uthmani v1.1 + simple-clean), both named in the brief. Tanzil's
   licence allows verbatim redistribution, so the text is in the repository and matching works
   offline.
11. **HadeethEnc data is not committed.** The site publishes no redistribution licence; the full
    collection is downloaded from its public API at build time instead.
12. **Sunan al-Darimi is not indexed** although Open-Hadith-Data includes it: it is not on the
    approved list (Six Books, Muwatta, Musnad Ahmad).
13. **The client is never disguised.** Dorar blocked `curl` from the development network but answers
    the backend's HTTP client under its honest User-Agent. If a source blocks us, the fallback is
    abstention, not impersonating a browser.
14. **Books-corpus cards link to a Dorar search** for the matched words, since the dataset has no
    canonical per-narration URL and Dorar is where the reader can see the scholars' gradings.
15. **Fatwa sites and Shamela are deferred** (P1/P2). They appear only as referral links.
16. **The association's MCP server is not in the request path**: its Quran and hadith tools serve
    the same QuranEnc/HadeethEnc data already indexed locally.

## Engine

17. **SQLite FTS5 for retrieval**, no external database and no in-memory BM25 over 62k documents:
    it keeps memory near 320 MB, which fits a free-tier container.
18. **No embeddings today.** `multilingual-e5-small` would add ~300 MB and minutes of indexing;
    paraphrase handling instead goes retrieval → LLM pointing → vocabulary floor. The extension
    point exists (`EMBEDDINGS_PROVIDER`).
19. **Model-free scans run first** (verbatim verses and narrations, delimited quotations), so cards
    appear before the LLM answers and the product still works with no LLM at all.
20. **A quote the model returns must be literally present in the input**; otherwise it is dropped.
    The model cannot introduce a citation.
21. **Quoted verses and narrations are always level A**; the model's level applies to rulings,
    facts and attributed sayings.
22. **Short-quote safeguards**: ≤ 4 content words need ≥ 0.95 similarity; the "partial" floor rises
    from 0.60 to 0.72 as quotes get shorter (measured chance levels in `METHODOLOGY.md`).
23. **A delimited, explicitly attributed quotation is one claim**: the intact fragments of a
    misquoted verse are folded into it so the user sees one card with a diff.
24. **Models are chosen per task and set in `.env`**, never in code (see "Models" below).
25. **Refusals and failures fail over.** One retry, then `MODEL_FALLBACK`, then lexical-only mode; the
    UI says coverage is reduced.

## Product and operations

26. **Dev API port 8765** — 8000 was taken on the development machine.
27. **`claims` events are additive** so early cards do not wait for the model.
28. **Fabricated attributions vs wrongly endorsed** are reported as two separate metrics: the first
    is a `supported` verdict with no matching source behind it (the deck's zero-tolerance number);
    the second is `supported` on weak/fabricated/disputed material.
29. **MIT licence for the code**; data stays under its publishers' terms (`LICENSES.md`).
30. **This directory is its own git repository** inside an unrelated umbrella repository; nothing is
    committed to the umbrella.
31. **The gold «تحقّق» button uses dark text**, not white as in the deck: white on `#C9A227` is 2.4:1
    and fails WCAG AA.
32. **A collapsed card shows the grading only when there is exactly one**; with several it shows a
    count, so no single grading is singled out.

## Models — everything through OpenRouter (3 October 2026)

IDs and prices come from the live catalog; results are in `eval/results/` (`model_check_candidates.md`,
`bakeoff_extract.md`, `ocr_exactness.md`). The OpenRouter account had no credit during this session:
calls were refused with HTTP 402 part-way through, so some candidates are **not measured** — said
plainly below, with the command that finishes the job in `OPERATIONS.md`.

33. **One provider, one key.** The Anthropic and OpenAI provider modules, settings and dependency were
    removed. `llm/openrouter.py` is the only client (the OpenAI-compatible SDK pointed at OpenRouter);
    text, image and audio all go to `chat/completions`.
34. **`MODEL_EXTRACT = qwen/qwen3.8-flash`.** Bake-off on 20 test-set items through the real
    pipeline. Four candidates completed: Qwen 3.8 Flash 85%, DeepSeek V4 Pro 85%, GPT-6 Luna 80%,
    GLM 5.3 Flash 80%. The two leaders miss the same three items; Qwen costs less than half as much
    per item, so it wins the tie. On the full 79-item set in full mode it then scored 88.6% with no
    fabricated attribution and no wrongly endorsed item (one run). **Not measured, on purpose**:
    Claude Sonnet 5.5, Gemini 3.8 Flash, Qwen 3.7 Plus and DeepSeek V4 Pro 0813 were refused while
    the account had no credit, and were not re-run afterwards — of the leaders' three misses, two are
    artefacts of the test set that every system misses (item 46), so one item is all another model
    could gain on this sample, and the budget is small (item 47).
35. **GPT-6 Luna and GLM 5.3 Flash are rejected whatever they cost.** Both answered "same narration"
    for a test text that is word salad from four narrations, and the paraphrase rule then returned
    `supported_with_note` — a fabricated attribution in the eval's terms. The two leaders did not.
36. **⚑ A pointer from the fallback model is never used.** Item 35 shows that the paraphrase and
    evidence rules lean on the quality of the pointing model. The fallback is free and unmeasured for
    that job, so when it answers the pointing call the claim keeps its conservative state
    (`needs_review` / `not_found`). This narrows what the tool will support, never widens it; it
    changes verdict behaviour, so it is listed for confirmation. The 34% vocabulary floor of the
    paraphrase rule was not changed; whether to raise it is a threshold question for the full eval.
37. **`MODEL_VISION = qwen/qwen3.7-flash`.** Ten rendered images, each with a verse in which one word
    was replaced by code. It kept the altered wording in 8 and never restored the original verse; it
    is also the cheapest candidate ($0.00006 per image). DeepSeek V4.1 Flash restored the original
    wording in 2 of 10 — the failure that would hide a misquotation — and is rejected. Gemini 3.5 and
    3.1 Flash-Lite and GLM 5.3 Flash had most calls refused and are **not measured** (the three images
    the Gemini models did read were exact). Qwen 3.8 Flash returned an invalid or truncated answer for
    3 images and restored the original wording in one. GLM-4.6V failed the single-image check.
    The two images Qwen misread are character errors, so a verse mismatch read from an image should
    be treated like one from a machine transcript when image input ships (F1) — a decision for then.
38. **`MODEL_AUDIO = google/gemini-3.5-flash-lite`.** Chosen from the catalog while audio calls were
    still refused; measured after credit was added: it transcribed the test recitation exactly, and
    the first 60 seconds of a real clip came back as timestamped segments in 3.1 s for $0.0013. The
    other audio candidates were not compared, and no word-error rate has been measured (the 20
    reading scripts of the audio test have not been recorded). This endpoint refuses a request that
    switches reasoning off, which is why only extraction and pointing have a reasoning setting.
39. **`MODEL_CHEAP = deepseek/deepseek-v4-flash`**: the cheapest paid text model in the check
    ($0.028 / $0.056 per million tokens), exact quote and valid JSON in 7 s.
40. **`MODEL_FALLBACK = nvidia/nemotron-3-super-120b-a12b:free`**: free, a different family from every
    primary, supports strict JSON output, passed the text check. It reads text only, so **images have
    no fallback** (the request fails with a readable message) and audio falls back to local Whisper
    where it is installed. The free models that accept images or audio were rejected: one did not
    read the altered verse exactly, one is rate-limited to the point of failing the check, and one is
    not available to API callers.
41. **`MODEL_BASELINE_LLM = openai/gpt-6.1-sol`**: a mid-tier general model at the price of the
    mid-tier of other labs ($2 / $10), so the "general chatbot" baseline is not a straw man. It is
    called without retrieval and without a fallback. Run once on the 79 items: 77.2%, no fabricated
    attribution, 90% correct abstention; it missed all five slightly altered verses and all five
    fabricated narrations. $0.14 per run.
42. **Reasoning: off for extraction, on for pointing.** Measured on the 20 items with Qwen 3.8 Flash:
    reasoning on both calls 85% at $0.00079 and 28 s per item; off on both 80% at $0.00017 and 3 s —
    and the pointing call then accepted a no-source text as a paraphrase, the fabricated attribution
    of item 35; **off for extraction, low for pointing: 85% at $0.00027 and 8 s**, with the same
    three misses as reasoning everywhere. That split is the default (`LLM_REASONING_EFFORT=none`,
    `LLM_REASONING_EFFORT_JUDGE=low`). A pointing answer that runs to its output budget is not
    retried, and a pointing call never goes to the fallback model.
43. **Strict JSON where the catalog says the model supports it** (`response_format: json_schema` with
    `provider.require_parameters`); otherwise the schema goes in the prompt. Either way the answer is
    validated with Pydantic and an invalid one is retried once, then failed. Of the 231 calls that
    were not refused for lack of credit, 221 succeeded, 5 were truncated at the output budget (four
    of them pointing calls — that budget was raised from 1200 to 2500), 2 failed validation (both
    Qwen 3.8 Flash reading an image), 2 were rate-limited (a free model) and 1 was not permitted.
44. **Daily spend guard counts the cost the API reports**, kept in a local SQLite file that holds no
    content. On a host without a volume the file restarts with the machine; the credit limit on the
    OpenRouter key is the hard stop.
45. **Embeddings stay local** (`intfloat/multilingual-e5-small`), are configured, and are not used by
    any shipped feature yet.
46. **Test-set artefact, left as is.** The two "misattributed quotation" items embed the narrator
    line of the narration («عن … مرفوعاً»), so every system that reads the passage reports an authentic
    hadith and the row counts as a miss. Changing expected results after seeing outputs would be
    worse than reporting it.
47. **Budget rules the defaults.** The project's OpenRouter budget is about 100 SAR. The daily guard
    is 1 USD (the brief's template said 10); Claude Sonnet 5.5 is not measured because its price
    rules it out before accuracy can; paid checks are run once, by hand, on small inputs.
48. **Image input is not exposed.** `ingest/image.py` and `MODEL_VISION` are tested by the scripts
    only; the upload endpoint does not accept images until F1 is built.

## Design rebuild (v2)

49. **⚑ Verses stay in Amiri Quran; the King Fahd Complex font needs the Complex's text too.** The v2
    brief asks for the Complex's Uthmanic font for verses. Tested: our Mushaf text (Tanzil Uthmani)
    and the Complex's digital text encode the same Mushaf with different code points (6,158 of 6,236
    verses differ), and our text set in the Complex's Hafs font renders with wrong marks — stray
    filled circles where the silent-letter mark stands (`screenshots/v2/font-test-kfgqpc-vs-amiri.png`).
    Showing a verse with wrong marks is worse than showing it in another typeface. To use the
    Complex's font, the *displayed* verse text has to come from the Complex's dataset
    (`kfgqpc_hafs_v30`, in the approved package) while matching keeps its current streams: a change
    to which source's text is shown and copied, so it waits for the team and the Sharia reviewer.
    The Complex's licence (in the font files) allows free use, copying and distribution, unmodified.
50. **Features named in the v2 brief that do not exist yet** — image input (F1), authentic alternatives
    (F2), PWA (F6) — were not built inside the visual rebuild, which the brief limits to design. The
    composer carries the «صورة» action behind `features.image`, off until F1 ships.
51. **The development server listens on the local network** (`--host 0.0.0.0`) so the UI can be opened
    from a phone on the same Wi-Fi; it is started with the OpenRouter key blanked, so that session
    cannot spend credit.
52. **The sheet widens when a verification starts, not when it ends.** `DESIGN.md` §3 says the sheet
    widens once the report is complete, and §3.2 says notes take their place in the margin while the
    request runs. Both cannot hold without the text re-wrapping at the end, so the sheet takes its
    text-and-margin width on «تحقّق»: the text is set once, in its final measure, and nothing moves
    when notes arrive or the report completes (measured layout shift for the clip scenario: 0.002 at
    1440px, 0.003 at 390px). A pasted text is put on the page at once; a clip or an article waits on
    ruled lines.
53. **One composer, four request types.** A file wins over the field; a field whose whole content is
    one address is a link (YouTube, TikTok and other known video hosts → `video_url`, anything else →
    `article_url`); everything else is `text`. Because an unknown host is a guess, the tag offers
    «هذا رابط مقطع / هذا رابط مقال» to correct it, which is what choosing the tab used to do. The
    backend's error hints still name the old tabs («تبويب «نص»»); the UI swaps such a hint for its
    own wording until `report/messages.py` is updated.
54. **⚑ The suggested action is said as a sentence** in the open note («الإجراء المقترح: تصحيح اللفظ
    على ما في المصدر.»). The five canonical action names are unchanged in the exports and the
    reviewer's menu; the five sentences are new wording and are tagged `TODO-SULAIMAN-REVIEW` in
    `frontend/src/lib/dictionary.ts`.
55. **The margin's state words are the short ones from `DESIGN.md` §2.2** («مؤيَّد», «يحتاج مراجعة»,
    «لا مصدر»…). The full canonical names («مؤيَّد بمصدر معتمد», «يحتاج مزيد تحقق», «لم يُعثر على مصدر
    موثوق») stay in the exports, the verdict card, the reviewer's menu and the note's reference line.
56. **Left out because the plan has no place for them:** the motto verse under the first screen's
    headline (the plan keeps the headline alone), the phone's fixed «تحقّق» bar (the wide button is
    on the first screen), and the history button in the header (history opens from «آخر ما تحققتَ
    منه», in the composer and in a report's footer). The data and the functions behind them are
    untouched.
57. **Inter is gone from the verdict card too.** The card's English text falls to IBM Plex Sans,
    which is what its server-side twin already draws Latin with (the Plex Arabic TTF); weight 700 of
    both Plex faces is declared for the card alone. Nothing else in the card changed.
58. **Mock mode has a direct route to a report**: `?mock=1&scenario=<name>&autorun=1` submits the
    scenario's input on load (for Lighthouse and the screenshot scripts). It does nothing without
    `mock`, and works in the production build.
59. **The v1 capture scripts are kept as a record, not ported.** `scripts/screenshots.mjs` and
    `scripts/screenshots-phase2.mjs` drive the first UI (tabs, cards) and no longer match the page;
    `scripts/screenshots-v2.mjs` and `scripts/a11y.mjs` are the ones that run.

## Phase 2 features opened by the team on 3 October 2026

60. **F1 (image input) and F6 (installable app, share target) were opened before the public URL
    exists**, by the team's decision ("do all of them"), as F3–F5 were earlier. The Phase 2 gate in
    `CLAUDE.md` still holds for F2 and F7–F10.
61. **Image input reads, then asks.** `/api/ocr` returns the text of the image and stops; the user
    sees it in the field («هذا ما قرأناه من الصورة — عدّله إن لزم ثم تحقّق»), can correct it, and only
    then runs the verification as text. A misread letter is therefore the user's to catch before any
    verdict is given, which answers the open question of item 37.
62. **Unreadable words are written `[?]`, and that is the only "low-confidence region".** A chat model
    gives one confidence for the whole image, not per word; highlighting regions would be invented
    precision. The UI marks `[?]` and warns when the overall confidence is under 0.8.
63. **Noise is removed line by line and shown.** Emoji, rows of punctuation, clock times and short
    "share this" footers (the brief's «انشرها تؤجر», «لا تنسوا الصلاة على النبي») are taken out of the
    text and returned in `removed`; a phrase inside a longer sentence is never touched, and the
    wording of a citation is never altered by this step.
64. **A photo's metadata never leaves the server**: the image is re-encoded before it is sent to the
    vision model, which drops EXIF (including location).


## The verdict card, v2 — server renderer (`report/share_card.py`)

Decided while building `DESIGN.md` §8 on the server; the browser's card must match. Items marked ⚑
touch how a religious text is shown and wait for Sulaiman.

65. ⚑ **A verse is drawn whole, or as the quoted part, or not at all.** §8 says a verse is never cut
    inside the quoted span. What it leaves open was decided in the same spirit: when the quoted part
    fits only if the claim is shorter, the claim gives up lines (it ends in «…»); then the verse's
    type goes below its range (30 down to 22) rather than its words; when it cannot fit even so
    (the whole of the longest verse on the square card), the verse's words are not drawn and a
    sentence stands in their place («نص الآية أطول من أن تسعه البطاقة؛ يُقرأ كاملاً في موضعه من
    المصحف.» — new wording, `TODO-SULAIMAN-REVIEW`). The reference is always drawn. When the quoted
    part cannot be located in the verse, the whole verse counts as that part. A verse is set between
    ﴿ ﴾, as the abstention verse is.
66. **One grading is drawn verbatim; several are counted.** With one grading the card shows its
    first line in the source's words, the muhaddith when the source names one, and where it was
    copied from. With several it shows their count («3 أحكام في المصادر»), as the page's notes do,
    so that none is singled out. A grading is never shortened: one too long for the card is counted
    («حكم واحد في المصدر») rather than cut.
67. **A reviewer's state comes without the rule's sentence, and with its own action.** The sentence
    explains the engine's state («النص مطابق لنص المصحف الشريف.») and would contradict a different
    state set by a person; the card shows the state, «حالة معدَّلة بمراجعة بشرية» and the action that
    belongs to the reviewer's state. A reviewer's «لم يُعثر على مصدر موثوق» also hides the source
    the engine had matched (the abstention stands in its place).
68. **A claim with nothing to quote shows its reason and the referral in the source's place.** For
    `needs_review` without a source and for levels C and D, between the hairlines stand the reason
    («هذه حالة شخصية…» or «مسألة خلافية: …») and «تبيّن لا يفتي ولا يرجّح؛ يُرجع في هذه المسألة إلى
    أهل العلم.», then the action. The reason is not said twice: when it is already the sentence
    under the state (a personal case's note is that very sentence), only the referral stands there.
    A personal case never shows a source, even if one is attached to the card.
69. **Only replaced words are underlined in the source's wording** — the `replace` steps of
    `card.diff`, as the page's collation marks them. A word the quotation left out from its middle is
    not marked (open: it could be). `card.diff` covers the matched span only and, for a verse, may
    spell words as the matcher's plain text does, so the renderer aligns it to `source.text` by
    letters (no model) before underlining.
70. **Fitting choices §8 does not spell out**: the square card sets its fixed type and spacing at
    0.86 of the portrait's (the claim's and the source's ranges are the same on both); a narration
    that must be cut starts at the quoted part when its opening would push that part off the card;
    the claim stays whole while at least one line of the source's wording fits, and gives up lines
    after that. The summary card does not draw the title of what was checked: `ShareCardRequest`
    does not carry it.

## Accuracy fixes from the team's own tests (4 October 2026)

71. **⚑ A paraphrase is never "supported".** The pointing model accepted a no-source text as a paraphrase
    of a real narration once in three full evaluation runs — a fabricated attribution. Such a text
    shares 30–62% of its word stems with one real narration, so no vocabulary threshold separates it
    from a genuine report by meaning. The rule now returns `needs_review` (`hadith.possible_paraphrase`):
    the narration it may correspond to is shown with its grading, and a person decides. No correct
    answer in the test set depended on the old behaviour. This narrows what the tool supports.
72. **A verse quoted with one changed word is one note.** The scan used to report its intact part as an
    exact match beside the note for the whole misquotation. A wider quotation (marked by «قال الله
    تعالى:», or proposed by the model) now replaces the fragment when the Mushaf matcher finds it is
    still the same verse (≥ 0.85). For an unmarked quotation the certain notes wait up to 6 s for the
    model, because a note that was shown cannot be withdrawn.
73. **«حديث "…"» is a quotation without the model**, and a sentence that only introduces, sources or
    praises a quoted text is no longer reported as a claim of its own (extraction prompt). The team's
    case — a famous narration introduced by its collector and followed by a remark about it — used to
    end as "no source"; it now gives one note for the narration, with its reference and grading.
74. **An unverifiable statement is "needs review", not "no source".** "No source" is the verdict for words
    claimed to be a quotation. A level-A factual statement for which no explicit text was retrieved
    now gets `needs_review` (`ruling.no_text`), as `CLAUDE.md` already required for level B.
75. **A personal case stays level D whatever the model calls it.** The marker rules recognise a question
    about the asker's own situation; where the model typed it otherwise (seen once: "request" → "no
    source"), the claim is made a level-D ruling. The level only moves to the more sensitive side.
76. **Dorar links search for the narration's own opening words.** Dorar has no address per narration and
    its site search answers "no results" for long queries, which is what the links used to send (the
    whole quotation). A Dorar hit now links to a search for the first seven words of Dorar's own text
    (reliable); a narration from the hadith books links to a search for its last five words (found in
    9 of 12 sampled cases — Dorar's wording sometimes differs from the books' text).
77. **The human-review feature was removed** (the team's decision, 4 October 2026). The original brief
    asked for a reviewer mode in which a qualified person could change a state and have both states
    exported; in use, its switch read as "references mode" and the team decided against any mode.
    The switch, the reviewer's line, `override_state` / `human_reviewed` on cards and the reviewer
    section of the exports are gone. The Sharia reviewer's work on the sources, the rules and the test
    set is unaffected — that review happens on the data, not in the UI.
78. **State and action words** — «له مرجعية» for «مؤيَّد», «نقله مع ذكر مرجعه» for «اعتماد» — are the
    team's wording (`report/labels.py`, `DESIGN.md` §8.2). The identifiers and the rules did not change.
