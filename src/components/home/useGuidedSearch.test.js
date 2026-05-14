import { describe, expect, it } from 'vitest'

import {
  clearSearchDebugEvents,
  getSearchDebugEvents,
  recordSearchDebugEvent,
} from './searchDebugEvents.js'
import { resolveSelectedProductForDisplay } from './useGuidedSearch.js'

describe('resolveSelectedProductForDisplay', () => {
  it('hydrates an open final-result modal from the latest results by id', () => {
    const selectedProduct = {
      id: 'result-1',
      title: 'Travel stroller',
      fit_reason: '',
      caveat: '',
      feature_bullets: [],
      analyticsMeta: {
        position: 0,
        resultSet: 'final',
      },
    }

    const resolvedProduct = resolveSelectedProductForDisplay({
      results: [
        {
          id: 'result-1',
          title: 'Travel stroller',
          fit_reason: 'Fits travel days well because it folds down fast and stays easy to carry.',
          caveat: 'Storage is a bit tighter than on larger full-size strollers.',
          feature_bullets: ['One-hand fold', 'Compact carry strap'],
        },
      ],
      selectedProduct,
    })

    expect(resolvedProduct).toMatchObject({
      id: 'result-1',
      fit_reason: 'Fits travel days well because it folds down fast and stays easy to carry.',
      caveat: 'Storage is a bit tighter than on larger full-size strollers.',
      feature_bullets: ['One-hand fold', 'Compact carry strap'],
      analyticsMeta: {
        position: 0,
        resultSet: 'final',
      },
    })
  })

  it('falls back to the stored snapshot when the live item is unavailable', () => {
    const selectedProduct = {
      id: 'result-missing',
      title: 'Travel stroller',
      fit_reason: '',
      analyticsMeta: {
        position: 0,
        resultSet: 'final',
      },
    }

    expect(
      resolveSelectedProductForDisplay({
        results: [],
        selectedProduct,
      }),
    ).toBe(selectedProduct)
  })
})

describe('search debug events', () => {
  it('stores bounded sanitized context without raw queries or tokens', () => {
    clearSearchDebugEvents()

    recordSearchDebugEvent('discovery', 'success', {
      activeSearchId: 12,
      amazonDomain: 'amazon.ca',
      candidateCount: 20,
      discoveryToken: 'secret-token',
      error: new Error('Provider failed'),
      previewCount: 6,
      query: 'travel stroller for airplane',
    })

    expect(getSearchDebugEvents()).toEqual([
      expect.objectContaining({
        phase: 'discovery',
        status: 'success',
        activeSearchId: 12,
        queryLength: 28,
        amazonDomain: 'amazon.ca',
        hasDiscoveryToken: true,
        candidateCount: 20,
        previewCount: 6,
        errorName: 'Error',
        errorMessage: 'Provider failed',
      }),
    ])
    expect(getSearchDebugEvents()[0]).not.toHaveProperty('query')
    expect(getSearchDebugEvents()[0]).not.toHaveProperty('discoveryToken')
  })

  it('keeps only the most recent 100 debug events', () => {
    clearSearchDebugEvents()

    for (let index = 0; index < 105; index += 1) {
      recordSearchDebugEvent('query-quality', 'quiet', {
        activeSearchId: index,
        queryLength: index,
      })
    }

    const events = getSearchDebugEvents()

    expect(events).toHaveLength(100)
    expect(events[0]).toMatchObject({
      activeSearchId: 5,
      queryLength: 5,
    })
    expect(events.at(-1)).toMatchObject({
      activeSearchId: 104,
      queryLength: 104,
    })
  })
})
