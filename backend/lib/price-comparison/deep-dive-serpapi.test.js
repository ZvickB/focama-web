import { describe, expect, it } from 'vitest'

import {
  buildDeepDiveProductPayload,
  calculateSavingsVsSource,
  getImmersiveRequestFromShoppingOffer,
  normalizeProductIdentity,
} from './deep-dive-serpapi.js'

describe('price-comparison provider contract', () => {
  it('builds the required Immersive Product request from either supported provider token shape', () => {
    for (const offer of [
      { immersive_url: 'https://serpapi.com/search.json?engine=google_immersive_product&page_token=url-token' },
      { immersive_product_page_token: 'field-token' },
    ]) {
      const url = getImmersiveRequestFromShoppingOffer(offer, 'secret-key')
      expect(url.searchParams.get('engine')).toBe('google_immersive_product')
      expect(url.searchParams.get('more_stores')).toBe('true')
      expect(url.searchParams.get('api_key')).toBe('secret-key')
      expect(url.searchParams.get('page_token')).toMatch(/token/)
    }
  })

  it('preserves Sony model identity and selected variants for exact-price matching', () => {
    const identity = normalizeProductIdentity({
      title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black',
    })
    const payload = buildDeepDiveProductPayload({
      title: 'Sony WH-1000XM5',
      variants: [{
        title: 'Color',
        items: [{ name: 'Black', selected: true }, { name: 'Silver' }],
      }],
    }, {})

    expect(identity.match_identifier).toMatchObject({
      brand: 'Sony',
      model_number: 'WH-1000XM5',
      attributes: { color: 'Black' },
    })
    expect(payload.variantDimensions).toEqual([{ dimension: 'color', yourPick: 'Black', optionCount: 2 }])
    expect(payload.selectedVariantProof).toEqual(['Black'])
  })

  it('reports savings only for a genuine lower price', () => {
    expect(calculateSavingsVsSource(300, 249.99)).toEqual({ amount: 50.01, percent: 0.1667 })
    expect(calculateSavingsVsSource(300, 300)).toBeNull()
    expect(calculateSavingsVsSource(300, 325)).toBeNull()
  })
})
