import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_OPENAI_MODEL,
  OPENAI_RESPONSES_ENDPOINT,
  createCandidateAwarePrior,
  miniEnrichSelectedCandidates,
} from './ai-selector.js'

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
  it('creates a reusable prerank artifact from the full candidate pool', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: {
          input_tokens: 300,
          output_tokens: 80,
          total_tokens: 380,
          output_tokens_details: {
            reasoning_tokens: 20,
          },
        },
        output_text: JSON.stringify({
          ranked_candidates: [
            {
              candidate_id: 'prod-2',
              baseline_fit: 'Best baseline option for frequent flights.',
              baseline_caution: 'Costs more than entry-level picks.',
            },
            {
              candidate_id: 'prod-1',
              baseline_fit: 'Strong all-round fallback option.',
              baseline_caution: 'Fewer reviews than the top baseline pick.',
            },
          ],
        }),
      }),
    })

    const result = await createCandidateAwarePrior(
      {
        apiKey: 'test-key',
        candidatePool: {
          query: 'stroller',
          details: '',
          candidates: [
            createCandidate(),
            createCandidate({
              id: 'prod-2',
              title: 'Compact airport stroller',
            }),
          ],
        },
      },
      fetchMock,
    )

    expect(result.model).toBe(DEFAULT_OPENAI_MODEL)
    expect(result.usage).toEqual({
      inputTokens: 300,
      outputTokens: 80,
      totalTokens: 380,
      reasoningTokens: 20,
    })
    expect(result.artifact.rankedCandidates).toEqual([
      expect.objectContaining({
        candidateId: 'prod-2',
        baselineFit: 'Best baseline option for frequent flights.',
        baselineCaution: 'Costs more than entry-level picks.',
      }),
      expect.objectContaining({
        candidateId: 'prod-1',
        baselineFit: 'Strong all-round fallback option.',
        baselineCaution: 'Fewer reviews than the top baseline pick.',
      }),
    ])
    expect(result.artifact.layer).toBe('candidate_aware_prior')
    expect(result.artifact).not.toHaveProperty('selectedCandidateIds')
  })

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
