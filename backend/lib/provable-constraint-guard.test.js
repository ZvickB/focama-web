import { describe, expect, it } from 'vitest'

import {
  extractExplicitExclusions,
  extractPriceCeiling,
  extractRequiredYearModel,
  filterCandidatesByProvableConstraints,
} from './provable-constraint-guard.js'

describe('provable constraint guard', () => {
  it('extracts explicit currency price ceilings but not unrelated measurements', () => {
    expect(extractPriceCeiling('travel stroller', 'Good value, under $200')).toEqual({
      amount: 200,
      inclusive: false,
    })
    expect(extractPriceCeiling('camera', 'maximum spend is $30 or less')).toEqual({
      amount: 30,
      inclusive: true,
    })
    expect(extractPriceCeiling('stroller', 'under 15 lb')).toBeNull()
    expect(extractPriceCeiling('skincare', 'under $20 each, no more than $100 total')).toBeNull()
  })

  it('recognizes conservative explicit type and material exclusions', () => {
    expect(extractExplicitExclusions('moto g play 2024', 'phone, not case').map((item) => item.key)).toEqual(['case'])
    expect(extractExplicitExclusions('yarn', 'not wool or fleece').map((item) => item.key)).toEqual(['wool', 'fleece'])
    expect(extractExplicitExclusions('wallet', 'no leather or wool').map((item) => item.key)).toEqual(['wool', 'leather'])
    expect(extractExplicitExclusions('phone', 'no more than $100')).toEqual([])
    expect(extractExplicitExclusions('air fryer', 'not just snacks or single servings')).toEqual([])
  })

  it('requires a trailing year together with a meaningful model signature', () => {
    expect(extractRequiredYearModel('moto g play 2024')).toEqual({
      year: '2024',
      anchorTokens: ['moto', 'g', 'play'],
    })
    expect(extractRequiredYearModel('laptop from 2024')).toBeNull()
  })

  it('filters over-budget, excluded, and wrong-model candidates and records every reason', () => {
    const result = filterCandidatesByProvableConstraints({
      productQuery: 'moto g play 2024',
      userContext: 'phone, not case, under $100',
      candidates: [
        { id: 'good', title: 'Motorola Moto G Play 2024 smartphone', numericPrice: 89 },
        { id: 'expensive', title: 'Motorola Moto G Play 2024 smartphone', numericPrice: 120 },
        { id: 'case', title: 'Protective case for Moto G Play 2024', numericPrice: 10 },
        { id: 'wrong-model', title: 'Motorola Moto G Stylus 2024 smartphone', numericPrice: 90 },
        { id: 'unknown-price', title: 'Motorola Moto G Play 2024 smartphone', numericPrice: null },
      ],
    })

    expect(result.candidates.map((candidate) => candidate.id)).toEqual(['good'])
    expect(result.rejections).toEqual([
      { id: 'expensive', failures: [{ reason: 'price_above_ceiling', constraint: 'price_under_100' }] },
      { id: 'case', failures: [{ reason: 'explicit_exclusion_match', constraint: 'exclude_case' }] },
      { id: 'wrong-model', failures: [{ reason: 'required_year_model_missing', constraint: 'require_moto_g_play_2024' }] },
      { id: 'unknown-price', failures: [{ reason: 'price_missing_for_ceiling', constraint: 'price_under_100' }] },
    ])
  })
})
