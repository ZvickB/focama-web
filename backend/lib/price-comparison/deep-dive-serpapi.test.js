import { describe, expect, it } from 'vitest'

import {
  buildDeepDiveProductPayload,
  calculateSavingsVsSource,
  getImmersiveRequestFromShoppingOffer,
  normalizeMarket,
  normalizeProductIdentity,
} from './deep-dive-serpapi.js'

describe('deep dive SerpApi helpers', () => {
  it('uses the provided Immersive Product URL and appends required params', () => {
    const url = getImmersiveRequestFromShoppingOffer({
      immersive_url: 'https://serpapi.com/search.json?engine=google_immersive_product&page_token=abc',
    }, 'secret-key')

    expect(url.searchParams.get('engine')).toBe('google_immersive_product')
    expect(url.searchParams.get('page_token')).toBe('abc')
    expect(url.searchParams.get('more_stores')).toBe('true')
    expect(url.searchParams.get('api_key')).toBe('secret-key')
  })

  it('builds an Immersive Product request from a page token', () => {
    const url = getImmersiveRequestFromShoppingOffer({
      immersive_product_page_token: 'token-123',
    }, 'secret-key')

    expect(url.searchParams.get('engine')).toBe('google_immersive_product')
    expect(url.searchParams.get('page_token')).toBe('token-123')
    expect(url.searchParams.get('more_stores')).toBe('true')
  })

  it('normalizes market from the active Amazon domain', () => {
    expect(normalizeMarket('amazon.ca')).toBe('CA')
    expect(normalizeMarket('amazon.com')).toBe('US')
  })

  it('extracts Sony-style model numbers without folding them into the brand', () => {
    const identity = normalizeProductIdentity({
      title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black',
    })

    expect(identity.match_identifier.brand).toBe('Sony')
    expect(identity.match_identifier.model_number).toBe('WH-1000XM5')
    expect(identity.match_identifier.attributes.color).toBe('Black')
  })

  it('only reports savings for offers below the source price', () => {
    expect(calculateSavingsVsSource(300, 249.99)).toEqual({
      amount: 50.01,
      percent: 0.1667,
    })
    expect(calculateSavingsVsSource(300, 300)).toBe(null)
    expect(calculateSavingsVsSource(300, 325)).toBe(null)
    expect(calculateSavingsVsSource(null, 249.99)).toBe(null)
  })

  it('builds variantDimensions with selected pick and option count', () => {
    const payload = buildDeepDiveProductPayload({
      title: 'Sony WH-1000XM5',
      brand: 'Sony',
      rating: 4.6,
      reviews: 25000,
      variants: [
        {
          title: 'Color',
          items: [
            { name: 'Any Color' },
            { name: 'Black', selected: true, available: true },
            { name: 'Silver', available: true },
            { name: 'Blue', available: true },
          ],
        },
      ],
    }, {})

    expect(payload.variantDimensions).toHaveLength(1)
    expect(payload.variantDimensions[0].dimension).toBe('color')
    expect(payload.variantDimensions[0].yourPick).toBe('Black')
    expect(payload.variantDimensions[0].optionCount).toBe(3)
    expect(payload.selectedVariantProof).toEqual(['Black'])
  })

  it('omits variantDimensions when only one real option exists', () => {
    const payload = buildDeepDiveProductPayload({
      title: 'Some Product',
      variants: [
        { title: 'Color', items: [{ name: 'Black', selected: true }] },
      ],
    }, {})

    expect(payload.variantDimensions).toHaveLength(0)
  })

  it('builds multiple variantDimensions for multi-dimension products', () => {
    const payload = buildDeepDiveProductPayload({
      title: 'Samsung Galaxy S24 Ultra',
      variants: [
        {
          title: 'Color',
          items: [
            { name: 'Black', selected: true },
            { name: 'Gray' },
          ],
        },
        {
          title: 'Storage',
          items: [
            { name: '256GB', selected: true },
            { name: '512GB' },
            { name: '1TB' },
          ],
        },
      ],
    }, {})

    expect(payload.variantDimensions).toHaveLength(2)
    expect(payload.variantDimensions[0]).toEqual({ dimension: 'color', yourPick: 'Black', optionCount: 2 })
    expect(payload.variantDimensions[1]).toEqual({ dimension: 'storage', yourPick: '256GB', optionCount: 3 })
  })

  it('returns empty variantDimensions when product has no variants', () => {
    const payload = buildDeepDiveProductPayload({
      title: 'KitchenAid Mixer',
      brand: 'KitchenAid',
    }, {})

    expect(payload.variantDimensions).toEqual([])
  })
})
