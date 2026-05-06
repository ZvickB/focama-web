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
- The PNG wordmark is the active wordmark.
- Public routes now have route-level SEO metadata plus static `robots.txt`, `sitemap.xml`, and `site.webmanifest`.
- Current behavior is canonical in `project-notes/app_flow.md`.

## Current guided flow
- `GET /api/search/rainforest-discover` is the main discovery route used by the homepage.
- `GET /api/search/refine` returns one short follow-up question while discovery runs.
- `POST /api/search/finalize` rebuilds the candidate pool from guided cache, uses Haiku first, tops partial valid Haiku output up from deterministic fallback when needed, returns shortlist cards, and starts async enrichment work for the final displayed IDs.
- The shortlisted detail helper now keeps a fast first pass for enrichment and retries failed ASIN detail calls in the background so later cache reads can improve without delaying AI copy further.
- If a background detail retry succeeds later, the stored enrichment entry is patched with those bullets and the frontend keeps polling long enough for the open modal to pick them up.
- `GET /api/search/enrichment-stream` is the first enrichment path from the frontend; it is cross-origin enabled for the Render backend, token-scoped to the active search session, and if the stream fails, the frontend falls back to polling.
- `GET /api/search/enrichment` remains the polling fallback and script-friendly read path, and it is also token-scoped to the active search session.
- `POST /api/search/retry-advice` suggests a better next search when the user rejects the shortlist.
- `POST /api/feedback` stores tester feedback from the homepage FAB.
- `/admin/analytics` is a local-only dev funnel dashboard, backed by localhost `GET /api/analytics/dashboard`.

## Key files
- App route shell: `/src/App.jsx`
- Homepage entry: `/src/pages/HomePage.jsx`
- Active homepage UI: `/src/components/home/HomeExperience.jsx`
- Result and modal UI: `/src/components/home/HomeShared.jsx`
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
- `api/geo.js` intentionally stays on Vercel so the UI can read Vercel geolocation headers through a relative `/api/geo` request.

## If continuing from here
- Read `app_flow.md` for current behavior questions.
- Read `handoff.md` for real remaining work.
- Read `archive/completed-work-2026-05-03.md` only if you need history on recently completed cleanup or archived note movement.
