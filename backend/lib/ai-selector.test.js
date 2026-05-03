import { describe, expect, it, vi } from 'vitest'

import { miniEnrichSelectedCandidates } from './ai-selector.js'

function createCandidate(overrides = {}) {
  return {
    id: 'prod-1',
    score: 24.5,
    title: 'Travel stroller',
    description: 'Lightweight stroller for flights',
    source: 'Target',
    price: '$199.99',
    numericPrice: 199.99,
    rating: 4.7,
    reviewCount: 342,
    delivery: 'Free shipping',
    tag: 'Top rated',
    extensions: ['Carry-on friendly'],
    multipleSources: true,
    link: 'https://example.com/stroller',
    image: 'https://example.com/stroller.jpg',
    reasons: ['Available from Target', 'Free shipping'],
    matchSignals: {
      titleMatches: 1,
      supportMatches: 1,
      detailMatches: 1,
      exactMatchSearchState: true,
      hasMultipleSources: true,
      hasDeliveryInfo: true,
      hasTag: true,
    },
    ...overrides,
  }
}

describe('ai selector', () => {
  it('passes feature bullets into mini enrichment and preserves them in the stored entries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          enriched: [
            {
              candidate_id: 'prod-1',
              fit_reason: 'Fits travel days because it folds quickly and stays easy to carry.',
              caveat: 'Storage is tighter than on larger everyday strollers.',
            },
          ],
        }),
      }),
    })

    const result = await miniEnrichSelectedCandidates(
      {
        apiKey: 'test-key',
        lockedIds: ['prod-1'],
        candidatePool: {
          query: 'stroller',
          details: 'best for airport travel',
          candidates: [
            createCandidate({
              feature_bullets: ['One-hand fold', 'Compact carry strap'],
              productDescription: 'A compact stroller built for airport travel.',
            }),
          ],
        },
      },
      fetchMock,
    )

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const prompt = requestBody.input[1].content

    expect(prompt).toContain('"feature_bullets":["One-hand fold","Compact carry strap"]')
    expect(prompt).toContain('"product_description":"A compact stroller built for airport travel."')
    expect(result.enriched).toEqual([
      {
        candidate_id: 'prod-1',
        fit_reason: 'Fits travel days because it folds quickly and stays easy to carry.',
        caveat: 'Storage is tighter than on larger everyday strollers.',
        feature_bullets: ['One-hand fold', 'Compact carry strap'],
      },
    ])
  })

})
