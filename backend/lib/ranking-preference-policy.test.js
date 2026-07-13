import { describe, expect, it } from 'vitest'

import { composePreferenceShortlist } from './ranking-preference-policy.js'

function candidate(id, { brandName = '', family = id, price, title = id } = {}) {
  return { id, brandName, duplicateFamilyKey: family, numericPrice: price, title }
}

const candidatePool = {
  query: 'cordless drill',
  candidates: [
    candidate('hero', { brandName: 'AVID POWER', family: 'hero', price: 40, title: 'AVID POWER 20V drill' }),
    candidate('cheap', { family: 'cheap', price: 20, title: 'Generic 12V drill' }),
    candidate('black-decker', { brandName: 'BLACK+DECKER', family: 'black-decker', price: 36, title: 'BLACK+DECKER 8V drill' }),
    candidate('dewalt', { brandName: 'DEWALT', family: 'dewalt', price: 99, title: 'DEWALT 20V drill' }),
    candidate('mid', { family: 'mid', price: 55, title: 'Generic 18V drill' }),
    candidate('premium', { family: 'premium', price: 150, title: 'Generic 20V brushless drill' }),
  ],
}

describe('composePreferenceShortlist', () => {
  it('preserves the fit hero and then favors lower-priced frontier candidates', () => {
    const result = composePreferenceShortlist({
      candidatePool,
      fitFrontierIds: ['hero', 'premium', 'mid', 'black-decker', 'cheap', 'dewalt'],
      finalResultLimit: 4,
      rankingPreference: 'price',
    })

    expect(result.ids).toEqual(['hero', 'cheap', 'black-decker', 'mid'])
  })

  it('orders fitting frontier candidates by price without preserving the fit hero', () => {
    const result = composePreferenceShortlist({
      candidatePool,
      fitFrontierIds: ['hero', 'premium', 'mid', 'black-decker', 'cheap', 'dewalt'],
      finalResultLimit: 4,
      rankingPreference: 'lowest_price',
    })

    expect(result.ids).toEqual(['cheap', 'black-decker', 'hero', 'mid'])
  })

  it('fills credible recognized brands before non-brand alternatives', () => {
    const result = composePreferenceShortlist({
      candidatePool,
      fitFrontierIds: ['hero', 'cheap', 'black-decker', 'dewalt', 'mid'],
      finalResultLimit: 4,
      rankingPreference: 'brand',
    })

    expect(result.ids).toEqual(['black-decker', 'dewalt', 'hero', 'cheap'])
    expect(result.recognizedBrandCount).toBe(2)
  })

  it('keeps the hero and uses price bands before ordinary frontier order for range', () => {
    const result = composePreferenceShortlist({
      candidatePool,
      fitFrontierIds: ['hero', 'mid', 'cheap', 'premium'],
      finalResultLimit: 4,
      rankingPreference: 'range',
    })

    expect(result.ids).toEqual(['hero', 'premium', 'cheap', 'mid'])
  })
})
