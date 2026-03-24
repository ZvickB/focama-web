# Current Status

## Purpose
- This file is the short project snapshot for future chats and handoffs.
- It should reflect the app as it exists now, not old exploration decisions.
- Keep it brief and update it when product direction or infrastructure changes in a meaningful way.

## Current state
- The frontend is built in Vite + React with React Router, TanStack Query, Tailwind, and Vitest.
- The default homepage at `/` now uses the `open` layout: spacious, search-first, single-column, and more mobile-friendly than the older split-screen layout.
- Older homepage experiments were removed after the open layout became the clear direction.
- The open layout now:
  - uses the PNG wordmark in the hero
  - removes chips
  - expands into the AI refinement area after search
  - keeps skeletons visible but lower-priority
  - shows products in a 2x3 skeleton layout
- Product shortlists are now 6 items end to end, not 4.
- The route fallback in `src/App.jsx` now shows a branded loading state with the PNG wordmark and `Focused shopping` instead of `Loading page...`.
- The site header uses a sharper small-size logo asset, and logo/favicon colors were adjusted to better match the current wordmark palette.

## Search and backend state
- The homepage now uses a guided search flow:
  - `/api/search/discover` gathers and filters the candidate pool
  - `/api/search/refine` generates the lightweight AI follow-up prompt
  - `/api/search/finalize` selects the final shortlist from the cleaned candidate pool
- This guided flow is the primary backend path for the product.
- `/api/search/live` is the explicit combined-path endpoint for backend/debug/manual use.
- The older bare `/api/search` route is now legacy-only and requires `?legacy=1` so it does not behave like a normal product endpoint by accident.
- The live search flow currently:
  - validates input
  - checks its own legacy live-search cache scope before external calls
  - queries SerpApi
  - filters/cleans a candidate pool
  - uses AI to generate the refinement prompt and/or select the final shortlist
  - includes tradeoffs/drawbacks in result data
- Guided discovery cache is now scoped separately from legacy live-search cache entries.
- Guided `/api/search/finalize` reranks the submitted candidate pool and does not reuse cached final result sets.
- Search cache and search history can use Supabase when configured.
- Local file-based cache remains as a development/fallback path.
- Basic IP-based rate limiting exists on the search handlers.
- The Vercel API wrappers now forward request headers into the backend handlers so production rate limiting can use forwarded client IP headers.
- Guided `/api/search/finalize` now enforces explicit abuse guardrails:
  - request body limit: 32 KB
  - candidate pool limit: 20 candidates
  - priorities limit: 8 items, 80 characters each
  - follow-up notes limit: 500 characters before OpenAI selection
- Search history records cache hit/miss status best-effort.
- `/api/search/debug` now reports the guided flow as primary, keeps `/api/search` clearly marked as legacy/manual, and shows whether storage is using Supabase or local fallback.
- `/api/health/supabase` now treats an unconfigured Supabase setup as an optional local-fallback state rather than a backend failure.

## Active product decisions
- Keep the `open` homepage as the default for now.
- Preserve the beautiful skeletons, but let the AI refinement step own the viewport first.
- Prefer the PNG wordmark for now rather than forcing a weak SVG recreation.
- Favor calm, spacious, search-first UX over dashboard-like side-by-side layouts.
- Keep the product vendor-agnostic at the response-shape level even if Amazon becomes the strongest affiliate path later.
- Prioritize practical v1 decisions over premature architecture work.

## Current backend plan
1. Read `SERPAPI_API_KEY` from the root `.env`.
2. Read `OPENAI_API_KEY` from the root `.env`.
3. Read Supabase config from the root `.env` when available.
4. Check cached search results before calling external services.
5. Query SerpApi through guided discovery when the primary product flow misses cache.
6. Filter junk, duplicates, and weak candidates before final ranking.
7. Use AI where it improves refinement prompt quality and final selection quality.
8. Store cache/history in Supabase when configured, with local fallback for development.
9. Keep the explicit `/api/search/live` combined route available only for debug/manual use while the bare `/api/search` path stays isolated behind explicit legacy opt-in.

## Important scope constraints
- Do not overengineer scaling work before v1 usage justifies it.
- Do not force a brand-asset rebuild if the current PNG wordmark is working well.
- Keep the implementation easy to debug across frontend, backend, storage, and vendor integrations.

## Environment notes
- `SERPAPI_API_KEY` should live in the root `.env`.
- `OPENAI_API_KEY` should live in the root `.env`.
- `OPENAI_MODEL` can optionally override the default model.
- Supabase can be enabled with `SUPABASE_URL=...` and `SUPABASE_SECRET_KEY=...`.
- The backend also accepts the legacy `SUPABASE_SERVICE_ROLE_KEY=...` if needed.
- `SEARCH_CACHE_TTL_MINUTES` controls cache TTL and currently defaults to `360` if omitted.
- For early tester phases, a longer TTL like 24 hours is a reasonable option if stale data is acceptable.
- The `.env` file is ignored by git.
- This project is being worked in PowerShell on Windows.

## Recommended next task
- Continue polishing the default `open` homepage, then verify the current deployed search/cache flow end to end and keep tightening result quality, cache behavior, and abuse protection based on real tester feedback.
