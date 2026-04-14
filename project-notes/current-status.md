# Current Status

## Purpose
- Short current snapshot for future chats.
- Keep this focused on what is true now and where to read details.
- Canonical references:
  - Current implemented behavior: `project-notes/app_flow.md`
  - Finalize guardrails and AI-scope strategy: `project-notes/finalize-strategy.md`
  - Current prewarm/finalize experiment conclusions: `project-notes/active-experiment-override.md`
  - Preferred layered latency plan: `project-notes/layered-latency-plan.md`
  - Longer MVP backlog: `project-notes/handoff.md`

## Current product state
- The app is Vite + React with React Router, TanStack Query, Tailwind, and Vitest.
- The homepage at `/` uses the `open` layout: spacious, search-first, single-column, mobile-first, and not marketplace-shaped.
- Older homepage experiments were removed after the open layout became the chosen direction.
- Product shortlists are 6 items end to end.
- The current frontend uses the PNG wordmark and Instrument Sans.
- A true HTML boot splash starts in `index.html`, shows the PNG wordmark plus `Focused shopping`, includes a static header shell, and fades after React is ready and the splash has been visible for about 1 second.
- Search/refine copy now tells users to start with a normal product search and use the refine step for natural-language narrowing such as budget, size, comfort, style, or use case.
- The homepage supports preview results, final focused picks, a `Start a new search` reset path, and up to 2 feedback-based retry passes that exclude rejected shortlist items.

## Current backend state
- The primary product flow is guided search:
  - `/api/search/discover`
  - `/api/search/prewarm`
  - `/api/search/refine`
  - `/api/search/framing-fields`
  - `/api/search/finalize`
- `/api/search/live` is the explicit manual/debug combined route, not the primary product path.
- Guided discovery is the persistent search-cache boundary; guided finalize and live search remain intentionally uncached.
- `/api/search/discover` returns a preview set plus `discoveryToken`; finalize reconstructs the rich candidate pool from guided discovery cache instead of trusting a browser-posted pool.
- Supabase-backed guided discovery cache is confirmed working in production on `focama.vercel.app`, with local file fallback for development.
- Search-history records are internal operational telemetry, not a user-facing saved-history feature.
- Shared rate limiting prefers Supabase when configured, with in-memory fallback for local/degraded environments.
- Vercel API wrappers preserve forwarded headers so IP-based rate limiting works in production.
- Guided discovery/refine/framing/prewarm/finalize emit structured `[search-flow]` logs with latency, token usage, candidate counts, and ranking ownership.
- Guided search responses expose `Server-Timing`; the homepage timing panel appears in development or when `?timing=1` is present.

## Current finalize reality
- Guided finalize is back on the slimmer one-shot selector as the active baseline after the compact shard-scoring experiment regressed.
- Blocking finalized cards include core product facts and one concise fit reason.
- Drawback/caution copy is no longer part of the blocking finalized card payload.
- AI no longer assigns badge labels in the blocking finalize response; frontend heuristics assign scan-friendly badges after final results load.
- `/api/search/finalize` returns a `finalizeFast` contract plus `results` derived from that contract.
- Normal guided finalize responses no longer echo the rich candidate pool back to the browser.
- The broader candidate-aware prewarm flow is active experiment groundwork:
  - prewarm starts after usable discovery candidates exist
  - it stores a reusable `candidate_aware_prewarm` prior in guided discovery cache
  - it does not lock the shortlist or materialize final cards directly
  - finalize can use the prior or fall back to one-shot selection
- Query framing is split:
  - `/api/search/refine` returns the fast user-visible question
  - `/api/search/framing-fields` returns slower background framing fields for timing/debug only
  - framing fields are not yet stored server-side or consumed by finalize in normal product flow

## Guardrails
- Keep the guided flow as the main product path unless the user explicitly approves a change.
- Keep shortlist count at 6 unless the user explicitly chooses otherwise.
- Keep the app vendor-agnostic at the response/product level.
- Keep fit explanation value and scan-friendly badges as product behaviors, even if their production shape changes.
- Do not let finalization drift back into a heavy all-polish-before-results AI pass.
- Keep current behavior and planned layered behavior clearly separated.
- For finalize/latency work, read `active-experiment-override.md`, `layered-latency-plan.md`, and `finalize-strategy.md` before changing code.

## Latest measurement conclusions
- Canonical measurement read: `project-notes/active-experiment-override.md`.
- Reset baseline on 2026-03-30:
  - refine averaged about 3.4 s and 318 tokens
  - finalize averaged about 16.1 s and 5485 tokens
  - full guided search averaged about 5803 tokens
- Refine slimming on 2026-03-30:
  - refine averaged about 1.1 s and 172 tokens
- Badge-scope reduction on cached same-query finalize:
  - finalize averaged about 7.5 s, about 7.0 s OpenAI time, and about 2479 tokens
  - full guided search averaged about 2651 tokens
  - this crossed the under-8-second cached finalize milestone
- Prepared query-framing injection on 2026-04-13:
  - finalize was slightly faster in one narrow run but used more tokens
  - the extra framing-fields call averaged about 3.8 s and 353 tokens
  - shortlist quality looked mixed
  - do not treat this as proof the broader perceived-latency idea failed
- Layered harness on 2026-04-13:
  - question-fast averaged about 1.5 s
  - framing-fields averaged about 6.6 s
  - current shortlist-lock stayed around 5.0 s to 5.8 s server-side depending on modeled think time
  - prepared/candidate-aware-prior finalize was slower than baseline in the normal non-streamed path, so prewarm is not validated as a direct finalize speed win
  - first image-safe shortlist paint proxy stayed around 9.6 s to 10.2 s once current prewarm wait was included
  - the corrected target is about 6000 ms, not sub-600 ms
- Selection-only shortlist-lock pass on 2026-04-13:
  - baseline averaged about 5.2 s
  - selection-only averaged about 3.2 s and used about 1474 tokens vs about 1891 baseline
  - the thinner pass clears the corrected speed target on this run, but shortlist quality was mixed and not validated
- Clean full-evidence ids-only winner-lock pass on 2026-04-14:
  - baseline shortlist-lock averaged about 3.77 s and 1878 tokens
  - ids-only winner-lock averaged about 2.45 s and 1668 tokens while keeping the same candidate-aware prior evidence path
  - first image-safe shortlist paint proxy averaged about 2.46 s
  - badge pass averaged about 1.54 s and 715 tokens; enrichment pass averaged about 3.18 s and 1016 tokens
  - total winner-lock + badge + enrichment usage averaged about 3399 tokens
  - top result matched baseline in 5/5 cases; winner set overlap was high, but some ordering choices were slightly worse
  - conclusion: continue cautiously; the winner-lock target is met, but post-lock polish cost needs work
- User-intent correction for the now-measured one-call stream experiment:
  - the prior clean split run measured separate AI calls for winner lock, badges, and enrichment
  - the intended architecture for that pass was one streamed finalize AI session with ordered phase events
  - that pass tested one OpenAI streaming call that emits `winners_locked`, `badges_ready`, `enrichment_ready`, and `done`
  - later streamed phases must preserve locked IDs and order
  - do not turn this next pass into separate post-lock AI calls or deterministic badges unless the user explicitly asks
- Temporary stream harness implementation:
  - `POST /api/search/finalize-stream` exists only on the local Node server, not as a Vercel wrapper or UI path
  - `backend/scripts/measure-guided-finalize.js --mode stream-clean` compares baseline finalize with the one-call streamed path in the same run
  - small smoke run on 2026-04-14 completed 3/3 stream cases with average winners lock around 1.9 s and order preservation for badges/enrichment in 3/3
  - full context5 run `stream-clean-context5` completed 5/5 stream cases
  - baseline finalize averaged about 4.29 s server-side and 1883 tokens
  - one-call streamed finalize locked winners at about 2.24 s on average, about 2.05 s earlier than baseline shortlist lock
  - full streamed completion averaged about 6.92 s server-side and 2534 tokens because badges/enrichment were generated later in the same stream
  - badge and enrichment phases preserved locked IDs/order in 5/5 cases
  - top result matched baseline in 5/5 cases; average winner overlap was 5.4/6
  - no stream parse errors or warnings occurred in the context5 run
  - local model routing used `gpt-5.4-nano` for baseline/stream finalize and reused stored `gpt-5-mini` prewarm priors; no model switch was made
  - Chat 2 prewarm-vs-no-prewarm stream comparison completed on context5
  - with prewarm: winners locked at about 2.59 s, full stream server time about 7.00 s, and about 2548 tokens
  - without prewarm: winners locked at about 2.33 s, full stream server time about 7.02 s, and about 2935 tokens
  - both variants completed 5/5 cases and preserved badge/enrichment locked order in 5/5 cases
  - top-result match vs baseline was 3/5 for both variants; average winner overlap favored prewarm at 5.6/6 vs 4.6/6
  - conclusion: prewarm is not justified as a streamed-finalize latency feature; if kept, it is a quality/cost hedge rather than a speed requirement
  - mini model-routing run `stream-prewarm-compare-context5-mini` also completed 5/5 cases with `OPENAI_FINALIZE_CONTEXT_MODEL=gpt-5-mini`
  - mini with prewarm locked winners at about 8.13 s, completed the full stream at about 19.14 s, and used about 2708 tokens
  - mini without prewarm locked winners at about 8.48 s, completed the full stream at about 19.08 s, and used about 3099 tokens
  - both mini variants completed 5/5 cases and preserved badge/enrichment locked order in 5/5 cases
  - mini top-result match vs baseline was 4/5 with prewarm and 1/5 without prewarm; average winner overlap was 5.0/6 with prewarm and 4.8/6 without prewarm
  - decision: `gpt-5-mini` is rejected for the one-call streamed finalize path because winners locked around 8.1-8.5 s and full stream completion was around 19 s
  - `gpt-5.4-nano` remains the only plausible fast streamed finalize model from current measurements
  - mini may still be useful later for asynchronous writing/enrichment only
  - current `/api/search/finalize` behavior remains unchanged

## Environment notes
- Required for live search/AI: `SERPAPI_API_KEY`, `OPENAI_API_KEY`.
- Optional model overrides: `OPENAI_MODEL`, `OPENAI_REFINEMENT_MODEL`, `OPENAI_FINALIZE_MODEL`, `OPENAI_FINALIZE_CONTEXT_MODEL`, `OPENAI_FINALIZE_EMPTY_MODEL`.
- Optional Supabase config: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`; legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted.
- `SEARCH_CACHE_TTL_MINUTES` defaults to `1440`.
- `npm run analytics:prewarm-summary -- --hours=24` prints a recent Supabase-backed prewarm summary.
- Work happens in PowerShell on Windows. Never print raw `.env` secret values.

## Recommended next task
- If continuing latency work, do the smallest harness-only version of the new nano-lock plus mini async-enrichment experiment.
- Scope: nano locks winners/badges fast, then mini writes nicer copy in a non-blocking second call.
- Do not wire frontend, do not implement product behavior, and do not redesign the architecture.
- Measure lock/badge latency, mini enrichment latency, tokens by model, locked-ID/order preservation, and obvious quality misses on the same context5 sample set.
- Keep measurement-only fields temporary:
  - `measurementPreparedQueryFraming`
  - `measurementSelectionMode: selection_only`
  - `measurementSelectionMode: winner_lock_ids_only`
