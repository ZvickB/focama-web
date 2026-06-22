import { describe, expect, it, vi } from 'vitest'
import { normalizeBlueCartResult, searchWalmartOffers } from './bluecart-client.js'
import {
  fetchShoppingOfferStores,
  fetchImmersiveProduct,
  normalizeSerpShoppingResult,
  normalizeSerpStoreOffer,
  searchShoppingOffers,
} from './serpapi-client.js'

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  }
}

describe('SerpApi comparison client', () => {
  it('normalizes Shopping candidates without claiming Walmart seller identity', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      shopping_results: [{
        product_id: 'p1',
        title: 'Apple AirPods 4',
        source: 'Walmart.ca',
        extracted_price: 144,
        product_link: 'https://google.example/product',
        serpapi_immersive_product_api: 'https://serpapi.com/search.json?engine=google_immersive_product&page_token=x',
      }],
    }))

    const offers = await searchShoppingOffers('Apple AirPods 4', 'CA', { apiKey: 'test', fetchImpl })
    expect(offers[0]).toEqual(expect.objectContaining({
      provider: 'serpapi',
      retailer: 'Walmart.ca',
      sold_by_retailer: null,
      price: 144,
      currency: 'CAD',
    }))
    expect(String(fetchImpl.mock.calls[0][0])).toContain('engine=google_shopping')
  })

  it('normalizes immersive stores with direct links and known shipping', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      product_results: {
        stores: [{
          name: 'Best Buy Canada',
          title: 'Ninja NC301C CREAMi',
          link: 'https://bestbuy.example/ninja',
          extracted_price: 199.99,
          shipping_extracted: 5,
        }],
      },
    }))

    const offers = await fetchShoppingOfferStores('https://serpapi.com/search.json?page_token=x', 'CA', {
      apiKey: 'test',
      fetchImpl,
    })
    expect(offers[0]).toEqual(expect.objectContaining({
      retailer: 'Best Buy Canada',
      url: 'https://bestbuy.example/ninja',
      shipping: 5,
    }))
    expect(String(fetchImpl.mock.calls[0][0])).toContain('more_stores=true')
  })

  it('preserves selected Immersive Product variants for exact-product proof', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      product_results: {
        title: 'Nintendo Switch OLED Model',
        brand: 'Nintendo',
        variants: [{ title: 'Color', items: [
          { name: 'White', selected: true, available: true, serpapi_link: 'https://serpapi.example/white' },
          { name: 'Neon', selected: false, available: true },
        ] }],
        stores: [],
      },
    }))
    const result = await fetchImmersiveProduct('https://serpapi.com/search.json?page_token=x', 'CA', {
      apiKey: 'test', fetchImpl,
    })
    expect(result).toEqual(expect.objectContaining({
      title: 'Nintendo Switch OLED Model',
      brand: 'Nintendo',
      variants: [expect.objectContaining({ items: [expect.objectContaining({ name: 'White', selected: true }), expect.anything()] })],
    }))
  })

  it('keeps marketplace sources classified separately', () => {
    expect(normalizeSerpShoppingResult({ source: 'Best Buy Canada Marketplace' }).sold_by_retailer).toBe(false)
    expect(normalizeSerpStoreOffer({ name: 'Best Buy Canada Marketplace' }).sold_by_retailer).toBe(false)
  })
})

describe('BlueCart comparison client', () => {
  it('uses BlueCart marketplace metadata as Walmart seller authority', () => {
    expect(normalizeBlueCartResult({
      product: { title: 'Apple AirPods 4', link: 'https://walmart.ca/item', item_id: '123' },
      offers: {
        is_marketplace_item: true,
        primary: { price: 134.49, seller: { name: 'Cellulartech', id: 'seller-1' } },
      },
    })).toEqual(expect.objectContaining({
      provider: 'bluecart',
      retailer: 'Walmart.ca',
      seller: 'Cellulartech',
      sold_by_retailer: false,
    }))
  })

  it('requests Walmart Canada search data and does not fetch product detail', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ search_results: [] }))
    await searchWalmartOffers('LEGO 10698', 'CA', { apiKey: 'test', fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const url = String(fetchImpl.mock.calls[0][0])
    expect(url).toContain('type=search')
    expect(url).toContain('walmart_domain=walmart.ca')
    expect(url).toContain('condition=new')
  })
})
