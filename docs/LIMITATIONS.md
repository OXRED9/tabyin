# Limitations

Written to be read by a judge or an adopter before they trust the tool. Everything here is known
and unresolved as of 3 October 2026.

## What has not been verified

- **The LLM path has not been run.** No API key was available while building, so claim extraction
  by the model, the paraphrase check and the evidence check for rulings are implemented and
  unit-tested around, but never executed against a real provider. All measured results are from
  lexical-only mode. Expect prompt and schema fixes on first contact with a key.
- **The second baseline (general LLM without retrieval) has not been run** for the same reason, so
  the three-way comparison currently has two measured systems.
- **No row of the test set has been reviewed by the Sharia reviewer.** Expected states come from how
  each row was constructed.
- **Cloud speech-to-text has not been run**; only YouTube captions and local faster-whisper were.
- **Performance targets with the LLM are unmeasured.** In lexical-only mode a pasted text completes
  in under a second and a 3-minute captioned clip in 3–8 seconds.
- **The app is not deployed.** The backend image builds and runs locally (health check, a verification and Dorar access were tested inside the container); the full image including the frontend stage and a public deployment are still to do.

## Coverage

- **Rulings and facts** are only supported when a verse or a HadeethEnc narration explicitly states
  them and the LLM points at it. Fatwa sites (islamqa, binbaz, binothaimeen) are linked for
  referral but not searched, so many true level-A/B statements end as `needs_review`.
- **Attributed sayings**: Shamela is not integrated. Tabayyun can show that words attributed to a
  scholar are in fact a prophetic hadith; it cannot confirm that a scholar said something. A genuine
  saying of a scholar therefore comes back `not_found`.
- **Weak and fabricated narrations** are recognised only through Dorar. If Dorar is unreachable they
  come back `not_found` (abstention), not `contradicted`.
- **Paraphrased narrations** depend on the LLM pointing at the right candidate among the top BM25
  hits. There are no embeddings: a paraphrase that shares little vocabulary with the source is not
  retrieved at all and comes back `not_found`.
- **English**: only HadeethEnc's own English translations are matched. Another translator's wording
  needs the LLM paraphrase path. English renderings of verses are not matched to the Mushaf.
- **Other languages** are not handled.
- **Tafsir and explanation** are out of scope: Tabayyun verifies wording, attribution and grading; it
  does not explain meanings or correct misconceptions in its own words.

## Accuracy

- **Speech-to-text errors.** With the local `small` Whisper model an Arabic lecture is transcribed
  with enough errors that narrations are missed or come back `not_found`. Platform captions and a
  stronger model are much better. A verse that differs from the Mushaf in a machine transcript is
  reported as `needs_review`, never as an altered verse.
- **Gradings are per chain.** Dorar lists gradings of individual chains and books. Tabayyun keeps the
  same narrator's entries when it can tell, but a grading of a different chain of the same wording
  can still appear on a card, and "accepted + rejected" yields `needs_review` even where scholars
  would not consider it a real disagreement.
- **Grading classifier.** Nuanced grading sentences («صحيح دون قوله …», «حسن غريب», «رجاله ثقات»)
  are mapped by keyword. Unrecognised wording is treated as unknown — safe, but it turns some
  accepted narrations into `needs_review`.
- **The two Sahihs.** A narration found in al-Bukhari or Muslim is treated as accepted even if a
  weak chain is listed elsewhere. Mu'allaq reports and chapter headings inside the dataset's
  Bukhari text are not distinguished from the narrations proper.
- **Hadith numbering** for the books is the Open-Hadith-Data numbering, not the standard printed
  numbering; the card says so.
- **Short quotes** (≤ 4 content words) are rarely decisive and mostly end as `needs_review`.
- **A verse inside a narration.** When most of a quoted narration is a verse, the verse is reported
  and the narration is not.
- **Repeated verses**: the first location in Mushaf order is shown; the others are listed in the note.
- **Level classification** is the model's proposal. It is instructed to err toward the more
  sensitive level, which is safe but means some settled matters are shown as needing review.

## User interface

- **No usability session has been run yet.** `docs/USABILITY_TEST.md` holds the five tasks and the
  notes table; the results column is empty.
- **No screen-reader pass.** Automated checks (axe-core, plus a contrast pass over Arabic text nodes)
  report no WCAG A/AA violations; that is not the same as testing with a screen reader.
- **Mock-mode screenshots.** Screenshots `01`–`15` show demo data replayed by the UI's mock mode, so
  that all five states, reviewer mode and error states can be shown; only `real-*.png` come from the
  backend.
- **PDF export** is the browser's print-to-PDF of the exported HTML page; no PDF file is generated.
- **Switching to English after an Arabic run** changes the interface and the notes, but source
  translations and English references are only fetched when the run itself was started in English.
- **Reviewer overrides are local**: they live in the browser and in the exported file, not on a
  server, so two reviewers cannot see each other's decisions.

## Operations

- **Free-tier hosting**: the process uses about 320 MB of memory with all indexes loaded (measured); local
  Whisper does not fit and must stay disabled there. Idle instances sleep; the keep-alive workflow
  mitigates but does not remove a cold start.
- **Video platforms** block datacentre addresses unpredictably. YouTube worked from the development
  network; it may fail from a host, in which case the UI asks for a file upload or a pasted
  transcript. TikTok is allowed through the same code path but untested.
- **Dorar availability** differs by network and client. Without it, narrations outside al-Bukhari,
  Muslim and HadeethEnc lose their gradings.
- **Abuse protection is minimal**: an in-memory per-address request limit (30 requests per 10 minutes by default). There is no authentication, CAPTCHA or spend cap, so a public deployment with paid API keys should set provider-side budget limits.

## What the tool is not

It does not issue fatwas, does not prefer one scholarly opinion over another, and does not replace
asking qualified scholars. A `supported` state means "this wording is in this source with this
grading", not "acting on it is correct in your situation".
