import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_OPENAI_MODEL, OPENAI_RESPONSES_ENDPOINT, selectAiResults } from './ai-selector.js'

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
  it('selects final UI results from structured OpenAI output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          picks: [
            {
              candidate_id: 'prod-2',
              rationale: 'Best fit for airport travel and strong reviews.',
              drawback: 'Pricier than the cheapest compact options.',
              badge_label: 'Best match',
              badge_reason: 'Strongest overall fit for airport travel and review confidence.',
            },
            {
              candidate_id: 'prod-1',
              rationale: 'A solid backup with a similar lightweight profile.',
              drawback: 'Fewer reviews than the top pick.',
              badge_label: 'Best value',
              badge_reason: 'Lower price while keeping a similar lightweight profile.',
            },
          ],
        }),
      }),
    })

    const result = await selectAiResults(
      {
        apiKey: 'test-key',
        candidatePool: {
          query: 'stroller',
          details: 'for airport travel',
          searchState: 'Results for exact spelling',
          similarQueries: [],
          candidates: [
            createCandidate(),
            createCandidate({
              id: 'prod-2',
              title: 'Compact airport stroller',
              source: 'Nordstrom',
              reviewCount: 800,
            }),
          ],
        },
        finalResultLimit: 6,
      },
      fetchMock,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      OPENAI_RESPONSES_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    )
    expect(result.model).toBe(DEFAULT_OPENAI_MODEL)
    expect(result.selectedCandidateIds).toEqual(['prod-2', 'prod-1'])
    expect(result.results[0].title).toBe('Compact airport stroller')
    expect(result.results[0].reasons[0]).toBe('AI fit: Best fit for airport travel and strong reviews.')
    expect(result.results[0].drawbacks).toEqual(['Pricier than the cheapest compact options.'])
    expect(result.results[0].badgeLabel).toBe('Best match')
    expect(result.results[1].badgeLabel).toBe('Best value')
  })

  it('ignores invalid or duplicate candidate ids from the model output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                text: JSON.stringify({
                  picks: [
                    { candidate_id: 'missing-id', rationale: 'Not real.', drawback: 'Not real downside.' },
                    {
                      candidate_id: 'prod-1',
                      rationale: 'Valid.',
                      drawback: 'Some caution.',
                      badge_label: null,
                      badge_reason: null,
                    },
                    {
                      candidate_id: 'prod-1',
                      rationale: 'Duplicate.',
                      drawback: 'Duplicate caution.',
                      badge_label: 'Best match',
                      badge_reason: 'Duplicate.',
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    })

    const result = await selectAiResults(
      {
        apiKey: 'test-key',
        candidatePool: {
          query: 'desk lamp',
          details: '',
          searchState: '',
          similarQueries: [],
          candidates: [createCandidate()],
        },
        finalResultLimit: 6,
      },
      fetchMock,
    )

    expect(result.selectedCandidateIds).toEqual(['prod-1'])
    expect(result.results).toHaveLength(1)
    expect(result.results[0].drawbacks).toEqual(['Some caution.'])
    expect(result.results[0].badgeLabel).toBe('Best match')
  })

  it('caps badges at three total and deduplicates secondary labels', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          picks: [
            {
              candidate_id: 'prod-1',
              rationale: 'Top fit.',
              drawback: 'A bit expensive.',
              badge_label: 'Best value',
              badge_reason: 'Well priced for the feature set.',
            },
            {
              candidate_id: 'prod-2',
              rationale: 'Premium option.',
              drawback: 'Highest price here.',
              badge_label: 'Best premium pick',
              badge_reason: 'Top-end materials.',
            },
            {
              candidate_id: 'prod-3',
              rationale: 'Small-space option.',
              drawback: 'Less roomy.',
              badge_label: 'Best for small spaces',
              badge_reason: 'Compact footprint.',
            },
            {
              candidate_id: 'prod-4',
              rationale: 'Comfort-focused.',
              drawback: 'Bulkier.',
              badge_label: 'Best for comfort',
              badge_reason: 'Extra cushioning.',
            },
          ],
        }),
      }),
    })

    const result = await selectAiResults(
      {
        apiKey: 'test-key',
        candidatePool: {
          query: 'office chair',
          details: 'small office',
          searchState: '',
          similarQueries: [],
          candidates: [
            createCandidate(),
            createCandidate({ id: 'prod-2', title: 'Premium office chair' }),
            createCandidate({ id: 'prod-3', title: 'Compact office chair' }),
            createCandidate({ id: 'prod-4', title: 'Cushioned office chair' }),
          ],
        },
        finalResultLimit: 6,
      },
      fetchMock,
    )

    expect(result.results.filter((item) => item.badgeLabel)).toHaveLength(3)
    expect(result.results[0].badgeLabel).toBe('Best match')
    expect(result.results.map((item) => item.badgeLabel).filter(Boolean)).toEqual([
      'Best match',
      'Best premium pick',
      'Best for small spaces',
    ])
  })
})
