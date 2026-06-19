# Serper Price Intelligence — Implementation Spec

## Goal
After finalize picks 6 products, automatically check if any product over ~$100 has a meaningfully cheaper price at another retailer. Surface a quiet "better price found" nudge on the product modal. Non-blocking — streams as the last SSE layer after enrichment.

## Why This Matters
Focama's value prop is helping users make a confident purchase decision. Right now we help them pick the right product — but they still have to wonder if they're getting a good price. For products over $100, saving $20-50 at another retailer is real money. Surfacing that automatically makes Focama more useful without turning it into a price comparison site.

## Success Criteria
- A user searching for a $300+ product sees a "better price found" nudge within a few seconds of results loading — if a meaningfully cheaper option exists
- The nudge is accurate enough that clicking through shows the same product at least ~90% of the time
- False positives are tolerable (user clicks, sees wrong product, comes back) but should be uncommon — better to miss a real savings than show a wrong match
- The feature is invisible when it has nothing useful to show — no loading states, no empty sections, no "no savings found" messages
- Existing search experience (speed, enrichment quality) is not degraded at all

## Design Principles
- **Additive only** — the price layer adds to the existing experience, never delays or degrades it
- **Honest over comprehensive** — show fewer, higher-confidence matches rather than noisy results. Include a disclaimer.
- **Fail silent** — if Serper is down, Haiku times out, or no savings are found, nothing happens. The user never knows the check was attempted.
- **Explicit opt-in** — automatic background checks stay off unless `SERPER_PRICE_INTEL_ENABLED=true` and `SERPER_API_KEY` are both configured.

## Current Plan Adjustment
- Phases 1-5 and the modal-only portion of Phase 6 are implemented behind `SERPER_PRICE_INTEL_ENABLED=false`.
- The guardrail phase is complete: cache/rate control, measurement, currency-safe filtering, per-product failure isolation, stale-selection protection, and env tuning are in place.
- The modal panel stays invisible without a valid result, has no loading state, and preserves the existing Amazon CTA hierarchy. The optional card badge is intentionally deferred.
- Oxylabs is retired from the active stack. Keep any historical mention archived only; do not plan new fallback behavior around Oxylabs.

## Architecture Overview
```
Finalize locks shortlist
  |
  +---> Mini enrichment (existing, gpt-5-mini) -----> SSE: enrichment entries
  |                                                        |
  +---> Serper shopping calls (parallel, products >$100)   |
           |                                               v
           +---> Haiku match judgment (after enrichment) --> SSE: price_comparison event
```

Everything after finalize is non-blocking. If Serper or Haiku fails/times out, the price_comparison event never fires. No degradation to existing experience.

---

## Phase 1: Serper Client

### File: `backend/lib/price-comparison/serper-client.js`

**Follow the patterns in `backend/lib/price-comparison/serpapi-client.js`** — same dependency injection style (`deps.fetchImpl`, `deps.apiKey`, `deps.timeoutMs`), same normalized offer shape.

### API details
- Endpoint: `POST https://google.serper.dev/shopping`
- Headers: `X-API-KEY: <key>`, `Content-Type: application/json`
- Body: `{ "q": "<query>", "gl": "<market lowercase>", "hl": "en", "num": 20 }`
- Env var: `SERPER_API_KEY` (add to `getEnv` in `search-data.js`)

### Response shape from Serper
```json
{
  "shopping": [
    {
      "title": "Sony WH-1000XM5 Wireless Headphones",
      "source": "Best Buy",
      "link": "https://...",
      "price": "$349.99",
      "delivery": "Free shipping",
      "imageUrl": "https://...",
      "rating": 4.5,
      "ratingCount": 1243,
      "offers": "10+",
      "productId": "4195027484078635",
      "position": 1
    }
  ]
}
```

### Normalization function: `normalizeSerperShoppingResult(result, { market })`

Must return the same shape as `serpapi-client.js` `normalizeSerpShoppingResult`:
```js
{
  provider: 'serper',
  provider_offer_id: result.productId || null,
  retailer: result.source,
  seller: null,
  sold_by_retailer: null,
  price: parseFloat(result.price.replace(/[^0-9.]/g, '')) || null,  // parse from string
  shipping: null,  // delivery is a string, not parseable reliably
  currency: inferCurrency(result.price, market),  // see below
  url: result.link,
  title: result.title,
  brand: null,  // Serper does not return brand
  condition: null,  // Serper does not return condition
  identifiers: {},
  attributes: {},
}
```

**Currency inference:** If the price string contains "C$" or "CAD", currency is "CAD". If it contains "US$" or "USD", currency is "USD". If it's just "$" and market is "ca", default to "CAD". Otherwise null.

### Export: `searchSerperShoppingOffers(query, market, deps)`
- Returns array of normalized offers
- Default timeout: 10000ms (Serper is faster than SerpApi)

### Tests: `serper-client.test.js`
- Test normalization with various price string formats ("$104.97", "C$349.99", "US$89.99", "$1,299.00")
- Test currency inference logic
- Test that missing/malformed fields don't throw
- Test fetch failure handling
- Follow test patterns from `backend/lib/price-comparison/serpapi-client.test.js` and `provider-clients.test.js`

---

## Phase 2: Haiku Match Judgment

### File: `backend/lib/price-comparison/match-judgment.js`

### Function: `judgeSerperMatches({ product, offers, apiKey })`

**Input — `product`:**
```js
{
  candidate_id: "B0CZEGH123",
  display_title: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Black",
  match_identifier: {
    brand: "Sony",
    model_number: "WH-1000XM5",
    product_type: "wireless headphones",
    attributes: {
      generation: null,
      size: null,
      capacity: null,
      color: "Black",
      material: null,
      pack_count: null,
      condition: "New"
    }
  },
  price: 399.99,
  currency: "CAD"
}
```

This comes from the enrichment output — `match_identifier` and `display_title` are already generated by the mini enrichment call.

**Input — `offers`:** Array of normalized Serper offers (from Phase 1).

**Haiku call:**
- Use `Anthropic` client (already imported in `ai-selector.js` — see how `haikuLockWinnersAndBadges` uses it)
- Model: `claude-haiku-4-5-20251001`
- Use tool_use/structured output to get JSON back

**Prompt (exact text to use):**
```
You are a product matching classifier. Given a source product and a list of shopping offers, determine which offers are the SAME product (same brand, same model, same variant).

Rules:
- MATCH only if brand AND model/product name clearly match
- REJECT if any structured attribute conflicts (different size, capacity, generation, color when color matters, pack count)
- REJECT accessories, cases, replacement parts, bundles that include extras
- REJECT refurbished/renewed/used unless the source is also that condition
- REJECT if the offer title suggests a clearly different product
- When unsure, reject — false negatives are better than false positives

Source product:
Title: {display_title}
Brand: {brand}
Model: {model_number}
Type: {product_type}
Attributes: {attributes as JSON}
Price: {price} {currency}
```

**Response schema:**
```json
{
  "matches": [
    {
      "offer_index": 0,
      "is_match": true,
      "confidence": 0.95,
      "reason": "Same brand, model, and color. Price is lower."
    }
  ]
}
```

**Return value from `judgeSerperMatches`:**
```js
{
  model: "claude-haiku-4-5-20251001",
  matches: [
    {
      offer_index: 0,
      is_match: true,
      confidence: 0.95,
      reason: "Same brand, model, and color",
      offer: { /* the original normalized offer */ },
      savings: 50.00,
      savings_percent: 0.125
    }
  ],
  usage: { inputTokens, outputTokens }
}
```

Only include offers where `is_match === true` AND `confidence >= 0.85` in the returned matches array. Calculate `savings` and `savings_percent` against the source product price. Only include matches where savings >= $8 AND savings_percent >= 0.08.

### Tests: `match-judgment.test.js`
- Mock the Anthropic call
- Test filtering by confidence threshold
- Test savings calculation and thresholds
- Test graceful handling of Haiku returning unexpected shapes

---

## Phase 3: Post-Enrichment Orchestration

### File: modify `backend/lib/handlers/enrichment-handler.js`

### In `runMiniEnrichmentAsync`:

After the existing `miniEnrichSelectedCandidates` call (line 88), add the Serper price intelligence flow:

1. **Filter candidates** — only products where `price >= PRICE_CHECK_THRESHOLD` (env var, default 100)
2. **Fire Serper calls** — these should have been started in parallel before this function. Accept pre-fetched Serper results as an optional parameter. If not pre-fetched, fire them here.
3. **After mini enrichment completes** — use its `match_identifier` output + Serper results to call `judgeSerperMatches` for each qualifying product
4. **Collect results** — array of `{ candidate_id, retailer, price, savings, savings_percent, url, confidence, disclaimer }` for each matched offer
5. **Emit via enrichment bus** — new event: `emitPriceComparisonReady(discoveryToken, priceResults)`

### Important:
- Wrap the entire Serper+Haiku flow in try/catch — failures must not affect enrichment
- Isolate failures per product so one Haiku or Serper failure cannot drop valid results for other shortlist products
- Add a timeout (15s total for the price comparison pipeline)
- Log results for measurement: `logSearchFlowEvent('price_comparison_complete', { ... })`
- Gate behind `SERPER_PRICE_INTEL_ENABLED=true` and `SERPER_API_KEY` being configured — if either is missing, skip silently
- Filter offers before Haiku: positive price, same currency as source product, valid title/url, and savings that already meets the minimum dollar/percent thresholds
- Cap the offers sent to Haiku with `SERPER_PRICE_INTEL_MAX_OFFERS` (default 8)
- Before writing stored results, verify the current token-scoped finalized shortlist still matches the shortlist that started the price job; skip stale writes

### Where to start Serper calls early:
In `backend/lib/handlers/finalize-handler.js`, after `haikuLockWinnersAndBadges` returns the locked IDs, fire Serper calls for qualifying products and pass the promises into `runMiniEnrichmentAsync`. This way Serper runs in parallel with enrichment.

---

## Phase 4: Caching, Rate Limiting, and Measurement (Required Before UI)

### Serper result caching
- Use the existing `backend/lib/price-comparison/comparison-cache.js` patterns where possible without conflating this automatic Serper path with the manual `/api/product/price-check` endpoint.
- Cache key: normalized comparison query + market.
- Cache TTL: 30 minutes for prices.
- Store in Supabase if configured, with local fallback for development.

### Match judgment caching
- Cache key: candidate identity + hash of the filtered Serper offer set + strategy version.
- Cache TTL: 7 days.
- If cached match judgment exists, skip Haiku entirely.

### Rate limiting / budget control
- Respect existing backend rate limiter or add a narrow background-price bucket before enabling real traffic.
- Add a per-search cap for qualified products if needed after measurement.
- Keep `SERPER_PRICE_INTEL_ENABLED=false` until cache/rate controls are tested.

### Log these metrics in `logSearchFlowEvent`
- `price_comparison_started` — how many products qualified and which thresholds were active.
- `serper_results_received` — result count per product.
- `match_judgment_complete` — accepted/rejected/skipped counts, confidence scores, savings amounts.
- `price_comparison_product_failed` — isolated per-product failure.
- `price_comparison_stale_selection_skipped` — stale token/shortlist protection.
- `price_comparison_surfaced` — how many products had a valid nudge available.
- Cache hits/misses for Serper results and match judgments.

### Review after ~50-100 real searches
- What % of searches produce at least one price nudge?
- What's the average savings amount?
- Are there obvious false positives in the match judgments?
- Is Serper/Haiku cost tracking where expected?

---

## Phase 5: SSE Price Comparison Layer

### Modify: `backend/lib/handlers/enrichment-handler.js` — `handleEnrichmentStream`
### Modify: `backend/lib/enrichment-bus.js`

### New event type on the bus:
```js
emitPriceComparisonReady(token, priceResults)
// event name: `price_comparison:${token}`
```

### SSE stream behavior:
The existing `handleEnrichmentStream` sends enrichment entries and ends the response. Change it to:
1. Send enrichment entries when ready (existing behavior)
2. **Do not end the response yet** — keep the SSE connection open
3. Listen for `price_comparison:${token}` event
4. When price comparison arrives, send a second SSE event:
```
data: {"type":"price_comparison","results":[...]}
```
5. Then end the response
6. If price comparison doesn't arrive within 10s after enrichment, end the response anyway (timeout)
7. If `SERPER_PRICE_INTEL_ENABLED` is false or `SERPER_API_KEY` is not configured, end immediately after enrichment (current behavior)

### Client-side SSE handling:
In `src/components/home/useGuidedSearch.js`, the enrichment stream handler currently processes one message and closes. Update it to:
1. Process `enrichment` data as before
2. If a second message arrives with `type: "price_comparison"`, store the results in state
3. Connection closes after both are received or on timeout

### Price comparison result shape sent to client:
```json
{
  "type": "price_comparison",
  "results": [
    {
      "candidate_id": "B0CZEGH123",
      "retailer": "Best Buy",
      "price": 349.99,
      "savings": 50.00,
      "savings_percent": 0.125,
      "url": "https://...",
      "confidence": 0.95,
      "disclaimer": "Prices are approximate. Verify the product matches before purchasing."
    }
  ]
}
```

---

## Phase 6: Frontend Price Nudge UI

### Modify: `src/components/home/ProductDetailModal.jsx`

### Display logic:
- If `price_comparison` results exist for this product's candidate_id, show a "Better price found" section in the modal
- Position: below the product details, above the Amazon CTA
- Show: retailer name, price, savings amount, link
- Include disclaimer text in small/muted type
- The badge/section appears without a loading state — it's either there or it isn't

### Suggested UI:
```
+-----------------------------------------------+
|  💡 Better price found                         |
|  Best Buy — $349.99 (save $50.00 / 12%)       |
|  [View on Best Buy →]                          |
|                                                |
|  Prices are approximate. Verify the product    |
|  matches before purchasing.                    |
+-----------------------------------------------+
```

### Also modify: `src/components/home/ResultsSection.jsx`
- Optional: show a small badge on the product card itself (e.g., "Better price available") if price comparison data exists for that candidate
- Keep it subtle — not a flashy banner

### State:
- Price comparison results should live in the guided search state alongside enrichment entries
- No separate fetch needed — arrives via the same SSE connection

---

## Tuning Levers
- `PRICE_CHECK_THRESHOLD` — minimum product price to trigger (default: 100)
- `PRICE_MATCH_MIN_SAVINGS` — minimum dollar savings to surface (default: 8)
- `PRICE_MATCH_MIN_PERCENT` — minimum percent savings to surface (default: 0.08)
- `PRICE_MATCH_CONFIDENCE` — minimum Haiku confidence to accept (default: 0.85)
- `SERPER_PRICE_INTEL_MAX_OFFERS` — maximum filtered offers sent to Haiku per product (default: 8)

---

## Env Vars to Add
```
SERPER_PRICE_INTEL_ENABLED # Required to enable automatic background checks; default false
SERPER_API_KEY           # Required to enable this feature. If missing, entire flow is skipped.
PRICE_CHECK_THRESHOLD    # Optional, default 100
PRICE_MATCH_MIN_SAVINGS  # Optional, default 8
PRICE_MATCH_MIN_PERCENT  # Optional, default 0.08
PRICE_MATCH_CONFIDENCE   # Optional, default 0.85
SERPER_PRICE_INTEL_MAX_OFFERS # Optional, default 8
```

Add these Serper price-intelligence env vars to `.env.example` with comments/defaults.

## Existing Code to Reference
- `backend/lib/price-comparison/serpapi-client.js` — follow this pattern for the Serper client
- `backend/lib/price-comparison/match-offers.js` — existing deterministic matcher (keep for reference, the Haiku judgment replaces its role)
- `backend/lib/ai-selector.js` — see `haikuLockWinnersAndBadges` for how Haiku is called with Anthropic SDK
- `backend/lib/handlers/enrichment-handler.js` — where enrichment runs and SSE streams
- `backend/lib/handlers/finalize-handler.js` — where to start Serper calls early
- `backend/lib/enrichment-bus.js` — event emitter for SSE streaming
- `backend/lib/price-comparison/comparison-cache.js` — existing cache patterns

## What NOT to Do
- Do not modify the existing enrichment prompt or schema
- Do not change the finalize shortlist selection logic
- Do not make the price comparison blocking — it must be fully async and failure-tolerant
- Do not show loading spinners or skeleton states for price comparison — it either appears or doesn't
- Do not remove the existing SerpApi or BlueCart clients — they serve a different flow
- Do not add price comparison to the `/api/search/live` route
- Do not add emoji to the UI unless the design explicitly calls for it
