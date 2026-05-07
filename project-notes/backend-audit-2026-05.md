---
# Backend Audit — May 2026
**Scope:** Full backend code review — routes, CORS, auth, rate limiting, error handling, config  
**Trigger:** Tester reported "Failed to fetch" errors  
**No code was changed during this audit.**

---

## "Failed to Fetch" — Why It Happens

"Failed to fetch" is a browser-level error. It does NOT mean the server returned an error code. It means the browser could not make the connection at all. Three likely causes in order:

### 1. Render Dyno Is Sleeping (Most Likely)
Render's free/starter tier spins the server down after ~15 minutes of inactivity. When a sleeping server gets a request, it can take 15–30 seconds to wake up. During that time, the browser connection can time out and throw "Failed to fetch."

**The prewarm exists** (`HomeExperience.jsx` calls `/api/ping` when the user focuses the search box), but the timing is tight. If the user types and hits search quickly, the discovery and refine requests may fire before the dyno has fully woken up from the ping. Also, if the tester lands on a different page first, the prewarm never fires at all.

**Recommendation:** Move the prewarm to fire on page load, not on input focus. Or upgrade to a paid Render tier that never sleeps.

### 2. Tester's Network or Environment
VPN, corporate firewall, or ISP routing can block connections to Render's infrastructure. "Failed to fetch" with no other context almost always means the request never reached the server. This is worth asking the tester about — can they reach other external APIs? What browser? Any VPN active?

### 3. Backend URL Not Set or Wrong
`VITE_BACKEND_URL` is baked into the Vercel build at deploy time. If it's blank or wrong in the Vercel dashboard, all API calls go to a relative URL on Vercel (which has no backend), and every request fails. This would affect all users equally, not just one tester — but worth confirming the value is correct in Vercel env vars.

---

## Security and Configuration Findings

### CRITICAL — Missing `CLAUDE_API_KEY` in `render.yaml`

`render.yaml` lists every other env var but not `CLAUDE_API_KEY`. The finalize route (`/api/search/finalize`) calls `haikuLockWinnersAndBadges()` which reads this key. If it is not set in the Render dashboard, every finalize call throws an error and returns HTTP 500. The user sees "Unable to finalize the product selection" — not "Failed to fetch" — but it completely breaks the core product flow.

**This is a config gap, not a code bug.** The key might already be set directly in the Render dashboard (bypassing `render.yaml`), in which case it's fine. But it should be documented there so it's not accidentally omitted on a redeploy or environment copy.

**File:** `render.yaml` — `CLAUDE_API_KEY` is absent from the `envVars` list.

---

### `.env.example` Is Incomplete

`.env.example` is missing several required keys that the backend uses:
- `CLAUDE_API_KEY` (required for finalize)
- `OXYLABS_USERNAME` (required for discovery)
- `OXYLABS_PASSWORD` (required for discovery)
- `ALLOWED_ORIGIN` (optional but documented in CLAUDE.md)

A developer or tester setting up locally from `.env.example` would get a broken experience with no indication of what's missing.

---

### Debug Endpoint Is Publicly Accessible in Production

`GET /api/search/debug` is open to anyone. It returns:
- Which API keys are configured (booleans)
- Storage mode (Supabase vs local file)
- Internal architecture details (which routes are active, finalize behavior)

It does not expose key values, so this is low severity. But in production, it reveals implementation details that are useful to an attacker mapping the system. It should either be removed in production or gated behind a localhost-only check (like the analytics dashboard is).

**File:** `backend/express-server.js` line 60, `backend/server.js` line 855.

---

### Error Details Sent to Client in 500 Responses

Several 500 responses include a `details` field that contains the raw exception message:
```js
sendJson(response, 500, {
  error: 'Unable to reach Rainforest API.',
  details: error instanceof Error ? error.message : 'Unknown error',
})
```

This means Oxylabs error messages, OpenAI error messages, and internal Node errors can reach the user's browser. A user inspecting network responses (or an attacker) can see internal service error text. This is low severity now but could reveal API rate limit details, credential errors, or internal path information.

Affected routes: discovery (500), refine (500), finalize (500), retry-advice (500).

---

### Debug Data in Finalize Response

The `/api/search/finalize` success response includes a `debug` field:
```js
debug: {
  finalizeFastLayer, flowPath, finalizeModel, finalizeModelPath,
  requestMode, miniEnrichmentStatus,
  stageLatencyMs: { body, cache, haiku, productDetails, total },
  tokenUsageByStage,
}
```

This leaks internal model names, flow paths, and token usage to any browser or script reading the response. It's useful for development but shouldn't be in production responses.

**File:** `backend/server.js` line 1532.

---

### Rate Limiter Is In-Memory and Non-Persistent

The rate limiter (`backend/lib/rate-limit.js`) uses a global `Map` in process memory. It resets every time:
- The Render dyno restarts (deploy, crash, or manual restart)
- The dyno spins down due to inactivity (free tier every 15 min)

This means a determined user can reset their rate limit by waiting for a restart or triggering one. At current scale this is acceptable, but it's worth knowing. The rate limit also has no persistent backing store.

---

### IP Address Can Be Spoofed for Rate Limiting

The rate limiter (`getClientIpAddress`) reads the first value from the `x-forwarded-for` header. A client can send a fake `X-Forwarded-For: 1.2.3.4` header and get rate-limited under that fake IP, not their real one. Render's proxy may or may not strip or prepend this header — worth checking in Render docs.

This is a known tradeoff with proxy-based IP detection. Not exploitable for anything other than bypassing the rate limit.

**File:** `backend/lib/rate-limit.js` line 20.

---

### Haiku Lock Logs Full AI Response to Console

In `backend/lib/ai-selector.js` line 382:
```js
console.log('[haiku-lock] raw response:', text)
```

This sends the full raw AI response (which includes product IDs) to the Render server log. Not a security vulnerability, but Render can read their customers' logs. Acceptable for development logging but worth trimming before a public launch.

---

### CORS: `sendJson` vs `resolveCorsOrigin` Inconsistency

Most JSON responses use `sendJson()`, which sets `Access-Control-Allow-Origin` to a static `ALLOWED_ORIGIN` value. In production with the 3 default origins, `ALLOWED_ORIGIN` resolves to `*` (wildcard), so all browsers can access the API. This is fine.

The SSE endpoint (`/api/search/enrichment-stream`) and OPTIONS preflight use `resolveCorsOrigin()` instead, which echoes back the matched origin or falls back to the same `*`. Both approaches produce `*` in practice, but the inconsistency is worth noting. If `ALLOWED_ORIGIN` env var is ever set to a single domain, `sendJson` would hard-code that one origin in all responses, potentially blocking other valid origins. Not a current bug, but a future footgun.

**File:** `backend/lib/http.js` line 57.

---

### Prewarm Fires on Input Focus, Not Page Load

The `/api/ping` prewarm call fires when the user interacts with the search box (input focus). If the user lands on the home page, stares at it for a moment, and then types and submits — the prewarm may not have enough lead time to wake a sleeping Render dyno. The prewarm and the actual discovery request could both go out nearly simultaneously, defeating the purpose.

**File:** `src/components/home/HomeExperience.jsx` line 266 / line 604.

---

## What Is Working Well

- All POST endpoints have body size limits (`32 KB` finalize, `16 KB` retry-advice/feedback)
- All user inputs are sanitized before reaching AI prompts (truncated, stripped of dangerous patterns)
- Candidate pool is always reconstructed from server-side cache — the browser cannot inject fake candidates
- Finalize has a hard 30-candidate pool cap and follows-up notes are truncated to 500 chars before reaching AI
- Supabase errors fall back to local file storage silently — no user-facing crash
- Analytics and feedback writes are best-effort (failures don't break the user flow)
- API keys are never logged or returned in responses
- `handleAnalyticsDashboard` is correctly gated behind `NODE_ENV !== 'production'` AND a localhost-only check
- Rate limiting is applied consistently on discovery, finalize, and retry-advice
- `readJsonBody` correctly enforces the byte limit before parsing

---

## Summary Table

| Finding | Severity | Affects Users | Code Change Needed |
|---|---|---|---|
| Render dyno sleeping → failed to fetch | High | Yes (tester's issue) | No (config/tier change) |
| `CLAUDE_API_KEY` missing from render.yaml | High | Yes (breaks finalize) | No (add to dashboard) |
| `.env.example` missing required keys | Medium | Devs setting up locally | Yes (update .env.example) |
| Debug endpoint open in production | Low | No direct impact | Nice to restrict |
| Error details in 500 responses | Low | No direct harm | Easy fix |
| Debug data in finalize response | Low | No direct harm | Easy fix |
| Rate limit resets on dyno restart | Low | Theoretical bypass | Acceptable for now |
| IP spoofing for rate limit | Low | Theoretical bypass | Acceptable for now |
| `haiku-lock` logs full AI response | Info | No impact | Easy cleanup |
| Prewarm fires on input focus not page load | Medium | Tester, first-time users | Easy fix |
