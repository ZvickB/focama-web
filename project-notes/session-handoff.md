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

## Current experiment read
- Canonical experiment details are in `project-notes/active-experiment-override.md`.
- The primary latency goal is the context-added finalize path, not empty-notes finalize.
- The current prewarm implementation is useful groundwork but not the final validated solution.
- Prepared framing injected into the current finalize call is paused as a simple injection strategy because quality was mixed and token cost increased.
- A thinner selection-only shortlist-lock pass materially improved speed but did not preserve quality consistently enough to validate the exact payload.
- A cleaner full-evidence ids-only winner-lock pass then averaged about 2.45 s server-side, kept the same candidate-aware prior evidence path, and matched baseline top result in 5/5 cases; continue cautiously because post-lock badge/enrichment cost is still high.
- Important correction: that clean split run measured separate AI calls for winner lock, badges, and enrichment. The next measured pass became one streamed finalize AI session with ordered events: `winners_locked`, `badges_ready`, `enrichment_ready`, and `done`.
- That one-call stream pass is now measured; the new next experiment is separate: nano lock/badges first, then mini async enrichment in a harness-only second call.
- The current open question is quality-preserving shortlist locking near or under the corrected about-6000 ms target.

## Current planning read
- Canonical layered plan: `project-notes/layered-latency-plan.md`.
- Completed groundwork:
  - thin contracts for query framing, candidate-aware prewarm, finalize-fast, and enrichment
  - query framing split into `question_fast` and `framing_fields`
  - discover, question-fast refine, and background framing-fields start independently
  - candidate-aware prewarm starts only after usable candidates exist
  - finalize returns a `finalizeFast` contract plus compatible `results`
- Current temporary harness step:
  - `POST /api/search/finalize-stream` exists on the local Node server only and is not wired to UI or Vercel
  - `backend/scripts/measure-guided-finalize.js --mode stream-clean` compares baseline finalize against the one-call streamed finalize path in the same run
  - small smoke measurement `stream-clean-smoke-small` completed 3/3 cases
  - full context5 measurement `stream-clean-context5` completed 5/5 cases: average `winners_locked` was about 2.24 s vs baseline shortlist lock about 4.29 s, later badge/enrichment phases preserved locked order in 5/5, top result matched baseline in 5/5, and average winner overlap was 5.4/6
  - full stream completion averaged about 6.92 s server-side and about 2534 tokens
  - Chat 2 prewarm-vs-no-prewarm context5 measurement completed: no-prewarm locked winners about 265 ms earlier, but full stream completion was effectively tied, no-prewarm used about 387 more tokens, and winner overlap was worse at 4.6/6 vs 5.6/6 with prewarm
  - conclusion: prewarm is not justified as a streamed-finalize latency feature; if kept, frame it as an explicit quality/cost hedge
  - Chat 3 mini model-routing measurement completed with `OPENAI_FINALIZE_CONTEXT_MODEL=gpt-5-mini`: with prewarm winners locked about 8.13 s and full stream about 19.14 s; without prewarm winners locked about 8.48 s and full stream about 19.08 s; both completed 5/5 and preserved later-phase locked order
  - decision: `gpt-5-mini` is rejected for the one-call streamed finalize path because it is far too slow for the lock and full-stream targets
  - `gpt-5.4-nano` remains the only plausible fast one-call streamed finalize model from current measurements
  - mini may still be useful later for asynchronous writing/enrichment only
  - next experiment is separate from the one-call stream experiment: nano locks winners/badges fast, then mini writes nicer copy in a non-blocking second call
  - do not wire frontend, do not implement the new experiment until explicitly asked, and do not redesign the whole architecture

## Brand and loading notes
- Master logo: `/src/assets/logo_master_version.svg`
- Small header logo: `/src/assets/logo_header_mark.svg`
- Preferred wordmark: `/src/assets/wordmark.PNG`
- Attempted SVG wordmark exists but is not preferred: `/src/assets/wordmark.svg`
- Boot splash lives in `/index.html`, shows `Focused shopping`, and fades after app readiness plus minimum display time.

## Testing state
- Recent relevant backend tests have passed in earlier passes:
  - `npm test -- backend/server.test.js`
  - `npm test -- api/search/routes.test.js`
- A later PowerShell rerun of `npm test -- api/search/routes.test.js` hit a Windows `EPERM` path-resolution error before Vitest ran.

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
