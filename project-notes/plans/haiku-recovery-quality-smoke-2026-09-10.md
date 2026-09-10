# Partial-shortlist recovery evaluation — 2026-09-10

## Question

Does the first-finalize recovery path reliably appear when the stored candidate pool cannot support four strong picks, preserve the shopper's requirements in its refined query, and avoid making the resulting selection worse?

## Method

- Read the same ten exact historical Rainforest candidate pools used by the reserve-quality evaluation from the configured Supabase `search_cache` table.
- Applied the production new-condition and provable-constraint guards before selection.
- Ran the current production Haiku primary/reserve selector once for every pool.
- Reproduced the production recovery trigger: fewer than four returned core candidates plus a valid, distinct suggested query.
- Asked an independent `gpt-5.6-terra` judge whether each first shortlist actually warranted recovery and whether a surfaced suggestion preserved every explicit requirement.
- When production recovery surfaced, ran a second Haiku selection after refiltering the same stored pool for the refined query. This is explicitly a same-pool proxy, not a simulation of fresh Amazon recall.
- Checked the latest 1,000 Supabase rows with stored selection metadata before the run; none contained a production `candidateRecovery` event that could supply a real historical before/after pair.
- Made no Rainforest calls, no Supabase writes, and no product-code changes in response to the findings.

The reusable command is:

```sh
npm run test:smoke:recovery-quality
```

The harness lives at `backend/scripts/smoke-haiku-recovery-quality.js`. It supports `RECOVERY_SMOKE_LIMIT` and `RECOVERY_SMOKE_CONCURRENCY` and writes detailed gitignored JSON under `temp-data/haiku-recovery-quality-smoke-*.json`.

## Thresholds fixed before the full run

- Recovery appears for at least 80% of judge-identified cases that need it.
- Every surfaced suggestion is structurally valid.
- Every surfaced suggestion preserves all explicit shopper requirements and adds no conflict.
- Every same-pool second pass is at least as good as its first shortlist.

## Result

Overall result: **failed three of four safety thresholds**.

| Measure | Result | Threshold |
| --- | ---: | ---: |
| Judge-identified cases needing recovery | 5/10 | — |
| Recovery actually surfaced | 1/10 | — |
| Recovery recall when needed | 1/5 (20%) | at least 80% |
| Surfaced suggestions structurally valid | 1/1 | 100% |
| Surfaced suggestions preserving requirements | 0/1 | 100% |
| Same-pool second passes not worse | 0/1 | 100% |

## Case results

| Search | Judge says recovery needed | Production trigger | Finding |
| --- | :---: | :---: | --- |
| Travel stroller under $200 | No | No | Six suitable picks; no recovery needed. |
| 112-inch chrome wall-mount curtain rod | Yes | No | Six picks were returned, but none contained evidence for wall mounting. |
| Office chair under $300 | No | No | Five credible fits; one gaming-chair mismatch did not reduce the suitable count below four. |
| Red programmable coffee maker under $100 | No | No | This run contained four judge-credible red programmable 12-cup options. |
| Family-size air fryer | No | No | Five candidates credibly supported the requested capacity. |
| Durable compact camera below $30 total | Yes | No | Item price was below $30, but stored evidence did not prove shipping-inclusive total or durability. |
| Mini briefcase under $20 | Yes | No | Haiku returned four core picks plus reserves, but all displayed items were backpacks, totes, or purses rather than qualifying briefcases. |
| Men's dress pants under $100 | No | No | Six suitable picks; no recovery needed. |
| Moto G Play 2024 phone, not case | Yes | Yes | Recovery surfaced, but the suggested query added `unlocked`; its same-pool proxy admitted wrong Moto models and was worse. |
| Light-blue flecked weight-4/5 yarn, no wool/fleece | Yes | No | Haiku returned six core picks although the judge found no product proving all requirements. |

## Confirmed problems

### 1. The trigger measures Haiku confidence, not demonstrated suitability

Recovery currently requires fewer than four Haiku-labelled core picks. Haiku supplied at least four core picks for the curtain-rod, camera, briefcase, and yarn cases even though the judge found fewer than four credible fits. The recovery UI therefore cannot help with the most common failure shape in this set: confidently returned but weak products.

### 2. The one surfaced refined query changed the request

For `moto g play 2024` with `phone, not case`, Haiku suggested:

```text
Moto G Play 2024 unlocked phone
```

`unlocked` was not requested. More importantly, the current deterministic model guard recognizes a four-digit model year only when the year ends the product query. The original query activated `require_moto_g_play_2024`; the refined query did not, because `unlocked phone` followed `2024`. The same stored pool therefore expanded from two explicitly matching candidates to five, and Haiku selected a Moto G 5G 2024, Moto G Stylus 5G 2024, and a Moto G Play listing without 2024 proof. This is a deterministic preservation defect independent of whether fresh Rainforest discovery would return different products.

### 3. Invalid unused suggestions remain contained, but are frequent

Nine first-pass calls returned malformed tool-residue in `suggested_query` instead of an empty string. The existing shared suggestion validator rejected every one, so none reached the UI or started a search. This is contained, but it means missed-recovery cases also had no usable fallback query. The run did not establish why the model produced this value.

## Usage and latency

Full ten-case run:

- Anthropic first pass: 54,481 input tokens and 2,860 output tokens across ten calls.
- Anthropic same-pool second pass: 2,792 input tokens and 163 output tokens across one call.
- OpenAI judge: 9,359 input tokens and 2,546 output tokens across ten calls.
- Mean first Haiku latency: 8.41 seconds.
- Moto second-pass Haiku latency: 13.93 seconds.
- Mean judge latency: 3.90 seconds.

One separate paid dry run preceded the full batch to validate the live schemas: one additional Haiku call and one additional judge call. It made no Rainforest call and no database write.

## Decision implication

The current recovery UI wiring works, but the AI condition that decides when to show it and the requirement preservation across a refined query are not yet safe enough to treat recovery as a quality solution. Do not interpret a missing recovery card as proof that four products actually satisfy the request.

Before relying on automatic recovery, at minimum preserve active deterministic constraints across the refined search. Separately, changing the trigger requires a trustworthy suitability signal; simply increasing the threshold or trusting Haiku's core count does not address the demonstrated briefcase and yarn failures. The user explicitly deferred the previously proposed broad structured requirement/proof layer, so this report does not reactivate that design.

## Artifacts

- Full run: `temp-data/haiku-recovery-quality-smoke-2026-09-10T05-49-51-403Z.json`
- Dry run: `temp-data/haiku-recovery-quality-smoke-2026-09-10T05-47-52-206Z.json`
