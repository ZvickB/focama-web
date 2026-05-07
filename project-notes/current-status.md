# Current Status

## Purpose
- Short snapshot of what is true right now.
- Use `project-notes/app_flow.md` for the full implemented flow.
- Use `project-notes/handoff.md` for remaining work and open product decisions.

## Current product state
- The app is Vite + React + React Router + TanStack Query + Tailwind + Vitest.
- The homepage at `/` uses the `open` layout: single-column, search-first, calm, and mobile-first.
- The homepage now ships in the plain white visual mode by default; the temporary homepage background toggle is no longer part of the active UI.
- Basic SEO plumbing is now in place: route-level metadata, canonicals, OG/Twitter tags, sitemap, robots, and manifest.
- A local-only internal analytics dashboard now lives at `/admin/analytics` during development and reads a backend funnel summary instead of querying Supabase directly from the browser.
- The current user path is: search -> short follow-up -> preview or focused shortlist -> modal details -> retailer clickout.
- A tester-only feedback FAB now opens a lightweight sheet for quick product feedback, optional free text, and optional follow-up email.
- Shortlists are always 6 items.
- The PNG wordmark is the active wordmark.
- A boot splash still lives in `index.html` and fades after React is ready.

## Current search flow
- The homepage starts with a normal product query, not a long form.
- The main product query field is now a compact 2-line textarea so longer natural-language searches and AI retry suggestions stay visible without changing the top form layout mid-flow.
- Discovery and the AI follow-up question run in parallel after submit.
- `Show products now` reveals the preview set without finalize.
- `Show focused picks` runs guided finalize and scrolls directly to the results region.
- Final result cards stay metadata-first on the grid.
- The product modal shows feature bullets immediately when available, then fills in `fit_reason` and `caveat` when enrichment arrives.
- Retry is currently suggestion-led: the user explains what felt off, `/api/search/retry-advice` proposes a better next query, and that suggestion is now loaded back into the top search box instead of being edited inline inside the lower retry panel.

## Current backend/deployment reality
- Frontend is deployed on Vercel.
- Backend is deployed on Render through `backend/express-server.js`.
- Render CORS now explicitly accepts the current `focamai.com` and `www.focamai.com` frontend origins, while still tolerating the older `focama.vercel.app` origin during transition.
- `GET /api/search/rainforest-discover` is the primary homepage discovery route.
- `GET /api/search/refine`, `POST /api/search/finalize`, `GET /api/search/enrichment-stream`, `GET /api/search/enrichment`, and `POST /api/search/retry-advice` are all active in the Render app.
- `GET /api/analytics/dashboard` is a localhost-only development endpoint for the internal analytics page and returns `404` in production.
- `GET /api/geo` intentionally stays on Vercel so the frontend can resolve the user’s country from Vercel headers and send an explicit Amazon domain on guided requests when the store picker is left on `Auto`.
- Discovery cache and operational history use Supabase when configured, with local file fallback in development.
- Product details use a separate provider-agnostic per-ASIN cache, also with Supabase preferred and local fallback available.
- Tester feedback stores to a dedicated `tester_feedback` table in Supabase when configured, with local fallback in development.
- Rate limiting is currently process-local in-memory on the Render server, not Supabase-backed.

## Current finalize reality
- Finalize rebuilds the candidate pool from guided discovery cache instead of trusting a browser-posted rich pool.
- Haiku locks the shortlist first.
- Partial valid Haiku output is treated as recoverable: the backend tops it up from deterministic fallback and returns `selection.strategy: 'haiku_lock_topped_up'`.
- The current detail helper for shortlisted ASINs is still `fetchOxylabsProductDetailsByAsin`.
- Product details are cached per ASIN before mini enrichment runs, using the final displayed shortlist IDs.
- Failed shortlisted detail calls now retry once in the background after the fast first pass, so mini enrichment can proceed with partial detail coverage while later cache quality still improves.
- If that background retry later finds bullets, the active stored enrichment payload is patched and the modal can hydrate those bullets without a fresh finalize run.
- Mini enrichment writes `fit_reason` and `caveat` back into guided cache for the exact active `discoveryToken`, then the frontend hydrates the modal via SSE first and polling fallback second.
- AI prompts have been sharpened to weight user context more heavily when selecting and explaining picks.

## Active constraints
- Keep the guided flow as the main product path.
- Keep shortlist count at 6 unless the user explicitly changes it.
- Keep the product vendor-agnostic in frontend shape and normalized backend responses.
- Keep `search_history` as internal telemetry, not user-facing saved history.
- Keep current behavior and future ideas clearly separated in notes.

## Recommended next checks
- Verify the browser golden path on the live app: fast cards first, modal AI copy later.
- Tighten the loading states between search, refine, and results.
- Improve weak-result and low-confidence handling.
- Decide how affiliate-ready outbound links and disclosures should appear.
