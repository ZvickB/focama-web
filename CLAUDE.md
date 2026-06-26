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
npm run server       # Backend only — local native HTTP dev server (port 8787); NOT the Render entry point
npm run test         # Run all tests once
npm run test:watch   # Watch mode
npm run build        # Production build
```

## Architecture

### Guided Search Flow (main product path)
1. `GET /api/search/rainforest-discover` — fetch search results, build 20-candidate pool, return preview + `discoveryToken`
2. `GET /api/search/refine` — generate one short AI follow-up question
3. `POST /api/search/finalize` — accept user's follow-up answer, pick 6 results with fit reasons

Finalize **reconstructs** the candidate pool from cache — never trusts browser-posted candidate data.

### Key Directories
```
src/                        React frontend
src/components/home/        Core guided search UI + useGuidedSearch hook
backend/server.js           Core route handler functions (exported; not the entry point)
backend/express-server.js   Express server — Render production entry point (node backend/express-server.js)
backend/lib/                Business logic modules (ai-selector, rate-limiter, search-cache, etc.)
api/geo.js                  Deliberate Vercel-only geo helper used by the frontend Auto marketplace flow
project-notes/              Living docs: flow, status, decisions, experiment notes
project-notes/archive/      Superseded docs — read for history, don't treat as current
```

## Tech Stack
- **Frontend:** React 19, React Router v7, TanStack Query, Tailwind CSS 3, Vite
- **Backend:** Node.js + Express (`backend/express-server.js`), OpenAI API, Anthropic API, SerpApi, Supabase
- **Testing:** Vitest + @testing-library/react
- **Deploy:** Frontend on Vercel; Backend on Render (`render.yaml`). Frontend API calls go directly to Render via `VITE_BACKEND_URL`, except `api/geo.js` which stays on Vercel for geolocation headers.

## AI Models
- Refinement: gpt-5-mini first for the first question and chips, with Haiku fallback
- Finalize lock: claude-haiku-4-5-20251001 (~2s, shortlist selection)
- Finalize enrichment: gpt-5-mini (async, writes fit_reason + caveat after lock)
- Model env vars: `OPENAI_REFINEMENT_MODEL`, `OPENAI_FINALIZE_MODEL`, `OPENAI_FINALIZE_CONTEXT_MODEL`, `OPENAI_FINALIZE_EMPTY_MODEL`, `CLAUDE_API_KEY`

## Caching
- Discovery results cached (Supabase or local file fallback)
- Finalize and live search are intentionally uncached (request-specific)
- Cache keys normalize lowercase, spacing, and product plural forms

## Backend Guardrails (don't remove these)
- Request body limit: 32 KB on finalize
- Candidate pool cap: 30
- Follow-up notes truncated to 500 chars before AI
- Rate limit: 15 requests per IP per 10-second rolling window
- Max 2 retry attempts per search

## Required Environment Variables
```
SERPAPI_API_KEY          # SerpApi (legacy discovery path)
OPENAI_API_KEY           # OpenAI (refinement + enrichment)
CLAUDE_API_KEY           # Anthropic (haiku finalize lock)
```
Frontend (set in Vercel):
```
VITE_BACKEND_URL         # URL of the Render backend — used by the frontend for direct API calls
```
Optional: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SEARCH_CACHE_TTL_MINUTES`, `ALLOWED_ORIGIN`, model overrides above.

## Current Product Direction
- The homepage at `/` uses the `open` layout — that is the default direction for now.
- The product should feel calm, focused, mobile-first, and not marketplace-shaped.
- The guided backend flow is the main product path: `/api/search/discover` → `/api/search/refine` → `/api/search/finalize`
- `/api/search/live` is the explicit manual/debug combined route.
- Product shortlists are 6 items end to end.
- Prefer the PNG wordmark for now instead of forcing a weak SVG recreation.
- Focamai should not feel like an Amazon clone or marketplace wall. Its product identity is the focused decision aid, not Amazon's browsing experience.
- Amazon is the current primary commerce path and affiliate target. When the active source is Amazon, frontend copy, buttons, labels, and detail UI may say Amazon directly where it improves clarity, trust, or conversion.
- Do not force generic `retailer` language in user-facing UI when `Amazon` is more accurate for the current experience.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible so another source can be added or swapped later.
- Do not let future multi-retailer flexibility make today's Amazon-first UX vague. If more retailers become active, revisit frontend labels based on the real source mix.

## Storage and History
- Supabase-backed cache is supported when configured, with local fallback for development.
- The current `search_history` table is operational/internal telemetry for cache and debug visibility.
- The current `search_history` table is **not** a user-facing saved-history feature.
- If user-facing history is added later, design it explicitly as a separate product feature with its own schema/API.

## Working Conventions

### Communication
- **Zvi is stronger in React/frontend** — explain backend changes in clear, practical terms, not jargon
- For non-trivial backend changes, state: **what changed**, **why it changed**, **what could break**
- **Never print raw `.env` secrets** in output or logs — verify only whether keys are present
- For meaningful checkpoints, report what changed, what was verified, and what notes were updated

### Behavior rules
- **Do not make changes that weren't part of the requested task.** If you notice a discrepancy or something that looks wrong while doing something else, flag it — don't fix it. When a task is given, carry it out fully; don't hold back on changes that are clearly part of it.
- **Deviate warning:** If your next action would meaningfully differ from my instruction or preference, say so before proceeding. Briefly state the mismatch and why. Do not silently override my intent. Do not warn for minor details.
- **If unsure:** Prefer the smallest change that keeps the codebase and notes aligned. Ask before making a product decision with non-obvious consequences. Describe current reality first and label speculation as future/planned.
- **Keep changes scoped** — finish one feature, fix, or cleanup section cleanly before starting another
- **No overengineering** — build for what's needed now; no speculative abstractions
- Treat implemented behavior and planned work as different things — never present a future idea as already decided
- If active notes and code disagree, treat the code as current reality unless explicitly told otherwise. Flag the mismatch once and update the notes when it's part of the work.
- Project notes and constraints are guardrails for the assistant, not limits on the user. If the user explicitly wants a direction that conflicts with existing notes or prior guidance, give a clear warning about the tradeoff once, then follow the user's decision.
- When the user overrides a prior note or planned direction, update the relevant notes so future chats don't keep treating the older direction as active.
- After any meaningful revision, clean up superseded code, copy, notes, and assets in the same pass when it is safe to do so.
- Do not let temporary development tooling quietly become product architecture without noting it explicitly.

### Environment
- **PowerShell on Windows** — prefer PowerShell-safe commands; never assume Unix-only shell behavior
- **Never run `taskkill //F //IM node.exe`** — this kills ALL Node processes including Claude Code itself (which runs on Node.js). To stop a dev server, use `npx kill-port <port>` to target specific ports instead.
- Small UI or copy changes: prefer manual verification over a full build every time

### Testing
- Run existing tests after touching backend logic, routes, or AI selector functions — even if the change looks safe
- Write new tests when adding new routes, new AI functions, or new data contracts — as part of the same task, not after
- Harness-only measurement code and project notes do not need tests
- If a test run hits a Windows `EPERM` error before Vitest starts, retry once before investigating

### After meaningful changes — update notes
- `project-notes/app_flow.md` — if implemented behavior changed
- `project-notes/current-status.md` — short snapshot for next chat
- `project-notes/session-handoff.md` — if a fresh chat would otherwise be misled
- `project-notes/handoff.md` — if remaining work or priorities changed
- When a provider path is intentionally deferred or temporarily not wired, record the exact re-entry points in active project notes so future chats know what must be switched later.
- Keep note updates small and accurate. Do not rewrite history just to make notes look cleaner.
- Prefer concise, de-duplicated active notes, but do not enforce a hard line-count limit. Let canonical source-of-truth notes be as long as needed to preserve guardrails, current/planned clarity, and measurement conclusions.

### File organization — cohesion over size
- Organize code by **responsibility**, not by line count. Length alone is never a reason to split; shortness is never a reason to merge.
- Default to leaving files as they are. A handful of small fragments is worse than one cohesive file.
- **Split when** there's a real seam: a pure side-effect-free layer (helpers, constants, transforms), a god module doing multiple unrelated jobs, or a self-contained component reused by more than one file.
- **Don't split** when: it's a cohesive single-purpose module (long ≠ wrong), a stateful hook whose `useState`/`useRef` threads through most of the body, an orchestrator that wires children together, or the split would produce single-function files or force state-threading just to hit a line count.
- Size is a prompt to look, not a limit to enforce. If a file grows past a few hundred lines, ask "is this still one job?" — if yes, leave it.
- When you do split, preserve the seam: same names, same signatures, no logic changes in the same step. Re-export moved names from the original file so callers don't change.
- Bias toward less. If you're debating whether to extract, it usually isn't worth it yet.

### Archive rules
- Don't leave old strategies, UI paths, dead components, stale notes, or retired assets in active folders
- Move superseded things to: `project-notes/archive/`, `src/assets/archive/`, `temp-data/archive/`, or a nearby `legacy/` folder
- Active folders should reflect current product direction only
- When archiving, leave a short note or filename that makes the status clear
- Do not move active files just to be tidy. Archive only items that are clearly no longer part of the current product direction.

**Suggested archive locations:**
- Old notes and planning docs → `project-notes/archive/`
- Old UI experiments or retired app paths → a nearby `legacy/` or `archive/` folder inside the relevant feature area
- Retired images, logos, or brand experiments → `src/assets/archive/`
- Temporary research artifacts or one-off evaluation data that still needs to be kept → `temp-data/archive/`

### Commit workflow (when user says "commit")
- Use only the current git diff — no full repo scan
- Write: short subject line + blank line + concise body (what + why)
- Avoid vague wording; warn if changes are unrelated
- Then commit AND push

## Project Notes Reading Order
Read `project-notes/assistant-start.md` first at the start of every session — it gives compact current context and read-routing. Do not read every project note at startup. Open deeper notes only when the user's task requires them.

| Note | When to read |
|---|---|
| `project-notes/session-handoff.md` | Need a fuller fresh-chat reset |
| `project-notes/current-status.md` | Need the current snapshot/changelog |
| `project-notes/app_flow.md` | Changing or explaining implemented product behavior |
| `project-notes/search-flow.md` | Changing or explaining search/backend flow |
| `project-notes/ui_improvement_plan/README.md` | Working on the new web UI direction |
| `project-notes/handoff.md` | Medium-term work and open product questions |
| `project-notes/doc_briefs.md` | Product intent, UX direction, and broader decisions |
| `project-notes/db-needs.md` | Storage/backend table behavior |

