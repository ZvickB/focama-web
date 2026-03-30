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
- The current planning note for the next rebuild pass is `project-notes/fast-flow-reset-plan.md`.
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
- Re-measured finalize on 2026-03-30 after the slimming step:
  - average latency: about 13.9 s
  - average total tokens: about 5403
  - average full guided-search total tokens: about 5574
- The third rebuild step is now complete:
  - guided finalize now tests compact in-request parallel shard scoring for larger candidate pools
  - shard work stays inside one finalize request
  - the backend merges shard scores deterministically into the final shortlist
  - finalize telemetry now records whether selection used `single_pass` or `parallel_shards`
- Re-measured finalize on 2026-03-30 after the shard-scoring step:
  - average latency: about 16.9 s
  - average total tokens: about 6139
  - average full guided-search total tokens: about 6311

## Next likely work
- Follow `project-notes/fast-flow-reset-plan.md`.
- Next, decide whether the shard-scoring experiment is worth keeping for shortlist quality evaluation or whether finalize should go back to the slimmer one-shot selector.
- Re-measure the same sample queries after each step.
- Do not reintroduce persisted finalize orchestration or polling unless the user explicitly approves that tradeoff.
- Add smarter structured logging during the rebuild so route mode, latency, token use, candidate counts, and ranking ownership stay visible as the flow changes.
- Use `npm run dev:all` at meaningful integration checkpoints instead of waiting until many steps pile up.
- Commit after each completed narrow step so rollback stays easy and architecture drift is easier to catch.

## Known remaining work
- Watch how the new feedback-based retry loop performs with real searches and tighten the copy, friction, and retry cap only if testers start treating it like a browse loop.
- Watch whether hard exclusion of rejected picks is too strict in small candidate pools, and decide later whether to broaden discovery rather than reusing rejected items.
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
