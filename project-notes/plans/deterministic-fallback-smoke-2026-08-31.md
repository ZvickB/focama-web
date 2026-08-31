# Deterministic fallback smoke evaluation — 2026-08-31

## Question

Can the current deterministic shortlist be a decent emergency fallback when the Haiku selection call fails or times out?

## Method

- Replayed 20 saved Rainforest responses across contextual, exact-model, compatibility, quantity, dietary, and hard-budget searches.
- Ran each response through the current production result filtering and candidate scoring.
- Compared the current deterministic fallback (`selectDistinctCandidates` over the ordered candidate pool) with the production Haiku shortlist built from the same pool.
- Randomized which shortlist was A or B for each case.
- Used `gpt-5.6-terra` at low reasoning as an independent blind judge. The judge saw only the shopper request and supplied listing evidence.
- No Rainforest, Supabase, or application-data writes were made. The paid run used 20 Haiku calls and 20 OpenAI judge calls.

The reusable command is:

```sh
npm run test:smoke:fallback-quality
```

## Pass criteria fixed before the run

The fallback needed all four:

- acceptable as an emergency result in at least 16/20 cases;
- no clear hard-requirement mismatch in at least 18/20 cases;
- average overall fit of at least 3.5/5;
- at least 75% of Haiku's average quality score.

## Result

Overall result: **failed the safety bar**, while passing the other three quality bars.

| Measure | Deterministic fallback | Haiku path |
| --- | ---: | ---: |
| Average fit | 4.10/5 | 4.45/5 |
| Cases with no critical mismatch | 13/20 | 14/20 |
| Acceptable emergency experience | 19/20 | — |
| Blind preference | 3/20 | 15/20 |
| Ties | 2/20 | 2/20 |

The fallback retained 92.1% of Haiku's numeric fit score, but this understates the UX difference: Haiku was preferred in 15 of the 20 direct comparisons because it usually put the more contextually suitable item first and produced a better ordered set.

Average Haiku selection latency in this run was 4.18 seconds. This measures only the Haiku call, not the full browser-visible flow.

## Critical-mismatch cases

| Search | What entered the deterministic shortlist |
| --- | --- |
| Beginner cordless drill | Two low-power electric screwdrivers instead of general-purpose drills |
| Chicken-free dog food | Two products explicitly labelled chicken |
| Breathable office chair | A leather chair |
| Laptop-and-phone travel charger | A one-port charger that cannot charge both together |
| Exactly 12 AA batteries | A mixed 24-count AA/AAA pack |
| Air fryer under $100 | A booklet and paper liners instead of air fryers |
| Blender under $80 | A $99.99 blender |

Several failures are obvious directly from the titles and prices, so the conclusion does not depend only on subjective judge scoring.

## Important secondary finding

The normal Haiku path also had a clear mismatch in 6/20 cases. In several cases Haiku correctly returned fewer than six strong candidates, but finalization topped the shortlist back up from the same deterministic pool. That can reintroduce the candidates Haiku avoided.

This means the first safety fix should address deterministic top-up behavior shared by both paths, not merely the rare total-AI-failure path.

## Decision

The current fallback is useful for availability, but it is not safe to present as equivalent to the normal ranked shortlist. It is credible on many searches and is clearly better than a hard error, yet hard constraints fail too often for silent use.

Recommended next step:

1. Make top-up conservative: do not force six results when the ranker found fewer credible choices.
2. Add deterministic guards for constraints that can be proven from structured/title data, starting with hard price ceilings, exact quantities, incompatible product/accessory types, explicit exclusions such as `chicken-free`, and incompatible model/size tokens.
3. Re-run this exact 20-case suite after each guard change. Keep Haiku for contextual ordering; do not replace it with the fallback based on these results.

The full per-case JSON from this run is stored locally under `temp-data/fallback-quality-smoke-2026-08-31T23-21-31-123Z.json` and is intentionally gitignored.
