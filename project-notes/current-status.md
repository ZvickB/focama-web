# Current Status

## Purpose
- Short current snapshot for future chats.
- Keep this focused on what is true now and where to read details.
- Canonical references:
  - Current implemented behavior: `project-notes/app_flow.md`
  - Finalize guardrails and AI-scope strategy: `project-notes/finalize-strategy.md`
  - Finalize/latency experiment conclusions: `project-notes/active-experiment-override.md`
  - Preferred layered latency plan: `project-notes/layered-latency-plan.md`
  - Longer MVP backlog: `project-notes/handoff.md`

## Current product state
- The app is Vite + React with React Router, TanStack Query, Tailwind, and Vitest.
- The homepage at `/` uses the `open` layout: spacious, search-first, single-column, mobile-first, and not marketplace-shaped.
- Older homepage experiments were removed after the open layout became the chosen direction.
- Product shortlists are 6 items end to end.
- The current frontend uses the PNG wordmark and Instrument Sans.
- A true HTML boot splash starts in `index.html`, shows the PNG wordmark plus `Focused shopping`, includes a static header shell, and fades after React is ready and the splash has been visible for about 1 second.
- Search/refine copy now tells users to start with a normal product search and use the refine step for natural-language narrowing such as budget, size, comfort, style, or use case.
- The homepage supports preview results, final focused picks, a `Start a new search` reset path, and up to 2 feedback-based retry passes that exclude rejected shortlist items.

## Prewarm status
- Prewarm is fully removed from the codebase (completed 2026-04-17).
- Route deleted, all references removed from backend, frontend, tests, and scripts.

## Current backend state
- The primary product flow is guided search:
  - `/api/search/discover`
  - `/api/search/refine`
  - `/api/search/framing-fields`
  - `/api/search/finalize`
  - `/api/search/enrichment` (async polling)
- `/api/search/live` is the explicit manual/debug combined route, not the primary product path.
- Guided discovery is the persistent search-cache boundary; guided finalize and live search remain intentionally uncached.
- `/api/search/discover` returns a preview set plus `discoveryToken`; finalize reconstructs the rich candidate pool from guided discovery cache instead of trusting a browser-posted pool.
- Supabase-backed guided discovery cache is confirmed working in production on `focama.vercel.app`, with local file fallback for development.
- Search-history records are internal operational telemetry, not a user-facing saved-history feature.
- Shared rate limiting prefers Supabase when configured, with in-memory fallback for local/degraded environments.
- Vercel API wrappers preserve forwarded headers so IP-based rate limiting works in production.
- Guided discovery/refine/framing/finalize emit structured `[search-flow]` logs with latency, token usage, candidate counts, and ranking ownership.
- Guided search responses expose `Server-Timing`; the homepage timing panel appears in development or when `?timing=1` is present.

## Current finalize reality
- `/api/search/finalize` uses nano to lock the shortlist fast (~2s), then fires mini enrichment async after responding.
- Blocking finalize cards are metadata only: image, title, source, price, ratings, badge label. No AI copy in the blocking response.
- AI copy (`fit_reason` + `caveat`) is written by mini and stored in the discovery cache `selection.enrichment` field.
- `/api/search/enrichment` GET endpoint — frontend polls with `?token=&query=` until enrichment is ready, then merges `fit_reason`/`caveat` into results by `candidateId`.
- Modal shows a loading placeholder until enrichment arrives (`enrichmentReady = Boolean(item?.fit_reason)`).
- Badge labels are frontend-owned deterministic heuristics assigned after the shortlist arrives.
- Finalize response shape: `flowPath: 'nano_lock'`, `strategy: 'nano_lock'`, no `reusedCandidateAwarePrior`.
- Normal guided finalize responses do not echo the rich candidate pool back to the browser.
- Query framing is split:
  - `/api/search/refine` returns the fast user-visible question
  - `/api/search/framing-fields` returns slower background framing fields for timing/debug only
  - framing fields are not stored server-side or consumed by finalize in normal product flow

## DEV-ONLY settings (revert before launch)
- `SEARCH_CACHE_TTL_MINUTES=999999999` in `.env` — cache effectively never expires while conserving Rainforest credits. Revert to `1440` (24h) or appropriate value at launch.
- Auto-save of every raw Rainforest API response to `temp-data/rainforest-samples/` — fire-and-forget in `backend/lib/rainforest-pipeline.js`. No action needed at launch unless disk usage is a concern; safe to remove or gate behind a `NODE_ENV` check.

## Guardrails
- Keep the guided flow as the main product path unless the user explicitly approves a change.
- Keep shortlist count at 6 unless the user explicitly chooses otherwise.
- Keep the app vendor-agnostic at the response/product level.
- Keep fit explanation value and scan-friendly badges as product behaviors, even if their production shape changes.
- Do not let finalization drift back into a heavy all-polish-before-results AI pass.
- Keep current behavior and planned layered behavior clearly separated.
- For finalize/latency work, read `active-experiment-override.md`, `layered-latency-plan.md`, and `finalize-strategy.md` before changing code.

## Latest measurement conclusions
Full measurement history: `project-notes/active-experiment-override.md`.

Key outcomes:
- Nano locks winners at ~2s; mini async enrichment arrives at ~8–12s. Both wired into product.
- Prewarm removed — not a latency win. Backend route and all references fully deleted.
- `gpt-5.4-nano` is the only plausible fast model for streamed finalize; `gpt-5-mini` rejected (8s+ lock time).
- One-call stream experiment measured and concluded; nano-lock + mini async-enrichment is the wired path.

## Environment notes
- Required for live search/AI: `SERPAPI_API_KEY`, `OPENAI_API_KEY`.
- Optional model overrides: `OPENAI_MODEL`, `OPENAI_REFINEMENT_MODEL`, `OPENAI_FINALIZE_MODEL`, `OPENAI_FINALIZE_CONTEXT_MODEL`, `OPENAI_FINALIZE_EMPTY_MODEL`.
- Optional Supabase config: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`; legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted.
- `SEARCH_CACHE_TTL_MINUTES` defaults to `1440`.
- Work happens in PowerShell on Windows. Never print raw `.env` secret values.

## Recommended next task
- Nano-lock + mini async-enrichment is wired and tests pass. Next logical steps:
  - Verify the golden path in the browser: do cards appear fast, does the modal populate when enrichment arrives?
  - Review product voice in mini's honest-caveat copy against the office chair reference example in CLAUDE.md.
  - Decide whether to keep the `selectAiResults` path in `ai-selector.js` or clean it up since finalize no longer calls it directly.
