import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createMockResult, renderHomePage, setupHomePageTest } from './HomePage.test-utils.jsx'

function createJsonResponse(payload) {
  return Promise.resolve({
    ok: true,
    headers: { get: () => '' },
    text: async () => JSON.stringify(payload),
  })
}

function createDeferred() {
  let resolve
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

describe('HomePage query-quality suggestion', () => {
  setupHomePageTest()

  it('shows a passive Did-you-mean prompt when query-quality polling returns a suggestion', async () => {
    const user = userEvent.setup()
    window.__FOCAMAI_DISABLE_QUERY_QUALITY_POLLING__ = false

    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url.includes('/api/search/rainforest-discover')) {
        return createJsonResponse({
          discoveryToken: 'opaque-discovery-token',
          candidatePool: {
            query: 'celcius drink',
            details: '',
            candidates: [],
          },
          previewResults: [createMockResult({ title: 'Energy drink variety pack' })],
        })
      }

      if (url.includes('/api/search/refine')) {
        return createJsonResponse({
          prompt: 'What should we optimize for with this celcius drink?',
          helperText: 'Pick anything that matters.',
          followUpPlaceholder: 'Anything else?',
        })
      }

      if (url.includes('/api/search/query-quality')) {
        return createJsonResponse({
          ready: true,
          shouldSuggest: true,
          originalQuery: 'celcius drink',
          suggestedQuery: 'celsius drink',
          reason: 'Celsius appears to be the intended brand.',
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'celcius drink')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search/query-quality'))).toBe(true)
    })
    expect(await screen.findByText(/try "celsius drink" instead\?/i)).toBeInTheDocument()
    expect(screen.getByText(/we searched for "celcius drink"\./i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try suggested search/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep these results/i })).toBeInTheDocument()
  })

  it('keeps the prompt hidden when query-quality polling returns no suggestion', async () => {
    const user = userEvent.setup()
    window.__FOCAMAI_DISABLE_QUERY_QUALITY_POLLING__ = false

    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url.includes('/api/search/rainforest-discover')) {
        return createJsonResponse({
          discoveryToken: 'opaque-discovery-token',
          candidatePool: {
            query: 'travel stroller',
            details: '',
            candidates: [],
          },
          previewResults: [createMockResult()],
        })
      }

      if (url.includes('/api/search/refine')) {
        return createJsonResponse({
          prompt: 'What should we optimize for with this travel stroller?',
          helperText: 'Pick anything that matters.',
          followUpPlaceholder: 'Anything else?',
        })
      }

      if (url.includes('/api/search/query-quality')) {
        return createJsonResponse({
          ready: true,
          shouldSuggest: false,
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'travel stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search/query-quality'))).toBe(true)
    })
    expect(screen.queryByText(/did you mean/i)).not.toBeInTheDocument()
  })

  it('hides the suggestion when the user keeps the original results', async () => {
    const user = userEvent.setup()
    window.__FOCAMAI_DISABLE_QUERY_QUALITY_POLLING__ = false

    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url.includes('/api/search/rainforest-discover')) {
        return createJsonResponse({
          discoveryToken: 'opaque-discovery-token',
          candidatePool: {
            query: 'celcius drink',
            details: '',
            candidates: [],
          },
          previewResults: [createMockResult({ title: 'Energy drink variety pack' })],
        })
      }

      if (url.includes('/api/search/refine')) {
        return createJsonResponse({
          prompt: 'What should we optimize for with this celcius drink?',
          helperText: 'Pick anything that matters.',
          followUpPlaceholder: 'Anything else?',
        })
      }

      if (url.includes('/api/search/query-quality')) {
        return createJsonResponse({
          ready: true,
          shouldSuggest: true,
          originalQuery: 'celcius drink',
          suggestedQuery: 'celsius drink',
          reason: 'Celsius appears to be the intended brand.',
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'celcius drink')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(await screen.findByText(/try "celsius drink" instead\?/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /keep these results/i }))

    expect(screen.queryByText(/try "celsius drink" instead\?/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/product topic/i)).toHaveValue('celcius drink')
  })

  it('starts a normal new guided search when the user accepts the suggested query', async () => {
    const user = userEvent.setup()
    window.__FOCAMAI_DISABLE_QUERY_QUALITY_POLLING__ = false

    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url.includes('/api/search/rainforest-discover')) {
        const query = new URL(url, 'http://localhost').searchParams.get('query')

        return createJsonResponse({
          discoveryToken: query === 'celsius drink' ? 'suggested-discovery-token' : 'original-discovery-token',
          candidatePool: {
            query,
            details: '',
            candidates: [],
          },
          previewResults: [createMockResult({ id: query, title: query })],
        })
      }

      if (url.includes('/api/search/refine')) {
        const query = new URL(url, 'http://localhost').searchParams.get('query')

        return createJsonResponse({
          prompt: `What should we optimize for with this ${query}?`,
          helperText: 'Pick anything that matters.',
          followUpPlaceholder: 'Anything else?',
        })
      }

      if (url.includes('/api/search/query-quality')) {
        const token = new URL(url, 'http://localhost').searchParams.get('token')

        if (token === 'original-discovery-token') {
          return createJsonResponse({
            ready: true,
            shouldSuggest: true,
            originalQuery: 'celcius drink',
            suggestedQuery: 'celsius drink',
            reason: 'Celsius appears to be the intended brand.',
            classification: 'likely_typo',
            confidence: 'high',
          })
        }

        return createJsonResponse({
          ready: true,
          shouldSuggest: false,
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'celcius drink')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(await screen.findByText(/try "celsius drink" instead\?/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try suggested search/i }))

    await waitFor(() => {
      const discoveryUrls = fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes('/api/search/rainforest-discover'))

      expect(discoveryUrls.some((url) => url.includes('query=celsius+drink'))).toBe(true)
    })
    expect(screen.getByLabelText(/product topic/i)).toHaveValue('celsius drink')
    expect(screen.queryByText(/try "celsius drink" instead\?/i)).not.toBeInTheDocument()
  })

  it('ignores stale query-quality poll responses after a new search starts', async () => {
    const user = userEvent.setup()
    window.__FOCAMAI_DISABLE_QUERY_QUALITY_POLLING__ = false
    const staleQueryQuality = createDeferred()

    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url.includes('/api/search/rainforest-discover')) {
        const query = new URL(url, 'http://localhost').searchParams.get('query')

        return createJsonResponse({
          discoveryToken: query === 'celcius drink' ? 'stale-discovery-token' : 'fresh-discovery-token',
          candidatePool: {
            query,
            details: '',
            candidates: [],
          },
          previewResults: [createMockResult({ id: query, title: query })],
        })
      }

      if (url.includes('/api/search/refine')) {
        const query = new URL(url, 'http://localhost').searchParams.get('query')

        return createJsonResponse({
          prompt: `What should we optimize for with this ${query}?`,
          helperText: 'Pick anything that matters.',
          followUpPlaceholder: 'Anything else?',
        })
      }

      if (url.includes('/api/search/query-quality')) {
        const token = new URL(url, 'http://localhost').searchParams.get('token')

        if (token === 'stale-discovery-token') {
          return staleQueryQuality.promise
        }

        return createJsonResponse({
          ready: true,
          shouldSuggest: false,
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'celcius drink')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('stale-discovery-token'))).toBe(true)
    })

    await user.click(screen.getByRole('button', { name: /new search/i }))
    await user.type(screen.getByLabelText(/product topic/i), 'travel stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    staleQueryQuality.resolve({
      ok: true,
      headers: { get: () => '' },
      text: async () =>
        JSON.stringify({
          ready: true,
          shouldSuggest: true,
          originalQuery: 'celcius drink',
          suggestedQuery: 'celsius drink',
        }),
    })

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('fresh-discovery-token'))).toBe(true)
    })
    expect(screen.queryByText(/try "celsius drink" instead\?/i)).not.toBeInTheDocument()
  })

  it('keeps community-language searches quiet when polling returns no suggestion', async () => {
    const user = userEvent.setup()
    window.__FOCAMAI_DISABLE_QUERY_QUALITY_POLLING__ = false

    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url.includes('/api/search/rainforest-discover')) {
        return createJsonResponse({
          discoveryToken: 'shabbos-discovery-token',
          candidatePool: {
            query: 'shabbos art',
            details: '',
            candidates: [],
          },
          previewResults: [createMockResult({ title: 'Shabbos wall art print' })],
        })
      }

      if (url.includes('/api/search/refine')) {
        return createJsonResponse({
          prompt: 'What should we optimize for with this shabbos art?',
          helperText: 'Pick anything that matters.',
          followUpPlaceholder: 'Anything else?',
        })
      }

      if (url.includes('/api/search/query-quality')) {
        return createJsonResponse({
          ready: true,
          shouldSuggest: false,
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'shabbos art')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search/query-quality'))).toBe(true)
    })
    expect(screen.queryByText(/try "shabbat art" instead\?/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try suggested search/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/product topic/i)).toHaveValue('shabbos art')
  })
})
