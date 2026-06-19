import { describe, expect, it, vi } from 'vitest'
import { buildComparisonQueries, compareProduct } from './compare-product.js'

const input = {
  market: 'CA',
  currency: 'CAD',
  sourceTitle: 'LEGO Classic Large Creative Brick Box 10698 790 Pieces',
  displayTitle: 'LEGO Classic 10698 Large Creative Brick Box, 790 Pieces',
  matchIdentifier: {
    brand: 'LEGO',
    model_number: '10698',
    upc: '673419233606',
    comparison_search_query: 'LEGO 10698 790 pieces',
    attributes: { pack_count: 790 },
  },
  amazonPrice: 64.99,
  amazonShipping: 0,
  sellerCoverageMode: 'major_retailers',
}

function comparisonOffer(overrides = {}) {
  return {
    provider: 'serpapi',
    provider_offer_id: 'serp-1',
    retailer: 'Best Buy Canada',
    seller: null,
    sold_by_retailer: null,
    price: 54.99,
    shipping: 0,
    currency: 'CAD',
    url: 'https://retailer.example/lego',
    title: 'LEGO Classic 10698 Large Creative Brick Box 790 Pieces',
    brand: 'LEGO',
    identifiers: {},
    attributes: { pack_count: 790 },
    ...overrides,
  }
}

describe('buildComparisonQueries', () => {
  it('orders authoritative codes before model and normalized text', () => {
    expect(buildComparisonQueries(input)).toEqual([
      '673419233606',
      'LEGO 10698',
      'LEGO 10698 790 pieces',
      'LEGO Classic 10698 Large Creative Brick Box, 790 Pieces',
    ])
  })

  it('does not use a code marked as AI-normalized', () => {
    expect(buildComparisonQueries({
      ...input,
      matchIdentifier: {
        ...input.matchIdentifier,
        provenance: { upc: 'ai_normalized' },
      },
    })[0]).toBe('LEGO 10698')
  })
})

describe('compareProduct', () => {
  it('short-circuits before provider calls when disabled', async () => {
    const searchShoppingOffers = vi.fn()
    const searchWalmartOffers = vi.fn()
    const result = await compareProduct(input, { enabled: false, searchShoppingOffers, searchWalmartOffers })
    expect(result.status).toBe('disabled')
    expect(searchShoppingOffers).not.toHaveBeenCalled()
    expect(searchWalmartOffers).not.toHaveBeenCalled()
  })

  it('rejects unsupported markets before provider calls', async () => {
    const searchShoppingOffers = vi.fn()
    const result = await compareProduct({ ...input, market: 'US', currency: 'USD' }, {
      enabled: true,
      searchShoppingOffers,
    })
    expect(result.status).toBe('unsupported_market')
    expect(searchShoppingOffers).not.toHaveBeenCalled()
  })

  it('searches providers in parallel, expands at most one Serp candidate, and ranks combined offers', async () => {
    const serpCandidate = comparisonOffer({ immersive_url: 'https://serpapi.example/immersive' })
    const searchShoppingOffers = vi.fn().mockResolvedValue([serpCandidate])
    const searchWalmartOffers = vi.fn().mockResolvedValue([
      comparisonOffer({
        provider: 'bluecart',
        provider_offer_id: 'walmart-1',
        retailer: 'Walmart.ca',
        seller: 'Walmart',
        sold_by_retailer: true,
        price: 52,
      }),
    ])
    const fetchShoppingOfferStores = vi.fn().mockResolvedValue([
      comparisonOffer({ provider_offer_id: null, price: 50 }),
    ])

    const result = await compareProduct(input, {
      enabled: true,
      searchShoppingOffers,
      searchWalmartOffers,
      fetchShoppingOfferStores,
    })

    expect(result.status).toBe('complete')
    expect(result.query).toBe('673419233606')
    expect(searchShoppingOffers).toHaveBeenCalledTimes(1)
    expect(searchWalmartOffers).toHaveBeenCalledTimes(1)
    expect(fetchShoppingOfferStores).toHaveBeenCalledTimes(1)
    expect(result.offers.map((offer) => offer.retailer)).toEqual(['Walmart.ca', 'Best Buy Canada'])
  })

  it('does not call a BlueCart product-detail dependency', async () => {
    const fetchWalmartProductDetail = vi.fn()
    await compareProduct(input, {
      enabled: true,
      searchShoppingOffers: vi.fn().mockResolvedValue([]),
      searchWalmartOffers: vi.fn().mockResolvedValue([]),
      fetchWalmartProductDetail,
    })
    expect(fetchWalmartProductDetail).not.toHaveBeenCalled()
  })
})
