# Assistant Start

## Purpose
- Compact startup context for Codex and other AI assistants.
- Read this after `AGENTS.md` at the start of a chat.
- Do not read every project note by default. Open deeper notes only when the task needs them.

## Product summary
Focamai helps a user name the product they want, answer one short follow-up, and get a focused shortlist of 6 picks before leaving to shop. The refinement step shows four direct single-select answers plus a separate optional notes box; it can replace the visible prompt and answer set once with a pre-generated alternative while preserving freeform notes. The product should feel calm, practical, and focused instead of like a prettier Amazon wall.

## Current branch context
- Active branch for the current experiment: `new_web_ui`.
- The branch is intended for a new web UI direction inspired by the stronger mobile app.
- The goal is not to port mobile wholesale. Web should stay optimized for desktop and responsive browser use.
- The web UI improvement plan lives at `project-notes/plans/ui_improvement_plan/README.md`.

## Current app reality
- Frontend: Vite, React, React Router, TanStack Query, Tailwind, Vitest.
- Backend: Node/Express on Render.
- Frontend deploy: Vercel.
- Backend deploy: Render, starting from `backend/express-server.js`.
- The frontend calls the Render backend directly through `VITE_BACKEND_URL` (falling back to the active Render origin if that build-time variable is missing), then retries browser-level network failures through same-origin Vercel rewrites and remembers the healthy route.
- `api/geo.js` intentionally stays on Vercel so the UI can use Vercel geolocation headers.
- KAILA has been removed from this repo and Render service; Focamai no longer mounts `/kaila`.

## Current product direction
- The homepage at `/` is the main product experience.
- Current active web homepage uses the `open` layout.
- Product shortlists normally target 6 items. During the current tester rollout, a first finalize with fewer than 4 AI-identified strong fits returns only those credible picks and offers a more specific AI-proposed search instead of padding to six.
- The PNG wordmark is the active wordmark.
- Focamai should not feel like an Amazon clone or marketplace wall. Its product identity is the focused decision aid, not Amazon's browsing experience.
- Amazon is the current primary commerce path and affiliate target. When the active source is Amazon, frontend copy, buttons, labels, and detail UI may say Amazon directly where it improves clarity, trust, or conversion.
- US and Canada remain separately Associates-tagged. The US Store ID is enrolled in OneLink for UK, France, Germany, Italy, Netherlands, Poland, Spain, and Sweden; Canada is deliberately not in OneLink. Amazon currently shows a usable tracking ID and Close Match preference for the UK only, so UK valid-ASIN clickouts use US-tagged OneLink URLs while all other selected marketplaces still use local untagged URLs until payment/tax setup is completed and Amazon exposes their tracking IDs. Australia, Japan, India, Mexico, and Brazil remain local, untagged clickouts.
- Deep Dive and Price Watch remain US/CA-shaped and are intentionally not adapted for the untagged marketplaces (user is not using them right now).
- Do not force generic `retailer` language in user-facing UI when `Amazon` is more accurate for the current experience.
- Existing shopping clickout CTAs should derive their visible label from the product source/store: Amazon items can say `View on Amazon` or the active Amazon domain, and future non-Amazon sources can say `View on Walmart`, `View on AliExpress`, etc.
- Do not add new Amazon/source/retailer fields or badges as incidental work. Any new result-card or modal source labeling beyond the existing source-derived clickout CTA should be an explicit product/UI decision from the user, not bundled into unrelated search or data changes.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible so another source can be added or swapped later.
- Do not let future multi-retailer flexibility make today's Amazon-first UX vague. If more retailers become active, revisit frontend labels based on the real source mix.
- `search_history` is internal telemetry/cache visibility, not a user-facing saved-history feature.
- User-facing search history lives at `/history`; finalized searches auto-save locally when signed out and to Supabase `saved_searches` when signed in. Entries can be expanded, deleted, cleared, or re-run.
- Frontend auth shell is implemented: `AuthProvider`, `useAuth`, lazy Supabase browser client, `AuthModal`, header sign-in/sign-out UI, visible Google and Apple OAuth, account Preferences UI for shortlist ranking priority, and Supabase forgot-password email plus recovery-callback password update. Apple must be enabled and configured in Apple Developer and Supabase as documented in `project-notes/apple-sign-in-setup.md`. Search remains ungated. Signed-out history uses localStorage; signed-in history uses Supabase `saved_searches`; local entries migrate into the account on login. Live QA of Google/Apple OAuth return behavior, recovery email/link behavior, `user_preferences` RLS, and auth/RLS/history persistence is still pending.
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
- User-triggered finalized-product price comparison ("Compare prices"; internally the Deep Dive path): `POST /api/product/deep-dive` when `DEEP_DIVE_ENABLED=true` and the user is signed in.
- Retry advice: `POST /api/search/retry-advice`.
- Feedback: `POST /api/feedback`.
- Search diagnostics: `POST /api/search/diagnostics/event`, `GET /api/health`, `GET /api/diagnostics/connectivity`.

## Important behavior notes
- Discovery uses Rainforest API for active Amazon discovery. Oxylabs has been archived and is not an active fallback.
- Finalize rebuilds the candidate pool server-side from guided cache. Guided discovery and finalize cap that pool at 30 candidates, deliberately raised from 20 on 2026-05-01 so Haiku can consider more of Rainforest's typical result set without a meaningful latency increase.
- Haiku locks the shortlist first through short candidate indices and a strict Anthropic tool schema, then the backend maps indices to server-owned candidate IDs; validation and deterministic fallback/top-up remain in place. During the current tester rollout, if the first finalize returns fewer than 4 strong Haiku fits plus a valid distinct suggested query, the backend deliberately skips fallback padding, returns only those picks, and offers the suggested search in the results UI. Shown, accepted, and kept-partial-picks outcomes are stored as search analytics events. Balanced ranking keeps the original order: inferred product fit, quality confidence (rating, review count, trustScore, and recognized category brand), price/value, shortlist variety, then raw Amazon position. The account-ranking experiment can send `rankingPreference: balanced | price | lowest_price | brand | range`; backend enum validation defaults unknown/missing values to balanced. Preferences shape which six picks are selected: `price` keeps the strongest contextual fit then favors lower-priced credible alternatives; `lowest_price` sends a dedicated fit-only filter prompt, retains every match it returns, then deterministically selects the six lowest-priced matches; brand fills credible known brands before fitting non-brand alternatives; and range seeks both price and feature/style differences. Luna enrichment receives the effective preference.
- Cosmetic variants of the same identified product model are removed before Haiku and after its ordered shortlist; unique Haiku picks retain their order and deterministic replacements append at the end. Haiku returns a strict binary specific-brand decision and a per-pick brand label. When false, final composition deterministically favors no more than two distinct models per resolved brand where credible alternatives exist, then relaxes that preference rather than leave slots empty. Provider `brandName` wins; Haiku's label covers selected products when Rainforest leaves it blank. A clear named-brand query overrides an incorrect false decision; different models, generations, capacities, widths, and major feature tiers stay distinct.
- Exact provider-evidenced brands/models are hard constraints. A one-character brand spelling near-match paired with matching product-title evidence instead shows an optional corrected search and never alters the original candidate pool, preview, or shortlist; this avoids silently replacing a potentially correct uncommon term.
- Provider-confirmed Prime eligibility is preserved as structured `isPrime` data; clear Prime delivery/eligibility requests narrow finalize to Prime-tagged candidates when available, and the UI shows only a quiet in-house Prime marker/fact. Plain free-delivery text may show as `Free delivery` but must not be upgraded to Prime. Rainforest product-detail enrichment can preserve provider-confirmed Prime and delivery details when available.
- Result surfaces should stay compact: source/store names belong in clickout CTAs, rating plus review count are one ratings/reviews signal, and delivery is at most one optional signal.
- Hard-constraint follow-up notes can trigger one refreshed discovery before finalize.
- Refine generates a primary and distinct alternate question together, each with four matching direct answers including a neutral choice. The UI shows one pair at a time; `Get a different question` swaps both after a 900 ms breathing-dot transition without clearing the separate optional notes box. The selected answer and notes are combined only when finalizing.
- Query-quality suggestions are polling-based only. No SSE or prewarm path exists.
- Luna modal/detail enrichment hydrates after the first shortlist cards are shown, framing the top pick as the hero recommendation and later picks as alternatives. It defaults to the trusted-shopping-editor role and grounds material claims in supplied listing fields; `OPENAI_FINALIZE_MODEL` is the explicit override.
- Skipped-refinement preview products do not show AI recommendation analysis. When opened, the modal can lazily hydrate product detail bullets/description from the per-ASIN cache or Rainforest through `GET /api/search/product-details`.
- Finalized product modals have a feature-flagged, user-triggered "Compare prices" panel (internally still named Deep Dive: route `POST /api/product/deep-dive`, `DEEP_DIVE_*` env flags, `deepDive*` code names). It is price comparison only — no review synthesis, critic ratings, top insights, or star distribution. The panel remains account-gated and uses SerpApi Shopping -> Immersive Product only after click. Exact product matches may show lower store offers only when they beat the known Amazon/source price, or a positive "No lower price found" state. When an exact match cannot be confirmed (or has no lower offer), `SIMILAR_OPTIONS_ENABLED=true` may instead show clearly labelled Google Shopping options of the same general product kind, including their main difference. These are never presented as the exact item, a price match, or a saving; obvious accessories, parts, books, and condition-only listings are excluded. Keep the existing Amazon/source CTA unchanged. Do not add automatic background price surfacing, shortlist badges, or review content for this path.
- Marketplace listings without a known positive price are filtered out before preview/finalize.
- Thin discovery cache hits with fewer than 6 cached results or candidates are bypassed and refreshed from the provider.
- Supabase is no longer awaited for general rate limiting or token-session persistence before discovery previews render. Request limiting is process-local by default; paid Rainforest misses have a separate local start/concurrency guard. Cache-read timeouts become provider misses, sensitive-image verdict timeouts stay hidden, and cache/history/session writes are nonblocking. A newly issued timestamped token lets unusually fast finalize requests poll shared session readiness for up to 2.5 seconds without trusting browser candidate data. Redis/Render Key Value was explicitly declined for this implementation; the prior proposal remains documented in `project-notes/plans/search-storage-resilience.md` as inactive history.
- Finalize still awaits its token-scoped selected-shortlist snapshot for trust/readiness. As of 2026-08-31, that write is measured separately as `persistence` in logs, debug output, and `Server-Timing`, and true `total` includes it. Initial configured-Supabase measurements were normally 0.2-0.3 seconds with one 1.69-second tail; collect production p50/p95 before deciding whether to make it pending/nonblocking.
- `/api/search/live` and debug/cache routes are not the main user path.
- `/admin/analytics` is local-only during development.
- `/admin/analytics` includes a Search reliability section when Supabase `search_attempts` and `search_events` exist; it shows failed support codes, Rainforest timeout/error/empty-result patterns, backend reachability, filter/VPN reports, platform, and marketplace grouping. Its Brand variety section aggregates only finalize counts/flags (cap deferrals/relaxations, highest resolved-brand count, and provider/Haiku/missing label counts); it stores no brand names.
- Guided search failures hide raw provider errors behind calm recovery copy. `Try again` preserves the query and follow-up notes, records the retry on the failed support/search ID, and starts fresh discovery with cache refresh and a new search ID; support details and reporting controls stay collapsed. Post-shortlist refinement is separate: `Update my picks` sends the user correction to retry advice, automatically starts the safe suggested search, and auto-finalizes it without another follow-up question. Set `VITE_AUTO_FINALIZE_RETRY_SEARCH=false` only to restore the former web-only follow-up step.
- Guided discovery/finalize Render logs and Sentry contexts include the frontend support/search ID. Diagnostic POST storage failure returns `503` and is visible as a browser warning in development instead of being silently reported as successful. Background query-quality timeouts are Sentry warnings because they do not block the search response.
- Regex query moderation remains the synchronous floor. Regex-allowed discovery/refine requests also use the free OpenAI moderation endpoint for `sexual` and `sexual/minors`, with parallel normal execution, a 2-second fail-open timeout, in-flight deduplication, and a process-local one-hour IP penalty window that forces moderation before later work.
- Sensitive-product images are hidden deterministically unless a current cached Sightengine `show` explicitly restores them. The `SENSITIVE_IMAGE_SHADOW_ENABLED` hook checks `sensitive_image_verdicts` before billing Sightengine, stores only successful versioned `show`/`hide` decisions, and leaves failures retryable. `SENSITIVE_IMAGE_REVEAL_ENABLED=true` is approved for the current tester-only production rollout; missing, failed, stale, ambiguous, and `hide` cases still fail closed. Cached products retain only the URL hash, while the original URL stays server-side in the verdict table. Set the reveal flag back to `false` if a dangerous false reveal appears. TensorFlow.js remains only in the local evaluation harness.

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
- Ranking preference enum/store: `shared/ranking-preference.js`, `src/lib/preferences/rankingPreferenceStore.js`
- Amazon store context: `src/contexts/AmazonStoreContext.jsx`
- Backend route handlers: `backend/server.js`
- Render backend entry: `backend/express-server.js`
- Search storage/cache helpers: `backend/lib/search-storage.js`
- Search diagnostics helper/storage: `src/lib/searchDiagnostics.js`, `backend/lib/storage/search-diagnostics-storage.js`

## Read deeper only when relevant
- Current implemented behavior: `project-notes/app_flow.md`
- Search/backend flow details: `project-notes/search-flow.md`
- New web UI plan: `project-notes/plans/ui_improvement_plan/README.md`
- Durable backlog/open questions: `project-notes/handoff.md`
- Product intent and broad decisions: `project-notes/doc_briefs.md`
- Supabase/storage table summary: `project-notes/db-needs.md`
- Short current snapshot/changelog: `project-notes/current-status.md`
- Price Watch plan and decisions: `project-notes/plans/price-watch-plan.md`
- Feature/implementation plan docs live in `project-notes/plans/` — put new plans there.

## Working guardrails
- Code is current reality if notes and code disagree.
- Treat implemented behavior and planned ideas as different things.
- If active notes are stale and the task changes the relevant area, update the notes.
- Keep changes scoped and clean up superseded UI/code/notes when safe.
- Do not overengineer scaling or abstraction before the product needs it.
- When backend changes are non-trivial, explain request flow, data shape, tradeoffs, and what could break in practical terms.

## Notes update rules
- After meaningful backend or product-flow changes, update `app_flow.md`, `current-status.md`, and this file if future chats would otherwise be misled.
- After meaningful UI direction changes, update `plans/ui_improvement_plan/README.md` if the plan or priority changes.
- After finishing a meaningful chunk of work, update `handoff.md` if remaining work or priorities changed.
