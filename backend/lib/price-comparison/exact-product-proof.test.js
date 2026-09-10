import { describe, expect, it } from 'vitest'
import { proveExactProductVariant, selectUniqueShoppingProduct } from './exact-product-proof.js'

function product(overrides = {}) {
  return {
    source_title: 'Nintendo Switch OLED Model with White Joy-Con',
    display_title: 'Nintendo Switch OLED White',
    match_identifier: {
      brand: 'Nintendo',
      product_type: 'gaming console',
      attributes: { generation: 'OLED Model', color: 'White' },
    },
    ...overrides,
  }
}

function sony() {
  return product({
    source_title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black',
    match_identifier: { brand: 'Sony', model_number: 'WH-1000XM5', attributes: { color: 'Black' } },
  })
}

describe('exact product proof', () => {
  it('accepts a unique product group with either supported Immersive reference', () => {
    for (const reference of [
      { immersive_url: 'https://serpapi.example/one' },
      { immersive_product_page_token: 'token-123' },
    ]) {
      expect(selectUniqueShoppingProduct(product(), [{ title: 'Nintendo Switch OLED Model White', ...reference }]).reason)
        .toBe('selected')
    }
  })

  it('keeps the Sony same-model tie deterministic instead of rejecting both offers', () => {
    const result = selectUniqueShoppingProduct(sony(), [
      { title: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones', immersive_url: 'https://serpapi.example/one' },
      { title: 'Sony WH-1000XM5 Wireless Noise Canceling Over-Ear Headphones', immersive_url: 'https://serpapi.example/two' },
    ])

    expect(result).toMatchObject({ reason: 'selected', offer: { immersive_url: 'https://serpapi.example/one' } })
  })

  it('rejects refurbished product groups when the source product is new', () => {
    const result = selectUniqueShoppingProduct(sony(), [{
      title: 'Restored Sony WH-1000XM5 Wireless Headphones Refurbished Black',
      immersive_url: 'https://serpapi.example/refurb',
    }])

    expect(result.reason).toBe('no_exact_shopping_product')
  })

  it('uses selected variant evidence when a store title omits the source color', () => {
    const proof = proveExactProductVariant({
      product: product(),
      shoppingOffer: { title: 'Nintendo Switch OLED Model' },
      immersive: {
        title: 'Nintendo Switch OLED Model',
        variants: [{ title: 'Color', items: [{ name: 'White', selected: true, available: true }] }],
      },
      storeOffer: { retailer: 'Walmart', title: 'Nintendo Switch OLED Model Console' },
    })

    expect(proof.accepted).toBe(true)
    expect(proof.proof).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'color', source: 'selected_variant' }),
    ]))
  })

  it('rejects condition conflicts and marketplace offers as hard failures', () => {
    const proof = proveExactProductVariant({
      product: product(),
      shoppingOffer: { title: 'Nintendo Switch OLED Model White' },
      immersive: { title: 'Nintendo Switch OLED Model White', variants: [] },
      storeOffer: { retailer: 'Best Buy Marketplace', title: 'Refurbished Nintendo Switch OLED Model White' },
    })

    expect(proof.accepted).toBe(false)
    expect(proof.hardFailures).toEqual(expect.arrayContaining(['marketplace_offer', 'condition_conflict']))
  })

  it('marks tied cross-family Shopping results as ambiguous while keeping the top candidate', () => {
    const result = selectUniqueShoppingProduct(product({
      source_title: 'Logitech MX Keys Keyboard',
      match_identifier: { brand: 'Logitech', attributes: {} },
    }), [
      { title: 'Logitech MX Keys Advanced Keyboard', immersive_url: 'https://serpapi.example/one' },
      { title: 'Logitech MX Keys Mini Keyboard', immersive_url: 'https://serpapi.example/two' },
    ])

    expect(result).toMatchObject({ reason: 'ambiguous_top_pick', ambiguous: true })
    expect(result.offer).not.toBeNull()
  })

  it('prefers a trusted retailer when identity evidence is tied', () => {
    const result = selectUniqueShoppingProduct(sony(), [
      { title: 'Sony WH-1000XM5 Wireless Headphones', source: 'eBay', immersive_url: 'https://serpapi.example/ebay' },
      { title: 'Sony WH-1000XM5 Wireless Headphones', source: 'Best Buy', immersive_url: 'https://serpapi.example/bestbuy' },
    ])

    expect(result.offer.source).toBe('Best Buy')
  })

  it('does not let retailer trust beat stronger exact-identity evidence', () => {
    const result = selectUniqueShoppingProduct(sony(), [
      { title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones Black', source: 'eBay', immersive_url: 'https://serpapi.example/ebay' },
      { title: 'Sony WH-1000XM5 Headphones', source: 'Best Buy', immersive_url: 'https://serpapi.example/bestbuy' },
    ])

    expect(result.offer.source).toBe('eBay')
  })
})
