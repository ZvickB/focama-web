# AI Selection Pipeline: Backend Guardrails and Repair Guide

## Purpose

Use this document when investigating or changing the product-selection pipeline. The central finding is that the AI can select suitable products, but later backend processing can discard those selections and fill the resulting slots with worse matches. Target six results while preferring a shorter credible shortlist over constraint-breaking padding.

No code or database data was changed during the investigation described here.

## Confirmed failure mode

The final product list is not necessarily a faithful rendering of the AI's selected list. The backend applies identity/deduplication rules and then fills missing slots from the original candidate order. Both stages can degrade relevance.

Two controlled replays using stored candidate pools reproduced the final results saved in the database. Treat this as evidence of a backend selection defect, not evidence that Haiku originally selected the poor replacement products.

## Failure 1: dimension tokens are treated as product identity

Status: fixed on 2026-09-09. Standalone numeric title tokens are no longer treated as model identifiers. Regression coverage uses the exact stored Rainforest KAMANINA and YaFex candidates, and a direct Supabase replay retains all five distinct ASINs.

Location: `backend/lib/product-identity.js`, around line 91.

The duplicate-family logic can infer that distinct products are the same model because their titles contain ordinary numeric tokens. Measurements commonly appear in product titles, so those tokens are not reliable identifiers.

### Reproduction: curtain rods

Request: silver or chrome wall-mount rod with a minimum length of 112 inches.

Haiku selected six rods whose length ranges met the request. The backend removed two otherwise-valid selections:

- Two KAMANINA rods shared `72` in their titles, but differed in finials and diameter.
- Two YaFex rods shared `32` and `1`, but advertised different extension ranges.

After these removals, the replacement process inserted other candidates, including a 79-inch tension shower rod. This is unsuitable for the requested wall-mount, minimum-length use case.

### Required behavior

- Do not use shared dimensions, lengths, diameters, package counts, or other generic numeric tokens as sufficient evidence that products are the same model.
- Prefer stable identifiers when available: product ID, ASIN/SKU, normalized manufacturer model number, or a high-confidence combination of brand and non-measurement model text.
- When identity confidence is low, retain both products rather than suppressing a potentially distinct item.
- Add regression coverage for the KAMANINA and YaFex cases.

## Failure 2: replacements ignore shopper constraints

Status: the demonstrated raw-order replacement defect was fixed on 2026-09-09. Haiku now returns up to six high-confidence primary picks followed by ranked high-confidence reserves subject to the same eligibility instructions. Finalize can promote only those returned reserves and returns fewer picks if the frontier runs out; raw candidate order is no longer used for normal-path top-up. The stored under-$200 stroller replay selected the $189.99 Graco Ready2Jet among six compliant primary picks, returned four compliant reserves, and excluded the $550 Doona. A broader 10-case evaluation then showed that Haiku can still mislabel constraint-breaking primaries and reserves as high confidence. A first server-owned guard now filters explicit currency price ceilings, allowlisted explicit exclusions, and trailing year/model signatures before Haiku and records every rejection; broader semantic validation and full selection-transition logging remain open.

Location: `backend/lib/handlers/finalize-handler.js` and `backend/lib/ai-selector.js`.

When filtering leaves fewer than six products, the backend traverses the original candidate order. It checks candidate identity, duplicate families, and brand caps, but does not re-evaluate whether the candidate meets the shopper's stated requirements.

The original candidate order is a generic ranking driven largely by keyword matches, rating, and review count. It must not be treated as a relevance ranking for a refined request.

### Reproduction: strollers

- Haiku supplied five accepted choices below $200.
- The backend filled a missing slot with a $550 Doona.
- A $189.99 Graco Ready2Jet, described as compact with automatic folding, was still present in the candidate pool.

The pipeline had a plausible compliant replacement but chose one without evaluating budget or requested features.

### Required behavior

Before a candidate can replace a removed AI selection, evaluate it against the same structured requirements used for the final shortlist. At minimum, include:

- Budget or price ceiling
- Required and excluded product types
- Required dimensions, ranges, and fit constraints
- Explicit feature requirements
- Any other hard constraints extracted for the request

Rank only eligible replacements. If fewer than six eligible products exist, return fewer results or use a defined fallback policy; never silently fill a slot with a candidate that violates a hard constraint.

Add regression coverage for the stroller case so the Doona is rejected under the under-$200 request and the Ready2Jet is eligible.

## AI selection gap: investigate, do not over-attribute

Status: confirmed by the 2026-09-09 Supabase-backed evaluation. The current path improved on the historical stored shortlist but passed the no-critical-mismatch bar in only 6/10 cases; see `project-notes/plans/haiku-reserve-quality-smoke-2026-09-09.md`.

Location: `backend/lib/ai-selector.js`, around line 434.

The AI selection stage is not fully reliable either:

- Haiku returned a sixth stroller as a medium-confidence alternative, which the parser rejected, leaving five accepted choices.
- Haiku did not include the Graco Ready2Jet despite its apparent fit.

Do not claim that a specific prompt instruction caused the omission without controlled evidence. The prompt currently combines eligibility rules, quality criteria, variety constraints, an exact shortlist count, and alternative-selection guidance. This complexity warrants evaluation, but historical data does not explain why the Graco was omitted.

Increasing the response allowance from 256 to 1,024 tokens did not improve either replay. Token budget alone is not a demonstrated fix.

### Recommended investigation

- Build an evaluation set from the saved stroller and curtain-rod failures.
- Compare prompt variants under controlled conditions.
- Test a response format with six ranked primary selections plus ranked reserve selections that each satisfy hard constraints.
- When parsing or backend validation rejects a primary selection, consume a validated reserve before falling back to generic candidate ranking.

## Implementation order

1. Repair duplicate detection so measurements do not collapse distinct models.
2. Make replacement selection constraint-aware.
3. Evaluate AI selection and reserve-choice behavior using the saved failures.
4. Add end-to-end selection audit logging.

The first two items are the priority because they correct a demonstrated downstream regression while retaining six results.

## Observability requirements

For every final shortlist, retain enough structured data to explain every transition from candidates to displayed products. Record:

- Original AI selections, in rank order
- Validation status for each selection
- Every removal, including the rule and reason
- Every replacement, including why it qualified and its rank among eligible replacements
- The final displayed IDs

This makes future relevance regressions attributable to the AI, parsing/validation, deduplication, or replacement stage instead of requiring replay-based inference.

## Recovery evaluation update — 2026-09-10

The first-finalize recovery path is not yet a substitute for eligibility validation. Across ten exact Supabase candidate pools, an independent judge considered five shortlists weak enough to warrant recovery, while the production Haiku-core-count trigger surfaced recovery once. The one surfaced Moto suggestion added an unstated `unlocked` constraint and changed the query shape so the trailing-year/model guard no longer activated; the same-pool second pass then admitted wrong Moto models. See `project-notes/plans/haiku-recovery-quality-smoke-2026-09-10.md` for the full method, limitations, and usage.

## Model comparison update — 2026-09-10

After the downstream repairs and narrow server-owned guard were in place, two counter-ordered paid runs compared production Haiku, `gpt-5.6-terra` at low reasoning, and Claude Sonnet 5 at low effort over these same ten stored pools. Terra was the only model with a material quality improvement: 19/20 judge-critical-free runs and 16/20 blind preferences, while keeping p95 selector latency within 0.47 seconds of Haiku. Guided finalize now defaults to Terra through `OPENAI_SELECTOR_MODEL`, with Haiku as the automatic provider fallback; Sonnet is not active. See `project-notes/plans/selector-model-comparison-2026-09-10.md`.

## Acceptance criteria

- Six suitable AI selections remain six final results unless a documented validation rule rejects one.
- Distinct products that share measurements are not deduplicated solely for that reason.
- Every replacement satisfies the same hard shopper constraints as an AI-selected product.
- The curtain-rod replay cannot insert the 79-inch tension shower rod for the 112-inch wall-mount request.
- The stroller replay cannot insert the $550 Doona for an under-$200 request when compliant alternatives remain.
- Selection logs identify the origin and reason for each final product.

## Scope guidance

The downstream-removal and constraint-blind replacement defects have now been repaired, and the first narrow server-owned guard is active. The controlled model comparison now supports trying Terra behind an explicit provider setting with Haiku fallback; it does not support removing deterministic guardrails or switching to Sonnet. Broader prompt rewrites and larger response allowances remain unsupported by evidence.
