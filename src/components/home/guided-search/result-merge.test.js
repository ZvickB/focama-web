import { describe, expect, it } from 'vitest'

import {
  mergeEnrichmentIntoResults,
  mergeProductDetailsIntoResults,
  entriesNeedFeatureBulletHydration,
  mergeFinalizeResults,
  findResultById,
  resolveSelectedProductForDisplay,
} from './result-merge.js'

describe('mergeEnrichmentIntoResults', () => {
  it('returns results unchanged when enrichment is empty', () => {
    const results = [{ id: '1', title: 'A' }]
    expect(mergeEnrichmentIntoResults(results, [])).toEqual(results)
  })

  it('returns results unchanged when inputs are invalid', () => {
    expect(mergeEnrichmentIntoResults(null, [])).toBe(null)
    expect(mergeEnrichmentIntoResults([], null)).toEqual([])
  })

  it('merges enrichment data by candidate_id', () => {
    const results = [{ id: '1', title: 'A' }, { id: '2', title: 'B' }]
    const enrichment = [
      { candidate_id: '1', fit_reason: 'Good fit', caveat: 'Heavy', isPrime: true, delivery: '2-day' },
    ]
    const merged = mergeEnrichmentIntoResults(results, enrichment)
    expect(merged[0].fit_reason).toBe('Good fit')
    expect(merged[0].caveat).toBe('Heavy')
    expect(merged[0].isPrime).toBe(true)
    expect(merged[0].delivery).toBe('2-day')
    expect(merged[1]).toEqual({ id: '2', title: 'B' })
  })

  it('merges enrichment data by candidateId (camelCase)', () => {
    const results = [{ id: '1', title: 'A' }]
    const enrichment = [{ candidateId: '1', fitReason: 'Nice', caveat: '' }]
    const merged = mergeEnrichmentIntoResults(results, enrichment)
    expect(merged[0].fit_reason).toBe('Nice')
  })

  it('merges feature_bullets from enrichment', () => {
    const results = [{ id: '1' }]
    const enrichment = [{ candidate_id: '1', feature_bullets: ['a', 'b'] }]
    const merged = mergeEnrichmentIntoResults(results, enrichment)
    expect(merged[0].feature_bullets).toEqual(['a', 'b'])
  })
})

describe('mergeProductDetailsIntoResults', () => {
  it('returns results unchanged when details are not ready', () => {
    const results = [{ id: '1' }]
    expect(mergeProductDetailsIntoResults(results, '1', { ready: false })).toEqual(results)
    expect(mergeProductDetailsIntoResults(results, '1', null)).toEqual(results)
  })

  it('merges product details into matching result', () => {
    const results = [{ id: '1', title: 'A' }, { id: '2', title: 'B' }]
    const details = { ready: true, isPrime: true, delivery: 'Next day', feature_bullets: ['x'] }
    const merged = mergeProductDetailsIntoResults(results, '1', details)
    expect(merged[0].isPrime).toBe(true)
    expect(merged[0].delivery).toBe('Next day')
    expect(merged[0].feature_bullets).toEqual(['x'])
    expect(merged[1]).toEqual({ id: '2', title: 'B' })
  })
})

describe('entriesNeedFeatureBulletHydration', () => {
  it('returns false for empty or invalid input', () => {
    expect(entriesNeedFeatureBulletHydration([])).toBe(false)
    expect(entriesNeedFeatureBulletHydration(null)).toBe(false)
  })

  it('returns true when an entry has no feature bullets', () => {
    expect(entriesNeedFeatureBulletHydration([{ candidate_id: '1' }])).toBe(true)
  })

  it('returns false when all entries have feature bullets', () => {
    expect(entriesNeedFeatureBulletHydration([{ feature_bullets: ['a'] }])).toBe(false)
  })
})

describe('mergeFinalizeResults', () => {
  it('returns empty array for invalid inputs', () => {
    expect(mergeFinalizeResults(null, null)).toEqual([])
    expect(mergeFinalizeResults([], null)).toEqual([])
  })

  it('merges candidate pool data into results', () => {
    const results = [{ id: '1', title: 'A' }]
    const pool = { candidates: [{ id: '1', image: 'img.jpg', link: 'http://a.com', isPrime: true }] }
    const merged = mergeFinalizeResults(results, pool)
    expect(merged[0].image).toBe('img.jpg')
    expect(merged[0].link).toBe('http://a.com')
    expect(merged[0].isPrime).toBe(true)
  })
})

describe('findResultById', () => {
  it('returns null for invalid inputs', () => {
    expect(findResultById(null, '1')).toBe(null)
    expect(findResultById([], null)).toBe(null)
  })

  it('finds a result by string id', () => {
    const results = [{ id: '1', title: 'A' }, { id: '2', title: 'B' }]
    expect(findResultById(results, '2')).toEqual({ id: '2', title: 'B' })
  })

  it('matches numeric id to string id', () => {
    const results = [{ id: 5, title: 'C' }]
    expect(findResultById(results, '5')).toEqual({ id: 5, title: 'C' })
  })

  it('returns null when no match', () => {
    expect(findResultById([{ id: '1' }], '99')).toBe(null)
  })
})

describe('resolveSelectedProductForDisplay', () => {
  it('returns null when no selectedProduct', () => {
    expect(resolveSelectedProductForDisplay({ selectedProduct: null })).toBe(null)
  })

  it('returns selectedProduct as-is when id not found in any set', () => {
    const selected = { id: '99', title: 'Gone' }
    const result = resolveSelectedProductForDisplay({
      results: [],
      previousResults: [],
      previewResults: [],
      selectedProduct: selected,
    })
    expect(result).toEqual(selected)
  })

  it('resolves from final results by default', () => {
    const selected = { id: '1', analyticsMeta: { resultSet: 'final' } }
    const live = { id: '1', title: 'Live', fit_reason: 'Updated' }
    const result = resolveSelectedProductForDisplay({
      results: [live],
      previousResults: [],
      previewResults: [],
      selectedProduct: selected,
    })
    expect(result.title).toBe('Live')
    expect(result.fit_reason).toBe('Updated')
    expect(result.analyticsMeta).toEqual({ resultSet: 'final' })
  })

  it('resolves from previous results when resultSet is previous', () => {
    const selected = { id: '1', analyticsMeta: { resultSet: 'previous' } }
    const prev = { id: '1', title: 'Previous' }
    const result = resolveSelectedProductForDisplay({
      results: [],
      previousResults: [prev],
      previewResults: [],
      selectedProduct: selected,
    })
    expect(result.title).toBe('Previous')
  })

  it('resolves from preview results when resultSet is preview', () => {
    const selected = { id: '1', analyticsMeta: { resultSet: 'preview' } }
    const preview = { id: '1', title: 'Preview' }
    const result = resolveSelectedProductForDisplay({
      results: [],
      previousResults: [],
      previewResults: [preview],
      selectedProduct: selected,
    })
    expect(result.title).toBe('Preview')
  })
})
