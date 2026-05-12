# Session Handoff

## Purpose
- Fastest reset for a fresh Codex chat.
- Points to the current source-of-truth notes instead of repeating long history.

## Startup read order
1. `AGENTS.md`
2. `project-notes/current-status.md`
3. `project-notes/app_flow.md`
4. `project-notes/handoff.md`
5. `project-notes/doc_briefs.md`
6. `project-notes/db-needs.md` when storage/backend work is involved

## Current direction
- `/` uses the `open` homepage layout.
- The product should stay calm, focused, mobile-first, and not marketplace-shaped.
- Product shortlists stay at 6 items.
- The guided backend path is the real product path; `/api/search/live` is not part of the current user flow.
- The top homepage query field is now a compact 2-line textarea so long natural-language searches and AI-suggested retries fit without truncation.
- Homepage boot is now shell-first: `/` loads a lightweight `HomeShell` under the existing splash, warms the guided `HomeExperience` chunk during idle time, and only swaps into that guided app after submit.
- The Amazon marketplace context now persists the last saved marketplace locally, and confident geo detections are cached so later loads can skip `GET /api/geo`.
- The homepage now includes a one-time inline marketplace prompt after search starts, and active searches restart cleanly if the marketplace changes mid-flight.
- The PNG wordmark is the active wordmark.
- The homepage now gives the hero wordmark higher fetch priority, preconnects Google Fonts plus the configured Render backend origin, and prefetches `ResultsSection` plus `ProductDetailModal` as soon as `HomeExperience` mounts.
- Public routes now have route-level SEO metadata plus static `robots.txt`, `sitemap.xml`, and `site.webmanifest`.
- `/install` now gives mobile testers practical add-to-home-screen instructions, and the mobile drawer shows that link only on mobile browsers when the app is not already standalone.
- Route-level lazy loading now shows visible loading UI, and chunk-load crashes get a reload-focused fallback in the top-level error boundary.
- Current behavior is canonical in `project-notes/app_flow.md`.

## Current guided flow
- `GET /api/search/rainforest-discover` is the main discovery route used by the homepage.
- Discovery now runs a background query-quality review after the normal response when OpenAI is configured, storing review state at `selection.queryQuality` on the token-scoped session snapshot.
- `GET /api/search/query-quality` is the polling endpoint for that stored review, and the homepage can show a small optional suggested-query prompt when the review is ready and high-confidence.
- `GET /api/search/refine` returns one short follow-up question while discovery runs.
- `POST /api/search/finalize` rebuilds the candidate pool from guided cache, uses Haiku first, tops partial valid Haiku output up from deterministic fallback when needed, returns shortlist cards, and starts async enrichment work for the final displayed IDs.
- Repeated same-query searches now reuse shared discovery candidates but get a fresh token-scoped session snapshot for finalize/enrichment, so older context-specific caveats cannot bleed into a new run.
- Marketplace listings without a known positive price are now stripped out before guided preview caching, cached-result reuse, and finalize candidate selection so unavailable products do not reach AI or the UI shortlist.
- Query-quality suggestions are now user-visible through polling only: accepting starts a normal new guided search for the suggested query, rejecting keeps the original results, and there is still no SSE or prewarm path.
- The shortlisted detail helper now keeps a fast first pass for enrichment and retries failed ASIN detail calls in the background so later cache reads can improve without delaying AI copy further.
- If a background detail retry succeeds later, the stored enrichment entry is patched with those bullets and the frontend keeps polling long enough for the open modal to pick them up.
- Backend failures can now report to Sentry when `SENTRY_DSN` is configured, and background async errors are logged/reported instead of being swallowed.
- Backend rate limiting now uses Supabase `rate_limit_events` when configured, with memory fallback for local/test or storage outages.
- `GET /api/search/enrichment-stream` is the first enrichment path from the frontend; it is cross-origin enabled for the Render backend, token-scoped to the active search session, and if the stream fails, the frontend falls back to polling.
- `GET /api/search/enrichment` remains the polling fallback and script-friendly read path, and it is also token-scoped to the active search session.
- `POST /api/search/retry-advice` suggests a better next search when the user rejects the shortlist, and the homepage now loads that suggestion back into the top search box instead of keeping an editable duplicate inside the retry panel.
- `POST /api/feedback` stores tester feedback from the homepage FAB.
- The product modal now includes an inline affiliate disclosure beside the retailer clickout flow, while the full disclosure still lives at `/affiliate-disclosure`.
- `/admin/analytics` is a local-only dev funnel dashboard, backed by localhost `GET /api/analytics/dashboard`.

## Key files
- App route shell: `/src/App.jsx`
- Homepage entry: `/src/pages/HomePage.jsx`
- First-load homepage shell: `/src/components/home/HomeShell.jsx`
- Guided homepage experience: `/src/components/home/HomeExperience.jsx`
- Result UI: `/src/components/home/ResultsSection.jsx`
- Product modal UI: `/src/components/home/ProductDetailModal.jsx`
- Guided search state/requests: `/src/components/home/useGuidedSearch.js`
- Amazon store context and geo-resolved domain state: `/src/contexts/AmazonStoreContext.jsx`
- Amazon auto-store UI: `/src/components/AmazonStorePill.jsx`
- Render backend entrypoint: `/backend/express-server.js`
- Core route handlers: `/backend/server.js`
- Cache/storage helpers: `/backend/lib/search-storage.js`
- Oxylabs detail helper: `/backend/lib/oxylabs-pipeline.js`
- Internal analytics page: `/src/pages/AnalyticsPage.jsx`

## Deployment reality
- Frontend is on Vercel.
- Backend is on Render and starts from `backend/express-server.js`.
- The frontend calls the Render backend through `VITE_BACKEND_URL`.
- Render CORS now accepts `https://focamai.com`, `https://www.focamai.com`, and the older `https://focama.vercel.app` origin.
- `api/geo.js` intentionally stays on Vercel so the UI can read Vercel geolocation headers through a relative `/api/geo` request.

## If continuing from here
- Read `app_flow.md` for current behavior questions.
- Read `handoff.md` for real remaining work.
- Read `archive/completed-work-2026-05-03.md` only if you need history on recently completed cleanup or archived note movement.
