# Async Product Details — Show Cards Before Oxylabs Responds

## The problem
Product details (bullet points, descriptions) are fetched from Oxylabs synchronously
before the finalize response is sent. This adds 5-10 seconds to the user-facing wait
time. The user stares at a spinner for 14+ seconds before seeing anything.

## What we want
Show product cards immediately after Haiku selects the 6 picks (~3s), then fetch
product details in the background. The cards render with title, price, and rating
right away. Bullet points and descriptions fill in later — same as how enrichment
(fit reasons and caveats) already works.

## Key constraint
Enrichment (the AI copy step) must still wait for product details before running.
The enrichment prompt uses feature bullets and product descriptions to write specific,
non-generic copy. If it runs without them it falls back to title/price/rating only,
which produces weaker copy. The async delay is fine — the user is already browsing
cards by the time enrichment arrives.

## How it should work

### Current flow
1. Haiku selects 6 winners (~3s)
2. Fetch Oxylabs product details for all 6 (~5-10s) ← blocking
3. Run enrichment with bullets/descriptions (~3s)
4. Send finalize response with everything

Total wait: ~14s before user sees anything

### New flow
1. Haiku selects 6 winners (~3s)
2. Send immediate response with cards (title, price, rating, no bullets yet)
3. In background: fetch Oxylabs details → then run enrichment → push via existing enrichment polling endpoint

Total wait before cards appear: ~3s
Enrichment + bullets arrive: ~10-13s later (user is already browsing)

## How enrichment polling already works
There is already an async enrichment pattern in place:
- `finalize` sets `enrichmentMode: "async"` and returns `miniEnrichmentStatus: "running_async"`
- The frontend polls `/api/search/enrichment` every 1.5s until enrichment is ready
- Results are merged into the displayed cards when they arrive

Product details + enrichment should hook into this same pattern.

## What needs to change

### Backend (`server.js`)
- After Haiku selection, build and return the initial card results immediately
  (using candidate data already in the pool — no Oxylabs needed for title/price/rating)
- Kick off Oxylabs fetch + enrichment as a background task (fire and forget from
  the request handler, write results to the enrichment cache when done)
- The existing enrichment polling endpoint already delivers the enriched results
  to the frontend — no frontend changes needed

### What does NOT change
- Enrichment prompt and logic — unchanged
- Frontend polling — unchanged  
- The enrichment cache write — unchanged
- Card rendering — already handles missing bullets gracefully

## Important notes
- The background task must not crash the server if it fails — wrap in try/catch,
  log the error, and let it fail silently (enrichment is already best-effort)
- Do not change the enrichment polling endpoint
- Do not change the frontend
- The `miniEnrichmentStatus` field in the finalize response should reflect the
  new state: still `"running_async"` so the frontend keeps polling as before
