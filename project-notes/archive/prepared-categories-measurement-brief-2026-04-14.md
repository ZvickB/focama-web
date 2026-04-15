# Prepared Categories Measurement Brief

## Purpose
- This brief is for a fresh implementation chat.
- The goal is to measure whether giving finalize prepared categories / framing fields is actually worth the added complexity.
- Do not continue the architecture discussion from scratch.
- Do not assume prepared categories help latency just because they sound structured.

## Core question
- We need to learn whether prepared categories or framing fields:
  - materially reduce finalize latency or token usage,
  - materially improve shortlist quality,
  - or mostly add prompt/context weight plus implementation complexity.

## Decision standard
- Treat this as a go / no-go measurement pass.
- The work is only worth continuing if the experiment shows at least one of:
  - a clear finalize latency improvement,
  - a meaningful token reduction,
  - or a clear shortlist-quality improvement,
- without adding enough complexity to outweigh the win.

- If the result is mostly:
  - same latency,
  - same or worse tokens,
  - same quality,
  - and more architecture complexity,
- then stop pushing the prepared-categories direction further.

## Existing repo assets to use

### Existing measurement script
- Use [backend/scripts/measure-guided-finalize.js](c:/Users/zvick/Desktop/udemy/my%20projects/focama/web/backend/scripts/measure-guided-finalize.js)
- It already:
  - starts a local API server,
  - runs guided discover / refine / finalize,
  - records latency, server timing, token usage, selected ids, and result titles,
  - writes output to `temp-data/guided-finalize-measurement-<label>.json`

### Existing 3-case sample set already in the script
- `stroller` + `airport travel and easy folding`
- `coffee grinder` + `quiet for espresso at home`
- `desk lamp` + `small apartment reading light`

### Existing 5-case context comparison references
- Use these as a likely expanded query set reference:
  - [temp-data/finalize_model_context_comparison.md](c:/Users/zvick/Desktop/udemy/my%20projects/focama/web/temp-data/finalize_model_context_comparison.md)
  - [temp-data/nano_finalize_context_runs.md](c:/Users/zvick/Desktop/udemy/my%20projects/focama/web/temp-data/nano_finalize_context_runs.md)

- Those references include:
  - `stroller`
  - `coffee grinder`
  - `desk lamp`
  - `office chair`
  - `running shoes`

### Existing measurement outputs for format reference
- `temp-data/guided-finalize-measurement-*.json`
- `temp-data/baseline_finalize_context_runs.json`
- `temp-data/nano_finalize_context_runs.json`

## What this chat should implement

### 1. Add a measurement mode for prepared categories
- Create the smallest possible experimental path.
- Do not build full new architecture.
- Prefer a narrow experiment that lets finalize receive prepared categories / framing fields as extra input.
- The experiment should be easy to toggle on and off.

- Strong preference:
  - baseline finalize path remains intact,
  - experiment path is an A/B variant,
  - both can be measured against the same sample cases.

### 2. Keep the measurement scoped
- Do not widen into enrichment work.
- Do not redesign modal behavior.
- Do not add new user-facing product behavior.
- Do not build persistence or orchestration layers unless strictly required for the experiment.
- If prepared categories need to be injected only as temporary finalize input for measurement, that is preferred.

### 3. Make the comparison fair
- The important comparison is not "does the app work."
- The important comparison is:
  - baseline finalize
  - vs finalize with prepared categories

- Try to keep the compared runs aligned on:
  - same query
  - same follow-up notes
  - same candidate pool when feasible

- If exact candidate-pool reuse is hard, say so explicitly in the final notes.

## Metrics to record

### Speed metrics
- finalize round-trip ms
- finalize server `openai` ms
- finalize total tokens
- finalize input tokens
- finalize output tokens

### Quality inspection fields
- selected candidate ids
- result titles
- top result title

### Human judgment output
- The script or summary should leave a clear place to review:
  - better / same / worse
  - and a one-line reason per case

- Do not try to fully automate "quality."
- Instead, make the outputs easy for a human to compare.

## Suggested query set
- Start with the existing 3-case script set if you want the smallest pass.
- Prefer expanding to the existing 5-case context set if time allows:
  1. `stroller` -> `airport travel, easy folding, compact enough for city transit, not too heavy`
  2. `coffee grinder` -> `quiet for espresso at home, consistent grind matters more than cheapest price`
  3. `desk lamp` -> `small apartment reading light, compact footprint, warm light preferred, not flashy`
  4. `office chair` -> `lower back support for long workdays, under $300, not bulky, apartment friendly`
  5. `running shoes` -> `beginner 5k training, knee comfort, daily road running, prefer cushioning over speed`

## Deliverables
- The chat should leave behind:
  1. a repeatable way to run baseline vs prepared-categories measurement,
  2. one or more output files in `temp-data/`,
  3. a short summary markdown file with:
     - what changed,
     - how it was measured,
     - summary latency/tokens,
     - subjective quality read,
     - and a clear recommendation:
       - continue,
       - pause,
       - or stop.

## Recommendation rule
- The final recommendation should be explicit.
- Use language like:
  - `continue` if the win is clearly real,
  - `pause` if the result is mixed and needs one smaller follow-up,
  - `stop` if the gain is weak relative to the added complexity.

## Constraints
- This is an implementation + measurement chat, not a redesign chat.
- Keep current implementation reality separate from planned architecture.
- Preserve the current rule that the user-facing refinement question should appear ASAP and should not be blocked on richer reasoning.
- Do not silently turn the experiment into a permanent architecture decision.
- If the chat concludes that prepared categories are not worth it, say so clearly.

## Good final answer shape for that chat
- What changed
- How it was measured
- What the numbers say
- What the quality comparison suggests
- Whether this idea looks worth continuing
