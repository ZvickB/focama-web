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

describe('exact product proof', () => {
  it('requires a unique Shopping product group', () => {
    const result = selectUniqueShoppingProduct(product(), [{
      title: 'Nintendo Switch OLED Model White', immersive_url: 'https://serpapi.example/one',
    }])
    expect(result.reason).toBe('selected')
  })

  it('accepts a unique Shopping product group with only an Immersive page token', () => {
    const result = selectUniqueShoppingProduct(product(), [{
      title: 'Nintendo Switch OLED Model White', immersive_product_page_token: 'token-123',
    }])
    expect(result.reason).toBe('selected')
  })

  it('selects the top clean offer when same-model Shopping results tie', () => {
    const source = product({
      source_title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black',
      match_identifier: {
        brand: 'Sony',
        model_number: 'WH-1000XM5',
        attributes: { color: 'Black' },
      },
    })
    const result = selectUniqueShoppingProduct(source, [
      { title: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones', immersive_url: 'https://serpapi.example/one' },
      { title: 'Sony WH-1000XM5 Wireless Noise Canceling Over-Ear Headphones', immersive_url: 'https://serpapi.example/two' },
    ])
    expect(result.reason).toBe('selected')
    expect(result.offer.immersive_url).toBe('https://serpapi.example/one')
  })

  it('rejects refurbished Shopping product groups when the source product is new', () => {
    const source = product({
      source_title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black',
      match_identifier: {
        brand: 'Sony',
        model_number: 'WH-1000XM5',
        attributes: { color: 'Black' },
      },
    })
    const result = selectUniqueShoppingProduct(source, [
      { title: 'Restored Sony WH-1000XM5 Wireless Headphones Refurbished Black', immersive_url: 'https://serpapi.example/refurb' },
    ])
    expect(result.reason).toBe('no_exact_shopping_product')
  })

  it('accepts a store title that does not prove the source color', () => {
    const proof = proveExactProductVariant({
      product: product(),
      shoppingOffer: { title: 'Nintendo Switch OLED Model' },
      immersive: { title: 'Nintendo Switch OLED Model', variants: [] },
      storeOffer: { retailer: 'Walmart', title: 'Nintendo Switch OLED Model Console' },
    })
    expect(proof.accepted).toBe(true)
    expect(proof.failures).not.toContain('color_missing')
  })

  it('keeps color proof when the selected variant proves it', () => {
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

  it('keeps color proof when the product group title proves it and store title omits it', () => {
    const proof = proveExactProductVariant({
      product: product(),
      shoppingOffer: { title: 'Nintendo Switch OLED Model White' },
      immersive: { title: 'Nintendo Switch OLED Model White', variants: [] },
      storeOffer: { retailer: 'Target', title: 'Nintendo Switch OLED Model Console' },
    })
    expect(proof.accepted).toBe(true)
    expect(proof.proof).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'color', source: 'product_group_title' }),
    ]))
  })

  it('soft-accepts a multi-capacity store title without selected-variant proof', () => {
    const source = product({
      source_title: 'Samsung T7 Shield 1TB Portable SSD Black',
      match_identifier: {
        brand: 'Samsung', model_number: 'T7 Shield', product_type: 'portable SSD',
        attributes: { capacity: '1TB', color: 'Black' },
      },
    })
    const proof = proveExactProductVariant({
      product: source,
      shoppingOffer: { title: 'Samsung T7 Shield Portable SSD' },
      immersive: { title: 'Samsung T7 Shield Portable SSD', variants: [] },
      storeOffer: { retailer: 'Retailer', title: 'Samsung T7 Shield 1TB 2TB 4TB Portable SSD Black' },
    })
    expect(proof.accepted).toBe(true)
    expect(proof.confidence).toBe('soft')
    expect(proof.softFailures).toContain('capacity_ambiguous')
  })

  it('rejects condition conflicts and marketplace offers as hard failures', () => {
    const proof = proveExactProductVariant({
      product: product(),
      shoppingOffer: { title: 'Nintendo Switch OLED Model White' },
      immersive: { title: 'Nintendo Switch OLED Model White', variants: [] },
      storeOffer: { retailer: 'Best Buy Marketplace', title: 'Refurbished Nintendo Switch OLED Model White' },
    })
    expect(proof.accepted).toBe(false)
    expect(proof.confidence).toBe('rejected')
    expect(proof.hardFailures).toEqual(expect.arrayContaining(['marketplace_offer', 'condition_conflict']))
  })

  it('picks the top result with ambiguous flag when two Shopping products tie across families', () => {
    const source = product({
      source_title: 'Logitech MX Keys Keyboard',
      match_identifier: { brand: 'Logitech', attributes: {} },
    })
    const result = selectUniqueShoppingProduct(source, [
      { title: 'Logitech MX Keys Advanced Keyboard', immersive_url: 'https://serpapi.example/one' },
      { title: 'Logitech MX Keys Mini Keyboard', immersive_url: 'https://serpapi.example/two' },
    ])
    expect(result.reason).toBe('ambiguous_top_pick')
    expect(result.ambiguous).toBe(true)
    expect(result.offer).not.toBeNull()
  })

  it('returns high confidence when all proof passes', () => {
    const proof = proveExactProductVariant({
      product: product(),
      shoppingOffer: { title: 'Nintendo Switch OLED Model White' },
      immersive: { title: 'Nintendo Switch OLED Model White', variants: [] },
      storeOffer: { retailer: 'Walmart', title: 'Nintendo Switch OLED Model White Joy-Con Console' },
    })
    expect(proof.accepted).toBe(true)
    expect(proof.confidence).toBe('high')
    expect(proof.softFailures).toHaveLength(0)
    expect(proof.hardFailures).toHaveLength(0)
  })

  it('prefers a trusted source over an untrusted one with the same identity score', () => {
    const source = product({
      source_title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
      match_identifier: {
        brand: 'Sony',
        model_number: 'WH-1000XM5',
        attributes: {},
      },
    })
    const result = selectUniqueShoppingProduct(source, [
      { title: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones', source: 'eBay', immersive_url: 'https://serpapi.example/ebay' },
      { title: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones', source: 'Best Buy', immersive_url: 'https://serpapi.example/bestbuy' },
    ])
    expect(result.reason).toBe('selected')
    expect(result.offer.source).toBe('Best Buy')
  })

  it('does not let trusted source preference beat a stronger identity score', () => {
    const source = product({
      source_title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones Black',
      match_identifier: {
        brand: 'Sony',
        model_number: 'WH-1000XM5',
        product_type: 'headphones',
        attributes: {},
      },
    })
    const result = selectUniqueShoppingProduct(source, [
      { title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones Black', source: 'eBay', immersive_url: 'https://serpapi.example/ebay' },
      { title: 'Sony WH-1000XM5 Headphones', source: 'Best Buy', immersive_url: 'https://serpapi.example/bestbuy' },
    ])
    expect(result.reason).toBe('selected')
    expect(result.offer.source).toBe('eBay')
  })

  it('falls back to untrusted sources when no trusted source matches', () => {
    const source = product({
      source_title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
      match_identifier: {
        brand: 'Sony',
        model_number: 'WH-1000XM5',
        attributes: {},
      },
    })
    const result = selectUniqueShoppingProduct(source, [
      { title: 'Sony WH-1000XM5 Wireless Headphones', source: 'eBay', immersive_url: 'https://serpapi.example/ebay' },
      { title: 'Sony WH-1000XM5 Headphones', source: 'Poshmark', immersive_url: 'https://serpapi.example/posh' },
    ])
    expect(result.reason).toBe('selected')
    expect(result.offer).not.toBeNull()
  })

  it('prefers trusted sources across common US and CA retailers', () => {
    const source = product({
      source_title: 'Apple AirPods Pro 2nd Generation',
      match_identifier: {
        brand: 'Apple',
        model_number: 'AirPods Pro 2',
        attributes: {},
      },
    })
    const trustedSources = ['Best Buy', 'Target', 'Walmart', 'Amazon', 'Costco', 'Newegg']
    for (const trusted of trustedSources) {
      const result = selectUniqueShoppingProduct(source, [
        { title: 'Apple AirPods Pro 2nd Gen Earbuds', source: 'RandomReseller', immersive_url: 'https://serpapi.example/random' },
        { title: 'Apple AirPods Pro 2nd Gen Earbuds', source: trusted, immersive_url: 'https://serpapi.example/trusted' },
      ])
      expect(result.offer.source).toBe(trusted)
    }
  })

  it('can disable trusted source preference with option', () => {
    const source = product({
      source_title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
      match_identifier: {
        brand: 'Sony',
        model_number: 'WH-1000XM5',
        attributes: {},
      },
    })
    const result = selectUniqueShoppingProduct(source, [
      { title: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones', source: 'eBay', immersive_url: 'https://serpapi.example/ebay' },
      { title: 'Sony WH-1000XM5 Wireless Noise-Canceling Headphones', source: 'Best Buy', immersive_url: 'https://serpapi.example/bestbuy' },
    ], { preferTrustedSources: false })
    expect(result.reason).toBe('selected')
    // Without preference, picks first by score (same score = first in list)
    expect(result.offer.source).toBe('eBay')
  })
})
