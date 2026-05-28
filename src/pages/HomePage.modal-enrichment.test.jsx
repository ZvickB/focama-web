import { describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  createMockResult,
  findVisibleResultTitle,
  getVisibleResultTitle,
  renderHomePage,
  setupHomePageTest,
} from './HomePage.test-utils.jsx'

describe('HomePage modal enrichment', () => {
  setupHomePageTest()
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
    await user.click(screen.getAllByRole('button', { name: /skip the question and show results/i })[0])

    expect(screen.queryByText(/pricier than the smallest umbrella stroller options\./i)).not.toBeInTheDocument()

    await user.click(await findVisibleResultTitle('Travel stroller'))

    expect(await screen.findByText(/worth knowing/i)).toBeInTheDocument()
    expect(screen.getByText(/pricier than the smallest umbrella stroller options\./i)).toBeInTheDocument()
  }, 10000)

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
    await findVisibleResultTitle('Travel stroller')

    await user.click(getVisibleResultTitle('Travel stroller'))
    const dialog = await screen.findByRole('dialog', { name: /travel stroller/i })

    await waitFor(
      () => {
        expect(
          within(dialog).getByText(/fits travel days well because it folds quickly and stays easy to carry\./i),
        ).toBeInTheDocument()
      },
      { timeout: 4000 },
    )

    expect(
      within(dialog).getByText(/storage is tighter than on larger everyday strollers\./i),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/one-hand fold for quick airport transfers\./i),
    ).toBeInTheDocument()
  }, 10000)

  it('keeps polling for late feature bullets after initial enrichment is already ready', async () => {
    delete window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__
    const user = userEvent.setup()
    const finalizedResult = createMockResult({
      fit_reason: '',
      caveat: '',
      feature_bullets: [],
    })
    let enrichmentCallCount = 0
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
        enrichmentCallCount += 1

        if (enrichmentCallCount === 1) {
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
                    featureBullets: [],
                  },
                ],
              }),
          })
        }

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
    await findVisibleResultTitle('Travel stroller')

    await user.click(getVisibleResultTitle('Travel stroller'))
    const dialog = await screen.findByRole('dialog', { name: /travel stroller/i })

    await waitFor(
      () => {
        expect(
          within(dialog).getByText(/fits travel days well because it folds quickly and stays easy to carry\./i),
        ).toBeInTheDocument()
      },
      { timeout: 4000 },
    )

    await waitFor(
      () => {
        expect(
          within(dialog).getByText(/one-hand fold for quick airport transfers\./i),
        ).toBeInTheDocument()
      },
      { timeout: 4000 },
    )
    expect(enrichmentCallCount).toBeGreaterThanOrEqual(2)
  }, 10000)

  it('falls back to polling when the enrichment EventSource errors', async () => {
    delete window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__
    const user = userEvent.setup()
    const finalizedResult = createMockResult({
      fit_reason: '',
      caveat: '',
    })
    const eventSources = []

    class MockEventSource {
      constructor(url) {
        this.url = url
        this.onmessage = null
        this.onerror = null
        this.closed = false
        eventSources.push(this)
      }

      close() {
        this.closed = true
      }
    }

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
    vi.stubGlobal('EventSource', MockEventSource)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await findVisibleResultTitle('Travel stroller')

    expect(eventSources).toHaveLength(1)

    act(() => {
      eventSources[0].onerror?.(new Event('error'))
    })

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search/enrichment?')),
      ).toBe(true)
    }, { timeout: 4000 })

    await user.click(getVisibleResultTitle('Travel stroller'))
    const dialog = await screen.findByRole('dialog', { name: /travel stroller/i })

    await waitFor(
      () => {
        expect(
          within(dialog).getByText(/fits travel days well because it folds quickly and stays easy to carry\./i),
        ).toBeInTheDocument()
      },
      { timeout: 4000 },
    )

    expect(eventSources[0].closed).toBe(true)
  }, 10000)
})
