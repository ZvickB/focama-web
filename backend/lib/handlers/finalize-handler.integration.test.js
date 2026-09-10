import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchAmazonProductDetailsByAsin: vi.fn(),
  getEnv: vi.fn(),
  haikuLockWinnersAndBadges: vi.fn(),
  readProductDetailsCacheEntries: vi.fn(),
  recordSearchDiagnosticEvent: vi.fn(),
  reportBackendError: vi.fn(),
  resolveFinalizeRequestContext: vi.fn(),
  runDeepDiveEligibilityAsync: vi.fn(),
  runMiniEnrichmentAsync: vi.fn(),
  takeRateLimitToken: vi.fn(),
  writeProductDetailsCacheEntries: vi.fn(),
  writeSearchSnapshot: vi.fn(),
}))

vi.mock('../ai-selector.js', async () => ({
  ...(await vi.importActual('../ai-selector.js')),
  lockWinnersAndBadges: mocks.haikuLockWinnersAndBadges,
}))

vi.mock('../rate-limit.js', () => ({
  DEFAULT_RATE_LIMIT_CONFIG: { limit: 50, windowMs: 10_000 },
  getClientIpAddress: (headers) => headers['x-forwarded-for'] || 'anonymous',
  takeRateLimitToken: mocks.takeRateLimitToken,
}))

vi.mock('../search-data.js', async () => ({
  ...(await vi.importActual('../search-data.js')),
  getEnv: mocks.getEnv,
}))

vi.mock('../search-pipeline.js', () => ({ writeSearchSnapshot: mocks.writeSearchSnapshot }))
vi.mock('../search-storage.js', () => ({
  readProductDetailsCacheEntries: mocks.readProductDetailsCacheEntries,
  recordSearchDiagnosticEvent: mocks.recordSearchDiagnosticEvent,
  writeProductDetailsCacheEntries: mocks.writeProductDetailsCacheEntries,
}))
vi.mock('../product-details-provider.js', () => ({
  fetchAmazonProductDetailsByAsin: mocks.fetchAmazonProductDetailsByAsin,
}))
vi.mock('../observability.js', () => ({ reportBackendError: mocks.reportBackendError }))
vi.mock('./finalize-context.js', () => ({
  resolveFinalizeRequestContext: mocks.resolveFinalizeRequestContext,
}))
vi.mock('./enrichment-handler.js', () => ({
  mergeProductDetailsIntoCandidatePool: (candidatePool) => candidatePool,
  runDeepDiveEligibilityAsync: mocks.runDeepDiveEligibilityAsync,
  runMiniEnrichmentAsync: mocks.runMiniEnrichmentAsync,
}))

import { handleFinalizeSelection } from './finalize-handler.js'

function candidate(id, overrides = {}) {
  return {
    id,
    title: `Candidate ${id}`,
    description: 'Useful product',
    source: 'Amazon',
    price: '$49.99',
    numericPrice: 49.99,
    rating: 4.5,
    reviewCount: 120,
    image: 'https://example.com/item.jpg',
    link: `https://amazon.com/dp/${id}`,
    matchSignals: {
      titleMatches: 1,
      supportMatches: 1,
      detailMatches: 1,
      exactMatchSearchState: true,
      hasMultipleSources: false,
      hasDeliveryInfo: false,
      hasPrimeDelivery: false,
      hasTag: false,
    },
    ...overrides,
  }
}

function request(body, ip = '203.0.113.70') {
  const serialized = JSON.stringify(body)
  return {
    headers: { 'x-forwarded-for': ip },
    on(event, callback) {
      if (event === 'data') callback(serialized)
      if (event === 'end') callback()
    },
  }
}

function responseRecorder() {
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

function setCandidatePool(candidates, { query = 'stroller', details = '' } = {}) {
  mocks.resolveFinalizeRequestContext.mockImplementation(({ body }) => ({
    isValid: true,
    candidatePool: {
      query,
      details,
      combinedSearchText: query,
      searchState: 'Results for exact spelling',
      similarQueries: [],
      candidates,
    },
    discoveryContext: {
      amazonDomain: 'amazon.com',
      discoveryToken: body.discoveryToken,
      isValid: true,
      normalizedQuery: query,
      requestMode: body.requestMode || 'guided_finalize',
    },
    resolvedDiscoveryContext: {
      cachedEntry: { selection: { mode: 'discovery_preview' } },
      discoveryScope: 'guided_discovery_session:token-1',
      isValid: true,
    },
  }))
}

async function finalize(overrides = {}) {
  const response = responseRecorder()
  await handleFinalizeSelection(request({
    query: 'stroller',
    discoveryToken: 'token-1',
    ...overrides,
  }), response)
  return { payload: JSON.parse(response.body), response }
}

describe('finalize pipeline integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getEnv.mockImplementation((name) => ({
      CLAUDE_API_KEY: 'claude-key',
      OPENAI_API_KEY: 'openai-key',
    })[name] || '')
    mocks.takeRateLimitToken.mockResolvedValue({ allowed: true })
    mocks.writeSearchSnapshot.mockResolvedValue(undefined)
    mocks.fetchAmazonProductDetailsByAsin.mockResolvedValue(new Map())
    mocks.runMiniEnrichmentAsync.mockResolvedValue(undefined)
    mocks.runDeepDiveEligibilityAsync.mockResolvedValue(undefined)
  })

  it('returns only the AI frontier, promotes its reserves, and never pads from raw candidates', async () => {
    setCandidatePool(['one', 'two', 'three', 'four', 'five', 'six', 'raw'].map((id) => candidate(id)))
    mocks.haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku',
      lockedIds: ['one', 'two', 'three', 'four', 'five', 'six'],
      coreIds: ['one', 'two', 'three', 'four'],
      alternativeIds: ['five', 'six'],
      usage: null,
    })

    const { payload, response } = await finalize()

    expect(response.statusCode).toBe(200)
    expect(payload.results.map((item) => item.id)).toEqual(['one', 'two', 'three', 'four', 'five', 'six'])
    expect(payload.selection.strategy).toBe('haiku_lock_reserve_promoted')
    expect(payload.results.some((item) => item.id === 'raw')).toBe(false)
    expect(mocks.haikuLockWinnersAndBadges).toHaveBeenCalledWith(expect.objectContaining({
      openAiApiKey: 'openai-key',
      claudeApiKey: 'claude-key',
      model: 'gpt-5.6-terra',
    }))
  })

  it('returns an honest partial shortlist when invalid AI ids leave too few picks', async () => {
    setCandidatePool(['one', 'two', 'raw'].map((id) => candidate(id)))
    mocks.haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku',
      lockedIds: ['one', 'missing', 'one', 'two'],
      usage: null,
    })

    const { payload } = await finalize()

    expect(payload.results.map((item) => item.id)).toEqual(['one', 'two'])
    expect(payload.selection.strategy).toBe('haiku_lock_partial')
  })

  it('returns no products when the AI returns an empty selection', async () => {
    setCandidatePool([candidate('one'), candidate('two')])
    mocks.haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku',
      lockedIds: [],
      usage: null,
    })

    const { payload, response } = await finalize()

    expect(response.statusCode).toBe(200)
    expect(payload.results).toEqual([])
    expect(payload.selection.strategy).toBe('haiku_lock_empty')
  })

  it('returns the stable finalize error when the AI provider throws', async () => {
    setCandidatePool([candidate('one')])
    mocks.haikuLockWinnersAndBadges.mockRejectedValue(new Error('provider unavailable'))

    const { payload, response } = await finalize()

    expect(response.statusCode).toBe(500)
    expect(payload.error).toBe('Unable to finalize the product selection.')
    expect(mocks.writeSearchSnapshot).not.toHaveBeenCalled()
  })

  it('narrows a Prime-required search when Prime candidates exist', async () => {
    setCandidatePool([
      candidate('regular'),
      candidate('prime', { isPrime: true, delivery: 'Prime delivery' }),
    ], { query: 'stroller with Prime delivery' })
    mocks.haikuLockWinnersAndBadges.mockResolvedValue({ model: 'claude-haiku', lockedIds: ['prime'], usage: null })

    const { payload } = await finalize({ query: 'stroller with Prime delivery' })

    expect(mocks.haikuLockWinnersAndBadges).toHaveBeenCalledWith(expect.objectContaining({
      candidatePool: expect.objectContaining({ candidates: [expect.objectContaining({ id: 'prime' })] }),
    }))
    expect(payload.results.map((item) => item.id)).toEqual(['prime'])
  })

  it('keeps the broader eligible pool when a Prime-required search has zero Prime candidates', async () => {
    setCandidatePool([candidate('one'), candidate('two')], { query: 'stroller with Prime delivery' })
    mocks.haikuLockWinnersAndBadges.mockResolvedValue({ model: 'claude-haiku', lockedIds: ['two'], usage: null })

    await finalize({ query: 'stroller with Prime delivery' })

    expect(mocks.haikuLockWinnersAndBadges).toHaveBeenCalledWith(expect.objectContaining({
      candidatePool: expect.objectContaining({
        candidates: [expect.objectContaining({ id: 'one' }), expect.objectContaining({ id: 'two' })],
      }),
    }))
  })

  it('implements lowest-price ranking across the complete AI fit frontier', async () => {
    setCandidatePool([
      candidate('p90', { numericPrice: 90, price: '$90' }),
      candidate('p20', { numericPrice: 20, price: '$20' }),
      candidate('p70', { numericPrice: 70, price: '$70' }),
      candidate('p10', { numericPrice: 10, price: '$10' }),
      candidate('p60', { numericPrice: 60, price: '$60' }),
      candidate('p30', { numericPrice: 30, price: '$30' }),
      candidate('p50', { numericPrice: 50, price: '$50' }),
    ])
    mocks.haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku',
      lockedIds: ['p90', 'p20', 'p70', 'p10', 'p60', 'p30', 'p50'],
      coreIds: ['p90', 'p20', 'p70', 'p10', 'p60', 'p30', 'p50'],
      usage: null,
    })

    const { payload } = await finalize({ rankingPreference: 'lowest_price' })

    expect(payload.results.map((item) => item.id)).toEqual(['p10', 'p20', 'p30', 'p50', 'p60', 'p70'])
    expect(mocks.haikuLockWinnersAndBadges).toHaveBeenCalledWith(expect.objectContaining({
      finalResultLimit: 7,
      rankingPreference: 'balanced',
    }))
  })

  it('filters provable over-budget products before selection and keeps the real stroller reserve', async () => {
    const eligibleIds = ['budget-one', 'budget-two', 'budget-three', 'budget-four', 'budget-five']
    const reserveId = 'B0D2LXK44T'
    setCandidatePool([
      candidate('B07HML1BT5', { title: 'Doona Car Seat & Stroller', numericPrice: 550, price: '$550' }),
      ...eligibleIds.map((id, index) => candidate(id, { numericPrice: 80 + index * 20, price: `$${80 + index * 20}` })),
      candidate(reserveId, { title: 'Graco Ready2Jet Compact Stroller', numericPrice: 189.99, price: '$189.99' }),
    ], { query: 'travel stroller', details: 'under $200 and compact' })
    mocks.haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku',
      lockedIds: [...eligibleIds, reserveId],
      coreIds: eligibleIds,
      alternativeIds: [reserveId],
      usage: null,
    })

    const { payload } = await finalize({ followUpNotes: 'under $200 and compact' })
    const sentIds = mocks.haikuLockWinnersAndBadges.mock.calls[0][0].candidatePool.candidates.map((item) => item.id)

    expect(sentIds).not.toContain('B07HML1BT5')
    expect(payload.results.map((item) => item.id)).toEqual([...eligibleIds, reserveId])
  })

  it('filters renewed and open-box listings unless the shopper explicitly permits them', async () => {
    setCandidatePool([
      candidate('new'),
      candidate('renewed', { title: 'Console Renewed' }),
      candidate('open-box', { title: 'Open-box console' }),
    ], { query: 'game console' })
    mocks.haikuLockWinnersAndBadges.mockResolvedValue({ model: 'claude-haiku', lockedIds: ['new'], usage: null })

    await finalize({ query: 'game console' })
    expect(mocks.haikuLockWinnersAndBadges.mock.calls[0][0].candidatePool.candidates.map((item) => item.id)).toEqual(['new'])

    setCandidatePool([candidate('renewed', { title: 'Console Renewed' })], { query: 'renewed game console' })
    mocks.haikuLockWinnersAndBadges.mockResolvedValue({ model: 'claude-haiku', lockedIds: ['renewed'], usage: null })
    await finalize({ query: 'renewed game console' })
    expect(mocks.haikuLockWinnersAndBadges.mock.calls[1][0].candidatePool.candidates.map((item) => item.id)).toEqual(['renewed'])
  })

  it('persists once and starts enrichment only for the final displayed ids', async () => {
    setCandidatePool(['one', 'two', 'raw'].map((id) => candidate(id)))
    mocks.haikuLockWinnersAndBadges.mockResolvedValue({ model: 'claude-haiku', lockedIds: ['two', 'one'], usage: null })

    await finalize()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.writeSearchSnapshot).toHaveBeenCalledTimes(1)
    expect(mocks.writeSearchSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      results: [expect.objectContaining({ id: 'two' }), expect.objectContaining({ id: 'one' })],
    }))
    expect(mocks.fetchAmazonProductDetailsByAsin).toHaveBeenCalledWith(expect.objectContaining({
      asins: ['two', 'one'],
    }))
    expect(mocks.runMiniEnrichmentAsync).toHaveBeenCalledWith(expect.objectContaining({
      lockedIds: ['two', 'one'],
      discoveryToken: 'token-1',
    }))
  })
})
