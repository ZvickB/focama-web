import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
    reasons: ['Available from Target', 'Free delivery', 'Listed around $129.99'],
    drawbacks: ['Pricier than the smallest umbrella stroller options.'],
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
    <QueryClientProvider client={queryClient}>
      <HomePage />
    </QueryClientProvider>,
  )
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
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
            discoveryToken: 'guided_discovery:stroller|',
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
    expect(screen.getAllByRole('button', { name: /show products now/i })[0]).toBeInTheDocument()
    expect(
      screen.getByText(/these are fast picks from our cleaned product pool\./i),
    ).toBeInTheDocument()
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

  it('finalizes results after the user adds refinement notes', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'guided_discovery:stroller|',
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
    await user.type(screen.getByLabelText(/add context for the ai/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))

    expect(await screen.findByText('Compact airport stroller')).toBeInTheDocument()
    expect(
      screen.getByText(/these picks were finalized after your guided refinement/i),
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
            discoveryToken: 'guided_discovery:stroller|',
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

    const refinementTextarea = screen.getByLabelText(/add context for the ai/i)
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
            discoveryToken: 'guided_discovery:stroller|',
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
    await user.click(screen.getAllByRole('button', { name: /show products now/i })[0])

    expect(await screen.findByText('Travel stroller')).toBeInTheDocument()
    expect(
      screen.getByText(/these are fast picks from our cleaned product pool\./i),
    ).toBeInTheDocument()
  })

  it('lets the user reset to a brand-new search after results are shown', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'guided_discovery:stroller|',
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
    await user.click(screen.getAllByRole('button', { name: /show products now/i })[0])
    expect(await screen.findByText('Travel stroller')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /new search/i }))

    expect(screen.getByLabelText(/product topic/i)).toHaveValue('')
    expect(screen.getByText(/search first, refine while it loads\./i)).toBeInTheDocument()
    expect(screen.queryByText('Travel stroller')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter a product topic to get started.')).not.toBeInTheDocument()
  })

  it('lets the user retry a weak shortlist with feedback for a second pass', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'guided_discovery:stroller|',
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
            candidatePool: {
              query: 'stroller',
              details:
                'Notes: comfort matters most. Retry feedback: Still too bulky for city travel.',
              candidates: [],
            },
            retryCount: 1,
            results: [
              createMockResult({
                id: 'result-3',
                title: 'Slim city stroller',
                price: '$159.99',
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
    await user.type(screen.getByLabelText(/add context for the ai/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await screen.findByText('Compact airport stroller')

    await user.type(
      screen.getByLabelText(/what felt off about these picks/i),
      'Still too bulky for city travel.',
    )
    await user.click(screen.getByRole('button', { name: /try again with this feedback/i }))

    expect(await screen.findByText('Slim city stroller')).toBeInTheDocument()
    expect(screen.getByText(/retry 2 of 2\./i)).toBeInTheDocument()
    expect(screen.getByText(/previous picks/i)).toBeInTheDocument()
    const retryRequest = fetchMock.mock.calls[3]
    expect(retryRequest[0]).toBe('/api/search/finalize')
    expect(retryRequest[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(JSON.parse(retryRequest[1].body)).toEqual({
      query: 'stroller',
      discoveryToken: 'guided_discovery:stroller|',
      followUpNotes: 'comfort matters most',
      rejectionFeedback: 'Still too bulky for city travel.',
      excludedCandidateIds: ['result-1', 'result-2'],
      retryCount: 1,
    })
  })

  it('filters raw live-route reason copy out of the result cards', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'guided_discovery:thermos|',
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
    await user.click(screen.getAllByRole('button', { name: /show products now/i })[0])

    expect(
      screen.queryByText(/live product result returned for "thermos stainless king/i),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/excellent heat retention for long commutes\./i)).toBeInTheDocument()
  })

  it('shows an explicit message when no new retry picks remain after exclusions', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'guided_discovery:stroller|',
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
            candidatePool: {
              query: 'stroller',
              details: 'Retry feedback: Too bulky. Excluded previous picks: result-1',
              candidates: [],
            },
            retryCount: 1,
            results: [],
            selection: {
              mode: 'retry_exhausted',
              details: 'No new candidates remained after excluding the previously rejected picks.',
            },
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/add context for the ai/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await screen.findByText('Travel stroller')

    await user.type(screen.getByLabelText(/what felt off about these picks/i), 'Too bulky')
    await user.click(screen.getByRole('button', { name: /try again with this feedback/i }))

    expect(await screen.findByText(/no new picks were left after that feedback\./i)).toBeInTheDocument()
    expect(screen.getByText(/previous picks/i)).toBeInTheDocument()
  })

  it('submits retry feedback on enter and keeps shift-enter for a new line', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'guided_discovery:stroller|',
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
            candidatePool: {
              query: 'stroller',
              details: 'Notes: comfort matters most. Retry feedback: Too bulky',
              candidates: [],
            },
            retryCount: 1,
            results: [createMockResult({ id: 'result-2', title: 'Slim stroller' })],
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
    await user.type(screen.getByLabelText(/add context for the ai/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await screen.findByText('Travel stroller')

    const retryTextarea = screen.getByLabelText(/what felt off about these picks/i)
    await user.type(retryTextarea, 'Line one')
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(retryTextarea).toHaveValue('Line one\n')

    await user.clear(retryTextarea)
    await user.type(retryTextarea, 'Too bulky')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('Slim stroller')).toBeInTheDocument()
  })

  it('lets the user type directly into the single product input before starting the search', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'travel stroller')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/product topic/i)).toHaveValue('travel stroller')
  })
})
