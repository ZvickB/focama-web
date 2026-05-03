# Session Handoff

## Purpose
- Fastest reset for a fresh Codex chat.
- This file should point to canonical notes instead of duplicating the whole project history.
- Broader backlog remains in `project-notes/handoff.md`.

## Startup read order
1. `AGENTS.md`
2. `project-notes/current-status.md`
3. `project-notes/app_flow.md`
4. `project-notes/layered-latency-plan.md` when touching preferred latency architecture
5. `project-notes/handoff.md` only when planning broader MVP/backlog work

## Current direction
- `/` uses the `open` homepage layout.
- The product should stay calm, focused, mobile-first, and not marketplace-shaped.
- The PNG wordmark is preferred for now.
- Shortlists are 6 results end to end.
- The guided backend path is primary; `/api/search/live` is manual/debug only.
- Current implemented behavior is canonical in `project-notes/app_flow.md`.

## Important files
- Main app routes and loading fallback: `/src/App.jsx`
- Active homepage layout: `/src/components/home/HomeExperience.jsx`
- Shared homepage UI blocks: `/src/components/home/HomeShared.jsx`
- Shared guided-search logic/state: `/src/components/home/useGuidedSearch.js`
- Shared layered contract helpers: `/backend/lib/layered-contracts.js`
- Query-framing lanes: `/backend/lib/query-framing.js`
- Site header/nav/logo usage: `/src/components/SiteLayout.jsx`
- Default homepage route file: `/src/pages/HomePage.jsx`
- Current DB table summary: `/project-notes/db-needs.md`
- Optional analytics schema: `/project-notes/analytics-funnel-schema.sql`

## Current guided flow
- `/api/search/discover` builds the candidate pool and preview set.
- `/api/search/prewarm` is fully removed (2026-04-17).
- `/api/search/refine` returns one fast user-facing follow-up question.
- Query framing now runs only through `/api/search/refine`; the old `/api/search/framing-fields` background lane is removed.
- `/api/search/finalize` reconstructs the rich candidate pool from guided discovery cache, locks the shortlist via haiku (claude-haiku-4-5-20251001), fetches product details for the locked winners through the current Oxylabs helper, then returns `flowPath: 'haiku_lock'` plus shortlist cards that now include `feature_bullets` when available.
- `/api/search/enrichment-stream` SSE is now registered in the Render Express entrypoint and is active for live enrichment pushes; polling remains the fallback path.
- `/api/search/enrichment` GET — frontend polls with `?token=&query=` until `ready: true` then merges `fit_reason`/`caveat` into results.
- Grid cards still stay metadata-only on the surface: image, title, source, price, ratings, badge label. No AI copy.
- Product detail modals can now show `feature_bullets` immediately from finalize, while AI copy (`fit_reason`, `caveat`) still arrives via enrichment polling.
- Badge labels are frontend-owned and assigned deterministically after shortlist arrives.
- Finalize-time detail fetches now use a provider-agnostic per-ASIN cache. Partial cached rows can be returned immediately and refreshed later in the background without blocking the response.
- Discovery diversification rule is intentionally path-specific: keep the per-source cap for Serp/multi-merchant shopping, but disable it for Amazon-only paths (Rainforest, Oxylabs, later direct Amazon API) so those searches do not get stuck at 2 items.

## Current experiment status — CLOSED AND WIRED
All latency experiments are concluded and wired into the real product flow. Decisions:
- **Prewarm: off and removed.** Fully deleted from codebase 2026-04-17.
- **haiku-lock + mini async-enrichment: live.** Haiku (claude-haiku-4-5-20251001) locks winners at ~2s (cards appear), mini enriches async at ~8-12s (modal AI copy arrives via polling).
- **One-call stream: measured but not wired.** gpt-5.4-nano was the only viable fast OpenAI model measured; the lock step now uses Haiku instead.

## What was wired (completed 2026-04-14)
1. `/api/search/finalize` uses nano to lock shortlist fast, fires mini enrichment async after responding
2. `/api/search/enrichment` GET endpoint — frontend polls this for enrichment readiness
3. Mini enrichment schema uses `fit_reason` + `caveat` as separate fields
4. Cards = metadata only (no AI copy). Modal shows `fit_reason` + `caveat` when enrichment arrives
5. `HomeShared.jsx` modal shows `feature_bullets` immediately when present, and still shows a placeholder until AI enrichment is ready (`enrichmentReady = Boolean(item?.fit_reason)`)
6. Enrichment stored in discovery cache `selection.enrichment` field — no new DB tables needed

## Current real-world timings (no prewarm, fresh cache miss)
- Discover: ~6.5s (Rainforest cache miss; ~150ms on cache hit)
- Refine: ~1.7s
- Framing fields: ~4.4s (background, doesn't block)
- Finalize: ~4.3s (OpenAI ~3.7s)

## Brand and loading notes
- Master logo: `/src/assets/logo_master_version.svg`
- Small header logo: `/src/assets/logo_header_mark.svg`
- Preferred wordmark: `/src/assets/wordmark.PNG`
- Attempted SVG wordmark exists but is not preferred: `/src/assets/wordmark.svg`
- Boot splash lives in `/index.html`, shows `Focused shopping`, and fades after app readiness plus minimum display time.

## Testing state
- 101 tests passing as of 2026-04-17. All suites green.
- Prewarm tests removed; stale `personalising explanation` loading text assertion updated to match skeleton shimmer UI.
- `window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__ = true` is set in all `HomePage.test.jsx` beforeEach calls to suppress background polling in tests.

## Recent user preferences
- Minimal copy in the open layout.
- No chips in the open layout.
- Prefer the PNG wordmark unless explicitly revisiting branding.
- Stay production-minded without overengineering before v1 usage justifies it.
- For backend changes, explain request flow, data shape, and tradeoffs plainly.

## If continuing from here
- For product behavior questions, read `app_flow.md`.
- For measurement conclusions, read `active-experiment-override.md` (experiment history) or `current-status.md`.
- For implementation planning, read `layered-latency-plan.md` and do one pending checklist step at a time.
- All latency experiments are concluded. Nano-lock + mini async-enrichment is the wired product path.
- Pending cleanup: remove `measurementPreparedQueryFraming`, `measurementSelectionMode: selection_only/winner_lock_ids_only`, the local `/api/search/finalize-stream` route, and `stream-clean` harness mode — see `todo.md`.

## Deployment note
- Current backend deployment is **Render** (configured via `render.yaml`; starts `backend/express-server.js`).
- Frontend is still on Vercel and calls the Render backend directly through `VITE_BACKEND_URL`.
- The `api/` directory now intentionally keeps only `api/geo.js`, which stays on Vercel so the frontend can read Vercel geolocation headers through a relative path.
- `GET /api/ping` is still used for the first-focus warmup probe.

## Active exploration — Oxylabs as cheap Rainforest substitute (2026-04-19)
- Goal: test whether Oxylabs can replace Rainforest `type=product` calls for the dual-endpoint enrichment flow during development, before paying Rainforest credits closer to launch.
- Feasibility test completed — Oxylabs works. Bullets, brand, specs all present.
- Current reality: finalize is still wired to `fetchOxylabsProductDetailsByAsin` in `backend/server.js`, but both Oxylabs and Rainforest detail helpers now read/write the same provider-agnostic ASIN cache via `backend/lib/search-storage.js`.
- Planned future wiring: switch the finalize import/call site in `backend/server.js` from `fetchOxylabsProductDetailsByAsin` to `fetchRainforestProductDetailsByAsin` from `backend/lib/rainforest-pipeline.js`. Do not change the cache helper wiring when making that swap.
- Full results and next steps: `project-notes/rainforest-strategy/oxylabs-feasibility.md`
- Raw samples saved: `temp-data/oxylabs-samples/`
- Test script: `backend/scripts/test-oxylabs.js`
- Credentials: `OXYLABS_USERNAME` / `OXYLABS_PASSWORD` in `.env`
- All 3 gaps resolved (reviews_count, category, link prefix) and normalizer functions written (`backend/lib/oxylabs-normalizer.js`).
- Re-entry files/functions for the later provider swap:
  - `backend/server.js` — import list and finalize route call site
  - `backend/lib/rainforest-pipeline.js` — `fetchRainforestProductDetailsByAsin`
  - `backend/lib/search-storage.js` — `readProductDetailsCacheEntries` / `writeProductDetailsCacheEntries`
- Cached detail rows are not fed into the AI shortlist-selection prompt. They only support post-lock product facts for the already-selected ASINs.
