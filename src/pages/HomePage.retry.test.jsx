import { describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  createMockResult,
  findVisibleResultTitle,
  renderHomePage,
  setupHomePageTest,
} from './HomePage.test-utils.jsx'

describe('HomePage retry advice', () => {
  setupHomePageTest()
  it(
    'suggests an editable new search when the user rejects a weak shortlist',
    async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input) => {
      const url = String(input)
      let payload
      if (url.includes('/api/search/rainforest-discover')) {
        payload = {
          discoveryToken: 'opaque-discovery-token',
          candidatePool: {
            query: 'stroller',
            details: '',
            candidates: [
              {
                id: 'result-1', title: 'Travel stroller', source: 'Target', price: '$129.99',
                rating: 4.4, reviewCount: 87, description: 'Lightweight and easy to fold.',
                reasons: ['Available from Target'], image: 'https://example.com/stroller.jpg',
                link: 'https://example.com/stroller',
              },
              {
                id: 'result-2', title: 'Full-size stroller', source: 'Target', price: '$189.99',
                rating: 4.5, reviewCount: 120, description: 'Larger frame for everyday use.',
                reasons: ['Roomier seat'], image: 'https://example.com/full-size.jpg',
                link: 'https://example.com/full-size',
              },
            ],
          },
          previewResults: [createMockResult(), createMockResult({ id: 'result-2', title: 'Full-size stroller' })],
        }
      } else if (url.includes('/api/search/refine')) {
        payload = {
          prompt: 'What should we optimize for with this stroller?',
          helperText: 'Pick anything that matters.',
          followUpPlaceholder: 'Anything else?',
        }
      } else if (url.includes('/api/search/finalize')) {
        payload = {
          candidatePool: { query: 'stroller', details: 'Notes: comfort matters most', candidates: [] },
          retryCount: 0,
          results: [
            createMockResult(),
            createMockResult({ id: 'result-2', title: 'Compact airport stroller', price: '$149.99' }),
          ],
          selection: { mode: 'ai' },
        }
      } else if (url.includes('/api/search/retry-advice')) {
        payload = {
          recommendation: 'new_search',
          suggestedQuery: 'compact city stroller under 18 pounds',
          rationale: 'The rejected picks sounded too bulky, so a narrower city stroller search should help.',
        }
      } else {
        throw new Error(`Unexpected fetch call: ${url}`)
      }
      return Promise.resolve({ ok: true, text: async () => JSON.stringify(payload) })
    })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await findVisibleResultTitle('Compact airport stroller')
    await user.click(screen.getByRole('button', { name: /improve picks/i }))
    await screen.findByText(/what felt off/i)

    await user.click(screen.getByRole('button', { name: /missing a must-have/i }))
    await user.type(
      document.getElementById('results-retry-feedback'),
      'Still too bulky for city travel.',
    )
    await user.click(screen.getByRole('button', { name: /prepare next search/i }))

    expect(
      await screen.findByText(/the rejected picks sounded too bulky/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/retry 2 of 2\./i)).not.toBeInTheDocument()
    const retryAdviceRequest = fetchMock.mock.calls[3]
    expect(retryAdviceRequest[0]).toContain('/api/search/retry-advice')
    expect(retryAdviceRequest[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(JSON.parse(retryAdviceRequest[1].body)).toEqual({
      query: 'stroller',
      followUpNotes: 'comfort matters most',
      rejectionFeedback: 'Missing a must-have\nStill too bulky for city travel.',
      shortlist: [
        { title: 'Travel stroller' },
        { title: 'Compact airport stroller' },
      ],
    })
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/search/finalize'))).toHaveLength(1)

    expect(screen.getAllByText('stroller').length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/next search/i)).toHaveValue('compact city stroller under 18 pounds')
    expect(screen.queryByText(/keeping:/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /search again/i })).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/next search/i))
    await user.type(screen.getByLabelText(/next search/i), 'lightweight umbrella stroller for city travel')

    expect(screen.getAllByText('stroller').length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/next search/i)).toHaveValue(
      'lightweight umbrella stroller for city travel',
    )
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
    await findVisibleResultTitle('Travel stroller')
    await user.click(screen.getByRole('button', { name: /improve picks/i }))
    await screen.findByText(/what felt off/i)

    const retryTextarea = document.getElementById('results-retry-feedback')
    await user.type(retryTextarea, 'Too bulky')
    await user.click(screen.getByRole('button', { name: /prepare next search/i }))
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
    expect(screen.queryByRole('button', { name: /search again/i })).not.toBeInTheDocument()
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
    await findVisibleResultTitle('Travel stroller')
    await user.click(screen.getByRole('button', { name: /improve picks/i }))
    await screen.findByText(/what felt off/i)

    await user.type(document.getElementById('results-retry-feedback'), 'Too bulky')
    await user.click(screen.getByRole('button', { name: /prepare next search/i }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search/retry-advice'))).toBe(true)
    })
    await user.click(screen.getByRole('button', { name: /new search/i }))

    await act(async () => {
      rejectRetryAdvice(new Error('Unable to prepare next search direction.'))

      try {
        await retryAdvicePromise
      } catch {
        // Expected rejection for this stale request.
      }
    })

    expect(screen.queryByText(/unable to prepare next search direction/i)).not.toBeInTheDocument()
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
    await findVisibleResultTitle('Travel stroller')
    await user.click(screen.getByRole('button', { name: /improve picks/i }))
    await screen.findByText(/what felt off/i)
    await user.type(document.getElementById('results-retry-feedback'), 'Too bulky')
    await user.click(screen.getByRole('button', { name: /prepare next search/i }))

    expect(await screen.findByText(/a narrower search should help/i)).toBeInTheDocument()
    expect(screen.getAllByText('stroller').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /search again/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new search/i })).toBeInTheDocument()
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
                fit_reason: '',
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
    await user.click(screen.getAllByRole('button', { name: /skip the question and show results/i })[0])

    expect(
      screen.queryByText(/live product result returned for "thermos stainless king/i),
    ).not.toBeInTheDocument()
    expect(screen.getAllByText(/excellent heat retention for long commutes\./i).at(-1)).toBeInTheDocument()
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
    await findVisibleResultTitle('Travel stroller')
    await user.click(screen.getByRole('button', { name: /improve picks/i }))
    await screen.findByText(/what felt off/i)

    expect(screen.getByText(/what felt off/i)).toBeInTheDocument()
    expect(document.getElementById('results-retry-feedback')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /prepare next search/i })).toBeDisabled()
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
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            discoveryToken: 'retry-discovery-token',
            candidatePool: {
              query: 'slim city stroller',
              details: '',
              candidates: [],
            },
            previewResults: [createMockResult({ id: 'result-3', title: 'Slim city stroller' })],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            prompt: 'What should we optimize for with this slim city stroller?',
            helperText: 'Pick anything that matters.',
            followUpPlaceholder: 'Anything else?',
          }),
      })

    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'stroller')
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await screen.findByText(/what should we optimize for with this stroller/i)
    await user.type(screen.getByLabelText(/tell us more/i), 'comfort matters most')
    await user.click(screen.getByRole('button', { name: /show focused picks/i }))
    await findVisibleResultTitle('Travel stroller')
    await user.click(screen.getByRole('button', { name: /improve picks/i }))
    await screen.findByText(/what felt off/i)

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
    expect(screen.getAllByText('stroller').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /search again/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /search again/i }))

    await screen.findByText(/what should we optimize for with this slim city stroller/i)
    expect(screen.getAllByText('slim city stroller').length).toBeGreaterThan(0)
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('/api/search/rainforest-discover?query=slim+city+stroller') &&
          String(url).includes('cacheMode=refresh'),
      ),
    ).toBe(true)
  })
})
