# Query Translation Live Evaluation — 2026-08-03

## Decision

Do not put a general AI query-translation call in front of Rainforest yet.

The tested translation path added a median 1.70 seconds before discovery and did
not improve retrieval consistently enough to justify that delay. Raw conversational
Amazon searches were stronger than expected in most cases. One translation also
made an unsupported product-subtype choice, which is a product risk rather than
only a latency tradeoff.

The safer next UX architecture remains either:

1. a required concise product/topic field plus optional natural-language details on
   the first screen, with Rainforest using the topic and finalize using both; or
2. a narrower conditional translator used only for cases already known to need
   provider-query repair, after a separate evaluation defines that gate.

This evaluation made no production behavior changes.

## Method

- Eight real Amazon US cases:
  - two simple keyword searches;
  - two detailed searches with searchable constraints;
  - two conversational/contextual searches;
  - two exact compatibility/accessory searches.
- Each case used:
  - one paid `gpt-5.4-nano` structured translation call;
  - one paid Rainforest search using the complete raw request;
  - one paid Rainforest search using the translated provider query.
- Total paid calls:
  - 8 OpenAI translations;
  - 16 Rainforest discoveries;
  - 0 Haiku finalize calls.
- Finalize comparisons were intentionally skipped because discovery did not meet
  the predeclared requirement of a clear, broad relevance improvement.
- Raw evidence is stored in `temp-data/query-translation-eval/latest.json`.
- The reproducible diagnostic harness is
  `temp-data/query-translation-eval/run-eval.mjs`.

## Latency

| Measurement | Result |
|---|---:|
| Translation minimum | 1.06 s |
| Translation median | 1.70 s |
| Translation mean | 1.61 s |
| Translation maximum | 2.16 s |
| Raw-query Rainforest median | 4.28 s |
| Translated-query Rainforest median | 5.30 s |
| Sequential translation + Rainforest median | 6.67 s |
| OpenAI translation tokens | 2,858 total |

Rainforest timings vary independently, so the cleanest attributable latency cost is
the 1.70-second median translation step. In this sample, measured time to a
translated candidate pool was about 2.40 seconds slower at the median than the raw
path.

## Results

| Case | Raw candidates | Translated candidates | Judgment |
|---|---:|---:|---|
| `office chair` | 30 | 30 | Neutral. AI left the query unchanged, so the added delay bought nothing. |
| `air fryer` | 21 | 23 | Neutral. AI left the query unchanged; both pools were strong. |
| Detailed office chair | 30 | 30 | No clear gain. Raw search already returned adjustable-lumbar and long-hours products near the top. |
| Airplane travel stroller under 15 lb | 16 | 27 | Mixed. Translation expanded the pool, but its first result was 15.6 lb and violated the stated hard cap; the raw top results were already strong. |
| Single-cup coffee without pods | 30 | 30 | Regression. AI invented `pour over` even though the user had not chosen manual pour-over versus electric ground-coffee brewing. |
| Flight headphones comfortable with glasses | 20 | 13 | No gain. Raw search returned more relevant candidates and preserved explicit flight/comfort signals. |
| iPhone 16 Pro Max MagSafe case | 16 | 18 | Neutral. Both paths preserved compatibility and returned strong cases. |
| Dyson V15 Detect replacement filters | 2 | 21 | Clear win. Translation removed conversational noise while preserving accessory and exact-model intent. |

Overall judgment:

- 1 clear improvement;
- 1 mixed result;
- 5 neutral or no-better results;
- 1 material regression.

## Important observations

1. Amazon search handled full conversational requests better than expected. The raw
   office-chair, stroller, and flight-headphone requests all produced relevant
   pools without an AI rewrite.
2. More candidates did not automatically mean a better pool. The translated
   stroller search returned eleven additional candidates but put a hard-constraint
   violation first.
3. A general translator can silently choose a subtype. The coffee case converted
   “single cup without pods” into “pour over,” even while the structured response
   separately admitted that clarification was needed.
4. Exact accessory intent is the strongest demonstrated use case. The Dyson query
   improved from two candidates, including one incompatible result, to twenty-one
   clearly targeted filter candidates.
5. Simple searches pay the full AI latency without receiving any translation value.

## Recommendation

Do not make every user wait for AI before Rainforest.

For the first-screen UX currently under discussion, the lowest-risk implementation
is:

- `What are you looking for?` — concise product/topic input used for Rainforest;
- `Anything else we should know? (optional)` — natural-language details used by
  refinement/finalize;
- both fields appear on the same screen, so users may explain themselves immediately
  or submit only the product;
- a follow-up question appears only when missing information would materially change
  the shortlist.

If a one-box conversational experience remains the preferred product direction,
evaluate a conditional repair strategy next. It should target only demonstrably
problematic cases such as exact accessory intent, preserve the raw request as source
of truth, and never execute a translated search when the translator itself says
clarification is required.
