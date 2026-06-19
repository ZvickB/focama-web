import { describe, expect, it } from 'vitest'
import { rankComparisonOffers } from './match-offers.js'

const baseInput = {
  sourceTitle: 'Ninja CREAMi NC301C Ice Cream Maker 7-in-1',
  displayTitle: 'Ninja CREAMi NC301C Ice Cream Maker',
  matchIdentifier: {
    brand: 'Ninja',
    model_number: 'NC301C',
    upc: '622356558297',
    attributes: {
      generation: null,
      size: null,
      capacity: null,
      color: null,
      material: null,
      pack_count: null,
      condition: 'new',
    },
  },
  amazonPrice: 249.99,
  amazonShipping: 0,
  sellerCoverageMode: 'major_retailers',
  checkedAt: '2026-06-15T12:00:00.000Z',
}

function offer(overrides = {}) {
  return {
    provider: 'serpapi',
    retailer: 'Best Buy Canada',
    seller: null,
    sold_by_retailer: null,
    price: 199.99,
    shipping: 0,
    currency: 'CAD',
    url: 'https://retailer.example/item',
    title: 'Ninja CREAMi NC301C Ice Cream Maker',
    brand: 'Ninja',
    identifiers: {},
    attributes: {},
    ...overrides,
  }
}

describe('rankComparisonOffers', () => {
  it('accepts an exact model match and returns the normalized offer shape', () => {
    const result = rankComparisonOffers({ ...baseInput, offers: [offer()] })
    expect(result.offers).toHaveLength(1)
    expect(result.offers[0]).toEqual(expect.objectContaining({
      retailer: 'Best Buy Canada',
      known_total: 199.99,
      currency: 'CAD',
      checked_at: '2026-06-15T12:00:00.000Z',
    }))
  })

  it('accepts an authoritative identifier match even when the retailer title is sparse', () => {
    const result = rankComparisonOffers({
      ...baseInput,
      offers: [offer({ title: 'Ninja frozen treat maker', identifiers: { upc: '622356558297' } })],
    })
    expect(result.offers[0].confidence).toBe(0.99)
  })

  it('rejects a conflicting numeric model identifier', () => {
    const result = rankComparisonOffers({
      ...baseInput,
      sourceTitle: 'LEGO Classic 10698 Large Creative Brick Box',
      displayTitle: 'LEGO Classic 10698 Large Creative Brick Box',
      matchIdentifier: { ...baseInput.matchIdentifier, brand: 'LEGO', model_number: '10698', upc: null },
      offers: [offer({ title: 'LEGO Classic 10696 Medium Creative Brick Box', brand: 'LEGO' })],
    })
    expect(result.rejected[0].reason).toBe('model_conflict')
  })

  it.each([
    ['model', offer({ title: 'Ninja CREAMi NC501C Deluxe Ice Cream Maker' }), 'model_conflict'],
    ['generation', offer({ title: 'Apple AirPods 3rd Generation', attributes: { generation: '3rd generation' } }), 'generation_conflict'],
    ['size', offer({ title: 'Acme Pan 12 inch', attributes: { size: '12 inch' } }), 'size_conflict'],
    ['capacity', offer({ title: 'Acme Drive 512 GB', attributes: { capacity: '512 GB' } }), 'capacity_conflict'],
    ['pack count', offer({ title: 'Acme Filters 2 pack', attributes: { pack_count: 2 } }), 'pack_count_conflict'],
  ])('rejects a conflicting %s', (_label, candidate, reason) => {
    const identity = {
      ...baseInput.matchIdentifier,
      model_number: reason === 'model_conflict' ? 'NC301C' : null,
      attributes: {
        ...baseInput.matchIdentifier.attributes,
        generation: reason === 'generation_conflict' ? '4th generation' : null,
        size: reason === 'size_conflict' ? '10 inch' : null,
        capacity: reason === 'capacity_conflict' ? '1 TB' : null,
        pack_count: reason === 'pack_count_conflict' ? 4 : null,
      },
    }
    const result = rankComparisonOffers({ ...baseInput, matchIdentifier: identity, offers: [candidate] })
    expect(result.rejected[0].reason).toBe(reason)
  })

  it('enforces color only when the input marks it as material', () => {
    const input = {
      ...baseInput,
      matchIdentifier: {
        ...baseInput.matchIdentifier,
        attributes: { ...baseInput.matchIdentifier.attributes, color: 'black' },
      },
      offers: [offer({ attributes: { color: 'white' } })],
    }
    expect(rankComparisonOffers(input).offers).toHaveLength(1)
    expect(rankComparisonOffers({ ...input, colorIsMaterial: true }).rejected[0].reason).toBe('color_conflict')
  })

  it.each([
    [offer({ title: 'Refurbished Ninja CREAMi NC301C' }), 'used_or_refurbished'],
    [offer({ price: 0 }), 'missing_or_nonpositive_price'],
    [offer({ currency: 'USD' }), 'wrong_currency'],
    [offer({ title: 'Generic frozen dessert appliance' }), 'low_confidence'],
  ])('rejects invalid and uncertain candidates', (candidate, reason) => {
    expect(rankComparisonOffers({ ...baseInput, offers: [candidate] }).rejected[0].reason).toBe(reason)
  })

  it('uses BlueCart Walmart rows and supersedes SerpApi Walmart rows', () => {
    const result = rankComparisonOffers({
      ...baseInput,
      offers: [
        offer({ provider: 'serpapi', retailer: 'Walmart.ca', price: 180 }),
        offer({ provider: 'bluecart', retailer: 'Walmart.ca', seller: 'Walmart', sold_by_retailer: true, price: 185 }),
      ],
    })
    expect(result.offers[0].provider).toBe('bluecart')
    expect(result.rejected.some((entry) => entry.reason === 'walmart_superseded_by_bluecart')).toBe(true)
  })

  it('filters third-party sellers in major-retailer mode and allows them in all-sellers mode', () => {
    const marketplace = offer({
      provider: 'bluecart',
      retailer: 'Walmart.ca',
      seller: 'Marketplace Seller',
      sold_by_retailer: false,
    })
    expect(rankComparisonOffers({ ...baseInput, offers: [marketplace] }).rejected[0].reason).toBe('seller_not_allowed')
    expect(rankComparisonOffers({ ...baseInput, sellerCoverageMode: 'all_sellers', offers: [marketplace] }).offers).toHaveLength(1)
  })

  it('requires both $3 and 5% savings and returns no more than two offers', () => {
    const thresholdInput = { ...baseInput, amazonPrice: 100 }
    const result = rankComparisonOffers({
      ...thresholdInput,
      offers: [
        offer({ retailer: 'Best Buy Canada', price: 96 }),
        offer({ retailer: 'Staples Canada', price: 94 }),
        offer({ retailer: 'Canadian Tire', price: 90 }),
        offer({ retailer: 'Costco', price: 80 }),
      ],
    })
    expect(result.offers).toHaveLength(2)
    expect(result.offers.some((entry) => entry.known_total === 96)).toBe(false)
  })

  it('makes Walmart primary at 10% savings and still includes the lowest offer', () => {
    const result = rankComparisonOffers({
      ...baseInput,
      amazonPrice: 200,
      offers: [
        offer({ retailer: 'Best Buy Canada', price: 150 }),
        offer({ provider: 'bluecart', retailer: 'Walmart.ca', seller: 'Walmart', sold_by_retailer: true, price: 175 }),
      ],
    })
    expect(result.offers.map((entry) => entry.retailer)).toEqual(['Walmart.ca', 'Best Buy Canada'])
  })

  it('includes shipping notices and known shipping in totals', () => {
    const result = rankComparisonOffers({
      ...baseInput,
      amazonShipping: null,
      offers: [offer({ shipping: null })],
    })
    expect(result.offers[0].notices).toEqual(expect.arrayContaining([
      'Shipping not included',
      'Amazon shipping excluded from comparison',
    ]))
  })
})
