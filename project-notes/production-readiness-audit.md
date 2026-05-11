# Production Readiness Audit

**Date:** 2026-05-11
**Verdict:** Advanced MVP — ~70% of the way to production-ready.

The core product works end-to-end, tests pass (138/138), deployment is real, and code quality is consistently solid. Several production blockers remain.

---

## What's solidly production-quality already

- **Test coverage** — 18 test files, 138 passing tests covering backend lib modules and key frontend components.
- **Input validation & sanitization** — body size limits (32KB finalize, 16KB others), string truncation constants, type coercion, candidate pool cap.
- **CORS, rate limiting, token scoping** — structurally correct. Token-scoped enrichment and finalize-from-cache-only are strong security decisions.
- **Lazy loading & code splitting** — homepage shell → experience split is clean. Bundle budget is actively managed.
- **SEO plumbing** — metadata, OG tags, sitemap, robots.txt, manifest, canonicals all in place.
- **Analytics** — Vercel Analytics + SpeedInsights + custom funnel events.
- **Deployment** — real infrastructure (Vercel + Render), Supabase with local fallback.
- **UI polish** — loading states, enrichment hydration, retry flow, modal.

---

## Production blockers — fix before public launch

### 1. Security headers are missing
No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, or `Referrer-Policy`. Add `helmet` to the Express server (one line). `vercel.json` also has no `headers` block.

### 2. Error responses leak internal error messages
In at least 3 routes (`/rainforest-discover`, `/refine`, `/finalize`), catch blocks return:
```js
sendJson(response, 500, { error: '...', details: error.message })
```
`error.message` can expose internal paths, third-party API error payloads, or stack hints. Strip `details` from all 500 responses in production, or filter it behind `NODE_ENV !== 'production'`.

### 3. `CLAUDE_API_KEY` is not in `render.yaml`
The backend uses it for Haiku finalize lock but it's absent from `render.yaml`. If Render is rebuilt from yaml (new service, staging env), finalize would silently fail with no obvious env-level explanation. Add it.

### 4. CORS: `sendJson` sends `*` for multi-origin setups
`http.js` exports `ALLOWED_ORIGIN = ALLOWED_ORIGINS.length === 1 ? ALLOWED_ORIGINS[0] : '*'`. In production with 3 origins configured, `ALLOWED_ORIGIN = '*'`. The OPTIONS preflight correctly uses `resolveCorsOrigin()`, but every `sendJson()` call sends `Access-Control-Allow-Origin: *`. Behavioral impact is low now (no credentials), but it defeats the allowlist and will break if auth is ever added. Fix: thread `resolveCorsOrigin(requestOrigin)` into `sendJson` instead of using the module constant.

### 5. No error tracking or alerting
No Sentry, Datadog, or equivalent. When something breaks in production — an Oxylabs timeout, an OpenAI error, a Haiku failure — it logs to `console.info` and disappears. There's no way to know how often finalize fails or what the failure distribution looks like. Add Sentry to the Express server before real traffic.

### 6. Affiliate disclosure not integrated into clickout
`/affiliate-disclosure` page exists but there's no disclosure adjacent to the modal CTA. Most affiliate programs require in-flow disclosure, not just a footer page. Both a legal/program-compliance gap and a user trust issue.

---

## Significant but not immediate blockers

**Rate limiting is process-local** — resets on every Render dyno restart, ineffective if Render scales to multiple instances. Fine for low traffic now; switch to Supabase-backed rate limiting before any public sharing that could drive real volume.

**`server.js` is 1886 lines** — already flagged in handoff. Route orchestration and business logic are tightly coupled. No immediate harm but will slow debugging and feature work as it grows.

**Lazy-load failure UX is thin** — the app already has a top-level `ErrorBoundary` in `src/main.jsx`, so this is not a missing crash guard. Still, `App.jsx` uses `<Suspense fallback={null}>`, which means route-chunk load failures or long waits may not produce a very helpful user experience. Worth tightening before heavier traffic.

**`runInBackground` swallows all errors silently** — `Promise.resolve(task).catch(() => {})` means background enrichment failures produce zero signal. At minimum log them.

---

## Minor / polish

- The About page still exists alongside `/why` — one should go or they need clear differentiation.
- `isDesktop` detection via `'ontouchstart' in window` is unreliable (Chromebooks, some Windows touchscreens).
- `render.yaml` doesn't document `CLAUDE_API_KEY` or some model override vars.

---

## Recommended priority order

| Priority | Item |
|----------|------|
| 1 | Add `helmet` to Express — security headers in one shot |
| 2 | Strip `details: error.message` from 500 responses in production |
| 3 | Add `CLAUDE_API_KEY` to `render.yaml` |
| 4 | Fix `sendJson` to use `resolveCorsOrigin()` instead of the wildcard constant |
| 5 | Add Sentry (or equivalent) for error tracking |
| 6 | Inline affiliate disclosure adjacent to the modal CTA |
| 7 | Done — visible route suspense fallback plus chunk-load-specific recovery copy |
| 8 | Done — Supabase-backed shared rate-limit event log with memory fallback |

Items 1–8 are now addressed in code/notes. The remaining operational dependency for item 8 is creating the Supabase `rate_limit_events` table in production.

## Follow-up completion notes

- Priorities 7–8 were completed on 2026-05-11.
- Frontend route lazy loading now has a visible loading fallback instead of `null`, and the top-level boundary explains likely chunk-load failures with reload/home recovery actions.
- Backend rate limiting now prefers Supabase `rate_limit_events` when Supabase is configured, hashes client IP keys before storage, and keeps the process-local limiter as a fallback for local/test or storage outages.
- Production Supabase should include the `rate_limit_events` table from `project-notes/db-needs.md` before broader public traffic.
