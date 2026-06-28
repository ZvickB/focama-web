# Price Comparison Feature - Build Roadmap

A phased plan for testing a free, sign-in-gated price-comparison feature in Focamai.

**Current phase status:** Phases 0-2 are implemented on `experiment/serp-price-intel`. Phase 2 adds provider clients and a pure matcher/orchestrator only; no comparison endpoint, cache, settings, or offer UI exists yet.

The initial market is Canada. Product discovery remains Amazon-first. SerpApi Google Shopping is used only for lazy comparison checks when a product modal opens; it does not replace the guided discovery flow.

Walmart Canada is the preferred monetization target when affiliate support becomes available through Rakuten Advertising, but user savings and match quality take priority over commission. Price-drop alerts are a separate future feature and are not part of this roadmap.

Each phase should pass its acceptance criteria before the next phase starts. Testing behavior and production policy must remain clearly separated.

---

## Confirmed product decisions

### Where comparison runs

- Every finalized product receives async title/identity normalization alongside the existing recommendation write-up.
- Normalization must not block the finalize response or delay delivery of the write-up.
- The actual provider comparison runs only when a product modal opens.
- On an uncached check, SerpApi searches broadly across Canadian retailers while BlueCart searches Walmart Canada directly. Their normalized candidates are combined only after independent filtering and matching.
- During testing, every eligible Canadian product modal may trigger a comparison check.
- Before a real-user release, replace this broad testing rule with explicit eligibility criteria based on factors such as price, category, identifier confidence, cached availability, and expected usefulness.

### Product titles and identity

- Preserve the original retailer title as `sourceTitle`.
- Generate a cleaner `displayTitle` asynchronously and use it on cards and in the modal once available.
- The visible title may update after initial results render; card dimensions must remain stable.
- Generate a separate structured `matchIdentifier` for price comparison.
- A generated title must never overwrite or destroy the original source data.
- Provider-supplied identifiers are authoritative. Deterministic extraction may supplement them. AI may normalize text and infer search-ready attributes, but must not invent UPC, EAN, GTIN, or other authoritative identifiers.

### Market and currency

- Initial comparison testing is Canada-only.
- Compare Amazon Canada with Canadian retailer offers in CAD.
- Do not compare cross-border US prices.
- Hide the feature outside Canada during testing.
- US support remains disabled until retailer, currency, shipping, and affiliate behavior are validated separately.

### Access and disclosure

- Signed-out modal opens may trigger a cached and rate-limited comparison check.
- If qualifying offers are found, signed-out users see only `Cheaper offers found` and a sign-in action.
- Signed-out users must not see retailer names, prices, or potential savings.
- Clicking the action while signed out opens the existing sign-in flow.
- Signed-in users see qualifying offers automatically when the check completes.
- If no qualifying offer exists, the modal stays quiet for everyone.
- The feature is free during testing.

### Seller coverage preference

- Users choose globally between `Major retailers only` and `All sellers`.
- The default is `Major retailers only`.
- The preference is changed in Settings and follows signed-in users across devices through account settings.
- Comparison UI should tell users that seller coverage can be changed in Settings.
- Initial major Canadian retailers:
  - Walmart
  - Best Buy
  - Canadian Tire
  - Costco
  - Home Depot
  - Staples
- The Bay is excluded.
- `Major retailers only` excludes third-party marketplace sellers hosted on retailer sites.
- `All sellers` may include marketplaces and third-party sellers, subject to the same match and condition rules.
- Used and refurbished offers are excluded in both modes.
- Costco offers may appear with `Membership may be required.`

### Refurbished products

- Refurbished products should be silently excluded from normal Amazon discovery by default.
- Refurbished comparison offers are also excluded.
- A future explicit user preference may opt into refurbished products, but it is not part of this roadmap.

### Savings and offer selection

- Surface an offer only when savings are at least $3 CAD and at least 5% versus the comparable known Amazon total.
- Use item price plus known shipping for both Amazon and comparison offers.
- When comparison-offer shipping is unknown, the offer may still appear and must say `Shipping not included`.
- When Amazon shipping is unknown, compare known amounts and clearly state that Amazon shipping is excluded.
- Show no more than two offers during testing.
- Show the lowest trustworthy total-price exact match.
- Also include Walmart whenever Walmart is cheaper than Amazon, even if another retailer is cheaper.
- Make Walmart the primary offer when its known total is at least 10% cheaper than Amazon, even if another qualifying retailer is cheaper.
- Walmart Canada receives this preference even before affiliate approval exists.
- Revisit the two-offer policy, free-shipping alternatives, and Walmart preference before production launch.

### Trust and presentation

- Only high-confidence product matches appear in the user interface.
- Rejected and uncertain matches may remain available in internal diagnostics.
- Return `null` rather than knowingly showing a conflicting variant.
- Offer links open in a new tab.
- Track comparison clicks with retailer, savings percentage, coverage mode, and authentication state, but do not include user identity in the analytics event.

### Cache policy

- Cache verified product-to-offer matches for 7 days.
- Cache current offer prices for 30 minutes.
- Repeated modal opens use cached data and do not automatically spend another SerpApi or BlueCart request.
- BlueCart's 100-credit monthly free allowance is the tighter development quota. Walmart searches must use the same cache discipline as broad comparison searches.
- A local-only manual refresh mechanism may be added for deliberate QA.

---

## Phase 0 - Verification spike

**Goal:** Verify data availability, Canadian Google Shopping coverage, seller metadata, and matching assumptions before product code is built.

**Tasks:**

1. Select about 20 varied Amazon Canada products across electronics, kitchenware, apparel, tools, and household goods. Include variants, multipacks, and products with messy titles.
2. Pull the available Rainforest and Oxylabs product detail for each item. Record which provider fields contain brand, model number, UPC, EAN, GTIN, size, capacity, pack count, color, condition, seller, and shipping.
3. Run SerpApi Google Shopping queries in the Canadian market for the same products. Record:
   - total usable offers
   - major-retailer offers
   - Walmart Canada offers
   - direct-retailer versus marketplace seller identification
   - currency and shipping availability
   - whether the exact variant can be determined
4. Verify seller information needed for `Major retailers only`. Phase 0 found that SerpApi alone is insufficient for Walmart, while BlueCart exposes Walmart marketplace status and seller identity.
5. Confirm the SerpApi plan supports Google Shopping at the expected test volume.
6. Investigate Walmart Canada affiliate options in parallel. The Phase 0 spike confirmed that the official program uses Rakuten Advertising rather than Impact. Do not make feature viability depend on approval.

**Deliverable:** `project-notes/untracked/price-comparison-spike.md` with findings, examples of correct and incorrect matches, estimated request cost, and a recommendation to proceed or stop.

**Acceptance:**

- Zvi reviews the findings before implementation begins.
- The spike demonstrates that plausible exact-product matching is technically possible for at least some useful categories.
- No product code is modified in this phase.

---

## Phase 1 - Async display title and comparison identity

**Goal:** Generate a clean visible title and a matching-ready identity during the existing async enrichment work without delaying finalize or the recommendation write-up.

**Likely files:**

- `backend/lib/ai-selector.js`
- `backend/lib/handlers/enrichment-handler.js`
- layered enrichment contracts and tests
- frontend enrichment merge logic

Locate exact ownership before editing; do not assume filenames are the full implementation boundary.

**Output shape:**

```js
{
  candidate_id: string,
  fit_reason: string,
  caveat: string,
  source_title: string,
  display_title: string,
  match_identifier: {
    brand: string | null,
    model_number: string | null,
    upc: string | null,
    ean: string | null,
    gtin: string | null,
    product_type: string,
    attributes: {
      generation: string | null,
      size: string | null,
      capacity: string | null,
      color: string | null,
      material: string | null,
      pack_count: number | null,
      condition: string | null
    },
    comparison_search_query: string
  }
}
```

Identifier fields should also carry provenance internally where practical, for example `provider`, `deterministic`, or `ai_normalized`. AI-normalized identifier values must never be treated as authoritative product codes.

**Tasks:**

1. Extend mini enrichment so recommendation copy and normalization are produced in one async request where reliable.
2. Preserve `sourceTitle` from the provider candidate.
3. Generate a concise `displayTitle` that retains identity-critical details such as brand, model, generation, capacity, size, pack count, and condition.
4. Generate `matchIdentifier` separately from `displayTitle`.
5. Prefer provider identifiers, then deterministic extraction, then AI-normalized descriptive fields.
6. Validate the generated output. Fall back to `sourceTitle` if `displayTitle` is empty, materially changes product identity, or removes required variant information.
7. Store normalization in the existing token-scoped async enrichment snapshot.
8. Merge `displayTitle` into visible cards and modals when enrichment arrives without causing layout shift.
9. Do not run SerpApi in this phase.

**Tests:**

- Valid output shape and null defaults.
- Source title is always preserved.
- Provider identifiers cannot be overwritten by AI output.
- Identity-critical model, size, capacity, and pack-count details survive display-title cleanup.
- Invalid normalization falls back to the source title.
- Existing `fit_reason`, `caveat`, feature bullets, order preservation, SSE, and polling behavior do not regress.

**Acceptance:**

- Finalize still responds without waiting for enrichment.
- Recommendation write-up is not delayed by separate normalization work.
- Visible titles update cleanly after enrichment.
- Stored products contain source title, display title, and comparison identity.

**Implementation result (June 15, 2026):**

- Recommendation copy and normalization share the existing async mini-enrichment request and token-scoped write.
- Rainforest/Oxylabs detail normalization carries provider identity into enrichment; late Oxylabs retries can patch newly available provider identity without rerunning finalize.
- Authoritative code fields are excluded from the AI schema and merged only from provider or labeled deterministic extraction.
- Result rows/cards reserve two title lines before enrichment, then cards and the modal prefer validated `displayTitle` while retaining `sourceTitle`.
- Focused backend, storage/SSE, merge, and modal tests pass. No comparison provider or user-facing offer work was added.
- Implementation finding: the current Supabase product-detail cache schema does not persist provider identity fields. Fresh detail responses and local cache entries carry them, while Supabase cache hits safely fall back to title-backed normalization. Revisit the schema before Phase 2 if cached authoritative identifiers are required.

---

## Phase 2 - Comparison provider clients and pure offer matcher

**Goal:** Build a testable comparison pipeline that separates network access from deterministic matching and offer selection.

**Files to add:**

- `backend/lib/price-comparison/serpapi-client.js`
- `backend/lib/price-comparison/bluecart-client.js`
- `backend/lib/price-comparison/match-offers.js`
- `backend/lib/price-comparison/compare-product.js`
- focused tests alongside these modules

Use fewer files if the code remains cohesive; responsibility matters more than file count.

**Responsibilities:**

```js
searchShoppingOffers(query, market, deps) // SerpApi network call
searchWalmartOffers(query, market, deps)  // BlueCart Walmart-specific call
rankComparisonOffers(input)               // pure matching and filtering
compareProduct(input, deps)                // orchestration
```

**Required comparison input:**

- source title and display title
- structured match identifier with provenance
- Amazon marketplace and currency
- Amazon item price and known shipping
- Amazon ASIN/link
- condition and variant attributes
- seller-coverage mode

**Matching rules:**

1. Build queries in tiers:
   - verified GTIN/UPC/EAN when available
   - brand plus model number
   - validated comparison search query
2. Reject missing-price, wrong-currency, used, and refurbished offers.
3. Enforce hard compatibility for model/generation, size/capacity, pack count, and other identity-defining variants.
4. Treat color as required only when it materially defines the product or user choice.
5. Reject implausible price outliers, but do not use price similarity as proof of identity.
6. Score title similarity, brand/model agreement, attribute agreement, seller quality, and identifier agreement.
7. Enforce seller coverage mode and retailer-direct rules.
8. For Walmart, use BlueCart's marketplace and seller metadata rather than trusting the SerpApi `Walmart.ca` source label.
9. Remove or ignore SerpApi Walmart candidates when a BlueCart search has supplied Walmart candidates, avoiding duplicate and less-authoritative Walmart offers.
10. Treat BlueCart's `condition=new` parameter as a hint only. Independently reject refurbished/open-box title signals, nonpositive prices, and known variant conflicts.
11. Do not call BlueCart product detail by default. Search already supplies seller identity, marketplace status, direct URL, price, stock, and fulfillment booleans. Fetch product detail only when a promising matched Walmart candidate lacks information required for confirmation.
12. Return accepted offers plus rejected-offer diagnostics for internal review.

**Offer shape:**

```js
{
  retailer: string,
  seller: string | null,
  sold_by_retailer: boolean | null,
  price: number,
  shipping: number | null,
  known_total: number,
  currency: 'CAD',
  url: string,
  title: string,
  confidence: number,
  checked_at: string,
  notices: string[]
}
```

**Selection rules:** Apply the confirmed savings, Walmart, shipping, and maximum-two-offer rules from the product decisions above.

**Feature flag:** `PRICE_COMPARISON_ENABLED=false` by default. Check it at the request/orchestration boundary before any SerpApi or BlueCart call; the pure matcher must not read environment state.

**Tests:**

- exact model match
- identifier match
- wrong generation, size, capacity, color where material, and pack count
- ambiguous title below threshold
- used/refurbished rejection
- CAD/cross-border rejection
- retailer-direct and third-party seller handling
- SerpApi Walmart candidates are superseded by BlueCart Walmart candidates
- BlueCart zero-price and mislabeled-condition rejection
- BlueCart product detail is skipped when search data is sufficient
- known and unknown shipping
- $3-and-5% savings threshold
- Walmart primary and secondary selection rules
- maximum two offers
- disabled feature short-circuits before network access

**Acceptance:**

- Uncertain products return no visible offer.
- The matching rules pass the defined automated conflict and compatibility tests.

**Implementation result (June 15, 2026):**

- Added isolated SerpApi Shopping/Immersive and BlueCart Walmart Canada clients with normalized candidate shapes.
- Added a pure matcher for authoritative identifier agreement, model/variant conflicts, condition/currency/price validation, seller coverage, savings thresholds, Walmart authority/preference, and maximum-two selection.
- The orchestrator checks `PRICE_COMPARISON_ENABLED` before network access, restricts execution to CA/CAD, uses the strongest available query tier, calls SerpApi and BlueCart independently, and expands at most one promising SerpApi candidate through Immersive Product.
- BlueCart search metadata remains authoritative for Walmart seller/marketplace classification; no BlueCart product-detail call is made when search data is sufficient.
- Focused tests and a saved Phase 0 fixture run pass. The fixture selected Walmart-direct AirPods 4 while rejecting open-box/refurbished, marketplace, missing-variant, and superseded SerpApi Walmart rows.
- The existing Supabase product-detail cache still does not persist provider identity fields. Phase 2 consumes the token-scoped identity when supplied and does not change storage; Phase 3 must address this before cached authoritative identifiers are required by the modal endpoint.

---

## Phase 3 - Comparison cache and modal endpoint

**Goal:** Run cached comparison lazily when a Canadian product modal opens, without adding latency to discovery or finalize.

**Recommended endpoint:**

```text
POST /api/product/price-check
```

Use POST because the request includes structured product identity and user coverage preferences. The server must validate the product against the token-scoped finalized search snapshot rather than trusting arbitrary client product data.

**Tasks:**

1. Add a server endpoint that accepts the discovery token, candidate ID, marketplace, and coverage mode.
2. Resolve the finalized candidate and normalized identity server-side.
3. Restrict testing to Amazon Canada/CAD.
4. Apply server-side rate limits to signed-in and signed-out requests.
5. Check caches before calling SerpApi or BlueCart.
6. Store accepted offers and rejected-match diagnostics separately from recommendation enrichment, while allowing the existing async delivery mechanism to be reused if that remains the cleanest frontend path.
7. Do not attach comparison work to the blocking finalize response.

**Cache model:**

- Match cache key should include marketplace, ASIN/candidate identity, normalized variant identity, seller-coverage mode, and matching-strategy version.
- Match TTL: 7 days.
- Price cache should use a stable offer identity when available, not a raw tracking URL alone.
- Price TTL: 30 minutes.
- Local development fallback should follow existing storage conventions without turning local files into production architecture.

**Privacy-aware response:**

- Signed out with qualifying offers: return only `{ cheaperOffersFound: true }`.
- Signed out without qualifying offers: return the normal empty state without retailer or price details.
- Signed in: return up to two accepted offers.
- Authentication and offer redaction must be enforced server-side.

**Tests:**

- match and price cache hit/miss paths
- stale price with valid match cache
- signed-out response redaction
- signed-in full response
- Canada-only enforcement
- rate limiting
- invalid/stale token or candidate rejection
- disabled flag avoids SerpApi and BlueCart
- repeated modal open uses cache

**Acceptance:**

- Modal open initiates the check without affecting finalize latency.
- Signed-out users cannot retrieve hidden price details from the API response.
- Repeated modal opens do not spend unnecessary SerpApi or BlueCart requests.

**Implementation result (June 15, 2026):**

- Added disabled-by-default `POST /api/product/price-check`; it requires query/token/candidate context, validates the candidate against the finalized token-scoped snapshot, and rejects non-`amazon.ca` requests.
- Finalize now persists selected candidate IDs before returning so an immediate later price-check request can be validated without trusting client product identity.
- Added a stable identity/coverage/strategy cache key, stable provider-offer keys, 7-day match TTL, 30-minute price TTL, Supabase storage, and local JSON fallback.
- Added optional Supabase bearer-token verification. Signed-out responses expose only `cheaperOffersFound`; signed-in responses can expose at most two selected offers.
- Added endpoint-specific anonymous and signed-in rate limits through the existing shared Supabase limiter with memory fallback.
- Added `provider_identity` persistence for shared product-detail cache rows and the server-only `price_comparison_cache` schema in `project-notes/price-comparison-phase3-schema.sql`.
- Added focused cache, storage, auth, handler, route, redaction, Canada-only, stale-token, disabled-flag, rate-limit, and repeated-open tests. Phase 4 settings and offer UI were not started, so the current modal does not call this endpoint yet.

---

## Phase 4 - Settings and modal UI

**Goal:** Add a quiet comparison experience consistent with Focamai's focused decision-aid UI.

**Tasks:**

1. Add the global seller-coverage preference to Settings.
2. Default new users to `Major retailers only`.
3. Persist signed-in preference to account settings so it follows the user across devices.
4. While no qualifying result is available, leave the modal unchanged.
5. Signed-out behavior:
   - show `Cheaper offers found` only after the backend confirms a qualifying offer
   - show no price, savings, or retailer information
   - sign-in action opens the existing auth modal
6. Signed-in behavior:
   - automatically reveal up to two qualifying offers
   - identify item price, known shipping, known total, and required notices
   - mention that seller coverage can be changed in Settings
7. Open retailer links in a new tab with appropriate security attributes.
8. Keep comparison visual treatment quiet: no loud savings badges or marketplace-style offer wall.
9. Add Walmart affiliate wrapping only when a valid Canadian affiliate path exists. Never delay or suppress a better user outcome because a link is not monetized.

**Tests:**

- signed-out teaser contains no protected details
- sign-in action opens auth flow
- signed-in offers appear automatically
- no-offer state stays silent
- maximum two offers
- shipping and Costco notices
- coverage setting persistence and account sync
- stable layout while comparison loads

**Acceptance:**

- The modal remains focused on the selected product.
- Hidden offer data cannot be inferred from frontend state before sign-in.
- Settings clearly control seller coverage.

---

## Phase 5 - Internal instrumentation and limited testing

**Goal:** Observe system behavior and cost during limited testing without defining a manual match-review process yet.

**Tasks:**

1. Log each comparison attempt with:
   - marketplace and query tier
   - identifier provenance
   - accepted/rejected status and reasons
   - confidence
   - retailer and seller type
   - cache outcome
   - request duration, provider, and estimated SerpApi/BlueCart usage
2. Keep the feature server-flagged and Canada-only.
3. Track comparison clicks with retailer, savings percentage, coverage mode, and auth state, without user identity.
4. Use observed usage and cost to help define production eligibility criteria instead of running every modal check indefinitely.

**Acceptance:**

- Costs per engaged user are understood.
- Zvi explicitly approves broader user availability.

---

## Phase 6 - Production policy and monetization decision

Do not begin this phase automatically. It requires a product decision informed by QA data.

Decide whether comparison should remain free, use a limited free allowance, become part of a paid plan, or be affiliate-funded. Only then design billing or usage limits. Stripe is intentionally not included in the initial implementation roadmap.

Before production launch, finalize:

- eligibility rules for triggering comparison
- supported categories and markets
- Walmart preference and maximum-two-offer policy
- affiliate disclosure and Canadian affiliate handling
- abuse limits for anonymous checks
- seller coverage wording
- whether free-shipping alternatives deserve special treatment
- monitoring and support process

---

## Explicitly deferred

- Price-drop alerts, scheduled price checks, and notifications
- US and cross-border comparison
- Refurbished/used opt-in setting
- Direct retailer integrations unless SerpApi quality is inadequate
- Price-history charts
- More than two visible comparison offers
- Automated admin override UI
- Paid subscriptions and Stripe integration
- Full automated monitoring dashboards
- A manual accepted/rejected match-review process
- A numeric match-quality or precision target for broader release

---

## Future price-drop alert roadmap

Price alerts should be planned separately after comparison identity and price-check quality are proven. They will require:

- explicit product/variant tracking records
- target-price or percentage-drop rules
- scheduled background checks
- notification consent and delivery preferences
- email unsubscribe and failure handling
- price observation history
- retailer-link refresh and stale-product handling
- cost controls and per-user limits

Do not treat the comparison cache as a complete alert/history system.

---

## Environment variables

Initial testing:

```text
PRICE_COMPARISON_ENABLED=false
PRICE_COMPARISON_MARKET=CA
SERPAPI_API_KEY=existing-value
BLUECART_API_KEY=existing-value
```

Add affiliate variables only after confirming the Rakuten deep-link mechanism available to the approved Walmart Canada publisher account. Do not pre-design variable names around the US Impact workflow.

---

## Project notes to update when implementation begins

- `project-notes/app_flow.md` when modal comparison becomes implemented behavior
- `project-notes/current-status.md` after each meaningful implementation phase
- `project-notes/session-handoff.md` when a fresh chat would otherwise miss active comparison work
- `project-notes/db-needs.md` when account settings or comparison cache tables are added
- `project-notes/assistant-start.md` only when the active app reality changes

Do not update active behavior notes merely because this roadmap exists; planned and implemented behavior must remain distinct.

---

## Revised estimate

- Verification spike: about half a day to one day
- Async normalization: 1-2 focused days
- Comparison client, matcher, and tests: 2-4 focused days
- Cache, endpoint, auth redaction, and rate limits: 2-4 focused days
- Settings and modal UI: 2-3 focused days
- Instrumentation and limited integration testing: several focused days

Expect roughly 2-3 focused weeks for a credible internal Canadian test, depending on provider data quality. Production timing should be estimated only after deferred match-quality criteria, anonymous request cost, and Canadian affiliate options are decided or understood.
