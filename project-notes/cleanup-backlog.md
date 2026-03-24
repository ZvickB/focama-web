# Cleanup Backlog

## Purpose
- This file is the running cleanup backlog created from the codebase audit.
- Use it to hand future chats one section at a time without repeating the whole audit.
- After completing any item, update its status line from `Status: pending` to `Status: done`.
- Keep changes scoped. Prefer finishing one item or one section cleanly before starting another.

## How to use this file
- In a new chat, say: "Please read `project-notes/cleanup-backlog.md` first and work only on Section X."
- When a chat completes an item, it should mark that exact item `Status: done`.
- If a task expands or splits, add a new item rather than rewriting history.
- If a task is risky or blocked, leave it `Status: pending` and add a short note below it.
- After finishing a section, run the relevant tests or validation commands.
- If validation passes, make a git commit before moving to the next section.

## Section 1: Backend Hardening

### 1.1 Protect `/api/search/finalize` against direct abuse
Status: done
- Add rate limiting to the finalize handler.
- Add request validation for malformed or oversized `candidatePool` payloads.
- Cap candidate count and note length before sending anything to OpenAI.
- Add tests for rejected malformed, oversized, and rate-limited finalize requests.

### 1.2 Fix production IP handling in Vercel API wrappers
Status: done
- Ensure the Vercel route wrappers forward request headers into the backend handlers.
- Verify the existing IP-based limiter can key off real forwarded IP headers in production paths.
- Add or update tests for header forwarding and rate-limit behavior.

### 1.3 Add basic body-size and candidate-size guardrails
Status: done
- Reject finalize requests that exceed reasonable payload-size limits.
- Reject candidate pools with too many candidates or invalid candidate shapes.
- Keep the limits explicit in code so future chats do not silently expand them.

## Section 2: Backend Architecture Cleanup

### 2.1 Choose and document the primary backend flow
Status: done
- Decide whether the guided flow (`/discover`, `/refine`, `/finalize`) is the sole primary path.
- If yes, clearly demote or remove legacy `/api/search` usage where appropriate.
- Update project notes so they describe one clear backend architecture.

### 2.2 Extract shared search pipeline logic
Status: done
- Pull repeated logic out of `backend/server.js` into reusable helpers or services.
- Consolidate shared steps like validation, cache lookup, SerpApi fetch, filtering, AI selection, and storage writes.
- Keep handler functions thinner and more obviously route-specific.

### 2.3 Revisit cache behavior across guided discovery and finalization
Status: done
- Clarify what should be cached for discovery versus final refined results.
- Reduce overlap between preview caching and finalized-result caching if it is causing confusion or duplication.
- Keep debug output aligned with the actual chosen cache strategy.

## Section 3: Backend Quality and Observability

### 3.1 Tighten finalize and search handler tests
Status: done
- Add focused tests for abuse protection and invalid payload handling.
- Keep tests aligned with the current guided-search contract instead of older flows.
- Make sure happy-path guided behavior stays covered while hardening is added.

### 3.2 Review debug and health tooling
Status: done
- Confirm `/api/search/debug` and `/api/health/supabase` still reflect the current live architecture.
- Remove or simplify debug assumptions that still reflect older flow expectations.
- Keep debug output useful for quick manual verification.

## Section 4: Product and Trust Alignment

### 4.1 Review remaining public copy for backend reality
Status: done
- Recheck trust pages and supporting notes after backend cleanup lands.
- Make sure no page implies the app is simpler or less data-driven than it really is.
- Keep privacy and affiliate language aligned with actual behavior.

### 4.2 Keep project notes in sync after each backend change
Status: done
- Update `app_flow.md`, `current-status.md`, and `session-handoff.md` whenever the backend shape changes meaningfully.
- Treat stale notes as real cleanup debt, not optional polish.
- Note: lightly refreshed on 2026-03-24 after the debug/health tooling cleanup, but left pending so future backend changes still trigger another sync pass.

## Section 5: Optional Later Cleanup

### 5.1 Revisit legacy `/api/search` removal or isolation
Status: pending
- Once the guided flow is clearly stable, decide whether to remove the legacy combined search route entirely.
- If keeping it, mark it clearly as legacy/internal and avoid letting it shape the main app architecture.

### 5.2 Revisit storage/history product direction
Status: pending
- Decide whether search history is purely operational or a future user-facing product feature.
- Keep temporary development storage patterns from quietly becoming permanent product design.
