# Render Server Improvements

These improvements became possible after switching from Vercel serverless to a persistent Render server.
Each section has a self-contained Codex prompt. Run them independently, in any order.

---

## 1. Replace enrichment polling with Server-Sent Events (SSE)

**Why:** The frontend currently polls `/api/search/enrichment` every 1500ms waiting for AI copy.
That's a serverless workaround. A persistent server can hold an SSE connection open and push the
enrichment result the moment it's written — zero polling delay, no wasted network round-trips.

**What changes:**
- Backend: add an in-process EventEmitter bus (`backend/lib/enrichment-bus.js`). When
  `runMiniEnrichmentAsync` stores enrichment in the cache, it emits an event keyed by the
  discovery token. A new `GET /api/search/enrichment-stream` SSE endpoint subscribes to that
  event, sends `data: {...}\n\n`, and closes. Handles timeouts (30s) and client disconnects.
- Frontend (`src/components/home/useGuidedSearch.js`): replace `startEnrichmentPolling` with
  `startEnrichmentStream` that opens an `EventSource` to `/api/search/enrichment-stream`.
  On `message`, merges entries and sets enrichment ready. On error or timeout, silently closes.
  Keep the `window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__` flag to also skip SSE in tests.
- Keep the existing `GET /api/search/enrichment` polling endpoint intact (used by scripts/tests).

**Risk:** Low. SSE is one-way push; the fallback polling endpoint stays in place.

---

## 2. In-memory L1 cache for discovery results

**Why:** Every discovery cache read currently goes to Supabase (~50–100ms network round-trip).
With a persistent server, a small in-memory LRU in front of Supabase makes repeat queries
sub-millisecond.

**What changes:**
- New file `backend/lib/memory-cache.js`: a simple LRU Map capped at 200 entries. Exports
  `memoryGet(key)`, `memorySet(key, value)`, `memoryClear()` (for tests).
- In `backend/lib/search-pipeline.js` (or wherever `readCachedSearchSnapshot` /
  `writeSearchSnapshot` are defined): check the L1 before Supabase on reads; write through to
  both L1 and Supabase on writes.
- TTL should match `SEARCH_CACHE_TTL_MINUTES` — reject stale L1 entries by checking
  `cached_at` / `expires_at` fields already present on snapshot objects.

**Risk:** Low. L1 is purely additive; Supabase remains the source of truth and is still updated
on every write.

---

## 3. Simplify rate limiting — drop Supabase, use in-memory only

**Why:** Supabase-backed rate limiting was needed on Vercel to coordinate across multiple
serverless instances. On a single Render process, the in-memory `RATE_LIMIT_STORE` already in
`backend/lib/rate-limit.js` is sufficient.

**What changes:**
- `backend/lib/rate-limit.js`: remove the `takeSharedRateLimitToken` call from
  `takeRateLimitToken`. The function already has the full in-memory logic below it; just delete
  the Supabase branch. Keep `resetRateLimitStore` for tests.
- `backend/lib/search-storage.js`: remove `takeSharedRateLimitToken` export and the
  `RATE_LIMIT_EVENTS_TABLE` constant + any Supabase writes for rate limit events, if they exist.
- Update any imports in `server.js` that reference `takeSharedRateLimitToken`.

**Risk:** Low. In-memory was already the fallback; we're making it the only path.

---

## 4. Persistent keep-alive HTTP connections

**Why:** Node's default `http.request` opens a new TCP connection for each outbound call.
With a persistent server, a shared `https.Agent({ keepAlive: true })` reuses connections to
Oxylabs and other external APIs, saving a TCP handshake on every request.

**What changes:**
- Check how `backend/lib/oxylabs-pipeline.js` makes HTTP requests. If it uses native `https` or
  `node-fetch`, pass a shared `https.Agent({ keepAlive: true, maxSockets: 10 })` instance.
  Define the agent once at module scope so it's reused across requests.
- Same pattern for `backend/lib/rainforest-pipeline.js` if it makes outbound requests.
- Do not change OpenAI or Anthropic SDK calls — those SDKs manage their own connection pools.

**Risk:** Very low. Keep-alive is transparent to the application logic.

---

## 5. In-flight request deduplication for discovery

**Why:** If two users search for the same cold-cache query simultaneously, both requests fire
independently to Oxylabs and the AI, doubling external API spend and causing a race on the cache
write.

**What changes:**
- `backend/lib/search-pipeline.js`: add a module-level `Map<cacheKey, Promise>` called
  `IN_FLIGHT_DISCOVERY`. Before starting a cold discovery, check if a promise is already
  in-flight for that key. If yes, `await` the existing promise instead of starting a new one.
  Remove the entry from the map when the promise settles (success or error).
- Scope this only to discovery (the most expensive step); finalize is intentionally uncached
  and should stay un-deduplicated.

**Risk:** Low-medium. Test that a rejected in-flight promise doesn't block subsequent retries
(remove the key in the `.finally()` handler).

---

## Codex Prompts

Copy the relevant section and paste it into Codex as the task spec.

---

### Prompt 1 — SSE for enrichment

```
Project: Focama — a Node.js + React shopping assistant.
Backend: `backend/server.js` (Node native HTTP, no Express framework).
Frontend hook: `src/components/home/useGuidedSearch.js`.

Task: Replace the client-side enrichment polling loop with Server-Sent Events (SSE).

BACKGROUND
After finalize locks the shortlist, `runMiniEnrichmentAsync` (in server.js, around line 910)
runs async and writes enrichment entries into the discovery cache via `writeSearchSnapshot`.
The frontend currently polls `GET /api/search/enrichment` every 1500ms until `ready: true`.

WHAT TO BUILD

1. Create `backend/lib/enrichment-bus.js`:
   - Export a Node.js `EventEmitter` instance (named `enrichmentBus`).
   - Export a helper `emitEnrichmentReady(token, entries, model)` that emits event
     `enrichment:${token}` with payload `{ entries, model }`.

2. In `backend/server.js`, after `writeSearchSnapshot` succeeds inside
   `runMiniEnrichmentAsync`, call `emitEnrichmentReady(discoveryToken, miniResult.enriched,
   miniResult.model)`. The discovery token is available as `cachedEntry.discoveryToken`.

3. Add a new route `GET /api/search/enrichment-stream` in server.js (register it near the
   existing `/api/search/enrichment` handler):
   - Validate `token` and `query` query params the same way `handleEnrichmentPoll` does.
   - Send SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
     `Connection: keep-alive`. Call `response.flushHeaders()`.
   - Subscribe to `enrichmentBus` event `enrichment:${token}`.
   - On event: send `data: ${JSON.stringify({ ready: true, entries, model })}\n\n`, remove
     listener, end response.
   - On client disconnect (`request.on('close', ...)`): remove listener, do nothing else.
   - After 30 seconds with no event: send `data: ${JSON.stringify({ ready: false })}\n\n`,
     remove listener, end response.
   - Use `response.write` (not `sendJson`) so the connection stays open.

4. In `src/components/home/useGuidedSearch.js`:
   - Rename `startEnrichmentPolling` → `startEnrichmentStream`.
   - Replace the `setTimeout` polling loop with an `EventSource` opened to
     `${BACKEND_URL}/api/search/enrichment-stream?token=...&query=...` (append amazonDomain
     the same way `fetchEnrichment` does today).
   - Store the `EventSource` instance in a ref (reuse or replace `enrichmentPollRef`).
   - `onmessage`: parse `event.data`, check `payload.ready && payload.entries?.length > 0`,
     merge entries with `mergeEnrichmentIntoResults`, call `setIsEnrichmentReady(true)`,
     close the source.
   - `onerror`: close the source silently (enrichment is best-effort).
   - `stopEnrichmentPolling` should also close the EventSource if open.
   - Keep the `if (window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__) return` guard so tests
     are unaffected.
   - Do NOT remove the existing `fetchEnrichment` function — it is still used by scripts.

5. Keep `GET /api/search/enrichment` (polling) endpoint in server.js untouched.

CONSTRAINTS
- Do not change any types, response shapes, or test files.
- The existing 101 tests must still pass (`npm run test`).
- No new npm packages — use Node's built-in `EventEmitter` and the browser's native
  `EventSource`.
- Do not change rate limiting, caching, or AI logic.
```

---

### Prompt 2 — In-memory L1 cache for discovery results

```
Project: Focama — a Node.js shopping assistant.
Backend: `backend/lib/search-pipeline.js` handles reading and writing discovery cache snapshots
via `readCachedSearchSnapshot` and `writeSearchSnapshot`. These call into `search-storage.js`
which reads/writes Supabase (with a local file fallback).

Task: Add a process-level in-memory LRU cache as an L1 layer in front of Supabase.

WHAT TO BUILD

1. Create `backend/lib/memory-cache.js`:
   - Module-level `Map` called `store`.
   - Const `MAX_ENTRIES = 200`.
   - Export `memoryGet(key)` → returns the cached value or `undefined`. Evict and return
     `undefined` if the entry's `expiresAt` (epoch ms) is in the past.
   - Export `memorySet(key, value, ttlMs)` → stores `{ value, expiresAt: Date.now() + ttlMs }`.
     When size exceeds `MAX_ENTRIES`, delete the first (oldest) key.
   - Export `memoryClear()` → `store.clear()`. Used in tests only.

2. In `backend/lib/search-pipeline.js` (or wherever `readCachedSearchSnapshot` and
   `writeSearchSnapshot` live — trace the import chain from server.js to find the right file):
   - Import `memoryGet`, `memorySet` from `./memory-cache.js`.
   - In `readCachedSearchSnapshot`: before the Supabase/file read, call `memoryGet(cacheKey)`.
     If hit, return it directly.
   - In `writeSearchSnapshot`: after writing to Supabase/file, call `memorySet(cacheKey,
     snapshot, ttlMs)` where `ttlMs` is derived from the same TTL logic already used for
     Supabase (read the `getCacheTtlMinutes` equivalent in the file and convert to ms).
   - If the snapshot object already has an `expires_at` ISO string, derive `ttlMs` from
     `new Date(snapshot.expires_at).getTime() - Date.now()` instead of recalculating.

3. Do NOT change the Supabase write path — L1 is write-through, not write-back.

CONSTRAINTS
- Do not change server.js, any route handlers, or any test files.
- The existing 101 tests must still pass (`npm run test`).
- No new npm packages.
- The L1 cache should be invisible to callers — same return shapes.
- If `ttlMs` resolves to zero or negative (stale snapshot being re-written for some reason),
  skip the L1 write rather than storing an already-expired entry.
```

---

### Prompt 3 — Simplify rate limiting (drop Supabase, use in-memory only)

```
Project: Focama — a Node.js shopping assistant.
File: `backend/lib/rate-limit.js`.

Current behavior: `takeRateLimitToken` first calls `takeSharedRateLimitToken` from
`search-storage.js` (which writes to a Supabase table). If Supabase returns a result it uses
that; otherwise falls through to an in-memory `RATE_LIMIT_STORE` Map. On Vercel multiple
instances needed shared state. We are now on a single Render instance.

Task: Remove the Supabase path from rate limiting. In-memory only.

WHAT TO CHANGE

1. `backend/lib/rate-limit.js`:
   - Remove the import of `takeSharedRateLimitToken` from `./search-storage.js`.
   - In `takeRateLimitToken`, remove the `takeSharedRateLimitToken` call and its `if`
     branch entirely. The remaining in-memory logic already handles all cases correctly.
   - Keep `RATE_LIMIT_STORE`, `DEFAULT_RATE_LIMIT_CONFIG`, `resetRateLimitStore`,
     `getClientIpAddress`, and `getCountryCode` exactly as they are.

2. `backend/lib/search-storage.js`:
   - Remove the `takeSharedRateLimitToken` export function and the
     `RATE_LIMIT_EVENTS_TABLE` constant (if it exists and is only used by that function).
   - Do not remove any other Supabase tables, functions, or exports.

3. `backend/server.js`:
   - Check the import list at the top. If `takeSharedRateLimitToken` is imported from
     `search-storage.js`, remove that import. (It is more likely only imported in
     rate-limit.js, but verify.)

CONSTRAINTS
- Do not change rate limit values, config shape, or any other logic.
- The existing 101 tests must still pass (`npm run test`).
- Do not touch any test files.
```

---

### Prompt 4 — Persistent keep-alive HTTP connections

```
Project: Focama — a Node.js shopping assistant.
Files: `backend/lib/oxylabs-pipeline.js`, possibly `backend/lib/rainforest-pipeline.js`.

Task: Add a shared `https.Agent` with keep-alive enabled so outbound HTTP connections to
Oxylabs (and Rainforest if applicable) are reused across requests instead of re-opening TCP
for every call.

WHAT TO CHANGE

1. Read `backend/lib/oxylabs-pipeline.js` and identify how outbound HTTPS requests are made
   (native `https.request`, `node-fetch`, or global `fetch`).

   - If native `https.request`: add `import https from 'node:https'` at the top (or use the
     existing import if present). Define a module-level agent:
     `const KEEP_ALIVE_AGENT = new https.Agent({ keepAlive: true, maxSockets: 10 })`.
     Pass `agent: KEEP_ALIVE_AGENT` in the options object of every `https.request` call.

   - If `node-fetch`: pass `agent: KEEP_ALIVE_AGENT` as a fetch option.

   - If global `fetch` (Node 18+): global fetch does not accept a custom agent. In that
     case, switch the specific outbound calls to use `https.request` with the agent, or
     install nothing and note that keep-alive is not configurable with global fetch.
     Do NOT install new npm packages.

2. Do the same audit for `backend/lib/rainforest-pipeline.js` if it also makes outbound
   HTTPS calls to external APIs.

3. Do NOT add keep-alive agents to OpenAI or Anthropic client calls — those SDKs manage
   their own connection pools.

CONSTRAINTS
- Do not change any response shapes, caching logic, or test files.
- The existing 101 tests must still pass (`npm run test`).
- No new npm packages.
- If global fetch is in use and a custom agent cannot be passed without a package,
  leave those calls as-is and document this in a short code comment.
```

---

### Prompt 5 — In-flight request deduplication for discovery

```
Project: Focama — a Node.js shopping assistant.
Backend: `backend/lib/search-pipeline.js` (trace from server.js imports to find the right file).

Task: Deduplicate simultaneous cold-cache discovery requests for the same query so only one
external API call fires and subsequent arrivals share the result.

WHAT TO BUILD

1. In the file that performs the actual cold-cache discovery fetch (the function that calls
   Oxylabs/Rainforest/SerpApi when there is no cache hit):
   - Add a module-level `Map` called `IN_FLIGHT_DISCOVERY` mapping `cacheKey → Promise`.
   - Before starting a new discovery request, check if `IN_FLIGHT_DISCOVERY.has(cacheKey)`.
     If yes, `return await IN_FLIGHT_DISCOVERY.get(cacheKey)`.
   - If no in-flight request, create the discovery promise, store it:
     `IN_FLIGHT_DISCOVERY.set(cacheKey, discoveryPromise)`.
   - In a `.finally()` on the promise: `IN_FLIGHT_DISCOVERY.delete(cacheKey)`.
     This ensures a failed request does not block future retries.
   - Export `clearInflightDiscovery()` that calls `IN_FLIGHT_DISCOVERY.clear()` — for tests.

2. Scope deduplication ONLY to discovery. Do not touch finalize, refine, enrichment, or
   retry-advice routes.

CONSTRAINTS
- Do not change server.js route handlers directly — the dedup logic belongs inside the
  pipeline/search function, not the HTTP handler.
- Do not change any response shapes.
- The existing 101 tests must still pass (`npm run test`).
- No new npm packages.
- Do not touch test files.
```
