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
- The current experiment branch is `experiment/serp-price-intel`.
- The branch is for borrowing the strongest UI/UX lessons from the mobile app while keeping web optimized for browser and desktop use.
- The current web homepage at `/` still uses the `open` layout until changed.
- The product should stay calm, focused, mobile-first/responsive, and not marketplace-shaped.
- Focamai should not feel like an Amazon clone or marketplace wall. Amazon is the current primary commerce path and affiliate target, so frontend copy and UI may say Amazon directly when the active source is Amazon and doing so improves clarity, trust, or conversion.
- Amazon marketplace choices are currently limited to domains with configured Associates tracking tags (`amazon.com`, `amazon.ca`). Untagged domains fall back to `amazon.com` and should not create Amazon Special Links without `tag=`.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible, but do not let future multi-retailer flexibility make today's Amazon-first UX vague.
- Existing shopping clickout CTAs should use source-derived wording: Amazon items can say `View on Amazon` or the active Amazon domain, while future non-Amazon sources can say `View on Walmart`, `View on AliExpress`, etc.
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
- Finalized product titles now receive async normalization alongside recommendation enrichment. Provider titles are preserved as `sourceTitle`; validated `displayTitle` values hydrate result rows, selected panels, grid/card view, and modal headings; structured `matchIdentifier` data remains separate for the future comparison flow.
- User-facing search history is implemented at `/history`: signed-out users use localStorage, signed-in users use Supabase `saved_searches`, and local entries migrate into the account on login.
- Frontend auth shell is implemented: `AuthProvider`, `useAuth`, lazy Supabase browser client, `AuthModal`, and header sign-in/sign-out UI are implemented. Search remains ungated.

## Current guided flow
- `GET /api/search/rainforest-discover` is the main discovery route used by the homepage. It uses Rainforest API for active Amazon marketplaces when configured. Oxylabs is retired from the active stack; keep historical references archived only.
- `GET /api/search/refine` returns one short follow-up question and optional refinement chips.
- `POST /api/search/finalize` rebuilds the candidate pool from guided cache and returns up to 6 shortlist cards.
- Haiku shortlist locking now ranks by inferred product fit first, then quality confidence (rating, review count, trustScore, and recognized category brand), price/value, useful shortlist variety, and raw Amazon search position (`amazonPosition`) as the final secondary signal.
- `GET /api/search/enrichment-stream` is the first enrichment path; `GET /api/search/enrichment` is the polling fallback.
- `GET /api/search/product-details` hydrates one skipped-refinement preview product from the per-ASIN product detail cache or Rainforest when its modal opens.
- Mini enrichment now treats the first locked pick as the hero recommendation and later picks as alternatives with distinct tradeoffs.
- Mini enrichment also produces validated display-title and comparison-identity data in the same async OpenAI request. Provider UPC/EAN/GTIN values are merged after model output so AI cannot invent authoritative product codes.
- Price-comparison Phase 3 remains backend-only behind `PRICE_COMPARISON_ENABLED=false`; the unused manual CA/CAD SerpApi/BlueCart route stays isolated. Automatic price intelligence is now the disabled hero-only hybrid documented in `serper-price-intel-spec.md`: Serper discovers candidates, then at most one SerpApi Shopping and one Immersive request must prove a unique exact variant and direct approved-retailer URL. Both CA/CAD and US/USD require explicit allowlists. Missing variant evidence, marketplace/condition conflicts, ambiguous product groups, non-public or mismatched domains, redirect/probe failures, budget exhaustion, provider failures, and stale selections all stay invisible. Shadow mode measures only; surface mode requires percentage rollout. The existing modal panel, Amazon CTA hierarchy, and no-card-badge choice are unchanged.
- The active Supabase project has the Phase 3 schema: `product_details_cache.provider_identity` and the server-only `price_comparison_cache` table. The canonical schema remains in `project-notes/db-needs.md`.
- `GET /api/search/query-quality` exposes polling-based query-quality suggestions.
- `POST /api/search/retry-advice` suggests a better next search when the user rejects the shortlist.
- `POST /api/feedback` stores tester feedback.
- Search diagnostics now run outside Sentry. The frontend search ID is the support code; failed searches show that code, `Copy debug info`, and an optional filter/VPN selector. Frontend/backend lifecycle events write to Supabase `search_attempts` and `search_events` when those tables exist. `/admin/analytics` has a Search reliability section for failed support codes and provider/network patterns.

## Key files
- App route shell: `src/App.jsx`
- Homepage entry: `src/pages/HomePage.jsx`
- Search history page: `src/pages/HistoryPage.jsx`
- First-load homepage shell: `src/components/home/HomeShell.jsx`
- Guided homepage experience: `src/components/home/HomeExperience.jsx`
- Result UI: `src/components/home/ResultsSection.jsx`
- Product modal UI: `src/components/home/ProductDetailModal.jsx`
- Finalize loading UI: `src/components/home/FinalizeLoadingState.jsx`
- Guided search state/requests: `src/components/home/useGuidedSearch.js`
- Search diagnostics helper: `src/lib/searchDiagnostics.js`
- Local history helpers: `src/lib/history/`
- Remote history store: `src/lib/history/remoteHistoryStore.js`
- Auth provider/hook: `src/contexts/AuthContext.jsx`, `src/contexts/useAuth.js`
- Supabase browser client: `src/lib/supabase.js`
- Auth modal: `src/components/auth/AuthModal.jsx`
- Amazon store context: `src/contexts/AmazonStoreContext.jsx`
- Render backend entrypoint: `backend/express-server.js`
- Core route handlers: `backend/server.js`
- Cache/storage helpers: `backend/lib/search-storage.js`
- Search diagnostics storage: `backend/lib/storage/search-diagnostics-storage.js`

## Deployment reality
- Frontend is on Vercel.
- Backend is on Render and starts from `backend/express-server.js`.
- Production frontend calls try the configured Render backend directly. Browser-level network failures retry through explicit same-origin Vercel rewrites and persist the successful proxy route. Each later homepage load directly pings Render and clears that preference when direct access works again; HTTP errors and aborts do not fall back.
- `api/geo.js` intentionally stays on Vercel so the UI can read Vercel geolocation headers through a relative `/api/geo` request.

## If continuing from here
- For UI redesign work, read `project-notes/ui_improvement_plan/README.md` next.
- For current behavior questions, read `project-notes/app_flow.md`.
- For backend/search behavior, read `project-notes/search-flow.md`.
- For remaining work, read `project-notes/handoff.md`.
