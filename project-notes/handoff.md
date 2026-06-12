# Handoff

## Purpose
- Durable backlog and open product questions.
- `current-status.md` is the short snapshot.
- `app_flow.md` is the implemented flow.

## Current reality
- Frontend is on Vercel; backend is on Render.
- The product path is `rainforest-discover -> refine -> finalize -> enrichment`.
- Retry currently suggests a better next search instead of showing endless same-pool results.
- Discovery cache, internal operational `search_history`, local saved-search history, analytics, and product-details cache are the main active storage paths.

## Real remaining work
- Verify the live golden path in the browser and confirm cards arrive quickly while modal AI copy hydrates later.
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
- Keep trimming `backend/server.js` so route orchestration and flow logic do not keep growing in one file.
- Use the local `/admin/analytics` dashboard during development against live data and decide which weak-query, weak-ranking, or refine-friction fixes to prioritize first.
- Create the Supabase `search_attempts` and `search_events` tables from `project-notes/db-needs.md`, then verify a live failed search writes a support-code event path and appears in `/admin/analytics` under Search reliability.
- Finish the saved-search sequence: verify local history on real finalized searches, then add Supabase auth, then move logged-in history to a separate `saved_searches` table with local-to-account migration.
- Finish auth/history QA: verify sign up, sign in, OAuth return if Google is enabled, session persistence, sign out, local-to-account history migration, remote save on finalize, reload persistence, delete, clear, and second browser/device account history.
- If live QA passes, decide whether to add a small post-finalize nudge telling logged-out users that sign-in syncs history across devices.

## Backend/provider follow-ups
- Discovery uses Rainforest API first for all Amazon marketplaces when configured. Oxylabs is now the discovery fallback only: it runs when Rainforest errors or returns too few usable items to support the 6-item shortlist. If Rainforest is not configured, Oxylabs remains the emergency provider when credentials are available; validate this Rainforest-first order on live tester searches.
- Active Amazon discovery is currently constrained to affiliate-tagged marketplaces (`amazon.com`, `amazon.ca`) for Associates compliance; broader Amazon marketplace support is deferred until valid tracking IDs exist.
- The current shortlist-detail helper is still Oxylabs-backed so modal bullets/descriptions stay on the stronger detail path for now.
- Keep the SerpApi route inactive unless there is a deliberate reason to reactivate multi-retailer discovery.
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
- Accounts/login only if persistence becomes a real product need.
- Account-backed saved searches as an explicit user-facing feature in `saved_searches`, not by repurposing internal `search_history`.
- Preference learning only after the core shortlist experience proves useful.
- Subscriber-tier expansion only after the free core flow is solid.
