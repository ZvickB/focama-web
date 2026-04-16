# Step 1 Analysis — SerpAPI Flow + Dual Endpoint Plan

## Files Involved in the Current SerpAPI Route

| File | Role |
|---|---|
| `backend/server.js` | Route handlers: `handleDiscoverySearch`, `handleLiveSearch`. Both call `fetchSearchArtifacts` and pass `serpApiKey`. |
| `backend/lib/search-pipeline.js` | `fetchSearchArtifacts` — the only function that actually calls SerpAPI. Builds the URL, fires the fetch, passes the raw payload to the filter layer. |
| `backend/lib/result-filter.js` | `getFilteredSearchArtifacts` — transforms raw SerpAPI payload into `candidatePool` + `results`. SerpAPI-shaped input is assumed here. |
| `backend/lib/search-data.js` | `SERPAPI_ENDPOINT` constant, `normalizeResult` (maps SerpAPI item fields to internal shape), `buildQuery`, `buildCacheKey`. |
| `api/search/discover.js` | Vercel serverless wrapper — thin pass-through to `handleDiscoverySearch`. |
| `api/search/live.js` | Vercel serverless wrapper — thin pass-through to `handleLiveSearch`. |

The other routes (`refine`, `prewarm`, `finalize`, `enrichment`) are **provider-agnostic** — they work off the cached `candidatePool` and never touch SerpAPI.

---

## Current Search / Data Flow (Discovery path)

```
Frontend → GET /api/search/discover?query=...
  → handleDiscoverySearch (server.js)
      1. Check cache (readCachedSearchSnapshot)
         → Cache hit: return cached candidatePool + previewResults
      2. Cache miss: call fetchSearchArtifacts (search-pipeline.js)
           → build SerpAPI URL (google_shopping engine, gl=us, hl=en)
           → fetch raw JSON payload from serpapi.com
           → pass payload to getFilteredSearchArtifacts (result-filter.js)
               → reads payload.shopping_results[]
               → scores, dedupes, diversifies → candidatePool (up to 20) + results (6)
      3. Write candidatePool + results to cache (writeSearchSnapshot)
      4. Return: { discoveryToken, candidatePool, previewResults, prewarm, ... }
```

After discovery, `prewarm → refine → finalize` all reconstruct from cache — zero provider dependency.

---

## What Is SerpAPI-Specific vs. Shared

**SerpAPI-specific (needs to change or be paralleled):**
- `SERPAPI_ENDPOINT` in `search-data.js`
- `fetchSearchArtifacts` in `search-pipeline.js` — hardcoded to SerpAPI URL + params
- `normalizeResult` in `search-data.js` — maps SerpAPI item fields (`thumbnail`, `product_link`, `extracted_price`, `reviews`, `extensions`, `multiple_sources`, `delivery`, `tag`, `snippet`, `source`)
- `result-filter.js` — `getFilteredSearchArtifacts` reads `payload.shopping_results`, `payload.search_information.shopping_results_state`, `payload.related_searches`, `payload.filters`

**Shared / provider-agnostic (do not touch):**
- `buildCacheKey`, `buildQuery`, `validateSearchInput` — pure string utils
- All scoring, dedup, diversify logic in `result-filter.js` (operates on the internal candidate shape, not the raw payload)
- `buildAiCandidate` — works off already-normalized items
- All of `prewarm`, `refine`, `finalize`, `enrichment` — never see raw provider data

---

## Rainforest API — What Codex Needs to Know

Rainforest API returns Amazon product results. The key differences from SerpAPI:

| | SerpAPI (Google Shopping) | Rainforest (Amazon) |
|---|---|---|
| Endpoint | `https://serpapi.com/search.json` | `https://api.rainforestapi.com/request` |
| Auth | `api_key` query param | `api_key` query param |
| Query param | `q` + `engine=google_shopping` | `q` + `type=search` (or `type=bestsellers`) |
| Results array | `payload.shopping_results` | `payload.search_results` (each item is `result`) |
| Price field | `item.extracted_price` (number) | `item.price.value` (number) |
| Rating field | `item.rating` | `item.rating` |
| Review count | `item.reviews` | `item.ratings_total` |
| Image | `item.thumbnail` | `item.image` |
| Product link | `item.product_link` | `item.link` (Amazon URL) |
| Source/store | `item.source` | always "Amazon" |
| Title | `item.title` | `item.title` |
| Description | `item.snippet` + `item.extensions[]` | `item.description` (often absent) |
| Dedup ID | `item.product_id` | `item.asin` |
| Delivery/Prime | `item.delivery` (string) | `item.is_prime` (boolean) |
| Multiple sources | `item.multiple_sources` (bool) | not applicable (Amazon-only) |
| Search state | `payload.search_information.shopping_results_state` | not applicable |
| Related searches | `payload.related_searches` | `payload.related_searches` (may exist) |

---

## Proposed Structure for Dual Endpoints

**Minimal approach — add a parallel fetch function, reuse everything else.**

### New files Codex should create:

**`backend/lib/rainforest-pipeline.js`**
- `RAINFOREST_ENDPOINT` constant
- `fetchRainforestArtifacts({ filterConfig, productQuery, details, reasonFallback, rainforestApiKey })`
  - Calls Rainforest API
  - Normalizes the raw Rainforest payload into the same internal shape that `getFilteredSearchArtifacts` already expects (i.e., map Rainforest fields → SerpAPI-equivalent fields before passing in, OR write a separate `getRainforestFilteredArtifacts` that mirrors the filter logic with Rainforest field names)
  - Returns the same `{ artifacts, error }` shape as `fetchSearchArtifacts`

> **Recommended:** Write a `normalizeRainforestItem` function that maps Rainforest item fields to the same internal candidate shape that `buildAiCandidate` already consumes — rather than reimplementing the whole filter/score pipeline.

### Changes to `server.js`:

**`handleDiscoverySearch`** — add a Rainforest variant handler:
- `handleRainforestDiscoverySearch` (new function, same structure as `handleDiscoverySearch`)
- Uses `RAINFOREST_API_KEY` env var instead of `SERPAPI_API_KEY`
- Calls `fetchRainforestArtifacts` instead of `fetchSearchArtifacts`
- Everything else (cache logic, response shape, prewarm, candidatePool) is identical

### New Vercel wrapper:

**`api/search/rainforest-discover.js`** (or `api/search/discover-rainforest.js`)
- Thin pass-through to `handleRainforestDiscoverySearch`

### SerpAPI stays untouched:
- `handleDiscoverySearch`, `handleLiveSearch`, `fetchSearchArtifacts` — no changes
- `api/search/discover.js`, `api/search/live.js` — no changes

---

## Risks and Dependencies

1. **Rainforest response shape** — the field mapping above is based on Rainforest docs. Codex should log a raw Rainforest response during development and verify field names match before building the normalizer.

2. **Missing description data** — Rainforest items often have no `description` field for search results (it's only populated on product detail pages). The normalizer will need a fallback — title-only descriptions, or `item.description || item.brand || ''`.

3. **`multiple_sources` signal doesn't exist on Amazon** — scoring in `result-filter.js` uses this as a trust signal. For Rainforest candidates, `multiple_sources` should be hardcoded to `false`. The `hasMultipleSources` trust signal becomes meaningless but won't break anything.

4. **`search_information.shopping_results_state`** — used in scoring for an `exact` match bonus. Rainforest has no equivalent. Should default to `''` (no bonus, no penalty).

5. **`product_id` dedup** — SerpAPI deduplicates by `item.product_id`. Rainforest uses `item.asin` which is the Amazon product identifier and is reliable for dedup.

6. **Prime delivery** — `item.is_prime` (boolean) can be mapped to a delivery string like `'Prime delivery'` to preserve the `delivery` field behavior in scoring (+0.5 score bonus).

7. **Rate limit / env var** — `RAINFOREST_API_KEY` needs to be added to `.env`. The existing `getEnv` utility works as-is.

8. **No `handleLiveSearch` equivalent needed for Rainforest** — the live search route is a legacy/debug route. Only `discover` needs a Rainforest equivalent for the main flow.

---

## Recommended Implementation Sequence for Codex

1. **Create `backend/lib/rainforest-pipeline.js`**
   - Define `RAINFOREST_ENDPOINT = 'https://api.rainforestapi.com/request'`
   - Write `normalizeRainforestItem(item, index)` — maps Rainforest fields to the same shape that `buildAiCandidate` in `result-filter.js` consumes (title, extracted_price, rating, reviews, thumbnail, product_link, snippet, extensions, source, multiple_sources, delivery, tag, product_id)
   - Write `fetchRainforestArtifacts({ filterConfig, productQuery, details, reasonFallback, rainforestApiKey })`:
     - Build Rainforest URL: `api_key`, `type=search`, `q`
     - Fetch and check `apiResponse.ok`
     - Map `payload.search_results` → normalized items using `normalizeRainforestItem`
     - Pass the normalized items as `{ shopping_results: normalizedItems }` into the existing `getFilteredSearchArtifacts` (reuse the filter/score/dedup pipeline)
     - Return `{ artifacts, error }` — same shape as `fetchSearchArtifacts`

2. **Add `handleRainforestDiscoverySearch` to `server.js`**
   - Copy `handleDiscoverySearch` structure
   - Replace `serpApiKey` / `SERPAPI_API_KEY` with `rainforestApiKey` / `RAINFOREST_API_KEY`
   - Replace `fetchSearchArtifacts` call with `fetchRainforestArtifacts`
   - Keep all cache, response shape, and logging logic identical

3. **Register the new route in `createApiServer`** in `server.js`
   - `GET /api/search/rainforest-discover` → `handleRainforestDiscoverySearch`

4. **Add `api/search/rainforest-discover.js`** Vercel wrapper
   - Same pattern as `discover.js`

5. **Add `RAINFOREST_API_KEY` to `.env`** (value to be provided separately — do not hardcode)

6. **Do not modify**: `handleDiscoverySearch`, `fetchSearchArtifacts`, `normalizeResult`, `result-filter.js`, any existing Vercel wrappers, `prewarm`/`refine`/`finalize`/`enrichment` routes.
