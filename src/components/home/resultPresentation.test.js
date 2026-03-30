import { describe, expect, it } from 'vitest'

import { enrichFinalResultsForDisplay } from './resultPresentation.js'

function createResult(overrides = {}) {
  return {
    id: 'result-1',
    title: 'Travel stroller',
    description: 'Lightweight stroller for airport travel.',
    price: '$199.99',
    rating: 4.6,
    reviewCount: 320,
    reasons: ['Lightweight and easy to carry through the airport.'],
    badgeLabel: '',
    ...overrides,
  }
}

describe('result presentation', () => {
  it('adds deterministic fallback badges without changing shortlist order', () => {
    const results = enrichFinalResultsForDisplay([
      createResult({
        id: 'result-1',
        title: 'Everyday travel stroller',
        price: '$189.99',
      }),
      createResult({
        id: 'result-2',
        title: 'Budget stroller',
        description: 'Simple stroller at a lower price.',
        price: '$119.99',
        rating: 4.3,
        reviewCount: 180,
        reasons: ['Lower price than the rest of the shortlist.'],
      }),
      createResult({
        id: 'result-3',
        title: 'Premium comfort stroller',
        description: 'Ergonomic seat with plush cushioning.',
        price: '$289.99',
        rating: 4.8,
        reviewCount: 410,
        reasons: ['Comfortable padded seat for longer outings.'],
      }),
    ])

    expect(results.map((item) => item.id)).toEqual(['result-1', 'result-2', 'result-3'])
    expect(results.map((item) => item.badgeLabel)).toEqual([
      'Best match',
      'Best budget pick',
      'Best for comfort',
    ])
  })

  it('preserves explicit AI badges and only fills remaining display slots', () => {
    const results = enrichFinalResultsForDisplay([
      createResult({
        id: 'result-1',
        badgeLabel: 'Best match',
      }),
      createResult({
        id: 'result-2',
        title: 'City stroller',
        description: 'Slim frame for apartment storage and tight sidewalks.',
        reasons: ['Fits better in apartments and narrow entryways.'],
      }),
      createResult({
        id: 'result-3',
        badgeLabel: 'Best premium pick',
        title: 'Luxury stroller',
        price: '$329.99',
      }),
    ])

    expect(results.map((item) => item.badgeLabel)).toEqual([
      'Best match',
      'Best for small spaces',
      'Best premium pick',
    ])
  })
})
