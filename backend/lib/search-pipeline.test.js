import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageMocks = vi.hoisted(() => ({
  readStoredSearchCacheEntry: vi.fn(),
  recordSearchHistory: vi.fn(),
  writeStoredSearchCacheEntry: vi.fn(),
}))

vi.mock('./search-storage.js', () => storageMocks)

import {
  ensureBadges,
  fetchSearchArtifacts,
  getValidatedSearchRequest,
  readCachedSearchSnapshot,
  recordSearchCacheEvent,
  writeSearchSnapshot,
} from './search-pipeline.js'

function createProduct(overrides = {}) {
  return {
    id: 'item-1',
    title: 'Travel Stroller',
    subtitle: 'Amazon',
    price: '$129.99',
    rating: 4.6,
    reviewCount: 1200,
    image: 'https://example.com/stroller.jpg',
    link: 'https://example.com/stroller',
    ...overrides,
  }
}

function createRawShoppingResult(overrides = {}) {
  return {
    position: 1,
    product_id: 'prod-1',
    title: 'Travel Stroller',
    source: 'Amazon',
    price: '$129.99',
    extracted_price: 129.99,
    rating: 4.6,
    reviews: 1200,
    thumbnail: 'https://example.com/stroller.jpg',
    product_link: 'https://example.com/stroller',
    ...overrides,
  }
}

describe('search pipeline helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('sanitizes cached snapshots before returning reusable results or candidates', async () => {
    storageMocks.readStoredSearchCacheEntry.mockResolvedValue({
      cacheKey: 'guided_discovery:travel stroller',
      productQuery: 'travel stroller',
      details: '',
      candidatePool: {
        query: 'travel stroller',
        amazonDomain: 'amazon.ca',
        candidates: [
          createProduct({ id: 'missing-price', price: 'Price unavailable' }),
          createProduct({ id: 'zero-price', price: '$0.00', extracted_price: 0 }),
          createProduct({
            id: 'valid-candidate',
            numericPrice: 129.99,
            link: 'https://www.amazon.ca/dp/B001',
          }),
          createProduct({
            id: 'mismatched-candidate',
            numericPrice: 139.99,
            link: 'https://www.amazon.co.uk/dp/B002',
          }),
        ],
      },
      results: [
        createProduct({ id: 'stale-result', price: 'Price unavailable' }),
        createProduct({ id: 'valid-result', price: '$129.99', link: 'https://www.amazon.ca/dp/B001' }),
        createProduct({ id: 'mismatched-result', price: '$139.99', link: 'https://www.amazon.co.uk/dp/B002' }),
      ],
      source: 'supabase_cache',
    })

    const snapshot = await readCachedSearchSnapshot({
      productQuery: 'travel stroller',
      details: '',
      scope: 'guided_discovery',
    })

    expect(snapshot.cachedEntry.results.map((item) => item.id)).toEqual([
      'valid-result',
      'mismatched-result',
    ])
    expect(snapshot.cachedEntry.candidatePool.candidates.map((item) => item.id)).toEqual([
      'valid-candidate',
      'mismatched-candidate',
    ])
    expect(snapshot.cachedEntry.results[0].link).toBe('https://www.amazon.ca/dp/B001?tag=focamai4203-20')
    expect(snapshot.cachedEntry.results[1].link).toBe('')
    expect(snapshot.cachedEntry.candidatePool.candidates[0].link).toBe(
      'https://www.amazon.ca/dp/B001?tag=focamai4203-20',
    )
    expect(snapshot.cachedEntry.candidatePool.candidates[1].link).toBe('')
    expect(snapshot.normalizedCachedResults).toEqual([
      expect.objectContaining({ id: 'valid-result', badgeLabel: 'Best match' }),
      expect.objectContaining({ id: 'mismatched-result', badgeLabel: '' }),
    ])
  })

  it('validates and normalizes search requests without building a cache key for invalid input', () => {
    const validRequest = getValidatedSearchRequest(
      new URL('https://example.com/api/search?query=%20Desk%20%20Lamps%20&details=%20office%20'),
    )
    const invalidRequest = getValidatedSearchRequest(
      new URL('https://example.com/api/search?query=jhljlhl&details=ignored'),
    )

    expect(validRequest).toMatchObject({
      isValid: true,
      normalizedQuery: 'Desk Lamps',
      normalizedDetails: 'office',
      cacheKey: 'desk lamp office',
      error: '',
    })
    expect(invalidRequest).toMatchObject({
      isValid: false,
      normalizedQuery: 'jhljlhl',
      cacheKey: null,
    })
    expect(invalidRequest.error).toContain('Try a real product topic')
  })

  it('returns a stable upstream error when the shopping API fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn(),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchSearchArtifacts({
      productQuery: 'travel stroller',
      serpApiKey: 'serp-key',
    })

    expect(response).toEqual({
      error: {
        error: 'SerpApi request failed.',
        statusCode: 502,
      },
      artifacts: null,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0].searchParams.get('q')).toBe('travel stroller')
    expect(fetchMock.mock.calls[0][0].searchParams.get('api_key')).toBe('serp-key')
  })

  it('returns a not-found contract when the API response has no usable products', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ shopping_results: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchSearchArtifacts({
      productQuery: 'travel stroller',
      serpApiKey: 'serp-key',
    })

    expect(response).toEqual({
      error: {
        error: 'No usable shopping results were returned.',
        statusCode: 404,
      },
      artifacts: null,
    })
  })

  it('keeps successful artifacts in the normalized product contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        shopping_results: [
          createRawShoppingResult(),
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchSearchArtifacts({
      productQuery: 'travel stroller',
      serpApiKey: 'serp-key',
      filterConfig: {
        candidatePoolSize: 10,
        finalResultLimit: 6,
        minimumScore: -20,
        diversifyPoolMultiplier: 2,
        diversifyBySource: false,
        skipHardFilter: true,
      },
    })

    expect(response.error).toBeNull()
    expect(response.artifacts.results).toEqual([
      expect.objectContaining({
        id: 'prod-1',
        title: 'Travel Stroller',
        price: '$129.99',
      }),
    ])
    expect(response.artifacts.candidatePool.candidates).toEqual([
      expect.objectContaining({
        id: 'prod-1',
        title: 'Travel Stroller',
      }),
    ])
  })

  it('adds a badge fallback only when no result has an explicit badge', () => {
    expect(ensureBadges([
      createProduct({ id: 'first' }),
      createProduct({ id: 'second' }),
    ])).toEqual([
      expect.objectContaining({ id: 'first', badgeLabel: 'Best match' }),
      expect.objectContaining({ id: 'second', badgeLabel: '' }),
    ])

    const existingBadgeResults = ensureBadges([
      createProduct({ id: 'first' }),
      createProduct({ id: 'second', badgeLabel: 'Budget pick' }),
    ])

    expect(existingBadgeResults[0]).not.toHaveProperty('badgeLabel')
    expect(existingBadgeResults[1]).toEqual(
      expect.objectContaining({ id: 'second', badgeLabel: 'Budget pick' }),
    )
  })

  it('delegates cache writes and history events with the provided payload', async () => {
    storageMocks.recordSearchHistory.mockResolvedValue(undefined)
    storageMocks.writeStoredSearchCacheEntry.mockResolvedValue({ storage: 'local' })

    await recordSearchCacheEvent({
      cacheKey: 'travel stroller',
      cacheStatus: 'hit',
      candidateCount: 8,
      details: '',
      productQuery: 'travel stroller',
      resultCount: 6,
      selectionMode: 'preview',
      source: 'cache',
    })
    const writeResult = await writeSearchSnapshot({
      productQuery: 'travel stroller',
      details: '',
      candidatePool: { candidates: [] },
      discoveryToken: 'token-1',
      results: [],
      selection: { strategy: 'preview' },
      source: 'live_search',
      scope: 'guided_discovery',
    })

    expect(storageMocks.recordSearchHistory).toHaveBeenCalledWith(expect.objectContaining({
      cacheStatus: 'hit',
      productQuery: 'travel stroller',
    }))
    expect(storageMocks.writeStoredSearchCacheEntry).toHaveBeenCalledWith(expect.objectContaining({
      discoveryToken: 'token-1',
      scope: 'guided_discovery',
    }))
    expect(writeResult).toEqual({ storage: 'local' })
  })
})
