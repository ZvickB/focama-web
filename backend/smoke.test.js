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
 *   1. Backend server running  (npm run server)
 *   2. Real .env with valid API keys
 */

import { describe, it, expect } from 'vitest'

const SMOKE = process.env.SMOKE === '1'
const BASE = process.env.SMOKE_URL || 'http://localhost:8787'

const describeSmoke = SMOKE ? describe : describe.skip

// ─── helpers ────────────────────────────────────────────────────────

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) }
}

// ─── 1. Server is alive ────────────────────────────────────────────

describeSmoke('Server health', () => {
  it('GET /api/ping returns { ok: true }', async () => {
    const { status, body } = await get('/api/ping')
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true })
  })

  it('returns CORS headers', async () => {
    const res = await fetch(`${BASE}/api/ping`, {
      headers: { Origin: 'http://localhost:5173' },
    })
    const acao = res.headers.get('access-control-allow-origin')
    expect(acao).toBeTruthy()
  })
})

// ─── 2. External service connectivity ──────────────────────────────

describeSmoke('External services', () => {
  it('OpenAI API key is valid', async () => {
    // Lightweight models list call — costs nothing
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    })
    expect(res.status, 'OpenAI API key rejected — check OPENAI_API_KEY').toBe(200)
  }, 10_000)

  it('Anthropic API key is valid', async () => {
    // Lightweight message with max_tokens=1 — costs essentially nothing
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
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
      [200, 529].includes(res.status),
      `Anthropic key rejected with status ${res.status} — check CLAUDE_API_KEY`
    ).toBe(true)
  }, 15_000)

  it('Supabase is reachable (when configured)', async () => {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SECRET_KEY
    if (!url || !key) {
      console.log('  ⏭ Supabase not configured — skipping')
      return
    }

    const { status } = await get('/api/health/supabase')
    expect(status, 'Supabase health check failed').toBe(200)
  }, 10_000)
})

// ─── 3. Core endpoints respond correctly ───────────────────────────

describeSmoke('Core endpoints', () => {
  it('GET /api/search/rainforest-discover returns 400 without query', async () => {
    const { status } = await get('/api/search/rainforest-discover')
    // Should reject missing query, not 500
    expect(status).toBeLessThan(500)
    expect(status).toBeGreaterThanOrEqual(400)
  }, 10_000)

  it('GET /api/search/refine returns 400 without token', async () => {
    const { status } = await get('/api/search/refine')
    expect(status).toBeLessThan(500)
    expect(status).toBeGreaterThanOrEqual(400)
  }, 10_000)

  it('POST /api/search/finalize returns 400 without body', async () => {
    const { status } = await post('/api/search/finalize', {})
    expect(status).toBeLessThan(500)
    expect(status).toBeGreaterThanOrEqual(400)
  }, 10_000)

  it('GET /api/search/query-quality returns 400 without query', async () => {
    const { status } = await get('/api/search/query-quality')
    expect(status).toBeLessThan(500)
    expect(status).toBeGreaterThanOrEqual(400)
  }, 10_000)
})

// ─── 4. End-to-end discovery (optional, heavier) ───────────────────

const SMOKE_E2E = process.env.SMOKE_E2E === '1'
const describeE2E = SMOKE && SMOKE_E2E ? describe : describe.skip

describeE2E('E2E discovery flow', () => {
  let discoveryToken = null

  it('discover returns results for a simple query', async () => {
    const { status, body } = await get(
      '/api/search/rainforest-discover?q=wireless+mouse&source=rainforest'
    )
    expect(status).toBe(200)
    expect(body.preview?.length).toBeGreaterThan(0)
    expect(body.discoveryToken).toBeTruthy()
    discoveryToken = body.discoveryToken
  }, 30_000)

  it('refine generates a follow-up question', async () => {
    expect(discoveryToken, 'No discoveryToken from discover step').toBeTruthy()
    const { status, body } = await get(
      `/api/search/refine?token=${discoveryToken}`
    )
    expect(status).toBe(200)
    expect(body.question || body.refinement_question).toBeTruthy()
  }, 20_000)

  it('finalize returns 6 picks', async () => {
    expect(discoveryToken, 'No discoveryToken from discover step').toBeTruthy()
    const { status, body } = await post('/api/search/finalize', {
      discoveryToken,
      followUpNote: 'for office work',
    })
    expect(status).toBe(200)
    expect(body.results?.length).toBe(6)
  }, 30_000)
})
