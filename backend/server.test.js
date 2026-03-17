import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/search-data.js', () => ({
  SERPAPI_ENDPOINT: 'https://serpapi.com/search.json',
  buildCacheKey: vi.fn((productQuery, details) => `${productQuery}|${details}`),
  buildQuery: vi.fn((productQuery, details) => [productQuery, details].filter(Boolean).join(' ').trim()),
  getEnv: vi.fn(),
  getNormalizedResults: vi.fn(),
  readSearchCache: vi.fn(),
}))

import { handleLiveSearch, handleSearch } from './server.js'
import {
  getEnv,
  getNormalizedResults,
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

    await handleSearch(new URL('http://localhost/api/search?query=lego&details=for%20kids'), response)

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

  it('returns normalized live search results when SerpApi succeeds', async () => {
    getEnv.mockReturnValue('test-key')
    getNormalizedResults.mockReturnValue([{ id: 'live-1', title: 'Travel stroller' }])

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
      results: [{ id: 'live-1', title: 'Travel stroller' }],
    })

    const requestedUrl = fetchMock.mock.calls[0][0]
    expect(requestedUrl).toBeInstanceOf(URL)
    expect(requestedUrl.searchParams.get('q')).toBe('stroller airport travel')
    expect(requestedUrl.searchParams.get('api_key')).toBe('test-key')
    expect(requestedUrl.searchParams.get('engine')).toBe('google_shopping')
  })
})
