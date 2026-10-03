# Model check

Produced by `scripts/check_models.py` — one tiny Arabic test per task; cost is what the API reported for the call.

| Task | Model | Result | Latency | Cost | List price | Note |
|---|---|---|---|---|---|---|
| text | `deepseek/deepseek-v4-pro` | PASS | 20.7 s | $0.002528 | $0.2088/$0.4176 per Mtok | quote exact; 1 claim(s) |
| text | `deepseek/deepseek-v4-pro-0813` | PASS | 8.2 s | $0.001707 | $0.22/$4.2 per Mtok | quote exact; 1 claim(s) |
| text | `qwen/qwen3.8-flash` | PASS | 12.9 s | $0.000491 | $0.15/$0.47 per Mtok | quote exact; 1 claim(s) |
| text | `qwen/qwen3.7-plus` | PASS | 28.7 s | $0.002384 | $0.32/$1.28 per Mtok | quote exact; 1 claim(s) |
| text | `anthropic/claude-sonnet-5.5` | PASS | 5.0 s | $0.007418 | $2/$10 per Mtok | quote exact; 1 claim(s) |
| text | `google/gemini-3.8-flash` | PASS | 3.0 s | $0.000634 | $0.75/$3.75 per Mtok | quote exact; 1 claim(s) |
| text | `z-ai/glm-5.3-flash` | PASS | 1.1 s | $0.000215 | $0.15/$0.5 per Mtok | quote exact; 1 claim(s) |
| text | `deepseek/deepseek-v4-flash` | PASS | 6.8 s | $0.000052 | $0.028/$0.056 per Mtok | quote exact; 1 claim(s) |
| text | `qwen/qwen3.7-flash` | PASS | 14.0 s | $0.000294 | $0.03/$0.13 per Mtok | quote exact; 1 claim(s) |
| text | `openai/gpt-6-luna` | PASS | 2.2 s | $0.000217 | $0.1/$0.5 per Mtok | quote exact; 1 claim(s) |
| text | `openai/gpt-6.1-sol` | PASS | 3.0 s | $0.004126 | $2/$10 per Mtok | quote exact; 1 claim(s) |
| text | `nvidia/nemotron-3-super-120b-a12b:free` | PASS | 7.8 s | $0.000000 | free | quote exact; 1 claim(s) |
| text | `qwen/qwen3.8-27b:free` | PASS | 5.8 s | $0.000000 | free | quote exact; 1 claim(s) |
| vision | `deepseek/deepseek-v4.1-flash` | PASS | 5.4 s | $0.000182 | $0.3/$1.2 per Mtok | altered wording kept as written (confidence 0.95) |
| vision | `qwen/qwen3.8-flash` | FAIL | 6.1 s | $0.000229 | $0.15/$0.47 per Mtok | ValueError: response failed validation (1 errors) |
| vision | `qwen/qwen3.7-flash` | PASS | 4.4 s | $0.000046 | $0.03/$0.13 per Mtok | altered wording kept as written (confidence 0.95) |
| vision | `google/gemini-3.5-flash-lite` | PASS | 1.8 s | $0.000569 | $0.3/$2.5 per Mtok | altered wording kept as written (confidence 0.99) |
| vision | `google/gemini-3.1-flash-lite` | PASS | 3.5 s | $0.000601 | $0.25/$1.5 per Mtok | altered wording kept as written (confidence 1.00) |
| vision | `z-ai/glm-4.6v` | FAIL | 14.0 s | $0.001053 | $0.3/$0.9 per Mtok | altered verse not read exactly (best similarity 0.20) |
| vision | `z-ai/glm-5.3-flash` | FAIL | 11.0 s | $0.000165 | $0.15/$0.5 per Mtok | altered verse not read exactly (best similarity 0.96) |
| vision | `google/gemma-4-31b-it:free` | FAIL | 0.3 s | $0.000000 | free | RateLimitError 429 |
| vision | `qwen/qwen3.8-27b:free` | FAIL | 1.8 s | $0.000000 | free | altered verse not read exactly (best similarity 0.94) |
| audio | `google/gemini-3.5-flash-lite` | FAIL | 0.1 s | $0.000000 | $0.3/$2.5 per Mtok | APIStatusError 402 — recitation of 112:1 (approved audio library) |
| audio | `google/gemini-3.1-flash-lite` | FAIL | 0.1 s | $0.000000 | $0.25/$1.5 per Mtok | APIStatusError 402 — recitation of 112:1 (approved audio library) |
| audio | `google/gemini-3.8-flash` | FAIL | 0.2 s | $0.000000 | $0.75/$3.75 per Mtok | APIStatusError 402 — recitation of 112:1 (approved audio library) |
| audio | `qwen/qwen3.8-omni-flash` | FAIL | 0.1 s | $0.000000 | $0.15/$0.47 per Mtok | APIStatusError 402 — recitation of 112:1 (approved audio library) |
| audio | `xiaomi/mimo-v2.6-flash` | FAIL | 0.2 s | $0.000000 | $0.14/$0.28 per Mtok | APIStatusError 402 — recitation of 112:1 (approved audio library) |
| audio | `mistralai/voxtral-small-24b-2507` | FAIL | 0.1 s | $0.000000 | $0.1/$0.3 per Mtok | APIStatusError 402 — recitation of 112:1 (approved audio library) |
| audio | `openai/gpt-audio-mini` | FAIL | 0.1 s | $0.000000 | $0.6/$2.4 per Mtok | APIStatusError 402 — recitation of 112:1 (approved audio library) |
| audio | `thinkingmachines/inkling-small:free` | FAIL | 0.1 s | $0.000000 | free | PermissionDeniedError 403 — recitation of 112:1 (approved audio library) |
