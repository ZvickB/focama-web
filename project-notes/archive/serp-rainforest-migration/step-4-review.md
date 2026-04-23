# Step 4 Review — Rainforest Implementation

## Overall Assessment

The implementation is structurally correct. Handler shape, response contract, error handling, field mapping, and filter pipeline reuse all match the spec. Two bugs need to be fixed before this route is safe to make default.

---

## Bug 1 (Critical): Source diversity cap kills the candidate pool

**File:** `backend/lib/rainforest-pipeline.js`, line 20  
**Symptom:** Candidate pool is limited to 2 items for every Rainforest query.

**Root cause:**  
`diversifyResults` in `result-filter.js` has a hard cap of 2 results per source key:

```js
if (sourceKey && sourceCount >= 2) {
  continue
}
```

All Rainforest items are normalized with `source: 'Amazon'`. Once 2 Amazon items are selected, every remaining candidate is rejected. The pool ends up with 2 items regardless of how many results Rainforest returns.

**Fix — in `normalizeRainforestItem`, replace:**
```js
source: 'Amazon',
```
**with:**
```js
source: '',
store: 'Amazon',
```

`normalizeResult` in `search-data.js` already reads `item.source?.trim() || item.store?.trim() || 'Marketplace result'` for the display subtitle — so "Amazon" will still appear correctly in the UI. The empty `source` makes `sourceKey` falsy, bypassing the per-source cap entirely.

---

## Bug 2 (Important): Cache scope collision with SerpAPI

**File:** `backend/server.js`, `handleRainforestDiscoverySearch`  
**Symptom:** Rainforest results can be returned from a SerpAPI-cached entry and vice versa.

**Root cause:**  
Both `handleDiscoverySearch` and `handleRainforestDiscoverySearch` use the same constant:
```js
const CACHE_SCOPE_DISCOVERY = 'guided_discovery'
```
A Rainforest search for "running shoes" caches Amazon results under the key `guided_discovery:running shoe`. A subsequent SerpAPI request for the same query would return those Amazon results from cache — and vice versa.

**Fix — two steps:**

1. Add a new constant near the existing one in `server.js` (around line 58):
```js
const CACHE_SCOPE_RAINFOREST = 'rainforest_discovery'
```

2. In `handleRainforestDiscoverySearch`, replace every occurrence of `CACHE_SCOPE_DISCOVERY` with `CACHE_SCOPE_RAINFOREST`. There are 3 occurrences:
   - `buildCacheKey(normalizedQuery, normalizedDetails, CACHE_SCOPE_DISCOVERY)` — line ~893
   - `readCachedSearchSnapshot({ ..., scope: CACHE_SCOPE_DISCOVERY })` — line ~898
   - `writeSearchSnapshot({ ..., scope: CACHE_SCOPE_DISCOVERY })` — line ~978

Do not change any `CACHE_SCOPE_DISCOVERY` references outside of `handleRainforestDiscoverySearch`.

---

## Everything Else — No Changes Needed

- **Field mapping:** `asin → product_id`, `price.value → extracted_price`, `image → thumbnail`, `ratings_total → reviews`, `is_prime → delivery`, `link → product_link` — all correct
- **`multiple_sources: false`** — correctly hardcoded; scoring penalty is minor and expected
- **`search_information: { shopping_results_state: '' }`** — correct; no exact-match bonus, no penalty
- **`related_searches` passthrough** — correct
- **Error response shape** — matches SerpAPI handler
- **`prewarm` response shape** — matches SerpAPI handler on both cache hit and miss
- **Rate limiting** — uses same `LIVE_SEARCH_RATE_LIMIT` as SerpAPI, correct
- **`amazon_domain: 'amazon.com'`** param — correct, scopes results to US Amazon
- **`reasonFallback`** — passed through correctly; `normalizeResult` voids it, no effect
- **Handler signature** — matches `handleDiscoverySearch` exactly, Vercel wrapper is correct
