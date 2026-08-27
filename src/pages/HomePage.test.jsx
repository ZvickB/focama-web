import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  createMockResult,
  findVisibleResultTitle,
  renderHomePage,
  setupHomePageTest,
} from './HomePage.test-utils.jsx'

function createDeferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

describe('HomePage', () => {
  setupHomePageTest()
  it('shows a friendly error message when the product query is blank', async () => {
    const user = userEvent.setup()

    renderHomePage()

    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(screen.getByText(/thanks so much for testing focamai/i)).toBeInTheDocument()
  })

  it('uses the plain homepage background mode without showing a toggle control', () => {
    renderHomePage()

    expect(document.documentElement.dataset.bgMode).toBe('plain')
    expect(
      screen.queryByRole('button', { name: /switch to (soft|white) background/i }),
    ).not.toBeInTheDocument()
  })

  it('shows a friendly error message for obvious gibberish queries', async () => {
    const user = userEvent.setup()

    renderHomePage()

    const productInput = screen.getByLabelText(/product topic/i)
    await user.type(productInput, 'jhljlhl')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(screen.getByText(/thanks so much for testing focamai/i)).toBeInTheDocument()
  })

  it('submits the search when the user presses enter in the main query textarea', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '' },
        text: async () =>
          JSON.stringify({
            discoveryToken: 'opaque-discovery-token',
            candidatePool: {
              query: 'stroller',
              details: '',
              candidates: [],
            },
            previewResults: [createMockResult()],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '' },
        text: async () =>
          JSON.stringify({
            prompt: 'What should we optimize for with this stroller?',
            alternatePrompt: 'Where will you use this stroller most often?',
            helperText: 'Pick anything that matters.',
            followUpPlaceholder: 'Anything else?',
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    const productInput = screen.getByLabelText(/product topic/i)
    expect(productInput.tagName).toBe('TEXTAREA')

    await user.type(productInput, 'stroller')
    await user.keyboard('{Enter}')

    expect(
      await screen.findByText(/what should we optimize for with this stroller/i),
    ).toBeInTheDocument()
  })

  it('starts discovery and shows the AI refinement prompt after submitting a product', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'opaque-discovery-token',
            candidatePool: {
              query: 'stroller',
              details: '',
              candidates: [],
            },
            previewResults: [createMockResult()],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            prompt: 'What should we optimize for with this stroller?',
            helperText: 'Pick anything that matters.',
            followUpPlaceholder: 'Anything else?',
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(
      await screen.findByText(/what should we optimize for with this stroller/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show focused picks/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /skip and show results/i })[0]).toBeInTheDocument()
    expect(
      await screen.findByText(/finding your best options/i),
    ).toBeInTheDocument()
  })

  it('shows the marketplace toast after search starts and remembers dismissal once', async () => {
    const user = userEvent.setup()

    // Pre-set a detected marketplace preference (simulates geo detection from a previous visit)
    window.localStorage.setItem('focamai_marketplace', 'amazon.ca')

    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url.includes('/api/search/rainforest-discover')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          text: async () =>
            JSON.stringify({
              discoveryToken: 'opaque-discovery-token',
              candidatePool: {
                query: 'stroller',
                details: '',
                candidates: [],
              },
              previewResults: [createMockResult()],
            }),
        })
      }

      if (url.includes('/api/search/refine')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          text: async () =>
            JSON.stringify({
              prompt: 'What should we optimize for with this stroller?',
              helperText: 'Pick anything that matters.',
              followUpPlaceholder: 'Anything else?',
            }),
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(
      await screen.findByText(/looks like you're in canada/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /dismiss/i }))

    // Preference persisted — will not show again on next load
    await waitFor(() => {
      expect(window.localStorage.getItem('focamai_marketplace_asked')).toBe('true')
    })
  })

  it('starts discovery and question-fast as separate requests', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url.includes('/api/search/rainforest-discover')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          text: async () =>
            JSON.stringify({
              discoveryToken: 'opaque-discovery-token',
              candidatePool: {
                query: 'stroller',
                details: '',
                candidates: [],
              },
              previewResults: [createMockResult()],
            }),
        })
      }

      if (url.includes('/api/search/refine')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          text: async () =>
            JSON.stringify({
              prompt: 'What should we optimize for with this stroller?',
              helperText: 'Pick anything that matters.',
              followUpPlaceholder: 'Anything else?',
            }),
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(
      await screen.findByText(/what should we optimize for with this stroller/i),
    ).toBeInTheDocument()

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/api/search/rainforest-discover'),
        expect.stringContaining('/api/search/refine'),
      ]),
    )
  })

  it('keeps a selected question answer separate from optional notes', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '' },
        text: async () =>
          JSON.stringify({
            discoveryToken: 'opaque-discovery-token',
            candidatePool: {
              query: 'stroller',
              details: '',
              candidates: [],
            },
            previewResults: [createMockResult()],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '' },
        text: async () =>
          JSON.stringify({
            prompt: 'What matters most for this stroller?',
            alternatePrompt: 'Where will you use this stroller most often?',
            helperText: '',
            followUpPlaceholder: 'Anything else?',
            answerOptions: [
              { label: 'Easy folding', prompt: 'Easy folding matters most to me.' },
              {
                label: 'Travel fit',
                prompt: 'I need this to fit airplane travel and fold quickly.',
              },
              { label: 'Comfort', prompt: 'Comfort matters most to me.' },
              { label: 'No preference', prompt: 'I do not have a preference here.' },
            ],
            alternateAnswerOptions: [
              { label: 'Air travel', prompt: 'I will mostly use it for air travel.' },
              { label: 'City sidewalks', prompt: 'I will mostly use it on city sidewalks.' },
              { label: 'Mixed use', prompt: 'I will use it in several settings.' },
              { label: 'Not sure', prompt: 'I am not sure where I will use it most.' },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '' },
        text: async () => JSON.stringify({
          results: [createMockResult()],
          selection: { mode: 'ai' },
        }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what matters most for this stroller/i)

    const refinementTextarea = screen.getByLabelText(/anything else/i)
    expect(screen.getByRole('button', { name: 'Easy folding' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fits my space' })).not.toBeInTheDocument()

    await user.type(refinementTextarea, 'under $200')
    await user.click(screen.getByRole('button', { name: 'Easy folding' }))
    expect(refinementTextarea).toHaveValue('under $200')
    expect(screen.getByRole('button', { name: 'Easy folding' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Travel fit' }))
    expect(refinementTextarea).toHaveValue('under $200')
    expect(screen.getByRole('button', { name: 'Travel fit' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Easy folding' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'Get a different question' }))
    expect(screen.getByRole('status', { name: /finding a different question/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Easy folding' })).toBeInTheDocument()

    expect(
      await screen.findByText(/where will you use this stroller most often/i, {}, { timeout: 1500 }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/what matters most for this stroller/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Air travel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Travel fit' })).not.toBeInTheDocument()
    expect(refinementTextarea).toHaveValue('under $200')

    await user.type(refinementTextarea, ' Mostly on city sidewalks.')
    expect(refinementTextarea).toHaveValue('under $200 Mostly on city sidewalks.')

    await user.click(screen.getByRole('button', { name: 'City sidewalks' }))
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).followUpNotes).toBe(
      'I will mostly use it on city sidewalks. under $200 Mostly on city sidewalks.',
    )
  })

  it('restarts discovery with the new marketplace and ignores the stale response', async () => {
    const user = userEvent.setup()
    let resolveFirstDiscovery
    let resolveSecondDiscovery

    const firstDiscovery = new Promise((resolve) => {
      resolveFirstDiscovery = resolve
    })
    const secondDiscovery = new Promise((resolve) => {
      resolveSecondDiscovery = resolve
    })

    const fetchMock = vi.fn((input, init) => {
      const url = String(input)

      if (url.includes('/api/search/refine')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          text: async () =>
            JSON.stringify({
              prompt: 'What should we optimize for with this stroller?',
              helperText: 'Pick anything that matters.',
              followUpPlaceholder: 'Anything else?',
            }),
        })
      }

      if (url.includes('/api/search/rainforest-discover?query=stroller&amazonDomain=amazon.ca')) {
        return secondDiscovery
      }

      if (url.includes('/api/search/rainforest-discover?query=stroller')) {
        init?.signal?.addEventListener?.('abort', () => {
          resolveFirstDiscovery?.({
            ok: true,
            headers: { get: () => '' },
            text: async () =>
              JSON.stringify({
                discoveryToken: 'stale-discovery-token',
                candidatePool: {
                  query: 'stroller',
                  details: '',
                  candidates: [],
                },
                previewResults: [createMockResult({ title: 'Stale stroller result' })],
              }),
            aborted: true,
          })
        })

        return firstDiscovery
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    // Wait for refinement area to confirm search has started
    await screen.findByLabelText(/anything else/i)

    // Switch marketplace via the header store pill (two pills exist — desktop + mobile — pick the first)
    await user.click(screen.getAllByRole('button', { name: /change amazon region/i })[0])
    await user.click(screen.getByRole('option', { name: /canada/i }))

    resolveSecondDiscovery({
      ok: true,
      headers: { get: () => '' },
      text: async () =>
        JSON.stringify({
          amazonDomain: 'amazon.ca',
          discoveryToken: 'fresh-discovery-token',
          candidatePool: {
            query: 'stroller',
            details: '',
            amazonDomain: 'amazon.ca',
            candidates: [],
          },
          previewResults: [createMockResult({ title: 'Canada stroller result' })],
        }),
    })

    await waitFor(() => {
      expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
        expect.arrayContaining([
          expect.stringContaining('/api/search/rainforest-discover?query=stroller'),
          expect.stringContaining('/api/search/rainforest-discover?query=stroller&amazonDomain=amazon.ca'),
        ]),
      )
    })

    await user.click(screen.getAllByRole('button', { name: /skip and show results/i })[0])

    expect(await findVisibleResultTitle('Canada stroller result')).toBeInTheDocument()
    expect(screen.queryByText('Stale stroller result')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('focamai_marketplace')).toBe('amazon.ca')
    expect(window.localStorage.getItem('focamai_marketplace_asked')).toBe('true')
  })


  it('lets the user choose an Amazon marketplace and reuses it through finalize', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '' },
        text: async () =>
          JSON.stringify({
            amazonDomain: 'amazon.ca',
            discoveryToken: 'opaque-discovery-token',
            candidatePool: {
              query: 'stroller',
              details: '',
              amazonDomain: 'amazon.ca',
              candidates: [
                {
                  id: 'result-1',
                  title: 'Travel stroller',
                  source: 'Amazon',
                  price: '$129.99',
                  rating: 4.4,
                  reviewCount: 87,
                  description: 'Lightweight and easy to fold.',
                  reasons: ['Available from Amazon'],
                  image: 'https://example.com/stroller.jpg',
                  link: 'https://www.amazon.ca/dp/B001',
                },
              ],
            },
            previewResults: [createMockResult({ subtitle: 'Amazon', link: 'https://www.amazon.ca/dp/B001' })],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '' },
        text: async () =>
          JSON.stringify({
            prompt: 'What should we optimize for with this stroller?',
            helperText: 'Pick anything that matters.',
            followUpPlaceholder: 'Anything else?',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '' },
        text: async () =>
          JSON.stringify({
            candidatePool: {
              query: 'stroller',
              details: 'Notes: comfort matters most',
              amazonDomain: 'amazon.ca',
              candidates: [],
            },
            results: [createMockResult({ subtitle: 'Amazon', link: 'https://www.amazon.ca/dp/B001' })],
            selection: {
              mode: 'ai',
            },
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.click(screen.getAllByRole('button', { name: /change amazon region/i })[0])
    await user.click(screen.getByText('Canada'))
    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/anything else/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))

    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/search/rainforest-discover?query=stroller&amazonDomain=amazon.ca')
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(
      expect.objectContaining({
        query: 'stroller',
        amazonDomain: 'amazon.ca',
        discoveryToken: 'opaque-discovery-token',
        followUpNotes: 'comfort matters most',
      }),
    )
    expect(window.localStorage.getItem('focamai_marketplace')).toBe('amazon.ca')
  })

  it('uses the geo-resolved Amazon domain when the store stays on Auto', async () => {
    delete window.__FOCAMAI_DISABLE_GEO_FETCH__

    const user = userEvent.setup()
    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url === '/api/geo') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ countryCode: 'CA' }),
        })
      }

      if (url.includes('/api/search/rainforest-discover')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          text: async () =>
            JSON.stringify({
              amazonDomain: 'amazon.ca',
              discoveryToken: 'opaque-discovery-token',
              candidatePool: {
                query: 'stroller',
                details: '',
                amazonDomain: 'amazon.ca',
                candidates: [],
              },
              previewResults: [createMockResult({ subtitle: 'Amazon', link: 'https://www.amazon.ca/dp/B001' })],
            }),
        })
      }

      if (url.includes('/api/search/refine')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          text: async () =>
            JSON.stringify({
              prompt: 'What should we optimize for with this stroller?',
              helperText: 'Pick anything that matters.',
              followUpPlaceholder: 'Anything else?',
            }),
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /change amazon region/i })[0]).toHaveTextContent('Amazon.ca')
    })

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          '/api/search/rainforest-discover?query=stroller&amazonDomain=amazon.ca',
        ),
      ]),
    )
    expect(window.localStorage.getItem('focamai_marketplace')).toBe('amazon.ca')
  })

  it('reuses a saved marketplace preference and skips the geo request on load', async () => {
    window.localStorage.setItem('focamai_marketplace', 'amazon.ca')

    const user = userEvent.setup()
    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url === '/api/geo') {
        throw new Error('Geo request should be skipped when a marketplace preference is saved.')
      }

      if (url.includes('/api/search/rainforest-discover')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          text: async () =>
            JSON.stringify({
              amazonDomain: 'amazon.ca',
              discoveryToken: 'opaque-discovery-token',
              candidatePool: {
                query: 'stroller',
                details: '',
                amazonDomain: 'amazon.ca',
                candidates: [],
              },
              previewResults: [createMockResult({ subtitle: 'Amazon', link: 'https://www.amazon.ca/dp/B001' })],
            }),
        })
      }

      if (url.includes('/api/search/refine')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          text: async () =>
            JSON.stringify({
              prompt: 'What should we optimize for with this stroller?',
              helperText: 'Pick anything that matters.',
              followUpPlaceholder: 'Anything else?',
            }),
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    expect(screen.getAllByRole('button', { name: /change amazon region/i })[0]).toHaveTextContent('Amazon.ca')

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)

    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain('/api/geo')
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          '/api/search/rainforest-discover?query=stroller&amazonDomain=amazon.ca',
        ),
      ]),
    )
  })

  it('shows a friendly recovery message and refreshes discovery when retrying a failure', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        text: async () => JSON.stringify({ error: 'SerpApi request failed.' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            prompt: 'What matters most?',
            helperText: 'Pick priorities.',
            followUpPlaceholder: 'Anything else?',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'retry-token',
            candidatePool: {
              query: 'stroller',
              details: '',
              candidates: [createMockResult()],
            },
            previewResults: [createMockResult()],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            prompt: 'What matters most?',
            helperText: 'Pick priorities.',
            followUpPlaceholder: 'Anything else?',
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(await screen.findByText(/we couldn’t finish that search/i)).toBeInTheDocument()
    expect(screen.queryByText(/serpapi request failed/i)).not.toBeInTheDocument()
    expect((await screen.findAllByText(/support code/i)).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /copy report/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('/api/search/rainforest-discover?query=stroller') &&
          String(url).includes('cacheMode=refresh'),
        ),
      ).toBe(true)
    })
    await waitFor(() => {
      expect(screen.queryByText(/we couldn’t finish that search/i)).not.toBeInTheDocument()
    })
  })

  it('shows a session-expired recovery message when discovery returns without a token', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            candidatePool: {
              query: 'stroller',
              details: '',
              candidates: [],
            },
            previewResults: [createMockResult()],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            prompt: 'What should we optimize for with this stroller?',
            helperText: 'Pick anything that matters.',
            followUpPlaceholder: 'Anything else?',
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect((await screen.findAllByText(/support code/i)).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /copy report/i })).toBeInTheDocument()
  })

  it('finalizes results after the user adds refinement notes', async () => {
    const user = userEvent.setup()
    const finalizeResponse = createDeferred()
    const finalResultsResponse = {
      ok: true,
      text: async () =>
        JSON.stringify({
          candidatePool: {
            query: 'stroller',
            details: 'Notes: comfort matters most',
            candidates: [],
          },
          results: [
            createMockResult(),
            createMockResult({
              id: 'result-2',
              title: 'Compact airport stroller',
              price: '$149.99',
            }),
          ],
          selection: {
            mode: 'ai',
          },
        }),
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'opaque-discovery-token',
            candidatePool: {
              query: 'stroller',
              details: '',
              candidates: [
                {
                  id: 'result-1',
                  title: 'Travel stroller',
                  source: 'Target',
                  price: '$129.99',
                  rating: 4.4,
                  reviewCount: 87,
                  description: 'Lightweight and easy to fold.',
                  reasons: ['Available from Target'],
                  image: 'https://example.com/stroller.jpg',
                  link: 'https://example.com/stroller',
                },
              ],
            },
            previewResults: [createMockResult()],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            prompt: 'What should we optimize for with this stroller?',
            helperText: 'Pick anything that matters.',
            followUpPlaceholder: 'Anything else?',
          }),
      })
      .mockImplementationOnce(() => finalizeResponse.promise)

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/anything else/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))

    expect(
      await screen.findByText(/we're on it\. your results will be here soon\./i),
    ).toBeInTheDocument()
    finalizeResponse.resolve(finalResultsResponse)
    expect(await findVisibleResultTitle('Compact airport stroller')).toBeInTheDocument()
    expect(
      screen.getByText(/six picks, chosen around what you told us\./i),
    ).toBeInTheDocument()
  })

  it('submits focused picks when the user presses enter in the AI textarea', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'opaque-discovery-token',
            candidatePool: {
              query: 'stroller',
              details: '',
              candidates: [
                {
                  id: 'result-1',
                  title: 'Travel stroller',
                  source: 'Target',
                  price: '$129.99',
                  rating: 4.4,
                  reviewCount: 87,
                  description: 'Lightweight and easy to fold.',
                  reasons: ['Available from Target'],
                  image: 'https://example.com/stroller.jpg',
                  link: 'https://example.com/stroller',
                },
              ],
            },
            previewResults: [createMockResult()],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            prompt: 'What should we optimize for with this stroller?',
            helperText: 'Pick anything that matters.',
            followUpPlaceholder: 'Anything else?',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            candidatePool: {
              query: 'stroller',
              details: 'Notes: comfort matters most',
              candidates: [],
            },
            results: [
              createMockResult(),
              createMockResult({
                id: 'result-2',
                title: 'Compact airport stroller',
                price: '$149.99',
              }),
            ],
            selection: {
              mode: 'ai',
            },
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)

    const refinementTextarea = screen.getByLabelText(/anything else/i)
    await user.type(refinementTextarea, 'comfort matters most')
    await user.keyboard('{Enter}')

    expect(await findVisibleResultTitle('Compact airport stroller')).toBeInTheDocument()
  })

  it('lets the user show the current product set without AI refinement', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'opaque-discovery-token',
            candidatePool: {
              query: 'stroller',
              details: '',
              candidates: [
                {
                  id: 'result-1',
                  title: 'Travel stroller',
                  source: 'Target',
                  price: '$129.99',
                  rating: 4.4,
                  reviewCount: 87,
                  description: 'Lightweight and easy to fold.',
                  reasons: ['Available from Target'],
                  image: 'https://example.com/stroller.jpg',
                  link: 'https://example.com/stroller',
                },
              ],
            },
            previewResults: [createMockResult()],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            prompt: 'What should we optimize for with this stroller?',
            helperText: 'Pick anything that matters.',
            followUpPlaceholder: 'Anything else?',
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.click(screen.getAllByRole('button', { name: /skip and show results/i })[0])

    expect(await findVisibleResultTitle('Travel stroller')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show focused picks/i })).toBeInTheDocument()
  })

  it('lets the user reset to a brand-new search after results are shown', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'opaque-discovery-token',
            candidatePool: {
              query: 'stroller',
              details: '',
              candidates: [
                {
                  id: 'result-1',
                  title: 'Travel stroller',
                  source: 'Target',
                  price: '$129.99',
                  rating: 4.4,
                  reviewCount: 87,
                  description: 'Lightweight and easy to fold.',
                  reasons: ['Available from Target'],
                  image: 'https://example.com/stroller.jpg',
                  link: 'https://example.com/stroller',
                },
              ],
            },
            previewResults: [createMockResult()],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            prompt: 'What should we optimize for with this stroller?',
            helperText: 'Pick anything that matters.',
            followUpPlaceholder: 'Anything else?',
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.click(screen.getAllByRole('button', { name: /skip and show results/i })[0])
    expect(await findVisibleResultTitle('Travel stroller')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /new search/i }))

    expect(screen.getByLabelText(/product topic/i)).toHaveValue('')
expect(screen.queryByText('Travel stroller')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter a product topic to get started.')).not.toBeInTheDocument()
  })

  it('shows preview products and disables refinement when discovery session storage is unavailable', async () => {
    const user = userEvent.setup()
    const previewResult = createMockResult({ title: 'Degraded preview stroller' })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '' },
        text: async () => JSON.stringify({
          discoveryToken: '',
          guidedAvailable: false,
          degradedReason: 'session_storage_unavailable',
          degradedMessage: 'We found products, but focused picks are temporarily unavailable.',
          candidatePool: {
            query: 'stroller',
            details: '',
            candidates: [previewResult],
          },
          previewResults: [previewResult],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => '' },
        text: async () => JSON.stringify({
          prompt: 'What should we optimize for with this stroller?',
          helperText: 'Pick anything that matters.',
          followUpPlaceholder: 'Anything else?',
        }),
      })

    vi.stubGlobal('fetch', fetchMock)
    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(await findVisibleResultTitle('Degraded preview stroller')).toBeInTheDocument()
    expect(screen.getByText('Focused picks are temporarily unavailable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try focused picks again/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^show focused picks$/i })).not.toBeInTheDocument()
  })
})
