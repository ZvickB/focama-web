# Active Experiment Override

## Purpose
- Highest-priority source of truth for the current prewarm/finalize experiment.
- Scoped to this experiment only; it is not a blanket override for unrelated product or architecture work.
- Use `project-notes/layered-latency-plan.md` as the forward implementation plan.
- Use this file for the latest experiment conclusions and for conflicts with older finalize-strategy guardrails.

## Priority
- For this experiment, follow this file when it conflicts with older finalize-strategy guardrails or older handoff wording.
- For new layered latency implementation work, follow `layered-latency-plan.md` first and use this note as supporting context.
- If future work changes the approved direction again, update this file and the linked handoff/status notes in the same pass.

## Approved implementation context
- The deep planning pass is complete in `layered-latency-plan.md`.
- Future chats should usually be medium-reasoning implementation passes against that plan, not fresh architecture redesign passes.
- Use the repo's current architecture as the starting point, but do not let older guardrails force this experiment back into a narrower shape than the user approved.
- Architecture changes are approved for this experiment.
- Multiple preparatory AI lanes are approved before finalize, such as question-fast, framing-fields, and candidate-aware prewarm.
- The one-call streamed finalize experiment has a measured model decision now: `gpt-5.4-nano` remains the only plausible fast stream model from current measurements, while `gpt-5-mini` is rejected for the one-call stream path.
- The next approved experiment is separate from the one-call stream experiment: let nano lock winners/badges fast, then let mini write nicer copy in a non-blocking second call.
- Keep that next step harness-only until explicitly approved for product work: do not wire frontend, do not add a Vercel wrapper, and do not redesign the broader architecture.
- Keep the stronger current finalize model path as the baseline unless the user explicitly chooses a model-routing experiment.
- The old narrow skip-prewarm experiment is parked/disabled by default and is not the active direction.

## Goal
- The core goal is the context-added finalize path, not the empty-notes path.
- Success means the second-stage path after user follow-up context becomes meaningfully cheaper/faster because it builds on prior work instead of effectively starting over.
- Empty-notes reuse is a useful extra, not the main validation target.

## Intended shape
- After guided discovery, do first-pass AI work on the real candidate pool.
- Store reusable candidate-aware structure or priors, not a full final answer.
- When the user adds follow-up or retry context, the completed one-call stream experiment tested one streamed OpenAI session, not separate winner/badge/enrichment AI calls.
- In that streamed finalize session, latest user context should outweigh earlier broad ranking signals.
- The stream should emit ordered, validated phase events:
  1. `winners_locked`: selected candidate IDs only, validated and treated as final
  2. `badges_ready`: badge labels for the same locked IDs
  3. `enrichment_ready`: fit/tradeoff/caution writing for the same locked IDs
  4. `done`
- Once `winners_locked` is emitted, later phases must never add, remove, reorder, or re-rank winners.
- The streamed second stage should materially build on candidate-aware prior evidence rather than replaying a fresh heavy ranking call with stored notes stuffed into prompt context.

## What this experiment is not
- Not simple model-lane switching by itself.
- Not solving context-added latency only by routing refined/retry finalize to a faster model while leaving the underlying architecture question unresolved.
- Not permission to make refined/retry a nano-only shortcut unless the user explicitly chooses that as a separate experiment.
- For the now-closed one-call stream experiment, not a request to implement badges and enrichment as separate post-lock OpenAI calls.
- For the new nano-lock plus mini async-enrichment experiment, a second mini call is allowed only as harness-only non-blocking enrichment after nano has already locked winners/badges.
- Not a request to switch to deterministic badges unless the user explicitly asks for that fallback.
- Not proof that planned layered behavior is already implemented; check `app_flow.md` for current behavior.

## What was implemented and learned
- Implemented groundwork includes `/api/search/prewarm`, candidate-aware prior storage, frontend prewarm wiring, structured debug metadata/logging, and prior reuse/fallback paths.
- The older direct-artifact/prerank branch improved empty-notes finalize substantially.
- Refined/retry paths still paid for fresh heavy OpenAI rerank work and did not materially solve the main context-added latency goal.
- Treat current prewarm as useful groundwork plus a partial experiment result, not the final validated solution.
- Query framing is now split into question-fast and background framing-fields lanes.
- Finalize now returns a `finalizeFast` contract plus compatible `results`.
- Enrichment remains planned, not implemented as a separate product layer.

## Measurement conclusions
- Reset baseline on 2026-03-30:
  - refine averaged about 3.4 s and 318 tokens
  - finalize averaged about 16.1 s and 5485 tokens
  - full guided search averaged about 5803 tokens
- Refine slimming on 2026-03-30:
  - refine averaged about 1.1 s and 172 tokens
- Prompt slimming and shard scoring:
  - prompt slimming helped modestly
  - compact shard scoring regressed latency and token usage, so it was rolled back
- Badge-scope reduction on cached same-query finalize:
  - finalize averaged about 7.5 s, about 7.0 s OpenAI time, and about 2479 tokens
  - full guided search averaged about 2651 tokens
  - this crossed the under-8-second cached finalize milestone
- Fresh-discovery rerun after conservative family collapse:
  - fresh finalize averaged about 10.8 s and 2617 tokens
  - treat this as directional because live discovery changed candidate pools
  - the strongest isolated win remains badge-scope reduction
- Prepared query-framing injection on 2026-04-13:
  - baseline finalize averaged about 5.0 s and 2289 tokens
  - prepared-fields finalize averaged about 4.4 s and 2453 tokens
  - the extra framing-fields call averaged about 3.8 s and 353 tokens
  - shortlist quality looked mixed
  - conclusion: injecting prepared framing into the current finalize call is not enough by itself
  - do not treat this as proof the broader perceived-latency idea failed
- Layered harness on 2026-04-13:
  - question-fast averaged about 1.5 s
  - framing-fields averaged about 6.6 s
  - framing was ready by submit in about 60% of cases with a 3-second think-time assumption
  - baseline shortlist-lock averaged about 5.2 s server-side
  - prepared finalize averaged about 5.9 s and used more tokens
  - prepared/candidate-aware-prior finalize was a latency regression for the normal non-streamed finalize path, not a proven speed win
  - first image-safe shortlist paint proxy stayed around 9.6 s to 10.2 s once current prewarm wait was included
  - no case got near the previously misstated sub-600 ms goal; the corrected target is about 6000 ms
- Selection-only shortlist-lock pass on 2026-04-13:
  - baseline averaged about 5.2 s
  - selection-only averaged about 3.2 s
  - selection-only used about 1474 tokens vs about 1891 baseline
  - speed improved enough to keep exploring thinner blocking selection
  - quality was mixed: coffee grinder better, desk lamp roughly similar, stroller/office chair/running shoes worse or less trustworthy
  - conclusion: the exact thin payload is not validated, but quality-preserving shortlist locking is the right next question
- Clean full-evidence ids-only winner-lock pass on 2026-04-14:
  - baseline shortlist-lock averaged about 3.77 s and 1878 tokens
  - winner-lock ids-only averaged about 2.45 s and 1668 tokens
  - unlike the earlier `selection_only` run, this kept the same candidate-aware prior evidence path as current finalize and only changed the blocking output shape
  - first image-safe shortlist paint proxy averaged about 2.46 s
  - badge pass averaged about 1.54 s and 715 tokens
  - enrichment pass averaged about 3.18 s and 1016 tokens, preserving locked winner ids in 5/5 cases
  - total winner-lock + badge + enrichment usage averaged about 3399 tokens
  - quality held materially better than the starved-input run: top result matched baseline in 5/5 cases, with high winner overlap but some weaker ordering
  - conclusion: continue cautiously; ids-only winner-lock clears the corrected about-6000 ms target with full evidence, but post-lock polish cost needs tightening
- Important correction after reviewing the user's intended architecture:
  - the clean full-evidence run measured three separate AI calls: winner lock, badge pass, and enrichment pass
  - that does not answer the user's actual streaming question
  - the desired next experiment is one OpenAI streaming finalize call that emits `winners_locked`, then `badges_ready`, then `enrichment_ready`
  - the previous badge/enrichment latencies mainly show the cost of separate post-lock calls, not the cost of later phases in one stream
- Stream-clean context5 measurement on 2026-04-14:
  - artifact: `temp-data/guided-finalize-measurement-stream-clean-context5.json`
  - summary: `temp-data/stream-clean-context5-measurement-summary.md`
  - baseline finalize averaged about 4.29 s server-side and 1883 tokens
  - one-call streamed finalize locked winners at about 2.24 s on average, about 2.05 s earlier than baseline shortlist lock
  - full streamed completion averaged about 6.92 s server-side and 2534 tokens because badges and enrichment were generated later in the same stream
  - stream status was complete in 5/5 cases with no parse errors or warnings
  - badge and enrichment phases preserved locked IDs/order in 5/5 cases
  - top result matched baseline in 5/5 cases; average winner overlap was 5.4/6
  - locally, with only `OPENAI_API_KEY` set, baseline and stream finalize used the default context finalize lane `gpt-5.4-nano`; reused stored prewarm priors were generated by `gpt-5-mini`
  - no model switch was made; this run does not answer whether mini would be better for the streamed finalize call
- Stream prewarm-vs-no-prewarm context5 measurement on 2026-04-14:
  - artifact: `temp-data/guided-finalize-measurement-stream-prewarm-compare-context5.json`
  - summary: `temp-data/stream-prewarm-compare-context5-measurement-summary.md`
  - with prewarm: winners locked at about 2.59 s on average, full stream server time about 7.00 s, and about 2548 tokens
  - without prewarm: winners locked at about 2.33 s on average, full stream server time about 7.02 s, and about 2935 tokens
  - no-prewarm locked about 265 ms earlier, but full completion was effectively tied and token usage was about 387 tokens higher
  - both variants completed 5/5 cases and preserved badge/enrichment locked order in 5/5 cases
  - top-result match vs baseline was 3/5 for both variants
  - average winner overlap was better with prewarm: 5.6/6 vs 4.6/6
  - conclusion: candidate-aware prewarm is not justified as a streamed-finalize latency feature; if kept at all, its argument is quality/cost tradeoff, not speed
- Stream prewarm-vs-no-prewarm context5 mini measurement on 2026-04-14:
  - artifact: `temp-data/guided-finalize-measurement-stream-prewarm-compare-context5-mini.json`
  - summary: `temp-data/stream-prewarm-compare-context5-mini-measurement-summary.md`
  - this run used `OPENAI_FINALIZE_CONTEXT_MODEL=gpt-5-mini` for baseline and streamed finalize calls
  - baseline finalize averaged about 10.17 s shortlist-lock server time and about 1982 tokens
  - with prewarm: winners locked at about 8.13 s on average, full stream server time about 19.14 s, and about 2708 tokens
  - without prewarm: winners locked at about 8.48 s on average, full stream server time about 19.08 s, and about 3099 tokens
  - both variants completed 5/5 cases and preserved badge/enrichment locked order in 5/5 cases
  - top-result match vs baseline was 4/5 with prewarm and 1/5 without prewarm
  - average winner overlap was 5.0/6 with prewarm and 4.8/6 without prewarm
  - recommendation after comparison against the prior nano run: reject mini for the one-call streamed finalize path
  - reason: nano locked winners at about 2.33-2.59 s and completed the full stream at about 7.0 s, while mini locked winners at about 8.13-8.48 s and completed the full stream at about 19.1 s
  - mini's quality/order-preservation signal is not enough to justify the latency regression for blocking or one-call stream use
  - mini remains plausible later only as asynchronous writing/enrichment after a fast shortlist is already locked

## Next experiment: nano lock + mini async enrichment
- This is a new, separate harness-only experiment, not a continuation of the one-call stream productization path.
- Goal: test whether `gpt-5.4-nano` can lock winners and cheap badges quickly while `gpt-5-mini` writes nicer per-product copy after the lock without blocking shortlist display.
- Do not wire the frontend.
- Do not change normal `/api/search/finalize` behavior.
- Do not redesign the whole layered architecture.
- Do not reintroduce prewarm as a latency feature; current measurements do not justify it.
- Pending smallest useful tasks:
  - [ ] Add a harness-only mode that runs nano for lock/badges and then runs mini enrichment as a second, non-blocking measurement call.
  - [ ] Record time to nano lock, time to badges, mini enrichment duration, total tokens by model, and whether mini preserves locked IDs/order.
  - [ ] Compare the harness against the existing nano one-call stream results on the same `context5` sample set.
  - [ ] Write a concise temp-data summary before considering any route/UI/product changes.

## Current working rule
- Start from current branch because prewarm route, prior storage, logging, contracts, and tests are useful groundwork.
- Do not treat current refined/retry prior reuse as the validated answer.
- Do not restart the architecture discussion; follow `layered-latency-plan.md`.
- Current implementation question: can a smallest harness-only split use nano to lock winners/badges quickly and then use mini for better non-blocking enrichment copy while preserving locked winner order?
- Candidate-aware prewarm should not be assumed into the stream path as a latency feature. The Chat 2 comparison showed no-prewarm locked winners slightly earlier, but used more tokens and had lower winner overlap; treat prewarm as an optional quality/cost hedge only if future review explicitly values that tradeoff.
- The mini model-routing measurement and comparison are complete enough for a practical decision: mini is too slow for one-call streamed finalize; nano remains the fast stream candidate.
- Temporary support for that question now exists:
  - local-only `POST /api/search/finalize-stream`
  - temporary stream selector/parser in `backend/lib/ai-selector.js`
  - `backend/scripts/measure-guided-finalize.js --mode stream-clean`
- Small smoke measurement `stream-clean-smoke-small` completed 3/3 stream cases and full context5 stream measurements completed; current `/api/search/finalize` remains the product path.
- Full context5 `stream-clean-context5` measurement completed 5/5 stream cases; winner lock was materially earlier than baseline and later phases preserved locked order, but full stream completion was slower and used more tokens than baseline.
- Next measured question: in a separate harness-only experiment, test nano lock/badges plus mini async enrichment without frontend wiring or architecture redesign.
- Required measurement fields for that next pass:
  - time to nano lock
  - time to nano badges
  - mini enrichment duration
  - tokens by model/stage
  - winner validity
  - whether mini enrichment preserved locked IDs and order
- Keep temporary measurement hooks temporary:
  - `measurementPreparedQueryFraming`
  - `measurementSelectionMode: selection_only`
  - `measurementSelectionMode: winner_lock_ids_only`
