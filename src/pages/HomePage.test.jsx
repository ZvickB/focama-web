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

    expect(screen.getByText('Please enter a product topic first.')).toBeInTheDocument()
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
    expect(screen.getByText(/skip ai refinement\./i)).toBeInTheDocument()
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
    expect(screen.getByText(/skip ai refinement\./i)).toBeInTheDocument()
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
