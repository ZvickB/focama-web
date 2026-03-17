import { describe, expect, it } from 'vitest'

import {
  buildCacheKey,
  getNormalizedResults,
  normalizeResult,
} from './search-data.js'

describe('search-data helpers', () => {
  it('builds a lowercase cache key from query and details', () => {
    expect(buildCacheKey('Lego', 'For Kids')).toBe('lego for kids')
  })

  it('normalizes a shopping result into the frontend shape', () => {
    const result = normalizeResult(
      {
        title: 'Travel Stroller',
        source: 'Target',
        extracted_price: 129.99,
        rating: '4.4',
        reviews: '87',
        snippet: 'Lightweight and easy to fold.',
        delivery: 'Free delivery',
        thumbnail: 'https://example.com/stroller.jpg',
        product_link: 'https://example.com/stroller',
      },
      0,
      'Fallback reason',
    )

    expect(result).toEqual({
      id: 'Travel Stroller-0',
      title: 'Travel Stroller',
      subtitle: 'Target',
      price: '$129.99',
      rating: 4.4,
      reviewCount: 87,
      description: 'Lightweight and easy to fold.',
      reasons: ['Source: Target', 'Free delivery', 'Listed around $129.99'],
      image: 'https://example.com/stroller.jpg',
      link: 'https://example.com/stroller',
    })
  })

  it('filters invalid shopping results and respects the limit', () => {
    const results = getNormalizedResults(
      {
        shopping_results: [
          { title: 'Desk Lamp', source: 'Store A' },
          { title: 'Keyboard', source: 'Store B' },
          { title: '', source: 'Broken Result' },
        ],
      },
      1,
      'Fallback reason',
    )

    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Desk Lamp')
  })
})
