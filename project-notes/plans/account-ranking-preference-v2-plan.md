# Account Ranking Preferences v2 — Fit-First Shortlist Composition

Status: **implemented for local evaluation; range still needs tuning before ship.**

## First v2 live smoke result — 2026-07-12

Ten live Rainforest/Haiku comparisons completed after the fit-frontier and policy
path was added. Price and brand now visibly reshape the selected six in most tested
categories: price consistently retained the fit-frontier hero then selected lower
priced alternatives, while brand surfaced expected examples such as BLACK+DECKER /
DEWALT drills, gb / Graco strollers, Breville / OXO grinders, and recognized robot-
vacuum and dash-cam brands.

Range is not ready: it changes selection, but the current price-band/family signals
can over-favor expensive near-duplicates rather than genuinely different product
types. Keep range behind the experiment until category-aware product-family signals
are added and it is re-evaluated.

## Why v2 is needed

The 2026-07-12 live evaluation showed that the account preference is a good product
idea but the current prompt-only implementation is too weak:

- price changed 11 of 60 selected slots, but sometimes weakened the best fit;
- brand changed only 4 of 60 slots;
- range changed only 5 of 60 slots;
- several categories returned the exact balanced set for every strategy.

The full evidence is in `account-ranking-preference-live-evaluation-2026-07-12.md`.

## Goal

Keep Focamai's current guided flow and six-pick shortlist. Make an active account
preference reliably affect **which six credible, fitting products are selected**,
without letting it override explicit user requirements.

## Non-goals

- No new filter/sort UI or per-search preference controls.
- No retailer abstraction or provider rewrite.
- No giant global brand database before evidence says it is needed.
- Do not change the balanced/default shortlist behavior in this iteration.
- Do not force a different set when the candidate pool genuinely offers no better
  preference-shaped alternative.

## Design

### 1. Preserve the facts already available from discovery

Rainforest normalization currently reads `brand`, but `buildAiCandidate()` drops it
before the candidate pool reaches finalize. First, preserve and sanitize:

- provider `brand` as `brandName`;
- existing `duplicateFamilyKey`, `attributes`, `numericPrice`, ratings, review count,
  `trustSignals`, and product title;
- a deterministic pool-relative `priceBand` (`budget`, `mid`, `premium`).

Files likely involved:

- `backend/lib/rainforest-pipeline.js`
- `backend/lib/result-filter.js`
- `backend/lib/handlers/finalize-candidate.js`
- `backend/lib/ai-selector.js`

This does not yet decide that a brand is well known. It makes the provider fact
available for an inspectable later decision.

### 2. Separate fit from composition

Keep Haiku responsible for product understanding and hard-context fit. For a
non-balanced preference, have it return a **fit frontier**: the best 10–12 eligible,
credible candidate IDs in fit/quality order. It must ignore account preference while
creating this frontier.

The existing strict index tool should remain. Extend its bounded schema rather than
accepting free text or client-provided product data.

The final six are then selected from that frontier by pure, testable composition
rules. This prevents a low-price or familiar-brand preference from promoting a poor
fit product simply because the model followed a vague prompt instruction.

Balanced remains on today's lock path until the new policy proves equivalent or
better; do not bundle a baseline-ranking rewrite into this experiment.

### 3. Add small deterministic composition policies

Create one pure module, for example `backend/lib/ranking-preference-policy.js`.
It receives the fit frontier, candidate facts, preference enum, and shortlist limit.
It returns six ordered candidate IDs plus policy diagnostics.

#### Price

1. Preserve the frontier's strongest-fit hero as pick #1.
2. Define a quality floor from the fit frontier: candidates must remain eligible,
   have credible rating/review/trust signals, and not be a duplicate family.
3. Fill the remaining slots with lower-priced credible candidates across available
   lower price bands before filling ordinary frontier order.
4. If the frontier has no credible cheaper alternative, keep the balanced-quality
   alternative instead of forcing a cheap weak product.

This directly fixes the stroller and espresso-grinder failures found in evaluation.

#### Known brands

1. Determine `recognizedBrand` for each candidate in the fit frontier.
2. If credible recognized-brand candidates exist, select them first in fit order.
3. If fewer than six exist, fill remaining slots with the best fitting credible
   non-brand candidates.
4. If no recognized brand can be established with enough confidence, fall back to
   balanced composition and record that reason.

`brandName` alone does not establish that a brand is known. For the first version,
use a small reviewable category-aware brand catalog only for categories covered by
evaluation. It can grow from real evidence. A model may suggest additions offline,
but it must not silently become the sole live authority for a global brand list.

#### Range

1. Preserve the strongest-fit hero as pick #1.
2. Give candidates a `productFamily` derived from existing duplicate-family/title
   information and a small category-aware type rule where needed.
3. For picks #2–6, first choose candidates that add an unrepresented combination
   of product family and price band while meeting the fit/quality floor.
4. Fill any remaining slots in fit order.

This is not artificial variety: it only differentiates candidates when the fit
frontier actually contains credible different options.

### 4. Keep explanation and diagnostics aligned

- Pass the actual selected strategy and policy facts into mini enrichment so its
  tradeoffs explain the selection honestly.
- Store a safe policy summary in the existing token-scoped selection state:
  `fitFrontierCount`, `recognizedBrandCount`, selected price bands, selected product
  families, and fallback reason when one occurs.
- Add the effective preference and policy outcome to search diagnostics. Do not
  store user profile text or raw provider payloads there.

## Build order

1. **Characterization fixtures first.** Turn the ten live cases into sanitized,
   checked-in candidate-pool fixtures. Add deliberately difficult cases: a cheap
   wrong-product candidate, fewer-than-six recognized brands, and a one-family pool.
2. **Preserve candidate facts.** Carry `brandName` and `priceBand` through discovery,
   cache, finalize sanitization, and the Haiku candidate summary. No selection change
   in this step.
3. **Implement pure policies.** Unit-test price, brand, and range selection from
   fixed fit-frontier fixtures. The policy must be deterministic and side-effect free.
4. **Add the fit frontier.** Extend the Haiku tool call only for non-balanced modes;
   preserve strict index validation, timeouts, top-up, and rate limits.
5. **Wire policy result into finalize/enrichment/diagnostics.** Keep the existing
   server-owned candidate proof and six-item response contract.
6. **Re-run live evaluation.** Use the same ten cases and compare composition against
   the 2026-07-12 report before changing UI or declaring the feature ready.

## Acceptance checks

- Balanced output is unchanged by default-path snapshots.
- Price always retains the strongest fit hero and includes at least one lower-price
  credible alternative when the fit frontier contains one.
- Brand returns six recognized-brand candidates when the frontier contains six;
  otherwise it returns all credible recognized brands before non-brand fill-ins.
- Range contains at least two price bands and two meaningful product families when
  the fit frontier supports both; otherwise it records why it could not.
- No policy bypasses explicit context, Prime eligibility, candidate dedupe,
  moderation, cache validation, or the six-item limit.
- The ten-case live evaluation shows explainable composition changes where the pool
  supports them, while unchanged sets remain acceptable when no credible alternative
  exists.

## Main tradeoff

This adds one structured Haiku fit-frontier output for active preferences and a
small amount of deterministic policy code. That is more work than prompt tuning,
but it produces behavior we can test, explain, and safely revise. A more powerful
model may later improve fit classification, but it should not be the only mechanism
enforcing price, brand, or range promises.
