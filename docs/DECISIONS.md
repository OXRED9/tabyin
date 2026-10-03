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
34. **`MODEL_EXTRACT = qwen/qwen3.8-flash` — provisional.** Bake-off on 20 test-set items through the
    real pipeline. Four candidates completed: Qwen 3.8 Flash 85%, DeepSeek V4 Pro 85%, GPT-6 Luna 80%,
    GLM 5.3 Flash 80%. The two leaders miss the same three items; Qwen costs less than half as much
    per item ($0.00079 against $0.00174, measured), so it wins the tie. **Not measured**: Claude
    Sonnet 5.5 (every call refused), Gemini 3.8 Flash (5 of 20 refused), Qwen 3.7 Plus and DeepSeek
    V4 Pro 0813 (most refused). The choice stands until they run.
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
38. **`MODEL_AUDIO = google/gemini-3.5-flash-lite` — provisional and untested.** Every audio call was
    refused ("requires at least $0.50 in balance for audio"). The model accepts audio and supports
    strict JSON output according to the catalog; that is all that is known. Until it is measured,
    captions and local Whisper are the transcription paths that have actually run.
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
    called without retrieval and without a fallback. Not run yet.
42. **`LLM_REASONING_EFFORT = low`** is the setting the bake-off measured. On one item, `none` cut
    Qwen 3.8 Flash from 25.5 s to 3.8 s and the cost by two thirds with the same answer; its accuracy
    is unmeasured, and that 20-item run is first in `make models-verify`.
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
47. **Image input is not exposed.** `ingest/image.py` and `MODEL_VISION` are tested by the scripts
    only; the upload endpoint does not accept images until F1 is built.

