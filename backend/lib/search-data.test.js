import { describe, expect, it } from 'vitest'

import {
  buildCacheKey,
  normalizeResult,
  validateSearchInput,
  validateSuggestedSearchQuery,
} from './search-data.js'

describe('search data contracts', () => {
  it('normalizes equivalent shopping queries into the same scoped cache key', () => {
    expect(buildCacheKey('  Desk   Lamps ', '', 'guided_discovery')).toBe('guided_discovery:desk lamp')
  })

  it('normalizes provider products while stripping internal live-route copy', () => {
    const result = normalizeResult({
      title: 'Travel Stroller',
      source: 'Amazon',
      extracted_price: 129.99,
      rating: '4.4',
      reviews: '87',
      snippet: 'Live product result returned for "Travel Stroller".',
      product_link: 'https://example.com/stroller',
    }, 0, 'Returned by the live SerpApi search route')

    expect(result).toMatchObject({
      title: 'Travel Stroller',
      price: '$129.99',
      rating: 4.4,
      reviewCount: 87,
      description: '',
      reasons: ['Available from Amazon', 'Listed around $129.99'],
    })
  })

  it('rejects gibberish and tag-shaped AI suggestions while accepting a normal product query', () => {
    expect(validateSearchInput('jhljlhl').isValid).toBe(false)
    expect(validateSuggestedSearchQuery('</antml parameter>').isValid).toBe(false)
    expect(validateSuggestedSearchQuery('narrow rectangular glass vase')).toMatchObject({
      isValid: true,
      normalizedQuery: 'narrow rectangular glass vase',
    })
  })
})
