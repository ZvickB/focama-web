# Completed Work Archive — 2026-05-03

## Purpose
- Archive recently completed or superseded notes that no longer belong in the active `project-notes/` root.
- Keep one simple breadcrumb for future chats that need history without polluting the active source of truth.

## Files moved out of the active root
- `audit-2026-05-02.md`
  - Detailed cleanup audit for the Render commitment and dead-code pass.
- `finalize-selection-notes-superseded-2026-05-03.md`
  - Older selection-prompt observations from the earlier nano-era finalize path.
- `render-improvements-superseded-2026-05-03.md`
  - Implementation-plan style Render migration notes. Any still-relevant remaining work now lives in `project-notes/todo.md` and `project-notes/handoff.md`.
- `retry-redesign-superseded-2026-05-03.md`
  - Proposal-stage retry note. Current retry reality is now documented in `app_flow.md` and `current-status.md`.
- `remove-prewarm-task-2026-05-03.md`
  - Completed task note for prewarm removal.

## Done items removed from `todo.md`

### AI / Core Flow
- Removed leftover prewarm code.
- Removed temporary measurement fields from finalize.
- Removed the local-only `/api/search/finalize-stream` route and stream harness mode.
- Made the user’s follow-up answer the dominant signal in final selection.
- Removed enrichment-delay simulation from the UI.
- Removed the old `selectAiResults` path and dead discovery/live wrapper leftovers.

### UI Polish
- Added Motion-based entrance/exit animation passes across cards, refinement copy, and the modal.
- Surfaced Amazon bullet-point descriptions in the modal before AI personalization arrives.
- Added a shimmer/loading treatment for AI personalization.
- Improved the visibility of `Show products now`.
- Widened the results layout on desktop and improved button placement.
- Fixed product-card layout issues and hover behavior.
- Added an empty-state screen.
- Landed the suggestion-led retry escape hatch.
- Rechecked mobile product-detail sheet behavior and CTA placement.

### Backend / Platform
- Added timeouts to slow external calls.
- Passed user location into provider requests.
- Stripped internal error details from public API errors.
- Added unit coverage for country/domain helpers and the Error Boundary.
- Restricted CORS to owned origins.
- Added `Vary: Origin`.
- Wired backend analytics writes and frontend impression/click events.

### DB / Analytics
- Prepared and wired the funnel analytics tables.

## Active note boundary after this cleanup
- Current behavior lives in `app_flow.md`.
- Current snapshot lives in `current-status.md`.
- Remaining work lives in `handoff.md` and `todo.md`.
- History, completed audits, and superseded strategy notes stay in `archive/`.
