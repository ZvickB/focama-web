import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
    image: 'https://example.com/stroller.jpg',
    link: 'https://example.com/stroller',
    ...overrides,
  }
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

    render(<HomePage />)

    const productInput = screen.getByLabelText(/product topic/i)
    await user.clear(productInput)
    await user.click(screen.getByRole('button', { name: /get product picks/i }))

    expect(screen.getByText('Please enter a product topic first.')).toBeInTheDocument()
  })

  it('shows loading copy while waiting for search results', async () => {
    const user = userEvent.setup()
    let resolveFetch
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve
    })

    vi.stubGlobal('fetch', vi.fn(() => fetchPromise))

    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: /get product picks/i }))

    expect(screen.getByText('Curating your options...')).toBeInTheDocument()
    expect(screen.getByText(/live search results load/i)).toBeInTheDocument()

    resolveFetch({
      ok: true,
      text: async () => JSON.stringify({ results: [createMockResult()] }),
    })

    await screen.findByText('Travel stroller')
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

    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: /get product picks/i }))

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
        }),
    })

    vi.stubGlobal('fetch', fetchMock)

    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: /get product picks/i }))

    expect(await screen.findByText('Travel stroller')).toBeInTheDocument()
    expect(screen.getByText('Compact airport stroller')).toBeInTheDocument()
    expect(screen.getByText('Top results for "lego"')).toBeInTheDocument()
  })

  it('clicking a starter prompt triggers a search with that prompt values', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ results: [createMockResult()] }),
    })

    vi.stubGlobal('fetch', fetchMock)

    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: /travel stroller for easy airport use/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/search?query=stroller&details=For+airport+travel+with+a+child%2C+where+easy+folding+and+carrying+matter+more+than+extra+accessories.',
    )
  })
})
