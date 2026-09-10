# Haiku primary/reserve quality evaluation — 2026-09-09

## Question

Does the new Haiku primary/reserve contract prevent constraint-breaking shortlist padding across a broader set of real searches?

## Method

- Read ten exact historical Rainforest candidate pools from the configured Supabase `search_cache` table. The database access was read-only.
- Covered budgets, dimensions, color, product type, model compatibility, and material/weight requirements.
- Ran each pool through the current production Haiku prompt with up to six high-confidence primary picks and six ranked reserves.
- Materialized the shortlist only from Haiku's returned frontier, using production duplicate and brand-cap behavior. Raw candidate-order padding was not allowed.
- Compared the current result with the historical stored shortlist in randomized A/B order using `gpt-5.6-terra` at low reasoning.
- Added deterministic evidence checks for constraints that can be verified from stored price/title/attribute data.
- Made ten paid Anthropic calls and ten paid OpenAI judge calls. No Rainforest calls or Supabase writes were made.

The reusable command is:

```sh
npm run test:smoke:reserve-quality
```

The harness lives at `backend/scripts/smoke-haiku-reserve-quality.js`. It reads exact Supabase rows, supports `RESERVE_SMOKE_LIMIT` and `RESERVE_SMOKE_CONCURRENCY`, and writes detailed gitignored JSON under `temp-data/haiku-reserve-quality-smoke-*.json`.

## Thresholds fixed before the run

- Current average overall fit at least 4.0/5.
- At least 90% of cases pass the deterministic hard-evidence checks.
- At least 90% of cases have zero judge-identified critical mismatches.
- Zero critical mismatches among unused reserves.

## Result

Overall result: **failed all four safety thresholds**.

| Measure | Current primary/reserve path | Historical stored shortlist |
| --- | ---: | ---: |
| Average fit | 3.20/5 | 2.70/5 |
| Cases with no judge-identified critical mismatch | 6/10 | — |
| Cases passing deterministic evidence checks | 6/10 | — |
| Blind preference | 6/10 | 1/10 |
| Ties | 3/10 | 3/10 |
| Critical mismatches among unused reserves | 9 | — |

The current path was usually better than the historical stored result, and the original two regressions stayed fixed:

- The under-$200 stroller result contained six compliant picks, included the $189.99 Graco Ready2Jet, and excluded the $550 Doona. Its four unused reserves also passed both judge and deterministic checks.
- The curtain-rod result no longer contained the 79-inch tension shower rod and retained the distinct KAMANINA/YaFex choices. However, the stored listing evidence did not explicitly prove wall-mount installation, so the judge scored the set only 2/5 despite finding no clear contradiction.

## Confirmed remaining failures

| Search | Current failure |
| --- | --- |
| Red programmable coffee maker under $100 | Three of six displayed picks were red and under budget but lacked evidence for the requested programmable 12-cup/carafe format. Most unused reserves had the same gap. |
| Mini briefcase under $20 | Two displayed picks exceeded $20, and several displayed/reserve items were backpacks or totes rather than a fitting briefcase/laptop bag. The judge found only one suitable displayed pick. |
| Moto G Play 2024 phone, not a case | Two correct phones were followed by wrong Moto G 5G/Stylus models; a generic Moto G Play listing did not prove the 2024 model. |
| Light-blue flecked yarn, weight 4 or 5, no wool/fleece | No displayed pick proved all requested color/fleck/weight requirements; one was a clear weight-3 conflict, and the reserve set also contained incompatible weights. |

Two additional low scores were caused mainly by missing stored evidence rather than a clear contradictory selection:

- The under-$30 camera listings did not prove durability or shipping-inclusive totals.
- The curtain-rod listings did not explicitly prove wall-mount installation.

No reserve was promoted in this run: nine cases supplied six primary picks, while the Moto case supplied five primaries and no reserves. The run still directly evaluated unused reserve quality and found nine judge-identified critical mismatches, concentrated in the briefcase, coffee-maker, and yarn cases.

## Cost-driving usage and latency

- Anthropic: 58,424 input tokens and 3,206 output tokens across ten calls.
- OpenAI judge: 18,048 input tokens and 4,356 output tokens across ten calls.
- Mean Haiku selection latency: 10.29 seconds.
- Mean judge latency: 7.96 seconds.

## Decision

Keep the primary/reserve contract because it removes the demonstrated raw-order top-up regression and improved six of ten comparisons. Do not describe Haiku-labeled high-confidence reserves as deterministically constraint-safe.

The next selection fix should add a conservative server-owned eligibility layer for constraints that can be proven from structured/title evidence, beginning with numeric price ceilings and explicit product/model/type exclusions. It should filter both primaries and reserves, return fewer results when proof is missing, and record every rejection. More semantic constraints such as intended capacity, wall mounting, and yarn characteristics may require a structured AI extraction/evaluation step rather than broad regular expressions.

After that guard exists, rerun this exact Supabase-backed suite and require the thresholds above before treating reserves as safe replacements.

## Immediate follow-up implementation

The first conservative server-owned guard was implemented after this run, without repeating the paid evaluation:

- Explicit currency price ceilings such as `under $200`, `below $30`, `no more than $80`, and `maximum spend is $500 or less` remove candidates with missing or excessive prices before Haiku sees the pool. Prompts containing multiple distinct currency ceilings are treated as ambiguous and left to Haiku rather than deterministically applying the wrong amount.
- A narrow allowlist of explicitly negated product/material terms handles requests such as `phone, not case`, `filters only, not a vacuum`, `chicken-free`, and `not wool or fleece` without treating arbitrary negative prose as a filter.
- A product query ending in a four-digit year plus at least two meaningful preceding model tokens, such as `moto g play 2024`, requires those model/year tokens in the candidate title or brand evidence.
- Every rejection records the candidate ID, reason, and normalized constraint in finalize logs, stored selection metadata, and the API selection response.
- The guard runs over the whole condition-eligible pool before Haiku, so it applies equally to potential primary picks and reserves.

Read-only Supabase replays confirmed that this guard removes the $550 Doona plus three other over-budget strollers and eleven over-$20 briefcase candidates. For the Moto pool, the existing new-condition filter removes two renewed listings and the new guard removes five cases plus three wrong/unsupported models, leaving only the two listings that explicitly prove `Moto G Play 2024`. It intentionally does not claim to solve the coffee-maker format, positive briefcase-type proof, wall mounting, family capacity, or yarn color/weight/fleck requirements.

Per the user's instruction, no test suite and no second paid evaluation were run for this immediate follow-up. Static checks and direct read-only replay inspection are the verification for this checkpoint.
