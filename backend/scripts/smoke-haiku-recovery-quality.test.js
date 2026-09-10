import { describe, expect, it } from 'vitest'

import { summarizeRecoveryEvaluation } from './smoke-haiku-recovery-quality.js'

function evaluatedCase(overrides = {}) {
  return {
    actualRecoveryTriggered: false,
    suggestionValidation: { isValid: false },
    firstHaikuMs: 100,
    secondHaikuMs: 0,
    judgeMs: 50,
    firstHaikuUsage: null,
    secondHaikuUsage: null,
    judgeUsage: null,
    judgment: {
      shouldOfferRecovery: false,
      suggestionAssessment: 'not_needed',
      secondPass: { comparison: 'not_run' },
    },
    ...overrides,
  }
}

describe('recovery quality evaluation summary', () => {
  it('treats a category with no applicable cases as passing rather than failing', () => {
    const summary = summarizeRecoveryEvaluation([evaluatedCase()])

    expect(summary.rates).toEqual({
      recoveryOfferRecall: 1,
      surfacedSuggestionPreservation: 1,
      surfacedSuggestionValidity: 1,
      secondPassNoWorse: 1,
    })
    expect(summary.passed).toBe(true)
  })

  it('separates missed recovery, suggestion quality, and second-pass quality', () => {
    const summary = summarizeRecoveryEvaluation([
      evaluatedCase({
        actualRecoveryTriggered: true,
        suggestionValidation: { isValid: true },
        secondHaikuMs: 80,
        judgment: {
          shouldOfferRecovery: true,
          suggestionAssessment: 'pass',
          secondPass: { comparison: 'better' },
        },
      }),
      evaluatedCase({
        judgment: {
          shouldOfferRecovery: true,
          suggestionAssessment: 'not_provided',
          secondPass: { comparison: 'not_run' },
        },
      }),
    ])

    expect(summary.counts).toMatchObject({
      actualRecovery: 1,
      judgeSaysRecoveryNeeded: 2,
      missedRecovery: 1,
      validSuggestions: 1,
      preservingSuggestions: 1,
      secondPasses: 1,
      secondPassBetter: 1,
      secondPassWorse: 0,
    })
    expect(summary.rates).toEqual({
      recoveryOfferRecall: 0.5,
      surfacedSuggestionPreservation: 1,
      surfacedSuggestionValidity: 1,
      secondPassNoWorse: 1,
    })
    expect(summary.passed).toBe(false)
  })
})
