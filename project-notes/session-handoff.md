# Session Handoff

## Purpose
- Fastest reset for a fresh Codex chat.
- This file should point to canonical notes instead of duplicating the whole project history.
- Broader backlog remains in `project-notes/handoff.md`.

## Startup read order
1. `AGENTS.md`
2. `project-notes/current-status.md`
3. `project-notes/app_flow.md`
4. `project-notes/finalize-strategy.md` before finalize or latency changes
5. `project-notes/active-experiment-override.md` when touching the current prewarm/finalize experiment
6. `project-notes/layered-latency-plan.md` when touching preferred latency architecture
7. `project-notes/handoff.md` only when planning broader MVP/backlog work

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
- `/api/search/prewarm` starts after usable candidates exist and stores a reusable candidate-aware prior.
- `/api/search/refine` returns one fast user-facing follow-up question.
- `/api/search/framing-fields` returns slower background framing fields for timing/debug visibility.
- `/api/search/finalize` reconstructs the rich candidate pool from guided discovery cache, locks the shortlist, and returns `finalizeFast` plus compatible `results`.
- Finalized card data is shortlist-safe: selected ids, core product facts, and one concise fit reason.
- Badge labels are frontend-owned after final results arrive.
- Drawback/caution copy is not part of the blocking finalized card payload.

## Current experiment status — CLOSED
All latency experiments are concluded. Decisions:
- **Prewarm: off.** Disabled in frontend as of 2026-04-14. Not a latency win, was blocking finalize for up to 23s. Backend route still exists for measurement only.
- **nano-lock + mini async-enrichment: validated.** Nano locks winners+badges at ~2s, mini enriches async at ~8-12s with honest-caveat tone. UX acceptable because cards show metadata only and AI copy lives in modal.
- **One-call stream: measured.** nano is the only viable fast model (~2.24s lock). mini is too slow for one-call stream (~8s lock, ~19s full).
- **Next step: wire nano-lock + mini async-enrichment into the real product flow.**

## What needs wiring (next implementation task)
1. Finalize returns nano shortlist fast (cards appear at ~2s)
2. Mini enrichment runs async server-side after nano lock
3. Frontend polls or receives enrichment and fills modal when ready
4. Split mini schema into `fit_reason` + `caveat` fields so both modal sections populate
5. Remove fit reason from blocking finalize card payload (cards = metadata only)
6. Remove `SIMULATE_ENRICHMENT_DELAY_MS` simulation from `HomeShared.jsx`

## Current real-world timings (no prewarm, fresh cache miss)
- Discover: ~6.5s (SerpApi ~5.3s cache miss; ~150ms on cache hit)
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
- Tests were not run this session — changes were harness/measurement/notes focused.
- Before wiring async enrichment, run existing tests first to confirm clean baseline:
  - `npm test -- backend/server.test.js`
  - `npm test -- api/search/routes.test.js`
- Write new tests as part of the wiring task, not after. Key things to cover:
  - nano lock returns correct IDs and badge labels
  - mini enrichment returns `fit_reason` + `caveat` fields and preserves order
  - finalize fast response no longer includes fit reason in card payload
  - new async enrichment endpoint returns enriched results for a valid discoveryToken
- A previous PowerShell rerun of `npm test -- api/search/routes.test.js` hit a Windows `EPERM` path-resolution error before Vitest ran — if that happens, retry once before investigating.

## Recent user preferences
- Minimal copy in the open layout.
- No chips in the open layout.
- Prefer the PNG wordmark unless explicitly revisiting branding.
- Stay production-minded without overengineering before v1 usage justifies it.
- For backend changes, explain request flow, data shape, and tradeoffs plainly.

## If continuing from here
- For product behavior questions, read `app_flow.md`.
- For measurement conclusions, read `active-experiment-override.md` plus `temp-data/layered-latency-measurement-summary.md` if resuming that exact line.
- For implementation planning, read `layered-latency-plan.md` and do one pending checklist step at a time.
- For the stream experiment, the mini-vs-nano decision is closed: keep nano as the only plausible fast stream model, reject mini for one-call streamed finalize, and keep prewarm out of the latency argument.
- For the next harness-only experiment, implement only the smallest nano-lock plus mini async-enrichment measurement path when asked; do not wire UI.
- Keep measurement-only fields temporary:
  - `measurementPreparedQueryFraming`
  - `measurementSelectionMode: selection_only`
  - `measurementSelectionMode: winner_lock_ids_only`
