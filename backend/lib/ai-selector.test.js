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
    reasons: ['Source: Target', 'Free shipping'],
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
            },
            {
              candidate_id: 'prod-1',
              rationale: 'A solid backup with a similar lightweight profile.',
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
        finalResultLimit: 4,
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
                    { candidate_id: 'missing-id', rationale: 'Not real.' },
                    { candidate_id: 'prod-1', rationale: 'Valid.' },
                    { candidate_id: 'prod-1', rationale: 'Duplicate.' },
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
        finalResultLimit: 4,
      },
      fetchMock,
    )

    expect(result.selectedCandidateIds).toEqual(['prod-1'])
    expect(result.results).toHaveLength(1)
  })
})
