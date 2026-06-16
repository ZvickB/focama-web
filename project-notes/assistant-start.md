# Assistant Start

## Purpose
- Compact startup context for Codex and other AI assistants.
- Read this after `AGENTS.md` at the start of a chat.
- Do not read every project note by default. Open deeper notes only when the task needs them.

## Product summary
Focamai helps a user describe the product they want, answer one short follow-up when useful, and get a focused shortlist of 6 picks before leaving to shop. The product should feel calm, practical, and focused instead of like a prettier Amazon wall.

## Current branch context
- Active branch for the current experiment: `experiment/serp-price-intel`.
- Price-comparison Phases 1-3 are implemented on this branch behind `PRICE_COMPARISON_ENABLED=false`: async identity, isolated SerpApi/BlueCart matching, a 7-day match/30-minute price cache, and server-validated `POST /api/product/price-check` with optional Supabase auth redaction and rate limits. The current UI does not call it; settings and offer UI remain Phase 4.
- The active web UI direction remains documented at `project-notes/ui_improvement_plan/README.md`.

## Current app reality
- Frontend: Vite, React, React Router, TanStack Query, Tailwind, Vitest.
- Backend: Node/Express on Render.
- Frontend deploy: Vercel.
- Backend deploy: Render, starting from `backend/express-server.js`.
- Production frontend API calls try the configured Render backend directly. A browser-level network failure retries once through same-origin `/api/...` Vercel rewrites and persists that route preference. On later page loads, a background direct health ping clears the preference when Render is reachable again.
- `api/geo.js` intentionally stays on Vercel so the UI can use Vercel geolocation headers.

## Current product direction
- The homepage at `/` is the main product experience.
- Current active web homepage uses the `open` layout.
- Product shortlists are 6 items end to end.
- The PNG wordmark is the active wordmark.
- Focamai should not feel like an Amazon clone or marketplace wall. Its product identity is the focused decision aid, not Amazon's browsing experience.
- Amazon is the current primary commerce path and affiliate target. When the active source is Amazon, frontend copy, buttons, labels, and detail UI may say Amazon directly where it improves clarity, trust, or conversion.
- Active Amazon marketplaces must have configured Associates tracking tags. The current code only enables `amazon.com` and `amazon.ca`; untagged domains fall back to `amazon.com` and should not produce Amazon clickouts without `tag=`.
- Do not force generic `retailer` language in user-facing UI when `Amazon` is more accurate for the current experience.
- Existing shopping clickout CTAs should derive their visible label from the product source/store: Amazon items can say `View on Amazon` or the active Amazon domain, and future non-Amazon sources can say `View on Walmart`, `View on AliExpress`, etc.
- Do not add new Amazon/source/retailer fields or badges as incidental work. Any new result-card or modal source labeling beyond the existing source-derived clickout CTA should be an explicit product/UI decision from the user, not bundled into unrelated search or data changes.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible so another source can be added or swapped later.
- Do not let future multi-retailer flexibility make today's Amazon-first UX vague. If more retailers become active, revisit frontend labels based on the real source mix.
- `search_history` is internal telemetry/cache visibility, not a user-facing saved-history feature.
- User-facing search history has started as a localStorage-only feature at `/history`; finalized searches auto-save on the current device and can be expanded, deleted, cleared, or re-run. Account-backed history is still pending and should use `saved_searches`, not internal `search_history`.
- Frontend auth shell has started: `AuthProvider`, `useAuth`, lazy Supabase browser client, `AuthModal`, and header sign-in/sign-out UI exist. Search remains ungated. Signed-out history uses localStorage; signed-in history uses Supabase `saved_searches`; local entries migrate into the account on login. Live QA of auth/RLS/history persistence is still pending.

## Current guided flow
- User enters a product query.
- Discovery and AI follow-up start in parallel.
- Main discovery route: `GET /api/search/rainforest-discover`.
- Refine route: `GET /api/search/refine`.
- Finalize route: `POST /api/search/finalize`.
- Enrichment reads: `GET /api/search/enrichment-stream` first, with `GET /api/search/enrichment` as polling fallback.
- Query-quality polling: `GET /api/search/query-quality`.
- Preview product detail hydration: `GET /api/search/product-details`.
- Lazy Canadian comparison endpoint: `POST /api/product/price-check` (implemented but not called by the current UI).
- Retry advice: `POST /api/search/retry-advice`.
- Feedback: `POST /api/feedback`.
- Search diagnostics: `POST /api/search/diagnostics/event`, `GET /api/health`, `GET /api/diagnostics/connectivity`.

## Important behavior notes
- Discovery uses Rainforest API first for all Amazon marketplaces when configured. Oxylabs is now the discovery fallback only: it runs when Rainforest errors or returns too few usable items to support the 6-item shortlist. If Rainforest is not configured, Oxylabs remains the emergency provider when credentials are available.
- Finalize rebuilds the candidate pool server-side from guided cache.
- Haiku locks the shortlist first, with deterministic fallback/top-up when needed. Its prompt ranks inferred product fit first, then quality confidence (rating, review count, trustScore, and recognized category brand), price/value, shortlist variety, and raw Amazon position as the final tiebreaker.
- Provider-confirmed Prime eligibility is preserved as structured `isPrime` data; clear Prime delivery/eligibility requests narrow finalize to Prime-tagged candidates when available, and the UI shows only a quiet in-house Prime marker/fact. Plain free-delivery text may show as `Free delivery` but must not be upgraded to Prime. Rainforest product-detail enrichment can upgrade `isPrime` when search rows underreport Prime, with Oxylabs only as the detail fallback.
- Result surfaces should stay compact: source/store names belong in clickout CTAs, rating plus review count are one ratings/reviews signal, and delivery is at most one optional signal.
- Hard-constraint follow-up notes can trigger one refreshed discovery before finalize.
- Query-quality suggestions are polling-based only. No SSE or prewarm path exists.
- Modal/detail enrichment hydrates after the first shortlist cards are shown, framing the top pick as the hero recommendation and later picks as alternatives.
- The same async mini-enrichment response preserves `sourceTitle`, validates a cleaner `displayTitle`, and stores a separate `matchIdentifier`. Provider identifiers outrank deterministic extraction, and AI cannot supply authoritative UPC/EAN/GTIN fields.
- Skipped-refinement preview products do not show AI recommendation analysis. When opened, the modal can lazily hydrate product detail bullets/description from the per-ASIN cache or Rainforest through `GET /api/search/product-details`, with Oxylabs fallback when Rainforest is unavailable or returns no usable detail.
- Marketplace listings without a known positive price are filtered out before preview/finalize.
- Thin discovery cache hits with fewer than 6 cached results or candidates are bypassed and refreshed from the provider.
- `/api/search/live` and debug/cache routes are not the main user path.
- `/admin/analytics` is local-only during development.
- `/admin/analytics` includes a Search reliability section when Supabase `search_attempts` and `search_events` exist; it shows failed support codes, Rainforest timeout/error/empty-result patterns, backend reachability, filter/VPN reports, platform, and marketplace grouping.

## Key files
- App route shell: `src/App.jsx`
- Homepage route: `src/pages/HomePage.jsx`
- Lightweight homepage shell: `src/components/home/HomeShell.jsx`
- Guided homepage experience: `src/components/home/HomeExperience.jsx`
- Web results UI: `src/components/home/ResultsSection.jsx`
- Web product modal: `src/components/home/ProductDetailModal.jsx`
- Guided search state/requests: `src/components/home/useGuidedSearch.js`
- Amazon store context: `src/contexts/AmazonStoreContext.jsx`
- Backend route handlers: `backend/server.js`
- Render backend entry: `backend/express-server.js`
- Search storage/cache helpers: `backend/lib/search-storage.js`
- Search diagnostics helper/storage: `src/lib/searchDiagnostics.js`, `backend/lib/storage/search-diagnostics-storage.js`

## Read deeper only when relevant
- Current implemented behavior: `project-notes/app_flow.md`
- Search/backend flow details: `project-notes/search-flow.md`
- New web UI plan: `project-notes/ui_improvement_plan/README.md`
- Durable backlog/open questions: `project-notes/handoff.md`
- Product intent and broad decisions: `project-notes/doc_briefs.md`
- Supabase/storage table summary: `project-notes/db-needs.md`
- Short current snapshot/changelog: `project-notes/current-status.md`

## Working guardrails
- Code is current reality if notes and code disagree.
- Treat implemented behavior and planned ideas as different things.
- If active notes are stale and the task changes the relevant area, update the notes.
- Keep changes scoped and clean up superseded UI/code/notes when safe.
- Do not overengineer scaling or abstraction before the product needs it.
- When backend changes are non-trivial, explain request flow, data shape, tradeoffs, and what could break in practical terms.

## Notes update rules
- After meaningful backend or product-flow changes, update `app_flow.md`, `current-status.md`, and this file if future chats would otherwise be misled.
- After meaningful UI direction changes, update `ui_improvement_plan/README.md` if the plan or priority changes.
- After finishing a meaningful chunk of work, update `handoff.md` if remaining work or priorities changed.
