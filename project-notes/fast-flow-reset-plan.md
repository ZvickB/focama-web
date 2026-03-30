# Fast Flow Reset Plan

## Purpose
- This note captures the measured reset baseline and the next intended architecture path after rolling `main` back from the staged/persisted finalize experiment.
- It is a planning note only.
- Do not treat any item here as implemented until code and the status notes say so.

## Measured baseline on reset `main`
- Measurement date: 2026-03-30
- Environment: local backend on `http://127.0.0.1:8787`
- Sample queries:
  - `stroller` with `airport travel and easy folding`
  - `coffee grinder` with `quiet for espresso at home`
  - `desk lamp` with `small apartment reading light`

## Baseline results
- Refine latency:
  - `stroller`: 3146.6 ms
  - `coffee grinder`: 2532.1 ms
  - `desk lamp`: 4588.5 ms
  - average: 3422.4 ms
- Refine OpenAI total tokens:
  - `stroller`: 314
  - `coffee grinder`: 278
  - `desk lamp`: 363
  - average: 318.3
- Finalize latency:
  - `stroller`: 11804.7 ms
  - `coffee grinder`: 19882.6 ms
  - `desk lamp`: 16678.0 ms
  - average: 16121.8 ms
- Finalize OpenAI total tokens:
  - `stroller`: 5297
  - `coffee grinder`: 5641
  - `desk lamp`: 5517
  - average: 5485.0
- Full guided-search OpenAI total tokens:
  - `stroller`: 5611
  - `coffee grinder`: 5919
  - `desk lamp`: 5880
  - average: 5803.3

## What the numbers mean
- The reset baseline is already simpler than the staged/persisted finalize experiment, but finalize is still the main latency and token-cost problem.
- Refine is not free. At about 3.4 seconds average, it is still too heavy for a step that should feel lightweight.
- Finalize is the real bottleneck. At about 16.1 seconds average and about 5.5k tokens, it dominates the guided path.

## Intended next architecture
1. Keep discovery as the candidate-pool builder and cache boundary.
2. Keep refine parallel with discovery, but make refine cheaper and lighter:
   - ask one good follow-up question
   - optionally return compact ranking guidance that finalize can reuse
   - do not expand refine into a longer visible wait
3. Keep finalize as one compact request:
   - query
   - discovery token
   - follow-up notes
   - optional compact refine guidance
4. After discovery, keep backend cleanup deterministic:
   - dedupe
   - weak-result filtering
   - candidate limit around 20
5. Keep backend ranking ownership clear:
   - AI can score or compare
   - backend makes the final rank/select pass
6. If shard scoring is used, keep it inside one request and only if it clearly improves quality for the latency cost.
7. Any later polish should decorate the chosen shortlist, not control the whole ranking path.

## What will not be built in the next attempt
- No persisted finalize runs as the default path.
- No finalize polling.
- No `start` / `status` / `complete` finalize workflow.
- No status requests that advance work.
- No extra orchestration or recovery layers unless the user explicitly approves that tradeoff later.
- No second AI polish stage in the critical path.
- No widening of shortlist count.
- No marketplace-style “show more” drift.

## Implementation sequence
1. Instrument the current one-shot guided flow more explicitly.
   - Persist the baseline measurements in notes.
   - Make sure refine/finalize timing and token usage stay visible in development.
   - Add smarter structured logs so each meaningful search step records:
     - route and flow mode
     - latency
     - token usage when AI runs
     - candidate counts before and after narrowing
     - whether AI or deterministic backend logic made the key decision
   - Make the logs clear enough to distinguish:
     - slow because of AI work
     - slow because of backend orchestration or extra workflow steps
2. Shrink refine first.
   - Tighten the refine prompt so it produces one useful question with lower output token use.
   - Add a compact structured guidance payload only if it stays small.
3. Reduce finalize prompt weight before changing ranking structure.
   - Remove redundant candidate fields from the AI handoff.
   - Keep only the strongest signals needed for shortlist selection.
4. Re-measure finalize on the same sample queries.
   - If latency and token use improve enough, stop there before adding new ranking complexity.
5. Only if quality is still weak, test compact in-request shard scoring.
   - Keep shard work within one finalize request.
   - Keep deterministic backend merge/select.
   - Do not add persistence or polling.
6. Add optional presentation polish only after shortlist quality and latency are acceptable.

## Working rhythm guardrails
- Run `npm run dev:all` at meaningful checkpoints where the full homepage-to-backend flow should be exercised end to end, especially:
  - after changing request/response contracts
  - after changing guided-flow route behavior
  - after changing timing, token, or logging instrumentation
  - before declaring a step complete
- Do not wait for a giant batch of changes before testing the integrated flow.
- Commit after each meaningful completed step, not after a stack of loosely related changes.
- A good commit point is when:
  - one planned step is done
  - `dev:all` sanity-checks the intended flow
  - the notes for that step are updated if needed
- If a step is too large to reach a safe commit quickly, split it into a smaller step before continuing.

## Decision gate before each implementation step
- Is this simpler than the staged experiment?
- Does this reduce real user wait time or token cost?
- Does this preserve one-request finalize behavior?
- Does this keep backend ranking ownership clear?
- If not, stop and ask before coding further.

## Progress update
- 2026-03-30:
  - Completed the first rebuild step for refine.
  - AI now returns only one short ranking question.
  - Helper text and textarea placeholder are now static server-side copy.
  - Refine now uses minimal reasoning effort.
  - Structured `[search-flow]` logs now exist for guided discovery, refine, and finalize.
- Re-measured refine after this step on the same three sample queries:
  - average latency: 1127.7 ms
  - average total tokens: 172.0
- Compared with the reset baseline:
  - refine latency improved from 3422.4 ms to 1127.7 ms
  - refine total tokens improved from 318.3 to 172.0
- Next step:
  - reduce finalize prompt weight and re-measure finalize on the same sample queries
- 2026-03-30:
  - Completed the second rebuild step for finalize prompt slimming.
  - Finalize now removes top-level search-state/similar-query prompt text.
  - Finalize AI candidate summaries now drop backend-only match signals and duplicate numeric-price fields.
  - Finalize AI candidate summaries now flatten trust metadata to a single `trustScore`.
  - Finalize now sends minified candidate JSON to OpenAI instead of pretty-printed JSON.
- Re-measured finalize after this step on the same three sample queries:
  - average latency: 13912.5 ms
  - average total tokens: 5403.3
  - average full guided-search total tokens: 5574.3
- Compared with the reset baseline:
  - finalize latency improved from 16121.8 ms to 13912.5 ms
  - finalize total tokens improved from 5485.0 to 5403.3
  - full guided-search total tokens improved from 5803.3 to 5574.3
- Next step:
  - decide whether finalize quality and latency are acceptable after prompt slimming, or if a compact in-request shard-scoring test is warranted
