import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '../search-data.js'
import { buildComparisonCacheEntry, buildComparisonCacheKey } from '../price-comparison/comparison-cache.js'
import { createPriceCheckHandler } from './price-check-handler.js'

function createRequest(body, headers = {}) {
  return {
    headers,
    on(event, callback) {
      if (event === 'data') callback(JSON.stringify(body))
      if (event === 'end') callback()
    },
  }
}

function createResponse() {
  return {
    body: '',
    headers: {},
    statusCode: 0,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = headers
    },
    end(body = '') {
      this.body += body
    },
  }
}

function requestBody(overrides = {}) {
  return {
    query: 'example laptop',
    discoveryToken: 'token-1',
    candidateId: 'B012345678',
    marketplace: 'amazon.ca',
    coverageMode: 'major_retailers',
    ...overrides,
  }
}

function resolvedContext(overrides = {}) {
  const candidate = {
    id: 'B012345678',
    title: 'Example ABC-123 Laptop 1 TB',
    numericPrice: 100,
    providerIdentity: { brand: 'Example', model_number: 'ABC-123', attributes: { capacity: '1 TB' } },
  }
  return {
    isValid: true,
    cachedEntry: {
      candidatePool: { candidates: [candidate] },
      selection: {
        shortlistLocked: true,
        selectedCandidateIds: [candidate.id],
        enrichment: {
          entries: [{
            candidate_id: candidate.id,
            source_title: candidate.title,
            display_title: candidate.title,
            match_identifier: {
              brand: 'Example',
              model_number: 'ABC-123',
              comparison_search_query: 'Example ABC-123 laptop 1 TB',
              attributes: { capacity: '1 TB' },
            },
          }],
        },
      },
    },
    ...overrides,
  }
}

function comparisonResult() {
  return {
    status: 'complete',
    query: 'Example ABC-123',
    offers: [{
      provider: 'serpapi',
      provider_offer_id: 'offer-1',
      retailer: 'Best Buy Canada',
      price: 89,
      known_total: 89,
      currency: 'CAD',
      url: 'https://example.com/offer',
      title: 'Example ABC-123 Laptop 1 TB',
      confidence: 0.95,
      notices: [],
    }],
    accepted: [],
    rejected: [],
    provider_errors: {},
  }
}

async function invoke(handler, body = requestBody(), headers = {}) {
  const response = createResponse()
  await handler(createRequest(body, headers), response)
  return { response, payload: JSON.parse(response.body) }
}

describe('price check handler', () => {
  beforeEach(() => {
    process.env.PRICE_COMPARISON_ENABLED = 'true'
    process.env.PRICE_COMPARISON_MARKET = 'CA'
    resetEnvCache()
  })

  afterEach(() => {
    delete process.env.PRICE_COMPARISON_ENABLED
    delete process.env.PRICE_COMPARISON_MARKET
    resetEnvCache()
  })

  it('short-circuits while disabled before auth, cache, or provider work', async () => {
    process.env.PRICE_COMPARISON_ENABLED = 'false'
    resetEnvCache()
    const resolveUser = vi.fn()
    const compareProduct = vi.fn()
    const handler = createPriceCheckHandler({ resolveUser, compareProduct })
    const { payload } = await invoke(handler)
    expect(payload).toEqual({ status: 'disabled', cheaperOffersFound: false })
    expect(resolveUser).not.toHaveBeenCalled()
    expect(compareProduct).not.toHaveBeenCalled()
  })

  it('enforces Amazon Canada before resolving the search context', async () => {
    const resolveDiscoveryContext = vi.fn()
    const handler = createPriceCheckHandler({ resolveDiscoveryContext })
    const { response } = await invoke(handler, requestBody({ marketplace: 'amazon.com' }))
    expect(response.statusCode).toBe(400)
    expect(resolveDiscoveryContext).not.toHaveBeenCalled()
  })

  it('rejects stale tokens and candidates outside the finalized shortlist', async () => {
    const staleHandler = createPriceCheckHandler({
      resolveUser: vi.fn().mockResolvedValue(null),
      takeRateLimitToken: vi.fn().mockResolvedValue({ allowed: true }),
      resolveDiscoveryContext: vi.fn().mockResolvedValue({ isValid: false, statusCode: 409, error: 'expired' }),
    })
    expect((await invoke(staleHandler)).response.statusCode).toBe(409)

    const wrongCandidateHandler = createPriceCheckHandler({
      resolveUser: vi.fn().mockResolvedValue(null),
      takeRateLimitToken: vi.fn().mockResolvedValue({ allowed: true }),
      resolveDiscoveryContext: vi.fn().mockResolvedValue(resolvedContext()),
    })
    expect((await invoke(wrongCandidateHandler, requestBody({ candidateId: 'OTHER' }))).response.statusCode).toBe(409)
  })

  it('redacts retailer and price details for signed-out users', async () => {
    const writeCache = vi.fn()
    const handler = createPriceCheckHandler({
      resolveUser: vi.fn().mockResolvedValue(null),
      takeRateLimitToken: vi.fn().mockResolvedValue({ allowed: true }),
      resolveDiscoveryContext: vi.fn().mockResolvedValue(resolvedContext()),
      readCache: vi.fn().mockResolvedValue(null),
      writeCache,
      compareProduct: vi.fn().mockResolvedValue(comparisonResult()),
    })
    const { payload } = await invoke(handler)
    expect(payload).toEqual({ cheaperOffersFound: true })
    expect(JSON.stringify(payload)).not.toContain('Best Buy')
    expect(writeCache).toHaveBeenCalledTimes(1)
  })

  it('returns at most two accepted offers for an authenticated user', async () => {
    const handler = createPriceCheckHandler({
      resolveUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
      takeRateLimitToken: vi.fn().mockResolvedValue({ allowed: true }),
      resolveDiscoveryContext: vi.fn().mockResolvedValue(resolvedContext()),
      readCache: vi.fn().mockResolvedValue(null),
      writeCache: vi.fn(),
      compareProduct: vi.fn().mockResolvedValue({
        ...comparisonResult(),
        offers: [comparisonResult().offers[0], { ...comparisonResult().offers[0], provider_offer_id: 'offer-2' }, { ...comparisonResult().offers[0], provider_offer_id: 'offer-3' }],
      }),
    })
    const { payload } = await invoke(handler, requestBody(), { authorization: 'Bearer token' })
    expect(payload.offers).toHaveLength(2)
    expect(payload.offers[0].retailer).toBe('Best Buy Canada')
  })

  it('uses a fresh price cache on repeated modal opens without provider calls', async () => {
    const input = {
      candidateId: 'B012345678',
      market: 'CA',
      marketplace: 'amazon.ca',
      sellerCoverageMode: 'major_retailers',
      matchIdentifier: resolvedContext().cachedEntry.selection.enrichment.entries[0].match_identifier,
    }
    const cached = buildComparisonCacheEntry({
      cacheKey: buildComparisonCacheKey(input),
      input,
      result: comparisonResult(),
    })
    const compareProduct = vi.fn()
    const handler = createPriceCheckHandler({
      resolveUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
      takeRateLimitToken: vi.fn().mockResolvedValue({ allowed: true }),
      resolveDiscoveryContext: vi.fn().mockResolvedValue(resolvedContext()),
      readCache: vi.fn().mockResolvedValue(cached),
      compareProduct,
    })
    const { payload } = await invoke(handler)
    expect(payload.cache).toEqual({ match: 'hit', price: 'hit' })
    expect(payload.offers).toHaveLength(1)
    expect(compareProduct).not.toHaveBeenCalled()
  })

  it('refreshes stale prices while reporting a valid match-cache hit', async () => {
    const now = Date.now()
    const stale = {
      ...buildComparisonCacheEntry({
        cacheKey: 'cache-key',
        input: { candidateId: 'B012345678', market: 'CA', matchIdentifier: {} },
        result: comparisonResult(),
        now: new Date(now - 31 * 60 * 1000),
      }),
      matchExpiresAt: new Date(now + 60_000).toISOString(),
      priceExpiresAt: new Date(now - 1).toISOString(),
    }
    const compareProduct = vi.fn().mockResolvedValue(comparisonResult())
    const handler = createPriceCheckHandler({
      resolveUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
      takeRateLimitToken: vi.fn().mockResolvedValue({ allowed: true }),
      resolveDiscoveryContext: vi.fn().mockResolvedValue(resolvedContext()),
      readCache: vi.fn().mockResolvedValue(stale),
      writeCache: vi.fn(),
      compareProduct,
    })
    const { payload } = await invoke(handler)
    expect(payload.cache).toEqual({ match: 'hit', price: 'miss' })
    expect(compareProduct).toHaveBeenCalledTimes(1)
  })

  it('rate limits signed-out requests before context or provider work', async () => {
    const resolveDiscoveryContext = vi.fn()
    const handler = createPriceCheckHandler({
      resolveUser: vi.fn().mockResolvedValue(null),
      takeRateLimitToken: vi.fn().mockResolvedValue({ allowed: false, resetAt: Date.now() + 1000 }),
      resolveDiscoveryContext,
    })
    const { response } = await invoke(handler, requestBody(), { 'x-forwarded-for': '203.0.113.20' })
    expect(response.statusCode).toBe(429)
    expect(resolveDiscoveryContext).not.toHaveBeenCalled()
  })
})
