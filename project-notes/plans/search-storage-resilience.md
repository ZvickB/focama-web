# Search Storage Resilience

## Status

- Immediate safeguards are implemented on `fix/supabase-timeout-degraded-flow`.
- On 2026-08-27 the user explicitly chose the non-Redis architecture. Render Key Value/Redis is not approved and is not a current follow-up.
- This document retains the earlier store-split analysis only so the tradeoff is not rediscovered without context.

## Why this is being considered

On 2026-08-27, a production discovery request took about 105 seconds even though the Rainforest provider stage took about 6 seconds. The remaining delay occurred after provider completion while Supabase was reporting a latency incident. Normal successful discovery measurements did not show a sustained 100-second regression, so this is currently treated as a serious tail-latency failure rather than proof that Supabase is always slow.

The current flow lets several independent Supabase operations participate in the blocking search path. Most are optional, but one is required: finalize reconstructs its trusted candidate pool from a token-scoped discovery snapshot instead of trusting candidate data supplied by the browser.

## Current responsibilities

Supabase currently supports both short-lived search infrastructure and durable product/account data:

- Shared guided-search cache
- Token-scoped discovery sessions used by finalize
- Shared rate limiting
- Search history, analytics, and diagnostics
- Sensitive-image verdict cache
- Product-detail and Deep Dive caches
- Auth, preferences, saved searches, and price watches

These responsibilities have different latency and durability needs. A short-lived discovery session behaves like key-value data, while accounts and saved records remain relational application data.

## Implemented non-Redis architecture

Keep Supabase for shared/durable state while removing it from the first-product critical path:

1. Use process-local request limiting by default. The repaired Supabase limiter remains an explicit opt-in only.
2. Put a short deadline around discovery cache reads. Treat a timeout as a cache miss and continue to Rainforest.
3. Keep sensitive images hidden when the optional verdict lookup times out.
4. Keep shared cache writes, search history, analytics, and diagnostics off the response path.
5. Start token-scoped session persistence immediately but do not await it before returning previews. Put the entry in process memory first; if an immediate finalize reaches another process, poll only for the recent timestamped token for up to 2.5 seconds.
6. Protect paid Rainforest cache misses separately with a per-client start limit and per-process concurrency cap. Cache hits consume neither.
7. Emit structured Render logs and `Server-Timing` stages for timeouts, skips, fallbacks, pending sessions, and provider-guard blocks. Supabase must not be the only destination for logs about a Supabase failure.
8. Verify the browser-visible experience with normal, delayed, failed, cached, and uncached storage scenarios.

The API may return a pending token because finalize still validates it exclusively against server-owned context. A missing background session becomes the existing expired-session response; browser candidate data is never accepted as a fallback.

## Rejected-for-now store-split alternative

Move only latency-critical ephemeral search state to a same-region managed key-value store:

```text
Render backend
  |-- Render Key Value
  |     |-- token-scoped discovery sessions
  |     |-- shared discovery cache
  |     `-- distributed rate limiting
  |
  |-- Supabase
  |     |-- auth, preferences, and saved searches
  |     |-- price watches and durable product data
  |     `-- analytics and operational history
  |
  `-- Rainforest
        `-- fresh Amazon discovery
```

Render Key Value is the leading option because the backend already runs on Render and a same-region instance can use Render's private network. This reduces network distance and fits the access pattern better than relational rows for short-lived cache/session keys.

## Expected benefits

- More predictable cache and session latency on the user-facing search path
- Shared state across Render web-service instances
- Natural TTL support for temporary sessions and cached searches
- Supabase incidents no longer block basic discovery or finalize session creation
- Supabase remains available for the relational and durable features it is well suited to

## Costs and risks

- Another paid service, client library, credential, dashboard, and incident surface
- Dual-store operational complexity and additional health checks
- Migration and rollback logic for active discovery sessions
- Cache eviction or key-value restarts can still invalidate active sessions unless persistence and recovery behavior are chosen deliberately
- A store split will not improve Rainforest or AI-provider latency

## Alternatives considered

### Keep Supabase and harden the flow

Lowest complexity and the correct first step. Explicit deadlines remove extreme waits and measurements show whether a migration is actually warranted.

### Use a signed or encrypted browser token as the session

This could remove the required session write, but a candidate pool of up to 30 products creates a large request token. It also adds payload-size, key-rotation, replay, and abuse-control complexity. Do not pursue this unless measured storage availability remains unacceptable after the simpler safeguards.

### Move all application storage away from Supabase

Not justified. Auth, saved searches, preferences, price watches, and relational analytics have different requirements from ephemeral discovery state.

## Measurements to monitor the chosen flow

Collect at least the following by cache status and marketplace:

- Browser submit to first visible feedback
- Browser submit to first meaningful product content
- Backend total, provider, cache-read, session-write, and post-provider durations
- p50, p90, p95, and maximum latency
- Cache-read timeout rate
- Session-write degraded-response rate
- Local rate-limit fallback rate
- Additional paid Rainforest calls caused by cache-read timeouts

Initial decision triggers, to be revisited after observing real traffic:

- Supabase contributes more than 500 ms at p95 to cached discovery requests, or
- More than 0.5% of discovery requests lose focused-picks availability because the required session snapshot cannot be confirmed.

Crossing a trigger now means revisit the nonblocking flow and deployment-region/network behavior first. Redis/Render Key Value requires a new explicit user decision.

## Historical migration outline (inactive)

1. Add a storage interface for discovery sessions, shared search cache, and rate limiting without changing their public handler contracts.
2. Add Render Key Value as a feature-flagged implementation in the same region as the backend.
3. Shadow-write and compare read results without serving from the new store.
4. Serve discovery sessions from Key Value first, with a temporary Supabase fallback during rollout.
5. Move shared cache and rate limiting only after session behavior is stable.
6. Remove transitional dual-write code after the observation window.

## Rollback

- Keep store selection behind an environment flag during rollout.
- Restore Supabase as the primary implementation without changing API response shapes.
- Treat missing ephemeral keys as cache misses or expired sessions; never trust a browser-supplied candidate pool as a rollback shortcut.

## Explicit non-decisions

- No Render Key Value instance has been approved or provisioned; the user explicitly excluded Redis from the current solution.
- No Supabase tables are being retired.
- No provider or AI model change is part of this proposal.
- No change is being made to the server-owned candidate-pool trust boundary.
