import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchProductDetailsWithCache } from './product-details-cache.js'

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForExpectation(assertion, attempts = 20) {
  let lastError

  for (let index = 0; index < attempts; index += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await flushAsyncWork()
    }
  }

  throw lastError
}

describe('product details cache', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns cache hits, fetches misses only once, and writes fresh details best-effort', async () => {
    const readCache = vi.fn().mockResolvedValue(new Map([
      ['B001', {
        feature_bullets: ['Cached fold'],
        productDescription: 'Cached stroller description.',
        source: 'oxylabs',
        needsUpdating: false,
        nextUpdateAt: null,
      }],
    ]))
    const fetchFreshDetails = vi.fn().mockResolvedValue(new Map([
      ['B002', {
        feature_bullets: ['Fresh canopy'],
        productDescription: 'Fresh stroller description.',
      }],
    ]))
    const writeCache = vi.fn().mockResolvedValue(undefined)

    const result = await fetchProductDetailsWithCache({
      asins: [' B001 ', 'B002', 'B002', ''],
      source: 'oxylabs',
      readCache,
      writeCache,
      fetchFreshDetails,
    })

    expect(readCache).toHaveBeenCalledWith(['B001', 'B002'])
    expect(fetchFreshDetails).toHaveBeenCalledWith(['B002'])
    expect(result.get('B001')).toEqual({
      feature_bullets: ['Cached fold'],
      productDescription: 'Cached stroller description.',
    })
    expect(result.get('B002')).toEqual({
      feature_bullets: ['Fresh canopy'],
      productDescription: 'Fresh stroller description.',
    })

    await waitForExpectation(() => {
      expect(writeCache).toHaveBeenCalledWith([{
        asin: 'B002',
        feature_bullets: ['Fresh canopy'],
        productDescription: 'Fresh stroller description.',
        source: 'oxylabs',
        needsUpdating: false,
        nextUpdateAt: null,
      }])
    })
  })

  it('returns due partial cache entries immediately and refreshes them in the background', async () => {
    const readCache = vi.fn().mockResolvedValue(new Map([
      ['B010', {
        feature_bullets: [],
        productDescription: 'Cached partial description.',
        source: 'oxylabs',
        needsUpdating: true,
        nextUpdateAt: new Date(Date.now() - 1000).toISOString(),
      }],
    ]))
    const fetchFreshDetails = vi.fn().mockResolvedValue(new Map([
      ['B010', {
        feature_bullets: ['Refreshed bullet'],
        productDescription: 'Refreshed description.',
      }],
    ]))
    const writeCache = vi.fn().mockResolvedValue(undefined)

    const result = await fetchProductDetailsWithCache({
      asins: ['B010'],
      source: 'oxylabs',
      readCache,
      writeCache,
      fetchFreshDetails,
    })

    expect(result.get('B010')).toEqual({
      feature_bullets: [],
      productDescription: 'Cached partial description.',
    })

    await waitForExpectation(() => {
      expect(fetchFreshDetails).toHaveBeenCalledWith(['B010'])
      expect(writeCache).toHaveBeenCalledWith([{
        asin: 'B010',
        feature_bullets: ['Refreshed bullet'],
        productDescription: 'Refreshed description.',
        source: 'oxylabs',
        needsUpdating: false,
        nextUpdateAt: null,
      }])
    })
  })

  it('keeps cached details usable when the provider fails for missing entries', async () => {
    const readCache = vi.fn().mockResolvedValue(new Map([
      ['B020', {
        feature_bullets: ['Cached bullet'],
        productDescription: 'Cached description.',
        source: 'oxylabs',
        needsUpdating: false,
        nextUpdateAt: null,
      }],
    ]))
    const fetchFreshDetails = vi.fn().mockRejectedValue(new Error('provider unavailable'))
    const writeCache = vi.fn()

    const result = await fetchProductDetailsWithCache({
      asins: ['B020', 'B021'],
      source: 'oxylabs',
      readCache,
      writeCache,
      fetchFreshDetails,
      logLabel: 'test-cache',
    })

    expect(fetchFreshDetails).toHaveBeenCalledWith(['B021'])
    expect(result.has('B021')).toBe(false)
    expect(result.get('B020')).toEqual({
      feature_bullets: ['Cached bullet'],
      productDescription: 'Cached description.',
    })
    expect(writeCache).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Product details provider fetch failed'))
  })

  it('does not fail the fetch path when a best-effort cache write rejects', async () => {
    const readCache = vi.fn().mockResolvedValue(new Map())
    const fetchFreshDetails = vi.fn().mockResolvedValue(new Map([
      ['B030', {
        feature_bullets: ['Fresh bullet'],
        productDescription: 'Fresh description.',
      }],
    ]))
    const writeCache = vi.fn().mockRejectedValue(new Error('cache write failed'))

    const result = await fetchProductDetailsWithCache({
      asins: ['B030'],
      source: 'oxylabs',
      readCache,
      writeCache,
      fetchFreshDetails,
      logLabel: 'test-cache',
    })

    expect(result.get('B030')).toEqual({
      feature_bullets: ['Fresh bullet'],
      productDescription: 'Fresh description.',
    })

    await waitForExpectation(() => {
      expect(writeCache).toHaveBeenCalledTimes(1)
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Product details cache write failed'))
    })
  })
})
