# Focamai Agent Guide

Read this file first at the start of every chat.

## Purpose
- This file is the front door for AI work in this repo.
- It should point to the right source-of-truth notes without duplicating the whole project history.
- Keep it short, practical, and updated when the workflow changes.

## First reads
- Read `project-notes/assistant-start.md` first for compact current context.
- Do not read every project note at startup.
- Open deeper notes only when the user's task requires them.
- Read `project-notes/session-handoff.md` only when you need a fuller fresh-chat reset.
- Read `project-notes/current-status.md` when you need the current snapshot/changelog.
- Read `project-notes/app_flow.md` when changing or explaining implemented product behavior.
- Read `project-notes/search-flow.md` when changing or explaining search/backend flow.
- Read `project-notes/plans/ui_improvement_plan/README.md` when working on the new web UI direction.
- Read `project-notes/handoff.md` for medium-term work and open product questions.
- Read `project-notes/doc_briefs.md` for product intent, UX direction, and broader decisions.
- Read `project-notes/db-needs.md` when storage/backend table behavior matters.

## Source of truth
- `project-notes/assistant-start.md`: compact startup context and read-routing.
- `project-notes/app_flow.md`: what the app does now.
- `project-notes/current-status.md`: short snapshot for the next chat.
- `project-notes/search-flow.md`: search/backend flow details.
- `project-notes/plans/ui_improvement_plan/README.md`: planned web UI improvements inspired by mobile.
- `project-notes/handoff.md`: durable remaining work and open questions.
- `project-notes/doc_briefs.md`: product intent and longer-term direction.
- `project-notes/db-needs.md`: plain-language summary of the current required Supabase tables.

## Working rules
- Treat implemented behavior and planned work as different things.
- Do not present a future idea as already decided unless the user explicitly chose it.
- If current implementation and future direction differ, write both clearly.
- If active notes and code disagree, treat the code as current reality unless the user explicitly says otherwise.
- When you notice that active notes do not reflect reality, flag the mismatch clearly once and update the relevant active notes when it is part of the work.
- Project notes and constraints are guardrails for the assistant, not limits on the user.
- If the user explicitly wants a direction that conflicts with existing notes or prior guidance, give a clear warning about the tradeoff or risk once, then follow the user's decision.
- When the user overrides a prior note or planned direction, update the relevant notes so future chats do not keep treating the older direction as the active one.
- Keep changes scoped. Finish one feature, fix, or cleanup section cleanly before starting another.
- After any meaningful revision, clean up superseded code, copy, notes, and assets in the same pass when it is safe to do so.
- If an old strategy, UI, asset, or note may still be useful for reference, move it to a clearly named archive location instead of leaving it mixed into the active product path.
- Do not let temporary development tooling quietly become product architecture without noting that explicitly.
- Do not overengineer early scaling or abstraction work before the product needs it.

## Current product direction
- The homepage at `/` uses the `open` layout and that is the default direction for now.
- The product should feel calm, focused, mobile-first, and not marketplace-shaped.
- The guided backend flow is the main product path:
  - `/api/search/discover`
  - `/api/search/refine`
  - `/api/search/finalize`
- `/api/search/live` is the explicit manual/debug combined route.
- Product shortlists are 6 items end to end.
- Prefer the PNG wordmark for now instead of forcing a weak SVG recreation.
- Focamai should not feel like a prettier Amazon wall or marketplace clone. It should feel like a focused decision aid that helps the user narrow choices before leaving to shop.
- Amazon is the current primary commerce path and affiliate target. When the active source is Amazon, frontend copy, buttons, labels, and detail UI may say Amazon directly where that improves clarity, trust, or conversion.
- Do not force generic labels like `retailer` in user-facing UI when `Amazon` is more accurate for the current experience.
- Keep backend/provider logic, normalized product data, and search flow reasonably provider-flexible so another source can be added or swapped later.
- Do not let future multi-retailer flexibility make today's Amazon-first UX vague. If more retailers become active, revisit frontend labels based on the real source mix.

## Storage and history
- Supabase-backed cache is supported when configured, with local fallback for development.
- The current `search_history` table is operational/internal telemetry for cache and debug visibility.
- The current `search_history` table is not a user-facing saved-history feature.
- If user-facing history is added later, design it explicitly as a separate product feature with its own schema/API.

## Backend guardrails
- Guided `/api/search/finalize` has explicit abuse limits. Do not expand them casually.
- Request body limit is 32 KB.
- Candidate pool limit is 30. This was deliberately raised so Haiku can consider more of Rainforest's typical search result set without a meaningful latency increase; do not expand it casually.
- Priorities are capped and sanitized.
- Follow-up notes are truncated before being sent to AI.
- Vercel API wrappers should preserve forwarded headers so IP-based rate limiting works in production.

## File organization — cohesion over size
- Organize code by **responsibility**, not by line count. Length alone is never a reason to split; shortness is never a reason to merge.
- Default to leaving files as they are. A handful of small fragments is worse than one cohesive file.
- **Split when** there's a real seam: a pure side-effect-free layer (helpers, constants, transforms), a god module doing multiple unrelated jobs, or a self-contained component reused by more than one file.
- **Don't split** when: it's a cohesive single-purpose module (long ≠ wrong), a stateful hook whose `useState`/`useRef` threads through most of the body, an orchestrator that wires children together, or the split would produce single-function files or force state-threading just to hit a line count.
- Size is a prompt to look, not a limit to enforce. If a file grows past a few hundred lines, ask "is this still one job?" — if yes, leave it.
- When you do split, preserve the seam: same names, same signatures, no logic changes in the same step. Re-export moved names from the original file so callers don't change.
- Bias toward less. If you're debating whether to extract, it usually isn't worth it yet.

## Notes update rules
- After a meaningful backend or product-flow change, update:
  - `project-notes/app_flow.md`
  - `project-notes/current-status.md`
  - `project-notes/session-handoff.md` if a fresh chat would otherwise be misled
- After finishing a meaningful chunk of work, update `project-notes/handoff.md` if remaining work or priorities changed.
- When a provider path is intentionally deferred or temporarily not wired, record the exact re-entry points in active project notes so future chats know what must be switched later.
- Keep note updates small and accurate. Do not rewrite history just to make notes look cleaner.
- Prefer concise, de-duplicated active notes, but do not enforce a hard line-count limit.
- Let canonical source-of-truth notes be as long as needed to preserve guardrails, current/planned clarity, and measurement conclusions.

## Cleanup and archive rules
- Do not leave old strategies, unused UI paths, dead components, stale notes, or retired assets in active folders just because they might be useful later.
- If they are no longer part of the active product, either delete them or move them into a dedicated archive-style location.
- Prefer obvious names such as `legacy/`, `archive/`, or `project-notes/archive/` depending on what is being preserved.
- Active folders should reflect the current product direction, not every historical direction the project has tried.
- When archiving something, leave a short note or filename that makes its status clear so future chats do not treat it as active.

## Suggested archive structure
- Old notes and planning docs: `project-notes/archive/`
- Old UI experiments or retired app paths: a nearby `legacy/` or `archive/` folder inside the relevant feature area
- Retired images, logos, or brand experiments: an `archive/` folder inside `src/assets/`
- Temporary research artifacts or one-off evaluation data that still needs to be kept: `temp-data/archive/`
- Do not move active files just to be tidy. Archive only items that are clearly no longer part of the current product direction.

## Communication preferences
- The user is stronger in React/frontend than backend architecture.
- Assume solid general web-dev knowledge, but do not assume deep backend expertise.
- When making backend changes, explain the reasoning in clear practical terms.
- Prefer concrete explanations of request flow, data shape, and tradeoffs over backend jargon.
- For non-trivial backend changes, briefly state:
  - what changed
  - why it changed
  - what could break

## Workflow preferences
- This repo is worked in PowerShell on Windows. Prefer PowerShell-safe commands.
- For small UI or copy changes, prefer manual verification over running a full build every time.
- Run tests when they meaningfully reduce risk or validate changed behavior.
- For meaningful checkpoints, report what changed, what was verified, and what notes were updated.
- Never print full `.env` contents or raw secret values into tool output. When checking configuration, verify only whether required keys are present or mask the values.

## If unsure
- Prefer the smallest change that keeps the codebase and notes aligned.
- Ask before making a product decision with non-obvious consequences.
- If there is any ambiguity, describe current reality first and label speculation as future/planned.

## If you are going to deviate from instructions
If your next action would meaningfully differ from my instruction or preference, say so before proceeding. Briefly state the mismatch and why. Do not silently override my intent. Do not warn for minor details.

## Commit Workflow

When the user says "commit":

- Use only the current git diff (no full repo scan)
- Write a commit message with:
  - short subject
  - blank line
  - concise body (what + why)
- Avoid vague wording
- If changes are unrelated, warn instead

Then commit and push.
