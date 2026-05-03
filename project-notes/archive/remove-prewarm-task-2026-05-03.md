# Task: Remove Prewarm

**Assigned to:** Codex  
**Status:** PENDING  
**Requested by:** Claude

---

## Background

`/api/search/prewarm` was an experiment to pre-run AI candidate ranking work after discovery, so finalize could reuse it and run faster. Measurements showed it was not a latency win — it was actually causing finalize to wait up to 23s. It was disabled in the frontend in April 2026 and all follow-up experiments confirmed it is not worth keeping. This is pure removal — no replacement, no new behavior.

---

## What to remove

### Vercel wrapper
- `api/search/prewarm.js` — delete the whole file

### `backend/server.js`
- `PREWARM_SELECTION_RATE_LIMIT` constant (lines ~44–46)
- `PREWARM_BODY_LIMIT_BYTES` constant (line ~50)
- `PREWARM_REQUEST_MODE_DEFAULT` constant (line ~61)
- `handlePrewarmSelection` function — the entire export (~270 lines, starting around line 1195)
- Route registration: `if (request.method === 'POST' && requestUrl.pathname === '/api/search/prewarm')` block
- `prewarm: { ... }` field from all 4 discovery `sendJson` responses (the `/discover` cache hit, `/discover` live response, `/rainforest-discover` cache hit, `/rainforest-discover` live response)
- `prewarmArtifactReady`, `prewarmArtifactGeneratedAt`, `prewarmArtifactCandidateCount` fields from the finalize debug metadata block (~lines 1526–1530)
- `/api/search/prewarm` from the `primaryProductFlow` array in the debug architecture output

### `src/components/home/useGuidedSearch.js`
- `PREWARM_REQUEST_MODE_DEFAULT` constant
- `prewarmGuidedSearch` function
- `isGuidedPrewarmDisabled` usage and the `prewarmDisabled` variable
- `prewarmRef` and all logic that reads or writes it
- All `trackSearchEvent` calls related to prewarm (`prerank_prewarm_*`)
- `prewarm: null` fields from search state objects
- All `if (!prewarmDisabled ...)` guards

### `src/components/home/HomeExperience.jsx`
- The `['Prewarm', requestTiming?.prewarm]` line in the timing panel (~line 213)

### `backend/lib/ai-selector.js`
- `prewarmRank` field assignments in candidate building (~lines 477, 505)
- `prewarmRank` reads in the ranking/sorting logic (~lines 566–574)
- `layer: 'candidate_aware_prewarm'` reference (~line 799)

### `backend/lib/layered-contracts.js`
- The `candidate_aware_prewarm` contract entry (~line 10)
- `prewarmRank` field in the contract normalizer (~lines 102–103)

### `backend/scripts/summarize-prewarm-analytics.js`
- Delete the whole file (it exists only to summarize prewarm analytics events)

### `backend/scripts/measure-guided-finalize.js`
- Remove the prewarm fetch block (~lines 144–155) and prewarm fields from case results (~lines 198–205)
- Remove `prewarmAverageLatencyMs` and `prewarmAverageTotalTokens` from the summary object and print output (~lines 245–247, 394)

---

## Tests to update

- `backend/server.test.js` — remove the prewarm route test (~line 1104) and update any discovery response assertions that expect a `prewarm` field or `prewarmArtifact*` fields
- `backend/lib/ai-selector.test.js` — remove `prewarmRank` from test fixtures (~lines 495, 501, 553, 559) and the `candidate_aware_prewarm` layer assertion (~line 506)
- `backend/lib/layered-contracts.test.js` — remove the prewarm contract test (~line 47)
- `src/pages/HomePage.test.jsx` — remove the prewarm route test (~line 444) and any mock handler for `/api/search/prewarm` (~line 493)

---

## Definition of done

- [ ] All files above updated or deleted
- [ ] `npm run test` passes with no failures
- [ ] No remaining references to `prewarm` in `src/`, `backend/`, or `api/` (a grep check is fine)

---

## Completion note

_Codex: replace this section when done. Include: what was removed, any surprises, final test count._

---

## Claude follow-up

After Codex marks this done, Claude will update `project-notes/` to remove prewarm references from the active notes.
