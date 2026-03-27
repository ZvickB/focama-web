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
  - uses Instrument Sans as the primary UI typeface instead of the older serif base
  - removes chips
  - expands into the AI refinement area after search
  - offers a `Start a new search` reset path once a search is in progress
  - lets the user retry a weak shortlist with feedback after final results
  - caps that retry loop at 2 guided follow-up retries
  - excludes the previously rejected shortlist from retry reselection
  - tucks rejected shortlists into a collapsed `Previous picks` section after a retry succeeds
  - scrolls more directly between search, refinement, and results states
  - scrolls to results immediately when final AI picks are requested and shows skeletons during finalization
  - keeps preview results visible during final AI narrowing when they are already on screen, with a calmer status message instead of dropping straight back to a blank loading state
  - keeps skeletons visible but lower-priority
  - shows products in a 2x3 skeleton layout
- Product shortlists are now 6 items end to end, not 4.
- A true boot splash now starts in `index.html` so throttled/slow loads show branding before React finishes loading.
- The splash still shows the PNG wordmark plus `Focused shopping`, and it now fades only after the app is ready and the splash has been visible for about 1 second total.
- That boot splash now includes a static header shell so the hero aligns more closely with the real homepage during the fade.
- The site header uses a sharper small-size logo asset, and logo/favicon colors were adjusted to better match the current wordmark palette.

## Search and backend state
- The homepage now uses a guided search flow:
  - `/api/search/discover` gathers and filters the candidate pool
  - `/api/search/refine` generates the lightweight AI follow-up prompt
  - `/api/search/finalize` selects the final shortlist from the cleaned candidate pool
- This guided flow is the primary backend path for the product.
- `/api/search/live` is the explicit combined-path endpoint for backend/debug/manual use.
- The live search flow currently:
  - validates input
  - queries SerpApi
  - filters/cleans a candidate pool
  - uses AI to generate the refinement prompt and/or select the final shortlist
  - includes tradeoffs/drawbacks in result data
- Guided discovery cache is now the only persistent search cache scope used by the product/backend flow.
- Guided `/api/search/discover` now returns a `discoveryToken`, and guided `/api/search/finalize` reconstructs the rich candidate pool from guided discovery cache instead of relying on a browser-posted pool.
- Guided `/api/search/finalize` still does not reuse cached final result sets; it rebuilds the candidate context from guided discovery cache and reruns AI selection per request.
- Cache keys now normalize query casing, whitespace, and obvious plural product terms more conservatively so closely matched searches such as singular/plural product names can reuse discovery cache more often without changing freeform detail wording.
- Search cache and operational search-history logging can use Supabase when configured.
- Supabase-backed guided discovery cache is now confirmed working in production on `focama.vercel.app`.
- Local file-based cache remains as a development/fallback path.
- Shared rate limiting now uses Supabase when configured, with in-memory fallback only for local/degraded environments.
- Backend env fallback loading now caches the parsed root `.env` snapshot in-process instead of rereading it on each `getEnv()` call.
- `project-notes/db-needs.md` now captures the plain-language summary of the current required Supabase tables: `search_cache`, `search_history`, and `rate_limit_events`.
- An optional funnel analytics path now exists for measuring guided-search behavior and retailer clicks:
  - `POST /api/analytics/track`
  - optional Supabase tables: `analytics_search_runs`, `analytics_search_events`, `analytics_result_impressions`, `analytics_result_clicks`
- The homepage now emits best-effort analytics for:
  - search start
  - discovery loaded
  - refinement viewed
  - `Show products now` clicked
  - AI follow-up submitted
  - final results shown
  - result impressions
  - result card opens
  - retailer click-throughs
- Result impression/click analytics now distinguish preview, final, retry, and previous-result sets so ranking/badge behavior can be compared by flow stage.
- Basic IP-based rate limiting exists on the search handlers, and now prefers the shared Supabase-backed limiter path when available.
- The Vercel API wrappers now forward request headers into the backend handlers so production rate limiting can use forwarded client IP headers.
- The Vercel route wrappers now share a small bridge helper so the dual-runtime path stays thinner, but the backend still uses a transitional Node-shaped handler contract across local server and Vercel routes.
- Guided `/api/search/finalize` now enforces explicit abuse guardrails:
  - request body limit: 32 KB
  - candidate pool limit: 20 candidates
  - priorities limit: 8 items, 80 characters each
  - follow-up notes limit: 500 characters before OpenAI selection
- Guided finalize now depends on guided discovery cache as the server-side source of truth for the candidate pool, so the browser only sends lightweight finalize context.
- Guided search responses now include backend timing via `Server-Timing` headers, and the homepage shows the timing panel in development or when `?timing=1` is present so discover/refine/finalize latency can be inspected by leg.
- Guided refine/finalize and live-search responses now surface OpenAI token usage metadata in JSON so current refine/finalize cost can be measured from real traffic instead of guessed from prompt length.
- Guided `/api/search/discover` now returns the preview response before the discovery-cache write finishes, so first-hit latency is no longer blocked by Supabase cache persistence.
- Guided finalize now sends a slightly slimmer AI candidate summary by dropping variant tokens and collapsing trust metadata to a compact score-only signal, while keeping reasons and attributes in the selection prompt.
- Candidate/result normalization now ignores promo-only description text, and the finalize AI handoff drops empty/generic filler descriptions plus redundant source/price/delivery boilerplate so the prompt stays tighter without changing the shortlist flow.
- The filtered candidate pool now carries provider-agnostic duplicate-family metadata, compact attribute tags, and trust signals before final AI selection so the backend is less tied to raw SerpApi wording.
- Search history records cache status best-effort, including guided cache hits/misses and uncached live-route runs, and guided discovery telemetry now uses the scoped discovery cache key.
- `search_history` is treated as internal operational telemetry for debugging and cache analysis, not as a user-facing saved-search feature.
- `/api/search/debug` now reports the guided flow as primary, shows guided discovery cache status, and keeps `/api/search/live` clearly marked as the uncached manual combined route.
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
8. Store cache/operational history in Supabase when configured, with local fallback for development.
9. Keep the explicit `/api/search/live` combined route available only for debug/manual use while guided discovery remains the only persistent cache path and finalize reconstructs from that cache server-side.

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
- `SEARCH_CACHE_TTL_MINUTES` controls cache TTL and currently defaults to `1440` if omitted.
- For early tester phases, a 24-hour TTL is the default and is reasonable while traffic is still low.
- The `.env` file is ignored by git.
- This project is being worked in PowerShell on Windows.

## Recommended next task
- Continue polishing the default `open` homepage, then keep tightening result quality, cache behavior, and abuse protection based on real tester feedback from the current deployed flow.
- When backend cleanup resumes, prioritize a shared/global rate limiter first, then keep shrinking `backend/server.js`, and leave runtime-agnostic service extraction for the Vercel bridge as the later cleanup step.
