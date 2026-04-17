# Handoff

## Purpose
- Durable MVP/backlog tracker.
- Use `current-status.md` for the immediate snapshot and `app_flow.md` for current implemented behavior.
- Use `active-experiment-override.md` for the latest finalize/prewarm experiment conclusions.

## Current reality
- The app is live on Vercel.
- The homepage uses the `open` layout and the guided `/api/search/discover -> /api/search/refine -> /api/search/finalize -> /api/search/enrichment` product path.
- `/api/search/framing-fields` runs as a background lane; prewarm is being removed.
- `/api/search/live` remains an explicit manual/debug combined route.
- Product shortlists are 6 results.
- Rainforest API is the primary discovery endpoint; SerpAPI is preserved as secondary fallback.
- The backend prepares a cleaned candidate pool and uses AI to improve final shortlist selection.
- TanStack Query is used for homepage search request flow.
- Basic test coverage exists for backend behavior and homepage search flow.
- Input validation blocks obviously low-signal queries.
- Supabase-backed cache, rate limiting, operational history, health tooling, and optional funnel analytics exist with local fallback for development.
- Guided discovery is the only persistent cache path; guided finalize and live search are intentionally uncached.
- Supabase-backed guided discovery cache is confirmed working in production on `focama.vercel.app`.
- `search_history` is internal operational telemetry, not user-facing saved history.

## Canonical current notes
- Implemented behavior and route flow: `project-notes/app_flow.md`
- Immediate status and latest measurement summary: `project-notes/current-status.md`
- Active finalize strategy and guardrails: `project-notes/finalize-strategy.md`
- Current experiment override and measurement conclusions: `project-notes/active-experiment-override.md`
- Preferred layered latency plan/checklist: `project-notes/layered-latency-plan.md`
- Current Supabase table summary: `project-notes/db-needs.md`

## Latency and finalize status
Canonical detail: `project-notes/active-experiment-override.md` and `project-notes/layered-latency-plan.md`.

Summary:
- Nano-lock + mini async-enrichment is wired into the real product flow.
- Prewarm is disabled (not a latency win). Backend route being removed — see `agent-tasks/remove-prewarm.md`.
- `gpt-5.4-nano` is the only viable fast model; mini is rejected for blocking/stream paths.
- One-call stream experiment is measured and concluded; not yet productized.
- Working conclusion: keep AI in the product, narrow its blocking critical-path role.

## Next likely work
- Follow `project-notes/layered-latency-plan.md` one checklist step at a time.
- Use `npm run dev:all` at meaningful integration checkpoints.
- Commit after each completed narrow step when the user asks.

## Known remaining work
- Add loading states to improve the experience between steps — discover, refine question appearing, and results loading all need intentional loading treatment. Currently functional but unpolished. Do this after core architecture is settled.
- Watch how the feedback-based retry loop performs with real searches and tighten copy, friction, or retry cap only if testers treat it like browsing.
- Watch whether hard exclusion of rejected picks is too strict in small candidate pools; decide later whether to broaden discovery instead of reusing rejected items.
- Keep checking whether users understand that the first query should be the product search itself and the refine step is for narrowing.
- If retry ever exposes more of the preserved guided candidate set, do not let it become a generic `show more results` marketplace flow.
- Development is strict about missing guided `discoveryToken`; before broad production sharing, add or explicitly reject a controlled fallback for missing token state.
- Replace the current `About` destination with a `Why Focamai` page.
- Make header/nav links point to `Why Focamai` once that page exists.
- Add a clear home button to `Why Focamai`.
- After products load, add a concise explanation prompt such as `We think the best choice is X. Click to find out why.` Use tap-oriented wording on small screens.
- Improve low-confidence search handling so weak or ambiguous searches get a clearer fallback.
- Decide whether to add post-search quality checks in addition to current pre-search validation.
- **Pool mismatch detection + query nudge (not yet designed):** when finalize returns fewer than 6 strong picks and the follow-up context looks like it would have made a better first query (e.g. user searched "lego", context was "for a 9 year old" but the pool was all adult collector sets), the app should: (1) still show the closest available results so the screen isn't empty, and (2) offer an honest nudge like "These are the closest matches we found, but for better results try starting a new search with 'lego sets for kids'". The suggested query should be derived from the user's own follow-up context, not invented. Trigger only when the pool-to-context mismatch is clear — don't fire on strong shortlists. This directly addresses the case where the bare discovery query was too generic for the user's real intent.
- Keep rule-based filtering focused on removing junk, duplicates, and weak candidates rather than making the final shortlist by itself.
- Keep the textarea context/details as the main AI final-selection signal.
- Keep ratings and review counts as important supporting quality signals.
- Decide how much stronger rate limiting and abuse protection need to become before broader sharing.
- Add outbound retailer links once the search pipeline feels trustworthy enough.
- Decide how Amazon vs Walmart vs broader-provider support should work by tier without making the product feel provider-specific.
- Tighten privacy/compliance language if analytics stays enabled and affiliate behavior becomes real.
- Keep user-facing saved history separate from operational `search_history` if it is ever added.
- Watch rate limiting, cache TTL, and API costs as usage increases.
- Continue trimming `backend/server.js` so request parsing, route orchestration, and flow logic do not all keep growing in one file.
- Long term, extract runtime-agnostic backend services so Vercel routes stop adapting themselves into Node-style request objects.

## Nice-to-have polish
- Do another small pass on result-card readability and image overlays.
- Recheck mobile product-detail sheet behavior and CTA placement.
- Continue polishing the default open homepage based on tester feedback.
- Add a clearer empty/no-good-results state.
- Add a tiny admin/debug view or lightweight internal tool for checking cache hit/miss behavior without one-off scripts.

## Longer-term ideas after v1
- Add accounts/login only when persistence or personalization has a clear product need.
- Add saved searches as an explicit user-facing feature after v1, not by repurposing `search_history`.
- Explore preference learning later with consent, transparent controls, and lightweight signals from searches, rejects, priorities, and saved items.
- Start preference learning with structured signals before AI-first profiling.
- Treat learned preferences as secondary ranking/tie-breakers; current search intent and live query details should remain stronger.
- Use AI for preference learning only where it materially helps, such as interpreting free-text feedback.

## Filtering direction
- Rule-based filtering should clean the raw SerpApi pool first:
  - remove garbage
  - remove duplicates or near-duplicates
  - down-rank weak listings
- Keep a larger cleaned candidate set for AI instead of collapsing too early.
- AI should choose/refine the shortlist using:
  - product query
  - user context/details as the main fit signal
  - ratings and review counts as quality signals
  - source, price, and diversity across plausible options

## Good enough for this MVP phase
- A user can open the live app, search for a real product need, and get 6 sensible results without errors.
- Obviously bad input is blocked with a helpful message.
- The shortlist feels more context-aware than raw search results and mentions meaningful tradeoffs when useful.
- The app does not feel tied to one marketplace.
- The deployed experience is stable enough that the next work can focus on product quality rather than infrastructure.
