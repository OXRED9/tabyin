# Methodology

> **The LLM proposes and explains — rules and sources decide.**

Nothing a language model writes can become a source text, a reference, a grading or an evidence
state. The model is used for two things only: *locating* citations in free text, and *pointing at*
one of several retrieved source texts. Everything else is deterministic code over approved sources.

## 1. Pipeline

| Stage | What happens | Model involved? |
|---|---|---|
| 1 الحصول على النص | text as is · article → main text (trafilatura) · video → platform captions, else audio → speech-to-text · file → speech-to-text. Transcripts keep timestamps. | speech-to-text only |
| 2 استخراج الادّعاءات | (a) Mushaf scan: verbatim verses found anywhere in the text. (b) Hadith scan: verbatim HadeethEnc narrations. (c) Delimited quotations after an explicit marker. (d) LLM extraction of everything else, constrained to a JSON schema; a quote that is not literally present in the input is discarded. | (d) only |
| 3 المطابقة مع المصادر | Quran: algorithmic match. Hadith: BM25 retrieval + alignment + gradings from HadeethEnc and Dorar. Rulings/facts: candidate texts from the sources; the LLM may point at one. | pointing only |
| 4 تحديد حالة الدليل | Deterministic rules (`backend/tabayyun/evidence_rules/`), then content-level caps. | no |
| 5 تقرير التحقق | Card per claim: text as quoted, source text, word-level diff, reference, URL, verbatim grading, level, certainty, action, timestamp. | no |

Steps (a)–(c) need no model, so their cards are on screen before the LLM has answered; they are also
the whole of **lexical-only mode**, which the system falls back to when no provider is reachable.

## 2. Normalisation (matching only — never displayed)

Strip diacritics, Quranic annotation marks, tatweel and invisible direction marks; unify
أ إ آ ٱ → ا, ؤ → و, ئ → ي, drop standalone ء; ى → ي; ة → ه; drop punctuation and non-Arabic
characters; collapse whitespace. For hadith, honorific formulas (صلى الله عليه وسلم, رضي الله عنه …)
are also dropped, because speakers add and omit them freely.

## 3. Quran matcher (no model anywhere)

- Two word streams over the whole Mushaf: Tanzil simple-clean (what people type and what
  speech-to-text produces) and Uthmani (what people paste from Quran sites). A quote is matched
  against both.
- **Exact**: the whole quote occurs contiguously (≥ 3 words, or a complete shorter ayah). Other
  locations of the same words are listed.
- **Fuzzy**: candidate windows are seeded from shared word bigrams and rare words; the quote is
  aligned against each window; similarity is the normalised Levenshtein similarity (characters)
  between the quote and the best-matching span, snapped to word boundaries.
- **Free-text scan**: runs of ≥ 5 verbatim words (or 4 with enough distinctive words — summed IDF
  ≥ 12) are reported as verses even with no introduction.
- The card shows the full Uthmani ayah(s), the surah and ayah number, and a word-level diff.

## 4. Hadith retrieval

- Corpora: HadeethEnc (3,574 narrations with the source's grading) and the Six Books, Muwatta and
  Musnad Ahmad from Open-Hadith-Data (58,802 narrations, no gradings).
- Retrieval: SQLite FTS5 BM25 over normalised text → 40 candidates per corpus.
- Rerank (deterministic): the quote is aligned against each candidate; the score is the similarity
  of the best-matching span. A quote is usually a fragment of a longer narration with its chain, so
  the span — not the whole record — is what is compared.
- English quotes are matched against HadeethEnc's published English translations.
- Paraphrase («رواية بالمعنى»): when nothing reaches the match threshold, the LLM is shown the top
  retrieved texts and asked which, if any, is the same narration. Its answer is honoured only if
  the two texts also share vocabulary (≥ 34% of the quote's word stems) and the answer came from the
  model chosen for the task — a pointer from the fallback model is ignored. The card then shows the
  source's own wording and can at most be `supported_with_note`.
- Gradings: HadeethEnc's `grade` field, and Dorar entries whose text aligns with the quote (same
  narrator when our source names one). The text is copied verbatim; a keyword classifier maps it to
  accepted / weak / fabricated / mixed / unknown **only to drive the rule**. Anything it does not
  recognise is `unknown` and can never produce `supported`.
- Multilingual embeddings are a designed extension point (`EMBEDDINGS_PROVIDER`) but are **not
  enabled**; see `LIMITATIONS.md`.

## 5. Evidence-state rules — final values

Initial thresholds came from the product brief; the changes made after measurement are marked ★.

### Ayah
| Condition | State |
|---|---|
| exact contiguous match (≥ 3 words, or a whole ayah) | `supported` |
| similarity ≥ 0.85 | `supported_with_note` + diff |
| floor ≤ similarity < 0.85, explicitly attributed to the Quran | `contradicted` + correct text |
| same, but the text comes from a machine transcript ★ | `needs_review` (the error may be the transcriber's) |
| same band, not attributed to the Quran | `needs_review` |
| below the floor, or nothing found | `not_found` |

### Hadith
| Condition | State |
|---|---|
| similarity ≥ 0.95 and an accepted grading, or the narration is in al-Bukhari/Muslim | `supported` |
| 0.80 ≤ similarity < 0.95, or confirmed paraphrase, with an accepted grading | `supported_with_note` |
| graded weak | `needs_review`, grading verbatim |
| graded fabricated / no basis / batil | `contradicted`, grading verbatim |
| accepted and rejected gradings both present (not in the two Sahihs) | `needs_review`, all shown, no preference |
| found in the books but no grading could be copied | `needs_review`, «الحكم غير متاح من المصدر» |
| floor ≤ similarity < 0.80 | `needs_review` (closest text shown, not asserted) |
| below the floor | `not_found` |
| quotes of ≤ 4 content words ★ | need similarity ≥ 0.95 to count as a match |

### Ruling / fact
Level A or B with an explicit retrieved text → `supported`; without one → `needs_review`
(a level-A *fact* with no text → `not_found`). Level C → `needs_review` + disagreement note +
referral, always. Level D → `needs_review` + «هذه حالة شخصية تستوجب فتوى من جهة مؤهلة» + referral.

### Attributed quote
Verbatim (≥ 0.90) with matching attribution → `supported`; found but attributed to someone else in
the source → `contradicted`; found but attribution cannot be checked → `needs_review`; otherwise
`not_found`.

### Request for evidence
Always `not_found` with the abstention message. Nothing is generated.

### ★ The length-aware "partial" floor

The brief's floor for partial similarity was 0.60. We measured how similar text that is **not** a
quotation is to its nearest source span, using shuffled words from real ayahs and narrations
(150–300 samples per row):

| Text | Words | Median | p99 | Max |
|---|---|---|---|---|
| shuffled Quran vocabulary | 6 | 0.50 | 0.69 | 0.70 |
| | 10 | 0.45 | 0.59 | 0.61 |
| | 18 | 0.41 | 0.48 | 0.56 |
| shuffled hadith vocabulary | 8 | 0.51 | 0.62 | 0.67 |
| | 14 | 0.45 | 0.53 | 0.56 |
| | 24 | 0.41 | 0.48 | 0.50 |

Short texts resemble *some* span of a large corpus by chance. With a flat 0.60 floor a six-word
sentence wrongly attributed to the Quran could be shown a "correct verse" it never came from. The
floor is therefore `0.60 + 0.12 × min(1, (12 − words)/6)`: 0.72 at ≤ 6 words, 0.66 at 9, 0.60 from
12 up. For genuinely altered verses the bands behave as intended: replacing 10% of the words gives
a median similarity of 0.91 (`supported_with_note`), 20% gives 0.83 and 30% gives 0.74
(`contradicted` when attributed).

## 6. Content levels

The LLM proposes the level under an instruction to pick the more sensitive one when in doubt. Quoted
verses and narrations are level A (their *wording* is what is verified). Level caps are applied
after the rule: C can never be `supported` or `contradicted`; D gets no verdict.

## 7. Evaluation

- **Test set** (`eval/testset/claims.jsonl`, 79 claims, 14 categories). No religious text was typed:
  verses come from the Mushaf data, narrations from HadeethEnc, weak and fabricated narrations (with
  their gradings) from Dorar. Faulty quotations are generated: one word replaced by a word from
  another surah (expected `supported_with_note`), a quarter of the words replaced (expected
  `contradicted`), every seventh word of a narration dropped (expected `supported_with_note`),
  words of four narrations shuffled together (expected `not_found`). Expected states follow from
  how a row is built, not from running the system. **No row has been reviewed by the Sharia
  reviewer yet.**
- **Systems**: (1) lexical search only — keyword search over the same corpora, "supported" when the
  top hit contains ≥ 60% of the query's words; (2) a general LLM with no retrieval; (3) Tabayyun.
- **Metrics**: accuracy of the evidence state; per-state precision and recall; *fabricated
  attributions* (a `supported` verdict with no matching source behind it); *wrongly endorsed*
  (a `supported` verdict on weak, fabricated or disputed material); *correct abstention* on requests
  to fabricate and on invented texts; seconds per claim. Three runs, mean ± standard deviation.
- **Known circularity**: the weak/fabricated rows take their label from Dorar's gradings, which is
  also where Tabayyun reads gradings. Those rows test retrieval, alignment and rule mapping end to
  end, not the correctness of Dorar.

Results: `eval/results/results.md`.
