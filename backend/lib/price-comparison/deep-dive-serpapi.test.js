import { describe, expect, it } from 'vitest'

import {
  buildReviewEvidence,
  getImmersiveRequestFromShoppingOffer,
  normalizeMarket,
  normalizeProductIdentity,
  synthesizeDeepDiveReviews,
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

  it('builds bounded review evidence from Immersive fields', () => {
    const evidence = buildReviewEvidence({
      user_reviews: [{ source: 'Best Buy', text: 'People like the battery life.' }],
      critic_ratings: [{ name: 'TechRadar', rating: '4/5', text: 'Strong sound.' }],
      top_insights: [{ title: 'Comfort', text: 'Fit is comfortable.' }],
    })

    expect(evidence.evidenceCount).toBe(3)
    expect(evidence.userReviews[0].source).toBe('Best Buy')
    expect(evidence.criticRatings[0].source).toBe('TechRadar')
    expect(evidence.topInsights[0].text).toBe('Fit is comfortable.')
    expect(evidence.inputHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('skips synthesis when review evidence is thin', async () => {
    const evidence = buildReviewEvidence({
      user_reviews: [{ source: 'Best Buy', text: 'Good product.' }],
    })

    const synthesis = await synthesizeDeepDiveReviews({ apiKey: 'secret-key', evidence })

    expect(synthesis.skipped).toBe(true)
    expect(synthesis.summary).toBe('')
  })
})
