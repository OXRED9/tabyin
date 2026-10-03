# OCR exactness

10 rendered chat-style images, each with a verse in which one word was replaced programmatically. “Exact” = the altered wording came back as written; “corrected” = the model restored the original verse (the failure that matters). A row with failed calls is incomplete: those images were not read at all (HTTP 402 when the balance was too low, or an invalid answer), so its “exact” count is a lower bound. Mean CER is over the images that were read.

| Model | Exact | Corrected | Failed calls | Mean CER | s / image | $ / image | List price in/out per Mtok |
|---|---|---|---|---|---|---|---|
| `qwen/qwen3.7-flash` | 9/10 | 0 | 0 | 0.1% | 5.1 | $0.000047 | $0.03 / $0.13 |
| `deepseek/deepseek-v4.1-flash` | 6/10 | 2 | 0 | 0.5% | 4.5 | $0.000293 | $0.3 / $1.2 |
| `qwen/qwen3.8-flash` (incomplete) | 4/10 | 1 | 3 | 31.0% | 9.6 | $0.000341 | $0.15 / $0.47 |
| `google/gemini-3.1-flash-lite` (incomplete) | 2/10 | 0 | 8 | 80.0% | 0.9 | $0.000126 | $0.25 / $1.5 |
| `z-ai/glm-5.3-flash` (incomplete) | 2/10 | 1 | 3 | 31.7% | 1.3 | $0.000097 | $0.15 / $0.5 |
| `google/gemini-3.5-flash-lite` (incomplete) | 1/10 | 0 | 9 | 90.0% | 0.3 | $0.000057 | $0.3 / $2.5 |

## Test-set claims as forwarded messages (15 images)

“Exact” = the whole claim came back character for character (after the usual normalisation of diacritics and letter forms).

| Model | Exact | Failed calls | Mean CER | $ / image |
|---|---|---|---|---|
| `qwen/qwen3.7-flash` | 12/15 | 0 | 0.3% | $0.000044 |
