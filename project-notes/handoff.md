# Handoff

## Purpose
- Durable backlog and open product questions.
- `current-status.md` is the short snapshot.
- `app_flow.md` is the implemented flow.

## Current reality
- Frontend is on Vercel; backend is on Render.
- Production browser requests prefer the direct Render backend and fall back to same-origin Vercel rewrites after a network-level failure. Keep `/api/geo` Vercel-local when changing rewrite coverage.
- The product path is `rainforest-discover -> refine -> finalize -> enrichment`.
- Retry currently suggests a better next search instead of showing endless same-pool results.
- Discovery cache, internal operational `search_history`, local saved-search history, analytics, and product-details cache are the main active storage paths.

## Real remaining work
- Verify the live golden path in the browser and confirm cards arrive quickly while modal AI copy hydrates later.
- Continue Price Watch from `project-notes/price-watch-plan.md`: Phases 1-3 are implemented. The protected Render endpoint and GitHub Actions trigger passed a production manual run on 2026-06-28 with zero active watches, so no separate Render Cron service is required. Before broad rollout, verify `PRICE_WATCH_FROM_EMAIL` in Resend/domain setup, then seed a known drop and confirm one email sends, the affiliate button works, `last_notified_*` updates, and the baseline reset prevents a duplicate alert.
- Audit modal AI tone and tighten any copy that sounds too promotional or vague.
- Verify route chunk-load recovery and the guided search transition states in the live browser once the next frontend deploy is available.
- Watch whether the new inline marketplace prompt feels helpful or distracting, and adjust its timing/copy if testers treat it as friction.
- Before reapplying to Amazon Associates, verify the new or appealed account's current tracking IDs, update the configured domain-to-tag map if Amazon changes them, deploy, then click live result-card and modal CTAs to confirm every active Amazon link includes the expected `tag=`. Only re-enable additional Amazon marketplaces after adding valid tracking IDs for those locales.
- Watch the new polling-based query-quality suggestion MVP. It stores `selection.queryQuality`, polls it from the homepage, shows a small optional suggested-query prompt for high-confidence weak-result reviews, and starts a normal new guided search when accepted.
- Verify query-quality behavior against real provider runs: `celcius drink` should be able to suggest `celsius drink`, `shabbos art` should usually stay quiet, and normal searches such as `travel stroller for airplane` should not show a prompt.
- Query-quality SSE and suggested-query prewarm remain intentionally unimplemented. Add them only if the polling MVP proves useful and the user explicitly chooses that next step.
- Review early tester feedback from the new homepage FAB and decide whether the reveal timing, wording, or question set should change.
- Decide whether to add a proactive pool-mismatch nudge before the user opens retry.
- Watch retry-advice behavior on multi-constraint misses such as brand + product type + dietary need; the prompt now preserves accumulated constraints by default, and the frontend now exposes correction chips plus inline suggested-query confirmation, but this still needs live validation.
- Replace the About page with a `Why Focamai` page, then update nav and add a clear return-home path.
- Watch whether the new inline clickout disclosure feels clear and trust-building, and adjust the wording if testers read it as friction or legal copy.
- Deep Dive is now implemented as a feature-flagged, account-gated, user-triggered modal panel, with button visibility controlled by a post-writeup `gpt-5-mini` eligibility pass. Stale Immersive cache now refreshes before showing lower store offers, while stale review signals can still be used if the refresh fails. Before enabling broadly, create the Supabase tables, configure `DEEP_DIVE_ENABLED=true`, `SERPAPI_API_KEY`, `CLAUDE_API_KEY`, and the `DEEP_DIVE_ALLOWED_DOMAINS_US/CA` allowlists, then run live review against at least 20 finalized products and tune the eligibility prefilter/model decisions from logs.
- Deep Dive limited/empty/error copy is still too internal for users. After offer survival is reliable, rewrite those messages around plain outcomes and next steps instead of validation/provider language.
- Keep trimming `backend/server.js` so route orchestration and flow logic do not keep growing in one file.
- Use the local `/admin/analytics` dashboard during development against live data and decide which weak-query, weak-ranking, or refine-friction fixes to prioritize first.
- The configured Supabase currently exposes `search_attempts` and `search_events`; verify the deployed Render service uses that same project, then run a live failed search and confirm one support code links Supabase events, Render logs/Sentry context, and `/admin/analytics` Search reliability.
- Finish auth/history QA: verify sign up, sign in, forgot-password email and recovery-link password update, OAuth return if Google is enabled, session persistence, sign out, local-to-account history migration, remote save on finalize, reload persistence, delete, clear, and second browser/device account history. Keep the production Focamai origin allowed in Supabase Auth redirect URLs.
- If live QA passes, decide whether to add a small post-finalize nudge telling logged-out users that sign-in syncs history across devices.

## Backend/provider follow-ups
- Discovery uses Rainforest API for active Amazon discovery. Oxylabs provider code has been archived and is not an active fallback.
- Active Amazon discovery is currently constrained to affiliate-tagged marketplaces (`amazon.com`, `amazon.ca`) for Associates compliance; broader Amazon marketplace support is deferred until valid tracking IDs exist.
- The current shortlist-detail helper is Rainforest-backed through `fetchAmazonProductDetailsByAsin`.
- Keep the SerpApi route inactive unless there is a deliberate reason to reactivate multi-retailer discovery.
- Keep automatic hybrid price-intel surfacing inactive. The current approved pivot is explicit Deep Dive only: no shortlist badges, no automatic background price checks, no Serper, no Google Light, and no Google Custom Search unless live review proves the SerpApi Shopping -> Immersive path cannot locate product groups reliably.
- Create the `rate_limit_events` table in Supabase before public traffic so Render instances share the same rate-limit bucket; the app falls back to process-local limiting if the table is unavailable.
- Add the real `SENTRY_DSN` and confirm events arrive in production once the Render environment is updated.
- Keep Sentry as a useful backend exception channel, but do not rely on it as the only search-failure visibility path; search support-code diagnostics now write to Supabase separately when configured.

## Product guardrails
- Keep the guided flow as the main experience.
- Keep shortlists at 6 unless the user explicitly changes that product decision.
- Keep user-facing saved history separate from internal `search_history`.
- Search must remain ungated; auth should unlock sync/account features instead of becoming a wall.
- Keep provider-specific implementation details out of the core product identity.

## Later, not now
- Preference learning only after the core shortlist experience proves useful.
- Subscriber-tier expansion only after the free core flow is solid.

