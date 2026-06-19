import { describe, expect, it, vi } from 'vitest'
import { normalizeSerperShoppingResult, searchSerperShoppingOffers } from './serper-client.js'

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  }
}

describe('Serper comparison client', () => {
  it.each([
    ['$104.97', 'CA', 104.97, 'CAD'],
    ['C$349.99', 'CA', 349.99, 'CAD'],
    ['US$89.99', 'CA', 89.99, 'USD'],
    ['$1,299.00', 'CA', 1299, 'CAD'],
    ['$89.99', 'US', 89.99, null],
    ['CAD 42.50', 'US', 42.5, 'CAD'],
  ])('normalizes price %s for market %s', (priceText, market, price, currency) => {
    expect(normalizeSerperShoppingResult({ price: priceText }, { market })).toEqual(expect.objectContaining({
      price,
      currency,
    }))
  })

  it('normalizes Serper shopping results into the comparison offer shape', () => {
    expect(normalizeSerperShoppingResult({
      productId: '4195027484078635',
      source: 'Best Buy',
      link: 'https://bestbuy.example/sony',
      price: '$349.99',
      title: 'Sony WH-1000XM5 Wireless Headphones',
      delivery: 'Free shipping',
    }, { market: 'CA' })).toEqual({
      provider: 'serper',
      provider_offer_id: '4195027484078635',
      retailer: 'Best Buy',
      seller: null,
      sold_by_retailer: null,
      price: 349.99,
      shipping: null,
      currency: 'CAD',
      url: 'https://bestbuy.example/sony',
      title: 'Sony WH-1000XM5 Wireless Headphones',
      brand: null,
      condition: null,
      identifiers: {},
      attributes: {},
    })
  })

  it('does not throw for missing or malformed fields', () => {
    expect(normalizeSerperShoppingResult(null)).toEqual(expect.objectContaining({
      provider_offer_id: null,
      retailer: '',
      price: null,
      currency: null,
      url: '',
      title: '',
    }))
    expect(normalizeSerperShoppingResult({ price: 'contact store' }).price).toBeNull()
  })

  it('posts a Serper shopping request and normalizes returned offers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      shopping: [{
        productId: 'p1',
        title: 'Apple AirPods 4',
        source: 'Walmart.ca',
        price: 'C$144.00',
        link: 'https://walmart.example/airpods',
      }],
    }))

    const offers = await searchSerperShoppingOffers('Apple AirPods 4', 'CA', {
      apiKey: 'test-key',
      endpoint: 'https://serper.example/shopping',
      fetchImpl,
    })

    expect(offers[0]).toEqual(expect.objectContaining({
      provider: 'serper',
      retailer: 'Walmart.ca',
      price: 144,
      currency: 'CAD',
    }))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://serper.example/shopping')
    expect(fetchImpl.mock.calls[0][1]).toEqual(expect.objectContaining({
      method: 'POST',
      headers: {
        'X-API-KEY': 'test-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: 'Apple AirPods 4',
        gl: 'ca',
        hl: 'en',
        num: 20,
      }),
    }))
  })

  it('throws on fetch failure responses with a compact provider error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad key' }, 401))

    await expect(searchSerperShoppingOffers('query', 'CA', {
      apiKey: 'test-key',
      endpoint: 'https://serper.example/shopping',
      fetchImpl,
    })).rejects.toThrow('Serper request failed (401)')
  })
})
