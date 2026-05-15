import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/ai-selector.js', async () => {
  const actual = await vi.importActual('./lib/ai-selector.js')

  return {
    ...actual,
    haikuLockWinnersAndBadges: vi.fn(),
    miniEnrichSelectedCandidates: vi.fn().mockResolvedValue({
      model: 'gpt-5-mini',
      enriched: [],
      enrichedIds: [],
      usage: null,
      preservedOrder: true,
    }),
  }
})

vi.mock('./lib/result-filter.js', async () => {
  const actual = await vi.importActual('./lib/result-filter.js')

  return {
    ...actual,
    getFilteredSearchArtifacts: vi.fn(),
  }
})

vi.mock('./lib/retry-advice.js', async () => {
  const actual = await vi.importActual('./lib/retry-advice.js')

  return {
    ...actual,
    generateRetryAdvice: vi.fn(),
  }
})

vi.mock('./lib/query-quality-review.js', () => ({
  generateQueryQualityReview: vi.fn(),
}))

vi.mock('./lib/search-data.js', async () => {
  const actual = await vi.importActual('./lib/search-data.js')

  return {
    ...actual,
  SERPAPI_ENDPOINT: 'https://serpapi.com/search.json',
  buildCacheKey: vi.fn((productQuery, details, scope = 'default') =>
    scope === 'default' ? `${productQuery}|${details}` : `${scope}:${productQuery}|${details}`,
  ),
  buildQuery: vi.fn((productQuery, details) => [productQuery, details].filter(Boolean).join(' ').trim()),
  getEnv: vi.fn(),
  }
})

vi.mock('./lib/search-storage.js', () => ({
  getSupabaseHealth: vi.fn(),
  isSupabaseConfigured: vi.fn(() => false),
  readProductDetailsCacheEntries: vi.fn().mockResolvedValue(new Map()),
  readStoredSearchCacheEntry: vi.fn(),
  recordOxylabsProductFailures: vi.fn().mockResolvedValue(undefined),
  recordTesterFeedback: vi.fn().mockResolvedValue(undefined),
  recordSearchHistory: vi.fn(),
  writeProductDetailsCacheEntries: vi.fn().mockResolvedValue(undefined),
  writeStoredSearchCacheEntry: vi.fn(),
}))

import {
  createApiServer,
  handleCachedSearch,
  handleEnrichmentPoll,
  handleEnrichmentStream,
  handleFeedbackSubmission,
  handleFinalizeSelection,
  handleQueryQualityPoll,
  handleRainforestDiscoverySearch,
  handleRetryAdvice,
  handleSearchDebug,
  handleSupabaseHealth,
} from './server.js'
import { ALLOWED_ORIGIN } from './lib/http.js'
import { resetRateLimitStore } from './lib/rate-limit.js'
import { haikuLockWinnersAndBadges, miniEnrichSelectedCandidates } from './lib/ai-selector.js'
import { generateQueryQualityReview } from './lib/query-quality-review.js'
import { generateRetryAdvice } from './lib/retry-advice.js'
import { getFilteredSearchArtifacts } from './lib/result-filter.js'
import { getSupabaseHealth, readStoredSearchCacheEntry, recordTesterFeedback, writeStoredSearchCacheEntry } from './lib/search-storage.js'
import {
  getEnv,
} from './lib/search-data.js'

function createResponseRecorder() {
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
    flushHeaders() {},
    write(chunk = '') {
      this.body += chunk
    },
  }
}

function createFinalizeRequest(body, headers = {}) {
  return {
    headers,
    on(eventName, callback) {
      if (eventName === 'data') {
        if (body !== undefined && body !== null && body !== '') {
          callback(body)
        }
      }

      if (eventName === 'end') {
        callback()
      }
    },
  }
}

function createFinalizeCandidate(id) {
  return {
    id,
    title: `Candidate ${id}`,
    description: 'Helpful description',
    source: 'Example Store',
    price: '$49.99',
    numericPrice: 49.99,
    rating: 4.5,
    reviewCount: 120,
    reasons: ['Solid overall fit'],
    image: 'https://example.com/item.jpg',
    link: 'https://example.com/item',
    matchSignals: {
      titleMatches: 1,
      supportMatches: 1,
      detailMatches: 1,
      exactMatchSearchState: true,
      hasMultipleSources: true,
      hasDeliveryInfo: true,
      hasTag: false,
    },
  }
}

function createDiscoveryCacheEntry(
  query,
  candidates = [createFinalizeCandidate('one')],
  selection = { mode: 'discovery_preview' },
  discoveryToken = 'opaque-discovery-token',
) {
  return {
    cachedAt: '2026-03-17T12:00:00.000Z',
    candidatePool: {
      query,
      details: '',
      combinedSearchText: query,
      searchState: 'Results for exact spelling',
      similarQueries: query === 'stroller' ? ['compact stroller'] : [],
      candidates,
    },
    results: candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
    })),
    discoveryToken,
    selection,
    source: 'guided_discovery',
  }
}

function createFinalizeDiscoveryBody(overrides = {}) {
  return {
    query: 'stroller',
    discoveryToken: 'opaque-discovery-token',
    ...overrides,
  }
}

function mockFinalizeEnv(overrides = {}) {
  getEnv.mockImplementation((name) => ({
    OPENAI_API_KEY: 'openai-key',
    CLAUDE_API_KEY: 'claude-key',
    ...overrides,
  })[name] || '')
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

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

describe('server handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    resetRateLimitStore()
    haikuLockWinnersAndBadges.mockReset()
    generateQueryQualityReview.mockReset()
    getFilteredSearchArtifacts.mockReset()
    miniEnrichSelectedCandidates.mockReset()
    miniEnrichSelectedCandidates.mockResolvedValue({
      model: 'gpt-5-mini',
      enriched: [],
      enrichedIds: [],
      usage: null,
      preservedOrder: true,
    })
    generateQueryQualityReview.mockResolvedValue({
      classification: 'ok',
      suggestedQuery: '',
      confidence: 'high',
      reason: 'The returned pool matches the query.',
      shouldSuggest: false,
      usage: null,
      generatedAt: '2026-03-17T12:00:02.000Z',
    })
    readStoredSearchCacheEntry.mockResolvedValue(null)
  })

  it('returns cached search results and slices them to six items', async () => {
    readStoredSearchCacheEntry.mockResolvedValue({
      cachedAt: '2026-03-17T12:00:00.000Z',
      results: [
        { id: '1', price: '$10.00' },
        { id: '2', price: '$11.00' },
        { id: '3', price: '$12.00' },
        { id: '4', price: '$13.00' },
        { id: '5', price: '$14.00' },
        { id: '6', price: '$15.00' },
        { id: '7', price: '$16.00' },
      ],
    })

    const response = createResponseRecorder()

    await handleCachedSearch(new URL('http://localhost/api/search/cache?query=lego&details=for%20kids'), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      results: [
        { id: '1', price: '$10.00', badgeLabel: 'Best match' },
        { id: '2', price: '$11.00', badgeLabel: '' },
        { id: '3', price: '$12.00', badgeLabel: '' },
        { id: '4', price: '$13.00', badgeLabel: '' },
        { id: '5', price: '$14.00', badgeLabel: '' },
        { id: '6', price: '$15.00', badgeLabel: '' },
      ],
      source: 'cache',
      cachedAt: '2026-03-17T12:00:00.000Z',
    })
  })

  it('filters zero-priced cached preview results before returning them', async () => {
    readStoredSearchCacheEntry.mockResolvedValue({
      cachedAt: '2026-03-17T12:00:00.000Z',
      results: [
        { id: 'zero', title: 'Unavailable Listing', price: '$0.00' },
        { id: 'live', title: 'Travel Stroller', price: '$129.99' },
      ],
    })

    const response = createResponseRecorder()

    await handleCachedSearch(new URL('http://localhost/api/search/cache?query=stroller&details='), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      results: [
        { id: 'live', title: 'Travel Stroller', price: '$129.99', badgeLabel: 'Best match' },
      ],
      source: 'cache',
      cachedAt: '2026-03-17T12:00:00.000Z',
    })
  })

  it('filters missing-price cached preview results before returning them', async () => {
    readStoredSearchCacheEntry.mockResolvedValue({
      cachedAt: '2026-03-17T12:00:00.000Z',
      results: [
        { id: 'missing', title: 'No Price Listing' },
        { id: 'live', title: 'Travel Stroller', price: '$129.99' },
      ],
    })

    const response = createResponseRecorder()

    await handleCachedSearch(new URL('http://localhost/api/search/cache?query=stroller&details='), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      results: [
        { id: 'live', title: 'Travel Stroller', price: '$129.99', badgeLabel: 'Best match' },
      ],
      source: 'cache',
      cachedAt: '2026-03-17T12:00:00.000Z',
    })
  })





  it('returns retry advice for rejected final picks', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    generateRetryAdvice.mockResolvedValue({
      recommendation: 'new_search',
      suggestedQuery: 'compact city stroller under 18 pounds',
      rationale: 'The rejected picks were too bulky, so a narrower search should help.',
      usage: {
        totalTokens: 100,
      },
      generatedAt: '2026-04-24T12:00:00.000Z',
    })

    const response = createResponseRecorder()

    await handleRetryAdvice(
      createFinalizeRequest(
        JSON.stringify({
          query: 'stroller',
          followUpNotes: 'comfort matters most',
          rejectionFeedback: 'Still too bulky for city travel.',
          shortlist: [
            { title: 'Full-size stroller' },
            { title: 'Travel stroller' },
          ],
        }),
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(generateRetryAdvice).toHaveBeenCalledWith(
      expect.objectContaining({
        productQuery: 'stroller',
        followUpNotes: 'comfort matters most',
        rejectionFeedback: 'Still too bulky for city travel.',
        shortlist: [
          { title: 'Full-size stroller' },
          { title: 'Travel stroller' },
        ],
        apiKey: 'openai-key',
      }),
    )
    expect(JSON.parse(response.body)).toEqual({
      query: 'stroller',
      recommendation: 'new_search',
      suggestedQuery: 'compact city stroller under 18 pounds',
      rationale: 'The rejected picks were too bulky, so a narrower search should help.',
    })
  })

  it('rejects retry advice with empty feedback', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    const response = createResponseRecorder()

    await handleRetryAdvice(
      createFinalizeRequest(
        JSON.stringify({
          query: 'stroller',
          rejectionFeedback: '   ',
        }),
        { 'x-forwarded-for': '203.0.113.50' },
      ),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(generateRetryAdvice).not.toHaveBeenCalled()
    expect(JSON.parse(response.body)).toEqual({
      error: 'Tell us what felt off before trying again.',
    })
  })

  it('rejects retry advice with malformed JSON', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    const response = createResponseRecorder()

    await handleRetryAdvice(
      createFinalizeRequest('{ "query": "stroller",'),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(generateRetryAdvice).not.toHaveBeenCalled()
    expect(JSON.parse(response.body)).toEqual({
      error: 'Request body must be valid JSON.',
    })
  })

  it('rejects oversized retry advice bodies', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    const response = createResponseRecorder()

    await handleRetryAdvice(
      createFinalizeRequest(
        JSON.stringify({
          query: 'stroller',
          rejectionFeedback: 'Too bulky',
          extra: 'x'.repeat(17 * 1024),
        }),
      ),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(generateRetryAdvice).not.toHaveBeenCalled()
    expect(JSON.parse(response.body)).toEqual({
      error: 'Request body is too large.',
    })
  })

  it('stores tester feedback with search context', async () => {
    const response = createResponseRecorder()

    await handleFeedbackSubmission(
      createFinalizeRequest(
        JSON.stringify({
          sessionId: 'session-123',
          searchId: 'search-456',
          page: '/',
          stageReached: 'finalized',
          wasSimple: 'yes',
          foundWhatYouWanted: 'partly',
          enjoyedExperience: 'yes',
          freeText: 'The shortlist was strong, but I wanted clearer tradeoffs sooner.',
          email: 'tester@example.com',
          queryText: 'travel stroller',
          resultsSeen: true,
          finalized: true,
          selectedProductId: 'result-1',
          metadata: {
            source: 'fab',
            extra: { note: 'nested values become strings when needed' },
          },
        }),
      ),
      response,
    )

    expect(response.statusCode).toBe(202)
    expect(recordTesterFeedback).toHaveBeenCalledWith({
      email: 'tester@example.com',
      finalized: true,
      foundWhatYouWanted: 'partly',
      freeText: 'The shortlist was strong, but I wanted clearer tradeoffs sooner.',
      enjoyedExperience: 'yes',
      metadata: {
        extra: '{"note":"nested values become strings when needed"}',
        source: 'fab',
      },
      page: '/',
      queryText: 'travel stroller',
      resultsSeen: true,
      searchId: 'search-456',
      selectedProductId: 'result-1',
      sessionId: 'session-123',
      stageReached: 'finalized',
      wasSimple: 'yes',
    })
  })

  it('rejects tester feedback without any answers', async () => {
    const response = createResponseRecorder()

    await handleFeedbackSubmission(
      createFinalizeRequest(
        JSON.stringify({
          sessionId: 'session-123',
          stageReached: 'home',
        }),
      ),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(recordTesterFeedback).not.toHaveBeenCalled()
    expect(JSON.parse(response.body)).toEqual({
      error: 'Add at least one answer before sending feedback.',
    })
  })

  it('returns a retry advice server error when OpenAI fails', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    generateRetryAdvice.mockRejectedValue(new Error('OpenAI retry_advice failed: bad gateway'))
    const response = createResponseRecorder()

    await handleRetryAdvice(
      createFinalizeRequest(
        JSON.stringify({
          query: 'stroller',
          rejectionFeedback: 'Too bulky',
        }),
        { 'x-forwarded-for': '203.0.113.51' },
      ),
      response,
    )

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Unable to suggest a better search direction.',
      details: 'OpenAI retry_advice failed: bad gateway',
    })
  })

  it('truncates and sanitizes retry advice shortlist titles', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    generateRetryAdvice.mockResolvedValue({
      recommendation: 'new_search',
      suggestedQuery: 'compact stroller',
      rationale: 'A narrower search should help.',
      usage: null,
      generatedAt: '2026-04-24T12:00:00.000Z',
    })
    const longTitle = ` ${'A'.repeat(200)} `
    const response = createResponseRecorder()

    await handleRetryAdvice(
      createFinalizeRequest(
        JSON.stringify({
          query: 'stroller',
          rejectionFeedback: 'Too bulky',
          shortlist: [
            { title: longTitle },
            { title: '' },
            { title: 'Travel stroller' },
            { title: 'Compact stroller' },
            { title: 'Umbrella stroller' },
            { title: 'Jogging stroller' },
            { title: 'Double stroller' },
            { title: 'Should be dropped' },
          ],
        }),
        { 'x-forwarded-for': '203.0.113.52' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(generateRetryAdvice).toHaveBeenCalledWith(
      expect.objectContaining({
        shortlist: [
          { title: 'A'.repeat(160) },
          { title: 'Travel stroller' },
          { title: 'Compact stroller' },
          { title: 'Umbrella stroller' },
          { title: 'Jogging stroller' },
          { title: 'Double stroller' },
        ],
      }),
    )
  })

  it('rate limits repeated retry advice requests from the same ip address', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    generateRetryAdvice.mockResolvedValue({
      recommendation: 'new_search',
      suggestedQuery: 'compact stroller',
      rationale: 'A narrower search should help.',
      usage: null,
      generatedAt: '2026-04-24T12:00:00.000Z',
    })
    const requestBody = JSON.stringify({
      query: 'stroller',
      rejectionFeedback: 'Too bulky',
    })

    for (let index = 0; index < 15; index += 1) {
      const response = createResponseRecorder()

      await handleRetryAdvice(
        createFinalizeRequest(requestBody, { 'x-forwarded-for': '203.0.113.53' }),
        response,
      )

      expect(response.statusCode).toBe(200)
    }

    const limitedResponse = createResponseRecorder()

    await handleRetryAdvice(
      createFinalizeRequest(requestBody, { 'x-forwarded-for': '203.0.113.53' }),
      limitedResponse,
    )

    expect(limitedResponse.statusCode).toBe(429)
    expect(JSON.parse(limitedResponse.body)).toEqual({
      error: 'Too many retry advice requests from this connection. Please wait about 10 seconds and try again.',
    })
  })

  it('reports guided-discovery cache usage expectations for the guided, finalize, and live flows', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'SERPAPI_API_KEY') {
        return 'serp-key'
      }

      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      return ''
    })

    readStoredSearchCacheEntry.mockResolvedValueOnce({
      cachedAt: '2026-03-17T12:00:00.000Z',
      expiresAt: '2026-03-17T18:00:00.000Z',
      source: 'guided_discovery',
      selection: { mode: 'discovery_preview' },
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Cached search results',
        similarQueries: [],
        candidates: [{ id: 'cached-1', title: 'Thermos bottle', price: '$34.99', numericPrice: 34.99 }],
      },
      results: [{ id: 'cached-1', title: 'Thermos bottle', price: '$34.99' }],
    })

    const response = createResponseRecorder()

    await handleSearchDebug(new URL('http://localhost/api/search/debug?query=thermos'), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      query: 'thermos',
      details: '',
      cache: {
        guidedDiscovery: {
          cacheKey: 'guided_discovery:thermos|',
          hasEntry: true,
          source: 'guided_discovery',
          cachedAt: '2026-03-17T12:00:00.000Z',
          expiresAt: '2026-03-17T18:00:00.000Z',
          candidateCount: 1,
          previewResultCount: 1,
          selectionMode: 'discovery_preview',
        },
      },
      environment: {
        serpApiConfigured: true,
        openAiConfigured: true,
        supabaseConfigured: false,
      },
      architecture: {
        primaryProductFlow: [
          '/api/search/rainforest-discover',
          '/api/search/refine',
          '/api/search/finalize',
        ],
        storageMode: 'local_file_fallback',
        finalizeUsesDiscoveryCache: true,
        finalizeUsesRequestCandidatePool: false,
      },
      flowBehavior: {
        guidedDiscovery: {
          usesCache: true,
          callsSerpApi: false,
          callsOpenAi: false,
        },
        guidedFinalize: {
          usesCache: true,
          callsSerpApi: false,
          callsOpenAi: true,
        },
      },
    })
  })

  it('creates a fresh token-scoped session snapshot on discovery cache hits', async () => {
    getEnv.mockImplementation((name) => ({
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })[name] || '')
    vi.stubGlobal('fetch', vi.fn())

    readStoredSearchCacheEntry.mockResolvedValueOnce({
      cachedAt: '2026-03-17T12:00:00.000Z',
      expiresAt: '2026-03-17T18:00:00.000Z',
      source: 'rainforest_discovery',
      selection: {
        mode: 'discovery_preview',
        enrichment: {
          entries: [{ candidate_id: 'cached-1', fit_reason: 'Old context', caveat: 'Old caveat' }],
          model: 'gpt-5-mini',
        },
      },
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Cached search results',
        similarQueries: [],
        candidates: [{ id: 'cached-1', title: 'Thermos bottle', price: '$34.99', numericPrice: 34.99 }],
      },
      results: [{ id: 'cached-1', title: 'Thermos bottle', price: '$34.99' }],
      discoveryToken: 'old-token',
    })

    const response = createResponseRecorder()

    await handleRainforestDiscoverySearch(
      new URL('http://localhost/api/search/rainforest-discover?query=thermos&amazonDomain=amazon.com'),
      response,
      { headers: { 'x-forwarded-for': '203.0.113.18' } },
    )

    expect(response.statusCode).toBe(200)

    const payload = JSON.parse(response.body)
    expect(payload.source).toBe('cache')
    expect(payload.discoveryToken).toBeTruthy()
    expect(payload.discoveryToken).not.toBe('old-token')
    expect(fetch).not.toHaveBeenCalled()

    expect(writeStoredSearchCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        productQuery: 'thermos',
        discoveryToken: payload.discoveryToken,
        scope: `guided_discovery_session:${payload.discoveryToken}`,
        selection: expect.objectContaining({
          mode: 'discovery_preview',
          enrichment: null,
        }),
      }),
    )
  })

  it('refreshes discovery from the provider instead of returning an existing cache hit when requested', async () => {
    getEnv.mockImplementation((name) => ({
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })[name] || '')

    readStoredSearchCacheEntry.mockResolvedValueOnce({
      cachedAt: '2026-03-17T12:00:00.000Z',
      expiresAt: '2026-03-17T18:00:00.000Z',
      source: 'rainforest_discovery',
      selection: { mode: 'discovery_preview' },
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Stale cached search results',
        similarQueries: [],
        candidates: [{ id: 'cached-1', title: 'Stale Thermos bottle', price: '$34.99', numericPrice: 34.99 }],
      },
      results: [{ id: 'cached-1', title: 'Stale Thermos bottle', price: '$34.99', numericPrice: 34.99 }],
      discoveryToken: 'old-token',
    })
    getFilteredSearchArtifacts.mockReturnValue({
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Fresh provider search results',
        similarQueries: [],
        candidates: [{ ...createFinalizeCandidate('fresh-1'), title: 'Fresh Thermos bottle' }],
      },
      results: [{ id: 'fresh-1', title: 'Fresh Thermos bottle', price: '$39.99' }],
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ content: { results: { organic: [{}] } } }],
      }),
    })))

    const response = createResponseRecorder()

    await handleRainforestDiscoverySearch(
      new URL('http://localhost/api/search/rainforest-discover?query=thermos&amazonDomain=amazon.com&cacheMode=refresh'),
      response,
      { headers: { 'x-forwarded-for': '203.0.113.20' } },
    )

    expect(response.statusCode).toBe(200)

    const payload = JSON.parse(response.body)
    expect(payload.source).toBe('oxylabs_discovery')
    expect(payload.discoveryToken).toBeTruthy()
    expect(payload.discoveryToken).not.toBe('old-token')
    expect(payload.previewResults).toEqual([
      expect.objectContaining({
        id: 'fresh-1',
        title: 'Fresh Thermos bottle',
      }),
    ])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(writeStoredSearchCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        productQuery: 'thermos',
        discoveryToken: payload.discoveryToken,
        scope: `guided_discovery_session:${payload.discoveryToken}`,
      }),
    )
    await waitForExpectation(() => {
      expect(writeStoredSearchCacheEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          productQuery: 'thermos',
          discoveryToken: '',
          scope: 'rainforest_discovery:v2:amazon.com',
          results: [
            expect.objectContaining({
              id: 'fresh-1',
            }),
          ],
        }),
      )
    })
  })

  it('returns live discovery before the background query-quality review resolves', async () => {
    const reviewDeferred = createDeferred()

    getEnv.mockImplementation((name) => ({
      OPENAI_API_KEY: 'openai-key',
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })[name] || '')
    generateQueryQualityReview.mockReturnValue(reviewDeferred.promise)
    getFilteredSearchArtifacts.mockReturnValue({
      candidatePool: {
        query: 'celcius drink',
        details: '',
        combinedSearchText: 'celcius drink',
        searchState: 'Results for exact spelling',
        similarQueries: ['celsius drink'],
        candidates: [createFinalizeCandidate('one')],
      },
      results: [{ id: 'one', title: 'Generic Energy Drink', price: '$24.99' }],
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ content: { results: { organic: [{}] } } }],
      }),
    })))

    const response = createResponseRecorder()

    await handleRainforestDiscoverySearch(
      new URL('http://localhost/api/search/rainforest-discover?query=celcius%20drink&amazonDomain=amazon.com'),
      response,
      { headers: { 'x-forwarded-for': '203.0.113.19' } },
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        amazonDomain: 'amazon.com',
        previewResults: [
          expect.objectContaining({
            id: 'one',
          }),
        ],
      }),
    )

    await waitForExpectation(() => {
      expect(generateQueryQualityReview).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQuery: 'celcius drink',
          amazonDomain: 'amazon.com',
          apiKey: 'openai-key',
          similarQueries: ['celsius drink'],
        }),
      )
    })

    reviewDeferred.resolve({
      classification: 'likely_typo',
      suggestedQuery: 'celsius drink',
      confidence: 'high',
      reason: 'Celsius appears to be the intended energy drink brand.',
      shouldSuggest: true,
      usage: null,
      generatedAt: '2026-03-17T12:00:02.000Z',
    })
    await flushAsyncWork()
  })

  it('uses Rainforest for live discovery when configured', async () => {
    getEnv.mockImplementation((name) => ({
      RAINFOREST_API_KEY: 'rf-key',
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })[name] || '')
    getFilteredSearchArtifacts.mockReturnValue({
      candidatePool: {
        query: 'yupik white chocolate chips',
        details: '',
        combinedSearchText: 'yupik white chocolate chips',
        searchState: '',
        similarQueries: [],
        candidates: [{ ...createFinalizeCandidate('one'), title: 'Yupik White Chocolate Chips' }],
      },
      results: [{ id: 'one', title: 'Yupik White Chocolate Chips', price: '$28.03' }],
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        search_results: [
          {
            asin: 'one',
            title: 'Yupik White Chocolate Chips',
            price: { value: 28.03, raw: '$28.03' },
            link: 'https://www.amazon.ca/dp/one',
            image: 'https://example.com/one.jpg',
          },
        ],
      }),
    })))

    const response = createResponseRecorder()

    await handleRainforestDiscoverySearch(
      new URL('http://localhost/api/search/rainforest-discover?query=yupik%20white%20chocolate%20chips&amazonDomain=amazon.ca'),
      response,
      { headers: { 'x-forwarded-for': '203.0.113.23' } },
    )

    const payload = JSON.parse(response.body)

    expect(response.statusCode).toBe(200)
    expect(payload.source).toBe('rainforest_discovery')
    expect(payload.fallbackFrom).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBeInstanceOf(URL)
  })

  it('falls back to Oxylabs discovery when Rainforest runs out of credits', async () => {
    getEnv.mockImplementation((name) => ({
      RAINFOREST_API_KEY: 'rf-key',
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })[name] || '')
    getFilteredSearchArtifacts.mockReturnValue({
      candidatePool: {
        query: 'yupik white chocolate chips',
        details: '',
        combinedSearchText: 'yupik white chocolate chips',
        searchState: '',
        similarQueries: [],
        candidates: [{ ...createFinalizeCandidate('one'), title: 'Fallback White Chocolate Chips' }],
      },
      results: [{ id: 'one', title: 'Fallback White Chocolate Chips', price: '$28.03' }],
    })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 402,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ content: { results: { organic: [{}] } } }],
        }),
      }))

    const response = createResponseRecorder()

    await handleRainforestDiscoverySearch(
      new URL('http://localhost/api/search/rainforest-discover?query=yupik%20white%20chocolate%20chips&amazonDomain=amazon.ca'),
      response,
      { headers: { 'x-forwarded-for': '203.0.113.24' } },
    )

    const payload = JSON.parse(response.body)

    expect(response.statusCode).toBe(200)
    expect(payload.source).toBe('oxylabs_discovery_fallback')
    expect(payload.fallbackFrom).toBe('rainforest_discovery')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0][0]).toBeInstanceOf(URL)
    expect(fetch.mock.calls[1][1].method).toBe('POST')
  })

  it('stores query-quality review state on the token-scoped discovery snapshot', async () => {
    let sessionEntry = null

    getEnv.mockImplementation((name) => ({
      OPENAI_API_KEY: 'openai-key',
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })[name] || '')
    generateQueryQualityReview.mockResolvedValue({
      classification: 'likely_typo',
      suggestedQuery: 'celsius drink',
      confidence: 'high',
      reason: 'Celsius appears to be the intended energy drink brand.',
      shouldSuggest: true,
      usage: null,
      generatedAt: '2026-03-17T12:00:02.000Z',
    })
    readStoredSearchCacheEntry.mockImplementation(async ({ scope }) => {
      if (scope === 'rainforest_discovery:v2:amazon.com') {
        const cacheEntry = createDiscoveryCacheEntry('celcius drink', [createFinalizeCandidate('one')], {
          mode: 'discovery_preview',
        }, 'old-token')

        return {
          ...cacheEntry,
          results: cacheEntry.results.map((result) => ({
            ...result,
            price: '$24.99',
            numericPrice: 24.99,
          })),
        }
      }

      if (scope?.startsWith('guided_discovery_session:')) {
        return sessionEntry
      }

      return null
    })
    writeStoredSearchCacheEntry.mockImplementation(async (entry) => {
      if (entry.scope?.startsWith('guided_discovery_session:')) {
        sessionEntry = {
          ...sessionEntry,
          ...entry,
          selection: {
            ...(entry.selection || {}),
            enrichment: entry.selection?.enrichment || { entries: [{ candidate_id: 'one' }], model: 'gpt-5-mini' },
          },
        }
      }

      return {
        cachedAt: '2026-03-17T12:00:01.000Z',
        expiresAt: '2026-03-17T18:00:00.000Z',
      }
    })

    const response = createResponseRecorder()

    await handleRainforestDiscoverySearch(
      new URL('http://localhost/api/search/rainforest-discover?query=celcius%20drink&amazonDomain=amazon.com'),
      response,
      { headers: { 'x-forwarded-for': '203.0.113.21' } },
    )

    const payload = JSON.parse(response.body)

    await waitForExpectation(() => {
      expect(writeStoredSearchCacheEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          productQuery: 'celcius drink',
          discoveryToken: payload.discoveryToken,
          scope: `guided_discovery_session:${payload.discoveryToken}`,
          selection: expect.objectContaining({
            enrichment: { entries: [{ candidate_id: 'one' }], model: 'gpt-5-mini' },
            queryQuality: expect.objectContaining({
              status: 'ready',
              classification: 'likely_typo',
              originalQuery: 'celcius drink',
              suggestedQuery: 'celsius drink',
              confidence: 'high',
              reason: 'Celsius appears to be the intended energy drink brand.',
              shouldSuggest: true,
              reviewedAt: '2026-03-17T12:00:02.000Z',
            }),
          }),
        }),
      )
    })
  })

  it('reports optional Supabase health when local fallback is active', async () => {
    getSupabaseHealth.mockResolvedValue({
      configured: false,
      ok: false,
      tables: [],
    })

    const response = createResponseRecorder()

    await handleSupabaseHealth(response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      configured: false,
      ok: false,
      tables: [],
      storageMode: 'local_file_fallback',
      status: 'optional',
      details: 'Supabase is not configured. The app is using the supported local cache/history fallback for this environment.',
      setupHint: 'Add SUPABASE_URL and SUPABASE_SECRET_KEY or the legacy SUPABASE_SERVICE_ROLE_KEY to enable Supabase-backed storage.',
    })
  })

  it('reports active Supabase health details when Supabase is configured', async () => {
    getSupabaseHealth.mockResolvedValue({
      configured: true,
      ok: true,
      tables: [
        { table: 'search_cache', ok: true, error: null },
        { table: 'search_history', ok: true, error: null },
      ],
    })

    const response = createResponseRecorder()

    await handleSupabaseHealth(response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      configured: true,
      ok: true,
      tables: [
        { table: 'search_cache', ok: true, error: null },
        { table: 'search_history', ok: true, error: null },
      ],
      storageMode: 'supabase',
      status: 'ok',
    })
  })







  it('rejects malformed finalize request bodies', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest('{not-json', { 'x-forwarded-for': '203.0.113.20' }),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Request body must be valid JSON.',
    })
  })

  it('rejects finalize requests without a query', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          followUpNotes: 'keep it lightweight',
        }),
        { 'x-forwarded-for': '203.0.113.25' },
      ),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Enter a product topic to get started.',
    })
  })

  it('rejects finalize requests without a discovery token', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          query: 'stroller',
        }),
        { 'x-forwarded-for': '203.0.113.26' },
      ),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Your search session expired. Start a new search.',
    })
  })

  it('rejects oversized finalize request bodies', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))

    const oversizedNotes = 'x'.repeat(70_000)
    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          followUpNotes: oversizedNotes,
        }),
        { 'x-forwarded-for': '203.0.113.21' },
      ),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Request body is too large.',
    })
  })

  it('rejects finalize requests when the discovery token does not match the query', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          query: 'stroller',
          discoveryToken: 'wrong-opaque-token',
        }),
        { 'x-forwarded-for': '203.0.113.22' },
      ),
      response,
    )

    expect(response.statusCode).toBe(409)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Your search session expired. Start a new search.',
    })
  })

  it('rejects finalize requests when the guided discovery cache entry is missing', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          followUpNotes: 'keep it lightweight',
        }),
        { 'x-forwarded-for': '203.0.113.23' },
      ),
      response,
    )

    expect(response.statusCode).toBe(409)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Your search session expired. Start a new search.',
    })
    expect(haikuLockWinnersAndBadges).not.toHaveBeenCalled()
  })

  it('filters zero-priced cached candidates before sending the pool to Haiku', async () => {
    mockFinalizeEnv()
    readStoredSearchCacheEntry.mockResolvedValue(
      createDiscoveryCacheEntry('stroller', [
        {
          ...createFinalizeCandidate('zero'),
          price: '$0.00',
          numericPrice: 0,
        },
        createFinalizeCandidate('live'),
      ]),
    )
    haikuLockWinnersAndBadges.mockResolvedValue({
      lockedIds: ['live'],
      model: 'claude-haiku-4-5-20251001',
      usage: null,
    })

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(JSON.stringify(createFinalizeDiscoveryBody())),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(haikuLockWinnersAndBadges).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'claude-key',
        candidatePool: expect.objectContaining({
          candidates: [expect.objectContaining({ id: 'live' })],
        }),
        finalResultLimit: 6,
      }),
    )

    const payload = JSON.parse(response.body)
    expect(payload.results.map((item) => item.id)).toEqual(['live'])
  })

  it('filters missing-price cached candidates before sending the pool to Haiku', async () => {
    mockFinalizeEnv()
    readStoredSearchCacheEntry.mockResolvedValue(
      createDiscoveryCacheEntry('stroller', [
        {
          ...createFinalizeCandidate('missing'),
          price: '',
          numericPrice: null,
        },
        createFinalizeCandidate('live'),
      ]),
    )
    haikuLockWinnersAndBadges.mockResolvedValue({
      lockedIds: ['live'],
      model: 'claude-haiku-4-5-20251001',
      usage: null,
    })

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(JSON.stringify(createFinalizeDiscoveryBody())),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(haikuLockWinnersAndBadges).toHaveBeenCalledWith(
      expect.objectContaining({
        candidatePool: expect.objectContaining({
          candidates: [expect.objectContaining({ id: 'live' })],
        }),
      }),
    )

    const payload = JSON.parse(response.body)
    expect(payload.results.map((item) => item.id)).toEqual(['live'])
  })

  it('haiku locks the shortlist for empty-note finalize and returns a fast response', async () => {
    mockFinalizeEnv()
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5-mini',
      lockedIds: ['one'],
      usage: {
        inputTokens: 180,
        outputTokens: 30,
        totalTokens: 210,
        reasoningTokens: 6,
      },
    })
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')], {
        mode: 'discovery_preview',
      }),
    )

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          requestMode: 'guided_empty_notes',
        }),
        { 'x-forwarded-for': '203.0.113.35' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(haikuLockWinnersAndBadges).toHaveBeenCalledWith({
      candidatePool: expect.objectContaining({
        details: '',
        candidates: [expect.objectContaining({ id: 'one' })],
      }),
      finalResultLimit: 6,
      apiKey: 'claude-key',
    })
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        requestMode: 'guided_empty_notes',
        debug: expect.objectContaining({
          finalizeFastLayer: 'finalize_fast',
          flowPath: 'haiku_lock',
        }),
        finalizeFast: expect.objectContaining({
          layer: 'finalize_fast',
          shortlistLocked: true,
          selectedCandidateIds: ['one'],
          shortlist: [
            expect.not.objectContaining({
              reasons: expect.any(Array),
            }),
          ],
        }),
        selection: expect.objectContaining({
          layer: 'finalize_fast',
          mode: 'ai',
          shortlistLocked: true,
          strategy: 'haiku_lock',
          flowPath: 'haiku_lock',
        }),
        usage: expect.objectContaining({
          haiku: expect.objectContaining({
            totalTokens: 210,
          }),
        }),
      }),
    )
  })

  it('caps finalize note length before calling OpenAI', async () => {
    mockFinalizeEnv()
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.4-nano',
      lockedIds: ['id-1'],
      usage: { inputTokens: 510, outputTokens: 84, totalTokens: 594, reasoningTokens: 38 },
    })

    const response = createResponseRecorder()
    const candidates = Array.from({ length: 20 }, (_, index) => createFinalizeCandidate(`id-${index + 1}`))
    const longNotes = 'n'.repeat(800)
    readStoredSearchCacheEntry.mockResolvedValueOnce(createDiscoveryCacheEntry('stroller', candidates))

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          priorities: ['lightweight', 'easy fold'],
          followUpNotes: longNotes,
        }),
        { 'x-forwarded-for': '203.0.113.23' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(haikuLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(haikuLockWinnersAndBadges).toHaveBeenCalledWith({
      candidatePool: expect.objectContaining({
        details: `Priorities: lightweight, easy fold. Notes: ${'n'.repeat(500)}`,
        candidates: expect.arrayContaining(candidates.map((candidate) => expect.objectContaining({ id: candidate.id }))),
      }),
      finalResultLimit: 6,
      apiKey: 'claude-key',
    })
    expect(haikuLockWinnersAndBadges.mock.calls[0][0].candidatePool.candidates).toHaveLength(20)
    expect(haikuLockWinnersAndBadges.mock.calls[0][0].candidatePool.details.endsWith('n'.repeat(500))).toBe(true)
  })

  it('haiku locks the shortlist for refined finalize and includes notes in candidatePool details', async () => {
    mockFinalizeEnv()
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.4-nano',
      lockedIds: ['one'],
      usage: { inputTokens: 180, outputTokens: 30, totalTokens: 210, reasoningTokens: 6 },
    })
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')], {
        mode: 'discovery_preview',
      }),
    )

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          followUpNotes: 'best for city travel',
          requestMode: 'guided_refined',
        }),
        { 'x-forwarded-for': '203.0.113.36' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(haikuLockWinnersAndBadges).toHaveBeenCalledWith({
      candidatePool: expect.objectContaining({
        details: 'Notes: best for city travel',
      }),
      finalResultLimit: 6,
      apiKey: 'claude-key',
    })
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        requestMode: 'guided_refined',
        debug: expect.objectContaining({
          finalizeFastLayer: 'finalize_fast',
          flowPath: 'haiku_lock',
          tokenUsageByStage: expect.objectContaining({
            finalize: {
              inputTokens: 180,
              outputTokens: 30,
              totalTokens: 210,
              reasoningTokens: 6,
            },
          }),
        }),
        finalizeFast: expect.objectContaining({
          layer: 'finalize_fast',
          shortlistLocked: true,
          latestUserContext: 'Notes: best for city travel',
          selectedCandidateIds: ['one'],
        }),
        selection: expect.objectContaining({
          layer: 'finalize_fast',
          shortlistLocked: true,
          strategy: 'haiku_lock',
          flowPath: 'haiku_lock',
        }),
      }),
    )
  })

  it('returns cards before Oxylabs resolves, then enriches with product details in the polling cache', async () => {
    mockFinalizeEnv({
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.4-nano',
      lockedIds: ['one'],
      usage: null,
    })
    miniEnrichSelectedCandidates.mockResolvedValue({
      model: 'gpt-5-mini',
      enriched: [{ candidate_id: 'one', fit_reason: 'Good match', caveat: 'A bit pricey', feature_bullets: ['One-hand fold'] }],
      enrichedIds: ['one'],
      usage: null,
      preservedOrder: true,
    })
    const detailFetch = createDeferred()
    const fetchMock = vi.fn(() => detailFetch.promise)

    vi.stubGlobal('fetch', fetchMock)
    readStoredSearchCacheEntry.mockResolvedValue(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')], {
        mode: 'discovery_preview',
      }),
    )

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          followUpNotes: 'best for city travel',
          requestMode: 'guided_refined',
        }),
        { 'x-forwarded-for': '203.0.113.41' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)

    const payload = JSON.parse(response.body)

    expect(payload).toEqual(
      expect.objectContaining({
        selection: expect.objectContaining({
          miniEnrichmentStatus: 'running_async',
        }),
        debug: expect.objectContaining({
          stageLatencyMs: expect.objectContaining({
            productDetails: null,
          }),
        }),
        results: [
          expect.objectContaining({
            id: 'one',
            feature_bullets: [],
          }),
        ],
        finalizeFast: expect.objectContaining({
          shortlist: [
            expect.objectContaining({
              id: 'one',
              feature_bullets: [],
            }),
          ],
        }),
      }),
    )
    expect(miniEnrichSelectedCandidates).not.toHaveBeenCalled()

    await waitForExpectation(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    detailFetch.resolve({
      ok: true,
      json: async () => ({
        results: [{
          content: {
            bullet_points: 'One-hand fold\nCompact enough for overhead bins',
            description: 'A compact stroller built for airport travel.',
          },
        }],
      }),
    })

    await waitForExpectation(() => {
      expect(miniEnrichSelectedCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          candidatePool: expect.objectContaining({
            candidates: [
              expect.objectContaining({
                id: 'one',
                feature_bullets: ['One-hand fold', 'Compact enough for overhead bins'],
                productDescription: 'A compact stroller built for airport travel.',
              }),
            ],
          }),
        }),
      )
      expect(writeStoredSearchCacheEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          productQuery: 'stroller',
          scope: 'guided_discovery_session:opaque-discovery-token',
          selection: expect.objectContaining({
            enrichment: expect.objectContaining({
              entries: [
                {
                  candidate_id: 'one',
                  fit_reason: 'Good match',
                  caveat: 'A bit pricey',
                  feature_bullets: ['One-hand fold'],
                },
              ],
              model: 'gpt-5-mini',
              preservedOrder: true,
            }),
          }),
        }),
      )
    })
  })

  it('keeps initial cards usable while an Oxylabs detail call fails, then enriches with available details', async () => {
    mockFinalizeEnv({
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.4-nano',
      lockedIds: ['one', 'two'],
      usage: null,
    })
    miniEnrichSelectedCandidates.mockResolvedValue({
      model: 'gpt-5-mini',
      enriched: [
        { candidate_id: 'one', fit_reason: 'Good match', caveat: 'A bit pricey', feature_bullets: ['One-hand fold'] },
        { candidate_id: 'two', fit_reason: 'Good backup', caveat: 'Less storage', feature_bullets: [] },
      ],
      enrichedIds: ['one', 'two'],
      usage: null,
      preservedOrder: true,
    })

    const fetchMock = vi.fn(async (_requestUrl, requestInit) => {
      const asin = JSON.parse(requestInit.body).query

      if (asin === 'one') {
        return {
          ok: true,
          json: async () => ({
            results: [{
              content: {
                bullet_points: 'One-hand fold\nCompact enough for overhead bins',
                description: 'A compact stroller built for airport travel.',
              },
            }],
          }),
        }
      }

      throw new Error('detail request timed out')
    })

    vi.stubGlobal('fetch', fetchMock)
    readStoredSearchCacheEntry.mockResolvedValue(
      createDiscoveryCacheEntry('stroller', [
        createFinalizeCandidate('one'),
        createFinalizeCandidate('two'),
      ], {
        mode: 'discovery_preview',
      }),
    )

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          followUpNotes: 'best for city travel',
          requestMode: 'guided_refined',
        }),
        { 'x-forwarded-for': '203.0.113.42' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)

    const payload = JSON.parse(response.body)

    expect(payload.results).toEqual([
      expect.objectContaining({
        id: 'one',
        feature_bullets: [],
      }),
      expect.objectContaining({
        id: 'two',
        feature_bullets: [],
      }),
    ])
    expect(payload.finalizeFast).toEqual(expect.objectContaining({
      shortlist: [
        expect.objectContaining({
          id: 'one',
          feature_bullets: [],
        }),
        expect.objectContaining({
          id: 'two',
          feature_bullets: [],
        }),
      ],
    }))

    await waitForExpectation(() => {
      expect(miniEnrichSelectedCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          candidatePool: expect.objectContaining({
            candidates: [
              expect.objectContaining({
                id: 'one',
                feature_bullets: ['One-hand fold', 'Compact enough for overhead bins'],
                productDescription: 'A compact stroller built for airport travel.',
              }),
              expect.objectContaining({
                id: 'two',
              }),
            ],
          }),
        }),
      )
    })
    expect(
      miniEnrichSelectedCandidates.mock.calls[0][0].candidatePool.candidates[1].feature_bullets ?? [],
    ).toEqual([])
    expect(miniEnrichSelectedCandidates.mock.calls[0][0].candidatePool.candidates[1].productDescription ?? '').toBe('')
  })

  it('hydrates stored enrichment bullets when a background detail retry succeeds later', async () => {
    mockFinalizeEnv({
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.4-nano',
      lockedIds: ['one', 'two'],
      usage: null,
    })
    miniEnrichSelectedCandidates.mockResolvedValue({
      model: 'gpt-5-mini',
      enriched: [
        { candidate_id: 'one', fit_reason: 'Good match', caveat: 'A bit pricey', feature_bullets: ['One-hand fold'] },
        { candidate_id: 'two', fit_reason: 'Good backup', caveat: 'Less storage', feature_bullets: [] },
      ],
      enrichedIds: ['one', 'two'],
      usage: null,
      preservedOrder: true,
    })

    let discoveryEntry = createDiscoveryCacheEntry('stroller', [
      createFinalizeCandidate('one'),
      createFinalizeCandidate('two'),
    ], {
      mode: 'discovery_preview',
    })

    readStoredSearchCacheEntry.mockImplementation(async () => discoveryEntry)
    writeStoredSearchCacheEntry.mockImplementation(async (entry) => {
      discoveryEntry = {
        ...discoveryEntry,
        ...entry,
        selection: entry.selection ?? discoveryEntry.selection,
      }

      return {
        cachedAt: '2026-03-17T12:00:01.000Z',
      }
    })

    const callsByAsin = new Map()
    const fetchMock = vi.fn(async (_requestUrl, requestInit) => {
      const asin = JSON.parse(requestInit.body).query
      const callCount = (callsByAsin.get(asin) ?? 0) + 1
      callsByAsin.set(asin, callCount)

      if (asin === 'one') {
        return {
          ok: true,
          json: async () => ({
            results: [{
              content: {
                bullet_points: 'One-hand fold\nCompact enough for overhead bins',
                description: 'A compact stroller built for airport travel.',
              },
            }],
          }),
        }
      }

      if (asin === 'two' && callCount === 1) {
        throw new Error('detail request timed out')
      }

      return {
        ok: true,
        json: async () => ({
          results: [{
            content: {
              bullet_points: 'Roomier basket\nCup holder included',
              description: 'A flexible backup stroller for daily errands.',
            },
          }],
        }),
      }
    })

    vi.stubGlobal('fetch', fetchMock)

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          followUpNotes: 'best for city travel',
          requestMode: 'guided_refined',
        }),
        { 'x-forwarded-for': '203.0.113.44' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)

    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(writeStoredSearchCacheEntry.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        selection: expect.objectContaining({
          enrichment: expect.objectContaining({
            entries: [
              expect.objectContaining({
                candidate_id: 'one',
                feature_bullets: ['One-hand fold'],
              }),
              expect.objectContaining({
                candidate_id: 'two',
                feature_bullets: ['Roomier basket', 'Cup holder included'],
              }),
            ],
          }),
        }),
      }),
    )
    expect(callsByAsin.get('two')).toBe(2)
  })

  it('reports Haiku finalize model metadata for context-added requests', async () => {
    mockFinalizeEnv({
      OPENAI_FINALIZE_CONTEXT_MODEL: 'gpt-5.4-nano',
      OPENAI_MODEL: 'gpt-5-mini',
    })
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku-4-5-20251001',
      lockedIds: ['one'],
      usage: null,
    })

    const response = createResponseRecorder()
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')]),
    )

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          followUpNotes: 'keep it lightweight',
        }),
        { 'x-forwarded-for': '203.0.113.30' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(haikuLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(haikuLockWinnersAndBadges.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'claude-key',
      }),
    )
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        debug: expect.objectContaining({
          finalizeModel: 'claude-haiku-4-5-20251001',
          finalizeModelPath: 'context_added',
        }),
        selection: expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
          modelPath: 'context_added',
        }),
      }),
    )
    expect(haikuLockWinnersAndBadges.mock.calls[0][0]).not.toHaveProperty('model')
  })

  it('uses the Haiku result model for context-added finalize metadata', async () => {
    mockFinalizeEnv({
      OPENAI_FINALIZE_MODEL: 'gpt-5-mini',
    })
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku-4-5-20251001',
      lockedIds: ['one'],
      usage: null,
    })

    const response = createResponseRecorder()
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')]),
    )

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          followUpNotes: 'keep it lightweight and compact',
        }),
        { 'x-forwarded-for': '203.0.113.31' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(haikuLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(haikuLockWinnersAndBadges.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'claude-key',
      }),
    )
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        debug: expect.objectContaining({
          finalizeModel: 'claude-haiku-4-5-20251001',
          finalizeModelPath: 'context_added',
        }),
        selection: expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
          modelPath: 'context_added',
        }),
      }),
    )
  })

  it('does not let OpenAI finalize env override Haiku finalize metadata', async () => {
    mockFinalizeEnv({
      OPENAI_FINALIZE_MODEL: 'gpt-5-mini',
      OPENAI_FINALIZE_CONTEXT_MODEL: 'gpt-5.2',
    })
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku-4-5-20251001',
      lockedIds: ['one'],
      usage: null,
    })

    const response = createResponseRecorder()
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')]),
    )

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          priorities: ['lightweight'],
        }),
        { 'x-forwarded-for': '203.0.113.32' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(haikuLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(haikuLockWinnersAndBadges.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'claude-key',
      }),
    )
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        debug: expect.objectContaining({
          finalizeModel: 'claude-haiku-4-5-20251001',
          finalizeModelPath: 'context_added',
        }),
        selection: expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
          modelPath: 'context_added',
        }),
      }),
    )
  })

  it('keeps empty-note finalize requests on the baseline metadata lane', async () => {
    mockFinalizeEnv({
      OPENAI_FINALIZE_MODEL: 'gpt-5-mini',
    })
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku-4-5-20251001',
      lockedIds: ['one'],
      usage: null,
    })

    const response = createResponseRecorder()
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')]),
    )

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify(createFinalizeDiscoveryBody()),
        { 'x-forwarded-for': '203.0.113.33' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(haikuLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(haikuLockWinnersAndBadges.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'claude-key',
      }),
    )
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        debug: expect.objectContaining({
          finalizeModel: 'claude-haiku-4-5-20251001',
          finalizeModelPath: 'baseline',
        }),
        selection: expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
          modelPath: 'baseline',
        }),
      }),
    )
  })

  it('passes retry feedback into finalize selection details and returns the retry count', async () => {
    mockFinalizeEnv()
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.4-nano',
      lockedIds: ['two'],
      usage: {
        inputTokens: 510,
        outputTokens: 84,
        totalTokens: 594,
        reasoningTokens: 38,
      },
    })

    const response = createResponseRecorder()
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one'), createFinalizeCandidate('two')]),
    )

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          followUpNotes: 'keep it lightweight',
          rejectionFeedback: 'These picks still feel too bulky for city travel.',
          excludedCandidateIds: ['one'],
          retryCount: 1,
        }),
        { 'x-forwarded-for': '203.0.113.27' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(haikuLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(haikuLockWinnersAndBadges.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        candidatePool: expect.objectContaining({
          details:
            'Notes: keep it lightweight. Retry feedback: These picks still feel too bulky for city travel.. Excluded previous picks: one',
          candidates: [expect.objectContaining({ id: 'two' })],
        }),
        finalResultLimit: 6,
        apiKey: 'claude-key',
      }),
    )
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        retryCount: 1,
        selection: expect.objectContaining({
          usage: {
            inputTokens: 510,
            outputTokens: 84,
            totalTokens: 594,
            reasoningTokens: 38,
          },
        }),
        usage: {
          haiku: {
            inputTokens: 510,
            outputTokens: 84,
            totalTokens: 594,
            reasoningTokens: 38,
          },
        },
      }),
    )
  })

  it('tops up a partial valid Haiku shortlist to six items', async () => {
    mockFinalizeEnv()
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku-4-5-20251001',
      lockedIds: ['three', 'one', 'four', 'six'],
      usage: null,
    })

    const response = createResponseRecorder()
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry(
        'stroller',
        ['one', 'two', 'three', 'four', 'five', 'six'].map((id) => createFinalizeCandidate(id)),
      ),
    )

    await handleFinalizeSelection(
      createFinalizeRequest(JSON.stringify(createFinalizeDiscoveryBody()), { 'x-forwarded-for': '203.0.113.43' }),
      response,
    )

    const payload = JSON.parse(response.body)

    expect(response.statusCode).toBe(200)
    expect(payload.results).toHaveLength(6)
    expect(payload.results.map((item) => item.id)).toEqual(['three', 'one', 'four', 'six', 'two', 'five'])
    expect(payload.selection).toEqual(expect.objectContaining({
      strategy: 'haiku_lock_topped_up',
      selectedCandidateIds: ['three', 'one', 'four', 'six', 'two', 'five'],
    }))
    expect(payload.finalizeFast).toEqual(expect.objectContaining({
      selectedCandidateIds: ['three', 'one', 'four', 'six', 'two', 'five'],
      strategy: 'haiku_lock_topped_up',
    }))
  })

  it('tops up invalid and duplicate Haiku picks to six unique items', async () => {
    mockFinalizeEnv()
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku-4-5-20251001',
      lockedIds: ['one', 'missing', 'one', 'two', 'ghost', 'two'],
      usage: null,
    })

    const response = createResponseRecorder()
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry(
        'stroller',
        ['one', 'two', 'three', 'four', 'five', 'six'].map((id) => createFinalizeCandidate(id)),
      ),
    )

    await handleFinalizeSelection(
      createFinalizeRequest(JSON.stringify(createFinalizeDiscoveryBody()), { 'x-forwarded-for': '203.0.113.44' }),
      response,
    )

    const payload = JSON.parse(response.body)

    expect(response.statusCode).toBe(200)
    expect(payload.results.map((item) => item.id)).toEqual(['one', 'two', 'three', 'four', 'five', 'six'])
    expect(payload.selection).toEqual(expect.objectContaining({
      strategy: 'haiku_lock_topped_up',
      selectedCandidateIds: ['one', 'two', 'three', 'four', 'five', 'six'],
    }))
  })

  it('uses the final merged shortlist ids for async detail fetch and mini enrichment', async () => {
    mockFinalizeEnv({
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'claude-haiku-4-5-20251001',
      lockedIds: ['one', 'three', 'five', 'six'],
      usage: null,
    })

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{
          content: {
            bullet_points: '',
            description: '',
          },
        }],
      }),
    }))

    vi.stubGlobal('fetch', fetchMock)
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry(
        'stroller',
        ['one', 'two', 'three', 'four', 'five', 'six'].map((id) => createFinalizeCandidate(id)),
      ),
    )

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(JSON.stringify(createFinalizeDiscoveryBody()), { 'x-forwarded-for': '203.0.113.45' }),
      response,
    )

    const payload = JSON.parse(response.body)

    expect(response.statusCode).toBe(200)
    expect(payload.selection).toEqual(expect.objectContaining({
      strategy: 'haiku_lock_topped_up',
      selectedCandidateIds: ['one', 'three', 'five', 'six', 'two', 'four'],
    }))

    await waitForExpectation(() => {
      expect(fetchMock).toHaveBeenCalledTimes(6)
      expect(
        fetchMock.mock.calls.map(([, requestInit]) => JSON.parse(requestInit.body).query),
      ).toEqual(['one', 'three', 'five', 'six', 'two', 'four'])
      expect(miniEnrichSelectedCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          lockedIds: ['one', 'three', 'five', 'six', 'two', 'four'],
        }),
      )
    })
  })

  it('echoes requestMode back in the finalize response', async () => {
    mockFinalizeEnv()
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5-mini',
      lockedIds: ['one'],
      usage: { inputTokens: 200, outputTokens: 40, totalTokens: 240, reasoningTokens: 12 },
    })

    const response = createResponseRecorder()
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')]),
    )

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          requestMode: 'guided_empty_notes',
        }),
        { 'x-forwarded-for': '203.0.113.29' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        requestMode: 'guided_empty_notes',
        selection: expect.objectContaining({
          requestMode: 'guided_empty_notes',
        }),
      }),
    )
  })

  it('returns an honest empty retry response when all previous picks are excluded', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))

    const response = createResponseRecorder()
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')]),
    )

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          rejectionFeedback: 'Not right for city travel',
          excludedCandidateIds: ['one'],
          retryCount: 1,
        }),
        { 'x-forwarded-for': '203.0.113.28' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(haikuLockWinnersAndBadges).not.toHaveBeenCalled()
    expect(JSON.parse(response.body)).toEqual({
      finalizeFast: expect.objectContaining({
        version: 1,
        layer: 'finalize_fast',
        query: 'stroller',
        latestUserContext: 'Retry feedback: Not right for city travel. Excluded previous picks: one',
        shortlistLocked: true,
        selectedCandidateIds: [],
        shortlist: [],
        strategy: 'retry_exhausted',
      }),
      requestMode: 'guided_finalize',
      retryCount: 1,
      results: [],
      selection: {
        layer: 'finalize_fast',
        mode: 'retry_exhausted',
        model: null,
        requestMode: 'guided_finalize',
        shortlistLocked: true,
        selectedCandidateIds: [],
        details: 'No new candidates remained after excluding the previously rejected picks.',
      },
    })
  })

  it('rate limits repeated finalize requests from the same ip address', async () => {
    mockFinalizeEnv()
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5-mini',
      lockedIds: ['one'],
      usage: null,
    })

    const requestBody = JSON.stringify({
      ...createFinalizeDiscoveryBody(),
      followUpNotes: 'keep it lightweight',
    })

    readStoredSearchCacheEntry.mockResolvedValue(createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')]))

    for (let index = 0; index < 15; index += 1) {
      const response = createResponseRecorder()

      await handleFinalizeSelection(
        createFinalizeRequest(requestBody, { 'x-forwarded-for': '203.0.113.24' }),
        response,
      )

      expect(response.statusCode).toBe(200)
    }

    const limitedResponse = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(requestBody, { 'x-forwarded-for': '203.0.113.24' }),
      limitedResponse,
    )

    expect(limitedResponse.statusCode).toBe(429)
    expect(JSON.parse(limitedResponse.body)).toEqual({
      error: 'Too many finalize requests from this connection. Please wait about 10 seconds and try again.',
    })
  })

  it('returns ready:false from enrichment poll when enrichment is not yet stored', async () => {
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')], { mode: 'discovery_preview' }),
    )

    const response = createResponseRecorder()
    const url = new URL('http://localhost/api/search/enrichment?token=opaque-discovery-token&query=stroller')
    url.searchParams.set('token', 'opaque-discovery-token')
    url.searchParams.set('query', 'stroller')

    await handleEnrichmentPoll({ url: url.toString() }, response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ready: false })
  })

  it('returns enrichment entries from poll when enrichment is stored in discovery cache', async () => {
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')], {
        mode: 'discovery_preview',
        enrichment: {
          entries: [
            { candidate_id: 'one', fit_reason: 'Good city stroller', caveat: 'Slightly pricey' },
          ],
          model: 'gpt-5-mini',
          generatedAt: '2026-04-14T12:00:00.000Z',
          preservedOrder: true,
        },
      }),
    )

    const response = createResponseRecorder()
    const url = new URL('http://localhost/api/search/enrichment')
    url.searchParams.set('token', 'opaque-discovery-token')
    url.searchParams.set('query', 'stroller')

    await handleEnrichmentPoll({ url: url.toString() }, response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      ready: true,
      entries: [{ candidate_id: 'one', fit_reason: 'Good city stroller', caveat: 'Slightly pricey' }],
      model: 'gpt-5-mini',
    })
  })

  it('returns ready:false from query-quality poll when review is not yet stored', async () => {
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('celcius drink', [createFinalizeCandidate('one')], { mode: 'discovery_preview' }),
    )

    const response = createResponseRecorder()
    const url = new URL('http://localhost/api/search/query-quality')
    url.searchParams.set('token', 'opaque-discovery-token')
    url.searchParams.set('query', 'celcius drink')

    await handleQueryQualityPoll({ url: url.toString() }, response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ready: false })
  })

  it('returns a minimal suggestion from query-quality poll when review is ready', async () => {
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('celcius drink', [createFinalizeCandidate('one')], {
        mode: 'discovery_preview',
        queryQuality: {
          status: 'ready',
          classification: 'likely_typo',
          originalQuery: 'celcius drink',
          suggestedQuery: 'celsius drink',
          confidence: 'high',
          reason: 'Celsius appears to be the intended energy drink brand.',
          shouldSuggest: true,
          reviewedAt: '2026-04-14T12:00:00.000Z',
        },
      }),
    )

    const response = createResponseRecorder()
    const url = new URL('http://localhost/api/search/query-quality')
    url.searchParams.set('token', 'opaque-discovery-token')
    url.searchParams.set('query', 'celcius drink')

    await handleQueryQualityPoll({ url: url.toString() }, response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      ready: true,
      shouldSuggest: true,
      originalQuery: 'celcius drink',
      suggestedQuery: 'celsius drink',
      reason: 'Celsius appears to be the intended energy drink brand.',
      classification: 'likely_typo',
      confidence: 'high',
    })
  })

  it('returns no suggestion UI data from query-quality poll when review skipped', async () => {
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('shabbos art', [createFinalizeCandidate('one')], {
        mode: 'discovery_preview',
        queryQuality: {
          status: 'skipped',
          classification: 'ambiguous_language',
          originalQuery: 'shabbos art',
          suggestedQuery: '',
          confidence: 'medium',
          reason: 'Original wording may be intentional.',
          shouldSuggest: false,
          reviewedAt: '2026-04-14T12:00:00.000Z',
        },
      }),
    )

    const response = createResponseRecorder()
    const url = new URL('http://localhost/api/search/query-quality')
    url.searchParams.set('token', 'opaque-discovery-token')
    url.searchParams.set('query', 'shabbos art')

    await handleQueryQualityPoll({ url: url.toString() }, response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      ready: true,
      shouldSuggest: false,
    })
  })

  it('rejects query-quality poll with missing token or query', async () => {
    const response = createResponseRecorder()

    await handleQueryQualityPoll({ url: 'http://localhost/api/search/query-quality' }, response)

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ error: 'token and query are required.' })
  })

  it('rejects query-quality poll with invalid query', async () => {
    const response = createResponseRecorder()
    const url = new URL('http://localhost/api/search/query-quality')
    url.searchParams.set('token', 'opaque-discovery-token')
    url.searchParams.set('query', 'x')

    await handleQueryQualityPoll({ url: url.toString() }, response)

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ error: 'Invalid query.' })
  })

  it('rejects query-quality poll when the token does not match the stored discovery session', async () => {
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('celcius drink', [createFinalizeCandidate('one')]),
    )
    readStoredSearchCacheEntry.mockResolvedValueOnce(null)

    const response = createResponseRecorder()
    const url = new URL('http://localhost/api/search/query-quality')
    url.searchParams.set('token', 'wrong-opaque-token')
    url.searchParams.set('query', 'celcius drink')

    await handleQueryQualityPoll({ url: url.toString() }, response)

    expect(response.statusCode).toBe(409)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Your search session expired. Start a new search.',
    })
  })

  it('adds CORS headers to the enrichment stream response', async () => {
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')], {
        mode: 'discovery_preview',
        enrichment: {
          entries: [{ candidate_id: 'one', fit_reason: 'Good city stroller', caveat: 'Slightly pricey' }],
          model: 'gpt-5-mini',
        },
      }),
    )

    const response = createResponseRecorder()
    const request = {
      url: 'http://localhost/api/search/enrichment-stream?token=opaque-discovery-token&query=stroller',
      on() {},
    }

    await handleEnrichmentStream(request, response)

    expect(response.statusCode).toBe(200)
    expect(response.headers).toEqual(expect.objectContaining({
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      Vary: 'Origin',
      'Content-Type': 'text/event-stream',
    }))
    expect(response.body).toContain('"ready":true')
  })

  it('rejects enrichment poll with missing token or query', async () => {
    const response = createResponseRecorder()

    await handleEnrichmentPoll({ url: 'http://localhost/api/search/enrichment' }, response)

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ error: 'token and query are required.' })
  })

  it('rejects enrichment poll when the token does not match the stored discovery session', async () => {
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')]),
    )
    readStoredSearchCacheEntry.mockResolvedValueOnce(null)

    const response = createResponseRecorder()
    const url = new URL('http://localhost/api/search/enrichment')
    url.searchParams.set('token', 'wrong-opaque-token')
    url.searchParams.set('query', 'stroller')

    await handleEnrichmentPoll({ url: url.toString() }, response)

    expect(response.statusCode).toBe(409)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Your search session expired. Start a new search.',
    })
  })

  it('stores mini enrichment in discovery cache after haiku finalizes', async () => {
    mockFinalizeEnv()
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.4-nano',
      lockedIds: ['one'],
      usage: null,
    })
    const { miniEnrichSelectedCandidates } = await import('./lib/ai-selector.js')
    miniEnrichSelectedCandidates.mockResolvedValue({
      model: 'gpt-5-mini',
      enriched: [{ candidate_id: 'one', fit_reason: 'Good match', caveat: 'A bit pricey' }],
      enrichedIds: ['one'],
      usage: null,
      preservedOrder: true,
    })
    const cacheEntry = createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')])
    readStoredSearchCacheEntry.mockResolvedValue(cacheEntry)

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({ ...createFinalizeDiscoveryBody(), followUpNotes: 'city use' }),
        { 'x-forwarded-for': '203.0.113.40' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)

    await waitForExpectation(() => {
      expect(writeStoredSearchCacheEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          productQuery: 'stroller',
          scope: 'guided_discovery_session:opaque-discovery-token',
          selection: expect.objectContaining({
            enrichment: expect.objectContaining({
              entries: [{ candidate_id: 'one', fit_reason: 'Good match', caveat: 'A bit pricey' }],
              model: 'gpt-5-mini',
              preservedOrder: true,
            }),
          }),
        }),
      )
    })
  })

  it('does not write stale mini enrichment onto a newer discovery token for the same query', async () => {
    mockFinalizeEnv({
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.4-nano',
      lockedIds: ['one'],
      usage: null,
    })
    const { miniEnrichSelectedCandidates } = await import('./lib/ai-selector.js')
    miniEnrichSelectedCandidates.mockResolvedValue({
      model: 'gpt-5-mini',
      enriched: [{ candidate_id: 'one', fit_reason: 'Old context match', caveat: 'Not formal enough' }],
      enrichedIds: ['one'],
      usage: null,
      preservedOrder: true,
    })

    const staleEntry = createDiscoveryCacheEntry(
      'stroller',
      [createFinalizeCandidate('one')],
      { mode: 'discovery_preview' },
      'opaque-discovery-token',
    )
    const newerEntry = createDiscoveryCacheEntry(
      'stroller',
      [createFinalizeCandidate('one')],
      { mode: 'discovery_preview' },
      'newer-discovery-token',
    )
    const detailFetch = createDeferred()

    readStoredSearchCacheEntry
      .mockResolvedValueOnce(staleEntry)
      .mockResolvedValueOnce(newerEntry)

    vi.stubGlobal('fetch', vi.fn(() => detailFetch.promise))

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({ ...createFinalizeDiscoveryBody(), followUpNotes: 'city use' }),
        { 'x-forwarded-for': '203.0.113.42' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)

    detailFetch.resolve({
      ok: true,
      json: async () => ({
        results: [{ content: { bullet_points: '', description: '' } }],
      }),
    })

    await waitForExpectation(() => {
      expect(miniEnrichSelectedCandidates).toHaveBeenCalled()
    })

    expect(writeStoredSearchCacheEntry).not.toHaveBeenCalled()
  })

  it('keeps finalize async while product details and mini enrichment run in the background', async () => {
    mockFinalizeEnv({
      OXYLABS_USERNAME: 'oxy-user',
      OXYLABS_PASSWORD: 'oxy-pass',
    })
    haikuLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.4-nano',
      lockedIds: ['one'],
      usage: null,
    })
    const { miniEnrichSelectedCandidates } = await import('./lib/ai-selector.js')
    miniEnrichSelectedCandidates.mockResolvedValue({
      model: 'gpt-5-mini',
      enriched: [{ candidate_id: 'one', fit_reason: 'Good match', caveat: 'A bit pricey' }],
      enrichedIds: ['one'],
      usage: null,
      preservedOrder: true,
    })
    const cacheEntry = createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')])
    readStoredSearchCacheEntry.mockResolvedValue(cacheEntry)
    const detailFetch = createDeferred()

    vi.stubGlobal('fetch', vi.fn(() => detailFetch.promise))

    const response = createResponseRecorder()

    await handleFinalizeSelection(
      createFinalizeRequest(
        JSON.stringify({ ...createFinalizeDiscoveryBody(), followUpNotes: 'city use' }),
        { 'x-forwarded-for': '203.0.113.41' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        results: [
          expect.objectContaining({
            id: 'one',
            feature_bullets: [],
          }),
        ],
        selection: expect.objectContaining({
          miniEnrichmentStatus: 'running_async',
        }),
      }),
    )
    expect(writeStoredSearchCacheEntry).not.toHaveBeenCalled()

    detailFetch.resolve({
      ok: true,
      json: async () => ({
        results: [{ content: { bullet_points: '', description: '' } }],
      }),
    })

    await waitForExpectation(() => {
      expect(writeStoredSearchCacheEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          productQuery: 'stroller',
          scope: 'guided_discovery_session:opaque-discovery-token',
          selection: expect.objectContaining({
            enrichment: expect.objectContaining({
              entries: [{ candidate_id: 'one', fit_reason: 'Good match', caveat: 'A bit pricey' }],
            }),
          }),
        }),
      )
    })
  })

  it('includes Vary: Origin on OPTIONS preflight responses', async () => {
    const server = createApiServer()
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/search/discover`, {
        method: 'OPTIONS',
      })

      expect(response.status).toBe(204)
      expect(response.headers.get('vary')).toBe('Origin')
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })
})
