import { afterEach, describe, expect, it, vi } from 'vitest'

const handleLiveSearch = vi.fn((requestUrl, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ pathname: requestUrl.pathname }))
})
const handleDiscoverySearch = vi.fn((requestUrl, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ pathname: requestUrl.pathname }))
})
const handleRainforestDiscoverySearch = vi.fn((requestUrl, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ pathname: requestUrl.pathname }))
})
const handleQueryFramingFields = vi.fn((requestUrl, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ pathname: requestUrl.pathname }))
})
const handleEnrichmentPoll = vi.fn((incomingRequestUrl, response, request) => {
  void incomingRequestUrl
  const parsedRequestUrl = new URL(request.url)
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(
    JSON.stringify({
      pathname: parsedRequestUrl.pathname,
      token: parsedRequestUrl.searchParams.get('token'),
      query: parsedRequestUrl.searchParams.get('query'),
    }),
  )
})
const handleFinalizeSelection = vi.fn((request, response) => {
  let rawBody = ''

  request.on('data', (chunk) => {
    rawBody += chunk
  })
  request.on('end', () => {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(rawBody)
  })
})
const handleRetryAdvice = vi.fn((request, response) => {
  let rawBody = ''

  request.on('data', (chunk) => {
    rawBody += chunk
  })
  request.on('end', () => {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(rawBody)
  })
})
vi.mock('../../backend/server.js', () => ({
  handleDiscoverySearch,
  handleEnrichmentPoll,
  handleQueryFramingFields,
  handleFinalizeSelection,
  handleLiveSearch,
  handleRainforestDiscoverySearch,
  handleRetryAdvice,
}))

const { GET: getLiveSearch } = await import('./live.js')
const { GET: getDiscoverySearch } = await import('./discover.js')
const { GET: getEnrichmentPoll } = await import('./enrichment.js')
const { GET: getQueryFramingFields } = await import('./framing-fields.js')
const { POST: postFinalizeSelection } = await import('./finalize.js')
const { GET: getRainforestDiscoverySearch } = await import('./rainforest-discover.js')
const { POST: postRetryAdvice } = await import('./retry-advice.js')

describe('Vercel search route wrappers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('forwards request headers into the guided discovery wrapper', async () => {
    const request = new Request('https://example.com/api/search/discover?query=stroller', {
      headers: {
        'x-forwarded-for': '203.0.113.30',
      },
    })

    const response = await getDiscoverySearch(request)

    expect(response.status).toBe(200)
    expect(handleDiscoverySearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )

    const forwardedRequest = handleDiscoverySearch.mock.calls[0][2]
    expect(Object.fromEntries(forwardedRequest.headers.entries())).toMatchObject({
      'x-forwarded-for': '203.0.113.30',
    })
  })

  it('forwards request headers into the rainforest discovery wrapper', async () => {
    const request = new Request('https://example.com/api/search/rainforest-discover?query=stroller&amazonDomain=amazon.ca', {
      headers: {
        'x-forwarded-for': '203.0.113.34',
      },
    })

    const response = await getRainforestDiscoverySearch(request)

    expect(response.status).toBe(200)
    expect(handleRainforestDiscoverySearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )

    const forwardedRequest = handleRainforestDiscoverySearch.mock.calls[0][2]
    expect(Object.fromEntries(forwardedRequest.headers.entries())).toMatchObject({
      'x-forwarded-for': '203.0.113.34',
    })
    expect(await response.json()).toEqual({
      pathname: '/api/search/rainforest-discover',
    })
  })

  it('forwards request headers into the live search wrapper', async () => {
    const request = new Request('https://example.com/api/search/live?query=stroller', {
      headers: {
        'x-forwarded-for': '203.0.113.31',
      },
    })

    const response = await getLiveSearch(request)

    expect(response.status).toBe(200)
    expect(handleLiveSearch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )

    const forwardedRequest = handleLiveSearch.mock.calls[0][2]
    expect(Object.fromEntries(forwardedRequest.headers.entries())).toMatchObject({
      'x-forwarded-for': '203.0.113.31',
    })
  })

  it('forwards query-framing fields requests into the background framing wrapper', async () => {
    const request = new Request('https://example.com/api/search/framing-fields?query=stroller')

    const response = await getQueryFramingFields(request)

    expect(response.status).toBe(200)
    expect(handleQueryFramingFields).toHaveBeenCalledWith(
      expect.any(URL),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )
    expect(await response.json()).toEqual({
      pathname: '/api/search/framing-fields',
    })
  })

  it('forwards enrichment poll requests with the original request URL intact', async () => {
    const request = new Request(
      'https://example.com/api/search/enrichment?token=opaque-discovery-token&query=microphone',
      {
        headers: {
          'x-forwarded-for': '203.0.113.33',
        },
      },
    )

    const response = await getEnrichmentPoll(request)

    expect(response.status).toBe(200)
    expect(handleEnrichmentPoll).toHaveBeenCalledWith(
      expect.any(URL),
      expect.any(Object),
      expect.objectContaining({
        url: 'https://example.com/api/search/enrichment?token=opaque-discovery-token&query=microphone',
        headers: expect.any(Headers),
      }),
    )
    expect(await response.json()).toEqual({
      pathname: '/api/search/enrichment',
      token: 'opaque-discovery-token',
      query: 'microphone',
    })
  })

  it('keeps forwarded headers and raw body when wrapping finalize requests', async () => {
    const request = new Request('https://example.com/api/search/finalize', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.32',
      },
      body: JSON.stringify({
        query: 'stroller',
        discoveryToken: 'opaque-discovery-token',
      }),
    })

    const response = await postFinalizeSelection(request)

    expect(response.status).toBe(200)
    expect(handleFinalizeSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.32',
        }),
        on: expect.any(Function),
      }),
      expect.any(Object),
    )
    expect(await response.text()).toBe(
      JSON.stringify({
        query: 'stroller',
        discoveryToken: 'opaque-discovery-token',
      }),
    )
  })

  it('keeps forwarded headers and raw body when wrapping retry advice requests', async () => {
    const request = new Request('https://example.com/api/search/retry-advice', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.35',
      },
      body: JSON.stringify({
        query: 'stroller',
        rejectionFeedback: 'Too bulky',
      }),
    })

    const response = await postRetryAdvice(request)

    expect(response.status).toBe(200)
    expect(handleRetryAdvice).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.35',
        }),
        on: expect.any(Function),
      }),
      expect.any(Object),
    )
    expect(await response.text()).toBe(
      JSON.stringify({
        query: 'stroller',
        rejectionFeedback: 'Too bulky',
      }),
    )
  })

  it('returns a JSON 500 response when a wrapped GET handler throws before writing a response', async () => {
    handleRainforestDiscoverySearch.mockImplementationOnce(() => {
      throw new Error('rainforest scope missing')
    })

    const request = new Request('https://example.com/api/search/rainforest-discover?query=stroller')

    const response = await getRainforestDiscoverySearch(request)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Internal server error.',
      details: 'rainforest scope missing',
    })
  })

})
