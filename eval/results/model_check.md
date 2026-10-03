# Model check

Produced by `scripts/check_models.py` — one tiny Arabic test per task; cost is what the API reported for the call.

| Task | Model | Result | Latency | Cost | List price | Note |
|---|---|---|---|---|---|---|
| text | `qwen/qwen3.8-flash` | PASS | 15.2 s | $0.000520 | $0.15/$0.47 per Mtok | quote exact; 1 claim(s) |
| text | `deepseek/deepseek-v4-flash` | PASS | 124.4 s | $0.000290 | $0.028/$0.056 per Mtok | quote exact; 1 claim(s) |
| text | `nvidia/nemotron-3-super-120b-a12b:free` | PASS | 6.6 s | $0.000000 | free | quote exact; 1 claim(s) |
| text | `openai/gpt-6.1-sol` | PASS | 3.1 s | $0.004056 | $2/$10 per Mtok | quote exact; 1 claim(s) |
| vision | `qwen/qwen3.7-flash` | PASS | 6.3 s | $0.000059 | $0.03/$0.13 per Mtok | altered wording kept as written (confidence 0.95) |
| audio | `google/gemini-3.5-flash-lite` | PASS | 1.2 s | $0.000194 | $0.3/$2.5 per Mtok | similarity to the verse 1.00, 1 segment(s) — recitation of 112:1 (approved audio library) |
