# Session Handoff

## Purpose
- Slightly fuller reset for a fresh Codex chat.
- Use `project-notes/assistant-start.md` for the normal compact startup.
- Do not read every project note by default.

## Startup read order
1. `AGENTS.md`
2. `project-notes/assistant-start.md`
3. Open deeper notes only as needed for the task:
   - implemented app behavior: `project-notes/app_flow.md`
   - search/backend flow: `project-notes/search-flow.md`
   - new web UI plan: `project-notes/ui_improvement_plan/README.md`
   - backlog/open questions: `project-notes/handoff.md`
   - product intent: `project-notes/doc_briefs.md`
   - storage tables: `project-notes/db-needs.md`
   - current snapshot/changelog: `project-notes/current-status.md`

## Current direction
- The current experiment branch is `new_web_ui`.
- The branch is for borrowing the strongest UI/UX lessons from the mobile app while keeping web optimized for browser and desktop use.
- The current web homepage at `/` still uses the `open` layout until changed.
- The product should stay calm, focused, mobile-first/responsive, and not marketplace-shaped.
- Focamai should not feel like an Amazon clone or marketplace wall. Amazon is the current primary commerce path and affiliate target, so frontend copy and UI may say Amazon directly when the active source is Amazon and doing so improves clarity, trust, or conversion.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible, but do not let future multi-retailer flexibility make today's Amazon-first UX vague.
- Product shortlists stay at 6 items.
- The guided backend path is the real product path.
- `/api/search/live` remains a manual/debug combined route, not the normal user flow.
- The PNG wordmark is the active wordmark.
- The web UI improvement plan lives at `project-notes/ui_improvement_plan/README.md`.
- Priority 1 of that plan is now implemented in a simpler form: final/preview results render as ranked rows, without a side preview.
- Priority 2 is now implemented in the first pass: the large search stage collapses into compact progress plus a summary after submit, refinement gets its own active panel, and finalized refinement collapses above the ranked results.
- Priority 3 is now implemented in the first pass: the active refine panel uses the mobile-inspired heading, AI follow-up prompt, up to 3 refinement chips, fallback chips, selected chip state, and chip-to-notes behavior.
- Priority 4 is now implemented in the first pass: guided finalize shows staged progress copy while it locks the shortlist.
- Priority 5 is now implemented in the first pass: product detail modal order is image/facts, reasoning/caveat, product notes, and one compact source-specific CTA/disclosure area.
- Priority 6 is now implemented in the first pass: search/refine/results/retry/modal surfaces use fewer gradients, lighter shadows, more consistent radii, teal-first actions, and orange mainly for shopping clickout.
- Priority 7 is now implemented in the first pass: retry asks what felt off, uses only three broad quick prompts, shows AI advice as an editable `Next search` field, and has one `Search again` action.
- Product titles are normalized for user-facing display across result rows, selected panels, grid/card view, and modal headings. Raw Amazon/source titles remain in data and are exposed behind a quiet full-title disclosure in details when the display title differs.

## Current guided flow
- `GET /api/search/rainforest-discover` is the main discovery route used by the homepage.
- `GET /api/search/refine` returns one short follow-up question and optional refinement chips.
- `POST /api/search/finalize` rebuilds the candidate pool from guided cache and returns up to 6 shortlist cards.
- Haiku shortlist locking now ranks by inferred title fit first, rating/reviews second, and raw Amazon search position (`amazonPosition`) only as a secondary signal.
- `GET /api/search/enrichment-stream` is the first enrichment path; `GET /api/search/enrichment` is the polling fallback.
- Mini enrichment now treats the first locked pick as the hero recommendation and later picks as alternatives with distinct tradeoffs.
- `GET /api/search/query-quality` exposes polling-based query-quality suggestions.
- `POST /api/search/retry-advice` suggests a better next search when the user rejects the shortlist.
- `POST /api/feedback` stores tester feedback.

## Key files
- App route shell: `src/App.jsx`
- Homepage entry: `src/pages/HomePage.jsx`
- First-load homepage shell: `src/components/home/HomeShell.jsx`
- Guided homepage experience: `src/components/home/HomeExperience.jsx`
- Result UI: `src/components/home/ResultsSection.jsx`
- Product modal UI: `src/components/home/ProductDetailModal.jsx`
- Finalize loading UI: `src/components/home/FinalizeLoadingState.jsx`
- Guided search state/requests: `src/components/home/useGuidedSearch.js`
- Amazon store context: `src/contexts/AmazonStoreContext.jsx`
- Render backend entrypoint: `backend/express-server.js`
- Core route handlers: `backend/server.js`
- Cache/storage helpers: `backend/lib/search-storage.js`

## Deployment reality
- Frontend is on Vercel.
- Backend is on Render and starts from `backend/express-server.js`.
- The frontend calls the Render backend through `VITE_BACKEND_URL`.
- `api/geo.js` intentionally stays on Vercel so the UI can read Vercel geolocation headers through a relative `/api/geo` request.

## If continuing from here
- For UI redesign work, read `project-notes/ui_improvement_plan/README.md` next.
- For current behavior questions, read `project-notes/app_flow.md`.
- For backend/search behavior, read `project-notes/search-flow.md`.
- For remaining work, read `project-notes/handoff.md`.
