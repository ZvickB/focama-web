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
  recordSearchHistory: vi.fn(),
  takeSharedRateLimitToken: vi.fn().mockResolvedValue(null),
  writeProductDetailsCacheEntries: vi.fn().mockResolvedValue(undefined),
  writeStoredSearchCacheEntry: vi.fn(),
}))

import {
  createApiServer,
  handleCachedSearch,
  handleEnrichmentPoll,
  handleFinalizeSelection,
  handleRetryAdvice,
  handleSearchDebug,
  handleSupabaseHealth,
} from './server.js'
import { resetRateLimitStore } from './lib/rate-limit.js'
import { haikuLockWinnersAndBadges, miniEnrichSelectedCandidates } from './lib/ai-selector.js'
import { generateRetryAdvice } from './lib/retry-advice.js'
import { getSupabaseHealth, readStoredSearchCacheEntry, writeStoredSearchCacheEntry } from './lib/search-storage.js'
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
      this.body = body
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
    miniEnrichSelectedCandidates.mockReset()
    miniEnrichSelectedCandidates.mockResolvedValue({
      model: 'gpt-5-mini',
      enriched: [],
      enrichedIds: [],
      usage: null,
      preservedOrder: true,
    })
    readStoredSearchCacheEntry.mockResolvedValue(null)
  })

  it('returns cached search results and slices them to six items', async () => {
    readStoredSearchCacheEntry.mockResolvedValue({
      cachedAt: '2026-03-17T12:00:00.000Z',
      results: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }, { id: '6' }, { id: '7' }],
    })

    const response = createResponseRecorder()

    await handleCachedSearch(new URL('http://localhost/api/search/cache?query=lego&details=for%20kids'), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      results: [
        { id: '1', badgeLabel: 'Best match' },
        { id: '2', badgeLabel: '' },
        { id: '3', badgeLabel: '' },
        { id: '4', badgeLabel: '' },
        { id: '5', badgeLabel: '' },
        { id: '6', badgeLabel: '' },
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
        candidates: [{ id: 'cached-1', title: 'Thermos bottle' }],
      },
      results: [{ id: 'cached-1', title: 'Thermos bottle' }],
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
          candidateAwarePriorReady: false,
          candidateAwarePriorGeneratedAt: null,
          candidateAwarePriorCandidateCount: 0,
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
          enrichmentMode: 'async',
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
          scope: 'guided_discovery',
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
          scope: 'guided_discovery',
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

  it('keeps finalize async even when legacy blocking mode is configured', async () => {
    mockFinalizeEnv({
      FINALIZE_ENRICHMENT_MODE: 'blocking',
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
          enrichmentMode: 'async',
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
          scope: 'guided_discovery',
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
