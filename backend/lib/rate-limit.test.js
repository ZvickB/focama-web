import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./search-storage.js', () => ({
  takeSharedRateLimitToken: vi.fn(),
}))

import { resetRateLimitStore, takeRateLimitToken } from './rate-limit.js'
import { takeSharedRateLimitToken } from './search-storage.js'

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
})
