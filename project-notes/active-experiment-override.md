# Active Experiment Override

## Purpose
- This note is the highest-priority source of truth for the current prewarm/finalize experiment.
- It exists because the user explicitly approved broader implementation work for this experiment, even where older finalize guardrails would normally push toward a narrower interpretation.
- This note is scoped to the current prewarm/finalize experiment only. It is not a blanket override for unrelated product or architecture work.

## Priority
- For this experiment, follow this file when it conflicts with older finalize-strategy guardrails or older handoff wording.
- If future work changes the approved direction again, update this file and the linked handoff/status notes in the same pass.

## Approved implementation context
- This is Stage 2 implementation work, not planning.
- Use the repo's current architecture as the starting point, but do not let older guardrails force the experiment back into a narrower shape than the user approved.
- The architecture change and multiple AI calls are explicitly approved for this experiment.
- Do not switch finalize to `gpt-5.4-nano` for this work. Keep the current stronger finalize model path as the baseline.
- The old narrow skip-prewarm experiment is intentionally parked/disabled by default and should not be treated as the active direction.

## Intended experiment goal
- The core goal is the context-added finalize path, not the empty-notes path.
- The success criterion is that when the user adds follow-up context, the second-stage path should become meaningfully cheaper/faster than the old full finalize because it is building on the first pass instead of effectively starting over.
- Empty-notes reuse is a nice extra, not the main validation target.

## What was intended
- Immediately after guided discovery, do a first-pass AI prerank of the candidate pool.
- Treat that result as a reusable prewarmed ranking artifact, not a full final answer.
- When the user adds follow-up context, do a lighter second-stage pass focused mainly on intent match.
- In that second stage, intent match should outweigh other signals.
- The second stage should materially build on the first pass rather than simply replaying a fresh heavy ranking call with a stored artifact stuffed back into prompt context.

## What this experiment is not
- Do not treat simple model-lane switching by itself as the intended solution.
- Do not solve the main context-added latency problem only by routing refined/retry finalize to a faster model while leaving the same underlying experiment question unresolved.
- Do not reinterpret `keep the stronger current finalize model path as the baseline` as permission to make the main refined/retry lane a nano-only shortcut unless the user explicitly chooses that as a separate experiment.
- The point of this experiment is to test whether the first-pass/second-pass architecture itself can materially improve the context-added finalize path.

## What was implemented and learned
- The current branch does implement:
  - `/api/search/prewarm`
  - prerank artifact generation/storage
  - frontend prewarm wiring
  - structured debug metadata/logging
  - artifact reuse for empty-notes, refined, and retry paths
- The current branch did improve the empty-notes path substantially.
- But the implemented refined/retry path leaned too far toward reusable artifact handoff across separate fresh OpenAI calls.
- Live measurement showed that this did not materially improve the main context-added finalize path enough to count as success for the experiment's primary goal.
- Treat the current implementation as useful groundwork plus a partial experiment result, not as the final validated solution to the main latency problem.

## Working rule for the next attempt
- Start from the current branch because the prewarm route, artifact storage, logging, and tests are useful groundwork.
- Do not treat the current refined/retry artifact-intent-rerank behavior as the validated answer.
- If a future implementation must change orchestration, temporary persistence, or request flow shape in order to test the real intended idea, that is allowed within this experiment.
- If an older note says to preserve the narrower baseline in a way that conflicts with this experiment goal, follow this file for experiment-related work and then update the older note.
