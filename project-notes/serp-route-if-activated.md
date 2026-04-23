# SerpApi Route — What Needs Work Before Production Use

The SerpApi route (`/api/search/discover` via `handleDiscoverySearch`) exists and is wired, but was deprioritized in favor of Rainforest. This file captures everything that would need to be addressed before it could be used as a real production path.

## What's already done
- Country-aware `gl` param: `getCountryCode` reads `x-vercel-ip-country` from Vercel headers and passes the lowercase 2-letter code as `gl` to SerpApi. Implemented alongside the Rainforest geolocation work (2026-04-17).
- Basic result normalization and filtering through `getFilteredSearchArtifacts` (shared with Rainforest pipeline).
- Rate limiting (shared with Rainforest route).
- Cache (shared Supabase-backed cache with `CACHE_SCOPE_DISCOVERY`).

## What still needs work

### Result shape
- SerpApi returns Google Shopping results — different fields, different product IDs (no ASIN), different price/rating formats than Rainforest/Amazon. Verify the normalized shape actually produces useful results end-to-end before relying on it.
- The `product_link` from SerpApi goes to Google Shopping, not a retailer — check whether downstream UI and enrichment logic handle non-Amazon links gracefully.
- `store` field is not hardcoded to 'Amazon' for SerpApi results — make sure badge logic and UI copy handle multi-retailer results.

### Enrichment
- The async enrichment step (`/api/search/enrichment`) pulls `fit_reason`/`caveat` from the discovery cache. If SerpApi results don't have ASINs, `candidateId` matching may break or produce no-ops. Verify.

### Geolocation
- `gl` (country) is now passed in, but `hl` is hardcoded to `'en'`. For non-English markets this may produce mixed-language results. Consider mapping country → language if SerpApi is used seriously in non-US markets.
- SerpApi also supports `google_domain` (e.g. `google.co.uk`) — not currently set. May affect result relevance in non-US markets.

### API cost and reliability
- SerpApi credits are separate from Rainforest credits. Set up monitoring so you know when credits are running low before hitting limits in production.
- SerpApi has different rate limits and error shapes than Rainforest — verify the error handling in `fetchSearchArtifacts` surfaces useful messages.

### Testing
- Existing test fixtures in `temp-data/` are mostly SerpApi-era samples. Worth confirming that the current normalization pipeline still produces valid results against those fixtures before activating.
- The `save-serpapi-full-response.js` and `save-serpapi-cache.js` scripts exist for capturing real responses — use them to build a test corpus (similar to how Rainforest samples are now auto-saved).

## When to activate
Only switch back to SerpApi as a primary path if:
- Rainforest becomes unavailable or too expensive at scale
- You need multi-retailer results (not just Amazon)
- A specific product category doesn't have good Amazon coverage

Otherwise, keep Rainforest as primary. The SerpApi route is a useful fallback, not a parallel path.
