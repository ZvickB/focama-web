import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/ai-selector.js', async () => {
  const actual = await vi.importActual('./lib/ai-selector.js')

  return {
    ...actual,
    nanoLockWinnersAndBadges: vi.fn(),
    miniEnrichSelectedCandidates: vi.fn().mockResolvedValue({
      model: 'gpt-5-mini',
      enriched: [],
      enrichedIds: [],
      usage: null,
      preservedOrder: true,
    }),
    selectAiResults: vi.fn(),
  }
})

vi.mock('./lib/result-filter.js', async () => {
  const actual = await vi.importActual('./lib/result-filter.js')

  return {
    ...actual,
    getFilteredSearchArtifacts: vi.fn(),
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
  handleDiscoverySearch,
  handleEnrichmentPoll,
  handleFinalizeSelection,
  handleLiveSearch,
  handleQueryFramingFields,
  handleSearchDebug,
  handleSupabaseHealth,
} from './server.js'
import { resetRateLimitStore } from './lib/rate-limit.js'
import { miniEnrichSelectedCandidates, nanoLockWinnersAndBadges, selectAiResults } from './lib/ai-selector.js'
import { getFilteredSearchArtifacts } from './lib/result-filter.js'
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

describe('server handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    resetRateLimitStore()
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

  it('returns a server error when the live search API key is missing', async () => {
    getEnv.mockReturnValue('')

    const response = createResponseRecorder()

    await handleLiveSearch(new URL('http://localhost/api/search/live?query=lego'), response)

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.body)).toEqual({
      error: 'SERPAPI_API_KEY is missing from the root .env file.',
    })
  })

  it('returns cached guided discovery results when present', async () => {
    getEnv.mockReturnValue('serp-key')
    readStoredSearchCacheEntry.mockResolvedValue({
      cachedAt: '2026-03-17T12:00:00.000Z',
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Cached search results',
        similarQueries: [],
        candidates: [{ id: 'cached-1', title: 'Thermos bottle' }],
      },
      results: [{ id: 'cached-1', title: 'Thermos bottle' }],
      selection: { mode: 'discovery_preview' },
      source: 'guided_discovery',
    })

    const response = createResponseRecorder()

    await handleDiscoverySearch(new URL('http://localhost/api/search/discover?query=thermos'), response)

    expect(response.statusCode).toBe(200)
    expect(readStoredSearchCacheEntry).toHaveBeenCalledWith({
      productQuery: 'thermos',
      details: '',
      scope: 'guided_discovery',
    })
    expect(writeStoredSearchCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        productQuery: 'thermos',
        details: '',
        discoveryToken: expect.any(String),
        scope: 'guided_discovery',
      }),
    )
    const payload = JSON.parse(response.body)
    expect(payload).toEqual({
      discoveryToken: expect.any(String),
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Cached search results',
        similarQueries: [],
        candidates: [{ id: 'cached-1', title: 'Thermos bottle' }],
      },
      previewResults: [
        {
          id: 'cached-1',
          title: 'Thermos bottle',
          badgeLabel: 'Best match',
        },
      ],
      source: 'cache',
      cachedAt: '2026-03-17T12:00:00.000Z',
    })
    expect(payload.discoveryToken).not.toBe('guided_discovery:thermos|')
    expect(response.headers.Vary).toBe('Origin')
  })

  it('writes guided discovery results to cache after a miss', async () => {
    getEnv.mockReturnValue('serp-key')
    getFilteredSearchArtifacts.mockReturnValue({
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Results for exact spelling',
        similarQueries: [],
        candidates: [{ id: 'live-1', title: 'Thermos bottle' }],
      },
      results: [{ id: 'live-1', title: 'Thermos bottle' }],
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ shopping_results: [{ title: 'Thermos bottle' }] }),
      }),
    )

    const response = createResponseRecorder()

    await handleDiscoverySearch(new URL('http://localhost/api/search/discover?query=thermos'), response)

    expect(response.statusCode).toBe(200)
    expect(writeStoredSearchCacheEntry).toHaveBeenCalledWith({
      productQuery: 'thermos',
      details: '',
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Results for exact spelling',
        similarQueries: [],
        candidates: [{ id: 'live-1', title: 'Thermos bottle' }],
      },
      discoveryToken: expect.any(String),
      results: [{ id: 'live-1', title: 'Thermos bottle' }],
      selection: {
        mode: 'discovery_preview',
        model: null,
        selectedCandidateIds: ['live-1'],
        details: 'Discovery preview results were cached for the guided search flow. Finalized picks stay request-specific.',
      },
      source: 'guided_discovery',
      scope: 'guided_discovery',
    })
    const payload = JSON.parse(response.body)
    expect(payload).toEqual({
      discoveryToken: expect.any(String),
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Results for exact spelling',
        similarQueries: [],
        candidates: [{ id: 'live-1', title: 'Thermos bottle' }],
      },
      previewResults: [{ id: 'live-1', title: 'Thermos bottle' }],
    })
    expect(payload.discoveryToken).not.toBe('guided_discovery:thermos|')
  })

  it('returns a server error when the OpenAI API key is missing', async () => {
    getEnv.mockImplementation((name) => (name === 'SERPAPI_API_KEY' ? 'serp-key' : ''))

    const response = createResponseRecorder()

    await handleLiveSearch(new URL('http://localhost/api/search/live?query=lego'), response)

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.body)).toEqual({
      error: 'OPENAI_API_KEY is missing from the root .env file.',
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
          '/api/search/discover',
          '/api/search/refine',
          '/api/search/finalize',
        ],
        manualCombinedRoute: '/api/search/live',
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
        liveSearch: {
          usesCache: false,
          callsSerpApi: true,
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

  it('returns background query-framing fields without blocking the refine question lane', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      return ''
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          usage: {
            input_tokens: 24,
            output_tokens: 12,
            total_tokens: 36,
            output_tokens_details: {
              reasoning_tokens: 3,
            },
          },
          output_text: JSON.stringify({
            category_hint: 'travel stroller',
            framing_summary: 'Portability is likely the main tradeoff.',
            tradeoff_axes: ['fold size', 'weight'],
            refinement_hints: ['Ask about airline carry-on fit.'],
          }),
        }),
      }),
    )

    const response = createResponseRecorder()

    await handleQueryFramingFields(
      new URL('http://localhost/api/search/framing-fields?query=travel%20stroller'),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(response.headers['Server-Timing']).toContain('openai')
    expect(response.headers['X-Request-Id']).toEqual(expect.any(String))
    expect(JSON.parse(response.body)).toEqual({
      queryFraming: expect.objectContaining({
        layer: 'query_framing',
        query: 'travel stroller',
        categoryHint: 'travel stroller',
        tradeoffAxes: ['fold size', 'weight'],
      }),
      usage: {
        inputTokens: 24,
        outputTokens: 12,
        totalTokens: 36,
        reasoningTokens: 3,
      },
      queryFramingMode: 'framing_fields',
      requestId: expect.any(String),
    })
  })

  it('keeps guided discovery cache separate from uncached live search responses', async () => {
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
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Cached discovery results',
        similarQueries: [],
        candidates: [{ id: 'cached-1', title: 'Thermos bottle' }],
      },
      results: [{ id: 'cached-1', title: 'Thermos bottle' }],
      selection: { mode: 'discovery_preview' },
      source: 'guided_discovery',
    })
    readStoredSearchCacheEntry.mockResolvedValueOnce(null)
    getFilteredSearchArtifacts.mockReturnValue({
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Results for exact spelling',
        similarQueries: [],
        candidates: [{ id: 'live-1', title: 'Thermos bottle' }],
      },
      results: [{ id: 'live-1', title: 'Thermos bottle' }],
    })
    selectAiResults.mockResolvedValue({
      model: 'gpt-5-mini',
      selectedCandidateIds: ['live-1'],
      results: [{ id: 'live-1', title: 'Thermos bottle', reasons: [], drawbacks: [] }],
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ shopping_results: [{ title: 'Thermos bottle' }] }),
      }),
    )

    const discoveryResponse = createResponseRecorder()
    await handleDiscoverySearch(new URL('http://localhost/api/search/discover?query=thermos'), discoveryResponse)

    const liveResponse = createResponseRecorder()
    await handleLiveSearch(new URL('http://localhost/api/search/live?query=thermos'), liveResponse)

    expect(discoveryResponse.statusCode).toBe(200)
    expect(liveResponse.statusCode).toBe(200)
    expect(readStoredSearchCacheEntry).toHaveBeenCalledTimes(1)
    expect(readStoredSearchCacheEntry).toHaveBeenCalledWith({
      productQuery: 'thermos',
      details: '',
      scope: 'guided_discovery',
    })
    expect(writeStoredSearchCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        productQuery: 'thermos',
        details: '',
        discoveryToken: expect.any(String),
        scope: 'guided_discovery',
      }),
    )
  })

  it('rejects obvious gibberish product queries before calling SerpApi', async () => {
    getEnv.mockReturnValue('test-key')

    const response = createResponseRecorder()

    await handleLiveSearch(new URL('http://localhost/api/search/live?query=jhljlhl'), response)

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Try a real product topic, like "lego", "desk lamp", or "travel stroller".',
    })
  })

  it('rate limits repeated live searches from the same ip address', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'SERPAPI_API_KEY') {
        return 'serp-key'
      }

      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      return ''
    })

    getFilteredSearchArtifacts.mockReturnValue({
      candidatePool: {
        query: 'stroller',
        details: '',
        combinedSearchText: 'stroller',
        searchState: 'Results for exact spelling',
        similarQueries: [],
        candidates: [],
      },
      results: [{ id: 'live-1', title: 'Travel stroller' }],
    })
    selectAiResults.mockResolvedValue({
      model: 'gpt-5-mini',
      selectedCandidateIds: ['live-1'],
      results: [{ id: 'live-1', title: 'Travel stroller', reasons: [], drawbacks: [] }],
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ shopping_results: [{ title: 'Travel stroller' }] }),
      }),
    )

    for (let index = 0; index < 15; index += 1) {
      const response = createResponseRecorder()

      await handleLiveSearch(
        new URL('http://localhost/api/search/live?query=stroller'),
        response,
        { headers: { 'x-forwarded-for': '203.0.113.10' } },
      )

      expect(response.statusCode).toBe(200)
    }

    const limitedResponse = createResponseRecorder()

    await handleLiveSearch(
      new URL('http://localhost/api/search/live?query=stroller'),
      limitedResponse,
      { headers: { 'x-forwarded-for': '203.0.113.10' } },
    )

    expect(limitedResponse.statusCode).toBe(429)
    expect(JSON.parse(limitedResponse.body)).toEqual({
      error: 'Too many searches from this connection. Please wait about 10 seconds and try again.',
    })
  })

  it('rate limits repeated guided discovery searches from the same ip address', async () => {
    getEnv.mockReturnValue('serp-key')
    getFilteredSearchArtifacts.mockReturnValue({
      candidatePool: {
        query: 'stroller',
        details: '',
        combinedSearchText: 'stroller',
        searchState: 'Results for exact spelling',
        similarQueries: [],
        candidates: [{ id: 'live-1', title: 'Travel stroller' }],
      },
      results: [{ id: 'live-1', title: 'Travel stroller' }],
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ shopping_results: [{ title: 'Travel stroller' }] }),
      }),
    )

    for (let index = 0; index < 15; index += 1) {
      const response = createResponseRecorder()

      await handleDiscoverySearch(
        new URL('http://localhost/api/search/discover?query=stroller'),
        response,
        { headers: { 'x-forwarded-for': '203.0.113.11' } },
      )

      expect(response.statusCode).toBe(200)
    }

    const limitedResponse = createResponseRecorder()

    await handleDiscoverySearch(
      new URL('http://localhost/api/search/discover?query=stroller'),
      limitedResponse,
      { headers: { 'x-forwarded-for': '203.0.113.11' } },
    )

    expect(limitedResponse.statusCode).toBe(429)
    expect(JSON.parse(limitedResponse.body)).toEqual({
      error: 'Too many searches from this connection. Please wait about 10 seconds and try again.',
    })
  })

  it('returns normalized live search results when SerpApi succeeds', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'SERPAPI_API_KEY') {
        return 'serp-key'
      }

      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      return ''
    })
    getFilteredSearchArtifacts.mockReturnValue({
      candidatePool: {
        query: 'stroller',
        details: 'airport travel',
        combinedSearchText: 'stroller airport travel',
        searchState: 'Results for exact spelling',
        similarQueries: ['compact stroller'],
        candidates: [
          {
            id: 'live-1',
            score: 24.5,
            title: 'Travel stroller',
            description: 'Lightweight stroller for flights',
            source: 'Target',
            price: '$199.99',
            numericPrice: 199.99,
            rating: 4.7,
            reviewCount: 342,
            delivery: 'Free shipping',
            tag: 'Top rated',
            extensions: ['Carry-on friendly'],
            multipleSources: true,
            link: 'https://example.com/stroller',
            image: 'https://example.com/stroller.jpg',
            reasons: ['Available from Target'],
            matchSignals: {
              titleMatches: 1,
              supportMatches: 1,
              detailMatches: 1,
              exactMatchSearchState: true,
              hasMultipleSources: true,
              hasDeliveryInfo: true,
              hasTag: true,
            },
          },
        ],
      },
      results: [{ id: 'live-1', title: 'Travel stroller' }],
    })
    selectAiResults.mockResolvedValue({
      model: 'gpt-5-mini',
      usage: {
        inputTokens: 420,
        outputTokens: 96,
        totalTokens: 516,
        reasoningTokens: 44,
      },
      selectedCandidateIds: ['live-1'],
      results: [
        {
          id: 'live-1',
          title: 'Travel stroller',
          subtitle: 'Target',
          reasons: ['AI fit: Best for airport travel'],
          drawbacks: ['Pricier than some umbrella strollers.'],
          badgeLabel: 'Best match',
        },
      ],
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ shopping_results: [{ title: 'Travel stroller' }] }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const response = createResponseRecorder()

    await handleLiveSearch(
      new URL('http://localhost/api/search/live?query=stroller&details=airport%20travel'),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      candidatePool: {
        query: 'stroller',
        details: 'airport travel',
        combinedSearchText: 'stroller airport travel',
        searchState: 'Results for exact spelling',
        similarQueries: ['compact stroller'],
        candidates: [
          {
            id: 'live-1',
            score: 24.5,
            title: 'Travel stroller',
            description: 'Lightweight stroller for flights',
            source: 'Target',
            price: '$199.99',
            numericPrice: 199.99,
            rating: 4.7,
            reviewCount: 342,
            delivery: 'Free shipping',
            tag: 'Top rated',
            extensions: ['Carry-on friendly'],
            multipleSources: true,
            link: 'https://example.com/stroller',
            image: 'https://example.com/stroller.jpg',
            reasons: ['Available from Target'],
            matchSignals: {
              titleMatches: 1,
              supportMatches: 1,
              detailMatches: 1,
              exactMatchSearchState: true,
              hasMultipleSources: true,
              hasDeliveryInfo: true,
              hasTag: true,
            },
          },
        ],
      },
      results: [
        {
          id: 'live-1',
          title: 'Travel stroller',
          subtitle: 'Target',
          reasons: ['AI fit: Best for airport travel'],
          drawbacks: ['Pricier than some umbrella strollers.'],
          badgeLabel: 'Best match',
        },
      ],
      selection: {
        mode: 'ai',
        model: 'gpt-5-mini',
        usage: {
          inputTokens: 420,
          outputTokens: 96,
          totalTokens: 516,
          reasoningTokens: 44,
        },
        selectedCandidateIds: ['live-1'],
        details: 'AI selected the final recommendations from the cleaned candidate pool.',
      },
      usage: {
        openai: {
          inputTokens: 420,
          outputTokens: 96,
          totalTokens: 516,
          reasoningTokens: 44,
        },
      },
    })

    const requestedUrl = fetchMock.mock.calls[0][0]
    expect(requestedUrl).toBeInstanceOf(URL)
    expect(requestedUrl.searchParams.get('q')).toBe('stroller airport travel')
    expect(requestedUrl.searchParams.get('api_key')).toBe('serp-key')
    expect(requestedUrl.searchParams.get('engine')).toBe('google_shopping')
    expect(selectAiResults).toHaveBeenCalledWith({
      candidatePool: expect.any(Object),
      finalResultLimit: 6,
      apiKey: 'openai-key',
      model: expect.any(String),
    })
  })

  it('falls back to filtered live search results when AI returns no picks', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'SERPAPI_API_KEY') {
        return 'serp-key'
      }

      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      return ''
    })
    getFilteredSearchArtifacts.mockReturnValue({
      candidatePool: {
        query: 'stroller',
        details: '',
        combinedSearchText: 'stroller',
        searchState: 'Results for exact spelling',
        similarQueries: [],
        candidates: [{ id: 'live-1', title: 'Travel stroller' }],
      },
      results: [{ id: 'live-1', title: 'Travel stroller', badgeLabel: 'Best match' }],
    })
    selectAiResults.mockResolvedValue({
      model: 'gpt-5-mini',
      selectedCandidateIds: [],
      results: [],
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ shopping_results: [{ title: 'Travel stroller' }] }),
      }),
    )

    const response = createResponseRecorder()

    await handleLiveSearch(
      new URL('http://localhost/api/search/live?query=stroller'),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      candidatePool: {
        query: 'stroller',
        details: '',
        combinedSearchText: 'stroller',
        searchState: 'Results for exact spelling',
        similarQueries: [],
        candidates: [{ id: 'live-1', title: 'Travel stroller' }],
      },
      results: [{ id: 'live-1', title: 'Travel stroller', badgeLabel: 'Best match' }],
      selection: {
        mode: 'rules_fallback',
        model: null,
        selectedCandidateIds: ['live-1'],
        details: 'Rules-based fallback was used.',
      },
      usage: {
        openai: null,
      },
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
    expect(nanoLockWinnersAndBadges).not.toHaveBeenCalled()
  })

  it('nano locks the shortlist for empty-note finalize and returns a fast response', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    nanoLockWinnersAndBadges.mockResolvedValue({
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
    expect(nanoLockWinnersAndBadges).toHaveBeenCalledWith({
      candidatePool: expect.objectContaining({
        details: '',
        candidates: [expect.objectContaining({ id: 'one' })],
      }),
      finalResultLimit: 6,
      apiKey: 'openai-key',
      model: expect.any(String),
    })
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        requestMode: 'guided_empty_notes',
        debug: expect.objectContaining({
          finalizeFastLayer: 'finalize_fast',
          flowPath: 'nano_lock',
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
          strategy: 'nano_lock',
          flowPath: 'nano_lock',
        }),
        usage: expect.objectContaining({
          openai: expect.objectContaining({
            totalTokens: 210,
          }),
        }),
      }),
    )
  })

  it('caps finalize note length before calling OpenAI', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    nanoLockWinnersAndBadges.mockResolvedValue({
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
    expect(nanoLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(nanoLockWinnersAndBadges).toHaveBeenCalledWith({
      candidatePool: expect.objectContaining({
        details: `Priorities: lightweight, easy fold. Notes: ${'n'.repeat(500)}`,
        candidates: expect.arrayContaining(candidates.map((candidate) => expect.objectContaining({ id: candidate.id }))),
      }),
      finalResultLimit: 6,
      apiKey: 'openai-key',
      model: expect.any(String),
    })
    expect(nanoLockWinnersAndBadges.mock.calls[0][0].candidatePool.candidates).toHaveLength(20)
    expect(nanoLockWinnersAndBadges.mock.calls[0][0].candidatePool.details.endsWith('n'.repeat(500))).toBe(true)
  })

  it('nano locks the shortlist for refined finalize and includes notes in candidatePool details', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    nanoLockWinnersAndBadges.mockResolvedValue({
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
    expect(nanoLockWinnersAndBadges).toHaveBeenCalledWith({
      candidatePool: expect.objectContaining({
        details: 'Notes: best for city travel',
      }),
      finalResultLimit: 6,
      apiKey: 'openai-key',
      model: expect.any(String),
    })
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        requestMode: 'guided_refined',
        debug: expect.objectContaining({
          finalizeFastLayer: 'finalize_fast',
          flowPath: 'nano_lock',
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
          strategy: 'nano_lock',
          flowPath: 'nano_lock',
        }),
      }),
    )
  })

  it('adds Oxylabs feature bullets to the finalize response and mini enrichment context when available', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      if (name === 'OXYLABS_USERNAME') {
        return 'oxy-user'
      }

      if (name === 'OXYLABS_PASSWORD') {
        return 'oxy-pass'
      }

      return ''
    })
    nanoLockWinnersAndBadges.mockResolvedValue({
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{
            content: {
              bullet_points: 'One-hand fold\nCompact enough for overhead bins',
              description: 'A compact stroller built for airport travel.',
            },
          }],
        }),
      }),
    )
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
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        results: [
          expect.objectContaining({
            id: 'one',
            feature_bullets: ['One-hand fold', 'Compact enough for overhead bins'],
          }),
        ],
        finalizeFast: expect.objectContaining({
          shortlist: [
            expect.objectContaining({
              id: 'one',
              feature_bullets: ['One-hand fold', 'Compact enough for overhead bins'],
            }),
          ],
        }),
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

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
  })

  it('keeps shortlisted products when an Oxylabs detail call fails and falls back to empty feature bullets', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      if (name === 'OXYLABS_USERNAME') {
        return 'oxy-user'
      }

      if (name === 'OXYLABS_PASSWORD') {
        return 'oxy-pass'
      }

      return ''
    })
    nanoLockWinnersAndBadges.mockResolvedValue({
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
        feature_bullets: ['One-hand fold', 'Compact enough for overhead bins'],
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
          feature_bullets: ['One-hand fold', 'Compact enough for overhead bins'],
        }),
        expect.objectContaining({
          id: 'two',
          feature_bullets: [],
        }),
      ],
    }))

    await new Promise((resolve) => setTimeout(resolve, 0))

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
    expect(
      miniEnrichSelectedCandidates.mock.calls[0][0].candidatePool.candidates[1].feature_bullets ?? [],
    ).toEqual([])
    expect(miniEnrichSelectedCandidates.mock.calls[0][0].candidatePool.candidates[1].productDescription ?? '').toBe('')
  })

  it('prefers OPENAI_FINALIZE_CONTEXT_MODEL over the shared model for guided finalize with context', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      if (name === 'OPENAI_FINALIZE_CONTEXT_MODEL') {
        return 'gpt-5.4-nano'
      }

      if (name === 'OPENAI_MODEL') {
        return 'gpt-5-mini'
      }

      return ''
    })
    nanoLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.4-nano',
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
    expect(nanoLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(nanoLockWinnersAndBadges.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'openai-key',
        model: 'gpt-5.4-nano',
      }),
    )
  })

  it('defaults context-added finalize requests to the nano model lane', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      if (name === 'OPENAI_FINALIZE_MODEL') {
        return 'gpt-5-mini'
      }

      return ''
    })
    nanoLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.4-nano',
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
    expect(nanoLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(nanoLockWinnersAndBadges.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'openai-key',
        model: 'gpt-5.4-nano',
      }),
    )
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        debug: expect.objectContaining({
          finalizeModel: 'gpt-5.4-nano',
          finalizeModelPath: 'context_added',
        }),
        selection: expect.objectContaining({
          model: 'gpt-5.4-nano',
          modelPath: 'context_added',
        }),
      }),
    )
  })

  it('lets OPENAI_FINALIZE_CONTEXT_MODEL override the default context finalize lane', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      if (name === 'OPENAI_FINALIZE_MODEL') {
        return 'gpt-5-mini'
      }

      if (name === 'OPENAI_FINALIZE_CONTEXT_MODEL') {
        return 'gpt-5.2'
      }

      return ''
    })
    nanoLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5.2',
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
    expect(nanoLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(nanoLockWinnersAndBadges.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'openai-key',
        model: 'gpt-5.2',
      }),
    )
  })

  it('keeps empty-note finalize requests on the baseline finalize model lane', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      if (name === 'OPENAI_FINALIZE_MODEL') {
        return 'gpt-5-mini'
      }

      return ''
    })
    nanoLockWinnersAndBadges.mockResolvedValue({
      model: 'gpt-5-mini',
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
    expect(nanoLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(nanoLockWinnersAndBadges.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'openai-key',
        model: 'gpt-5-mini',
      }),
    )
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        debug: expect.objectContaining({
          finalizeModel: 'gpt-5-mini',
          finalizeModelPath: 'baseline',
        }),
        selection: expect.objectContaining({
          model: 'gpt-5-mini',
          modelPath: 'baseline',
        }),
      }),
    )
  })

  it('passes retry feedback into finalize selection details and returns the retry count', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    nanoLockWinnersAndBadges.mockResolvedValue({
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
    expect(nanoLockWinnersAndBadges).toHaveBeenCalledTimes(1)
    expect(nanoLockWinnersAndBadges.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        candidatePool: expect.objectContaining({
          details:
            'Notes: keep it lightweight. Retry feedback: These picks still feel too bulky for city travel.. Excluded previous picks: one',
          candidates: [expect.objectContaining({ id: 'two' })],
        }),
        finalResultLimit: 6,
        apiKey: 'openai-key',
        model: expect.any(String),
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
          openai: {
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
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    nanoLockWinnersAndBadges.mockResolvedValue({
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
    expect(nanoLockWinnersAndBadges).not.toHaveBeenCalled()
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
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    nanoLockWinnersAndBadges.mockResolvedValue({
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

  it('stores mini enrichment in discovery cache after nano finalizes', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    nanoLockWinnersAndBadges.mockResolvedValue({
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

    // Allow the fire-and-forget enrichment to complete
    await new Promise((resolve) => setTimeout(resolve, 0))

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
