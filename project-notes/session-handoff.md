# Session Handoff

## Purpose
- Slightly fuller reset for a fresh Codex chat.
- Use `project-notes/assistant-start.md` for the normal compact startup.
- Do not read every project note by default.

## Startup read order
1. `AGENTS.md`
2. `project-notes/assistant-start.md`
3. Open deeper notes only as needed for the task:
   - implemented app behavior: `project-notes/app_flow.md`
   - search/backend flow: `project-notes/search-flow.md`
   - new web UI plan: `project-notes/plans/ui_improvement_plan/README.md`
   - backlog/open questions: `project-notes/handoff.md`
   - product intent: `project-notes/doc_briefs.md`
   - storage tables: `project-notes/db-needs.md`
   - current snapshot/changelog: `project-notes/current-status.md`

## Current direction

**Mobile Improve Picks diagnostics (2026-08-02):** The mobile client reports one aggregate enrichment/chip-delivery outcome per finalized search and passes its existing anonymous search ID to finalization. Use the outcome plus correlated `mini_enrichment_*` Render logs to distinguish no generated chips, polling timeout, and polling failure. The event intentionally excludes query and all free-form/user/product data.
- **Tester shortlist recovery (2026-07-16):** Web and mobile now honor a bounded first-finalize escape hatch: if Haiku finds fewer than four genuinely strong fits and supplies a distinct valid query, show only those credible picks with a read-only recovery card rather than pad to six. Accepting starts refresh discovery while preserving follow-up notes; keeping dismisses the card. Mobile persists the card in its one-hour flow snapshot and uses the existing read-only updating interstitial. Mobile analytics emits aggregate shown/accepted/kept events (count and query length only); the web development dashboard summarizes them. Normal shortlists still target six.
- The 2026-07-02 privacy/account-deletion work updated the canonical `/privacy` page and mobile Privacy screen and implemented authenticated `DELETE /api/account`, mobile Settings → Account deletion, and the public `/delete-account` route. The endpoint deletes only the bearer-token-verified Supabase Auth user and relies on documented cascades for `saved_searches`, `price_watches`, and `deep_dive_usage`; anonymous operational records without a user ID remain. See `account-deletion-audit.md`. Live Supabase constraint/Render/device verification is still pending.
- The current experiment branch is `new_web_ui`.
- The branch is for borrowing the strongest UI/UX lessons from the mobile app while keeping web optimized for browser and desktop use.
- The current web homepage at `/` still uses the `open` layout until changed.
- The product should stay calm, focused, mobile-first/responsive, and not marketplace-shaped.
- Focamai should not feel like an Amazon clone or marketplace wall. Amazon is the current primary commerce path and affiliate target, so frontend copy and UI may say Amazon directly when the active source is Amazon and doing so improves clarity, trust, or conversion.
- Amazon marketplace choices include separately tagged US/Canada, a verified US OneLink UK path, plus direct untagged Germany, France, Italy, Spain, Netherlands, Poland, Sweden, Australia, Japan, India, Mexico, and Brazil. UK valid-ASIN clickouts route through a US-tagged product URL for Amazon Close Match redirect and attribution; Canada is deliberately separate. Amazon enrolled the other seven European stores but does not yet display tracking IDs for them—complete owner payment/tax setup, then verify those IDs and add the domains to `ONELINK_AMAZON_DOMAINS`.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible, but do not let future multi-retailer flexibility make today's Amazon-first UX vague.
- Existing shopping clickout CTAs should use source-derived wording: Amazon items can say `View on Amazon` or the active Amazon domain, while future non-Amazon sources can say `View on Walmart`, `View on AliExpress`, etc.
- Product shortlists normally target 6 items. During the current tester rollout, first finalizes with fewer than four Haiku-identified strong fits can return only those credible picks when Haiku also supplies a valid distinct refined query. The results UI offers that query as a fresh search while preserving follow-up notes; shown, accepted, and kept-partial outcomes are logged as search analytics events. Do not treat this as the permanent six-pick rule until the tester data is reviewed.
- Deterministic content moderation hides sensitive-product images unless a current explicit Sightengine `show` restores them. `SENSITIVE_IMAGE_SHADOW_ENABLED=true` checks and populates the versioned `sensitive_image_verdicts` table; only successful decisions persist, while failures remain retryable and fail closed. Cached products retain only an image URL hash. `SENSITIVE_IMAGE_REVEAL_ENABLED=true` is approved for the current tester-only production rollout in `render.yaml`; disable it immediately if a dangerous false reveal appears. TensorFlow.js remains local-evaluation-only.
- Query moderation now keeps the deterministic regex floor and adds `omni-moderation-latest` for only `sexual` and `sexual/minors`. It runs alongside normal discovery/refine work, fails open after `OPENAI_MODERATION_TIMEOUT_MS` (default 2000 ms), gates all result persistence/reveal, deduplicates matching in-flight checks, and uses a process-local one-hour IP penalty box to force moderation before work after a blocked verdict.
- The guided backend path is the real product path.
- `/api/search/live` remains a manual/debug combined route, not the normal user flow.
- The PNG wordmark is the active wordmark.
- The web UI improvement plan lives at `project-notes/plans/ui_improvement_plan/README.md`.
- Priority 1 of that plan is now implemented in a simpler form: final/preview results render as ranked rows, without a side preview.
- Priority 2 is now implemented in the first pass: the large search stage collapses into compact progress plus a summary after submit, refinement gets its own active panel, and finalized refinement collapses above the ranked results.
- Priority 3 now uses the shorter local refinement experiment: `One quick question`, four direct single-select answers including a neutral choice, and a separate optional notes box. Refine returns a distinct pre-generated alternate with its own matching answers; `Get a different question` swaps both after a 900 ms breathing transition without clearing notes. The selected answer and notes are combined only when finalizing.
- Priority 4 is now implemented in the first pass: guided finalize shows staged progress copy while it locks the shortlist.
- Priority 5 is now implemented in the first pass: product detail modal order is image/facts, reasoning/caveat, product notes, and one compact source-specific CTA/disclosure area.
- Priority 6 is now implemented in the first pass: search/refine/results/retry/modal surfaces use fewer gradients, lighter shadows, more consistent radii, teal-first actions, and orange mainly for shopping clickout.
- Priority 7 is now implemented in the first pass: retry is one expandable `Improve these picks` card directly after the shortlist. Three likely correction chips are generated quietly with the async mini-enrichment result for that exact shortlist and appear only after the card is opened; they fill the freeform correction field, which stays editable before `Update my picks`. Submission locks the editor, and the improved query is shown read-only in the results viewport while the safe refreshed search runs; there is no editable `Next search` confirmation step, separate retry panel, or floating retry prompt.
- Improve Picks retry parity: web now follows mobile by skipping the normal new-search refinement question and auto-finalizing as soon as refreshed discovery is ready. The generated query drives refreshed discovery, while the prior follow-up notes and written correction are retained for the automatic finalize so Haiku keeps the shopper's ranking direction. The web-only rollback switch is `VITE_AUTO_FINALIZE_RETRY_SEARCH=false` (default is enabled); this switch affects only Improve Picks retry advice, not ordinary searches, failed-search recovery, or partial-shortlist recovery.
- Product titles are normalized for user-facing display across result rows, selected panels, grid/card view, and modal headings. Raw Amazon/source titles remain in data and are exposed behind a quiet full-title disclosure in details when the display title differs.
- User-facing search history lives at `/history`; finalized searches save locally when signed out and to Supabase `saved_searches` when signed in. Entries can expand/delete/clear and can re-run a saved query with follow-up notes prefilled.
- Frontend auth shell is implemented: `AuthProvider`, `useAuth`, lazy Supabase browser client, `AuthModal`, header sign-in/sign-out UI, visible Google and Apple OAuth, account Preferences UI for shortlist ranking priority, and email/password recovery through Supabase forgot-password email plus a `PASSWORD_RECOVERY` new-password state. Apple must be enabled and configured in Apple Developer and Supabase as documented in `project-notes/apple-sign-in-setup.md`. Search remains ungated. Signed-out history uses localStorage; signed-in history uses Supabase `saved_searches`; local entries migrate into the account on login. Live QA of Google/Apple OAuth return behavior, recovery email/link behavior, `user_preferences` RLS, and auth/RLS/history persistence is still pending.
- Price Watch Phase 3 is implemented behind `PRICE_WATCH_EMAILS_ENABLED=true`: signed-in users can add watches from finalized product modals only, manage them at `/watches`, and are limited to 5 watches. The table is `price_watches` with user-owned Supabase RLS. Protected `POST /api/internal/check-price-watches` runs on the existing Render web service and should be called by a free external scheduler with `Authorization: Bearer $PRICE_WATCH_INTERNAL_TOKEN`. `backend/jobs/check-price-watches.js` uses the Supabase admin client plus Rainforest to update checked/last-seen fields, log would-notify rows while email is disabled, and send Resend alerts plus baseline reset after successful live sends when enabled. Price-drop email now carries the saved HTTPS product thumbnail when available, but safely falls back to text only; its current-price-first layout and copy deliberately avoid baseline/qualifying-drop implementation language.

## Current guided flow
- `GET /api/search/rainforest-discover` is the main discovery route used by the homepage. It uses Rainforest API for active Amazon discovery; Oxylabs provider code is archived and is not an active fallback.
- Exact provider-evidenced brand/model requests hard-filter discovery. A one-character brand spelling near-match with matching product-title evidence only produces an optional corrected-search card; it never alters the original candidate pool or selection. This protects correct but uncommon user terms and rejects false matches such as `apple sauce` → Apple electronics.
- `GET /api/search/refine` returns a primary short follow-up question and one distinct alternate, each with four matching direct answers in the same response.
- `POST /api/search/finalize` rebuilds the candidate pool from guided cache and returns up to 6 shortlist cards.
- Finalize defaults to new-condition products: renewed, refurbished, remanufactured, open-box, pre-owned, used, second-hand, and restored candidates are removed before Haiku and preference composition unless the query or user context explicitly requests a non-new condition. `lowest_price` remains new-only by default.
- Haiku shortlist locking uses short candidate indices plus a strict Anthropic tool schema, maps accepted indices back to server-owned candidate IDs, and retains post-response validation/top-up. Balanced ranking uses inferred product fit first, then quality confidence (rating, review count, trustScore, and recognized category brand), price/value, useful shortlist variety, and raw Amazon search position (`amazonPosition`) as the final secondary signal. The account-ranking experiment accepts `rankingPreference: balanced | price | lowest_price | brand | range`, normalizes invalid values to balanced, and passes the same effective preference to Luna enrichment. Preferences shape which six picks are selected rather than merely their numbering: `price` preserves the strongest contextual fit then favors lower-priced credible alternatives; `lowest_price` uses only its dedicated basic-fit filter as selection guidance, retains every matching candidate Haiku returns, and picks the six lowest-priced matches; brand fills credible known brands before fitting non-brand alternatives; and range seeks both price and feature/style variety. Active-preference finalizes state this in the waiting UI.
- Cosmetic variants of an identified product model are removed deterministically before Haiku and after its ordered six. Haiku returns a strict binary specific-brand decision and a per-pick brand label; when false, final composition deterministically favors no more than two distinct models per resolved brand where credible alternatives exist, then relaxes that preference rather than leave a slot empty. Structured Rainforest `brandName` wins and Haiku's label fills blank provider brands on selected picks. A clearly named brand in a matching query overrides an incorrect false decision. Different models, generations, capacities, widths, and major feature tiers remain distinct.
- `GET /api/search/enrichment-stream` is the first enrichment path; `GET /api/search/enrichment` is the polling fallback.
- `GET /api/search/product-details` hydrates one skipped-refinement preview product from the per-ASIN product detail cache or Rainforest when its modal opens.
- `POST /api/product/deep-dive` is implemented behind `DEEP_DIVE_ENABLED=true` for signed-in users who manually click `Compare prices at other stores` inside a finalized product modal (user-facing name is "Compare prices" as of 2026-07-08; internal route/env/code naming keeps Deep Dive). The modal button is hidden by default and appears only after mini writeup when a token-scoped deterministic prefilter (no AI call) marks a finalized product `show`. The clicked endpoint validates the candidate against the finalized token-scoped snapshot, uses SerpApi Shopping -> Immersive Product, refreshes stale Immersive cache before showing lower store offers (returning a `limited` `price_data_stale` state if the refresh fails), validates exact offers/direct links, compares them against the known Amazon/source price, and returns only price data — offers, `checkedStoreCount`, and a positive "No lower price found" ready state. Review synthesis/signals were removed.
- Async enrichment now defaults to `gpt-5.6-luna` for product explanations and Improve Picks suggestions. It uses the trusted-shopping-editor role, grounding material claims in supplied listing fields; `OPENAI_FINALIZE_MODEL` is the explicit override. Refinement, query-quality review, retry advice, and Haiku shortlist locking remain on their existing models.
- `GET /api/search/query-quality` exposes polling-based query-quality suggestions.
- `POST /api/search/retry-advice` suggests a better next search when the user rejects the shortlist.
- `POST /api/feedback` stores tester feedback.
- Search diagnostics run outside Sentry. Failed searches hide raw provider errors behind calm recovery copy and a `Try again` button that preserves input and starts fresh discovery with `cacheMode=refresh`. The failed attempt records the retry request, while the new attempt gets a fresh search ID. Support code, `Copy report`, and the optional filter/VPN selector are collapsed under troubleshooting details. Frontend/backend lifecycle events write to Supabase `search_attempts` and `search_events` when those tables exist. Successful finalizes add brand-variety counts/flags only (no brand names): cap applied/relaxed, deferrals, highest resolved-brand count, and provider/Haiku/missing label totals. Those IDs also link guided discovery/finalize Render logs and Sentry context; diagnostic storage failure returns `503` and warns in the development browser. `/admin/analytics` has Search reliability and Brand variety sections for these patterns.
- Discovery previews no longer await Supabase rate limiting or token-session persistence. General limiting is local-primary, paid Rainforest misses have a separate local start/concurrency guard, and a timestamped pending token lets immediate finalize poll shared readiness for up to 2.5 seconds. The candidate pool remains server-owned. Redis/Render Key Value was explicitly excluded from this implementation.
- Finalize snapshot persistence remains awaited for now, but its previously hidden duration is exposed as `persistence` in logs, debug timing, and `Server-Timing`, and the reported `total` now includes it. Seven configured-Supabase measurements on 2026-08-31 had a 199.5ms median, six between 186.9ms and 308.4ms, and one 1,689.7ms tail. The first deployed Render E2E measured 150.1ms persistence inside a 2,694.3ms server finalize. Continue collecting production p50/p95 before deciding whether the modest normal saving is worth a pending/cross-instance persistence path.
- The 2026-08-27 Supabase error burst is diagnosed and repaired: all 56 Postgres errors were SQLSTATE `22007` from the atomic rate-limit function's `current_time` variable colliding with PostgreSQL `CURRENT_TIME` and producing time-only values. Migration `20260827225123_repair_atomic_rate_limit_timestamp.sql` is in the branch and its function body was applied to Focama production; a rollback-only production call succeeded and later discovery requests did not increase the error count. Afterward, a cached discovery measured 3.30s round trip versus 6.08s for one successful forced Rainforest request, while a later cache-only browser run reached products in 2.39s then 0.65s warm. Supabase rate limiting plus required session persistence still consumed about 2.24s on the measured cache hit. Two subsequent forced Rainforest attempts returned `502`, which is a separate provider-reliability investigation.
- Automatic hybrid price-intel surfacing remains intentionally inactive. Compare prices (Deep Dive path) is the current comparison bet and is price-only; do not add card badges, background better-price checks, review content, Serper, Google Light, or Google Custom Search for this flow without a fresh decision. Deep research/review synthesis ambitions moved to the Premium Research Report pre-plan.

## Key files
- App route shell: `src/App.jsx`
- Homepage entry: `src/pages/HomePage.jsx`
- Search history page: `src/pages/HistoryPage.jsx`
- Price watches page/hook/store: `src/pages/WatchPage.jsx`, `src/components/watch/useWatches.js`, `src/lib/watch/watchStore.js`
- Price watch dry-run job: `backend/jobs/check-price-watches.js`
- Price watch protected endpoint handler: `backend/lib/handlers/price-watch-handler.js`
- Price watch email renderer/sender: `backend/lib/price-watch/price-drop-email.js`
- First-load homepage shell: `src/components/home/HomeShell.jsx`
- Guided homepage experience: `src/components/home/HomeExperience.jsx`
- Result UI: `src/components/home/ResultsSection.jsx`
- Product modal UI: `src/components/home/ProductDetailModal.jsx`
- Finalize loading UI: `src/components/home/FinalizeLoadingState.jsx`
- Guided search state/requests: `src/components/home/useGuidedSearch.js`
- Search diagnostics helper: `src/lib/searchDiagnostics.js`
- Local history helpers: `src/lib/history/`
- Remote history store: `src/lib/history/remoteHistoryStore.js`
- Auth provider/hook: `src/contexts/AuthContext.jsx`, `src/contexts/useAuth.js`
- Supabase browser client: `src/lib/supabase.js`
- Auth modal: `src/components/auth/AuthModal.jsx`
- Amazon store context: `src/contexts/AmazonStoreContext.jsx`
- Render backend entrypoint: `backend/express-server.js`
- Core route handlers: `backend/server.js`
- Cache/storage helpers: `backend/lib/search-storage.js`
- Search diagnostics storage: `backend/lib/storage/search-diagnostics-storage.js`

## Deployment reality
- Frontend is on Vercel.
- Backend is on Render and starts from `backend/express-server.js`.
- The frontend tries the Render backend through `VITE_BACKEND_URL` first (or the active Render fallback when a Vercel build omits that variable), then retries browser-level network failures through same-origin Vercel rewrites and remembers proxy mode. `/api/geo` remains Vercel-local.
- KAILA has been removed from this repo and is no longer mounted on the Focamai Render service.
- `api/geo.js` intentionally stays on Vercel so the UI can read Vercel geolocation headers through a relative `/api/geo` request.

## If continuing from here
- For UI redesign work, read `project-notes/plans/ui_improvement_plan/README.md` next.
- For current behavior questions, read `project-notes/app_flow.md`.
- For backend/search behavior, read `project-notes/search-flow.md`.
- For remaining work, read `project-notes/handoff.md`.
# 2026-07-29 — Cache-hit latency follow-up

- A paid smoke benchmark confirmed genuine discovery cache hits are much faster than Rainforest queries (production: roughly 1.0s cache hit vs 8.6s forced Rainforest). The new opt-in benchmark is in `backend/smoke.test.js` (`SMOKE=1 SMOKE_CACHE_BENCH=1`).
- Cache lookup was only ~13ms; the shared Supabase rate limiter and awaited session snapshot were the dominant observed cache-hit costs. Both have now left the preview response path. Local smoke after the change showed a 244ms cached product display following a 10.25s provider fill, then 1.12s/0.55s warm cache-only screen times; the repaired paid E2E smoke passed immediate discover -> refine -> finalize.
