import { describe, expect, it } from 'vitest'

import {
  fallbackAnswer,
  labelPassage,
  deterministicRespond,
  fallbackResult,
  deterministicAnswerResult,
} from './deterministic-answer.js'

describe('fallbackAnswer', () => {
  it('returns weight-specific fallback', () => {
    expect(fallbackAnswer('How much does it weigh?')).toBe(
      "I don't know the product weight from the provided product info.",
    )
  })

  it('returns price-specific fallback', () => {
    expect(fallbackAnswer('What is the price?')).toBe(
      "I don't know the price or shipping details from the provided product info.",
    )
  })

  it('returns color-specific fallback', () => {
    expect(fallbackAnswer('What colors are available?')).toBe(
      "I don't know the available colors from the provided product info.",
    )
  })

  it('returns compatibility-specific fallback', () => {
    expect(fallbackAnswer('Is it compatible with my car?')).toBe(
      "I don't know the compatibility details from the provided product info.",
    )
  })

  it('returns generic fallback with subject', () => {
    expect(fallbackAnswer('battery life')).toMatch(/I don't know the battery life from/)
  })

  it('returns bare generic fallback when no meaningful terms', () => {
    expect(fallbackAnswer('')).toBe("I don't know from the provided product info.")
  })
})

describe('labelPassage', () => {
  it('labels color passages', () => {
    expect(labelPassage({ text: 'Available in red shade', source_type: 'spec', value: null })).toBe('Color options')
  })

  it('labels compatibility passages', () => {
    expect(labelPassage({ text: 'Compatible with car seat', source_type: 'spec', value: null })).toBe('Compatibility')
  })

  it('labels fold/storage passages', () => {
    expect(labelPassage({ text: 'Compact fold for storage', source_type: 'spec', value: null })).toBe(
      'Fold and storage',
    )
  })

  it('capitalizes source_type as fallback label', () => {
    expect(labelPassage({ text: 'Some random text', source_type: 'description', value: null })).toBe('Description')
  })
})

describe('deterministicRespond', () => {
  it('returns fallback when no passages have text', () => {
    const result = deterministicRespond('weight?', [{ text: '', source_type: 'spec', value: null }])
    expect(result).toMatch(/I don't know/)
  })

  it('returns single fact text directly', () => {
    const result = deterministicRespond('weight?', [
      { text: 'Weighs 10 lbs', source_type: 'spec', value: null },
    ])
    expect(result).toBe('Weighs 10 lbs')
  })

  it('combines multiple facts', () => {
    const result = deterministicRespond('details?', [
      { text: 'Fact one', source_type: 'spec', value: null },
      { text: 'Fact two', source_type: 'description', value: null },
    ])
    expect(result).toContain('I found a few relevant details')
    expect(result).toContain('Fact one')
    expect(result).toContain('Fact two')
  })
})

describe('fallbackResult', () => {
  it('returns a missing_fact result', () => {
    const result = fallbackResult('question')
    expect(result.mode).toBe('missing_fact')
    expect(result.citedPassageIds).toEqual([])
    expect(result.followUpContext).toBe(null)
  })
})

describe('deterministicAnswerResult', () => {
  it('returns fallback for empty passages', () => {
    const result = deterministicAnswerResult('question', [])
    expect(result.mode).toBe('missing_fact')
  })

  it('returns direct_answer for single passage', () => {
    const passages = [{ id: 'p1', text: 'Answer', source_type: 'spec', value: null }]
    const result = deterministicAnswerResult('question', passages)
    expect(result.mode).toBe('direct_answer')
    expect(result.citedPassageIds).toEqual(['p1'])
  })

  it('returns multi_fact_answer for multiple passages', () => {
    const passages = [
      { id: 'p1', text: 'Fact one', source_type: 'spec', value: null },
      { id: 'p2', text: 'Fact two', source_type: 'description', value: null },
    ]
    const result = deterministicAnswerResult('question', passages)
    expect(result.mode).toBe('multi_fact_answer')
    expect(result.citedPassageIds).toEqual(['p1', 'p2'])
  })

  it('includes rejected passages beyond the first 3', () => {
    const passages = [
      { id: 'p1', text: 'A', source_type: 'spec', value: null },
      { id: 'p2', text: 'B', source_type: 'spec', value: null },
      { id: 'p3', text: 'C', source_type: 'spec', value: null },
      { id: 'p4', text: 'D', source_type: 'spec', value: null },
    ]
    const result = deterministicAnswerResult('question', passages)
    expect(result.citedPassageIds).toHaveLength(3)
    expect(result.rejectedPassages).toHaveLength(1)
    expect(result.rejectedPassages[0].passageId).toBe('p4')
  })
})
