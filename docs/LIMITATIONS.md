# Limitations

Written to be read by a judge or an adopter before they trust the tool. Everything here is known
and unresolved as of 3 October 2026.

## What has not been verified

- **Full mode has been measured once.** The 79-item evaluation ran one time in full mode: 88.6%,
  no fabricated attribution, no wrongly endorsed item, every abstention correct. One run gives no
  spread, and the model is not deterministic across days or providers. The general-chatbot baseline
  ran once as well (77.2%).
- **Only four of eight extraction candidates were measured**, on 20 items. Claude Sonnet 5.5, Gemini
  3.8 Flash, Qwen 3.7 Plus and DeepSeek V4 Pro 0813 were left out to save budget; so were four of the
  six image candidates and the other audio models (`docs/OPERATIONS.md` → Models).
- **Speech-to-text through OpenRouter is barely tested**: one verse recitation (exact) and the first
  60 seconds of one clip. No word-error rate has been measured. Also by design: **its timestamps
  come from a chat model, not from a dedicated speech-recognition endpoint.** They are the model's
  estimate of where each sentence starts and ends, cleaned to be ordered and inside the recording;
  they are good enough to jump to a passage, not to cut on. Recordings over ten minutes are split
  and the offsets added, which can cut a sentence at a boundary. Platform captions and local Whisper
  give measured timings.
- **Image reading is not exact, which is why it stops and asks.** The chosen model kept a
  deliberately altered verse as written in 9 of 10 rendered images and never "corrected" one, and
  read 12 of 15 test-set claims exactly (mean character error 0.3%). The text it reads is shown for
  correction before anything is verified. Reading took 4–14 s on the real server — sometimes over
  the 8 s target. Only rendered screenshots were tested: no photographs of paper or of a screen, no
  handwriting. A chat model gives one confidence for the whole image, so there is no per-word
  highlighting; words it could not read are written `[?]`.
- **The fallback model is weaker and text-only.** When it serves a request the report says so; its
  pointing is not used, so paraphrased narrations and rulings come back `needs_review` or
  `not_found`. Images have no fallback.
- **No row of the test set has been reviewed by the Sharia reviewer.** Expected states come from how
  each row was constructed.
- **Speed with the model.** Extraction takes about 3 s on a short text. A claim that needs the
  pointing call (a paraphrase, a ruling) waits 6–9 s more, and one pointing call in the bake-off ran
  for 41 s before it was cut off. Verbatim verses and narrations still appear in under a second.
- **The app is not deployed.** The complete image (frontend + API + data) builds and was run locally:
  the UI, the health check and a YouTube verification were tested inside the container. A public
  deployment has not been made.

## Coverage

- **The evidence shown beside a ruling is the closest text, chosen by the model's pointer.** It can be a
  related narration that is not the one the speaker meant; the note says «أقرب نص». One text is shown,
  never a survey of the evidence, and the ruling itself is not judged.
- **Rulings and facts** are only supported when a verse or a HadeethEnc narration explicitly states
  them and the LLM points at it. Fatwa sites (islamqa, binbaz, binothaimeen) are linked for
  referral but not searched, so many true level-A/B statements end as `needs_review`.
- **Attributed sayings**: Shamela is not integrated. Tabayyun can show that words attributed to a
  scholar are in fact a prophetic hadith; it cannot confirm that a scholar said something. A genuine
  saying of a scholar therefore comes back `not_found`.
- **Weak and fabricated narrations** are recognised only through Dorar. If Dorar is unreachable they
  come back `not_found` (abstention), not `contradicted`.
- **Paraphrased narrations are never confirmed.** When the wording is far from every source text, the
  model may point at the narration it seems to report by meaning; the card then shows that narration
  and says `needs_review`. There are no embeddings: a paraphrase that shares little vocabulary with
  the source is not retrieved at all and comes back `not_found`.
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
  that all five states and error states can be shown; only `real-*.png` come from the
  backend.
- **PDF export** is the browser's print-to-PDF of the exported HTML page; no PDF file is generated.
- **Switching to English after an Arabic run** changes the interface and the notes, but source
  translations and English references are only fetched when the run itself was started in English.

## Phase 2 features (F3, F4, F5)

- **Verdict cards can be made for any card the browser holds**, including one edited in the
  browser's developer tools; the server fallback validates the payload's shape, not its truth. The
  card's QR code leads to the tool, not to a stored copy of the verdict — nothing is stored.
- **The client-rendered and server-rendered cards are two implementations of one content table**;
  they match in content and closely in layout, not pixel for pixel.
- **The server fallback needs Arabic shaping** (libraqm + FriBiDi). Where they are missing it
  answers 503 rather than drawing broken letters.
- **Copy** gives the whole source text of a narration, including its chain and any second wording
  the source lists, not only the quoted part.
- **"Why this verdict?"** explains the rule and shows the candidates; it does not show the model's
  prompt or reasoning, and the one-line level reason is the model's own wording when a model
  classified the claim.
- **Web Share with a file** is not available in every browser (notably desktop Firefox); there the
  card is downloaded and copied to the clipboard instead.

## Operations

- **Free-tier hosting**: the process uses about 320 MB of memory with all indexes loaded (measured); local
  Whisper does not fit and must stay disabled there. Idle instances sleep; the keep-alive workflow
  mitigates but does not remove a cold start.
- **Video platforms** block datacentre addresses unpredictably. YouTube worked from the development
  network; it may fail from a host, in which case the UI asks for a file upload or a pasted
  transcript. TikTok is allowed through the same code path but untested.
- **Links to Dorar are searches, not addresses.** Dorar has no page per narration; a link searches
  its site for a few words of the narration, and for narrations taken from the hadith books about a
  quarter of such searches find nothing because Dorar's wording differs.
- **Dorar availability** differs by network and client. Without it, narrations outside al-Bukhari,
  Muslim and HadeethEnc lose their gradings.
- **Abuse protection is minimal**: an in-memory per-address request limit (30 requests per 10 minutes by default). There is no authentication or CAPTCHA. The daily spend guard (`DAILY_SPEND_LIMIT_USD`) moves every call to the free fallback model once the day's logged cost reaches the limit, but its log restarts with the machine on a host without a volume, so the credit limit on the OpenRouter key is the real cap.

## Installable app and sharing (F6)

- **Not tested on a phone.** The manifest, the service worker and the share target were exercised in
  a desktop browser against a static copy of the build: shared links, text and audio are routed and
  start by themselves. A shared picture could not be confirmed there, and nothing was installed on
  an Android device — that needs the public HTTPS address, which does not exist yet.
- **iOS has no share target.** On an iPhone the app can be added to the Home Screen, but other apps
  cannot share into it; paste is the way in. The UI says so in one line on iOS.
- **The manifest is linked three seconds after load**, by script, because a static link cost a
  Lighthouse point. A tool that reads only the served HTML will not see it.
- **Named share buttons send text.** A web page cannot hand an image to WhatsApp, X or Telegram; those
  buttons open the app with the verdict as text and the address. The image goes through «مشاركة»
  (the system's share sheet, phones over HTTPS), or is saved and attached by hand. Instagram has no
  web link at all.
- **The card prints the address the app is served from**, which is a local address until
  `PUBLIC_URL` is set at deployment.

## What the tool is not

It does not issue fatwas, does not prefer one scholarly opinion over another, and does not replace
asking qualified scholars. A `supported` state means "this wording is in this source with this
grading", not "acting on it is correct in your situation".
