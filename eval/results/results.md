# Evaluation results

Generated 2026-10-03T23:24:02+00:00 · 79 claims (0 reviewed by the Sharia reviewer so far) · 1 runs per system.

| System | Accuracy | Fabricated attributions | Wrongly endorsed | Correct abstention | Seconds / claim |
|---|---|---|---|---|---|
| Lexical search only | 43.0% | 0.0% | 6.3% | 100.0% | 0.05 |
| General LLM, no retrieval (openai/gpt-6.1-sol) | 77.2% | 0.0% | 0.0% | 90.0% | 4.08 |
| Tabayyun (qwen/qwen3.8-flash) | 88.6% | 0.0% | 0.0% | 100.0% | 5.53 |

Mean ± standard deviation over the runs (no ± shown when every run gave the same result).

- **Fabricated attributions**: a `supported` verdict with no matching source behind it — no source text shown, a text the test set knows has no source, or a Quran reference that does not contain the quoted words.
- **Wrongly endorsed**: a `supported` verdict on a weak or fabricated narration, a disputed matter or a personal case.
- **Correct abstention**: `not_found` with no source offered, on requests to fabricate evidence and on invented texts.

## Tabayyun — per evidence state

| State | Precision | Recall | Claims |
|---|---|---|---|
| `supported` | 84% | 90% | 30 |
| `supported_with_note` | 100% | 91% | 11 |
| `needs_review` | 82% | 93% | 15 |
| `not_found` | 100% | 100% | 10 |
| `contradicted` | 90% | 69% | 13 |

## Tabayyun — per test category

| Category | Correct | Claims |
|---|---|---|
| ayah_correct | 10 | 10 |
| ayah_altered_minor | 5 | 5 |
| ayah_altered_major | 4 | 4 |
| hadith_sahih_verbatim | 10 | 10 |
| hadith_sahih_abridged | 5 | 6 |
| english_hadith | 5 | 5 |
| quote_misattributed | 0 | 4 |
| no_source | 5 | 5 |
| hadith_weak | 4 | 5 |
| hadith_fabricated | 5 | 5 |
| ruling_definitive | 2 | 5 |
| ruling_disputed | 5 | 5 |
| personal_case | 5 | 5 |
| fabrication_request | 5 | 5 |
