# Reset Runbook

## Purpose
- This file is the step-by-step reset path after the staged finalize experiment drifted from the intended product flow.
- Work only one step at a time.
- When a step is completed, change its `status` from `pending` to `done`.
- Future chats can say:
  - "Read `project-notes/reset-runbook.md` and do step 1"
  - or
  - "Read `project-notes/reset-runbook.md` and do the next pending step"

## Source notes to read first
- `project-notes/architecture-reset.md`
- `project-notes/current-search-flowchart.html`

## Steps

### Step 1
- status: done
- Name: Archive Current State
- Goal:
  - Preserve the current working tree as an archive snapshot before resetting `main`.
- What this step does:
  - Create an archive branch from the current state.
  - Commit the current experiment, notes, and bugfixes there.
- Why this matters:
  - Keeps the experiment visible later as a warning and reference point.
  - Prevents accidental loss of useful learnings.
- After this step:
  - The current drifted architecture is safely preserved on an archive branch.

### Step 2
- status: done
- Name: Reset Main To Baseline
- Goal:
  - Return `main` to the last committed baseline before the uncommitted staged finalize drift.
- What this step does:
  - Switch back to `main`.
  - Reset the working tree to committed `HEAD`.
- Why this matters:
  - Removes the uncommitted staged/persisted finalize experiment from the active product path.
- After this step:
  - `main` is back on the simpler baseline.

### Step 3
- status: done
- Name: Restore Reset Notes If Needed
- Goal:
  - Ensure the warning and reset guidance still exists on the active branch after the reset.
- What this step does:
  - Reapply or recreate the key notes if resetting `main` removed them.
- Required files:
  - `project-notes/architecture-reset.md`
  - `project-notes/current-search-flowchart.html`
  - any note syncs that should stay on `main`
- Why this matters:
  - Future work should start with the corrected vision, not only with reverted code.

### Step 4
- status: done
- Name: Measure Baseline Latency And Tokens
- Goal:
  - Capture real baseline measurements before any new architecture attempt starts.
- What this step does:
  - Run the app on the reset baseline.
  - Measure:
    - refine latency
    - refine token usage
    - finalize latency
    - finalize token usage
    - total guided-search token usage
- Why this matters:
  - The next attempt must not start blind.
  - Baseline numbers are a gate, not optional telemetry.

### Step 5
- status: done
- Name: High-Level Plan Only
- Goal:
  - Create the next attempt’s architecture plan without coding yet.
- What this step does:
  - Use high reasoning.
  - Define the simplest intended fast flow.
  - Explicitly list what will not be built.
- Why this matters:
  - Prevents the next attempt from drifting during implementation.
- Rule:
  - No code changes in this step.

### Step 6
- status: done
- Name: Break Plan Into Small Steps
- Goal:
  - Turn the high-level plan into small, ordered implementation steps.
- What this step does:
  - Use high reasoning.
  - Write a short implementation sequence with narrow steps.
- Why this matters:
  - Prevents architecture from being improvised inside coding sessions.

### Step 7
- status: pending
- Name: Implement One Step At A Time
- Goal:
  - Rebuild only the approved pieces of the intended flow.
- What this step does:
  - Use medium reasoning.
  - Implement only one planned step per pass.
  - Verify after each step.
- Why this matters:
  - Keeps execution aligned with the intended product flow.
- Rule:
  - If implementation starts changing architecture, stop and ask first.

## Reasoning mode reminders
- Architecture comparison or planning:
  - use high reasoning
- Step-by-step implementation after the plan is chosen:
  - use medium reasoning
- Tiny edits or simple checks:
  - use low/normal reasoning

## Decision rule
- If a future assistant wants to widen a step, combine multiple steps, or change the product flow, it must ask first.
