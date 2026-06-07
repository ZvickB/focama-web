# Current Status

## Purpose
- Short snapshot of what is true right now.
- Use `project-notes/app_flow.md` for the full implemented flow.
- Use `project-notes/handoff.md` for remaining work and open product decisions.

## Current product state
- The app is Vite + React + React Router + TanStack Query + Tailwind + Vitest.
- The homepage at `/` uses the `open` layout: single-column, search-first, calm, and mobile-first.
- The homepage now ships in the plain white visual mode by default; the temporary homepage background toggle is no longer part of the active UI.
- Homepage first load is now split: `HomePage` boots a lightweight `HomeShell`, warms the heavier guided search experience during idle time, and only swaps into that guided experience after the user starts a search.
- Basic SEO plumbing is now in place: route-level metadata, canonicals, OG/Twitter tags, sitemap, robots, and manifest.
- The homepage now preconnects Google Fonts in `index.html`, preconnects the configured backend origin from `VITE_BACKEND_URL`, gives the hero wordmark higher fetch priority, and prefetches the results plus modal chunks immediately after `HomeExperience` mounts.
- A local-only internal analytics dashboard now lives at `/admin/analytics` during development and reads a backend funnel summary instead of querying Supabase directly from the browser.
- The current user path is: search -> collapsed search summary -> active refine panel -> collapsed refine summary/focused ranked shortlist with a desktop selected-product preview -> modal details -> Amazon/source clickout.
- The modal detail view now acts more like a decision aid: `At a glance` facts, `Why this pick`, `Worth knowing`, product notes, then one compact bottom source-specific CTA/disclosure area.
- The new web UI slices now share a quieter visual system: mostly white/cream surfaces, lighter shadows, fewer decorative gradients, consistent rounded corners, teal actions, and orange only for the shopping clickout CTA.
- A tester-only feedback FAB now opens a lightweight sheet for quick product feedback, optional free text, and optional follow-up email.
- Shortlists are always 6 items.
- The PNG wordmark is the active wordmark.
- A boot splash still lives in `index.html` and fades after React is ready.

## Current search flow
- The homepage starts with a normal product query, not a long form.
- The main product query field is now a compact 2-line textarea so longer natural-language searches and AI retry suggestions stay visible without changing the top form layout mid-flow.
- The existing splash timing is unchanged; the homepage cleanup work reduced boot-path coupling underneath it instead of changing the splash itself.
- Discovery and the AI follow-up question run in parallel after submit.
- After search starts, the large search stage collapses into a compact progress line plus summary receipt, and the refine step becomes the active panel.
- The refine panel now follows the mobile pattern: a clear `What should Focamai keep in mind?` heading, the AI follow-up question, up to 3 refinement chips, and a natural-language notes box. Backend chips replace fallback chips when available; label chips append to notes, while prompt-backed chips fill the notes box.
- A one-time inline marketplace prompt now appears after search starts until the user chooses an Amazon store or dismisses it.
- `Show products now` reveals the preview set without finalize.
- `Show focused picks` runs guided finalize and scrolls directly to the results region. The results area now shows staged finalize progress copy while the shortlist is being locked. If the follow-up notes include hard eligibility constraints, including kosher/Jewish-use terms, dietary/allergy needs, safety/material exclusions, or compatibility language, the frontend refreshes Rainforest discovery once with the query plus notes before finalizing.
- Final results now render as a ranked shortlist instead of a marketplace-style grid. On desktop, the shortlist has a large selected-product panel on the left and an internally scrolling row list on the right; hover, focus, and the top visible row update the selected panel.
- Prime eligibility is now a structured Amazon result signal. Searches or follow-up notes that clearly ask for Prime delivery/eligibility narrow finalize to Prime-tagged candidates when available, and Prime-enabled picks show a quiet in-house `Prime` marker plus a modal delivery fact only when confirmed. Oxylabs product-detail enrichment can now upgrade a result to Prime when the search row underreports it.
- Result rows, selected-product panels, grid/card view, and modal headings now use normalized display titles so Amazon keyword stuffing does not dominate the UI. The raw title is preserved in product data and appears behind a quiet full-title disclosure in the modal when it differs.
- Result row/card and modal shopping clickout CTAs derive their visible label from the product source/store, so Amazon items can say `View on Amazon`/the active Amazon domain while future sources can name their own store.
- After final results appear, refinement collapses into a compact summary above the ranked shortlist.
- Enrichment hydrates in place: teal/orange breathing dots hold pending row/panel and modal reasoning slots, `fit_reason` and `caveat` fill the high reasoning area when available, and feature bullets/descriptions sit lower as product notes.
- Retry is currently suggestion-led: the user opens a clearer correction panel, can tap one of three broad quick prompts, explains what felt off, and `/api/search/retry-advice` proposes a better next query.
- Retry suggestions now stay in the retry/results area as an immediately editable `Next search` field; `Search again` starts a new guided search from there with a one-request discovery cache refresh instead of silently moving the query into the top search box.
- Retry advice now tells AI to preserve accumulated must-have constraints from the original query, follow-up notes, and feedback by default, while still allowing the latest feedback to replace or remove a constraint when the user clearly changes direction.

## Current backend/deployment reality
- Frontend is deployed on Vercel.
- Backend is deployed on Render through `backend/express-server.js`.
- The Render backend also mounts the separate KAILA API under `/kaila` so KAILA can share the paid Focamai web service without replacing Focamai routes. Current KAILA endpoints are `GET /kaila/health`, `POST /kaila/ask`, and `POST /kaila/ask/stream`; the ask routes resolve the public store ref, retrieve product-scoped passages, and return grounded answer payloads with citations. `/kaila/ask/stream` sends status-only SSE progress before the final `done` payload, without streaming answer tokens before validation. KAILA OpenAI usage stays gated behind `KAILA_OPENAI_API_KEY` and `KAILA_RESPONSE_MODEL`.
- Render CORS now explicitly accepts the current `focamai.com` and `www.focamai.com` frontend origins, while still tolerating the older `focama.vercel.app` origin during transition.
- `GET /api/search/rainforest-discover` is the primary homepage discovery route. It uses Rainforest API first for all Amazon marketplaces when configured.
- Oxylabs is now the discovery fallback only: it runs when Rainforest errors or returns too few usable items to support the 6-item shortlist. If Rainforest is not configured, Oxylabs remains the emergency provider when credentials are available.
- `GET /api/search/rainforest-discover` normally reuses the shared discovery cache when available, but retry-accepted searches and hard-constraint pre-finalize refreshes send `cacheMode=refresh` so the route bypasses the cache hit once, fetches fresh provider evidence, and writes the new shared/session snapshots normally.
- Discovery now also bypasses cached snapshots that are too thin to support the 6-item shortlist, preventing a bad one-result cache entry from trapping common searches such as `thermos`.
- `GET /api/search/rainforest-discover` now starts a background query-quality review after the normal discovery response when OpenAI is configured, and stores the review state under `selection.queryQuality` on the token-scoped session snapshot.
- `GET /api/search/query-quality` exposes the stored query-quality review through simple polling. The homepage uses it to show an optional suggested-query prompt only when the backend review says to suggest one.
- `GET /api/search/refine` now uses OpenAI mini first to generate the short follow-up question and refinement chips, with Haiku as the fallback when OpenAI is unavailable or not configured.
- `POST /api/search/finalize`, `GET /api/search/enrichment-stream`, `GET /api/search/enrichment`, `GET /api/search/query-quality`, `GET /api/search/product-details`, and `POST /api/search/retry-advice` are all active in the Render app.
- `GET /api/analytics/dashboard` is a localhost-only development endpoint for the internal analytics page and returns `404` in production.
- `GET /api/geo` intentionally stays on Vercel so the frontend can resolve the user’s country from Vercel headers and send an explicit Amazon domain on guided requests when the store picker is left on `Auto`.
- The Amazon marketplace context now remembers the last saved marketplace in localStorage (`focamai_marketplace`) so repeat visits skip geo lookup when a preference or confident detection already exists.
- If the effective marketplace changes while a search is in flight or already active, discovery/refine restart for the current submitted query and stale older responses are ignored.
- Discovery cache and operational history use Supabase when configured, with local file fallback in development.
- Rainforest discovery cache reuse is now scoped under `rainforest_discovery:v2`, which intentionally leaves older shared discovery entries behind so stale provider-era evidence is not treated as current.
- Product details use a separate provider-agnostic per-ASIN cache, also with Supabase preferred and local fallback available.
- Skipped-refinement preview modals now hydrate product detail bullets/description one product at a time from that cache or Oxylabs when opened, without showing AI analysis loading dots because finalize/enrichment has not run.
- Tester feedback stores to a dedicated `tester_feedback` table in Supabase when configured, with local fallback in development.
- Backend production observability is now wired for opt-in Sentry via `SENTRY_DSN`, with sanitized context and explicit reporting for background async failures plus unhandled server errors.
- Rate limiting now uses a Supabase-backed `rate_limit_events` event log when Supabase is configured, with process-local memory fallback for local/test or table outages.
- Marketplace listings without a known positive price are now treated as invalid inventory and filtered out deterministically before discovery preview, cached candidate reuse, or finalize/AI selection.
- Query-quality review now has a polling-based frontend MVP: original results/refinement stay active, a small inline prompt can suggest a better query, accepting it starts a normal new guided search, and rejecting it keeps the original results. There is still no query-quality SSE or prewarm path.

## Current finalize reality
- Finalize rebuilds the candidate pool from guided discovery cache instead of trusting a browser-posted rich pool.
- Hard-constraint follow-up notes are treated as discovery-changing context before finalize: the frontend detects broad kosher/Jewish-use, dietary/allergy, safety/material, and compatibility/exclusion terms, refreshes discovery at most once for the active search, then sends finalize the refreshed token and the same combined query used for that refreshed discovery.
- Discovery cache is now split from session state: repeated same-query searches reuse the shared candidate pool, but each run gets its own token-scoped session snapshot for finalize/enrichment.
- Haiku locks the shortlist first. Its candidate summary passes `amazonPosition` (raw Amazon search position) instead of an app-derived rank, plus `trustScore` as an internal marketplace-confidence tiebreaker. The prompt tells Haiku to infer product fit first, then use quality confidence (rating, review count, trustScore, and recognized category brand), price/value, useful shortlist variety, and Amazon position in that order.
- The candidate summary also includes structured `isPrime` eligibility so Prime can act as a user-context eligibility signal without introducing a marketplace filter UI.
- Partial valid Haiku output is treated as recoverable: the backend tops it up from deterministic fallback and returns `selection.strategy: 'haiku_lock_topped_up'`.
- The current detail helper for shortlisted ASINs is still `fetchOxylabsProductDetailsByAsin`, so discovery can use Rainforest while modal bullets/descriptions still come from Oxylabs.
- Product details are cached per ASIN before mini enrichment runs, using the final displayed shortlist IDs. Positive Prime eligibility from those details is preserved through enrichment and can hydrate the displayed result after the first shortlist response.
- Failed shortlisted detail calls now retry once in the background after the fast first pass, so mini enrichment can proceed with partial detail coverage while later cache quality still improves.
- If that background retry later finds bullets, the active stored enrichment payload is patched and the modal can hydrate those bullets without a fresh finalize run.
- Mini enrichment writes `fit_reason` and `caveat` back into the token-scoped session snapshot for the exact active `discoveryToken`, then the frontend hydrates the modal via SSE first and polling fallback second. The prompt treats the first locked product as the hero recommendation and frames later products as alternatives with distinct tradeoffs.
- AI prompts have been sharpened to weight user context more heavily when selecting and explaining picks.

## Active constraints
- Keep the guided flow as the main product path.
- Keep shortlist count at 6 unless the user explicitly changes it.
- Focamai should not feel like an Amazon clone or marketplace wall. Its product identity is the focused decision aid, not Amazon's browsing experience.
- Amazon is the current primary commerce path and affiliate target. When the active source is Amazon, frontend copy, buttons, labels, and detail UI may say Amazon directly where it improves clarity, trust, or conversion.
- Do not force generic `retailer` language in user-facing UI when `Amazon` is more accurate for the current experience.
- Do not introduce new Amazon/source/retailer labels, facts, or badges as side effects of unrelated features. Existing clickout wording should stay source-derived unless the user explicitly asks to revisit it.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible so another source can be added or swapped later.
- Do not let future multi-retailer flexibility make today's Amazon-first UX vague. If more retailers become active, revisit frontend labels based on the real source mix.
- Keep `search_history` as internal telemetry, not user-facing saved history.
- Keep current behavior and future ideas clearly separated in notes.

## Recommended next checks
- Verify the browser golden path on the live app: fast cards first, modal AI copy later.
- Verify the browser golden path after the new route-loading fallback and chunk-load recovery copy.
- Improve weak-result and low-confidence handling.
- Watch the polling-based query-quality MVP on weak discovery pools caused by obvious misspellings or brand-query drift. Current known example: `celcius drink` should be able to offer `celsius drink` when the backend review is high-confidence, while meaning-bearing language such as `shabbos art` should stay quiet unless the returned pool is clearly mismatched.
- Do not add query-quality prewarm unless the MVP proves useful and the user explicitly chooses that next step.
- Watch whether the compact modal bottom CTA/disclosure feels clear without sounding defensive.
