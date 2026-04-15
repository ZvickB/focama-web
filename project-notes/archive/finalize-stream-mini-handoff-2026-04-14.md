# Finalize Stream Mini Handoff

## Purpose
- Compact handoff for the next chat focused on the streamed finalize model-routing question.
- This is measurement guidance only, not product architecture approval.
- Use alongside `project-notes/active-experiment-override.md` and archived `project-notes/archive/finalize-stream-next-step-2026-04-14.md`.

## Current conclusion
- The one-call streamed finalize path is promising only with the fast nano lane; `gpt-5-mini` is rejected for that path.
- Mini winners locked around 8.1-8.5 s and full stream completion was around 19 s, which is too slow for the one-call streamed finalize target.
- `gpt-5.4-nano` remains the only plausible fast streamed finalize model from current measurements.
- Mini may still be useful later for asynchronous writing/enrichment after a fast shortlist is already locked.
- The next experiment should be separate: nano locks winners/badges fast, then mini writes nicer copy in a non-blocking second call.
- Do not wire frontend, do not implement the new experiment from this note alone, and do not redesign the whole architecture.
- The prior one-call streamed finalize path showed useful perceived-latency signal because it can emit `winners_locked` much earlier than normal finalize.
- The latest context5 stream comparison showed candidate-aware prewarm is not a latency win:
  - with prewarm: average `winners_locked` about 2594 ms, full stream about 7004 ms, about 2548 tokens
  - without prewarm: average `winners_locked` about 2329 ms, full stream about 7015 ms, about 2935 tokens
  - no-prewarm locked winners about 265 ms earlier
  - no-prewarm used about 387 more tokens
  - winner overlap was lower without prewarm: 4.6/6 vs 5.6/6
- Treat prewarm as an optional quality/cost hedge only. Do not justify it as a streamed-finalize speed feature unless a future measurement reverses this.

## Model context
- The stream-clean and stream-prewarm-compare runs used the default context finalize lane, `gpt-5.4-nano`, for baseline and streamed finalize calls.
- Stored candidate-aware priors in those runs were generated earlier by `gpt-5-mini`.
- The answered question is whether `gpt-5-mini` improves one-call streamed finalize enough to justify the cost: it does not.

## Recommended next measurement
- Do not run more mini one-call stream measurements unless a future question changes.
- Next, in a separate harness-only experiment, measure nano winner/badge lock followed by mini async enrichment.
- Keep this measurement-only:
  - no frontend wiring
  - no production route or Vercel wrapper
  - no architecture redesign
  - current `/api/search/finalize` unchanged

## Multi-chat task sequence
- Task 1 status: done
  - Run `stream-prewarm-compare-context5-mini` with `OPENAI_FINALIZE_CONTEXT_MODEL=gpt-5-mini`.
  - Write down only measured facts from the run.
  - Update this note with Task 1 as done and leave later tasks pending.
- Task 2 status: superseded/closed
  - Practical comparison is now captured: nano locked winners around 2.33-2.59 s and completed around 7.0 s; mini locked around 8.13-8.48 s and completed around 19.1 s.
  - Mini is rejected for the one-call streamed finalize path.
- Task 3 status: superseded/closed
  - Practical recommendation: keep nano as the only plausible fast stream model; do not justify prewarm as a latency feature; do not productize or wire frontend from this one-call stream branch yet.
  - Pivot the next measurement to a separate nano lock plus mini async-enrichment harness.

## Suggested PowerShell command
```powershell
$env:OPENAI_FINALIZE_CONTEXT_MODEL="gpt-5-mini"
node backend/scripts/measure-guided-finalize.js --label stream-prewarm-compare-context5-mini --mode stream-prewarm-compare --sample-set context5 --summary-only
Remove-Item Env:\OPENAI_FINALIZE_CONTEXT_MODEL
```

## What to compare
- `winners_locked` latency
- full stream `done` latency
- total tokens
- stream status completeness
- badge and enrichment locked-order preservation
- top-result match vs baseline
- average winner overlap vs baseline
- obvious qualitative misses in result titles for each query

## Task 1 measured facts
- Date run: 2026-04-14.
- Artifact: `temp-data/guided-finalize-measurement-stream-prewarm-compare-context5-mini.json`.
- Summary: `temp-data/stream-prewarm-compare-context5-mini-measurement-summary.md`.
- Model override: `OPENAI_FINALIZE_CONTEXT_MODEL=gpt-5-mini`.
- Baseline finalize averaged about 10.17 s shortlist-lock server time and about 1982 tokens.
- Stream with prewarm:
  - first token averaged about 7.93 s
  - winners locked averaged about 8.13 s
  - full stream `done` averaged about 19.14 s
  - total tokens averaged about 2708
  - complete in 5 / 5 cases
  - badge and enrichment phases preserved locked order in 5 / 5 cases
  - top-result match vs baseline was 4 / 5
  - average winner overlap was 5.0 / 6
- Stream without prewarm:
  - first token averaged about 8.32 s
  - winners locked averaged about 8.48 s
  - full stream `done` averaged about 19.08 s
  - total tokens averaged about 3099
  - complete in 5 / 5 cases
  - badge and enrichment phases preserved locked order in 5 / 5 cases
  - top-result match vs baseline was 1 / 5
  - average winner overlap was 4.8 / 6
- Without-prewarm minus with-prewarm:
  - winners locked about 353 ms later
  - full stream `done` about 59 ms earlier
  - total tokens about 390 higher
- Final mini-vs-nano recommendation: reject mini for one-call streamed finalize; use mini only as a possible future async writing/enrichment model.

## Decision rule
- Closed for one-call stream: mini was slower without enough quality improvement to justify the latency.
- Keep nano as the fast streamed finalize candidate from current measurements.
- Keep prewarm out of the latency argument; at most, it is a quality/cost hedge.
- Treat mini as an async enrichment candidate only after nano has already produced a usable locked shortlist.

## Pending next experiment tasks
- [ ] `status: pending` Add a smallest harness-only nano-lock plus mini async-enrichment mode.
- [ ] `status: pending` Measure lock/badge latency separately from mini enrichment latency.
- [ ] `status: pending` Record tokens by model and verify mini preserves locked IDs/order.
- [ ] `status: pending` Summarize context5 results before any UI/product decision.

## Cleanup after the next measurement
- Update `project-notes/active-experiment-override.md`, `project-notes/current-status.md`, `project-notes/session-handoff.md`, and `project-notes/handoff.md`.
- If a decision is made, mark prewarm as removed, retained only as a quality/cost hedge, or parked.
- Keep temporary measurement hooks temporary until productization is explicitly chosen.
