# Extraction bake-off

20 test-set items, each run through the full pipeline once per candidate, fallback off. Complete runs first, sorted by state accuracy, then level accuracy, then cost.

“Items without the model” counts items where the model call was refused or failed and the pipeline answered in lexical-only mode; a row where it is not 0 is not a measurement of that model.

| Model | State | Type | Level | Exact quotes | Invalid JSON | Truncated | Items without the model | s / item | $ / item | Output budget | List price in/out per Mtok |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `qwen/qwen3.8-flash (extraction none, pointing low)` | 85% | 85% | 62% | 76% | 0 | 2 | 0/20 | 8.3 | $0.00027 | 8000 | $0.15 / $0.47 |
| `qwen/qwen3.8-flash` | 85% | 90% | 62% | 70% | 0 | — | 0/20 | 28.4 | $0.00079 | 6000 | $0.15 / $0.47 |
| `deepseek/deepseek-v4-pro` | 85% | 90% | 62% | 76% | 0 | — | 0/20 | 25.1 | $0.00174 | 6000 | $0.2088 / $0.4176 |
| `deepseek/deepseek-v4-pro (extraction none, pointing low)` | 85% | 80% | 50% | 81% | 0 | 0 | 0/20 | 7.4 | $0.00046 | 8000 | $0.2088 / $0.4176 |
| `openai/gpt-6-luna` | 80% | 90% | 75% | 95% | 0 | 0 | 0/20 | 4.0 | $0.00015 | 6000 | $0.1 / $0.5 |
| `qwen/qwen3.8-flash (extraction none, pointing none)` | 80% | 85% | 62% | 76% | 0 | 0 | 0/20 | 3.4 | $0.00017 | 8000 | $0.15 / $0.47 |
| `z-ai/glm-5.3-flash` | 80% | 90% | 62% | 75% | 0 | 0 | 0/20 | 4.3 | $0.00027 | 6000 | $0.15 / $0.5 |
| `deepseek/deepseek-v4-pro-0813` (incomplete) | 75% | 75% | 25% | 100% | 0 | — | 13/20 | 7.7 | $0.00091 | 6000 | $0.22 / $4.2 |
| `google/gemini-3.8-flash` (incomplete) | 70% | 75% | 38% | 100% | 0 | 0 | 5/20 | 1.6 | $0.00065 | 3000 | $0.75 / $3.75 |
| `anthropic/claude-sonnet-5.5` (incomplete) | 70% | 70% | 25% | — | 0 | 0 | 20/20 | 0.2 | $0.00000 | 1500 | $2 / $10 |
| `qwen/qwen3.7-plus` (incomplete) | 70% | 70% | 25% | 100% | 0 | 0 | 18/20 | 4.0 | $0.00030 | 4000 | $0.32 / $1.28 |

Misses per model (item → state returned):

- `qwen/qwen3.8-flash (extraction none, pointing low)`: quote_misattributed-01→supported, quote_misattributed-02→supported, ruling_definitive-01→needs_review
- `qwen/qwen3.8-flash`: quote_misattributed-01→supported, quote_misattributed-02→supported, ruling_definitive-01→needs_review
- `deepseek/deepseek-v4-pro`: quote_misattributed-01→supported, quote_misattributed-02→supported, ruling_definitive-01→needs_review
- `deepseek/deepseek-v4-pro (extraction none, pointing low)`: quote_misattributed-01→supported, quote_misattributed-02→supported, ruling_definitive-01→no_output
- `openai/gpt-6-luna`: quote_misattributed-01→supported, quote_misattributed-02→supported, no_source-01→supported_with_note, ruling_definitive-01→needs_review
- `qwen/qwen3.8-flash (extraction none, pointing none)`: quote_misattributed-01→supported, quote_misattributed-02→supported, no_source-01→supported_with_note, ruling_definitive-01→needs_review
- `z-ai/glm-5.3-flash`: quote_misattributed-01→supported, quote_misattributed-02→supported, no_source-01→supported_with_note, ruling_definitive-01→needs_review
- `deepseek/deepseek-v4-pro-0813`: quote_misattributed-01→supported, quote_misattributed-02→supported, ruling_definitive-01→no_output, ruling_disputed-01→no_output, ruling_disputed-02→no_output
- `google/gemini-3.8-flash`: quote_misattributed-01→supported, quote_misattributed-02→supported, ruling_definitive-01→needs_review, ruling_definitive-02→no_output, ruling_disputed-01→no_output, ruling_disputed-02→no_output
- `anthropic/claude-sonnet-5.5`: quote_misattributed-01→supported, quote_misattributed-02→supported, ruling_definitive-01→no_output, ruling_definitive-02→no_output, ruling_disputed-01→no_output, ruling_disputed-02→no_output
- `qwen/qwen3.7-plus`: quote_misattributed-01→supported, quote_misattributed-02→supported, ruling_definitive-01→no_output, ruling_definitive-02→no_output, ruling_disputed-01→no_output, ruling_disputed-02→no_output
