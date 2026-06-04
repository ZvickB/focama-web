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
- Do not force generic `retailer` language in user-facing UI when `Amazon` is more accurate for the current experience.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible so another source can be added or swapped later.
- Do not let future multi-retailer flexibility make today's Amazon-first UX vague. If more retailers become active, revisit frontend labels based on the real source mix.
- `search_history` is internal telemetry/cache visibility, not a user-facing saved-history feature.

## Current guided flow
- User enters a product query.
- Discovery and AI follow-up start in parallel.
- Main discovery route: `GET /api/search/rainforest-discover`.
- Refine route: `GET /api/search/refine`.
- Finalize route: `POST /api/search/finalize`.
- Enrichment reads: `GET /api/search/enrichment-stream` first, with `GET /api/search/enrichment` as polling fallback.
- Query-quality polling: `GET /api/search/query-quality`.
- Retry advice: `POST /api/search/retry-advice`.
- Feedback: `POST /api/feedback`.

## Important behavior notes
- Discovery currently tries Oxylabs first and falls back to Rainforest API when Oxylabs cannot return usable Amazon results.
- Finalize rebuilds the candidate pool server-side from guided cache.
- Haiku locks the shortlist first, with deterministic fallback/top-up when needed. Its prompt ranks title-fit first, then quality, with raw Amazon position only as a secondary tiebreaker.
- Hard-constraint follow-up notes can trigger one refreshed discovery before finalize.
- Query-quality suggestions are polling-based only. No SSE or prewarm path exists.
- Modal/detail enrichment hydrates after the first shortlist cards are shown, framing the top pick as the hero recommendation and later picks as alternatives.
- Marketplace listings without a known positive price are filtered out before preview/finalize.
- `/api/search/live` and debug/cache routes are not the main user path.
- `/admin/analytics` is local-only during development.

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
