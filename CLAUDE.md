# Focama — Claude Code Context

## Claude vs Codex — When to Use Which
**Use Claude Code (this tool) when:**
- The task touches multiple parts of the system or needs codebase-wide understanding
- You want to think it through together — tradeoffs, architecture, back-and-forth
- The task involves a judgment call about what fits existing patterns
- You want to stay in the loop and redirect as you go

**Use Codex when:**
- The task is well-scoped and self-contained — you can write a clear spec
- You want to step away and come back to a finished result
- The task is pure implementation with no ambiguity about approach

**Rule of thumb:** Conversation and judgment → Claude. Autonomous heads-down execution → Codex.

## What This Is
AI-powered shopping assistant. User enters a query → AI asks one follow-up question → returns 6 focused product picks with fit explanations. Main value prop: calm, focused results — not a marketplace.

## Product Voice — AI Copy Tone
This is a non-negotiable product direction. Apply it to every AI prompt that generates user-facing copy.

- Write like a **trusted assistant**, not a salesperson or a review site.
- For each pick, explain **why the AI chose it** AND surface **at least one honest drawback or caveat** — without being harsh.
- Drawbacks can be practical (exceeds stated budget, heavier than alternatives, requires X to work well) or contextual (better if you care more about Y than Z, not ideal if you also need W).
- Do **not** write copy that implies the product is definitely the right choice. Help the user decide for themselves.
- Avoid superlatives, hype phrases, and generic positives ("renowned for", "ideal for", "go-to choice", "perfectly suited").
- Be specific to the user's stated context — not generic product descriptions.
- Honest caveats make the product feel more trustworthy, not less. A note like "exceeds your $300 budget at $309" or "heavier than the other picks — fine if support matters more than portability" is better than silence.

**The office chair case is the reference example of the right tone** — it flagged budget overruns and noted when a pick prioritized support over minimalism. That is the target.

## Run Commands
```bash
npm run dev          # Frontend only (Vite, port 5173)
npm run dev:all      # Frontend + backend together (recommended)
npm run server       # Backend only (port 8787)
npm run test         # Run all tests once
npm run test:watch   # Watch mode
npm run build        # Production build
```

## Architecture

### Guided Search Flow (main product path)
1. `POST /api/search/discover` — fetch search results, build 20-candidate pool, return preview + `discoveryToken`
2. `POST /api/search/refine` — generate one short AI follow-up question
3. `POST /api/search/prewarm` — cache a candidate-aware AI prior for later reuse (background)
4. `POST /api/search/finalize` — accept user's follow-up answer, pick 6 results with fit reasons

Finalize **reconstructs** the candidate pool from cache — never trusts browser-posted candidate data.

### Key Directories
```
src/                        React frontend
src/components/home/        Core guided search UI + useGuidedSearch hook
backend/server.js           Node native HTTP server (no framework)
backend/lib/                Business logic modules (ai-selector, rate-limiter, search-cache, etc.)
api/search/                 Vercel serverless wrappers → forward to backend
project-notes/              Living docs: flow, status, decisions, experiment notes
project-notes/archive/      Superseded docs — read for history, don't treat as current
```

## Tech Stack
- **Frontend:** React 19, React Router v7, TanStack Query, Tailwind CSS 3, Vite
- **Backend:** Node.js native HTTP (no Express), OpenAI API, SerpApi, Supabase
- **Testing:** Vitest + @testing-library/react
- **Deploy:** Vercel (serverless `/api` wrappers)

## AI Models
- Refinement: lightweight/fast model (~1s)
- Finalize: context-aware model (~5s baseline)
- Model env vars: `OPENAI_REFINEMENT_MODEL`, `OPENAI_FINALIZE_MODEL`, `OPENAI_FINALIZE_CONTEXT_MODEL`, `OPENAI_FINALIZE_EMPTY_MODEL`

## Caching
- Discovery results cached (Supabase or local file fallback)
- Finalize and live search are intentionally uncached (request-specific)
- Cache keys normalize lowercase, spacing, and product plural forms

## Backend Guardrails (don't remove these)
- Request body limit: 32 KB on finalize
- Candidate pool cap: 20
- Follow-up notes truncated to 500 chars before AI
- Rate limit: 15 requests per IP per 10-second rolling window
- Max 2 retry attempts per search

## Required Environment Variables
```
SERPAPI_API_KEY
OPENAI_API_KEY
```
Optional: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SEARCH_CACHE_TTL_MINUTES`, model overrides above.

## Working Conventions

### Communication
- **Zvi is stronger in React/frontend** — explain backend changes in clear, practical terms, not jargon
- For non-trivial backend changes, state: **what changed**, **why it changed**, **what could break**
- **Never print raw `.env` secrets** in output or logs — verify only whether keys are present
- For meaningful checkpoints, report what changed, what was verified, and what notes were updated

### Behavior rules
- **Deviate warning:** If your next action would meaningfully differ from my instruction or preference, say so before proceeding. Briefly state the mismatch and why. Do not silently override my intent. Do not warn for minor details.
- **If unsure:** Prefer the smallest change that keeps the codebase and notes aligned. Ask before making a product decision with non-obvious consequences. Describe current reality first and label speculation as future/planned.
- **Keep changes scoped** — finish one feature, fix, or cleanup section cleanly before starting another
- **No overengineering** — build for what's needed now; no speculative abstractions
- Treat implemented behavior and planned work as different things — never present a future idea as already decided

### Environment
- **PowerShell on Windows** — prefer PowerShell-safe commands; never assume Unix-only shell behavior
- Small UI or copy changes: prefer manual verification over a full build every time
- Run tests when they meaningfully reduce risk or validate changed behavior

### After meaningful changes — update notes
- `project-notes/app_flow.md` — if implemented behavior changed
- `project-notes/current-status.md` — short snapshot for next chat
- `project-notes/session-handoff.md` — if a fresh chat would otherwise be misled
- `project-notes/handoff.md` — if remaining work or priorities changed

### Archive rules
- Don't leave old strategies, UI paths, dead components, stale notes, or retired assets in active folders
- Move superseded things to: `project-notes/archive/`, `src/assets/archive/`, `temp-data/archive/`, or a nearby `legacy/` folder
- Active folders should reflect current product direction only
- When archiving, leave a short note or filename that makes the status clear

### Commit workflow (when user says "commit")
- Use only the current git diff — no full repo scan
- Write: short subject line + blank line + concise body (what + why)
- Avoid vague wording; warn if changes are unrelated
- Then commit AND push

## Project Notes Reading Order
When starting a session or touching finalize/latency work, read in this order:
1. `project-notes/session-handoff.md` — fastest current reset
2. `project-notes/active-experiment-override.md` — if touching finalize/prewarm experiment
3. `project-notes/finalize-strategy.md` — before any finalize or latency-architecture changes
4. `project-notes/current-status.md` — immediate snapshot and active constraints
5. `project-notes/app_flow.md` — current implemented behavior
6. `project-notes/handoff.md` — medium-term work and open questions
