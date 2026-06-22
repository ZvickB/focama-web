import { describe, expect, it } from 'vitest'
import {
  COMPARISON_MATCH_TTL_MS,
  COMPARISON_PRICE_TTL_MS,
  buildComparisonCacheEntry,
  buildComparisonCacheKey,
  buildHybridIdentityJudgmentCacheKey,
  buildSerperMatchJudgmentCacheEntry,
  buildSerperMatchJudgmentCacheKey,
  buildSerperResultCacheEntry,
  buildSerperResultCacheKey,
  buildStableOfferKey,
  readComparisonCacheState,
  readSerperMatchJudgmentCacheState,
  readSerperResultCacheState,
} from './comparison-cache.js'

const input = {
  candidateId: 'B012345678',
  market: 'CA',
  marketplace: 'amazon.ca',
  sellerCoverageMode: 'major_retailers',
  matchIdentifier: {
    brand: 'Example',
    model_number: 'ABC-123',
    attributes: { capacity: '1 TB' },
  },
}

const result = {
  status: 'complete',
  query: 'Example ABC-123',
  offers: [{ provider: 'serpapi', provider_offer_id: 'offer-1', retailer: 'Best Buy Canada', price: 90 }],
  accepted: [{ provider: 'serpapi', provider_offer_id: 'offer-1', retailer: 'Best Buy Canada', price: 90 }],
  rejected: [{ reason: 'low_confidence' }],
  provider_errors: {},
}

describe('comparison cache', () => {
  it('keeps hybrid identity judgments reusable when only price or URL changes', () => {
    const product = { candidate_id: 'one', source_title: 'Sony WH-1000XM5', match_identifier: input.matchIdentifier }
    const first = buildHybridIdentityJudgmentCacheKey({
      product,
      offers: [{ retailer: 'Best Buy', title: 'Sony WH-1000XM5', price: 300, url: 'https://bestbuy.ca/old' }],
    })
    const second = buildHybridIdentityJudgmentCacheKey({
      product,
      offers: [{ retailer: 'Best Buy', title: 'Sony WH-1000XM5', price: 280, url: 'https://bestbuy.ca/new' }],
    })
    expect(first).toBe(second)
    expect(buildHybridIdentityJudgmentCacheKey({
      product: { ...product, match_policy: { minSavingsPercent: 0.1 } },
      offers: [{ retailer: 'Best Buy', title: 'Sony WH-1000XM5', price: 280, url: 'https://bestbuy.ca/new' }],
    })).not.toBe(first)
  })
  it('keys by identity, marketplace, coverage mode, and strategy version', () => {
    const first = buildComparisonCacheKey(input)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(buildComparisonCacheKey({ ...input })).toBe(first)
    expect(buildComparisonCacheKey({ ...input, sellerCoverageMode: 'all_sellers' })).not.toBe(first)
    expect(buildComparisonCacheKey({
      ...input,
      matchIdentifier: { ...input.matchIdentifier, model_number: 'ABC-124' },
    })).not.toBe(first)
  })

  it('uses provider offer ids before a deterministic derived identity', () => {
    expect(buildStableOfferKey(result.offers[0])).toBe('serpapi:offer-1')
    expect(buildStableOfferKey({ retailer: 'Store', seller: 'Store', title: 'Product' }))
      .toMatch(/^derived:[a-f0-9]{64}$/)
  })

  it('keeps a valid match window while refreshing stale prices', () => {
    const initialNow = new Date('2026-06-15T12:00:00.000Z')
    const initial = buildComparisonCacheEntry({
      cacheKey: buildComparisonCacheKey(input),
      input,
      result,
      now: initialNow,
    })

    expect(new Date(initial.matchExpiresAt).getTime() - initialNow.getTime()).toBe(COMPARISON_MATCH_TTL_MS)
    expect(new Date(initial.priceExpiresAt).getTime() - initialNow.getTime()).toBe(COMPARISON_PRICE_TTL_MS)

    const refreshNow = new Date(initialNow.getTime() + COMPARISON_PRICE_TTL_MS + 1)
    expect(readComparisonCacheState(initial, refreshNow.getTime())).toEqual(
      expect.objectContaining({ match: 'hit', price: 'stale', result: null }),
    )

    const refreshed = buildComparisonCacheEntry({
      cacheKey: initial.cacheKey,
      existingEntry: initial,
      input,
      result: { ...result, offers: [{ ...result.offers[0], price: 85 }] },
      now: refreshNow,
    })

    expect(refreshed.matchCachedAt).toBe(initial.matchCachedAt)
    expect(refreshed.matchExpiresAt).toBe(initial.matchExpiresAt)
    expect(refreshed.priceCachedAt).toBe(refreshNow.toISOString())
  })

  it('returns fresh cached empty results so repeated opens do not call providers', () => {
    const entry = buildComparisonCacheEntry({
      cacheKey: buildComparisonCacheKey(input),
      input,
      result: { ...result, offers: [], accepted: [] },
      now: new Date('2026-06-15T12:00:00.000Z'),
    })
    const state = readComparisonCacheState(entry, new Date('2026-06-15T12:05:00.000Z').getTime())
    expect(state.price).toBe('hit')
    expect(state.result.offers).toEqual([])
  })

  it('keys Serper shopping result caches by normalized query and market', () => {
    const first = buildSerperResultCacheKey({ query: '  Sony  WH-1000XM5 ', market: 'ca' })
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(buildSerperResultCacheKey({ query: 'sony wh-1000xm5', market: 'CA' })).toBe(first)
    expect(buildSerperResultCacheKey({ query: 'sony wh-1000xm5', market: 'US' })).not.toBe(first)
  })

  it('uses a short price window for cached Serper shopping results', () => {
    const now = new Date('2026-06-18T12:00:00.000Z')
    const entry = buildSerperResultCacheEntry({
      cacheKey: buildSerperResultCacheKey({ query: 'sony', market: 'CA' }),
      query: 'sony',
      market: 'CA',
      offers: [{ provider: 'serper', retailer: 'Best Buy', title: 'Sony', price: 100 }],
      now,
    })

    expect(readSerperResultCacheState(entry, now.getTime()).offers).toHaveLength(1)
    expect(readSerperResultCacheState(entry, now.getTime() + COMPARISON_PRICE_TTL_MS + 1)).toEqual({
      price: 'stale',
      offers: null,
    })
  })

  it('keys Serper match judgments by product identity and filtered offer set', () => {
    const product = {
      candidate_id: 'B0TEST',
      price: 399.99,
      currency: 'CAD',
      match_identifier: { brand: 'Sony', model_number: 'WH-1000XM5', attributes: { color: 'Black' } },
    }
    const offers = [{ provider: 'serper', provider_offer_id: 'offer-1', price: 349.99, currency: 'CAD' }]
    const first = buildSerperMatchJudgmentCacheKey({ product, offers })

    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(buildSerperMatchJudgmentCacheKey({ product: { ...product }, offers: [{ ...offers[0] }] })).toBe(first)
    expect(buildSerperMatchJudgmentCacheKey({
      product,
      offers: [{ ...offers[0], price: 329.99 }],
    })).not.toBe(first)
  })

  it('uses the match window for cached Serper judgments', () => {
    const now = new Date('2026-06-18T12:00:00.000Z')
    const entry = buildSerperMatchJudgmentCacheEntry({
      cacheKey: 'match-cache',
      product: { candidate_id: 'B0TEST', currency: 'CAD', match_identifier: { brand: 'Sony' } },
      matches: [{ confidence: 0.9 }],
      model: 'haiku',
      usage: { inputTokens: 1, outputTokens: 1 },
      now,
    })

    expect(readSerperMatchJudgmentCacheState(entry, now.getTime())).toEqual({
      match: 'hit',
      matches: [{ confidence: 0.9 }],
      usage: { inputTokens: 1, outputTokens: 1 },
      model: 'haiku',
    })
    expect(entry.strategyVersion).toBe(3)
  })
})
