import { describe, expect, it } from 'vitest'

import { sanitizeFinalizeCandidate } from './finalize-candidate.js'

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
