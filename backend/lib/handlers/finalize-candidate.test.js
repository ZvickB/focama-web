import { describe, expect, it } from 'vitest'

import {
  allowsNonNewCondition,
  filterNonNewConditionCandidates,
  sanitizeFinalizeCandidate,
} from './finalize-candidate.js'

describe('sanitizeFinalizeCandidate', () => {
  it('rejects a candidate without the server-required identity fields', () => {
    expect(sanitizeFinalizeCandidate({ id: 'one' }, 0)).toEqual({
      error: 'Candidate 1 must include non-empty id and title fields.',
      isValid: false,
    })
  })

  it('normalizes aliases, numeric fields, and nested signals into the candidate contract', () => {
    const result = sanitizeFinalizeCandidate({
      id: '  one  ',
      is_prime: true,
      numericPrice: '49.99',
      rating: '4.5',
      reviewCount: '120',
      title: '  Travel stroller  ',
      trustSignals: { score: '7.5' },
    }, 0)

    expect(result).toEqual(expect.objectContaining({
      candidate: expect.objectContaining({
        id: 'one',
        isPrime: true,
        numericPrice: 49.99,
        rating: 4.5,
        reviewCount: 120,
        title: 'Travel stroller',
        trustSignals: expect.objectContaining({ score: 7.5 }),
      }),
      isValid: true,
    }))
  })
})

describe('filterNonNewConditionCandidates', () => {
  const candidates = [
    { id: 'new', title: 'Nintendo Switch OLED Model White Joy-Con' },
    { id: 'renewed', title: 'Nintendo Switch OLED Model White Joy-Con Renewed' },
    { id: 'open-box', title: 'Open-Box Nintendo Switch OLED Model' },
  ]

  it('keeps only new-condition candidates by default', () => {
    expect(filterNonNewConditionCandidates({
      candidates,
      productQuery: 'Nintendo Switch OLED',
    })).toEqual({
      allowsNonNew: false,
      candidates: [candidates[0]],
      excludedCount: 2,
    })
  })

  it('allows non-new listings only when the shopper explicitly requests them', () => {
    expect(allowsNonNewCondition('refurbished Nintendo Switch OLED')).toBe(true)
    expect(filterNonNewConditionCandidates({
      candidates,
      productQuery: 'Nintendo Switch OLED',
      userContext: 'Open-box or renewed is fine if it is a good value.',
    })).toEqual({
      allowsNonNew: true,
      candidates,
      excludedCount: 0,
    })
  })

  it('does not treat a negative condition mention as opt-in', () => {
    expect(allowsNonNewCondition('Nintendo Switch OLED', 'No renewed or used items. New only.')).toBe(false)
  })
})
