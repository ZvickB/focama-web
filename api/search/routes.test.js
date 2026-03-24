import { afterEach, describe, expect, it, vi } from 'vitest'

const handleLiveSearch = vi.fn((requestUrl, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ pathname: requestUrl.pathname }))
})
const handleDiscoverySearch = vi.fn((requestUrl, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ pathname: requestUrl.pathname }))
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

vi.mock('../../backend/server.js', () => ({
  handleDiscoverySearch,
  handleFinalizeSelection,
  handleLiveSearch,
}))

const { GET: getSearch } = await import('../search.js')
const { GET: getLiveSearch } = await import('./live.js')
const { GET: getDiscoverySearch } = await import('./discover.js')
const { POST: postFinalizeSelection } = await import('./finalize.js')

describe('Vercel search route wrappers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('forwards request headers into the root /api/search wrapper', async () => {
    const request = new Request('https://example.com/api/search?query=stroller', {
      headers: {
        'x-forwarded-for': '198.51.100.10',
        'x-real-ip': '198.51.100.11',
      },
    })

    const response = await getSearch(request)

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
      'x-forwarded-for': '198.51.100.10',
      'x-real-ip': '198.51.100.11',
    })
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

  it('keeps forwarded headers and raw body when wrapping finalize requests', async () => {
    const request = new Request('https://example.com/api/search/finalize', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.32',
      },
      body: JSON.stringify({
        candidatePool: {
          candidates: [{ id: 'one', title: 'Candidate one' }],
        },
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
        candidatePool: {
          candidates: [{ id: 'one', title: 'Candidate one' }],
        },
      }),
    )
  })
})
