import { beforeEach, describe, expect, it } from 'vitest'
import { acquireRainforestSearchSlot, resetProviderGuard } from './provider-guard.js'

describe('Rainforest paid-call guard', () => {
  beforeEach(() => {
    resetProviderGuard()
    delete process.env.RAINFOREST_SEARCH_RATE_LIMIT
    delete process.env.RAINFOREST_SEARCH_MAX_CONCURRENCY
    delete process.env.RAINFOREST_SEARCH_RATE_WINDOW_MS
  })

  it('limits paid searches per client without affecting cached requests', () => {
    process.env.RAINFOREST_SEARCH_RATE_LIMIT = '2'

    const first = acquireRainforestSearchSlot('203.0.113.10')
    first.release()
    const second = acquireRainforestSearchSlot('203.0.113.10')
    second.release()
    const third = acquireRainforestSearchSlot('203.0.113.10')

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
    expect(third).toEqual(expect.objectContaining({
      allowed: false,
      reason: 'client_rate_limit',
    }))
  })

  it('caps simultaneous paid searches and releases slots idempotently', () => {
    process.env.RAINFOREST_SEARCH_MAX_CONCURRENCY = '1'

    const first = acquireRainforestSearchSlot('203.0.113.11')
    const blocked = acquireRainforestSearchSlot('203.0.113.12')
    first.release()
    first.release()
    const next = acquireRainforestSearchSlot('203.0.113.12')

    expect(blocked).toEqual(expect.objectContaining({
      allowed: false,
      reason: 'concurrency_limit',
    }))
    expect(next.allowed).toBe(true)
    next.release()
  })
})
