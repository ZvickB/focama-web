/**
 * UI cache-latency smoke test.
 *
 * This complements backend/smoke.test.js: that test proves the discovery cache
 * avoids Rainforest, while this one proves the completed discovery response is
 * actually surfaced as a preview card in the browser flow. It measures from the
 * user pressing Start search to the first product title being present on screen.
 */

import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createMockResult, renderHomePage, setupHomePageTest } from './HomePage.test-utils.jsx'

const PROVIDER_DELAY_MS = 420
const CACHE_DELAY_MS = 45

function response(body) {
  return {
    ok: true,
    headers: { get: () => '' },
    text: async () => JSON.stringify(body),
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function createSearchFetchMock() {
  let discoveryRequestCount = 0

  return vi.fn(async (input) => {
    const url = String(input)

    if (url.includes('/api/search/rainforest-discover')) {
      discoveryRequestCount += 1
      const isCacheHit = discoveryRequestCount === 2
      await wait(isCacheHit ? CACHE_DELAY_MS : PROVIDER_DELAY_MS)

      return response({
        source: isCacheHit ? 'cache' : 'rainforest_discovery',
        discoveryToken: `discovery-${discoveryRequestCount}`,
        candidatePool: {
          candidates: [createMockResult({ id: `candidate-${discoveryRequestCount}` })],
          query: 'travel stroller',
        },
        previewResults: [createMockResult({ id: `result-${discoveryRequestCount}` })],
      })
    }

    if (url.includes('/api/search/refine')) {
      return response({
        prompt: 'What should we optimize for with this stroller?',
        helperText: 'Pick anything that matters.',
        followUpPlaceholder: 'Anything else?',
      })
    }

    // Analytics and optional background reads must not affect the visible-search
    // measurement. They are intentionally not delayed in this smoke.
    return response({ ok: true })
  })
}

async function searchUntilFirstPreviewCard(user, query = 'travel stroller') {
  await user.type(screen.getByLabelText(/product topic/i), query)

  const startedAt = performance.now()
  await user.click(screen.getByRole('button', { name: /start search/i }))

  const skipButton = await screen.findByRole('button', { name: /skip and show results/i })
  await waitFor(() => expect(skipButton).toBeEnabled())
  await user.click(skipButton)
  await waitFor(() => expect(document.querySelector('[data-result-row-index="0"]')).toBeInTheDocument())

  return performance.now() - startedAt
}

describe('UI cache-latency smoke', () => {
  setupHomePageTest()

  it('shows a cached discovery as a preview card much sooner than a provider discovery', async () => {
    const user = userEvent.setup()
    const fetchMock = createSearchFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    renderHomePage()

    const providerToScreenMs = await searchUntilFirstPreviewCard(user)

    await user.click(screen.getByRole('button', { name: /new search/i }))
    const cacheToScreenMs = await searchUntilFirstPreviewCard(user)

    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/search/rainforest-discover')))
      .toHaveLength(2)
    expect(cacheToScreenMs, 'a cached discovery should surface a card at least 40% sooner').toBeLessThan(
      providerToScreenMs * 0.6,
    )
  })

  it('still surfaces preview cards when session storage is degraded', async () => {
    const user = userEvent.setup()
    const degradedResult = createMockResult({ title: 'Storage-safe preview' })
    const fetchMock = vi.fn(async (input) => {
      const url = String(input)

      if (url.includes('/api/search/rainforest-discover')) {
        await wait(CACHE_DELAY_MS)
        return response({
          source: 'cache',
          discoveryToken: '',
          guidedAvailable: false,
          degradedReason: 'session_storage_unavailable',
          degradedMessage: 'Preview results are available while focused picks recover.',
          candidatePool: { candidates: [degradedResult], query: 'travel stroller' },
          previewResults: [degradedResult],
        })
      }

      if (url.includes('/api/search/refine')) {
        return response({
          prompt: 'What should we optimize for with this stroller?',
          helperText: 'Pick anything that matters.',
          followUpPlaceholder: 'Anything else?',
        })
      }

      return response({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderHomePage()

    await user.type(screen.getByLabelText(/product topic/i), 'travel stroller')
    const startedAt = performance.now()
    await user.click(screen.getByRole('button', { name: /start search/i }))
    await waitFor(() => expect(document.querySelector('[data-result-row-index="0"]')).toBeInTheDocument())
    const queryToScreenMs = performance.now() - startedAt

    expect(screen.getAllByText('Storage-safe preview')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: /try focused picks again/i })).toBeInTheDocument()
    expect(queryToScreenMs).toBeLessThan(PROVIDER_DELAY_MS)
  })
})
