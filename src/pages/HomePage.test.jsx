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
    reasons: ['Source: Target', 'Free delivery', 'Listed around $129.99'],
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

    const productInput = screen.getByLabelText(/product topic/i)
    await user.clear(productInput)
    await user.click(screen.getByRole('button', { name: /ai help/i }))

    expect(screen.getByText('Please enter a product topic first.')).toBeInTheDocument()
  })

  it('shows a validation error for obvious gibberish queries', async () => {
    const user = userEvent.setup()

    renderHomePage()

    const productInput = screen.getByLabelText(/product topic/i)
    await user.clear(productInput)
    await user.type(productInput, 'jhljlhl')
    await user.click(screen.getByRole('button', { name: /ai help/i }))

    expect(
      screen.getByText('Try a real product topic, like "lego", "desk lamp", or "travel stroller".'),
    ).toBeInTheDocument()
  })

  it('shows loading copy while waiting for search results', async () => {
    const user = userEvent.setup()
    let resolveFetch
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve
    })

    vi.stubGlobal('fetch', vi.fn(() => fetchPromise))

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /ai help/i }))

    expect(screen.getByText('Curating your options...')).toBeInTheDocument()
    expect(screen.getByText(/cleaning candidates and preparing ai-picked cards/i)).toBeInTheDocument()
    expect(screen.getByText(/searching products, cleaning candidates, and preparing the cards/i)).toBeInTheDocument()

    resolveFetch({
      ok: true,
      text: async () => JSON.stringify({ results: [createMockResult()] }),
    })

    expect(await screen.findByText('Travel stroller')).toBeInTheDocument()
  })

  it('shows the backend error message when the request fails', async () => {
    const user = userEvent.setup()

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => JSON.stringify({ error: 'SerpApi request failed.' }),
      }),
    )

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /ai help/i }))

    expect(await screen.findByText('SerpApi request failed.')).toBeInTheDocument()
  })

  it('renders returned results after a successful search', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
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
    await user.click(screen.getByRole('button', { name: /ai help/i }))

    expect(await screen.findByText('Travel stroller')).toBeInTheDocument()
    expect(screen.getByText('Compact airport stroller')).toBeInTheDocument()
    expect(screen.getByText('Top results for "stroller"')).toBeInTheDocument()
    expect(screen.getAllByText('AI Help').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/tradeoff:/i).length).toBeGreaterThan(0)
  })

  it('clicking a starter prompt fills the form with that prompt values', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.click(screen.getByRole('button', { name: /travel stroller for easy airport use/i }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/product topic/i)).toHaveValue('stroller')
    expect(screen.getByLabelText(/buying context/i)).toHaveValue(
      'For airport travel with a child, where easy folding and carrying matter more than extra accessories.',
    )
  })
})
