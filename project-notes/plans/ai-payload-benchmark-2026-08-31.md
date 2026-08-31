# Blocking AI Payload Benchmark — 2026-08-31

## Decision

Do not compact the production Haiku shortlist payload or split Luna refinement to
one question for latency reasons. Both approaches reduce tokens, but the
counterbalanced paid benchmark did not show a meaningful, repeatable user-visible
speed improvement. Keep the current richer contracts and revisit only if future
model/provider behavior or measured production latency changes.

## Method

- Paid calls used the configured OpenAI and Anthropic accounts.
- Captured Rainforest fixtures avoided new product-provider charges and kept the
  candidate pools stable.
- Haiku used three pools: travel stroller (16 candidates), wireless headphones
  (15), and coffee grinder (30).
- Each Haiku variant ran twice per pool in current-first order and twice again in
  compact-first order to expose ordering/cold-request effects.
- Luna used five queries. The current two-question contract and proposed
  one-question contract ran once in each order per query.
- The reusable opt-in harness is
  `backend/scripts/benchmark-ai-payloads.js` and runs through
  `npm run test:benchmark:ai-payloads`.

## Haiku results

The compact variant kept all candidates but removed descriptions, reasons,
source, duplicate-family detail, attributes, and other verbose/redundant fields.

| Measurement | Current | Compact |
|---|---:|---:|
| Mean input tokens | 4,729 | 3,043 |
| Input-token change | — | -35.7% |
| Current-first pass mean latency | 7,245 ms | 2,390 ms |
| Compact-first pass mean latency | 2,256 ms | 2,435 ms |
| Cross-variant shortlist Jaccard overlap | — | 0.43-0.83 |

The current-first pass contained one 10.9-13.9 second current-payload outlier for
each pool, while the repeated current calls were 2.2-2.7 seconds. Reversing the
order removed those outliers and made the current payload slightly faster than
compact. Therefore the first-pass difference cannot safely be attributed to
payload size. The compact prompt also changed the selected set materially,
especially for coffee grinders, so this is not a zero-risk serialization cleanup.

## Luna refinement results

The proposed variant generated only the primary question and four answers. The
current contract generates both primary and alternate questions plus eight total
answers in one request.

| Measurement | Current two-question | Single-question |
|---|---:|---:|
| Combined mean latency | 4,243 ms | 3,989 ms |
| Mean latency change | — | -254 ms (-6.0%) |
| Mean input tokens | 616 | 214 |
| Input-token change | — | -65.3% |
| Approx. mean output tokens | 375 | 297 |

Order mattered more than payload: the single-question version was faster when it
ran second, but slower when it ran first. A roughly quarter-second combined gain
does not justify losing the instant alternate question, adding another background
request, or increasing UI/state complexity.

## What remains worth doing

- Cache complete refinement responses for repeat normalized queries. That can
  avoid the entire 3-5 second model call instead of shaving a small fraction from
  it.
- Continue measuring real browser-visible p50/p95 latency after deploying Luna.
- Treat large AI tail spikes as a separate timeout/fallback problem, not as proven
  evidence that input payload size is the cause.
