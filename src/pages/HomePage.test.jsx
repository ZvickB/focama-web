import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createMockResult, renderHomePage, setupHomePageTest } from './HomePage.test-utils.jsx'

describe('HomePage', () => {
  setupHomePageTest()
  it('shows a validation error when the product query is blank', async () => {
    const user = userEvent.setup()

    renderHomePage()

    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(screen.getByText('Enter a product topic to get started.')).toBeInTheDocument()
  })

  it('uses the plain homepage background mode without showing a toggle control', () => {
    renderHomePage()

    expect(document.documentElement.dataset.bgMode).toBe('plain')
    expect(
      screen.queryByRole('button', { name: /switch to (soft|white) background/i }),
    ).not.toBeInTheDocument()
  })

  it('shows a validation error for obvious gibberish queries', async () => {
    const user = userEvent.setup()

    renderHomePage()

    const productInput = screen.getByLabelText(/product topic/i)
    await user.type(productInput, 'jhljlhl')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(
      screen.getByText('Try a real product topic, like "lego", "desk lamp", or "travel stroller".'),
    ).toBeInTheDocument()
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
    expect(screen.getAllByRole('button', { name: /skip the question and show results/i })[0]).toBeInTheDocument()
    expect(
      await screen.findByText(/your shortlist is taking shape\./i),
    ).toBeInTheDocument()
  })

  it('shows the marketplace toast after search starts and remembers dismissal once', async () => {
    const user = userEvent.setup()

    // Pre-set a detected marketplace preference (simulates geo detection from a previous visit)
    window.localStorage.setItem('focamai_marketplace', 'amazon.co.uk')

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
      await screen.findByText(/looks like you're in the uk/i),
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
    await screen.findByLabelText(/tell us more/i)

    // Switch marketplace via the header store pill (two pills exist — desktop + mobile — pick the first)
    await user.click(screen.getAllByRole('button', { name: /change amazon store/i })[0])
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

    await user.click(screen.getAllByRole('button', { name: /skip the question and show results/i })[0])

    expect(await screen.findByText('Canada stroller result')).toBeInTheDocument()
    expect(screen.queryByText('Stale stroller result')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('focamai_marketplace')).toBe('amazon.ca')
    expect(window.localStorage.getItem('focamai_marketplace_asked')).toBe('true')
  })

  it('sends tester feedback with the current search context', async () => {
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

      if (url.includes('/api/feedback')) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ ok: true }),
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)

    await user.click(screen.getByRole('button', { name: /^feedback$/i }))
    await user.click(screen.getByRole('button', { name: /was it simple to use\?: yes/i }))
    await user.click(screen.getByRole('button', { name: /did you find what you wanted\?: partly/i }))
    await user.click(screen.getByRole('button', { name: /did you enjoy the experience\?: yes/i }))
    await user.type(screen.getByLabelText(/what was confusing or missing/i), 'I wanted the next step to feel a little clearer.')
    await user.type(
      screen.getByLabelText(/optional: leave your email if you'd be open to a quick follow-up/i),
      'tester@example.com',
    )
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    await screen.findByText(/thanks\. this helps a lot\./i)

    const feedbackCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/feedback'))
    expect(feedbackCall).toBeTruthy()
    expect(JSON.parse(feedbackCall[1].body)).toEqual(
      expect.objectContaining({
        sessionId: expect.any(String),
        searchId: expect.any(String),
        stageReached: 'refine',
        wasSimple: 'yes',
        foundWhatYouWanted: 'partly',
        enjoyedExperience: 'yes',
        freeText: 'I wanted the next step to feel a little clearer.',
        email: 'tester@example.com',
        queryText: 'stroller',
        resultsSeen: false,
        finalized: false,
      }),
    )
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

    await user.click(screen.getAllByRole('button', { name: /change amazon store/i })[0])
    await user.click(screen.getByText('Canada'))
    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'comfort matters most')
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
      expect(screen.getAllByRole('button', { name: /change amazon store/i })[0]).toHaveTextContent('CA')
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

    expect(screen.getAllByRole('button', { name: /change amazon store/i })[0]).toHaveTextContent('CA')

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

  it('shows the backend error message when discovery fails', async () => {
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

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(await screen.findByText('SerpApi request failed.')).toBeInTheDocument()
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

    expect(await screen.findByText('Your search session expired. Start a new search.')).toBeInTheDocument()
    expect(screen.queryByText(/restart the backend server/i)).not.toBeInTheDocument()
  })

  it('finalizes results after the user adds refinement notes', async () => {
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
    await user.type(screen.getByLabelText(/tell us more/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))

    expect(await screen.findByText('Compact airport stroller')).toBeInTheDocument()
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

    const refinementTextarea = screen.getByLabelText(/tell us more/i)
    await user.type(refinementTextarea, 'comfort matters most')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('Compact airport stroller')).toBeInTheDocument()
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
    await user.click(screen.getAllByRole('button', { name: /skip the question and show results/i })[0])

    expect(await screen.findByText('Travel stroller')).toBeInTheDocument()
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
    await user.click(screen.getAllByRole('button', { name: /skip the question and show results/i })[0])
    expect(await screen.findByText('Travel stroller')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /new search/i }))

    expect(screen.getByLabelText(/product topic/i)).toHaveValue('')
expect(screen.queryByText('Travel stroller')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter a product topic to get started.')).not.toBeInTheDocument()
  })
})
