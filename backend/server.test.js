import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/ai-selector.js', async () => {
  const actual = await vi.importActual('./lib/ai-selector.js')

  return {
    ...actual,
    createPreRankArtifact: vi.fn(),
    materializePreRankArtifactResults: vi.fn(),
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
  readStoredSearchCacheEntry: vi.fn(),
  recordSearchHistory: vi.fn(),
  takeSharedRateLimitToken: vi.fn().mockResolvedValue(null),
  writeStoredSearchCacheEntry: vi.fn(),
}))

import {
  handleCachedSearch,
  handleDiscoverySearch,
  handleFinalizeSelection,
  handleLiveSearch,
  handlePrewarmSelection,
  handleSearchDebug,
  handleSupabaseHealth,
} from './server.js'
import { resetRateLimitStore } from './lib/rate-limit.js'
import { createPreRankArtifact, materializePreRankArtifactResults, selectAiResults } from './lib/ai-selector.js'
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
    selection,
    source: 'guided_discovery',
  }
}

function createFinalizeDiscoveryBody(overrides = {}) {
  return {
    query: 'stroller',
    discoveryToken: 'guided_discovery:stroller|',
    ...overrides,
  }
}

describe('server handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    resetRateLimitStore()
    readStoredSearchCacheEntry.mockResolvedValue(null)
    materializePreRankArtifactResults.mockReturnValue({
      selectedCandidateIds: [],
      results: [],
      debug: {
        artifactCandidateCount: 0,
        preRankArtifactReused: false,
        preRankReuseReason: 'artifact_missing_or_invalid',
      },
    })
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
    expect(JSON.parse(response.body)).toEqual({
      discoveryToken: 'guided_discovery:thermos|',
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
      prewarm: {
        artifactReady: false,
        artifactGeneratedAt: null,
      },
      source: 'cache',
      cachedAt: '2026-03-17T12:00:00.000Z',
    })
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
    expect(JSON.parse(response.body)).toEqual({
      discoveryToken: 'guided_discovery:thermos|',
      candidatePool: {
        query: 'thermos',
        details: '',
        combinedSearchText: 'thermos',
        searchState: 'Results for exact spelling',
        similarQueries: [],
        candidates: [{ id: 'live-1', title: 'Thermos bottle' }],
      },
      previewResults: [{ id: 'live-1', title: 'Thermos bottle' }],
      prewarm: {
        artifactReady: false,
        artifactGeneratedAt: null,
      },
    })
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
          prewarmArtifactReady: false,
          prewarmArtifactGeneratedAt: null,
          prewarmArtifactCandidateCount: 0,
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
          '/api/search/prewarm',
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
        guidedPrewarm: {
          usesCache: true,
          callsSerpApi: false,
          callsOpenAi: true,
          artifactReady: false,
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
    expect(writeStoredSearchCacheEntry).not.toHaveBeenCalled()
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

    for (let index = 0; index < 5; index += 1) {
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
      error: 'Too many searches from this connection. Please wait a minute and try again.',
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

    for (let index = 0; index < 5; index += 1) {
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
      error: 'Too many searches from this connection. Please wait a minute and try again.',
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
      error: 'A discovery token is required to finalize the search.',
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
          discoveryToken: 'guided_discovery:thermos|',
        }),
        { 'x-forwarded-for': '203.0.113.22' },
      ),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'The guided discovery token is invalid for this query. Please start the search again.',
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
      error: 'The guided search context expired. Please start the search again.',
    })
    expect(selectAiResults).not.toHaveBeenCalled()
  })

  it('generates and stores a reusable prerank artifact through the prewarm route', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    createPreRankArtifact.mockResolvedValue({
      model: 'gpt-5-mini',
      strategy: 'prerank_single_pass',
      usage: {
        inputTokens: 320,
        outputTokens: 70,
        totalTokens: 390,
        reasoningTokens: 18,
      },
      artifact: {
        version: 1,
        generatedAt: '2026-03-31T12:00:00.000Z',
        model: 'gpt-5-mini',
        query: 'stroller',
        candidateCount: 1,
        rankedCandidates: [
          {
            candidateId: 'one',
            rank: 1,
            baselineFit: 'Strong overall baseline fit.',
            baselineCaution: 'A bit pricier than budget picks.',
          },
        ],
      },
    })
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')]),
    )

    const response = createResponseRecorder()

    await handlePrewarmSelection(
      createFinalizeRequest(
        JSON.stringify({
          ...createFinalizeDiscoveryBody(),
          candidatePool: {
            query: 'stroller',
            details: '',
            combinedSearchText: 'stroller',
            searchState: 'Results for exact spelling',
            similarQueries: ['compact stroller'],
            candidates: [createFinalizeCandidate('one')],
          },
        }),
        { 'x-forwarded-for': '203.0.113.34' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(createPreRankArtifact).toHaveBeenCalledWith({
      candidatePool: expect.objectContaining({
        query: 'stroller',
        candidates: [expect.objectContaining({ id: 'one' })],
      }),
      apiKey: 'openai-key',
      model: expect.any(String),
    })
    expect(writeStoredSearchCacheEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        productQuery: 'stroller',
        scope: 'guided_discovery',
        selection: expect.objectContaining({
          mode: 'discovery_preview',
          preRankArtifact: expect.objectContaining({
            generatedAt: '2026-03-31T12:00:00.000Z',
          }),
          prewarm: expect.objectContaining({
            artifactCandidateCount: 1,
            model: 'gpt-5-mini',
            strategy: 'prerank_single_pass',
            usage: {
              inputTokens: 320,
              outputTokens: 70,
              totalTokens: 390,
              reasoningTokens: 18,
            },
          }),
        }),
      }),
    )
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        requestMode: 'guided_prerank_prewarm',
        prewarm: expect.objectContaining({
          artifactReady: true,
          artifactCandidateCount: 1,
          model: 'gpt-5-mini',
          requestMode: 'guided_prerank_prewarm',
          reusedStoredArtifact: false,
          strategy: 'prerank_single_pass',
        }),
        usage: {
          openai: {
            inputTokens: 320,
            outputTokens: 70,
            totalTokens: 390,
            reasoningTokens: 18,
          },
        },
      }),
    )
  })

  it('reuses the stored prerank artifact directly for empty-note finalize requests', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    materializePreRankArtifactResults.mockReturnValue({
      selectedCandidateIds: ['one'],
      results: [{ id: 'one', title: 'Candidate one', reasons: ['AI fit: Direct artifact reuse'], drawbacks: [] }],
      debug: {
        artifactCandidateCount: 1,
        preRankArtifactReused: true,
        preRankReuseReason: 'artifact_direct',
      },
    })
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')], {
        mode: 'discovery_preview',
        preRankArtifact: {
          version: 1,
          generatedAt: '2026-03-31T12:00:00.000Z',
          model: 'gpt-5-mini',
          rankedCandidates: [
            {
              candidateId: 'one',
              rank: 1,
              baselineFit: 'Strong overall baseline fit.',
              baselineCaution: 'A bit pricier than budget picks.',
            },
          ],
        },
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
    expect(materializePreRankArtifactResults).toHaveBeenCalledTimes(1)
    expect(selectAiResults).not.toHaveBeenCalled()
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        requestMode: 'guided_empty_notes',
        debug: expect.objectContaining({
          flowPath: 'artifact_direct',
          reusedPreRankArtifact: true,
          usedIntentMatchRerank: false,
        }),
        selection: expect.objectContaining({
          mode: 'prewarm_artifact',
          strategy: 'artifact_direct',
          flowPath: 'artifact_direct',
          reusedPreRankArtifact: true,
          usedIntentMatchRerank: false,
        }),
        usage: {
          openai: null,
        },
      }),
    )
  })

  it('caps finalize note length before calling OpenAI', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    selectAiResults.mockResolvedValue({
      model: 'gpt-5-mini',
      usage: {
        inputTokens: 510,
        outputTokens: 84,
        totalTokens: 594,
        reasoningTokens: 38,
      },
      selectedCandidateIds: ['one'],
      results: [{ id: 'one', title: 'Candidate one', reasons: [], drawbacks: [] }],
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
    expect(selectAiResults).toHaveBeenCalledTimes(1)
    expect(selectAiResults).toHaveBeenCalledWith({
      candidatePool: expect.objectContaining({
        details: `Priorities: lightweight, easy fold. Notes: ${'n'.repeat(500)}`,
        candidates: expect.arrayContaining(candidates.map((candidate) => expect.objectContaining({ id: candidate.id }))),
      }),
      finalResultLimit: 6,
      apiKey: 'openai-key',
      model: expect.any(String),
      preRankArtifact: null,
    })
    expect(selectAiResults.mock.calls[0][0].candidatePool.candidates).toHaveLength(20)
    expect(selectAiResults.mock.calls[0][0].candidatePool.details.endsWith('n'.repeat(500))).toBe(true)
  })

  it('passes the stored prerank artifact into refined finalize reranking and returns reuse metadata', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    selectAiResults.mockResolvedValue({
      model: 'gpt-5-mini',
      usage: {
        inputTokens: 180,
        outputTokens: 30,
        totalTokens: 210,
        reasoningTokens: 6,
      },
      selectedCandidateIds: ['one'],
      results: [{ id: 'one', title: 'Candidate one', reasons: ['AI fit: Best for city travel'], drawbacks: [] }],
      strategy: 'artifact_intent_rerank',
      debug: {
        artifactCandidateCount: 1,
        intentMatchRerankUsed: true,
        preRankArtifactReused: true,
        preRankReuseReason: 'artifact_intent_rerank',
      },
    })
    readStoredSearchCacheEntry.mockResolvedValueOnce(
      createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')], {
        mode: 'discovery_preview',
        preRankArtifact: {
          version: 1,
          generatedAt: '2026-03-31T12:00:00.000Z',
          model: 'gpt-5-mini',
          rankedCandidates: [
            {
              candidateId: 'one',
              rank: 1,
              baselineFit: 'Strong overall baseline fit.',
              baselineCaution: 'A bit pricier than budget picks.',
            },
          ],
        },
        prewarm: {
          usage: {
            inputTokens: 320,
            outputTokens: 70,
            totalTokens: 390,
            reasoningTokens: 18,
          },
        },
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
    expect(selectAiResults).toHaveBeenCalledWith({
      candidatePool: expect.objectContaining({
        details: 'Notes: best for city travel',
      }),
      finalResultLimit: 6,
      apiKey: 'openai-key',
      model: expect.any(String),
      preRankArtifact: expect.objectContaining({
        generatedAt: '2026-03-31T12:00:00.000Z',
      }),
    })
    expect(JSON.parse(response.body)).toEqual(
      expect.objectContaining({
        requestMode: 'guided_refined',
        debug: expect.objectContaining({
          flowPath: 'artifact_intent_rerank',
          fallbackReason: null,
          reusedPreRankArtifact: true,
          usedIntentMatchRerank: true,
          tokenUsageByStage: expect.objectContaining({
            finalize: {
              inputTokens: 180,
              outputTokens: 30,
              totalTokens: 210,
              reasoningTokens: 6,
            },
            prewarmArtifact: {
              inputTokens: 320,
              outputTokens: 70,
              totalTokens: 390,
              reasoningTokens: 18,
            },
          }),
        }),
        selection: expect.objectContaining({
          strategy: 'artifact_intent_rerank',
          flowPath: 'artifact_intent_rerank',
          fallbackReason: null,
          reusedPreRankArtifact: true,
          usedIntentMatchRerank: true,
        }),
      }),
    )
  })

  it('prefers OPENAI_FINALIZE_MODEL over the shared model for guided finalize', async () => {
    getEnv.mockImplementation((name) => {
      if (name === 'OPENAI_API_KEY') {
        return 'openai-key'
      }

      if (name === 'OPENAI_FINALIZE_MODEL') {
        return 'gpt-5.4-nano'
      }

      if (name === 'OPENAI_MODEL') {
        return 'gpt-5-mini'
      }

      return ''
    })
    selectAiResults.mockResolvedValue({
      model: 'gpt-5.4-nano',
      selectedCandidateIds: ['one'],
      results: [{ id: 'one', title: 'Candidate one', reasons: [], drawbacks: [] }],
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
    expect(selectAiResults).toHaveBeenCalledTimes(1)
    expect(selectAiResults.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'openai-key',
        model: 'gpt-5.4-nano',
        preRankArtifact: null,
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
    selectAiResults.mockResolvedValue({
      model: 'gpt-5.4-nano',
      selectedCandidateIds: ['one'],
      results: [{ id: 'one', title: 'Candidate one', reasons: [], drawbacks: [] }],
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
    expect(selectAiResults).toHaveBeenCalledTimes(1)
    expect(selectAiResults.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'openai-key',
        model: 'gpt-5.4-nano',
        preRankArtifact: null,
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
    selectAiResults.mockResolvedValue({
      model: 'gpt-5.2',
      selectedCandidateIds: ['one'],
      results: [{ id: 'one', title: 'Candidate one', reasons: [], drawbacks: [] }],
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
    expect(selectAiResults).toHaveBeenCalledTimes(1)
    expect(selectAiResults.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'openai-key',
        model: 'gpt-5.2',
        preRankArtifact: null,
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
    selectAiResults.mockResolvedValue({
      model: 'gpt-5-mini',
      selectedCandidateIds: ['one'],
      results: [{ id: 'one', title: 'Candidate one', reasons: [], drawbacks: [] }],
      debug: {
        artifactCandidateCount: 0,
        intentMatchRerankUsed: false,
        preRankArtifactReused: false,
        preRankReuseReason: 'artifact_missing_or_invalid',
      },
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
    expect(selectAiResults).toHaveBeenCalledTimes(1)
    expect(selectAiResults.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        apiKey: 'openai-key',
        model: 'gpt-5-mini',
        preRankArtifact: null,
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
    selectAiResults.mockResolvedValue({
      model: 'gpt-5-mini',
      usage: {
        inputTokens: 510,
        outputTokens: 84,
        totalTokens: 594,
        reasoningTokens: 38,
      },
      selectedCandidateIds: ['one'],
      results: [{ id: 'one', title: 'Candidate one', reasons: [], drawbacks: [] }],
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
    expect(selectAiResults).toHaveBeenCalledTimes(1)
    expect(selectAiResults.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        candidatePool: expect.objectContaining({
          details:
            'Notes: keep it lightweight. Retry feedback: These picks still feel too bulky for city travel.. Excluded previous picks: one',
          candidates: [expect.objectContaining({ id: 'two' })],
        }),
        finalResultLimit: 6,
        apiKey: 'openai-key',
        model: expect.any(String),
        preRankArtifact: null,
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

  it('echoes finalize request mode so prewarm traffic can be measured separately', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    selectAiResults.mockResolvedValue({
      model: 'gpt-5-mini',
      usage: {
        inputTokens: 200,
        outputTokens: 40,
        totalTokens: 240,
        reasoningTokens: 12,
      },
      selectedCandidateIds: ['one'],
      results: [{ id: 'one', title: 'Candidate one', reasons: [], drawbacks: [] }],
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
    expect(selectAiResults).not.toHaveBeenCalled()
    expect(JSON.parse(response.body)).toEqual({
      candidatePool: {
        query: 'stroller',
        details: 'Retry feedback: Not right for city travel. Excluded previous picks: one',
        combinedSearchText: 'stroller',
        searchState: 'Results for exact spelling',
        similarQueries: ['compact stroller'],
        candidates: [],
      },
      requestMode: 'guided_finalize',
      retryCount: 1,
      results: [],
      selection: {
        mode: 'retry_exhausted',
        model: null,
        requestMode: 'guided_finalize',
        selectedCandidateIds: [],
        details: 'No new candidates remained after excluding the previously rejected picks.',
      },
    })
  })

  it('rate limits repeated finalize requests from the same ip address', async () => {
    getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    selectAiResults.mockResolvedValue({
      model: 'gpt-5-mini',
      selectedCandidateIds: ['one'],
      results: [{ id: 'one', title: 'Candidate one', reasons: [], drawbacks: [] }],
    })

    const requestBody = JSON.stringify({
      ...createFinalizeDiscoveryBody(),
      followUpNotes: 'keep it lightweight',
    })

    readStoredSearchCacheEntry.mockResolvedValue(createDiscoveryCacheEntry('stroller', [createFinalizeCandidate('one')]))

    for (let index = 0; index < 5; index += 1) {
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
      error: 'Too many finalize requests from this connection. Please wait a minute and try again.',
    })
  })
})
