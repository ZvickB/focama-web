import { describe, expect, it } from 'vitest'

import {
  ANSWER_MODES,
  ASK_BACK_MODES,
  isPlainObject,
  isAnswerMode,
  validateFollowUpContextForAnswer,
  parseAnswerResult,
  validatePassageIdList,
  validateInterpretations,
  validateRejectedPassages,
  evidenceCoversRetrievedPassages,
  citedPassagesAreSupported,
  clarificationFromInterpretations,
  validateAnswerResult,
} from './answer-validation.js'

describe('isPlainObject', () => {
  it('returns true for plain objects', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
  })

  it('returns false for non-objects', () => {
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject('string')).toBe(false)
    expect(isPlainObject(42)).toBe(false)
  })
})

describe('isAnswerMode', () => {
  it('accepts valid answer modes', () => {
    expect(isAnswerMode('direct_answer')).toBe(true)
    expect(isAnswerMode('multi_fact_answer')).toBe(true)
    expect(isAnswerMode('ambiguous_question')).toBe(true)
  })

  it('rejects invalid modes', () => {
    expect(isAnswerMode('invalid')).toBe(false)
    expect(isAnswerMode(42)).toBe(false)
  })
})

describe('validateFollowUpContextForAnswer', () => {
  it('returns null for non-ask-back modes', () => {
    expect(validateFollowUpContextForAnswer({}, 'direct_answer', 'q', 'a')).toBe(null)
  })

  it('builds context from question/answer when value is not a plain object', () => {
    const result = validateFollowUpContextForAnswer(null, 'ambiguous_question', 'q', 'a')
    expect(result).toEqual({
      originalQuestion: 'q',
      clarificationQuestion: 'a',
      mode: 'ambiguous_question',
    })
  })

  it('uses value fields when present', () => {
    const result = validateFollowUpContextForAnswer(
      { originalQuestion: 'orig', clarificationQuestion: 'clar' },
      'ambiguous_question',
      'q',
      'a',
    )
    expect(result.originalQuestion).toBe('orig')
    expect(result.clarificationQuestion).toBe('clar')
  })
})

describe('parseAnswerResult', () => {
  it('returns null for invalid input', () => {
    expect(parseAnswerResult(null, 'q')).toBe(null)
    expect(parseAnswerResult({}, 'q')).toBe(null)
    expect(parseAnswerResult({ mode: 'direct_answer', answer: '' }, 'q')).toBe(null)
  })

  it('parses a valid answer result', () => {
    const result = parseAnswerResult({ mode: 'direct_answer', answer: 'Yes' }, 'q')
    expect(result.mode).toBe('direct_answer')
    expect(result.answer).toBe('Yes')
    expect(result.followUpContext).toBe(null)
  })
})

describe('validatePassageIdList', () => {
  it('returns null for non-array', () => {
    expect(validatePassageIdList('not-array', new Set())).toBe(null)
  })

  it('validates all ids exist in the set', () => {
    const ids = new Set(['a', 'b'])
    expect(validatePassageIdList(['a', 'b'], ids)).toEqual(['a', 'b'])
    expect(validatePassageIdList(['a', 'c'], ids)).toBe(null)
  })

  it('deduplicates ids', () => {
    const ids = new Set(['a'])
    expect(validatePassageIdList(['a', 'a'], ids)).toEqual(['a'])
  })
})

describe('validateInterpretations', () => {
  it('returns null for non-array', () => {
    expect(validateInterpretations('not-array', new Set())).toBe(null)
  })

  it('validates interpretation structure', () => {
    const ids = new Set(['p1'])
    const result = validateInterpretations(
      [{ topic: 'Weight', supportedPassageIds: ['p1'] }],
      ids,
    )
    expect(result).toEqual([{ topic: 'Weight', supportedPassageIds: ['p1'] }])
  })

  it('deduplicates by topic', () => {
    const ids = new Set(['p1'])
    const result = validateInterpretations(
      [
        { topic: 'Weight', supportedPassageIds: ['p1'] },
        { topic: 'weight', supportedPassageIds: ['p1'] },
      ],
      ids,
    )
    expect(result).toHaveLength(1)
  })
})

describe('validateRejectedPassages', () => {
  it('returns null for non-array', () => {
    expect(validateRejectedPassages('not-array', new Set())).toBe(null)
  })

  it('validates rejection structure', () => {
    const ids = new Set(['p1'])
    const result = validateRejectedPassages(
      [{ passageId: 'p1', reason: 'Not relevant' }],
      ids,
    )
    expect(result).toEqual([{ passageId: 'p1', reason: 'Not relevant' }])
  })
})

describe('evidenceCoversRetrievedPassages', () => {
  it('returns true when all passages are accounted for', () => {
    const interpretations = [{ supportedPassageIds: ['p1'] }]
    const rejected = [{ passageId: 'p2' }]
    const passages = [{ id: 'p1' }, { id: 'p2' }]
    expect(evidenceCoversRetrievedPassages(interpretations, rejected, passages)).toBe(true)
  })

  it('returns false when a passage is unaccounted', () => {
    const interpretations = [{ supportedPassageIds: ['p1'] }]
    const rejected = []
    const passages = [{ id: 'p1' }, { id: 'p2' }]
    expect(evidenceCoversRetrievedPassages(interpretations, rejected, passages)).toBe(false)
  })

  it('returns false when a passage is both supported and rejected', () => {
    const interpretations = [{ supportedPassageIds: ['p1'] }]
    const rejected = [{ passageId: 'p1' }]
    const passages = [{ id: 'p1' }]
    expect(evidenceCoversRetrievedPassages(interpretations, rejected, passages)).toBe(false)
  })
})

describe('citedPassagesAreSupported', () => {
  it('returns true when all cited passages are in supported lists', () => {
    const interpretations = [{ supportedPassageIds: ['p1', 'p2'] }]
    expect(citedPassagesAreSupported(['p1'], interpretations)).toBe(true)
  })

  it('returns false when a cited passage is not supported', () => {
    const interpretations = [{ supportedPassageIds: ['p1'] }]
    expect(citedPassagesAreSupported(['p2'], interpretations)).toBe(false)
  })
})

describe('clarificationFromInterpretations', () => {
  it('returns null when fewer than 2 interpretations', () => {
    expect(clarificationFromInterpretations([{ topic: 'A' }], 'q', null, [])).toBe(null)
  })

  it('builds an ambiguous_question result for 2+ interpretations', () => {
    const result = clarificationFromInterpretations(
      [{ topic: 'Color' }, { topic: 'Size' }],
      'question',
      'goal',
      [],
    )
    expect(result.mode).toBe('ambiguous_question')
    expect(result.answer).toBe('Do you mean Color or Size?')
    expect(result.followUpContext.originalQuestion).toBe('question')
  })
})

describe('validateAnswerResult', () => {
  const passages = [{ id: 'p1' }, { id: 'p2' }]

  it('returns null for invalid input', () => {
    expect(validateAnswerResult(null, passages, 'q')).toBe(null)
  })

  it('validates a complete direct_answer', () => {
    const value = {
      mode: 'direct_answer',
      answer: 'The weight is 10 lbs',
      citedPassageIds: ['p1'],
      interpretations: [{ topic: 'Weight', supportedPassageIds: ['p1'] }],
      rejectedPassages: [{ passageId: 'p2', reason: 'Not relevant' }],
    }
    const result = validateAnswerResult(value, passages, 'q')
    expect(result.mode).toBe('direct_answer')
    expect(result.citedPassageIds).toEqual(['p1'])
  })

  it('returns null when direct_answer has no cited passages', () => {
    const value = {
      mode: 'direct_answer',
      answer: 'Yes',
      citedPassageIds: [],
      interpretations: [{ topic: 'T', supportedPassageIds: ['p1'] }],
      rejectedPassages: [{ passageId: 'p2', reason: 'No' }],
    }
    expect(validateAnswerResult(value, passages, 'q')).toBe(null)
  })
})
