import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSerperPricePrefetches,
  runSerperPriceIntelligence,
} from './serper-price-intelligence.js'

const logSearchFlowEvent = vi.hoisted(() => vi.fn())
const env = vi.hoisted(() => ({ values: {} }))

vi.mock('../server-helpers.js', async () => {
  const actual = await vi.importActual('../server-helpers.js')
  return {
    ...actual,
    logSearchFlowEvent,
  }
})

vi.mock('../search-data.js', async () => {
  const actual = await vi.importActual('../search-data.js')
  return {
    ...actual,
    getEnv: vi.fn((name) => env.values[name]),
  }
})

function candidate(overrides = {}) {
  return {
    id: 'B0TEST',
    title: 'Sony WH-1000XM5 Wireless Headphones',
    numericPrice: 399.99,
    price: '$399.99',
    ...overrides,
  }
}

function offer(overrides = {}) {
  return {
    provider: 'serper',
    retailer: 'Best Buy',
    price: 349.99,
    currency: 'CAD',
    url: 'https://retailer.example/sony',
    title: 'Sony WH-1000XM5 Wireless Headphones',
    ...overrides,
  }
}

describe('Serper price intelligence orchestration', () => {
  beforeEach(() => {
    logSearchFlowEvent.mockReset()
    env.values = {}
  })

  it('creates Serper prefetches only for selected products above the threshold', async () => {
    env.values.SERPER_PRICE_INTEL_ENABLED = 'true'
    env.values.SERPER_API_KEY = 'serper-key'
    const searchOffers = vi.fn().mockResolvedValue([offer()])
    const readCache = vi.fn().mockResolvedValue(null)
    const writeCache = vi.fn().mockResolvedValue(undefined)
    const takeToken = vi.fn().mockResolvedValue({ allowed: true, resetAt: Date.now() + 60_000 })

    const prefetches = createSerperPricePrefetches({
      candidates: [
        candidate({ id: 'cheap', numericPrice: 50 }),
        candidate({ id: 'selected', numericPrice: 150 }),
        candidate({ id: 'unselected', numericPrice: 500 }),
      ],
      selectedCandidateIds: ['cheap', 'selected'],
      amazonDomain: 'amazon.ca',
      searchOffers,
      readCache,
      writeCache,
      takeToken,
    })

    expect(prefetches.map((entry) => entry.candidateId)).toEqual(['selected'])
    await expect(prefetches[0].promise).resolves.toEqual({ ok: true, offers: [offer()], cache: 'miss' })
    expect(searchOffers).toHaveBeenCalledWith('Sony WH-1000XM5 Wireless Headphones', 'CA', { apiKey: 'serper-key' })
    expect(writeCache).toHaveBeenCalledTimes(1)
  })

  it('uses cached Serper results without spending a background rate token', async () => {
    env.values.SERPER_PRICE_INTEL_ENABLED = 'true'
    env.values.SERPER_API_KEY = 'serper-key'
    const searchOffers = vi.fn()
    const takeToken = vi.fn()
    const readCache = vi.fn().mockResolvedValue({
      offers: [offer()],
      priceExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    })

    const [prefetch] = createSerperPricePrefetches({
      candidates: [candidate({ numericPrice: 150 })],
      selectedCandidateIds: ['B0TEST'],
      amazonDomain: 'amazon.ca',
      searchOffers,
      readCache,
      writeCache: vi.fn(),
      takeToken,
    })

    await expect(prefetch.promise).resolves.toEqual({ ok: true, offers: [offer()], cache: 'hit' })
    expect(searchOffers).not.toHaveBeenCalled()
    expect(takeToken).not.toHaveBeenCalled()
  })

  it('enforces a narrow background rate bucket before live Serper calls', async () => {
    env.values.SERPER_PRICE_INTEL_ENABLED = 'true'
    env.values.SERPER_API_KEY = 'serper-key'
    const searchOffers = vi.fn()

    const [prefetch] = createSerperPricePrefetches({
      candidates: [candidate({ numericPrice: 150 })],
      selectedCandidateIds: ['B0TEST'],
      amazonDomain: 'amazon.ca',
      searchOffers,
      readCache: vi.fn().mockResolvedValue(null),
      writeCache: vi.fn(),
      takeToken: vi.fn().mockResolvedValue({ allowed: false, resetAt: Date.now() + 1000 }),
    })

    await expect(prefetch.promise).resolves.toEqual({ ok: false, offers: [], error: 'background_rate_limited' })
    expect(searchOffers).not.toHaveBeenCalled()
  })

  it('skips prefetches when Serper is not configured', () => {
    env.values.SERPER_PRICE_INTEL_ENABLED = 'true'
    expect(createSerperPricePrefetches({
      candidates: [candidate()],
      selectedCandidateIds: ['B0TEST'],
      amazonDomain: 'amazon.ca',
    })).toEqual([])
  })

  it('skips prefetches unless Serper price intelligence is explicitly enabled', () => {
    env.values.SERPER_API_KEY = 'serper-key'

    expect(createSerperPricePrefetches({
      candidates: [candidate()],
      selectedCandidateIds: ['B0TEST'],
      amazonDomain: 'amazon.ca',
    })).toEqual([])
  })

  it('runs match judgment after enrichment and returns surfaced price results', async () => {
    const prefetches = [{
      candidateId: 'B0TEST',
      candidate: candidate(),
      market: 'CA',
      promise: Promise.resolve({ ok: true, offers: [offer()] }),
    }]
    const judgeMatches = vi.fn().mockResolvedValue({
      model: 'claude-haiku-4-5-20251001',
      usage: { inputTokens: 10, outputTokens: 4 },
      matches: [{
        offer_index: 0,
        confidence: 0.93,
        offer: offer(),
        savings: 50,
        savings_percent: 0.125,
      }],
    })

    const result = await runSerperPriceIntelligence({
      prefetches,
      anthropicApiKey: 'claude-key',
      enrichmentEntries: [{
        candidate_id: 'B0TEST',
        display_title: 'Sony WH-1000XM5 Headphones',
        match_identifier: {
          brand: 'Sony',
          model_number: 'WH-1000XM5',
          product_type: 'wireless headphones',
          attributes: {},
        },
      }],
      judgeMatches,
      readCache: vi.fn().mockResolvedValue(null),
      writeCache: vi.fn(),
    })

    expect(judgeMatches).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'claude-key',
      product: expect.objectContaining({
        candidate_id: 'B0TEST',
        display_title: 'Sony WH-1000XM5 Headphones',
        price: 399.99,
        currency: 'CAD',
      }),
      offers: [offer()],
    }))
    expect(result).toEqual({
      completed: true,
      model: 'claude-haiku-4-5-20251001',
      usage: [{ inputTokens: 10, outputTokens: 4 }],
      results: [{
        candidate_id: 'B0TEST',
        retailer: 'Best Buy',
        price: 349.99,
        currency: 'CAD',
        savings: 50,
        savings_percent: 0.125,
        url: 'https://retailer.example/sony',
        confidence: 0.93,
        disclaimer: 'Prices are approximate. Verify the product matches before purchasing.',
      }],
    })
  })

  it('filters mismatched currency offers before match judgment', async () => {
    const judgeMatches = vi.fn()
    const result = await runSerperPriceIntelligence({
      prefetches: [{
        candidateId: 'B0TEST',
        candidate: candidate(),
        market: 'CA',
        promise: Promise.resolve({ ok: true, offers: [offer({ currency: 'USD', price: 250 })] }),
      }],
      anthropicApiKey: 'claude-key',
      enrichmentEntries: [{
        candidate_id: 'B0TEST',
        display_title: 'Sony WH-1000XM5 Headphones',
        match_identifier: {
          brand: 'Sony',
          model_number: 'WH-1000XM5',
          product_type: 'wireless headphones',
          attributes: {},
        },
      }],
      judgeMatches,
      readCache: vi.fn().mockResolvedValue(null),
      writeCache: vi.fn(),
    })

    expect(judgeMatches).not.toHaveBeenCalled()
    expect(result.completed).toBe(true)
    expect(result.results).toEqual([])
  })

  it('continues when one product judgment fails', async () => {
    const judgeMatches = vi.fn()
      .mockRejectedValueOnce(new Error('model timeout'))
      .mockResolvedValueOnce({
        model: 'claude-haiku-4-5-20251001',
        usage: null,
        matches: [{
          offer_index: 0,
          confidence: 0.93,
          offer: offer(),
          savings: 50,
          savings_percent: 0.125,
        }],
      })

    const result = await runSerperPriceIntelligence({
      prefetches: [
        {
          candidateId: 'first',
          candidate: candidate({ id: 'first' }),
          market: 'CA',
          promise: Promise.resolve({ ok: true, offers: [offer()] }),
        },
        {
          candidateId: 'second',
          candidate: candidate({ id: 'second' }),
          market: 'CA',
          promise: Promise.resolve({ ok: true, offers: [offer()] }),
        },
      ],
      anthropicApiKey: 'claude-key',
      enrichmentEntries: [
        { candidate_id: 'first', display_title: 'Sony WH-1000XM5', match_identifier: { attributes: {} } },
        { candidate_id: 'second', display_title: 'Sony WH-1000XM5', match_identifier: { attributes: {} } },
      ],
      judgeMatches,
      readCache: vi.fn().mockResolvedValue(null),
      writeCache: vi.fn(),
    })

    expect(result.completed).toBe(true)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].candidate_id).toBe('second')
  })

  it('fails silent when there is no enrichment entry for the prefetched product', async () => {
    const result = await runSerperPriceIntelligence({
      prefetches: [{
        candidateId: 'B0TEST',
        candidate: candidate(),
        market: 'CA',
        promise: Promise.resolve({ ok: true, offers: [offer()] }),
      }],
      anthropicApiKey: 'claude-key',
      enrichmentEntries: [],
      judgeMatches: vi.fn(),
      readCache: vi.fn().mockResolvedValue(null),
      writeCache: vi.fn(),
    })

    expect(result.completed).toBe(true)
    expect(result.results).toEqual([])
  })

  it('uses cached match judgments without calling Haiku', async () => {
    const judgeMatches = vi.fn()
    const cachedMatch = [{
      offer_index: 0,
      confidence: 0.91,
      offer: offer(),
      savings: 50,
      savings_percent: 0.125,
    }]
    const readCache = vi.fn().mockResolvedValue({
      accepted: cachedMatch,
      matchExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      providerErrors: { model: 'cached-haiku', usage: { inputTokens: 1, outputTokens: 1 } },
    })

    const result = await runSerperPriceIntelligence({
      prefetches: [{
        candidateId: 'B0TEST',
        candidate: candidate(),
        market: 'CA',
        promise: Promise.resolve({ ok: true, offers: [offer()] }),
      }],
      anthropicApiKey: 'claude-key',
      enrichmentEntries: [{
        candidate_id: 'B0TEST',
        display_title: 'Sony WH-1000XM5 Headphones',
        match_identifier: {
          brand: 'Sony',
          model_number: 'WH-1000XM5',
          product_type: 'wireless headphones',
          attributes: {},
        },
      }],
      judgeMatches,
      readCache,
      writeCache: vi.fn(),
    })

    expect(judgeMatches).not.toHaveBeenCalled()
    expect(result.model).toBe('cached-haiku')
    expect(result.results).toHaveLength(1)
  })
})
