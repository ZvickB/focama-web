# Focama Project Audit

**Date:** 2026-03-30
**Model:** Claude Opus 4.6
**Scope:** Architecture, backend, scaling, security, cleanup debt, product direction

---

## 1. Executive Summary

Focama is a pre-v1 AI-assisted shopping recommendation product deployed on Vercel, built with React/Vite on the frontend and Node.js serverless functions on the backend. It uses SerpApi for product discovery, OpenAI for refinement and ranking, and optional Supabase for caching, rate limiting, and analytics.

**Overall assessment:** The project is in a coherent and intentionally scoped state for its current stage. The architecture notes are unusually well-maintained and the project shows clear evidence of disciplined iteration. The most important risks are around scaling the AI-dependent finalize path, the absence of authentication, and a few backend robustness gaps. Most issues identified are appropriate to address before broader sharing or a paid launch, not urgent for the current internal/tester phase.

There are no catastrophic problems. The codebase is not broken, the notes are not misleading, and the project direction is internally consistent. The findings below are ordered by practical impact and urgency.

---

## 2. Confirmed Findings

### F1. No API authentication — any client can call any endpoint
- **Severity:** High
- **Category:** Security / abuse prevention
- **Files:** `backend/server.js` (all route handlers), `api/` (all wrappers)
- **Status:** Confirmed
- **Why it matters:** There is no API key, JWT, session token, or any form of caller authentication. Anyone who knows the endpoint URLs can call discover, refine, finalize, analytics, and debug endpoints. Rate limiting is the only defense, and it is IP-based only.
- **At scale:** A motivated abuser could burn through SerpApi and OpenAI credits by rotating IPs or using proxies. The analytics endpoint could be flooded with fake events.
- **Current-stage assessment:** Acceptable for internal testing with a small number of known testers. Must be addressed before public launch or any paid tier.
- **When to address:** Before broader sharing / public launch.

### F2. CORS set to `*` on all responses
- **Severity:** Medium
- **Category:** Security
- **Files:** `backend/server.js:86`, `backend/server.js:1264`
- **Status:** Confirmed
- **Why it matters:** Any website can make requests to the Focama API from a browser context. Combined with F1 (no auth), this means any third-party page could use your API as a free search proxy.
- **At scale:** An attacker could embed calls to your API from their own site, consuming your SerpApi/OpenAI credits.
- **Current-stage assessment:** Acceptable for local dev and internal testing. Standard to restrict before production.
- **When to address:** Before public launch, restrict to your own domain(s).

### F3. Rate limit race condition in Supabase shared limiter
- **Severity:** Medium
- **Category:** Backend robustness
- **Files:** `backend/lib/search-storage.js:291-330`
- **Status:** Confirmed
- **Why it matters:** The shared rate limiter does insert-then-count. Between the insert and the count, concurrent requests from the same IP could all insert and then all count — allowing more requests through than the limit intends. Under Vercel's concurrent serverless execution, this is a real scenario.
- **At scale:** The 5-request-per-minute limit could effectively become 10-15 under concurrent load. This weakens the rate limit but doesn't eliminate it.
- **Current-stage assessment:** Low-traffic, so the practical impact is near zero right now. The in-memory fallback works correctly for single-instance local dev.
- **When to address:** Before traffic grows or before relying on rate limiting as a real cost control.

### F4. No fetch timeout on external API calls (SerpApi, OpenAI)
- **Severity:** Medium
- **Category:** Backend robustness / operational risk
- **Files:** `backend/lib/search-pipeline.js:86` (SerpApi fetch), `backend/lib/ai-selector.js:308` (OpenAI fetch)
- **Status:** Confirmed
- **Why it matters:** Neither the SerpApi nor OpenAI `fetch()` calls have an explicit timeout. If either service hangs, the request hangs until the Vercel function timeout (default 10s for hobby, 60s for pro). Finalize already averages 7.5-10.8s — close to hobby-tier limits.
- **At scale:** A slow OpenAI response could cause Vercel function timeouts, wasting execution time and leaving users with no response.
- **Current-stage assessment:** Medium risk now given finalize latency is already high.
- **When to address:** Soon. Add `AbortController` timeouts to both external calls.

### F5. `DEFAULT_OPENAI_MODEL = 'gpt-5-mini'` — hardcoded default model
- **Severity:** Low (with caveat)
- **Category:** Configuration
- **Files:** `backend/lib/ai-selector.js:2`
- **Status:** Confirmed as code, but likely overridden by `OPENAI_MODEL` env var
- **Why it matters:** The hardcoded default is `gpt-5-mini`. The code always checks `getEnv('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL`, so the default only matters if the env var is missing. The app is confirmed working in production per project notes, so the env var is presumably set correctly.
- **Risk:** If the env var is accidentally removed from production, all AI calls would fail or use the wrong model.
- **Current-stage assessment:** Low risk since the env var is set. But the default should be a known-good model as a safety net.
- **When to address:** Soon, as a small hardening step.

### F6. Error details exposed in API responses
- **Severity:** Low-Medium
- **Category:** Security / information disclosure
- **Files:** `backend/server.js:558-559` (live search), `backend/server.js:722-724` (discovery), `backend/server.js:790-793` (refine)
- **Status:** Confirmed
- **Why it matters:** When SerpApi or OpenAI calls fail, the raw error message (truncated to 300 chars) is returned to the client in the `details` field. This could expose internal implementation details, API error formats, or key-related messages.
- **At scale:** Minor information leak, but could help an attacker understand your stack.
- **Current-stage assessment:** Acceptable for dev/testing. Should be cleaned up before public launch.
- **When to address:** Before public launch.

### F7. Analytics endpoint has no rate limiting and no authentication
- **Severity:** Medium
- **Category:** Abuse risk
- **Files:** `backend/server.js:1297` (route), `backend/server.js:1169-1256` (handler)
- **Status:** Confirmed
- **Why it matters:** `POST /api/analytics/track` accepts events from any caller with no rate limit. An attacker could flood the analytics tables with fake data, corrupting funnel metrics and potentially growing Supabase storage costs.
- **At scale:** The analytics tables could grow unboundedly. Fake events would make all funnel data untrustworthy.
- **Current-stage assessment:** Low risk with no real users. Worth adding basic protection before analytics data matters.
- **When to address:** Before relying on analytics data for decisions.

### F8. `server.js` is 1,324 lines and growing
- **Severity:** Low-Medium
- **Category:** Maintainability
- **Files:** `backend/server.js`
- **Status:** Confirmed — already acknowledged in `handoff.md:123`
- **Why it matters:** All request handlers, input sanitization, logging, and routing live in one file. This makes it harder to reason about changes, test individual handlers in isolation, and onboard collaborators.
- **Current-stage assessment:** Manageable for a solo developer at this stage. The notes correctly flag this as future cleanup.
- **When to address:** When the next meaningful backend change is planned. Extracting handlers into separate modules is low-risk refactoring.

### F9. Supabase cache rows are never actively deleted
- **Severity:** Low-Medium
- **Category:** Data / storage / cost
- **Files:** `backend/lib/search-storage.js` (no cleanup logic), `project-notes/db-cache-setup.md:98`
- **Status:** Confirmed — acknowledged in the db-cache-setup notes
- **Why it matters:** Expired cache rows and rate_limit_events are ignored but never purged. Over time, these tables will grow unboundedly. Supabase free tier has storage limits.
- **At scale:** The `search_cache` table stores full JSONB candidate pools. The `rate_limit_events` table creates a new row per request. Without cleanup, this will eventually hit Supabase storage limits or slow down queries.
- **Current-stage assessment:** Acceptable at current low traffic.
- **When to address:** Before sustained traffic. Add a scheduled cleanup (Supabase `pg_cron`) for expired rows.

### F10. No React Error Boundary
- **Severity:** Low-Medium
- **Category:** Frontend robustness
- **Files:** `src/App.jsx` (no ErrorBoundary anywhere in codebase)
- **Status:** Confirmed
- **Why it matters:** If any lazy-loaded component or runtime React error occurs, the entire app will white-screen with no recovery path. Users would need to refresh manually.
- **Current-stage assessment:** Acceptable for testing. Should be added before public launch.
- **When to address:** Before public launch.

### F11. Custom `.env` parser instead of `dotenv`
- **Severity:** Low
- **Category:** Robustness / maintainability
- **Files:** `backend/lib/search-data.js:15-42`
- **Status:** Confirmed
- **Why it matters:** The custom parser uses `indexOf('=')` and `slice()`, which correctly handles values containing `=` signs. However, it does not handle quoted values (`KEY="value"`), meaning quotes would be included as part of the value. It also doesn't handle multiline values or escaped characters.
- **Current-stage assessment:** The current `.env` likely uses simple `KEY=value` format, so this works in practice. Minor fragility.
- **When to address:** Later, or when any env value needs quoting.

---

## 3. Likely Risks / Watchlist

### R1. Finalize latency is still the primary product bottleneck
- **Severity:** High
- **Category:** Product / scaling / UX
- **Files:** `backend/lib/ai-selector.js`, `backend/server.js:1029-1036`
- **Status:** Well-documented, not a bug
- **Why it matters:** Cached finalize averages ~7.5s, fresh finalize ~10.8s. For a product that aims to feel "calm and focused," 7-11 seconds of waiting after a user clicks "Show focused picks" is at the edge of acceptable.
- **At scale:** OpenAI latency is external and unpredictable. If OpenAI slows down, finalize could exceed Vercel hobby-tier timeouts (10s). Token costs also scale linearly with traffic.
- **Assessment:** The team is actively optimizing. The latest badge-scope reduction crossed the under-8s milestone. This remains the most important product-quality risk.

### R2. OpenAI cost scales linearly with uncached finalize requests
- **Severity:** High
- **Category:** Unit economics / scaling
- **Files:** `backend/lib/ai-selector.js`
- **Status:** Likely risk
- **Why it matters:** Each finalize call uses ~2,479-2,617 tokens. Retries multiply this. Discovery is cached, but finalize is intentionally not cached. Cost per search is dominated by finalize.
- **At scale:** If the product gets 1,000 daily unique searches with an average of 1.3 finalize calls each, that's ~1,300 OpenAI calls/day at ~2,500 tokens each = ~3.25M tokens/day. Cost per day depends heavily on which model tier `OPENAI_MODEL` is set to. GPT-4o-mini vs GPT-4o is roughly a 10-30x cost difference.
- **Assessment:** The notes show awareness of this. Model selection is the biggest cost lever.

### R3. SerpApi as single point of failure for product data
- **Severity:** Medium-High
- **Category:** Dependency / operational risk
- **Files:** `backend/lib/search-pipeline.js:86`, `backend/lib/search-data.js:9`
- **Status:** Likely risk
- **Why it matters:** SerpApi is the only product data source. If it goes down, has rate limits, changes pricing, or changes response format, the entire product stops working. Endpoint, engine, locale, and language are hardcoded.
- **At scale:** SerpApi pricing is per-search. Combined with finalize AI costs, the full cost of a single guided search flow is SerpApi + OpenAI refine + OpenAI finalize. Cache helps on repeat searches but not on unique ones.
- **Assessment:** The notes acknowledge SerpApi as an interim integration. The provider-agnostic candidate model is good forward thinking. SerpApi outage = product outage right now.

### R4. Vercel serverless function timeouts
- **Severity:** Medium
- **Category:** Operational / scaling
- **Files:** All `api/` route wrappers
- **Status:** Likely risk
- **Why it matters:** Vercel hobby tier has a 10-second function timeout. Fresh finalize averages ~10.8s and can exceed this. The lack of explicit fetch timeouts (F4) means a hung external call could consume the full function budget.
- **Assessment:** This is likely already causing occasional timeouts in production for fresh finalize on the hobby tier.

### R5. Discovery token is predictable / derivable
- **Severity:** Medium
- **Category:** Security / trust model
- **Files:** `backend/server.js:195-201`, `backend/lib/search-data.js` (buildCacheKey)
- **Status:** Likely risk
- **Why it matters:** The `discoveryToken` is the deterministic cache key built from `buildCacheKey(normalizedQuery, '', 'guided_discovery')`. Anyone who knows the normalization algorithm can construct a valid discovery token without ever calling discover. This means finalize could be called with a fabricated token for any cached query.
- **At scale:** An attacker could call finalize repeatedly for any cached query, burning OpenAI credits. Rate limiting is the only defense.
- **Assessment:** A simplicity tradeoff that works fine at low scale. If abuse becomes a concern, the token could be made opaque (random UUID stored alongside the cache entry).

### R6. In-memory rate limit state doesn't persist across Vercel invocations
- **Severity:** Medium
- **Category:** Operational / scaling
- **Files:** `backend/lib/rate-limit.js:3` (in-memory Map)
- **Status:** Likely risk
- **Why it matters:** Vercel serverless functions are stateless — each cold start gets a fresh `RATE_LIMIT_STORE`. The in-memory fallback only works within a single warm function instance. When Supabase is down and the shared limiter returns null, the local fallback is ineffective.
- **At scale:** If Supabase becomes temporarily unavailable, rate limiting effectively stops working on Vercel.
- **Assessment:** The code correctly tries shared first and falls back to local. This is a known architectural limitation.

---

## 4. Product-Direction Risks

### P1. Finalize latency vs. "calm, focused" product promise
The product's core identity is a calm, focused alternative to noisy marketplaces. But the finalize step — the moment the user is most engaged — is the slowest part (7-11s). The step-2 polish (showing preview results during finalize, immediate scroll to results area, skeletons) effectively addresses perceived speed for now. The risk is that finalize latency improvement plateaus and users perceive the wait as the app being slow rather than thoughtful.

### P2. Retry path could become an unintended browse loop
The 2-retry cap is a good guardrail, but if the candidate pool is small (niche products with <10 SerpApi results), 2 retries could exhaust the pool. The hard exclusion of rejected picks (rather than down-ranking) is aggressive in small pools. Already flagged in `handoff.md:101`.

### P3. Single-locale product data
SerpApi is hardcoded to `gl: 'us'` and `hl: 'en'` (`search-pipeline.js:83-84`). If Focama expands internationally, this is a structural limitation requiring either per-user locale or multi-locale data sources.

### P4. Affiliate strategy is undecided
The product is being built vendor-agnostic, which is good. But affiliate linking is the likely revenue model, and the disclosure, UX, and compliance requirements (especially Amazon Associates) will need real design work before launch. Delaying this is appropriate for now, but it should be planned before public launch.

---

## 5. Cleanup Debt

All items in `cleanup-backlog.md` are marked **done**. No outstanding backlog items.

Remaining cleanup-adjacent items from handoff notes:

1. **`backend/server.js` size** — acknowledged in `handoff.md:123`. Extract route handlers into separate modules.
2. **Vercel bridge pattern** — acknowledged in `handoff.md:124`. The transitional Node-shaped handler contract works but should eventually be replaced with runtime-agnostic services.
3. **`/api/search/cache` route still exists** — `server.js:1307-1310`. This appears to be a leftover debug route not mentioned in recent active notes. Should be evaluated for removal.
4. **`SEARCH_EVALUATION_PATH` constant** — `backend/lib/search-data.js:11`. Defined but not found used in the codebase. May be dead code — worth confirming.

---

## 6. Suggestions

Suggestions only — not implemented fixes, ordered by likely impact:

1. **Add `AbortController` timeouts to SerpApi and OpenAI fetch calls.** A 15-second timeout on OpenAI and a 10-second timeout on SerpApi would prevent function timeouts from cascading silently.

2. **Add a basic API key or origin check before public launch.** Even a simple shared secret in a header would prevent casual abuse. More sophisticated auth can come later.

3. **Restrict CORS to your own domain(s) before launch.** Replace `'*'` with the actual production domain.

4. **Add Supabase row cleanup.** A Supabase `pg_cron` job to delete `rate_limit_events` and `search_cache` rows past their `expires_at` would prevent unbounded table growth.

5. **Make the discovery token opaque.** Replace the deterministic cache key with a random UUID stored alongside the cache entry. This prevents token fabrication and allows future token expiry logic that's independent of cache TTL.

6. **Add a React Error Boundary** wrapping at least the homepage/search experience.

7. **Fix the rate limit race condition.** Use a Supabase RPC function that does an atomic insert-and-count, or accept eventual consistency risk explicitly.

8. **Sanitize error responses before public launch.** Return generic messages to clients, log full details server-side.

9. **Evaluate `SEARCH_EVALUATION_PATH` and the `/api/search/cache` route** — remove if dead.

10. **Fix the hardcoded `DEFAULT_OPENAI_MODEL` fallback** to a known-good model name so the app degrades gracefully if the env var is accidentally missing.

---

## 7. Open Questions / Insufficient Evidence

1. **What model is `OPENAI_MODEL` actually set to in production?** The notes reference `gpt-5-mini`. If this is a valid model in OpenAI's current lineup, F5 is a non-issue. Cannot verify without checking OpenAI's current catalog.

2. **Has the `.env` file ever been committed to git history?** It is currently in `.gitignore` and not tracked. If it was committed at any earlier point, keys may be in git history and should be rotated.

3. **What is the actual Vercel function timeout configured for this project?** If hobby tier (10s), fresh finalize is likely timing out regularly. If pro tier (60s or custom), there is more headroom.

4. **Are the optional analytics tables actually created in Supabase?** If they don't exist, analytics events silently fail (intended). If they do exist, the lack of rate limiting on the analytics endpoint (F7) is a real concern.

5. **Is there any monitoring or alerting for OpenAI/SerpApi failures?** The structured `[search-flow]` logs are good, but no alerting or dashboard was found. Production failures may go unnoticed.

6. **What is the actual SerpApi pricing tier in use?** Full unit economics cannot be assessed without knowing SerpApi per-search cost.

7. **Is the Vercel deployment using Edge functions or Node.js serverless functions?** The `api/` directory structure suggests Node.js serverless, but the `vercel.json` does not specify the runtime explicitly. This affects timeout, memory, and cold-start behavior.

---

## 8. Prioritized Risk List (Most Important First)

| Rank | ID | Finding | Severity | When |
|------|----|---------|----------|------|
| 1 | R1 | Finalize latency is the primary product bottleneck | High | Ongoing |
| 2 | F1 | No API authentication | High | Before public launch |
| 3 | R2 | OpenAI cost scales linearly with uncached finalize | High | Before paid tier |
| 4 | R4 | Vercel function timeout risk for finalize | Medium | Soon |
| 5 | F4 | No fetch timeout on external APIs | Medium | Soon |
| 6 | F2 | CORS wildcard on all responses | Medium | Before public launch |
| 7 | F3 | Rate limit race condition in Supabase | Medium | Before traffic grows |
| 8 | R3 | SerpApi as single point of failure | Medium-High | Architecture awareness |
| 9 | F7 | Analytics endpoint unprotected | Medium | Before analytics matters |
| 10 | R5 | Predictable discovery token | Medium | Before public launch |
| 11 | F9 | No cleanup of expired Supabase rows | Low-Medium | Before sustained traffic |
| 12 | F10 | No React Error Boundary | Low-Medium | Before public launch |
| 13 | F8 | server.js growing monolithically | Low-Medium | Next backend change |
| 14 | R6 | In-memory rate limit ineffective on Vercel | Medium | Architecture awareness |
| 15 | F6 | Error details exposed in responses | Low-Medium | Before public launch |
| 16 | P1 | Finalize latency vs. product promise | High | Ongoing |
| 17 | P4 | Affiliate strategy undecided | Medium | Before launch |
| 18 | P2 | Retry exhaustion in small pools | Low | Watch with real users |
| 19 | P3 | Single-locale hardcoding | Low | If international expansion |
| 20 | F5 | Hardcoded default model | Low | Soon (small fix) |
| 21 | F11 | Custom env parser | Low | Later |

---

## 9. Complete Finding List

| ID | Title | Severity | Category | Confirmed? |
|----|-------|----------|----------|------------|
| F1 | No API authentication | High | Security | Confirmed |
| F2 | CORS wildcard | Medium | Security | Confirmed |
| F3 | Rate limit race condition | Medium | Backend robustness | Confirmed |
| F4 | No fetch timeout on external APIs | Medium | Operational | Confirmed |
| F5 | Hardcoded default OpenAI model | Low | Configuration | Confirmed (likely overridden) |
| F6 | Error details in API responses | Low-Medium | Security | Confirmed |
| F7 | Analytics endpoint unprotected | Medium | Abuse risk | Confirmed |
| F8 | server.js monolithic growth | Low-Medium | Maintainability | Confirmed |
| F9 | No Supabase row cleanup | Low-Medium | Storage/cost | Confirmed |
| F10 | No React Error Boundary | Low-Medium | Frontend robustness | Confirmed |
| F11 | Custom env parser | Low | Robustness | Confirmed |
| R1 | Finalize latency bottleneck | High | Product/UX | Likely (well-documented) |
| R2 | OpenAI cost scaling | High | Unit economics | Likely |
| R3 | SerpApi single point of failure | Medium-High | Dependency | Likely |
| R4 | Vercel function timeout risk | Medium | Operational | Likely |
| R5 | Predictable discovery token | Medium | Security | Likely |
| R6 | In-memory rate limit on Vercel | Medium | Operational | Likely |
| P1 | Finalize latency vs. product promise | High | Product direction | Ongoing |
| P2 | Retry exhaustion in small pools | Low | Product direction | Watch |
| P3 | Single-locale hardcoding | Low | Product direction | Future |
| P4 | Affiliate strategy undecided | Medium | Product/business | Planning |
| C1 | `/api/search/cache` route still exists | Low | Cleanup | Confirmed |
| C2 | `SEARCH_EVALUATION_PATH` possibly dead | Low | Cleanup | Needs verification |
