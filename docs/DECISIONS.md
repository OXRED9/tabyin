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

## Sources

9. **Quran text from Tanzil** (Uthmani v1.1 + simple-clean), both named in the brief. Tanzil's
   licence allows verbatim redistribution, so the text is in the repository and matching works
   offline.
10. **HadeethEnc data is not committed.** The site publishes no redistribution licence; the full
    collection is downloaded from its public API at build time instead.
11. **Sunan al-Darimi is not indexed** although Open-Hadith-Data includes it: it is not on the
    approved list (Six Books, Muwatta, Musnad Ahmad).
12. **The client is never disguised.** Dorar blocked `curl` from the development network but answers
    the backend's HTTP client under its honest User-Agent. If a source blocks us, the fallback is
    abstention, not impersonating a browser.
13. **Books-corpus cards link to a Dorar search** for the matched words, since the dataset has no
    canonical per-narration URL and Dorar is where the reader can see the scholars' gradings.
14. **Fatwa sites and Shamela are deferred** (P1/P2). They appear only as referral links.
15. **The association's MCP server is not in the request path**: its Quran and hadith tools serve
    the same QuranEnc/HadeethEnc data already indexed locally.

## Engine

16. **SQLite FTS5 for retrieval**, no external database and no in-memory BM25 over 62k documents:
    it keeps memory near 320 MB, which fits a free-tier container.
17. **No embeddings today.** `multilingual-e5-small` would add ~300 MB and minutes of indexing;
    paraphrase handling instead goes retrieval → LLM pointing → vocabulary floor. The extension
    point exists (`EMBEDDINGS_PROVIDER`).
18. **Model-free scans run first** (verbatim verses and narrations, delimited quotations), so cards
    appear before the LLM answers and the product still works with no LLM at all.
19. **A quote the model returns must be literally present in the input**; otherwise it is dropped.
    The model cannot introduce a citation.
20. **Quoted verses and narrations are always level A**; the model's level applies to rulings,
    facts and attributed sayings.
21. **Short-quote safeguards**: ≤ 4 content words need ≥ 0.95 similarity; the "partial" floor rises
    from 0.60 to 0.72 as quotes get shorter (measured chance levels in `METHODOLOGY.md`).
22. **A delimited, explicitly attributed quotation is one claim**: the intact fragments of a
    misquoted verse are folded into it so the user sees one card with a diff.
23. **Default model `claude-opus-5`**, configurable. Smaller models are cheaper and may be enough;
    that is a cost decision for the team, left in `.env`.
24. **Refusals fail over.** A provider refusal or timeout moves to the next provider and then to
    lexical-only mode; the UI says coverage is reduced.

## Product and operations

25. **Dev API port 8765** — 8000 was taken on the development machine.
26. **`claims` events are additive** so early cards do not wait for the model.
27. **Fabricated attributions vs wrongly endorsed** are reported as two separate metrics: the first
    is a `supported` verdict with no matching source behind it (the deck's zero-tolerance number);
    the second is `supported` on weak/fabricated/disputed material.
28. **MIT licence for the code**; data stays under its publishers' terms (`LICENSES.md`).
29. **This directory is its own git repository** inside an unrelated umbrella repository; nothing is
    committed to the umbrella.
