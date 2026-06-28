# Assistant Start

## Purpose
- Compact startup context for Codex and other AI assistants.
- Read this after `AGENTS.md` at the start of a chat.
- Do not read every project note by default. Open deeper notes only when the task needs them.

## Product summary
Focamai helps a user describe the product they want, answer one short follow-up when useful, and get a focused shortlist of 6 picks before leaving to shop. The product should feel calm, practical, and focused instead of like a prettier Amazon wall.

## Current branch context
- Active branch for the current experiment: `new_web_ui`.
- The branch is intended for a new web UI direction inspired by the stronger mobile app.
- The goal is not to port mobile wholesale. Web should stay optimized for desktop and responsive browser use.
- The web UI improvement plan lives at `project-notes/ui_improvement_plan/README.md`.

## Current app reality
- Frontend: Vite, React, React Router, TanStack Query, Tailwind, Vitest.
- Backend: Node/Express on Render.
- Frontend deploy: Vercel.
- Backend deploy: Render, starting from `backend/express-server.js`.
- The frontend calls the backend through `VITE_BACKEND_URL`.
- `api/geo.js` intentionally stays on Vercel so the UI can use Vercel geolocation headers.
- The same Render Express service also hosts the separate KAILA scaffold under `/kaila` so KAILA can share the paid service without replacing Focamai.

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
- User-facing search history lives at `/history`; finalized searches auto-save locally when signed out and to Supabase `saved_searches` when signed in. Entries can be expanded, deleted, cleared, or re-run.
- Frontend auth shell has started: `AuthProvider`, `useAuth`, lazy Supabase browser client, `AuthModal`, and header sign-in/sign-out UI exist. Search remains ungated. Signed-out history uses localStorage; signed-in history uses Supabase `saved_searches`; local entries migrate into the account on login. Live QA of auth/RLS/history persistence is still pending.
- Price Watch Phase 3 is implemented behind `PRICE_WATCH_EMAILS_ENABLED=true`. Signed-in users can manage up to 5 watches at `/watches`; protected `POST /api/internal/check-price-watches` runs on the existing Render web service and should be called by a free external scheduler with `Authorization: Bearer $PRICE_WATCH_INTERNAL_TOKEN`. The job re-prices active watched ASINs with Rainforest, updates checked/last-seen fields, logs would-notify rows when email is disabled, and sends Resend alerts plus baseline reset after successful live sends when enabled.

## Current guided flow
- User enters a product query.
- Discovery and AI follow-up start in parallel.
- Main discovery route: `GET /api/search/rainforest-discover`.
- Refine route: `GET /api/search/refine`.
- Finalize route: `POST /api/search/finalize`.
- Enrichment reads: `GET /api/search/enrichment-stream` first, with `GET /api/search/enrichment` as polling fallback.
- Query-quality polling: `GET /api/search/query-quality`.
- Preview product detail hydration: `GET /api/search/product-details`.
- User-triggered finalized-product Deep Dive: `POST /api/product/deep-dive` when `DEEP_DIVE_ENABLED=true` and the user is signed in.
- Retry advice: `POST /api/search/retry-advice`.
- Feedback: `POST /api/feedback`.
- Search diagnostics: `POST /api/search/diagnostics/event`, `GET /api/health`, `GET /api/diagnostics/connectivity`.

## Important behavior notes
- Discovery uses Rainforest API for active Amazon discovery. Oxylabs has been archived and is not an active fallback.
- Finalize rebuilds the candidate pool server-side from guided cache.
- Haiku locks the shortlist first, with deterministic fallback/top-up when needed. Its prompt ranks inferred product fit first, then quality confidence (rating, review count, trustScore, and recognized category brand), price/value, shortlist variety, and raw Amazon position as the final tiebreaker.
- Provider-confirmed Prime eligibility is preserved as structured `isPrime` data; clear Prime delivery/eligibility requests narrow finalize to Prime-tagged candidates when available, and the UI shows only a quiet in-house Prime marker/fact. Plain free-delivery text may show as `Free delivery` but must not be upgraded to Prime. Rainforest product-detail enrichment can preserve provider-confirmed Prime and delivery details when available.
- Result surfaces should stay compact: source/store names belong in clickout CTAs, rating plus review count are one ratings/reviews signal, and delivery is at most one optional signal.
- Hard-constraint follow-up notes can trigger one refreshed discovery before finalize.
- Query-quality suggestions are polling-based only. No SSE or prewarm path exists.
- Modal/detail enrichment hydrates after the first shortlist cards are shown, framing the top pick as the hero recommendation and later picks as alternatives.
- Skipped-refinement preview products do not show AI recommendation analysis. When opened, the modal can lazily hydrate product detail bullets/description from the per-ASIN cache or Rainforest through `GET /api/search/product-details`.
- Finalized product modals have a feature-flagged, user-triggered Deep Dive panel. The button is hidden by default and appears only after async mini writeup plus a separate `gpt-5-mini` Deep Dive eligibility pass marks that product `show` or `maybe`. Deep Dive remains account-gated, uses SerpApi Shopping -> Immersive Product only after click, validates exact product/store links deterministically, shows lower store offers only when they beat the known Amazon/source price, and keeps the existing Amazon/source CTA unchanged. Do not add automatic background price surfacing or shortlist badges for this path.
- Marketplace listings without a known positive price are filtered out before preview/finalize.
- Thin discovery cache hits with fewer than 6 cached results or candidates are bypassed and refreshed from the provider.
- `/api/search/live` and debug/cache routes are not the main user path.
- `/admin/analytics` is local-only during development.
- `/admin/analytics` includes a Search reliability section when Supabase `search_attempts` and `search_events` exist; it shows failed support codes, Rainforest timeout/error/empty-result patterns, backend reachability, filter/VPN reports, platform, and marketplace grouping.
- Guided discovery/finalize Render logs and Sentry contexts include the frontend support/search ID. Diagnostic POST storage failure returns `503` and is visible as a browser warning in development instead of being silently reported as successful.

## Key files
- App route shell: `src/App.jsx`
- Homepage route: `src/pages/HomePage.jsx`
- Lightweight homepage shell: `src/components/home/HomeShell.jsx`
- Guided homepage experience: `src/components/home/HomeExperience.jsx`
- Web results UI: `src/components/home/ResultsSection.jsx`
- Web product modal: `src/components/home/ProductDetailModal.jsx`
- Guided search state/requests: `src/components/home/useGuidedSearch.js`
- Price watches page/hook/store: `src/pages/WatchPage.jsx`, `src/components/watch/useWatches.js`, `src/lib/watch/watchStore.js`
- Price watch dry-run job: `backend/jobs/check-price-watches.js`
- Price watch protected endpoint handler: `backend/lib/handlers/price-watch-handler.js`
- Price watch email renderer/sender: `backend/lib/price-watch/price-drop-email.js`
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
- Price Watch plan and decisions: `project-notes/price-watch-plan.md`

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

