# Focamai Agent Guide

Read this file first at the start of every chat.

## Purpose
- This file is the front door for AI work in this repo.
- It should point to the right source-of-truth notes without duplicating the whole project history.
- Keep it short, practical, and updated when the workflow changes.

## First reads
- Read `project-notes/session-handoff.md` first for the fastest current reset.
- Read `project-notes/active-experiment-override.md` immediately after `session-handoff.md` when the task touches the current prewarm/finalize experiment.
- Read `project-notes/current-status.md` next for the immediate snapshot and active constraints.
- Read `project-notes/app_flow.md` for current implemented behavior.
- Read `project-notes/handoff.md` for medium-term work and open product questions.
- Read `project-notes/doc_briefs.md` for product intent, UX direction, and broader decisions.
- Read `project-notes/db-needs.md` when you need the plain-language summary of which Supabase tables the current app uses now.
- Read `project-notes/db-cache-setup.md` only when working on cache, Supabase, or storage behavior.
- Read `project-notes/cleanup-backlog.md` only when the task is specifically cleanup or when the user asks to work a section from it.

## Source of truth
- `project-notes/active-experiment-override.md`: highest-priority note for the current prewarm/finalize experiment when it conflicts with older finalize guidance.
- `project-notes/app_flow.md`: what the app does now.
- `project-notes/current-status.md`: short snapshot for the next chat.
- `project-notes/handoff.md`: durable remaining work and open questions.
- `project-notes/doc_briefs.md`: product intent and longer-term direction.
- `project-notes/db-needs.md`: plain-language summary of the current required Supabase tables.
- `project-notes/cleanup-backlog.md`: cleanup debt only, one section at a time.

## Working rules
- Treat implemented behavior and planned work as different things.
- Do not present a future idea as already decided unless the user explicitly chose it.
- If current implementation and future direction differ, write both clearly.
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
- Keep the product vendor-agnostic even if Amazon becomes the strongest affiliate path later.

## Storage and history
- Supabase-backed cache is supported when configured, with local fallback for development.
- The current `search_history` table is operational/internal telemetry for cache and debug visibility.
- The current `search_history` table is not a user-facing saved-history feature.
- If user-facing history is added later, design it explicitly as a separate product feature with its own schema/API.

## Backend guardrails
- Guided `/api/search/finalize` has explicit abuse limits. Do not expand them casually.
- Request body limit is 32 KB.
- Candidate pool limit is 20.
- Priorities are capped and sanitized.
- Follow-up notes are truncated before being sent to AI.
- Vercel API wrappers should preserve forwarded headers so IP-based rate limiting works in production.

## Notes update rules
- After a meaningful backend or product-flow change, update:
  - `project-notes/app_flow.md`
  - `project-notes/current-status.md`
  - `project-notes/session-handoff.md` if a fresh chat would otherwise be misled
- After finishing a meaningful chunk of work, update `project-notes/handoff.md` if remaining work or priorities changed.
- Update `project-notes/cleanup-backlog.md` only when a cleanup item is actually completed, split, or blocked.
- Keep note updates small and accurate. Do not rewrite history just to make notes look cleaner.

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

## Cleanup workflow
- If the user asks to work from `project-notes/cleanup-backlog.md`, work only on the next requested or clearly next reasonable section.
- After finishing that item or section, change its status from `pending` to `done`.
- If the task grows, split it into a new item instead of widening the original one.

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
