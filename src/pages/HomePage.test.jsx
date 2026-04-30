import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import SiteLayout from '@/components/SiteLayout.jsx'
import { AmazonStoreProvider } from '@/contexts/AmazonStoreContext.jsx'
import { SearchProgressProvider } from '@/contexts/SearchProgressContext.jsx'
import HomePage from './HomePage.jsx'

function createMockResult(overrides = {}) {
  return {
    id: 'result-1',
    title: 'Travel stroller',
    subtitle: 'Target',
    price: '$129.99',
    rating: 4.4,
    reviewCount: 87,
    description: 'Lightweight and easy to fold.',
    fit_reason: 'Lightweight and easy to fold — well suited for travel.',
    caveat: 'Pricier than the smallest umbrella stroller options.',
    image: 'https://example.com/stroller.jpg',
    link: 'https://example.com/stroller',
    ...overrides,
  }
}

function renderHomePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return render(
    <MemoryRouter initialEntries={['/']}>
      <QueryClientProvider client={queryClient}>
        <AmazonStoreProvider>
          <SearchProgressProvider>
            <Routes>
              <Route element={<SiteLayout />}>
                <Route path="/" element={<HomePage />} />
              </Route>
            </Routes>
          </SearchProgressProvider>
        </AmazonStoreProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.__FOCAMAI_DISABLE_BACKEND_PREWARM__ = true
    window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__ = true
    window.__FOCAMAI_DISABLE_GEO_FETCH__ = true
  })

  afterEach(() => {
    delete window.__FOCAMAI_DISABLE_BACKEND_PREWARM__
    delete window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__
    delete window.__FOCAMAI_DISABLE_GEO_FETCH__
    vi.useRealTimers()
    cleanup()
  })

  it('shows a validation error when the product query is blank', async () => {
    const user = userEvent.setup()

    renderHomePage()

    await user.click(screen.getByRole('button', { name: /start search/i }))

    expect(screen.getByText('Enter a product topic to get started.')).toBeInTheDocument()
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
    expect(screen.getAllByRole('button', { name: /just show me results/i })[0]).toBeInTheDocument()
    expect(
      screen.getByText(/your shortlist is taking shape\./i),
    ).toBeInTheDocument()
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
    await user.click(screen.getAllByRole('button', { name: /just show me results/i })[0])

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
    await user.click(screen.getAllByRole('button', { name: /just show me results/i })[0])
    expect(await screen.findByText('Travel stroller')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /new search/i }))

    expect(screen.getByLabelText(/product topic/i)).toHaveValue('')
    expect(screen.getByText(/search first, refine while it loads\./i)).toBeInTheDocument()
    expect(screen.queryByText('Travel stroller')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter a product topic to get started.')).not.toBeInTheDocument()
  })

  it(
    'suggests an editable new search when the user rejects a weak shortlist',
    async () => {
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
                {
                  id: 'result-2',
                  title: 'Full-size stroller',
                  source: 'Target',
                  price: '$189.99',
                  rating: 4.5,
                  reviewCount: 120,
                  description: 'Larger frame for everyday use.',
                  reasons: ['Roomier seat'],
                  image: 'https://example.com/full-size.jpg',
                  link: 'https://example.com/full-size',
                },
              ],
            },
            previewResults: [createMockResult(), createMockResult({ id: 'result-2', title: 'Full-size stroller' })],
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
            retryCount: 0,
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
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            recommendation: 'new_search',
            suggestedQuery: 'compact city stroller under 18 pounds',
            rationale: 'The rejected picks sounded too bulky, so a narrower city stroller search should help.',
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await screen.findByText('Compact airport stroller')
    await user.click(screen.getByRole('button', { name: /not quite what you needed\?/i }))
    await screen.findByText(/what felt off about these picks\?/i)

    await user.type(
      document.getElementById('results-retry-feedback'),
      'Still too bulky for city travel.',
    )
    await user.click(screen.getByRole('button', { name: /get a suggestion/i }))

    expect(
      await screen.findByText(/the rejected picks sounded too bulky/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/the rejected picks sounded too bulky/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/retry 2 of 2\./i)).not.toBeInTheDocument()
    const retryAdviceRequest = fetchMock.mock.calls[3]
    expect(retryAdviceRequest[0]).toBe('/api/search/retry-advice')
    expect(retryAdviceRequest[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(JSON.parse(retryAdviceRequest[1].body)).toEqual({
      query: 'stroller',
      followUpNotes: 'comfort matters most',
      rejectionFeedback: 'Still too bulky for city travel.',
      shortlist: [
        { title: 'Travel stroller' },
        { title: 'Compact airport stroller' },
      ],
    })
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/search/finalize'))).toHaveLength(1)

    const suggestedQueryInput = screen.getByLabelText(/try this search/i)
    expect(suggestedQueryInput).toHaveValue('compact city stroller under 18 pounds')
    await user.clear(suggestedQueryInput)
    await user.type(suggestedQueryInput, 'lightweight umbrella stroller for city travel')
    await user.click(screen.getByRole('button', { name: /use this search/i }))

    expect(screen.getByLabelText(/product topic/i)).toHaveValue(
      'lightweight umbrella stroller for city travel',
    )
    expect(screen.getByRole('button', { name: /start search/i })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    },
    20000,
  )

  it('ignores stale retry advice after reset clears the retry state', async () => {
    let resolveRetryAdvice
    const retryAdvicePromise = new Promise((resolve) => {
      resolveRetryAdvice = resolve
    })
    const user = userEvent.setup()
    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url.includes('/api/search/rainforest-discover')) {
        return Promise.resolve({
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
      }

      if (url.includes('/api/search/refine')) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            JSON.stringify({
              prompt: 'What should we optimize for with this stroller?',
              helperText: 'Pick anything that matters.',
              followUpPlaceholder: 'Anything else?',
            }),
        })
      }

      if (url.includes('/api/search/finalize')) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            JSON.stringify({
              candidatePool: {
                query: 'stroller',
                details: 'Notes: comfort matters most',
                candidates: [],
              },
              retryCount: 0,
              results: [createMockResult()],
              selection: {
                mode: 'ai',
              },
            }),
        })
      }

      if (url.includes('/api/search/retry-advice')) {
        return retryAdvicePromise
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await screen.findByText('Travel stroller')
    await user.click(screen.getByRole('button', { name: /not quite what you needed\?/i }))
    await screen.findByText(/what felt off about these picks\?/i)

    const retryTextarea = document.getElementById('results-retry-feedback')
    await user.type(retryTextarea, 'Too bulky')
    await user.click(screen.getByRole('button', { name: /get a suggestion/i }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search/retry-advice'))).toBe(true)
    })
    await user.click(screen.getByRole('button', { name: /new search/i }))

    await act(async () => {
      resolveRetryAdvice({
        ok: true,
        text: async () =>
          JSON.stringify({
            recommendation: 'new_search',
            suggestedQuery: 'compact city stroller',
            rationale: 'A narrower search should help.',
          }),
      })
      await retryAdvicePromise
    })

    expect(screen.queryByText(/a narrower search should help/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/try this search/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/product topic/i)).toHaveValue('')
  }, 10000)

  it('ignores stale retry advice errors after reset clears the retry state', async () => {
    let rejectRetryAdvice
    const retryAdvicePromise = new Promise((resolve, reject) => {
      rejectRetryAdvice = reject
    })
    const user = userEvent.setup()
    const fetchMock = vi.fn((input) => {
      const url = String(input)

      if (url.includes('/api/search/rainforest-discover')) {
        return Promise.resolve({
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
      }

      if (url.includes('/api/search/refine')) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            JSON.stringify({
              prompt: 'What should we optimize for with this stroller?',
              helperText: 'Pick anything that matters.',
              followUpPlaceholder: 'Anything else?',
            }),
        })
      }

      if (url.includes('/api/search/finalize')) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            JSON.stringify({
              candidatePool: {
                query: 'stroller',
                details: 'Notes: comfort matters most',
                candidates: [],
              },
              retryCount: 0,
              results: [createMockResult()],
              selection: {
                mode: 'ai',
              },
            }),
        })
      }

      if (url.includes('/api/search/retry-advice')) {
        return retryAdvicePromise
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await screen.findByText('Travel stroller')
    await user.click(screen.getByRole('button', { name: /not quite what you needed\?/i }))
    await screen.findByText(/what felt off about these picks\?/i)

    await user.type(document.getElementById('results-retry-feedback'), 'Too bulky')
    await user.click(screen.getByRole('button', { name: /get a suggestion/i }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search/retry-advice'))).toBe(true)
    })
    await user.click(screen.getByRole('button', { name: /new search/i }))

    await act(async () => {
      rejectRetryAdvice(new Error('Unable to suggest a better search direction.'))

      try {
        await retryAdvicePromise
      } catch {
        // Expected rejection for this stale request.
      }
    })

    expect(screen.queryByText(/unable to suggest a better search direction/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/product topic/i)).toHaveValue('')
  }, 10000)

  it('disables suggested retry search when the advice returns an empty query', async () => {
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
            retryCount: 0,
            results: [createMockResult()],
            selection: {
              mode: 'ai',
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            recommendation: 'new_search',
            suggestedQuery: '',
            rationale: 'A narrower search should help.',
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await screen.findByText('Travel stroller')
    await user.click(screen.getByRole('button', { name: /not quite what you needed\?/i }))
    await screen.findByText(/what felt off about these picks\?/i)
    await user.type(document.getElementById('results-retry-feedback'), 'Too bulky')
    await user.click(screen.getByRole('button', { name: /get a suggestion/i }))

    expect(await screen.findByText(/a narrower search should help/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/try this search/i)).toHaveValue('')
    expect(screen.getByRole('button', { name: /use this search/i })).toBeDisabled()
  }, 10000)

  it('filters raw live-route reason copy out of the result cards', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'opaque-discovery-token',
            candidatePool: {
              query: 'thermos',
              details: '',
              candidates: [
                {
                  id: 'result-1',
                  title: 'Thermos Stainless King Vacuum-Insulated Drink Bottle',
                  source: 'Amazon',
                  price: '$34.99',
                  rating: 4.7,
                  reviewCount: 1200,
                  description: 'Keeps drinks hot for hours.',
                  reasons: [
                    'Live product result returned for "Thermos Stainless King Vacuum-Insulated Drink Bottle".',
                    'Excellent heat retention for long commutes.',
                  ],
                  image: 'https://example.com/thermos.jpg',
                  link: 'https://example.com/thermos',
                },
              ],
            },
            previewResults: [
              createMockResult({
                title: 'Thermos Stainless King Vacuum-Insulated Drink Bottle',
                reasons: [
                  'Live product result returned for "Thermos Stainless King Vacuum-Insulated Drink Bottle".',
                  'Excellent heat retention for long commutes.',
                ],
              }),
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            prompt: 'What should we optimize for with this thermos?',
            helperText: 'Pick anything that matters.',
            followUpPlaceholder: 'Anything else?',
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'thermos')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this thermos/i)
    await user.click(screen.getAllByRole('button', { name: /just show me results/i })[0])

    expect(
      screen.queryByText(/live product result returned for "thermos stainless king/i),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/excellent heat retention for long commutes\./i)).toBeInTheDocument()
  })

  it('shows the simplified retry advice prompt without a visible retry counter', async () => {
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
            retryCount: 0,
            results: [createMockResult()],
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
    await screen.findByText('Travel stroller')
    await user.click(screen.getByRole('button', { name: /not quite what you needed\?/i }))
    await screen.findByText(/what felt off about these picks\?/i)

    expect(screen.getByText(/what felt off about these picks\?/i)).toBeInTheDocument()
    expect(document.getElementById('results-retry-feedback')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /get a suggestion/i })).toBeDisabled()
    expect(screen.queryByText(/retry 1 of 2/i)).not.toBeInTheDocument()
  })

  it('submits retry feedback on enter and keeps shift-enter for a new line', async () => {
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
            retryCount: 0,
            results: [createMockResult()],
            selection: {
              mode: 'ai',
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            recommendation: 'new_search',
            suggestedQuery: 'slim city stroller',
            rationale: 'A narrower city stroller search should better match that feedback.',
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await screen.findByText('Travel stroller')
    await user.click(screen.getByRole('button', { name: /not quite what you needed\?/i }))
    await screen.findByText(/what felt off about these picks\?/i)

    const retryTextarea = document.getElementById('results-retry-feedback')
    await user.type(retryTextarea, 'Line one')
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(retryTextarea).toHaveValue('Line one\n')

    await user.clear(retryTextarea)
    await user.type(retryTextarea, 'Too bulky')
    await user.keyboard('{Enter}')

    expect(
      await screen.findByText(/a narrower city stroller search should better match that feedback/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/try this search/i)).toHaveValue('slim city stroller')
  })

  it('keeps tradeoffs out of the result grid and shows them only in the modal', async () => {
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
    await user.click(screen.getAllByRole('button', { name: /just show me results/i })[0])

    expect(screen.queryByText(/pricier than the smallest umbrella stroller options\./i)).not.toBeInTheDocument()

    await user.click(screen.getByText('Travel stroller'))

    expect(await screen.findByText(/worth knowing/i)).toBeInTheDocument()
    expect(screen.getByText(/pricier than the smallest umbrella stroller options\./i)).toBeInTheDocument()
  })

  it('hydrates the modal explanation from async enrichment polling when the payload uses camelCase fields', async () => {
    delete window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__
    const user = userEvent.setup()
    const finalizedResult = createMockResult({
      fit_reason: '',
      caveat: '',
    })
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

      if (url.includes('/api/search/finalize')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          text: async () =>
            JSON.stringify({
              candidatePool: {
                query: 'stroller',
                details: 'Notes: comfort matters most',
                candidates: [],
              },
              results: [finalizedResult],
              selection: {
                mode: 'ai',
              },
            }),
        })
      }

      if (url.includes('/api/search/enrichment')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          text: async () =>
            JSON.stringify({
              ready: true,
              entries: [
                {
                  candidateId: 'result-1',
                  fitReason: 'Fits travel days well because it folds quickly and stays easy to carry.',
                  caveat: 'Storage is tighter than on larger everyday strollers.',
                  featureBullets: [
                    'One-hand fold for quick airport transfers.',
                    'Compact carry strap for travel days.',
                  ],
                },
              ],
            }),
        })
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await screen.findByText('Travel stroller')

    await user.click(screen.getByText('Travel stroller'))

    await waitFor(
      () => {
        expect(
          screen.getByText(/fits travel days well because it folds quickly and stays easy to carry\./i),
        ).toBeInTheDocument()
      },
      { timeout: 4000 },
    )

    expect(
      screen.getByText(/storage is tighter than on larger everyday strollers\./i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/one-hand fold for quick airport transfers\./i),
    ).toBeInTheDocument()
  }, 10000)
})
