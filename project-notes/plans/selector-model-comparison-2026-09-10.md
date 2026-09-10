# Blocking selector model comparison — 2026-09-10

## Decision

`gpt-5.6-terra` at low reasoning is the recommended replacement candidate for the blocking Haiku selector. Across two counter-ordered runs, it materially improved hard-requirement handling while keeping latency close enough to the current path for a latency-sensitive product.

Claude Sonnet 5 at low effort is not recommended for this selector. It was latency-competitive, but did not improve requirement accuracy over Haiku.

Implemented after the evaluation: guided finalize now defaults to `gpt-5.6-terra` through `OPENAI_SELECTOR_MODEL` and automatically falls back to `claude-haiku-4-5-20251001` if the OpenAI request fails or is unavailable.

## Method

- Read the same ten exact historical Rainforest candidate pools from the configured Supabase `search_cache` table.
- Applied the current new-condition and narrow provable-constraint filters before every selector.
- Made no Rainforest calls, Supabase writes, or production requests.
- Gave Haiku, Terra, and Sonnet the same selector prompt, candidate evidence, primary/reserve contract, and strict output shape.
- Used `gpt-5.6-terra` with low reasoning and Claude Sonnet 5 with low effort/adaptive thinking.
- Ran every model sequentially for every pool, then repeated all ten cases in reverse provider order to reduce call-order bias.
- Blindly rotated the three returned shortlists before asking `gpt-5.6-sol` at low reasoning to score them.
- Kept the existing deterministic evidence checks as a separate signal because the AI judge was observably inconsistent on some missing-evidence cases.

The reusable runner is `backend/scripts/benchmark-selector-models.js`, exposed as `npm run test:benchmark:selector-models`. Raw JSON reports are written under ignored `temp-data/` paths.

## Combined results

Each selector made 20 paid calls: two runs over ten stored pools.

| Selector | Mean | p50 | p95 | Judge fit | Judge critical-free | Deterministic pass | Preferred | Avg. shown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Haiku 4.5 | 6.29s | 7.43s | 10.18s | 3.60/5 | 15/20 | 14/20 | 2/20 | 5.50 |
| GPT-5.6 Terra, low | 7.15s | 6.41s | 10.65s | 4.00/5 | 19/20 | 17/20 | 16/20 | 4.45 |
| Claude Sonnet 5, low | 6.34s | 5.83s | 9.53s | 3.65/5 | 14/20 | 14/20 | 1/20 | 5.10 |

One comparison was judged a tie.

Relative to Haiku, Terra was 0.86s slower at the mean, 1.02s faster at the median, and 0.47s slower at p95. Its maximum was 12.90s, caused by one air-fryer call. With only 20 calls, these are directional workload-specific measurements rather than a provider latency guarantee.

## What changed with Terra

- **Coffee maker:** Terra returned five clean picks in the first run. Its repeat added two listings without proof of the requested brewer format, so it is better but not perfect. Haiku repeatedly included two listings without explicit red evidence; Sonnet repeatedly included two or three listings without format proof.
- **Mini briefcase:** Haiku displayed six backpacks/totes in both runs. Terra returned two imperfect large laptop briefcases once and an empty shortlist once. Sonnet returned the same two imperfect products both times.
- **Yarn:** Terra returned an empty shortlist both times because the pool did not prove the complete light-blue, flecked, weight-4/5, non-wool requirement. Haiku and Sonnet displayed six and repeatedly violated the evidenced color/weight requirements.
- **Moto G Play 2024:** Terra returned both remaining proven phones; Haiku and Sonnet returned one.
- **Recovery query shape:** In the two impossible pools, Terra returned normal self-contained refined searches preserving the stated constraints. The Haiku/Sonnet responses included malformed suggestion fragments that the existing server validator would safely reject.

Terra's lower average displayed count reflects conservative behavior, not response-shape failure. That aligns with the tester policy of returning fewer credible picks and offering a refined search instead of padding. It also means a production switch will exercise the partial-shortlist recovery UI more often.

## Limitations

- The ten pools intentionally emphasize known failures and are not a random sample of all searches.
- The blind Sol judge varied between repeats and sometimes overlooked deterministic missing evidence. Treat its preference count as supporting evidence, not ground truth.
- The deterministic range checker under-counted some curtain-rod titles because ranges such as `66 to 120` did not repeat the inch unit next to the maximum; those failures are evaluator limitations, not confirmed selector violations.
- This replay measured the blocking selector call only. It did not measure deployed Render/browser timing, discovery, persistence, or background enrichment.

## Recommendation

Terra is implemented behind the explicit `OPENAI_SELECTOR_MODEL` setting with Haiku retained as the operational fallback. Preserve the server-owned deterministic guard and the shorter-shortlist policy. After deployment, compare real selector and total finalize p50/p95 timing before removing the fallback or declaring the latency question closed.

Do not replace Haiku with Sonnet 5 for this workload based on these results.
