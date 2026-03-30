# Current Status

## Purpose
- This file is the short project snapshot for future chats and handoffs.
- It should reflect the app as it exists now, not old exploration decisions.
- Keep it brief and update it when product direction or infrastructure changes in a meaningful way.

## Current state
- The frontend is built in Vite + React with React Router, TanStack Query, Tailwind, and Vitest.
- The default homepage at `/` now uses the `open` layout: spacious, search-first, single-column, and more mobile-friendly than the older split-screen layout.
- Older homepage experiments were removed after the open layout became the clear direction.
- The reset baseline is now back on `main`; the staged/persisted finalize experiment was archived separately and should not be treated as the active product path.
- Read `project-notes/finalize-strategy.md` before making more finalize or latency-architecture changes.
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
- The staged/persisted finalize experiment is not on `main`.
- Guided refine now asks AI for only one short ranking question.
- Guided refine helper text and textarea placeholder are now static server-side copy instead of extra AI output.
- Guided refine now uses minimal reasoning effort to reduce latency and token usage.
- Guided discovery, refine, and finalize now emit structured `[search-flow]` logs with route/mode, latency, token usage, candidate counts, and ranking ownership.
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
- Guided finalize prompt slimming now also removes top-level search-state/similar-query prompt text, drops backend-only match-signal and duplicate numeric-price fields from each candidate summary, flattens trust metadata to a single `trustScore`, and minifies the candidate JSON payload before sending it to OpenAI.
- The active one-shot finalize prompt has also now taken one more conservative wording trim:
  - removed the standalone `Prioritize:` heading
  - merged diversity and near-duplicate guidance into one line
  - removed the redundant allowed-badge-label prompt line because schema validation already constrains badge values
  - shortened the badge strategy wording while keeping the explicit `Best match` requirement
- Guided discovery filtering now also does one more conservative pre-AI cleanup pass:
  - clearly redundant same-family candidates can be collapsed before they reach finalize
  - the collapse only triggers when items share the same duplicate-family key and the same variant signature, plus the merchant matches or the prices are effectively the same
  - meaningful family differences such as waterproof vs non-waterproof should still survive into the AI pool
- The compact shard-scoring finalize experiment was measured and then rolled back after it regressed latency and token usage.
- Guided finalize is back on the slimmer one-shot selector while keeping the same guided product flow and finalize contract.
- Guided finalize step 1 is now implemented on top of that slimmer one-shot baseline:
  - finalized blocking results now keep one concise AI fit reason per pick
  - finalized drawbacks/cautions still exist in result data, but they are now modal-only instead of card-grid copy
  - badge reasons are no longer part of the blocking finalize contract
- Guided finalize step 2 is now implemented as non-blocking polish on top of that baseline:
  - homepage copy now makes the intended search flow clearer:
    - the first query should look more like the product search a user would type into Google
    - the refine step is framed as the place for natural-language narrowing such as budget, size, comfort, style, or use case
  - AI no longer assigns badge labels in the blocking finalize response
  - finalized result badges are now assigned on the frontend with deterministic heuristics after final results load
  - the badge reveal is intentionally delayed slightly so the shortlist appears first and the labels settle in just after
  - this badge polish does not widen the backend finalize contract or add another request
- The filtered candidate pool now carries provider-agnostic duplicate-family metadata, compact attribute tags, and trust signals before final AI selection so the backend is less tied to raw SerpApi wording.
- That candidate pool can now also collapse clearly redundant same-family same-variant listings before the AI handoff, while keeping more meaningful family variation available.
- Re-measured guided finalize on 2026-03-30 after removing AI badge-label assignment from the blocking finalize task:
  - cached same-query finalize average latency: about 7.5 s
  - cached same-query finalize average OpenAI time: about 7.0 s
  - cached same-query finalize average total tokens: about 2479
  - cached same-query full guided-search average total tokens: about 2651
  - compared with the prior cached measurement baseline, finalize improved by about 2.5 seconds on average and crossed the under-8-second finalize milestone the user was aiming for
- A fresh-discovery measurement was also run on the same day after the conservative family-collapse pass:
  - fresh finalize average latency was about 10.8 s
  - fresh finalize average total tokens were about 2617
  - that run exercised live discovery again, so it should not be treated as a clean apples-to-apples comparison with the cached finalize baseline
  - the strongest confirmed win from this session is the badge-scope reduction; the exact latency impact of the conservative family-collapse pass is still not isolated yet
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
- Keep AI in the product, but narrow its default critical-path role instead of expanding it.
- Preserve fit/caution explanation value and scan-friendly badges as core product behaviors.
- For v1, perceived speed is the primary UX goal:
  - showing a trustworthy shortlist sooner matters more than waiting for complete polish
- The intended v1 split is results first, polish later:
  - finalize should return the shortlist as soon as core selection is ready
  - badge/explanation polish should not be treated as required blocking work by default
- Do not change the guided product flow or widen finalize architecture without explicit user approval first.

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
- Use `project-notes/finalize-strategy.md` as the active strategy note before more finalize implementation work.
- Keep the current guided flow and current guardrails unless the user explicitly approves a change first.
- Keep the slimmer one-shot finalize selector as the active implementation baseline.
- Step 1 is now done:
  - lighter blocking finalize contract
  - one concise fit reason preserved
  - drawback/caution moved off the card grid and left in the modal
  - badge reasons removed from the blocking path
- Step 2 is now done:
  - search/refine messaging is clearer about how to start the search and where narrowing belongs
  - badge scanability is now fully frontend-owned after final results arrive, with a slight delayed reveal
  - the guided flow and blocking finalize contract remain unchanged
- Next work should stay outside this step-2 scope unless the user explicitly chooses another narrow pass.
- Treat the archived reset notes as historical measurement context, not as the current active plan.
