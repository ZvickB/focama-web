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
- Live-check the new `Ask a different question` refine interaction across several categories: confirm the alternate explores a genuinely different decision factor, measure whether generating it materially changes refine latency, and verify the 900 ms breathing transition feels intentional rather than slow.
- Run the Sightengine sensitive-image analyzer in controlled shadow mode against a much broader real Amazon set, especially headless mannequins, cropped/partial bodies, packaging photos, and small background people. Review every proposed `show`, keep dangerous false reveals at zero, and measure provider latency/operation use before deciding whether any reveal feature is viable. Shadow mode is live on Render as of 2026-07-08 and results reviewed so far look fine. The old TensorFlow.js person/face/pose stack remains only as an offline comparison harness, not a Render fallback.
- The cached per-image Sightengine verdict store and response-time reveal path are implemented. `SENSITIVE_IMAGE_REVEAL_ENABLED=true` is approved in `render.yaml` for the current tester-only production rollout. Review cache/reveal logs and tester reports; set it back to `false` immediately if a dangerous false reveal appears. Implementation and safety rules live in `project-notes/plans/sightengine-verdict-cache-plan.md`.
- Planned next safety step: a local TF.js audit of cached `show` verdicts — a manually run script on the developer's machine that re-analyzes every revealed image and flags disagreements for human review. Plan lives in `project-notes/plans/tfjs-show-verdict-audit-plan.md`; not yet implemented. TF.js must never return to Render or the live request path. The old blocker (sanitized cache entries had image URLs cleared) no longer applies because the `sensitive_image_verdicts` table retains normalized URLs, so no separate evaluation queue is needed.
- Continue Price Watch from `project-notes/plans/price-watch-plan.md`: Phases 1-3 are implemented. The protected Render endpoint and GitHub Actions trigger passed a production manual run on 2026-06-28 with zero active watches, so no separate Render Cron service is required. Before broad rollout, verify `PRICE_WATCH_FROM_EMAIL` in Resend/domain setup, then seed a known drop and confirm one email sends, the affiliate button works, `last_notified_*` updates, and the baseline reset prevents a duplicate alert.
- Audit modal AI tone and tighten any copy that sounds too promotional or vague.
- Verify route chunk-load recovery and the guided search transition states in the live browser once the next frontend deploy is available.
- Watch whether the new inline marketplace prompt feels helpful or distracting, and adjust its timing/copy if testers treat it as friction.
- Before reapplying to Amazon Associates, verify the new or appealed account's current tracking IDs, update the configured domain-to-tag map if Amazon changes them, deploy, then click live result-card and modal CTAs to confirm tagged stores include the expected `tag=` and active untagged stores preserve plain local-domain URLs. Add a tracking ID and remove the store from `ACTIVE_UNTAGGED_AMAZON_DOMAINS` when commissions matter.
- Watch the new polling-based query-quality suggestion MVP. It stores `selection.queryQuality`, polls it from the homepage, shows a small optional suggested-query prompt for high-confidence weak-result reviews, and starts a normal new guided search when accepted.
- Verify query-quality behavior against real provider runs: `celcius drink` should be able to suggest `celsius drink`, `shabbos art` should usually stay quiet, and normal searches such as `travel stroller for airplane` should not show a prompt.
- Query-quality SSE and suggested-query prewarm remain intentionally unimplemented. Add them only if the polling MVP proves useful and the user explicitly chooses that next step.
- Review early tester feedback from the new homepage FAB and decide whether the reveal timing, wording, or question set should change.
- Decide whether to add a proactive pool-mismatch nudge before the user opens retry.
- Watch retry-advice behavior on multi-constraint misses such as brand + product type + dietary need; the prompt now preserves accumulated constraints by default, and the frontend now exposes correction chips plus inline suggested-query confirmation, but this still needs live validation.
- Budget enforcement remains evaluation-only. A fresh 20-query run correctly detected 12 single currency-marked budgets, ignored six bare-number age/quantity/size traps and two multi-amount prompts, and reduced budget-violation queries from 2 to 0 with exact hard caps plus a 15% ceiling for other currency amounts. One hard-cap pool shrank from four candidates to one eligible result, so do not port deterministic budget filtering until the fewer-than-six behavior and Improve Picks propagation are explicitly decided.
- Replace the About page with a `Why Focamai` page, then update nav and add a clear return-home path.
- Watch whether the new inline clickout disclosure feels clear and trust-building, and adjust the wording if testers read it as friction or legal copy.
- Compare prices (formerly Deep Dive; 2026-07-08) is a feature-flagged, account-gated, user-triggered modal panel that does price comparison only — review synthesis/signals and the `gpt-5-mini` eligibility pass were removed; button visibility is now the deterministic prefilter alone. Stale Immersive cache refreshes before showing lower store offers and returns an honest `limited` state if the refresh fails. Before enabling broadly, create the Supabase tables, configure `DEEP_DIVE_ENABLED=true`, `SERPAPI_API_KEY`, and the `DEEP_DIVE_ALLOWED_DOMAINS_US/CA` allowlists, then run live review against at least 20 finalized products and tune the prefilter from logs.
- Compare-prices limited/empty/error copy was partially rewritten during the 2026-07-08 rename (no-lower-price is now a positive confirmation; stale-price and no-exact-product messages are plainer). Re-review the remaining messages after live offer-survival review.
- Route ownership was consolidated on 2026-07-11: `backend/express-server.js` owns the sole Express route map, while `backend/server.js` composes/re-exports handlers. Keep new routes there; the next backend cleanup candidate is `handlers/finalize-handler.js`, not `useGuidedSearch`.
- Finalize cleanup F2a is complete: `handlers/finalize-context.js` owns request/context validation and discovery snapshot loading. The remaining potential finalize work is candidate-pool normalization, selection, persistence, and background scheduling; split only one proven seam at a time.
- Finalize cleanup F2b is complete: `handlers/finalize-candidate.js` owns pure single-candidate normalization. Candidate-pool filtering/rejection policy, selection, persistence, and background scheduling remain open; split only a proven independent seam.
- Use the local `/admin/analytics` dashboard during development against live data and decide which weak-query, weak-ranking, or refine-friction fixes to prioritize first.
- The configured Supabase currently exposes `search_attempts` and `search_events`; verify the deployed Render service uses that same project, then run a live failed search and confirm one support code links Supabase events, Render logs/Sentry context, and `/admin/analytics` Search reliability.
- Finish auth/history/preferences QA: verify sign up, sign in, Google OAuth return, forgot-password email and recovery-link password update, session persistence, sign out, local-to-account history migration, remote save on finalize, reload persistence, delete, clear, second browser/device account history, and `user_preferences` RLS/read/write persistence. Apple sign-in is intentionally hidden pending its Developer configuration. Keep the production Focamai origin allowed in Supabase Auth redirect URLs.
- If live QA passes, decide whether to add a small post-finalize nudge telling logged-out users that sign-in syncs history across devices.
- Account-level ranking priority preference is implemented on experiment branch `account-ranking-preferences` and ready for deployment: signed-in account Preferences can save `balanced | price | lowest_price | brand | range`, finalize/enrichment receive the effective enum, non-balanced results show an indicator with `Show balanced picks`, and a one-time results hint opens Preferences/auth. `Prefer lower prices` keeps the strongest fit then favors lower-priced credible alternatives; `Lowest prices` sends only the compact basic-fit filter prompt, retains every matching candidate Haiku returns, then selects the six lowest-priced matches. Active-preference finalizes name the query and preference in the readable waiting state. The Supabase migrations have been applied in the configured project and local end-to-end smoke testing passed. Remaining release QA is auth/RLS/history persistence plus broader brand/range evaluation.

## Backend/provider follow-ups
- Discovery uses Rainforest API for active Amazon discovery. Oxylabs provider code has been archived and is not an active fallback.
- Active Amazon discovery supports tagged `amazon.com`/`amazon.ca` plus active untagged major stores (UK, Germany, France, Italy, Spain, Australia, Japan, India, Mexico, and Brazil). Untagged stores deliberately use plain local-domain clickouts and earn no commission; broader stores remain deferred until explicitly added to `ACTIVE_UNTAGGED_AMAZON_DOMAINS` or configured with tags.
- The current shortlist-detail helper is Rainforest-backed through `fetchAmazonProductDetailsByAsin`.
- Keep the SerpApi route inactive unless there is a deliberate reason to reactivate multi-retailer discovery.
- Keep automatic hybrid price-intel surfacing inactive. The current approved shape is explicit user-triggered Compare prices only: no shortlist badges, no automatic background price checks, no review content, no Serper, no Google Light, and no Google Custom Search unless live review proves the SerpApi Shopping -> Immersive path cannot locate product groups reliably.
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
