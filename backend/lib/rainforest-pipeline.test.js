import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRainforestArtifacts, getAmazonDomain, RAINFOREST_ENDPOINT } from './rainforest-pipeline.js'

describe('getAmazonDomain', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the correct domain for known countries and falls back to amazon.com for unknown ones', () => {
    expect(getAmazonDomain({ countryCode: 'GB' })).toBe('amazon.co.uk')
    expect(getAmazonDomain({ countryCode: 'DE' })).toBe('amazon.de')
    expect(getAmazonDomain({ countryCode: 'US' })).toBe('amazon.com')
    expect(getAmazonDomain({ countryCode: 'ZZ' })).toBe('amazon.com')
  })

  it('prefers an explicit supported amazon domain override', () => {
    expect(getAmazonDomain({ countryCode: 'US', amazonDomain: 'amazon.ca' })).toBe('amazon.ca')
    expect(getAmazonDomain({ countryCode: 'GB', amazonDomain: 'amazon.com.au' })).toBe('amazon.com.au')
  })

  it('ignores unsupported amazon domain overrides', () => {
    expect(getAmazonDomain({ countryCode: 'GB', amazonDomain: 'amazon.invalid' })).toBe('amazon.co.uk')
  })

  it('formats fallback prices using the selected amazon domain', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        search_results: [
          {
            asin: 'B001',
            title: 'Compact Travel Stroller',
            price: {
              value: 149.99,
            },
            rating: 4.6,
            ratings_total: 321,
            image: 'https://example.com/stroller.jpg',
            link: 'https://www.amazon.co.uk/dp/B001',
            position: 1,
          },
        ],
        related_searches: [],
      }),
    })

    const result = await fetchRainforestArtifacts({
      productQuery: 'travel stroller',
      details: 'carry-on friendly',
      reasonFallback: 'Returned by the Rainforest API search route',
      rainforestApiKey: 'rf-key',
      amazonDomain: 'amazon.co.uk',
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBeInstanceOf(URL)
    expect(fetch.mock.calls[0][0].origin + fetch.mock.calls[0][0].pathname).toBe(RAINFOREST_ENDPOINT)
    expect(fetch.mock.calls[0][0].searchParams.get('amazon_domain')).toBe('amazon.co.uk')
    expect(result.error).toBeNull()
    expect(result.artifacts.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'B001',
          title: 'Compact Travel Stroller',
          price: 'GBP 149.99',
        }),
      ]),
    )
  })
})
