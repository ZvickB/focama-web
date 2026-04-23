# Bug Audit — Post-Rainforest Migration

Audited after Steps 1–6 complete. These are unfixed bugs as of the audit date.

---

## BUG 1 — Enrichment token validation rejects Rainforest tokens

**File:** `backend/server.js`, line ~1737  
**Severity:** High  

`handleEnrichmentPoll` validates the incoming token against `buildCacheKey(normalizedQuery, '', CACHE_SCOPE_DISCOVERY)`. Rainforest discovery tokens are scoped to `rainforest_discovery:...`, so the check always fails with a 400. Enrichment polling starts immediately after finalize in `useGuidedSearch.js` (line 475) and passes `variables.discoveryToken` directly — which is the Rainforest token. Every poll returns 400 silently and the user never gets fit reason enrichment.

Same pattern as the token validation bug already fixed in `sanitizeFinalizeDiscoveryContext` — needs the same two-scope fix here.

---

## BUG 2 — `runMiniEnrichmentAsync` has no scope awareness

**File:** `backend/server.js`, lines ~1685 and ~1709  
**Severity:** High  

`runMiniEnrichmentAsync` is called from the finalize handler (line ~2039) with `normalizedQuery` but no `discoveryScope`. Both the cache read (line 1685) and cache write (line 1709) are hardcoded to `CACHE_SCOPE_DISCOVERY`. For a Rainforest search:

- The read at line 1685 looks up `guided_discovery:query` — misses (Rainforest data was written under `rainforest_discovery:query`) — `cachedEntry` is null — function returns early, enrichment is dropped silently
- Even if a stale SerpAPI entry happened to exist for the same query, enrichment would be computed on the wrong candidate pool and written back to the wrong scope

Fix requires passing `discoveryScope` through from the finalize handler and using it for both cache operations.

---

## BUG 1 + 2 together

These two bugs cascade: even if Bug 1 were fixed (enrichment poll accepts the token), the enrichment data would never be in cache because Bug 2 silently drops it. Both need to be fixed together or enrichment remains broken for Rainforest.

---

## Notes on things that look like bugs but aren't

**`source: ''` in `normalizeRainforestItem`** — intentional. This was the Step 5 fix for the diversity cap. Setting `source` to empty makes `sourceKey` falsy, bypassing the per-source 2-result cap that was limiting the pool to 2 Amazon items. `store: 'Amazon'` still surfaces correctly in the UI subtitle via `normalizeResult`.

**`multiple_sources: false`** — documented limitation, not a bug. Flagged in Step 1 analysis as expected for Amazon data. Scoring impact is minor.
