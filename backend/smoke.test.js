/**
 * Smoke tests — verify the live server + external services are healthy.
 *
 * These hit a REAL running server (default http://localhost:8787).
 * They are skipped by default in `npm run test` unless you set:
 *
 *   SMOKE=1 npm run test -- backend/smoke.test.js
 *
 * Or use the convenience script:
 *
 *   npm run test:smoke
 *
 * Requirements:
 *   1. Render-compatible Express backend running  (npm run server:express)
 *   2. Real .env with valid API keys
 */

import { describe, it, expect } from 'vitest'
import { getEnv } from './lib/search-data.js'

const SMOKE = process.env.SMOKE === '1'
const BASE = process.env.SMOKE_URL || 'http://localhost:8787'

const describeSmoke = SMOKE ? describe : describe.skip

// ─── helpers ────────────────────────────────────────────────────────

async function get(path) {
  const startedAt = performance.now()
  const res = await fetch(`${BASE}${path}`)
  return {
    status: res.status,
    headers: res.headers,
    body: await res.json().catch(() => null),
    durationMs: Math.round(performance.now() - startedAt),
  }
}

async function post(path, body) {
  const startedAt = performance.now()
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return {
    status: res.status,
    headers: res.headers,
    body: await res.json().catch(() => null),
    durationMs: Math.round(performance.now() - startedAt),
  }
}

// ─── 1. Server is alive ────────────────────────────────────────────

describeSmoke('Server health', () => {
  it('serves health with browser CORS headers', async () => {
    const { status, body } = await get('/api/ping')
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true })
    const res = await fetch(`${BASE}/api/ping`, {
      headers: { Origin: 'http://localhost:5173' },
    })
    const acao = res.headers.get('access-control-allow-origin')
    expect(acao).toBeTruthy()
  })
})

// ─── 2. External service connectivity ──────────────────────────────

describeSmoke('External services', () => {
  it('reaches configured OpenAI, Anthropic, and Supabase services', async () => {
    // Lightweight models list call — costs nothing
    const openAiResponse = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${getEnv('OPENAI_API_KEY')}` },
    })
    expect(openAiResponse.status, 'OpenAI API key rejected — check OPENAI_API_KEY').toBe(200)

    // Lightweight message with max_tokens=1 — costs essentially nothing
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': getEnv('CLAUDE_API_KEY'),
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    // 200 = valid key, 529 = overloaded (but key is valid)
    expect(
      [200, 529].includes(anthropicResponse.status),
      `Anthropic key rejected with status ${anthropicResponse.status} — check CLAUDE_API_KEY`
    ).toBe(true)

    const url = getEnv('SUPABASE_URL')
    const key = getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY')
    if (url && key) {
      const { status } = await get('/api/health/supabase')
      expect(status, 'Supabase health check failed').toBe(200)
    }
  }, 30_000)
})

// ─── 3. Core endpoints respond correctly ───────────────────────────

describeSmoke('Core endpoints', () => {
  it('rejects malformed guided-search requests without server errors', async () => {
    const responses = await Promise.all([
      get('/api/search/rainforest-discover'),
      get('/api/search/refine'),
      post('/api/search/finalize', {}),
      get('/api/search/query-quality'),
    ])

    for (const { status } of responses) {
      expect(status).toBeGreaterThanOrEqual(400)
      expect(status).toBeLessThan(500)
    }
  }, 10_000)
})

// ─── 4. End-to-end discovery (optional, heavier) ───────────────────

const SMOKE_E2E = process.env.SMOKE_E2E === '1'
const describeE2E = SMOKE && SMOKE_E2E ? describe : describe.skip

// ─── 5. Cache latency benchmark (opt-in; makes one paid Rainforest request) ─

const SMOKE_CACHE_BENCH = process.env.SMOKE_CACHE_BENCH === '1'
const describeCacheBenchmark = SMOKE && SMOKE_CACHE_BENCH ? describe : describe.skip
const CACHE_BENCH_QUERY = process.env.SMOKE_CACHE_QUERY || 'ergonomic wireless mouse'

function parseServerTiming(headers) {
  return String(headers.get('server-timing') || '')
    .split(',')
    .reduce((timings, part) => {
      const match = part.trim().match(/^([^;]+);dur=([\d.]+)$/)
      if (match) timings[match[1]] = Number(match[2])
      return timings
    }, {})
}

async function waitForDiscoveryCache(path) {
  let lastResponse = null

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    lastResponse = await get(path)
    if (lastResponse.status === 200 && lastResponse.body?.source === 'cache') {
      return lastResponse
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  return lastResponse
}

describeCacheBenchmark('Guided discovery cache latency', () => {
  it('reports a forced Rainforest search and the resulting cache hit', async () => {
    const query = encodeURIComponent(CACHE_BENCH_QUERY)
    const fresh = await get(`/api/search/rainforest-discover?query=${query}&cacheMode=refresh`)

    expect(fresh.status).toBe(200)
    expect(fresh.body?.source).toBe('rainforest_discovery')

    const cached = await waitForDiscoveryCache(`/api/search/rainforest-discover?query=${query}`)
    expect(cached.status).toBe(200)
    expect(cached.body?.source).toBe('cache')

    const freshTiming = parseServerTiming(fresh.headers)
    const cachedTiming = parseServerTiming(cached.headers)

    console.table([
      {
        request: 'forced Rainforest query',
        clientMs: fresh.durationMs,
        serverTotalMs: freshTiming.total ?? null,
        rateLimitMs: freshTiming['rate-limit'] ?? null,
        cacheMs: freshTiming.cache ?? null,
        moderationMs: freshTiming.moderation ?? null,
        sessionMs: freshTiming.session ?? null,
        providerMs: freshTiming.provider ?? null,
        source: fresh.body?.source,
      },
      {
        request: 'resulting cache hit',
        clientMs: cached.durationMs,
        serverTotalMs: cachedTiming.total ?? null,
        rateLimitMs: cachedTiming['rate-limit'] ?? null,
        cacheMs: cachedTiming.cache ?? null,
        moderationMs: cachedTiming.moderation ?? null,
        sessionMs: cachedTiming.session ?? null,
        providerMs: cachedTiming.provider ?? null,
        source: cached.body?.source,
      },
    ])
  }, 60_000)
})

describeE2E('E2E discovery flow', () => {
  const query = process.env.SMOKE_E2E_QUERY || 'ergonomic wireless mouse'

  it('completes discover, refine, and finalize with an honest shortlist', async () => {
    const discovery = await get(`/api/search/rainforest-discover?query=${encodeURIComponent(query)}`)
    expect(discovery.status).toBe(200)
    expect(discovery.body.previewResults?.length).toBeGreaterThan(0)
    expect(discovery.body.discoveryToken).toBeTruthy()

    const refinement = await get(`/api/search/refine?query=${encodeURIComponent(query)}`)
    expect(refinement.status).toBe(200)
    expect(refinement.body.prompt || refinement.body.question || refinement.body.refinement_question).toBeTruthy()

    const { status, body, durationMs, headers } = await post('/api/search/finalize', {
      query,
      discoveryToken: discovery.body.discoveryToken,
      followUpNotes: 'for office work',
    })
    const timing = parseServerTiming(headers)

    expect(status).toBe(200)
    expect(body.results?.length).toBeGreaterThan(0)
    expect(body.results?.length).toBeLessThanOrEqual(6)
    expect(timing.persistence).toBeTypeOf('number')
    console.table([{
      request: 'guided finalize',
      clientMs: durationMs,
      serverTotalMs: timing.total ?? null,
      cacheMs: timing.cache ?? null,
      haikuMs: timing.haiku ?? null,
      persistenceMs: timing.persistence ?? null,
      resultCount: body.results?.length ?? 0,
    }])
  }, 60_000)
})
