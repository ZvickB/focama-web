# Finalize Stream Next Step

## Purpose
- Compact handoff for the next implementation chat.
- This note captures the approved next step only.
- Do not restart the architecture discussion from scratch.
- This is a temporary working note. Remove it or move it to `project-notes/archive/` after the stream experiment decision is captured in the canonical notes.

## Required startup reads
1. `AGENTS.md`
2. `project-notes/current-status.md`
3. `project-notes/session-handoff.md`
4. `project-notes/handoff.md`
5. `project-notes/finalize-strategy.md`
6. `project-notes/app_flow.md`
7. `project-notes/layered-latency-plan.md`
8. `project-notes/active-experiment-override.md`
9. `temp-data/split-finalize-clean-full-evidence-measurement-summary.md`
10. `temp-data/guided-finalize-measurement-split-finalize-clean-full-evidence-context5-v2.json`
11. This archived file: `project-notes/archive/finalize-stream-next-step-2026-04-14.md`

## User-approved next step
- Status: the temporary one-call finalize stream experiment is measured enough for the current decision.
- `gpt-5-mini` is rejected for the one-call streamed finalize path because winners locked around 8.1-8.5 s and full stream completion was around 19 s.
- Candidate-aware prewarm is still not justified as a latency feature.
- `gpt-5.4-nano` remains the only plausible fast one-call streamed finalize model from current measurements.
- Mini may still be useful later for asynchronous writing/enrichment only.
- The next experiment is separate from the one-call stream experiment: nano locks winners/badges fast, then mini writes nicer copy in a non-blocking second call.
- Do not wire frontend UI.
- Do not implement the new experiment unless explicitly asked.
- Do not redesign the whole architecture.
- Keep current `/api/search/finalize` behavior unchanged.

## Multi-chat execution plan
- Chat 1: Measurement and review only.
  - Read the required startup notes.
  - Inspect the existing `stream-clean` harness and route, but avoid broad refactors.
  - Run or extend the full context5 stream measurement.
  - Confirm the output includes the required stream timing, winner validity, order preservation, baseline comparison, and token fields.
  - Write a concise measurement summary under `temp-data/`.
  - Update canonical notes only with what was measured, not product claims.
- Chat 2: Prewarm vs no-prewarm stream comparison.
  - Add the smallest harness option needed to run the same stream path without candidate-aware prewarm evidence.
  - Measure stream-with-prewarm and stream-without-prewarm on the same sample set.
  - Compare `winners_locked` timing, total stream timing, tokens, top-result match, winner overlap, and quality notes.
  - Completed on 2026-04-14: no-prewarm locked winners slightly earlier, but used more tokens and had lower winner overlap. Prewarm did not earn a place as a latency feature.
- Chat 3: Decision cleanup.
  - Status: closed by measurement review.
  - Old Task 2, compare mini against nano: superseded by the practical decision captured here.
  - Old Task 3, recommend stream model/prewarm/productization: closed for now.
  - Decision: keep nano as the only plausible fast stream model; reject mini for one-call streamed finalize; do not justify prewarm as latency; do not productize or wire frontend from this branch yet.

## Next experiment task list
- [ ] `status: pending` Add the smallest harness-only mode for nano winner/badge lock followed by mini async enrichment.
- [ ] `status: pending` Reuse the existing context5 sample set and compare against prior nano one-call stream measurements.
- [ ] `status: pending` Measure nano lock time, badge-ready time, mini enrichment time, model-specific tokens, locked-ID/order preservation, and obvious quality misses.
- [ ] `status: pending` Write a concise `temp-data/` summary and update canonical notes before considering any product route or UI work.

## Stop conditions
- Stop after Chat 1 if `winners_locked` is not materially earlier than normal finalize or the shortlist quality is clearly worse.
- Stop after Chat 2 if prewarm makes `winners_locked` slower without clear quality benefit.
- Do not move to frontend wiring until a measurement summary says the streamed path is worth productizing.

## Architecture intent
- The now-closed stream experiment was one backend finalize request and one OpenAI streaming call.
- The next experiment is explicitly different: nano lock/badges first, then mini async enrichment in a second non-blocking measurement call.
- Do not use prepared-framing injection.
- Do not propose or implement deterministic badges unless the user explicitly asks.
- Keep code temporary and easy to delete.

## Historical one-call stream phases
1. `winners_locked`
   - selected candidate IDs only
   - IDs and order become final once emitted
2. `badges_ready`
   - badge labels for the same locked IDs
   - must preserve locked IDs and order
3. `enrichment_ready`
   - fit/tradeoff/caution writing for the same locked IDs
   - must preserve locked IDs and order
4. `done`

Optional measurement sub-event:
- `enrichment_entry` may be emitted before `enrichment_ready` if useful for measuring first/top enrichment timing.

## Recommended implementation shape
- Implemented: temporary stream selector/parser in `backend/lib/ai-selector.js`.
- Implemented: harness-only local route `POST /api/search/finalize-stream` in `backend/server.js`.
- Do not add a Vercel wrapper unless the user asks to expose the temporary stream route outside the local harness.
- Implemented: `backend/scripts/measure-guided-finalize.js --mode stream-clean`.
- Implemented: baseline finalize remains measured in the same run for quality comparison.

## Evidence path
- For the closed one-call stream experiment, the stream reused the same candidate-aware prior evidence path as current finalize / `winner_lock_ids_only`.
- For the next nano-lock plus mini async-enrichment experiment, do not assume candidate-aware prewarm as a latency feature.
- The intended selection change for the next experiment is model/work split only: nano locks winners/badges, mini enriches locked winners without re-ranking.
- Latest user follow-up context remains the strongest selection signal.
- Enrichment must explain locked winners only; it must never re-rank, add, remove, or reorder.
- Important evaluation caveat: current prewarm/prior reuse was a latency regression in the normal non-streamed finalize path, and the streamed comparison did not justify prewarm as a latency feature.
- Historical reason prewarm was tested:
  - Old failed question: can prewarm make normal non-streamed finalize faster?
  - Closed stream question: can prewarm help one streamed final model lock safe winner IDs earlier while later badges/enrichment continue in the same stream?
  - Prewarm is a cheat sheet for early winner locking, not a trusted final answer.
  - It did not earn a place as a latency feature.

## Fallback and validation
- Before `winners_locked`:
  - require valid JSON phase data
  - require known candidate IDs only
  - require unique IDs
  - require up to 6 locked IDs, ideally exactly 6 when enough candidates exist
  - if malformed or failed, mark the stream case as failed before lock
  - do not silently call normal finalize as a fallback in measurement, because that would pollute timings
- After `winners_locked`:
  - keep the locked shortlist usable even if later stream phases fail
  - reject or ignore malformed badge/enrichment entries
  - record partial/missing badge or enrichment output honestly
  - mark whether later phases preserved locked IDs and order

## Measurement fields for the next harness
- time to nano lock
- time to nano badges
- mini enrichment duration
- total client/server time for each stage
- tokens by model/stage
- selected candidate IDs
- result titles
- winner validity
- whether badges preserved locked IDs and order
- whether mini enrichment preserved locked IDs and order
- top-result match vs baseline
- winner overlap vs baseline
- obvious qualitative misses
- parse errors / phase warnings

## Current result status
- Temporary stream path is implemented and measured only.
- Small smoke measurement `stream-clean-smoke-small` completed 3/3 cases and showed average `winners_locked` around 1.9 s with badge/enrichment order preservation in 3/3.
- Full context5 stream measurement `stream-clean-context5` completed 5/5 cases and supported continuing to Chat 2.
- Full context5 prewarm-vs-no-prewarm measurement `stream-prewarm-compare-context5` completed 5/5 cases.
- Chat 2 conclusion: candidate-aware prewarm is not justified as a streamed-finalize latency feature; if kept, it should be treated only as an explicit quality/cost hedge.
- Chat 3 Task 1 mini model-routing run `stream-prewarm-compare-context5-mini` completed 5/5 cases with `OPENAI_FINALIZE_CONTEXT_MODEL=gpt-5-mini`.
- Mini with prewarm locked winners at about 8.13 s, completed the full stream at about 19.14 s, and used about 2708 tokens.
- Mini without prewarm locked winners at about 8.48 s, completed the full stream at about 19.08 s, and used about 3099 tokens.
- Mini comparison status:
  - Task 1 status: done
  - Task 2 status: superseded/closed: mini is rejected for the one-call streamed finalize path after practical comparison against nano timings
  - Task 3 status: superseded/closed: nano remains the only plausible fast stream model; prewarm is not a latency feature; no frontend/productization work from this branch yet

## Temporary cleanup expectation
- Keep this path temporary until measurement is reviewed.
- After the stream decision is captured, delete or explicitly keep:
  - temporary finalize stream route
  - stream selector/parser
  - `stream-clean` harness mode
  - older separate-call badge/enrichment measurement helpers if superseded
  - `measurementSelectionMode` variants that are no longer needed
- After cleanup, remove this file or move it to `project-notes/archive/` with a filename that makes clear it is historical.
