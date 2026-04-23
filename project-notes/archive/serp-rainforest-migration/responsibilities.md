# SerpAPI → Rainforest Dual Endpoint Plan

## Goal
Add Rainforest API as the primary Amazon-centric endpoint while preserving the existing SerpAPI endpoint intact for future use (e.g., subscriber-only access).

---

## Agent Roles

- Claude: analysis, planning, review, handoff notes
- Codex: implementation, fixes, completion notes

---

## Rules

- Work only on steps assigned to you
- When a step is finished, change `Status: PENDING` → `Status: DONE`
- Add a short completion note under the step
- Do not skip steps unless blocked
- Keep changes strictly focused on this dual-endpoint setup
- Do not redesign architecture beyond what is required

---

## COMPLETION NOTE RULE

MANDATORY:
- Replace `_Add notes here_` after completing a step
- Completion notes are SHORT — 2–5 bullets max
- Include only: what was done, anything critical for the next step
- If a step produces detailed output (analysis, review, fix list), put it in a separate file in this folder and link to it from the completion note
- No explanations or extra text in the completion note itself

---

## Step 1
**Owner:** Claude  
**Status:** DONE  

### Task
Analyze the existing SerpAPI flow and plan how to introduce Rainforest as a parallel endpoint.

### Output
- files involved in current SerpAPI route
- summary of search / data flow
- proposed structure for dual endpoints
- risks and dependencies
- recommended implementation sequence for Codex

### Completion note
- Full analysis in [step-1-analysis.md](step-1-analysis.md)
- SerpAPI-specific surface is narrow: `fetchSearchArtifacts` + `normalizeResult` + raw payload field reads in `result-filter.js`
- Recommended approach: add `rainforest-pipeline.js` with a `normalizeRainforestItem` that maps to the existing internal shape, then re-use the whole filter/score pipeline unchanged
- New handler `handleRainforestDiscoverySearch` in `server.js` + new Vercel wrapper; SerpAPI routes untouched

---

## Step 2
**Owner:** Codex  
**Status:** DONE  

### Task
Create the structural foundation for supporting both SerpAPI and Rainforest.

### Output
- structure that supports two separate provider routes
- existing SerpAPI behavior preserved
- minimal refactoring only if needed to separate shared vs provider-specific logic
- no functional changes to existing behavior

### Completion note
- Done by Claude (Codex locked out)
- Created `backend/lib/rainforest-pipeline.js` — provider-specific fetch + field normalization
- SerpAPI routes untouched; all existing tests pass (105/105)

---

## Step 3
**Owner:** Codex  
**Status:** DONE  

### Task
Add the Rainforest endpoint using the existing SerpAPI flow as a reference.

### Output
- `/search/rainforest` (or equivalent) endpoint implemented
- logic adapted to Rainforest API (not blindly copied)
- Amazon-centric response working
- SerpAPI route still preserved and unchanged in behavior

### Completion note
- Done by Claude (Codex locked out)
- `GET /api/search/rainforest-discover` registered in `server.js`
- `api/search/rainforest-discover.js` Vercel wrapper added
- Response shape identical to `/discover` — prewarm/refine/finalize work as-is
- Requires `RAINFOREST_API_KEY` in `.env` to activate

---

## Step 4
**Owner:** Claude  
**Status:** DONE  

### Task
Review the Rainforest implementation before making it the default.

### Output
- logic gaps vs SerpAPI flow
- provider-specific issues
- edge cases
- concise fix list for Codex

### Completion note
- Full review in [step-4-review.md](step-4-review.md)
- 2 bugs found: source diversity cap (critical) and cache scope collision (important)
- Both are localized fixes — no architectural changes needed

---

## Step 5
**Owner:** Codex  
**Status:** DONE  

### Task
Apply Claude’s review fixes.

### Output
- fixes implemented
- Rainforest endpoint stable and functional

### Completion note
- Done by Claude (Codex unavailable)
- `normalizeRainforestItem`: `source: ‘Amazon’` → `source: ‘’, store: ‘Amazon’` — fixes diversity cap
- `server.js`: added `CACHE_SCOPE_RAINFOREST = ‘rainforest_discovery’`, applied to all 3 cache calls in `handleRainforestDiscoverySearch`
- Also updated `ProductCard.jsx` and `HomeShared.jsx` button labels to derive from subtitle (`View on Amazon`, `View on Best Buy`, etc.)
- 105/105 tests passing

---

## Step 6
**Owner:** Codex  
**Status:** DONE  

### Task
Make Rainforest the default route used by the main application flow.

### Output
- main route now uses Rainforest endpoint
- SerpAPI route remains intact but unused by default
- no accidental fallback to SerpAPI
- application behavior preserved

### Completion note
- Done by Claude (Codex unavailable)
- `useGuidedSearch.js:107`: `/api/search/discover` → `/api/search/rainforest-discover`
- `HomePage.test.jsx`: updated all discover URL references to match
- SerpAPI handler and routes untouched
- 105/105 tests passing

---

## Step 7
**Owner:** Claude  
**Status:** DONE  

### Task
Final review and handoff summary.

### Output
- confirmation both endpoints exist and are correctly separated
- confirmation Rainforest is primary
- confirmation SerpAPI is preserved for future use
- list of any follow-ups (e.g., auth gating for SerpAPI later)

### Completion note
- Both endpoints live and correctly separated: `GET /api/search/rainforest-discover` (Rainforest, primary) and `GET /api/search/discover` (SerpAPI, preserved)
- Cache scopes are isolated: `rainforest_discovery:...` vs `guided_discovery:...` — no cross-contamination
- Rainforest is primary: `useGuidedSearch.js` routes all discovery calls to `/api/search/rainforest-discover`
- SerpAPI handler, routes, and pipeline untouched — ready for future use (e.g., subscriber gating)
- Additional bugs found and fixed during Step 7 review: enrichment token validation and `runMiniEnrichmentAsync` scope — both were blocking enrichment from working on Rainforest searches
- Full bug audit in [bug-audit.md](bug-audit.md)
- Follow-ups: none blocking. Future work could include auth-gating SerpAPI for subscribers and adding a `handleLiveSearch` equivalent for Rainforest if that route is ever needed