import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRainforestArtifacts, getAmazonDomain } from './rainforest-pipeline.js'

function providerResponse({ asin = 'B000000001', link, price = 149.99, ...overrides }) {
  return {
    search_results: [{
      asin,
      title: 'Compact Travel Stroller',
      price: { value: price },
      rating: 4.6,
      ratings_total: 321,
      image: 'https://example.com/stroller.jpg',
      link,
      position: 1,
      ...overrides,
    }],
    related_searches: [],
  }
}

describe('Rainforest marketplace pipeline', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('resolves supported marketplaces, explicit overrides, and safe US fallbacks', () => {
    expect(getAmazonDomain({ countryCode: 'CA' })).toBe('amazon.ca')
    expect(getAmazonDomain({ countryCode: 'GB' })).toBe('amazon.co.uk')
    expect(getAmazonDomain({ countryCode: 'US', amazonDomain: 'amazon.in' })).toBe('amazon.in')
    expect(getAmazonDomain({ countryCode: 'ZZ', amazonDomain: 'amazon.invalid' })).toBe('amazon.com')
  })

  it('builds the intended tagged or untagged clickout for each marketplace class', async () => {
    const cases = [
      ['amazon.ca', 'https://www.amazon.ca/dp/B000000001', 'https://www.amazon.ca/dp/B000000001?tag=focamai4203-20'],
      ['amazon.co.uk', 'https://www.amazon.co.uk/dp/B000000001', 'https://www.amazon.com/dp/B000000001?tag=focamai-20'],
      ['amazon.in', 'https://www.amazon.in/dp/B000000001', 'https://www.amazon.in/dp/B000000001'],
    ]

    for (const [amazonDomain, link, expectedLink] of cases) {
      fetch.mockResolvedValueOnce({ ok: true, json: async () => providerResponse({ link }) })
      const result = await fetchRainforestArtifacts({
        productQuery: 'travel stroller',
        rainforestApiKey: 'rf-key',
        amazonDomain,
      })
      expect(result.artifacts.results[0].link, amazonDomain).toBe(expectedLink)
    }
  })

  it('preserves provider-confirmed Prime evidence in previews and candidate data', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => providerResponse({
        link: 'https://www.amazon.com/dp/B000000001',
        title: 'Apple AirPods 4',
        is_prime: false,
        delivery: { tagline: 'Join Prime to get FREE delivery Tomorrow' },
      }),
    })

    const result = await fetchRainforestArtifacts({
      productQuery: 'airpods',
      rainforestApiKey: 'rf-key',
      amazonDomain: 'amazon.com',
    })

    expect(result.artifacts.results[0]).toMatchObject({ isPrime: true, delivery: 'Join Prime to get FREE delivery Tomorrow' })
    expect(result.artifacts.candidatePool.candidates[0]).toMatchObject({ isPrime: true })
  })

  it('preserves the provider status behind the stable upstream error contract', async () => {
    fetch.mockResolvedValue({ ok: false, status: 402 })

    await expect(fetchRainforestArtifacts({
      productQuery: 'travel stroller',
      rainforestApiKey: 'rf-key',
      amazonDomain: 'amazon.ca',
    })).resolves.toEqual({
      error: { error: 'Rainforest API request failed.', providerStatusCode: 402, statusCode: 502 },
      artifacts: null,
    })
  })
})
