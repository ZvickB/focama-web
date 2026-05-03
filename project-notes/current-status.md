# Current Status

## Purpose
- Short snapshot of what is true right now.
- Use `project-notes/app_flow.md` for the full implemented flow.
- Use `project-notes/handoff.md` for remaining work and open product decisions.

## Current product state
- The app is Vite + React + React Router + TanStack Query + Tailwind + Vitest.
- The homepage at `/` uses the `open` layout: single-column, search-first, calm, and mobile-first.
- The current user path is: search -> short follow-up -> preview or focused shortlist -> modal details -> retailer clickout.
- Shortlists are always 6 items.
- The PNG wordmark is the active wordmark.
- A boot splash still lives in `index.html` and fades after React is ready.

## Current search flow
- The homepage starts with a normal product query, not a long form.
- Discovery and the AI follow-up question run in parallel after submit.
- `Show products now` reveals the preview set without finalize.
- `Show focused picks` runs guided finalize and scrolls directly to the results region.
- Final result cards stay metadata-first on the grid.
- The product modal shows feature bullets immediately when available, then fills in `fit_reason` and `caveat` when enrichment arrives.
- Retry is currently suggestion-led: the user explains what felt off, `/api/search/retry-advice` proposes a better next query, and the suggested query can be edited before starting a fresh search.

## Current backend/deployment reality
- Frontend is deployed on Vercel.
- Backend is deployed on Render through `backend/express-server.js`.
- `GET /api/search/rainforest-discover` is the primary homepage discovery route.
- `GET /api/search/refine`, `POST /api/search/finalize`, `GET /api/search/enrichment-stream`, `GET /api/search/enrichment`, and `POST /api/search/retry-advice` are all active in the Render app.
- `GET /api/geo` intentionally stays on Vercel so the frontend can resolve the user’s country from Vercel headers and send an explicit Amazon domain on guided requests when the store picker is left on `Auto`.
- Discovery cache and operational history use Supabase when configured, with local file fallback in development.
- Product details use a separate provider-agnostic per-ASIN cache, also with Supabase preferred and local fallback available.
- Rate limiting is currently process-local in-memory on the Render server, not Supabase-backed.

## Current finalize reality
- Finalize rebuilds the candidate pool from guided discovery cache instead of trusting a browser-posted rich pool.
- Haiku locks the shortlist first.
- The current detail helper for shortlisted ASINs is still `fetchOxylabsProductDetailsByAsin`.
- Product details are cached per ASIN before mini enrichment runs.
- Mini enrichment writes `fit_reason` and `caveat` back into guided cache, then the frontend hydrates the modal via SSE first and polling fallback second.

## Active constraints
- Keep the guided flow as the main product path.
- Keep shortlist count at 6 unless the user explicitly changes it.
- Keep the product vendor-agnostic in frontend shape and normalized backend responses.
- Keep `search_history` as internal telemetry, not user-facing saved history.
- Keep current behavior and future ideas clearly separated in notes.

## Recommended next checks
- Verify the browser golden path on the live app: fast cards first, modal AI copy later.
- Check modal AI tone so it reads like a trusted assistant, not marketing copy.
- Tighten the loading states between search, refine, and results.
- Improve weak-result and low-confidence handling.
- Decide how affiliate-ready outbound links and disclosures should appear.
