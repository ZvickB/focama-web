import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./search-storage.js', () => ({
  takeSharedRateLimitToken: vi.fn(),
}))

import { getCountryCode, resetRateLimitStore, takeRateLimitToken } from './rate-limit.js'
import { takeSharedRateLimitToken } from './search-storage.js'

describe('getCountryCode', () => {
  it('returns the country code from the Vercel header, defaulting to US when absent', () => {
    expect(getCountryCode({ 'x-vercel-ip-country': 'GB' })).toBe('GB')
    expect(getCountryCode({})).toBe('US')
    expect(getCountryCode({ 'x-vercel-ip-country': 'not-valid' })).toBe('US')
  })
})

describe('rate-limit helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimitStore()
    takeSharedRateLimitToken.mockResolvedValue(null)
  })

  it('uses the shared limiter result when Supabase-backed storage returns one', async () => {
    takeSharedRateLimitToken.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: 12345,
      storage: 'supabase',
    })

    await expect(takeRateLimitToken('203.0.113.55')).resolves.toEqual({
      allowed: false,
      remaining: 0,
      resetAt: 12345,
      storage: 'supabase',
    })
  })

  it('falls back to the local in-memory limiter when no shared limiter result is available', async () => {
    await expect(
      takeRateLimitToken('203.0.113.56', {
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
      takeRateLimitToken('203.0.113.56', {
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
      takeRateLimitToken('203.0.113.56', {
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

    vi.useRealTimers()
  })
})
