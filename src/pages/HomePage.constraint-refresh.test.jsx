import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createMockResult, renderHomePage, setupHomePageTest } from './HomePage.test-utils.jsx'

function createDiscoveryPayload({
  discoveryToken = 'opaque-discovery-token',
  query = 'white chocolate chips',
  title = 'General white chocolate chips',
} = {}) {
  return {
    discoveryToken,
    candidatePool: {
      query,
      details: '',
      candidates: [
        {
          id: `${discoveryToken}-result`,
          title,
          source: 'Amazon',
          price: '$12.99',
          rating: 4.4,
          reviewCount: 87,
          description: 'Search result.',
          reasons: ['Available from Amazon'],
          image: 'https://example.com/chips.jpg',
          link: 'https://example.com/chips',
        },
      ],
    },
    previewResults: [
      createMockResult({
        id: `${discoveryToken}-result`,
        title,
      }),
    ],
  }
}

function createRefinePayload(query = 'white chocolate chips') {
  return {
    prompt: `What should we optimize for with this ${query}?`,
    helperText: 'Pick anything that matters.',
    followUpPlaceholder: 'Anything else?',
  }
}

describe('HomePage constraint-bearing finalize refresh', () => {
  setupHomePageTest()

  it('refreshes discovery with hard follow-up constraints before finalizing from the refreshed token', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(createDiscoveryPayload()),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(createRefinePayload()),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify(createDiscoveryPayload({
            discoveryToken: 'constraint-refresh-token',
            query: 'white chocolate chips kosher pareve',
            title: 'Kosher pareve white chips',
          })),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            candidatePool: {
              query: 'white chocolate chips kosher pareve',
              details: 'Notes: kosher pareve',
              candidates: [],
            },
            retryCount: 0,
            results: [
              createMockResult({
                id: 'constraint-refresh-token-result',
                title: 'Kosher pareve white chips',
              }),
            ],
            selection: {
              mode: 'ai',
            },
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'white chocolate chips')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this white chocolate chips/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'kosher pareve')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))

    expect(await screen.findByText('Kosher pareve white chips')).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) =>
        String(url).includes('/api/search/finalize'),
      )).toBe(true)
    })

    const refreshRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/search/rainforest-discover?query=white+chocolate+chips+kosher+pareve'),
    )
    expect(refreshRequest?.[0]).toContain('cacheMode=refresh')

    const finalizeRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/search/finalize'),
    )
    expect(JSON.parse(finalizeRequest[1].body)).toEqual(
      expect.objectContaining({
        query: 'white chocolate chips kosher pareve',
        discoveryToken: 'constraint-refresh-token',
        followUpNotes: 'kosher pareve',
      }),
    )
  }, 20000)

  it('does not refresh discovery for ordinary soft follow-up preferences', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(createDiscoveryPayload()),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(createRefinePayload()),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            candidatePool: {
              query: 'white chocolate chips',
              details: 'Notes: something cute and affordable',
              candidates: [],
            },
            retryCount: 0,
            results: [
              createMockResult({
                id: 'opaque-discovery-token-result',
                title: 'General white chocolate chips',
              }),
            ],
            selection: {
              mode: 'ai',
            },
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'white chocolate chips')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this white chocolate chips/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'something cute and affordable')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))

    expect(await screen.findByText('General white chocolate chips')).toBeInTheDocument()

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('/api/search/rainforest-discover'),
      )).toHaveLength(1)
    })

    const finalizeRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/search/finalize'),
    )
    expect(JSON.parse(finalizeRequest[1].body)).toEqual(
      expect.objectContaining({
        query: 'white chocolate chips',
        discoveryToken: 'opaque-discovery-token',
        followUpNotes: 'something cute and affordable',
      }),
    )
  }, 20000)
})
