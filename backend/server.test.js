import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/ai-selector.js', async () => {
  const actual = await vi.importActual('./lib/ai-selector.js')

  return {
    ...actual,
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
  buildCacheKey: vi.fn((productQuery, details) => `${productQuery}|${details}`),
  buildQuery: vi.fn((productQuery, details) => [productQuery, details].filter(Boolean).join(' ').trim()),
  getEnv: vi.fn(),
  readSearchCache: vi.fn(),
  }
})

import { handleCachedSearch, handleLiveSearch } from './server.js'
import { selectAiResults } from './lib/ai-selector.js'
import { getFilteredSearchArtifacts } from './lib/result-filter.js'
import {
  getEnv,
  readSearchCache,
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

describe('server handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns cached search results and slices them to four items', async () => {
    readSearchCache.mockReturnValue({
      entries: {
        'lego|for kids': {
          cachedAt: '2026-03-17T12:00:00.000Z',
          results: [
            { id: '1' },
            { id: '2' },
            { id: '3' },
            { id: '4' },
            { id: '5' },
          ],
        },
      },
    })

    const response = createResponseRecorder()

    await handleCachedSearch(new URL('http://localhost/api/search/cache?query=lego&details=for%20kids'), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      results: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }],
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

  it('returns a server error when the OpenAI API key is missing', async () => {
    getEnv.mockImplementation((name) => (name === 'SERPAPI_API_KEY' ? 'serp-key' : ''))

    const response = createResponseRecorder()

    await handleLiveSearch(new URL('http://localhost/api/search/live?query=lego'), response)

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.body)).toEqual({
      error: 'OPENAI_API_KEY is missing from the root .env file.',
    })
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
            reasons: ['Source: Target'],
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
      selectedCandidateIds: ['live-1'],
      results: [
        {
          id: 'live-1',
          title: 'Travel stroller',
          subtitle: 'Target',
          reasons: ['AI fit: Best for airport travel'],
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
            reasons: ['Source: Target'],
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
        },
      ],
      selection: {
        mode: 'ai',
        model: 'gpt-5-mini',
        selectedCandidateIds: ['live-1'],
        details: 'AI selected the final recommendations from the cleaned candidate pool.',
      },
    })

    const requestedUrl = fetchMock.mock.calls[0][0]
    expect(requestedUrl).toBeInstanceOf(URL)
    expect(requestedUrl.searchParams.get('q')).toBe('stroller airport travel')
    expect(requestedUrl.searchParams.get('api_key')).toBe('serp-key')
    expect(requestedUrl.searchParams.get('engine')).toBe('google_shopping')
    expect(selectAiResults).toHaveBeenCalledWith({
      candidatePool: expect.any(Object),
      finalResultLimit: 4,
      apiKey: 'openai-key',
      model: expect.any(String),
    })
  })
})
