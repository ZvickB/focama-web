# Handoff

## Purpose
- Durable MVP/backlog tracker.
- Use `current-status.md` for the immediate snapshot and `app_flow.md` for current implemented behavior.
- Use `active-experiment-override.md` for the latest finalize/prewarm experiment conclusions.

## Current reality
- The frontend is live on Vercel; the backend is deployed on Render (configured via `render.yaml`).
- The homepage uses the `open` layout and the guided `/api/search/rainforest-discover -> /api/search/refine -> /api/search/finalize -> /api/search/enrichment` product path. `/api/search/discover` is the legacy SerpApi path, preserved for scripts and tests.
- Query framing is now question-fast only through `/api/search/refine`; the old `/api/search/framing-fields` lane is removed. Prewarm is fully removed (2026-04-17).
- `/api/search/retry-advice` is a live POST route — generates AI-powered suggested queries when users reject results, powering the "Search this instead" retry path.
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
- Provider-agnostic per-ASIN product-details caching now exists for finalize-time bullets/descriptions, with local file fallback when Supabase is not configured.
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
- Haiku-lock + mini async-enrichment is wired into the real product flow. Lock step uses claude-haiku-4-5-20251001.
- Prewarm is fully removed (2026-04-17). Not a latency win.
- gpt-5.4-nano was the best measured OpenAI fast model; the lock step now uses Haiku instead. Mini is still rejected for blocking/stream paths.
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
- **Pool mismatch detection + query nudge (escape hatch done; proactive detection not yet built):** the reactive half is wired — `/api/search/retry-advice` analyzes rejection feedback and suggests an editable new search query ("Search this instead") when the user signals the pool was wrong. The proactive half — detecting a pool-to-context mismatch *before* the user complains (e.g. searched "lego", context was "for a 9 year old" but pool was adult collector sets) and surfacing a nudge without waiting for explicit rejection — is still not designed or built.
- Keep rule-based filtering focused on removing junk, duplicates, and weak candidates rather than making the final shortlist by itself.
- Keep the textarea context/details as the main AI final-selection signal.
- Keep ratings and review counts as important supporting quality signals.
- Decide how much stronger rate limiting and abuse protection need to become before broader sharing.
- Add outbound retailer links once the search pipeline feels trustworthy enough.
- Decide how Amazon vs Walmart vs broader-provider support should work by tier without making the product feel provider-specific.
- Tighten privacy/compliance language if analytics stays enabled and affiliate behavior becomes real.
- Keep user-facing saved history separate from operational `search_history` if it is ever added.
- Watch rate limiting, cache TTL, and API costs as usage increases.
- Rainforest detail-fetch helper is implemented but still not wired into finalize. Current reality: `backend/server.js` still imports and calls `fetchOxylabsProductDetailsByAsin`. Future wiring should switch that import/call to `fetchRainforestProductDetailsByAsin` from `backend/lib/rainforest-pipeline.js` while keeping `readProductDetailsCacheEntries` / `writeProductDetailsCacheEntries` unchanged in `backend/lib/search-storage.js`.
- Continue trimming `backend/server.js` so request parsing, route orchestration, and flow logic do not all keep growing in one file.
- Long term, keep extracting runtime-agnostic backend services so the Vercel route layer can stay thin.

## Nice-to-have polish
- Do another small pass on result-card readability and image overlays.
- Continue polishing the default open homepage based on tester feedback.
- Add a tiny admin/debug view or lightweight internal tool for checking cache hit/miss behavior without one-off scripts.

## Open questions — not yet designed

**Using cached product details to improve AI picks (deferred)**
The finalize-time detail step now fetches full product details (feature bullets, description) for the 6 finalized picks through the current Oxylabs helper, backed by a provider-agnostic per-ASIN cache. Partial rows can be stored and refreshed later; fully empty provider results are skipped. Rainforest detail-fetch support now exists too, but it is intentionally not wired into finalize yet.

The harder question: as the ASIN detail cache grows, should the AI be fed cached details for candidates *before* it picks the final 6? The risk is selection bias — if only some candidates have cached details, the AI will naturally favor the better-documented ones regardless of actual fit. This is a real distortion, not a quality signal. It only works fairly if all candidates have details, or none do. Partial coverage actively skews decisions. Revisit once the cache is large enough that coverage is less sparse, and think carefully about how to handle the unevenness before wiring it into the AI prompt.

## Longer-term ideas after v1
- Add accounts/login only when persistence or personalization has a clear product need.
- Add saved searches as an explicit user-facing feature after v1, not by repurposing `search_history`.
- Explore preference learning later with consent, transparent controls, and lightweight signals from searches, rejects, priorities, and saved items.
- Start preference learning with structured signals before AI-first profiling.
- Treat learned preferences as secondary ranking/tie-breakers; current search intent and live query details should remain stronger.
- Use AI for preference learning only where it materially helps, such as interpreting free-text feedback.

## Filtering direction
- Rule-based filtering should clean the raw candidate pool first (Oxylabs/Rainforest for the primary path, SerpApi for the secondary fallback):
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
