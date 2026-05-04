# Bug Report — Shortlist Count + Enrichment Delivery (2026-05-03)

## Summary

Two independent bugs compound each other. Both are observable in production. Neither was introduced by a single commit — one is a design gap in the finalize logic, the other was introduced when the SSE enrichment stream was added without the CORS header required for the Render cross-origin setup.

**Symptoms:**
- Searches return fewer than 6 result cards (confirmed: `android phone` returned 4)
- Product modals show no feature bullets, no `fit_reason`, no `caveat`

---

## Bug 1 — Haiku can return a partial shortlist and the code ships it as-is

### What happens

In `backend/server.js`, after Haiku runs:

```js
// server.js ~line 1266
let results = haikuResults.length > 0 ? haikuResults : fallbackResults
```

The fallback (`buildFinalizeFallbackResults`) only activates when Haiku returns **zero** IDs. If Haiku returns 4 IDs, `haikuResults.length > 0` is true — the code accepts those 4 as the final shortlist and ships them. There is no top-up logic to pad back to 6.

### Why this was hidden before

Before the Render migration, the enrichment stream was also failing (see Bug 2), which meant every result looked broken regardless of count. "Weird results" or "fewer results than expected" were attributed to AI unpredictability. Now that the failure mode is more obvious, the count bug is clearly structural.

### Relevant commit

`89fd950` ("Remove Vercel wrappers and dead finalize code") did not introduce this bug, but it removed several compatibility layers that may have previously masked it. The shortlist-count logic has been in its current form since at least `5cece8b` ("Switch finalize lock from OpenAI nano to Anthropic haiku").

### Expected behavior (pass criteria)

- `POST /api/search/finalize` always returns exactly 6 results in `results[]`
- `selection.selectedCandidateIds` always has exactly 6 entries
- If Haiku returns fewer than 6 IDs, the shortlist is topped up from the deterministic fallback pool to reach 6 before the response is sent
- The `strategy` field in the response should reflect the mix: e.g. `haiku_lock_topped_up` if Haiku returned a partial set

---

## Bug 2 — SSE enrichment stream is blocked cross-origin

### What happens

The enrichment stream handler in `backend/server.js` writes these headers:

```js
// server.js ~line 992
response.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
})
```

There is no `Access-Control-Allow-Origin` header. The CORS middleware in `backend/express-server.js` only handles `OPTIONS` preflight requests — it does not inject CORS headers on actual `GET` responses. So when the browser opens an `EventSource` to `https://render-backend.onrender.com/api/search/enrichment-stream`, the response arrives without the CORS header, and the browser blocks it.

### Which commit introduced it

`0bc41a9` ("Improve Render-era backend caching and streaming") is where `handleEnrichmentStream` was added. The SSE headers were written without `Access-Control-Allow-Origin` at that point. At the time of that commit, the Render backend was already the committed production backend — so the CORS requirement was in effect from day one of this handler, but never satisfied.

### Why it was masked before

The `api/search/enrichment.js` Vercel wrapper (deleted in `89fd950`) previously handled the enrichment polling path from the same Vercel origin as the frontend. After the cleanup, only the Render SSE path remains — and it has never worked cross-origin.

### Frontend behavior when SSE fails

In `src/components/home/useGuidedSearch.js`:

```js
source.onerror = () => {
  stopEnrichmentPolling()
}
```

When the SSE request is blocked, `onerror` fires and the frontend stops entirely. It does not attempt any fallback polling. The modal stays empty with no further retries.

### Expected behavior (pass criteria)

- `GET /api/search/enrichment-stream` responds with `Access-Control-Allow-Origin` set to the allowed origin
- A browser `EventSource` from the Vercel frontend to the Render backend connects successfully (visible in DevTools Network — status 200, `text/event-stream`)
- Enrichment data (`fit_reason`, `caveat`, `feature_bullets`) arrives and populates the product modal after finalize
- If the SSE stream does error for any reason, the frontend falls back to polling `/api/search/enrichment` rather than stopping silently

---

## Bug 3 — Enrichment only covers Haiku's raw IDs, not the final displayed list

### What happens

The async enrichment block only fires when `haikuResults.length > 0`, and it passes `haikuResult.lockedIds` to both the product details fetch and `runMiniEnrichmentAsync`:

```js
// server.js ~line 1354-1374
if (haikuResults.length > 0) {
  ...
  fetchOxylabsProductDetailsByAsin({ asins: haikuResult.lockedIds, ... })
  runMiniEnrichmentAsync({ lockedIds: haikuResult.lockedIds, ... })
}
```

If Bug 1 is fixed by topping up a 4-item Haiku result to 6, the two extra topped-up items will still have no Oxylabs bullets and no AI enrichment, because the enrichment step only covers the original Haiku IDs.

### Expected behavior (pass criteria)

- After the shortlist top-up fix (Bug 1), the enrichment step receives the final displayed shortlist IDs — not just the raw Haiku IDs
- All 6 cards in the modal receive `fit_reason`, `caveat`, and `feature_bullets` regardless of whether they came from Haiku or from the fallback top-up

---

## Proposed fix order

1. **Fix Bug 2 first (CORS on SSE stream)** — smallest, highest-confidence fix. Add `Access-Control-Allow-Origin` to the `writeHead` call in `handleEnrichmentStream`. Confirm in browser DevTools that the stream connects and data arrives.

2. **Fix Bug 1 (shortlist top-up)** — after Bug 2 is confirmed working, add top-up logic: if `haikuResults.length < finalResultLimit`, fill from `fallbackResults` until the shortlist reaches 6. Build the final `selectedCandidateIds` from the merged set.

3. **Fix Bug 3 (enrichment follows final list)** — pass the topped-up `selectedCandidateIds` (not `haikuResult.lockedIds`) into the async enrichment and product details fetch. This is a one-line dependency change once Bug 1 is done.

4. **Add SSE fallback in frontend** — if `source.onerror` fires, start polling `/api/search/enrichment` instead of calling `stopEnrichmentPolling()`. This is defensive and should land alongside or after the CORS fix.

---

## Files to touch

| File | Bug |
|---|---|
| `backend/server.js` — `handleEnrichmentStream` `writeHead` block | Bug 2 |
| `backend/server.js` — finalize shortlist assembly (~line 1266) | Bug 1 |
| `backend/server.js` — async enrichment block (~line 1354) | Bug 3 |
| `src/components/home/useGuidedSearch.js` — `source.onerror` handler | Bug 2 (frontend) |

---

## Verification checklist (all four must pass to close this)

- [ ] `POST /api/search/finalize` for any query always returns `results.length === 6`
- [ ] `selection.selectedCandidateIds.length === 6` in the finalize response
- [ ] DevTools Network: `GET /api/search/enrichment-stream` shows status 200, type `text/event-stream`, no CORS error
- [ ] After ~2–5 seconds, product modal populates with `fit_reason`, `caveat`, and feature bullets for all 6 cards
- [ ] If SSE is forcibly blocked (e.g. disable EventSource in test), the frontend falls back to polling and the modal still hydrates

---

## Codex review notes and refinements

These notes tighten the implementation plan after code inspection.

### 1. The Haiku bug is real, but the root cause is broader than "Haiku returned 4"

The code currently accepts any non-empty subset from Haiku:

- if Haiku returns too few picks, the shortlist is short
- if Haiku returns 6 picks but some are invalid, duplicate, or not present in the candidate pool, the parser filters them out and the shortlist is still short

So the real bug is not only prompt non-compliance. It is also that partial valid output is treated as acceptable final output.

### 2. Top-up is the correct recovery and should be treated as first-class behavior

The finalize path should preserve the current behavior in two cases:

- `haikuResults.length === 0` -> use deterministic fallback with `strategy: 'rules_fallback'`
- `haikuResults.length >= finalResultLimit` -> use Haiku shortlist with `strategy: 'haiku_lock'`

And it should add one explicit partial-output recovery case:

- `haikuResults.length > 0 && haikuResults.length < finalResultLimit` -> top up from deterministic fallback, excluding IDs already chosen by Haiku, with `strategy: 'haiku_lock_topped_up'`

### 3. Enrichment and product-detail fetch must follow the final displayed shortlist

If a top-up occurs, async work must use the merged final shortlist IDs, not raw `haikuResult.lockedIds`.

That means both:

- `fetchOxylabsProductDetailsByAsin(...)`
- `runMiniEnrichmentAsync(...)`

should receive the final merged `selectedCandidateIds`.

Otherwise the topped-up cards will still miss product bullets and AI enrichment.

### 4. Use the existing `ALLOWED_ORIGIN` constant for SSE CORS

`backend/server.js` already imports `ALLOWED_ORIGIN` from `backend/lib/http.js`.

So `handleEnrichmentStream` should add:

- `'Access-Control-Allow-Origin': ALLOWED_ORIGIN`
- `Vary: 'Origin'`

to the SSE `writeHead(...)` header object.

Do not introduce a separate `getEnv('ALLOWED_ORIGIN')` lookup in that handler unless there is a specific reason to diverge from the shared HTTP helper behavior.

### 5. The response field is `selection.strategy`, not `selection.selectionStrategy`

Any implementation or test plan should assert:

- `selection.strategy === 'haiku_lock_topped_up'`

not `selection.selectionStrategy`.

### 6. "Always 6" should be interpreted honestly

The product rule is that shortlist responses should be 6 items when there are at least 6 eligible candidates available.

If exclusions or upstream filtering leave fewer than 6 eligible candidates, the code cannot honestly return 6 unique products.

So the invariant to protect in code is:

- return exactly 6 when at least 6 eligible candidates exist
- otherwise return all remaining eligible candidates

### 7. The prompt may contribute, but the contract is the main issue

The Haiku prompt does ask for exactly 6 picks, but:

- it is plain-text JSON prompting, not schema-enforced output
- the prompt payload is fairly dense for a pure ID-selection task
- the parser silently accepts partial valid subsets
- there is no retry or top-up before shipping the shortlist

So partial outputs are primarily a contract/recovery problem, not proof of a single bad prompt instruction.

### 8. Add tests for the real production-shaped failures

At minimum, add these backend tests:

- Haiku returns 4 valid IDs -> finalize returns 6 items -> `selection.strategy === 'haiku_lock_topped_up'`
- Haiku returns 6 picks but some are invalid or duplicate -> valid IDs are topped up to 6
- async details fetch and mini enrichment receive the final merged shortlist IDs, not raw Haiku IDs

### 9. Prefer including the frontend fallback in the same fix pass

Even after the SSE CORS header is fixed, the frontend still stops enrichment completely on any `EventSource` error.

In `src/components/home/useGuidedSearch.js`, `source.onerror` should fall back to polling `/api/search/enrichment` instead of only calling `stopEnrichmentPolling()`.

This is defensive and should be part of the same regression fix if scope allows.

---

## Signed

Reviewed and refined by Codex (GPT-5)
