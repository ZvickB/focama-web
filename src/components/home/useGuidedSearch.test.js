import { describe, expect, it } from 'vitest'

import { resolveSelectedProductForDisplay } from './useGuidedSearch.js'

describe('resolveSelectedProductForDisplay', () => {
  it('hydrates an open final-result modal from the latest results by id', () => {
    const selectedProduct = {
      id: 'result-1',
      title: 'Travel stroller',
      fit_reason: '',
      caveat: '',
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
        },
      ],
      selectedProduct,
    })

    expect(resolvedProduct).toMatchObject({
      id: 'result-1',
      fit_reason: 'Fits travel days well because it folds down fast and stays easy to carry.',
      caveat: 'Storage is a bit tighter than on larger full-size strollers.',
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
