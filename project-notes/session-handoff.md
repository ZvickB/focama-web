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
- The 2026-07-02 privacy/account-deletion work updated the canonical `/privacy` page and mobile Privacy screen and implemented authenticated `DELETE /api/account`, mobile Settings → Account deletion, and the public `/delete-account` route. The endpoint deletes only the bearer-token-verified Supabase Auth user and relies on documented cascades for `saved_searches`, `price_watches`, and `deep_dive_usage`; anonymous operational records without a user ID remain. See `account-deletion-audit.md`. Live Supabase constraint/Render/device verification is still pending.
- The current experiment branch is `new_web_ui`.
- The branch is for borrowing the strongest UI/UX lessons from the mobile app while keeping web optimized for browser and desktop use.
- The current web homepage at `/` still uses the `open` layout until changed.
- The product should stay calm, focused, mobile-first/responsive, and not marketplace-shaped.
- Focamai should not feel like an Amazon clone or marketplace wall. Amazon is the current primary commerce path and affiliate target, so frontend copy and UI may say Amazon directly when the active source is Amazon and doing so improves clarity, trust, or conversion.
- Amazon marketplace choices are currently limited to domains with configured Associates tracking tags (`amazon.com`, `amazon.ca`). Untagged domains fall back to `amazon.com` and should not create Amazon Special Links without `tag=`.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible, but do not let future multi-retailer flexibility make today's Amazon-first UX vague.
- Existing shopping clickout CTAs should use source-derived wording: Amazon items can say `View on Amazon` or the active Amazon domain, while future non-Amazon sources can say `View on Walmart`, `View on AliExpress`, etc.
- Product shortlists stay at 6 items.
- Deterministic content moderation hides sensitive-product images unless a current explicit Sightengine `show` restores them. `SENSITIVE_IMAGE_SHADOW_ENABLED=true` checks and populates the versioned `sensitive_image_verdicts` table; only successful decisions persist, while failures remain retryable and fail closed. Cached products retain only an image URL hash. `SENSITIVE_IMAGE_REVEAL_ENABLED=true` is approved for the current tester-only production rollout in `render.yaml`; disable it immediately if a dangerous false reveal appears. TensorFlow.js remains local-evaluation-only.
- Query moderation now keeps the deterministic regex floor and adds `omni-moderation-latest` for only `sexual` and `sexual/minors`. It runs alongside normal discovery/refine work, fails open after `OPENAI_MODERATION_TIMEOUT_MS` (default 2000 ms), gates all result persistence/reveal, deduplicates matching in-flight checks, and uses a process-local one-hour IP penalty box to force moderation before work after a blocked verdict.
- The guided backend path is the real product path.
- `/api/search/live` remains a manual/debug combined route, not the normal user flow.
- The PNG wordmark is the active wordmark.
- The web UI improvement plan lives at `project-notes/plans/ui_improvement_plan/README.md`.
- Priority 1 of that plan is now implemented in a simpler form: final/preview results render as ranked rows, without a side preview.
- Priority 2 is now implemented in the first pass: the large search stage collapses into compact progress plus a summary after submit, refinement gets its own active panel, and finalized refinement collapses above the ranked results.
- Priority 3 is now implemented in the first pass: the active refine panel uses the mobile-inspired heading, AI follow-up prompt, up to 3 refinement chips, fallback chips, selected chip state, and chip-to-notes behavior. Refine now also returns a distinct pre-generated alternate; `Ask a different question` replaces only the first question after a 900 ms breathing transition while keeping the chips and notes available.
- Priority 4 is now implemented in the first pass: guided finalize shows staged progress copy while it locks the shortlist.
- Priority 5 is now implemented in the first pass: product detail modal order is image/facts, reasoning/caveat, product notes, and one compact source-specific CTA/disclosure area.
- Priority 6 is now implemented in the first pass: search/refine/results/retry/modal surfaces use fewer gradients, lighter shadows, more consistent radii, teal-first actions, and orange mainly for shopping clickout.
- Priority 7 is now implemented in the first pass: retry asks what felt off, uses only three broad quick prompts, and `Update my picks` automatically starts the safe suggested search. The compact search summary shows the actual improved query being searched; there is no editable `Next search` confirmation step.
- Product titles are normalized for user-facing display across result rows, selected panels, grid/card view, and modal headings. Raw Amazon/source titles remain in data and are exposed behind a quiet full-title disclosure in details when the display title differs.
- User-facing search history lives at `/history`; finalized searches save locally when signed out and to Supabase `saved_searches` when signed in. Entries can expand/delete/clear and can re-run a saved query with follow-up notes prefilled.
- Frontend auth shell is implemented: `AuthProvider`, `useAuth`, lazy Supabase browser client, `AuthModal`, header sign-in/sign-out UI, Google/Apple OAuth buttons, account Preferences UI for shortlist ranking priority, and email/password recovery through Supabase forgot-password email plus a `PASSWORD_RECOVERY` new-password state. Search remains ungated. Signed-out history uses localStorage; signed-in history uses Supabase `saved_searches`; local entries migrate into the account on login. Live QA of OAuth provider setup/return behavior, recovery email/link behavior, `user_preferences` RLS, and auth/RLS/history persistence is still pending.
- Price Watch Phase 3 is implemented behind `PRICE_WATCH_EMAILS_ENABLED=true`: signed-in users can add watches from finalized product modals only, manage them at `/watches`, and are limited to 5 watches. The table is `price_watches` with user-owned Supabase RLS. Protected `POST /api/internal/check-price-watches` runs on the existing Render web service and should be called by a free external scheduler with `Authorization: Bearer $PRICE_WATCH_INTERNAL_TOKEN`. `backend/jobs/check-price-watches.js` uses the Supabase admin client plus Rainforest to update checked/last-seen fields, log would-notify rows while email is disabled, and send Resend alerts plus baseline reset after successful live sends when enabled.

## Current guided flow
- `GET /api/search/rainforest-discover` is the main discovery route used by the homepage. It uses Rainforest API for active Amazon discovery; Oxylabs provider code is archived and is not an active fallback.
- `GET /api/search/refine` returns a primary short follow-up question, one distinct alternate, and optional refinement chips in the same response.
- `POST /api/search/finalize` rebuilds the candidate pool from guided cache and returns up to 6 shortlist cards.
- Haiku shortlist locking uses short candidate indices plus a strict Anthropic tool schema, maps accepted indices back to server-owned candidate IDs, and retains post-response validation/top-up. Balanced ranking uses inferred product fit first, then quality confidence (rating, review count, trustScore, and recognized category brand), price/value, useful shortlist variety, and raw Amazon search position (`amazonPosition`) as the final secondary signal. The account-ranking experiment accepts `rankingPreference: balanced | price | brand | range`, normalizes invalid values to balanced, and passes the same effective preference to mini enrichment.
- `GET /api/search/enrichment-stream` is the first enrichment path; `GET /api/search/enrichment` is the polling fallback.
- `GET /api/search/product-details` hydrates one skipped-refinement preview product from the per-ASIN product detail cache or Rainforest when its modal opens.
- `POST /api/product/deep-dive` is implemented behind `DEEP_DIVE_ENABLED=true` for signed-in users who manually click `Compare prices at other stores` inside a finalized product modal (user-facing name is "Compare prices" as of 2026-07-08; internal route/env/code naming keeps Deep Dive). The modal button is hidden by default and appears only after mini writeup when a token-scoped deterministic prefilter (no AI call) marks a finalized product `show`. The clicked endpoint validates the candidate against the finalized token-scoped snapshot, uses SerpApi Shopping -> Immersive Product, refreshes stale Immersive cache before showing lower store offers (returning a `limited` `price_data_stale` state if the refresh fails), validates exact offers/direct links, compares them against the known Amazon/source price, and returns only price data — offers, `checkedStoreCount`, and a positive "No lower price found" ready state. Review synthesis/signals were removed.
- Mini enrichment now treats the first locked pick as the hero recommendation and later picks as alternatives with distinct tradeoffs.
- `GET /api/search/query-quality` exposes polling-based query-quality suggestions.
- `POST /api/search/retry-advice` suggests a better next search when the user rejects the shortlist.
- `POST /api/feedback` stores tester feedback.
- Search diagnostics run outside Sentry. Failed searches hide raw provider errors behind calm recovery copy and a `Try again` button that preserves input and starts fresh discovery with `cacheMode=refresh`. The failed attempt records the retry request, while the new attempt gets a fresh search ID. Support code, `Copy report`, and the optional filter/VPN selector are collapsed under troubleshooting details. Frontend/backend lifecycle events write to Supabase `search_attempts` and `search_events` when those tables exist. Those IDs also link guided discovery/finalize Render logs and Sentry context; diagnostic storage failure returns `503` and warns in the development browser. `/admin/analytics` has a Search reliability section for failed support codes and provider/network patterns.
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
- The frontend tries the Render backend through `VITE_BACKEND_URL` first, then retries browser-level network failures through same-origin Vercel rewrites and remembers proxy mode. `/api/geo` remains Vercel-local.
- KAILA has been removed from this repo and is no longer mounted on the Focamai Render service.
- `api/geo.js` intentionally stays on Vercel so the UI can read Vercel geolocation headers through a relative `/api/geo` request.

## If continuing from here
- For UI redesign work, read `project-notes/plans/ui_improvement_plan/README.md` next.
- For current behavior questions, read `project-notes/app_flow.md`.
- For backend/search behavior, read `project-notes/search-flow.md`.
- For remaining work, read `project-notes/handoff.md`.
