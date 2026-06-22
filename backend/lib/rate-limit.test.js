import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from './search-data.js'

const ENV_KEYS = [
  'RATE_LIMIT_HASH_SALT',
  'RATE_LIMIT_STORAGE',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
]

async function loadRateLimitModule() {
  return import('./rate-limit.js')
}

describe('getCountryCode', () => {
  it('returns the country code from the Vercel header, defaulting to US when absent', async () => {
    const { getCountryCode } = await loadRateLimitModule()

    expect(getCountryCode({ 'x-vercel-ip-country': 'GB' })).toBe('GB')
    expect(getCountryCode({})).toBe('US')
    expect(getCountryCode({ 'x-vercel-ip-country': 'not-valid' })).toBe('US')
  })
})

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

  it('allows the same key again after the rate-limit window resets', async () => {
    const { takeRateLimitToken } = await loadRateLimitModule()

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-12T12:00:00.000Z'))

    await expect(
      takeRateLimitToken('203.0.113.57', {
        limit: 1,
        windowMs: 3_000,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: true,
        remaining: 0,
      }),
    )

    await expect(
      takeRateLimitToken('203.0.113.57', {
        limit: 1,
        windowMs: 3_000,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        remaining: 0,
      }),
    )

    vi.setSystemTime(new Date('2026-04-12T12:00:03.001Z'))

    await expect(
      takeRateLimitToken('203.0.113.57', {
        limit: 1,
        windowMs: 3_000,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: true,
        remaining: 0,
      }),
    )
  })

  it('uses Supabase as a shared production limiter when configured', async () => {
    process.env.RATE_LIMIT_STORAGE = 'supabase'
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'test-secret'
    resetEnvCache()

    const deleteChain = {
      eq: vi.fn(() => ({
        lt: vi.fn().mockResolvedValue({ error: null }),
      })),
    }
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const countLimitMock = vi.fn().mockResolvedValue({
      count: 2,
      data: [{ created_at: new Date(Date.now() - 500).toISOString() }],
      error: null,
    })
    const countOrderMock = vi.fn(() => ({ limit: countLimitMock }))
    const countGteMock = vi.fn(() => ({ order: countOrderMock }))
    const countEqMock = vi.fn(() => ({ gte: countGteMock }))
    const selectMock = vi.fn(() => ({ eq: countEqMock }))
    const fromMock = vi.fn((table) => {
      expect(table).toBe('rate_limit_events')
      return {
        delete: vi.fn(() => deleteChain),
        insert: insertMock,
        select: selectMock,
      }
    })

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => ({ from: fromMock })),
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

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rate_key: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    )
    expect(selectMock).toHaveBeenCalledWith('created_at', { count: 'exact' })
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

    await expect(
      takeFallbackRateLimitToken('serpapi-cost-budget', {
        limit: 32,
        windowMs: 24 * 60 * 60 * 1000,
        failClosed: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        allowed: false,
        reason: 'persistent_rate_limit_unavailable',
      }),
    )

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Supabase limiter unavailable'))
  })
})
