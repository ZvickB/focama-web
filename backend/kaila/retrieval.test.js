import { describe, expect, it } from 'vitest'

import {
  normalizeToken,
  tokenize,
  expandTokens,
  scorePassage,
  STOP_WORDS,
  TOKEN_SYNONYMS,
} from './retrieval.js'

describe('normalizeToken', () => {
  it('strips trailing "s" from tokens longer than 3 chars', () => {
    expect(normalizeToken('colors')).toBe('color')
  })

  it('converts "ies" ending to "y"', () => {
    expect(normalizeToken('batteries')).toBe('battery')
  })

  it('leaves short tokens unchanged', () => {
    expect(normalizeToken('is')).toBe('is')
    expect(normalizeToken('as')).toBe('as')
  })

  it('leaves tokens without plural suffix unchanged', () => {
    expect(normalizeToken('fold')).toBe('fold')
  })
})

describe('tokenize', () => {
  it('lowercases, splits, normalizes, and removes stop words', () => {
    const tokens = tokenize('What is the weight of this product?')
    expect(tokens).toContain('weight')
    expect(tokens).not.toContain('what')
    expect(tokens).not.toContain('is')
    expect(tokens).not.toContain('the')
    expect(tokens).not.toContain('of')
    expect(tokens).not.toContain('this')
    expect(tokens).not.toContain('product')
  })

  it('filters single-character tokens', () => {
    const tokens = tokenize('a b c hello')
    expect(tokens).toEqual(['hello'])
  })
})

describe('expandTokens', () => {
  it('expands tokens with synonyms', () => {
    const expanded = expandTokens(['color'])
    expect(expanded).toContain('color')
    expect(expanded).toContain('shade')
    expect(expanded).toContain('finish')
    expect(expanded).toContain('appearance')
  })

  it('leaves tokens without synonyms as-is', () => {
    const expanded = expandTokens(['hello'])
    expect(expanded).toEqual(['hello'])
  })
})

describe('scorePassage', () => {
  it('scores based on matching tokens', () => {
    const passage = { text: 'The weight limit is 50 pounds', source_type: 'spec', value: null }
    const queryTokens = ['weight', 'limit']
    expect(scorePassage(passage, queryTokens)).toBe(2)
  })

  it('returns 0 when no tokens match', () => {
    const passage = { text: 'Beautiful red color', source_type: 'description', value: null }
    const queryTokens = ['battery', 'life']
    expect(scorePassage(passage, queryTokens)).toBe(0)
  })
})

describe('STOP_WORDS', () => {
  it('contains expected stop words', () => {
    expect(STOP_WORDS.has('the')).toBe(true)
    expect(STOP_WORDS.has('what')).toBe(true)
    expect(STOP_WORDS.has('weight')).toBe(false)
  })
})

describe('TOKEN_SYNONYMS', () => {
  it('maps color to its synonyms', () => {
    expect(TOKEN_SYNONYMS.get('color')).toEqual(['shade', 'finish', 'appearance'])
  })
})
