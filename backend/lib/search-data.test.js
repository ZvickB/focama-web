import { describe, expect, it } from 'vitest'

import {
  buildCacheKey,
  getNormalizedResults,
  getEnv,
  normalizeCacheKeyInput,
  normalizeResult,
  resetEnvCache,
  validateSearchInput,
} from './search-data.js'

describe('search-data helpers', () => {
  it('prefers process env values over the cached env file fallback', () => {
    process.env.SEARCH_DATA_TEST_VALUE = 'from-process'

    expect(getEnv('SEARCH_DATA_TEST_VALUE')).toBe('from-process')

    delete process.env.SEARCH_DATA_TEST_VALUE
  })

  it('can reset the cached env file snapshot between reads', () => {
    resetEnvCache()

    expect(getEnv('SEARCH_DATA_TEST_VALUE_THAT_DOES_NOT_EXIST')).toBeUndefined()
  })

  it('builds a lowercase cache key from query and details', () => {
    expect(buildCacheKey('Lego', 'For Kids')).toBe('lego for kids')
  })

  it('supports scoped cache keys for separate search flows', () => {
    expect(buildCacheKey('Lego', 'For Kids', 'guided_discovery')).toBe('guided_discovery:lego for kids')
  })

  it('normalizes repeated whitespace and obvious plural nouns for cache keys', () => {
    expect(normalizeCacheKeyInput('  Ice   Cream   Makers  ')).toBe('ice cream maker')
    expect(buildCacheKey('Desk Lamps', '')).toBe('desk lamp')
    expect(buildCacheKey('Toy Buses', '')).toBe('toy bus')
  })

  it('keeps words that should not be singularized aggressively', () => {
    expect(normalizeCacheKeyInput('glass bass')).toBe('glass bass')
    expect(normalizeCacheKeyInput('office chair')).toBe('office chair')
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
      reasons: ['Available from Target', 'Free delivery', 'Listed around $129.99'],
      image: 'https://example.com/stroller.jpg',
      link: 'https://example.com/stroller',
    })
  })

  it('strips technical live-route copy from normalized descriptions and reasons', () => {
    const result = normalizeResult(
      {
        title: 'Thermos Stainless King Vacuum-Insulated Drink Bottle',
        source: 'Amazon',
        extracted_price: 34.99,
        rating: '4.7',
        reviews: '1200',
        snippet: 'Live product result returned for "Thermos Stainless King Vacuum-Insulated Drink Bottle".',
        delivery: 'Returned by the live SerpApi search route',
        thumbnail: 'https://example.com/thermos.jpg',
        product_link: 'https://example.com/thermos',
      },
      0,
      'Fallback reason',
    )

    expect(result).toEqual({
      id: 'Thermos Stainless King Vacuum-Insulated Drink Bottle-0',
      title: 'Thermos Stainless King Vacuum-Insulated Drink Bottle',
      subtitle: 'Amazon',
      price: '$34.99',
      rating: 4.7,
      reviewCount: 1200,
      description: '',
      reasons: ['Available from Amazon', 'Listed around $34.99'],
      image: 'https://example.com/thermos.jpg',
      link: 'https://example.com/thermos',
    })
  })

  it('skips promo-only snippets and falls back to cleaner extension text', () => {
    const result = normalizeResult(
      {
        title: 'On Cloud 6',
        source: 'Nordstrom',
        extracted_price: 149.99,
        rating: '4.5',
        reviews: '240',
        snippet: 'LOW PRICE',
        extensions: ['Breathable everyday sneaker'],
        thumbnail: 'https://example.com/shoe.jpg',
        product_link: 'https://example.com/shoe',
      },
      0,
      'Fallback reason',
    )

    expect(result?.description).toBe('Breathable everyday sneaker')
  })

  it('drops promo-only snippets when there is no better descriptive fallback', () => {
    const result = normalizeResult(
      {
        title: 'Wall art set',
        source: 'Amazon',
        extracted_price: 39.99,
        rating: '4.2',
        reviews: '98',
        snippet: '20% OFF',
        thumbnail: 'https://example.com/art.jpg',
        product_link: 'https://example.com/art',
      },
      0,
      'Fallback reason',
    )

    expect(result?.description).toBe('')
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

  it('rejects gibberish product queries', () => {
    expect(validateSearchInput('jhljlhl')).toEqual({
      isValid: false,
      error: 'Try a real product topic, like "lego", "desk lamp", or "travel stroller".',
      normalizedQuery: 'jhljlhl',
      normalizedDetails: '',
    })
  })

  it('normalizes valid query and details input', () => {
    expect(validateSearchInput('  desk   lamp ', '  for a small office  ')).toEqual({
      isValid: true,
      error: '',
      normalizedQuery: 'desk lamp',
      normalizedDetails: 'for a small office',
    })
  })
})
