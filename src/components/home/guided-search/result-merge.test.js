import { describe, expect, it } from 'vitest'

import {
  mergeEnrichmentIntoResults,
  mergeFinalizeResults,
  resolveSelectedProductForDisplay,
} from './result-merge.js'

describe('guided result merging', () => {
  it('attaches enrichment only to the matching candidate across provider field aliases', () => {
    const results = [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }]

    expect(mergeEnrichmentIntoResults(results, [
      { candidateId: 'two', fitReason: 'Correct fit', feature_bullets: ['Feature'] },
    ])).toEqual([
      { id: 'one', title: 'One' },
      expect.objectContaining({ id: 'two', fit_reason: 'Correct fit', feature_bullets: ['Feature'] }),
    ])
  })

  it('never restores an image hidden by server moderation while merging finalize data', () => {
    const merged = mergeFinalizeResults(
      [{ id: 'one', title: 'Women’s Swimsuit', image: 'final.jpg' }],
      { candidates: [{ id: 'one', image: 'source.jpg', moderation: { outcome: 'hide_image' } }] },
    )

    expect(merged[0]).toMatchObject({ image: '', moderation: { outcome: 'hide_image' } })
  })

  it('hydrates an open modal from its own live result set without losing analytics identity', () => {
    const selectedProduct = { id: 'one', analyticsMeta: { resultSet: 'previous', position: 2 } }
    const resolved = resolveSelectedProductForDisplay({
      results: [{ id: 'one', title: 'Current wrong set' }],
      previousResults: [{ id: 'one', title: 'Previous live result', fit_reason: 'Updated' }],
      previewResults: [],
      selectedProduct,
    })

    expect(resolved).toMatchObject({
      id: 'one',
      title: 'Previous live result',
      fit_reason: 'Updated',
      analyticsMeta: { resultSet: 'previous', position: 2 },
    })
  })
})
