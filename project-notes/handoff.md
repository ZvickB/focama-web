# Handoff

## Purpose
- This file is the running checklist for what still needs to be done until the MVP feels complete.
- It should be more durable than `current-status.md`, which is for the immediate next step.
- Update this file whenever a meaningful chunk of work is finished or a new requirement becomes clear.

## Current reality
- The app is live on Vercel.
- The homepage uses the guided `/api/search/discover -> /api/search/refine -> /api/search/finalize` flow.
- The default homepage is now the `open` layout, with alternate variants preserved for comparison.
- The staged/persisted finalize experiment was archived off `main`; the reset baseline is now the active branch state again.
- SerpApi is wired through Vercel functions.
- The backend prepares a cleaned candidate pool and uses AI to improve the final shortlist.
- Product shortlists are now 6 results instead of 4.
- Basic test coverage exists for backend behavior and homepage search flow.
- Input validation now blocks obviously low-signal queries.
- TanStack Query is installed and used for the homepage search request flow.
- The result cards and modal surface drawbacks/tradeoffs as well as reasons.
- Basic IP-based rate limiting exists on the search endpoints, including `/api/search/finalize`, and now prefers a shared Supabase-backed limiter when available.
- Supabase-backed cache/operational-history storage and health tooling now exist, with local fallback for development.
- Optional Supabase-backed funnel analytics wiring now exists for guided-search path choice, result impressions, and retailer click-throughs.
- Guided discovery is the only persistent cache path; `/api/search/live` remains only as the explicit manual/debug combined route.
- Supabase-backed guided discovery cache is now confirmed working in production on `focama.vercel.app`.
- Guided `/api/search/finalize` and `/api/search/live` remain intentionally uncached.
- The reset baseline was measured on 2026-03-30:
  - refine average latency: about 3.4 s
  - refine average total tokens: about 318
  - finalize average latency: about 16.1 s
  - finalize average total tokens: about 5485
  - full guided-search average total tokens: about 5803
- The active strategy note for future finalize work is now `project-notes/finalize-strategy.md`.
- The first rebuild step is now complete:
  - refine now asks AI for only one short question
  - helper text and placeholder copy are static server-side strings
  - refine now uses minimal reasoning effort
  - guided discovery/refine/finalize emit structured `[search-flow]` logs
- Re-measured refine on 2026-03-30 after the slimming step:
  - average latency: about 1.1 s
  - average total tokens: about 172
- The second rebuild step is now complete:
  - finalize prompt weight was reduced without changing the guided product flow
  - top-level search-state/similar-query prompt text was removed
  - backend-only match-signal and duplicate numeric-price fields were removed from each AI candidate summary
  - trust metadata was flattened to a single `trustScore`
  - the candidate JSON block is now minified before it is sent to OpenAI
- A follow-up conservative finalize-prompt trim is now also complete:
  - removed the standalone `Prioritize:` heading
  - merged diversity and near-duplicate guidance into one line
  - removed the redundant allowed badge-label line
  - shortened the badge-strategy sentence while keeping the explicit `Best match` rule
- Re-measured finalize on 2026-03-30 after the slimming step:
  - average latency: about 13.9 s
  - average total tokens: about 5403
  - average full guided-search total tokens: about 5574
- A compact in-request shard-scoring finalize experiment was implemented, measured, and then rolled back after regression.
- Re-measured finalize on 2026-03-30 after the shard-scoring step:
  - average latency: about 16.9 s
  - average total tokens: about 6139
  - average full guided-search total tokens: about 6311
- Guided finalize is now back on the slimmer one-shot selector as the active baseline after that regression.
- The next narrow rebuild step is now complete:
  - blocking finalize results were slimmed so each pick keeps one concise fit reason
  - badge reasons were removed from the blocking finalize contract
  - drawback/caution text stays available but was moved off the card grid and into the modal
  - the guided flow, one-shot finalize baseline, and retry behavior were unchanged
- The next narrow rebuild step is now complete:
  - homepage messaging now more clearly tells users to start with the product search itself, closer to what they would type into Google
  - the refine step is now framed more explicitly as the place for natural-language narrowing such as budget, size, comfort, style, or use case
  - AI badge-label assignment was removed from the blocking finalize response
  - finalized results now get deterministic frontend badge labels after load, with a slight delayed reveal so results paint before badge polish
  - this stays inside the current guided flow and does not re-expand blocking finalize work
- The next narrow rebuild step is now complete:
  - guided discovery filtering now collapses a narrow slice of clearly redundant same-family same-variant listings before the AI pool is built
  - the collapse is intentionally conservative: matching duplicate-family key and matching variant signature, plus same merchant or near-same price
  - broader or meaningful family differences should still remain available to the AI shortlist step
- The broader prerank-artifact architecture is now implemented on top of the current guided flow:
  - the homepage starts one background `/api/search/prewarm` request after guided discovery completes
  - that prewarm generates a reusable preranked artifact from the full candidate pool and stores it back into the guided discovery cache entry
  - empty-note focused picks prefer direct artifact reuse
  - refined-note and retry finalize requests prefer a lighter intent-match rerank over the stored artifact
  - guided finalize falls back to the older one-shot selector when reuse is missing or unusable, and now returns/logs explicit reuse/fallback metadata
- The user later clarified that the primary success criterion for this experiment is the context-added finalize path, not the empty-notes path.
- Live reruns on 2026-03-31 showed:
  - empty-notes finalize after prewarm: about 0.5 s
  - refined finalize with follow-up context: about 8.8 s to 12.0 s after submit
  - retry with feedback: about 17.0 s after submit
  - refined and retry requests did reuse the artifact, but they still paid for a fresh heavy OpenAI rerank call
- Treat the current prerank-prewarm branch as useful groundwork plus a partial experiment result:
  - it proved artifact reuse, observability, and the empty-notes shortcut
  - it did not materially solve the main context-latency route the user cared about most
- `project-notes/active-experiment-override.md` is now the highest-priority note for this experiment when it conflicts with older finalize guidance.
- A scoped follow-up model-routing change is now implemented:
  - context-added guided finalize defaults to a faster `gpt-5.4-nano` lane
  - empty-note finalize stays on the baseline finalize lane
  - `OPENAI_FINALIZE_CONTEXT_MODEL` and `OPENAI_FINALIZE_EMPTY_MODEL` can override those lanes explicitly
  - guided finalize debug/response metadata now reports which model lane was used
- Cached same-query finalize was re-measured on 2026-03-30 after removing AI badge-label assignment from the blocking finalize step:
  - finalize average latency: about 7.5 s
  - finalize average OpenAI time: about 7.0 s
  - finalize average total tokens: about 2479
  - full guided-search average total tokens: about 2651
  - compared with the prior cached baseline, finalize improved by about 2.5 seconds on average and crossed the under-8-second finalize milestone the user was aiming for
- A separate fresh-discovery rerun was also captured after the conservative family-collapse pass:
  - fresh finalize average latency: about 10.8 s
  - fresh finalize average total tokens: about 2617
  - that run should be treated as directional only because live discovery changed the candidate pools again
  - the strongest confirmed win from this session is the badge-scope reduction; the exact latency impact of the conservative family-collapse pass is still not isolated yet

## Next likely work
- Follow `project-notes/active-experiment-override.md` first for the current prewarm/finalize experiment.
- Start the next attempt from the current branch, not a full rollback, because the prewarm route, artifact storage, logging, and tests are useful groundwork.
- Do not treat the current refined/retry artifact-intent-rerank behavior as the validated answer for the main latency goal.
- The next attempt should optimize the context-added finalize path first; empty-notes wins are secondary.
- Re-measure the new context-model routing on the same sample queries and compare both latency and shortlist quality before widening the rollout further.
- `npm run analytics:prewarm-summary -- --hours=24` is still available for a quick Supabase-backed summary of prewarm usage, waste, and timing.
- Re-measure the same sample queries after each step.
- Broader orchestration changes for this experiment are user-approved when they are needed to test the real intended idea, but they should still be deliberate and clearly documented.
- Add smarter structured logging during the rebuild so route mode, latency, token use, candidate counts, and ranking ownership stay visible as the flow changes.
- Use `npm run dev:all` at meaningful integration checkpoints instead of waiting until many steps pile up.
- Commit after each completed narrow step so rollback stays easy and architecture drift is easier to catch.

## Known remaining work
- Watch how the new feedback-based retry loop performs with real searches and tighten the copy, friction, and retry cap only if testers start treating it like a browse loop.
- Watch whether hard exclusion of rejected picks is too strict in small candidate pools, and decide later whether to broaden discovery rather than reusing rejected items.
- Clarify the intended user search flow in homepage/refine copy:
  - keep watching whether users now understand that the first query should feel like what they would normally type into Google for the product they want
  - keep watching whether the refine step explanation is clear enough that users treat it as narrowing, not a full query rewrite
- The broader cleaned guided candidate set is now preserved server-side in guided discovery cache for finalize/retry reconstruction; if a later retry path exposes more of that context, do not let it quietly turn into a generic `show more results` marketplace-style browse flow.
- Development is currently strict about missing guided `discoveryToken` state so frontend/backend contract drift fails loudly; before shipping to production, add or explicitly reject a controlled resilience fallback for missing token state so users do not hit a dead-end if discover/finalize state drifts in the wild, but do not mask real integration bugs during development.
- Replace the current `About` destination with a `Why Focamai` page that explains what the product is for and how to use it.
- Make sure any header/nav link that currently points people to `About` lands on `Why Focamai` instead.
- The `Why Focamai` page should include a clear home button so users can easily return to the homepage.
- Right after products load on the homepage, add a clear explanation prompt such as `We think the best choice is X. Click to find out why.` On small screens, use tap-oriented wording instead of click-oriented wording.
- Improve low-confidence search handling so weak or ambiguous searches get a clearer fallback instead of merely plausible results.
- Decide whether to add post-search quality checks in addition to the current pre-search validation.
- Keep the rule-based filter focused on removing junk, duplicates, and weak candidates rather than trying to make the final shortlist by itself.
- The AI final-selection step should keep using the textarea context/details as the main decision signal.
- Ratings and review counts should remain important supporting quality signals in the AI handoff, alongside relevance, price, source, and diversity.
- Decide how much stronger the current rate limiting / abuse protection needs to become before broader sharing.
- Add outbound retailer links once the search pipeline feels trustworthy enough.
- Decide how Amazon vs Walmart vs broader-provider support should work by tier without making the product feel provider-specific.
- Tighten privacy/compliance language if analytics stays enabled and as affiliate behavior becomes real.
- Keep search history operational-only for now; if user-facing saved history is ever added, build it as a separate product feature and data model instead of exposing the current telemetry table.
- Keep an eye on rate limiting, cache TTL strategy, and API costs once usage increases.
- Continue trimming `backend/server.js` so request parsing, route orchestration, and flow-specific logic are not all growing in the same file.
- The Vercel bridge is acceptable for now, but the long-term cleanup path should be extracting runtime-agnostic backend services so Vercel routes stop adapting themselves into Node-style request objects.

## Nice-to-have polish
- Do another small pass on result-card readability and image overlays.
- Recheck the mobile product-detail sheet behavior and CTA placement.
- Continue polishing the default open homepage based on tester feedback.
- Add a clearer empty / no-good-results state.
- Add a tiny admin/debug view or lightweight internal tool for checking cache hit/miss behavior without one-off scripts.

## Longer-term ideas after v1
- Add user accounts/login only when there is a clear product need for persistence and personalization rather than just infrastructure completeness.
- Add saved searches as an explicit user-facing feature after v1 instead of repurposing the current operational `search_history` telemetry table.
- Explore preference learning/personalization later, but design it explicitly around user consent, transparent controls, and lightweight signals from searches, rejects, stated priorities, and saved items rather than hidden black-box profiling.
- If preference learning is added, start with structured signals instead of AI-first profiling. Examples: repeated clicks on `best price`, `best reviews`, or similar result traits; repeated rejections tied to price, brand, size, or use-case mismatch; and lightweight stored preference variables per user.
- Treat learned preferences as a secondary ranking/tie-breaker signal, not the main decision-maker. Current search intent and the user's live query details should stay stronger than long-term history.
- Use AI for preference learning only where it materially helps, such as interpreting free-text feedback or incorporating saved preference signals into later ranking. Do not assume preference memory alone will create a major response-quality jump.

## Filtering direction
- Rule-based filtering should clean the raw SerpApi pool first:
  - remove garbage
  - remove duplicates / near-duplicates
  - down-rank weak listings
- The backend should keep a larger cleaned candidate set for AI instead of collapsing too early.
- AI should then choose or refine the final shortlist using:
  - product query
  - user context/details as the main fit signal
  - ratings and review counts as important quality signals
  - diversity across plausible options

## Definition of "good enough for this MVP phase"
- A user can open the live app, search for a real product need, and get 6 sensible results without errors.
- Obviously bad input is blocked with a helpful message.
- The shortlist should feel more context-aware than raw search results and should mention meaningful tradeoffs when useful.
- The app does not feel tied to one marketplace even if affiliate priorities differ behind the scenes.
- The deployed experience is stable enough that the next work can focus on product quality rather than infrastructure.

## Temporary-only note
- Any local cache, saved query list, or evaluation dataset used during development is temporary tooling only.
- It is not the long-term product storage model.
- Before launch or before real user history matters, this temporary data approach should be removed, replaced, or clearly isolated behind the proper persistent design.
- The existing `search_history` table should stay limited to operational logging and should not quietly become that persistent user-history design.
