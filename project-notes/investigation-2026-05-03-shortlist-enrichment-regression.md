# Investigation — 2026-05-03 shortlist + enrichment regression

## Purpose
- Capture the current production-facing problem for a fresh Codex chat.
- This is an investigation note only.
- No code changes were made as part of this note.

## User-reported symptoms
- Searches that should return a full shortlist of 6 can return fewer cards.
- Confirmed example: `android phone` returned only 4 choices.
- Result modals are not populating with:
  - Oxylabs-backed product detail bullets
  - AI-written `fit_reason`
  - AI-written `caveat`

## What looks wrong

### 1. Finalize can ship fewer than 6 results
In `backend/server.js`, guided finalize currently:
- uses `haikuResult.lockedIds` when Haiku returns any ids at all
- falls back to the deterministic shortlist only when Haiku returns zero ids

That means:
- if Haiku returns 4 ids, the app returns 4 results
- the current code does not top the shortlist back up to 6 from the fallback pool

This appears to violate the active product rule that shortlists should always be 6 items.

## 2. Enrichment delivery likely breaks after finalize
In `src/components/home/useGuidedSearch.js`:
- the frontend opens `/api/search/enrichment-stream` first using `EventSource`
- if that stream errors, `source.onerror` calls `stopEnrichmentPolling()`
- it does **not** start polling fallback afterward

So if SSE fails, enrichment can silently stop entirely.

## 3. SSE may be failing cross-origin
Frontend is on Vercel and backend is on Render.

In `backend/server.js`, `handleEnrichmentStream` writes SSE headers:
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

At time of investigation, this stream handler does **not** appear to add the same cross-origin headers used elsewhere.

Possible consequence:
- the browser `EventSource` request to Render fails
- no SSE enrichment arrives
- frontend does not fall back to polling
- modal stays empty for bullets and AI copy

## 4. Even a partial shortlist backfill needs matching enrichment work
If the shortlist bug is fixed by topping 4 Haiku ids back up to 6 using fallback items, there is a second dependency:

the async product-details fetch and mini enrichment path currently runs for `haikuResult.lockedIds`.

So if the final displayed shortlist is later expanded beyond the Haiku ids:
- the extra cards may still miss Oxylabs details
- the extra cards may still miss AI enrichment

Any eventual fix likely needs the enrichment/detail step to follow the actual final displayed shortlist, not only the raw Haiku ids.

## Most likely explanation chain
1. Haiku sometimes returns fewer than 6 ids.
2. Finalize currently accepts that partial list as-is.
3. SSE enrichment may fail between Render and the browser.
4. Frontend does not currently fall back to polling when SSE errors.
5. Result: fewer cards than expected, and modal content never hydrates.

## Good manual checks for the next chat
- Run a live search such as `android phone`.
- Inspect `/api/search/finalize` response and count `results.length`.
- Check whether `selection.selectedCandidateIds.length` is also below 6.
- Inspect `/api/search/enrichment-stream` in browser DevTools Network.
- Check whether the stream request fails, is blocked, or closes immediately.
- Confirm whether any `/api/search/enrichment?...` polling requests happen after SSE failure.
- Confirm whether finalize already includes `feature_bullets` inline for any results, or whether they are all empty at response time.

## Files most relevant for the next Codex chat
- `backend/server.js`
- `src/components/home/useGuidedSearch.js`
- `src/components/home/HomeShared.jsx`
- `project-notes/app_flow.md`
- `project-notes/current-status.md`

## Important caution
- This note records probable failure points from code inspection plus user-reported symptoms.
- It is not yet a confirmed root-cause report.
- The next chat should verify behavior in the browser/network layer before deciding on the fix.
