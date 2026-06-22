import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSerperPricePrefetches,
  resetHybridPriceIntelligenceState,
  runHybridPriceIntelligence,
} from './serper-price-intelligence.js'

const logSearchFlowEvent = vi.hoisted(() => vi.fn())
const env = vi.hoisted(() => ({ values: {} }))

vi.mock('../server-helpers.js', async () => ({
  ...(await vi.importActual('../server-helpers.js')),
  logSearchFlowEvent,
}))

vi.mock('../search-data.js', async () => ({
  ...(await vi.importActual('../search-data.js')),
  getEnv: vi.fn((name) => env.values[name]),
}))

function candidate(overrides = {}) {
  return {
    id: 'B0TEST',
    title: 'Sony WH-1000XM5 Wireless Headphones Black',
    numericPrice: 399.99,
    price: '$399.99',
    source: 'Amazon',
    link: 'https://www.amazon.ca/dp/B0TEST',
    ...overrides,
  }
}

function serperOffer(overrides = {}) {
  return {
    provider: 'serper',
    retailer: 'Best Buy',
    price: 349.99,
    currency: 'CAD',
    url: 'https://www.google.com/search?shopping=sony',
    title: 'Sony WH-1000XM5 Wireless Headphones Black',
    ...overrides,
  }
}

function shoppingOffer(overrides = {}) {
  return {
    provider: 'serpapi',
    product_id: 'shopping-1',
    provider_offer_id: 'shopping-1',
    retailer: 'Best Buy',
    price: 349.99,
    currency: 'CAD',
    url: 'https://www.google.com/shopping/product/1',
    title: 'Sony WH-1000XM5 Wireless Headphones Black',
    immersive_url: 'https://serpapi.com/search.json?engine=google_immersive_product&page_token=x',
    ...overrides,
  }
}

function storeOffer(overrides = {}) {
  return {
    provider: 'serpapi',
    retailer: 'Best Buy',
    price: 349.99,
    currency: 'CAD',
    url: 'https://www.bestbuy.ca/en-ca/product/sony-wh-1000xm5/1',
    title: 'Sony WH-1000XM5 Wireless Headphones Black',
    condition: null,
    ...overrides,
  }
}

function enrichment(overrides = {}) {
  return {
    candidate_id: 'B0TEST',
    source_title: 'Sony WH-1000XM5 Wireless Headphones Black',
    display_title: 'Sony WH-1000XM5 Headphones',
    match_identifier: {
      brand: 'Sony',
      model_number: 'WH-1000XM5',
      product_type: 'wireless headphones',
      attributes: { color: 'Black' },
    },
    ...overrides,
  }
}

function enableHybrid(mode = 'surface') {
  env.values.HYBRID_PRICE_INTEL_MODE = mode
  env.values.SERPER_API_KEY = 'serper-key'
  env.values.SERPAPI_API_KEY = 'serpapi-key'
  env.values.CLAUDE_API_KEY = 'claude-key'
  env.values.PRICE_INTEL_ALLOWED_DOMAINS_CA = 'bestbuy.ca,walmart.ca'
  env.values.PRICE_INTEL_ALLOWED_DOMAINS_US = 'bestbuy.com,walmart.com'
  env.values.PRICE_INTEL_SURFACE_PERCENT = '100'
}

function prefetch(overrides = {}) {
  return {
    candidateId: 'B0TEST',
    candidate: candidate(),
    market: 'CA',
    amazonDomain: 'amazon.ca',
    allowedDomains: ['bestbuy.ca', 'walmart.ca'],
    promise: Promise.resolve({ ok: true, offers: [serperOffer()] }),
    ...overrides,
  }
}

function successfulDeps(overrides = {}) {
  const directStore = storeOffer()
  return {
    anthropicApiKey: 'claude-key',
    serpApiKey: 'serpapi-key',
    searchShopping: vi.fn().mockResolvedValue([shoppingOffer()]),
    fetchImmersive: vi.fn().mockResolvedValue({
      title: 'Sony WH-1000XM5 Wireless Headphones Black',
      brand: 'Sony',
      variants: [{ title: 'Color', items: [{ name: 'Black', selected: true, available: true }] }],
      stores: [directStore],
    }),
    judgeMatches: vi.fn().mockResolvedValue({
      model: 'haiku',
      usage: { inputTokens: 10, outputTokens: 4 },
      matches: [{
        offer_index: 0,
        confidence: 0.96,
        offer: directStore,
        savings: 50,
        savings_percent: 0.125,
      }],
    }),
    validateLink: vi.fn().mockResolvedValue({
      ok: true,
      reason: 'verified',
      finalUrl: directStore.url,
      redirects: [],
    }),
    readCache: vi.fn().mockResolvedValue(null),
    writeCache: vi.fn().mockResolvedValue(undefined),
    takeToken: vi.fn().mockResolvedValue({ allowed: true, resetAt: Date.now() + 60_000 }),
    ...overrides,
  }
}

describe('hybrid price intelligence', () => {
  beforeEach(() => {
    env.values = {}
    logSearchFlowEvent.mockReset()
    resetHybridPriceIntelligenceState()
  })

  it('prefetches Serper for the hero only when the complete hybrid configuration exists', async () => {
    enableHybrid('shadow')
    const searchOffers = vi.fn().mockResolvedValue([serperOffer()])
    const prefetches = createSerperPricePrefetches({
      candidates: [candidate({ id: 'hero', numericPrice: 150 }), candidate({ id: 'second', numericPrice: 500 })],
      selectedCandidateIds: ['hero', 'second'],
      amazonDomain: 'amazon.ca',
      searchOffers,
      readCache: vi.fn().mockResolvedValue(null),
      writeCache: vi.fn(),
      takeToken: vi.fn().mockResolvedValue({ allowed: true }),
    })

    expect(prefetches.map((entry) => entry.candidateId)).toEqual(['hero'])
    await expect(prefetches[0].promise).resolves.toEqual({ ok: true, offers: [serperOffer()], cache: 'miss' })
    expect(searchOffers).toHaveBeenCalledTimes(1)
  })

  it('does not let the retired Serper-only flag start automatic work', () => {
    env.values.SERPER_PRICE_INTEL_ENABLED = 'true'
    env.values.SERPER_API_KEY = 'serper-key'
    expect(createSerperPricePrefetches({
      candidates: [candidate()], selectedCandidateIds: ['B0TEST'], amazonDomain: 'amazon.ca',
    })).toEqual([])
  })

  it('skips when the market allowlist is missing', () => {
    enableHybrid('shadow')
    delete env.values.PRICE_INTEL_ALLOWED_DOMAINS_CA
    expect(createSerperPricePrefetches({
      candidates: [candidate()], selectedCandidateIds: ['B0TEST'], amazonDomain: 'amazon.ca',
    })).toEqual([])
  })

  it('verifies through Shopping and Immersive Product before surfacing', async () => {
    enableHybrid('surface')
    const deps = successfulDeps()
    const result = await runHybridPriceIntelligence({
      prefetches: [prefetch()],
      enrichmentEntries: [enrichment()],
      discoveryToken: 'surface-token',
      ...deps,
    })

    expect(deps.searchShopping).toHaveBeenCalledTimes(1)
    expect(deps.fetchImmersive).toHaveBeenCalledTimes(1)
    expect(deps.judgeMatches).toHaveBeenCalledTimes(1)
    expect(deps.validateLink).toHaveBeenCalledWith(expect.stringContaining('bestbuy.ca'), expect.objectContaining({
      allowedDomains: ['bestbuy.ca', 'walmart.ca'],
    }))
    expect(result.shouldSurface).toBe(true)
    expect(result.results).toEqual([expect.objectContaining({
      candidate_id: 'B0TEST',
      retailer: 'Best Buy',
      price: 349.99,
      currency: 'CAD',
      savings: 50,
      url: expect.stringContaining('bestbuy.ca'),
    })])
  })

  it('keeps verified results measurement-only in shadow mode', async () => {
    enableHybrid('shadow')
    const result = await runHybridPriceIntelligence({
      prefetches: [prefetch()], enrichmentEntries: [enrichment()], discoveryToken: 'shadow-token', ...successfulDeps(),
    })
    expect(result.results).toEqual([])
    expect(result.shadowResults).toHaveLength(1)
    expect(result.shouldSurface).toBe(false)
  })

  it('supports the US marketplace with USD and its separate retailer allowlist', async () => {
    enableHybrid('surface')
    const usStore = storeOffer({
      price: 349.99,
      currency: 'USD',
      url: 'https://www.bestbuy.com/site/sony-wh-1000xm5/1.p',
    })
    const result = await runHybridPriceIntelligence({
      prefetches: [prefetch({
        market: 'US',
        amazonDomain: 'amazon.com',
        allowedDomains: ['bestbuy.com', 'walmart.com'],
        candidate: candidate({ numericPrice: 399.99, link: 'https://www.amazon.com/dp/B0TEST' }),
        promise: Promise.resolve({ ok: true, offers: [serperOffer({ currency: 'USD' })] }),
      })],
      enrichmentEntries: [enrichment()],
      discoveryToken: 'us-token',
      ...successfulDeps({
        fetchImmersive: vi.fn().mockResolvedValue({
          title: shoppingOffer().title,
          variants: [{ title: 'Color', items: [{ name: 'Black', selected: true, available: true }] }],
          stores: [usStore],
        }),
        judgeMatches: vi.fn().mockResolvedValue({
          model: 'haiku', usage: null, matches: [{ offer_index: 0, confidence: 0.95, offer: usStore }],
        }),
        validateLink: vi.fn().mockResolvedValue({ ok: true, finalUrl: usStore.url, redirects: [] }),
      }),
    })
    expect(result.results[0]).toEqual(expect.objectContaining({ currency: 'USD', url: expect.stringContaining('bestbuy.com') }))
  })

  it('does not spend an Immersive call when Shopping product identity is ambiguous', async () => {
    enableHybrid('surface')
    const fetchImmersive = vi.fn()
    const same = shoppingOffer()
    const result = await runHybridPriceIntelligence({
      prefetches: [prefetch()],
      enrichmentEntries: [enrichment()],
      discoveryToken: 'ambiguous-token',
      ...successfulDeps({
        searchShopping: vi.fn().mockResolvedValue([same, { ...same, product_id: 'shopping-2', immersive_url: 'https://serpapi.com/two' }]),
        fetchImmersive,
      }),
    })
    expect(fetchImmersive).not.toHaveBeenCalled()
    expect(result.results).toEqual([])
  })

  it('rejects a generic AirPods result that does not prove ANC', async () => {
    enableHybrid('surface')
    const airPodsCandidate = candidate({
      title: 'Apple AirPods 4 with Active Noise Cancellation', numericPrice: 209,
    })
    const airPodsStore = storeOffer({
      retailer: 'Walmart', price: 136.98, url: 'https://www.walmart.ca/airpods',
      title: 'Apple AirPods 4th Generation In-Ear True Wireless Earbuds',
    })
    const judgeMatches = vi.fn()
    const result = await runHybridPriceIntelligence({
      prefetches: [prefetch({
        candidate: airPodsCandidate,
        promise: Promise.resolve({ ok: true, offers: [serperOffer({ retailer: 'Walmart', price: 136.98, title: airPodsStore.title })] }),
      })],
      enrichmentEntries: [enrichment({
        source_title: airPodsCandidate.title,
        display_title: airPodsCandidate.title,
        match_identifier: { brand: 'Apple', product_type: 'wireless earbuds', attributes: { generation: 'AirPods 4' } },
      })],
      discoveryToken: 'airpods-token',
      ...successfulDeps({
        searchShopping: vi.fn().mockResolvedValue([shoppingOffer({ title: 'Apple AirPods 4', retailer: 'Walmart' })]),
        fetchImmersive: vi.fn().mockResolvedValue({ title: 'Apple AirPods 4', variants: [], stores: [airPodsStore] }),
        judgeMatches,
      }),
    })
    expect(judgeMatches).not.toHaveBeenCalled()
    expect(result.shadowResults).toEqual([])
  })

  it('rejects marketplace-labelled stores before model judgment', async () => {
    enableHybrid('surface')
    const judgeMatches = vi.fn()
    const result = await runHybridPriceIntelligence({
      prefetches: [prefetch()],
      enrichmentEntries: [enrichment()],
      discoveryToken: 'marketplace-token',
      ...successfulDeps({
        fetchImmersive: vi.fn().mockResolvedValue({
          title: shoppingOffer().title,
          variants: [],
          stores: [storeOffer({ retailer: 'Best Buy Marketplace' })],
        }),
        judgeMatches,
      }),
    })
    expect(judgeMatches).not.toHaveBeenCalled()
    expect(result.results).toEqual([])
  })

  it('fails closed when direct-link validation fails', async () => {
    enableHybrid('surface')
    const result = await runHybridPriceIntelligence({
      prefetches: [prefetch()], enrichmentEntries: [enrichment()], discoveryToken: 'bad-link-token',
      ...successfulDeps({ validateLink: vi.fn().mockResolvedValue({ ok: false, reason: 'probe_status', finalUrl: '' }) }),
    })
    expect(result.results).toEqual([])
    expect(result.shadowResults).toEqual([])
  })

  it('stops before Immersive Product when the second SerpApi call exceeds budget', async () => {
    enableHybrid('surface')
    const takeToken = vi.fn()
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false })
    const fetchImmersive = vi.fn()
    const result = await runHybridPriceIntelligence({
      prefetches: [prefetch()], enrichmentEntries: [enrichment()], discoveryToken: 'budget-token',
      ...successfulDeps({ takeToken, fetchImmersive }),
    })
    expect(fetchImmersive).not.toHaveBeenCalled()
    expect(result.completed).toBe(false)
    expect(result.results).toEqual([])
  })
})
