import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from './search-data.js'

const ENV_KEYS = [
  'RATE_LIMIT_HASH_SALT',
  'RATE_LIMIT_STORAGE_TIMEOUT_MS',
  'RATE_LIMIT_STORAGE',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
]

async function loadRateLimitModule() {
  return import('./rate-limit.js')
}

describe('rate-limit helpers', () => {
  const originalEnv = {}

  beforeEach(() => {
    vi.resetModules()
    resetEnvCache()

    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key]
    }

    process.env.RATE_LIMIT_STORAGE = 'memory'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('@supabase/supabase-js')

    for (const key of ENV_KEYS) {
      if (typeof originalEnv[key] === 'undefined') {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
    }

    resetEnvCache()
  })

  it('uses the process-local limiter for repeated requests from the same key', async () => {
    const { takeRateLimitToken } = await loadRateLimitModule()

    await expect(
      takeRateLimitToken('203.0.113.55', {
        limit: 2,
        windowMs: 60_000,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: true,
        remaining: 1,
      }),
    )

    await expect(
      takeRateLimitToken('203.0.113.55', {
        limit: 2,
        windowMs: 60_000,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: true,
        remaining: 0,
      }),
    )

    await expect(
      takeRateLimitToken('203.0.113.55', {
        limit: 2,
        windowMs: 60_000,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        remaining: 0,
      }),
    )
  })

  it('uses local-primary limiting even when Supabase is configured', async () => {
    process.env.RATE_LIMIT_STORAGE = 'auto'
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'test-secret'
    resetEnvCache()
    const createClient = vi.fn()

    vi.doMock('@supabase/supabase-js', () => ({ createClient }))
    const { takeRateLimitToken } = await loadRateLimitModule()

    await expect(takeRateLimitToken('203.0.113.56')).resolves.toEqual(expect.objectContaining({
      allowed: true,
      fallbackReason: 'configured_memory',
      storage: 'memory',
    }))
    expect(createClient).not.toHaveBeenCalled()
  })

  it('uses Supabase as a shared production limiter when configured', async () => {
    process.env.RATE_LIMIT_STORAGE = 'supabase'
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'test-secret'
    resetEnvCache()

    const fromMock = vi.fn()
    const rpcMock = vi.fn().mockResolvedValue({
      data: [{
        allowed: true,
        event_count: 2,
        remaining: 0,
        reset_at: new Date(Date.now() + 9_500).toISOString(),
      }],
      error: null,
    })

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({ from: fromMock, rpc: rpcMock })),
    }))

    const { takeRateLimitToken: takeSupabaseRateLimitToken } = await loadRateLimitModule()

    await expect(
      takeSupabaseRateLimitToken('203.0.113.58', {
        limit: 2,
        windowMs: 10_000,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: true,
        remaining: 0,
      }),
    )

    expect(rpcMock).toHaveBeenCalledWith(
      'consume_rate_limit_token',
      expect.objectContaining({
        p_rate_key: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_request_id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
      }),
    )
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('falls back to the process-local limiter when Supabase is unavailable', async () => {
    process.env.RATE_LIMIT_STORAGE = 'supabase'
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'test-secret'
    resetEnvCache()
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({
        from: vi.fn(() => ({
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              lt: vi.fn().mockResolvedValue({ error: null }),
            })),
          })),
          insert: vi.fn().mockResolvedValue({ error: new Error('missing table') }),
        })),
      })),
    }))

    const { takeRateLimitToken: takeFallbackRateLimitToken } = await loadRateLimitModule()

    await expect(
      takeFallbackRateLimitToken('203.0.113.59', {
        limit: 1,
        windowMs: 60_000,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: true,
        remaining: 0,
      }),
    )

    await expect(
      takeFallbackRateLimitToken('203.0.113.59', {
        limit: 1,
        windowMs: 60_000,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        remaining: 0,
      }),
    )

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Supabase limiter unavailable'))
  })

  it('bounds a stalled Supabase limiter and reports the memory fallback reason', async () => {
    vi.useFakeTimers()
    process.env.RATE_LIMIT_STORAGE = 'supabase'
    process.env.RATE_LIMIT_STORAGE_TIMEOUT_MS = '50'
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'test-secret'
    resetEnvCache()
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({
        rpc: vi.fn(() => new Promise(() => {})),
      })),
    }))

    const { takeRateLimitToken: takeTimedRateLimitToken } = await loadRateLimitModule()
    const pending = takeTimedRateLimitToken('203.0.113.60', {
      limit: 1,
      windowMs: 60_000,
    })

    await vi.advanceTimersByTimeAsync(51)

    await expect(pending).resolves.toEqual(expect.objectContaining({
      allowed: true,
      fallbackReason: 'timeout',
      storage: 'memory',
    }))
  })
})
