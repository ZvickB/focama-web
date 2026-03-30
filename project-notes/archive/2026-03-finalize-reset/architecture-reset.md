# Architecture Reset

## Purpose
- This note is the reset point after the staged latency experiment drifted away from the intended product flow.
- It is meant to preserve the product vision in plain English before any new implementation work starts.
- If a future AI assistant wants to change the flow in a way that conflicts with this note, it must ask first.

## Current reality
- The current working tree contains a staged/persisted finalize architecture that now works technically.
- It also introduced real regressions:
  - much slower refine latency
  - much slower finalize latency
  - more workflow complexity than intended
- The runtime crash and homepage test hang were real and have been fixed during this debugging pass.
- Those bugfixes do not by themselves justify keeping the drifted architecture.

## Safest rollback target
- The last committed baseline before the current uncommitted staged/persisted finalize work is `HEAD`:
  - commit `4d5904d` `Add AI usage telemetry and latency planning note`
- In practical terms, the current drift is mainly in the uncommitted working tree, not in a long stack of committed architecture changes.
- That means the cleanest reset is likely:
  - keep notes and learnings
  - archive what was learned
  - discard the uncommitted staged/persisted finalize implementation
  - rebuild from the simpler intended flow

## Recommended reset direction
1. Treat the current staged/persisted finalize implementation as an experiment, not as the locked product path.
2. Reset code back to the last committed baseline before the uncommitted staged architecture changes.
3. Re-implement only what still supports the intended fast flow.
4. Require any future architecture expansion to prove it helps latency or quality enough to justify itself.

## CRITICAL DO NOT CHANGE
- Keep the homepage search-first, calm, and single-column.
- Keep product shortlists at 6 visible products.
- Keep discovery as the candidate-pool builder and cache boundary.
- Keep the backend responsible for deterministic cleanup and final ranking once structured AI scores exist.
- Keep user context as the strongest ranking signal.
- Keep badges and polish as presentation work, not as the core ranking brain.
- Keep the main product flow simple enough that backend-only work should feel like milliseconds, not seconds, whenever AI is not actively required.
- Do not turn refine into a long AI-critical-path step unless the user explicitly wants that tradeoff.
- Do not turn finalize into a persisted workflow with polling unless the user explicitly approves that direction after seeing the latency and complexity tradeoff.
- Do not add extra orchestration, persistence, polling, staged advancement, or recovery layers just because they are more robust in theory.
- Do not reinterpret "perceived speed" into "more structured backend workflow."
- Do not treat resilience sophistication as more important than fast, understandable product behavior unless the user explicitly says so.
- If a future AI assistant wants to replace a one-request flow with a multi-request workflow, it must ask first.
- If a future AI assistant wants to move more AI work into the critical path, it must ask first.
- If a future AI assistant wants to change shortlist logic, reveal logic, or ranking ownership in a way that changes the product vision, it must ask first.

## Intended fast flow
1. Discovery calls SerpApi and builds the candidate pool.
2. Refine runs in parallel and should stay lightweight:
   - ask for better user context
   - optionally prepare ranking guidance
   - do not become a heavy visible latency step
3. When discovery returns, the backend cleans deterministically down to about 20 candidates.
4. The user can either:
   - see the first 6 quickly
   - or provide more context for a focused shortlist
5. Finalize should stay compact:
   - user context plus candidate pool
   - shard scoring if it actually improves quality
   - backend deterministic rank/select
6. If AI polish exists later, it should decorate the already-chosen shortlist, not control the whole path.

## What likely drifted
- Refine became a separate heavy OpenAI wait instead of a lightweight helper.
- Finalize became a persisted staged workflow:
  - `start`
  - `status`
  - `complete`
  - polling
  - staged advancement
- The architecture optimized for control and recoverability more than latency.
- The plan gradually moved from:
  - "AI helps ranking"
  - to
  - "AI orchestration lives in the critical path"

## What to keep from the experiment
- The realization that discovery is still the right boundary.
- The realization that backend deterministic ranking should remain important.
- The realization that badges should not be the ranking brain.
- The knowledge that the current staged/persisted path is slower than intended.
- The bugfixes discovered during the work:
  - finalize status header handling crash fix
  - homepage test hang fix
  - result reveal shimmer loop fix

## What to discard unless re-approved
- Persisted finalize runs as the default product path.
- Finalize polling as the default homepage behavior.
- Status requests that actively advance staged work.
- Extra complexity added mainly for workflow robustness rather than speed.
- Any assumption that "backend time" being slow is acceptable just because AI is involved.

## Required measurement before the next attempt
- Do not start the next architecture attempt blind.
- Before new implementation work begins, capture a real baseline for:
  - refine latency
  - refine token usage
  - finalize latency
  - finalize token usage
  - total token usage for a full guided search
- Measure this on a small set of real example searches, not just one ideal case.
- Treat this baseline as a gate, not as optional telemetry.
- Any new design should either:
  - improve latency
  - improve token cost
  - or justify clearly why a regression is worth it
- If these measurements are missing, stop and gather them before implementation continues.

## Guardrail questions before future implementation
- Is this change simpler than the current idea, or more complex?
- Does this reduce real user wait time, or only reorganize it?
- Does this keep ranking ownership clear?
- Does this preserve the intended fast flow above?
- If not, has the user explicitly approved the tradeoff?

## Required implementation strategy for the next attempt
- Do not jump straight from idea to code.
- First make a high-level plan for the whole flow.
- Then break that high-level plan into small implementation steps.
- Then implement one step at a time.
- After each step, verify that the product is still following the intended fast flow.
- If a step starts pulling the design toward more orchestration, more AI in the critical path, or more workflow complexity, stop and ask first.
- Do not let implementation quietly become architecture.
- Do not treat a reasonable local coding improvement as permission to change the product flow.
- If the high-level plan and the code start to diverge, update the plan or stop the implementation before going further.

## Decision rule
- If a future implementation path is slower, more complex, or more orchestration-heavy than this reset note intends, stop and ask first.
