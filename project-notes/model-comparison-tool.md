# Model Comparison Tool — Dev Only

## Purpose
Side-by-side comparison of gpt-5.4-nano vs Claude Haiku for the finalize selection step.
Lets you run a real search and see which model picks better candidates, with timing for each.

## What to build

### 1. Install Anthropic SDK
```
npm install @anthropic-ai/sdk
```

### 2. New dev-only backend endpoint
`POST /api/dev/compare-models`

- Accepts: `{ candidatePool, details, finalResultLimit }`
- Guards with `NODE_ENV !== 'production'` — returns 404 in prod
- Runs both models in parallel via `Promise.all`:
  - `nanoLockWinnersAndBadges` with `gpt-5.4-nano` (existing function)
  - New Claude Haiku selection call using Anthropic SDK with same prompt/schema
- Returns both results with timing for each:
  ```json
  {
    "nano": { "picks": [...], "durationMs": 1200, "usage": {...} },
    "haiku": { "picks": [...], "durationMs": 800, "usage": {...} }
  }
  ```

### 3. Plain HTML comparison page
Single file at `dev-tools/model-compare.html` — open directly in browser, no build step.
Uses PicoCSS for styling.

**Flow:**
1. Enter query + follow-up answer
2. Calls `/api/search/rainforest-discover` to get a real candidate pool
3. Fires the comparison endpoint with that pool
4. Displays side-by-side:
   - Left: nano picks (title + price)
   - Right: Haiku picks (title + price)
   - Bottom of each column: duration + token usage

**Key design note:** piggybacks on a real search so the candidate pool is authentic, not mocked.

## Env var needed
`ANTHROPIC_API_KEY` — add to `.env` locally, do not add to Vercel (prod only serves real finalize).

## Why this approach
- Zero impact on production code
- Uses existing `nanoLockWinnersAndBadges` for nano so comparison is apples-to-apples
- Timing data lets you see if Haiku is actually faster before committing to the switch
- Plain HTML means no build tooling needed
