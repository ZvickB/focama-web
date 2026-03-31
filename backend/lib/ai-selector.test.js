import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_OPENAI_MODEL,
  OPENAI_RESPONSES_ENDPOINT,
  createPreRankArtifact,
  materializePreRankArtifactResults,
  selectAiResults,
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
  it('selects final UI results from structured OpenAI output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: {
          input_tokens: 420,
          output_tokens: 96,
          total_tokens: 516,
          output_tokens_details: {
            reasoning_tokens: 44,
          },
        },
        output_text: JSON.stringify({
          picks: [
            {
              candidate_id: 'prod-2',
              rationale: 'Best fit for airport travel and strong reviews.',
              drawback: 'Pricier than the cheapest compact options.',
            },
            {
              candidate_id: 'prod-1',
              rationale: 'A solid backup with a similar lightweight profile.',
              drawback: 'Fewer reviews than the top pick.',
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
    expect(result.usage).toEqual({
      inputTokens: 420,
      outputTokens: 96,
      totalTokens: 516,
      reasoningTokens: 44,
    })
    expect(result.selectedCandidateIds).toEqual(['prod-2', 'prod-1'])
    expect(result.results[0].title).toBe('Compact airport stroller')
    expect(result.results[0].reasons[0]).toBe('AI fit: Best fit for airport travel and strong reviews.')
    expect(result.results[0].drawbacks).toEqual(['Pricier than the cheapest compact options.'])
    expect(result.results[0].badgeLabel).toBe('')
    expect(result.results[1].badgeLabel).toBe('')
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
                    },
                    {
                      candidate_id: 'prod-1',
                      rationale: 'Duplicate.',
                      drawback: 'Duplicate caution.',
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
    expect(result.results[0].badgeLabel).toBe('')
  })

  it('does not ask the model to assign badge labels in the blocking selection schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          picks: [
            {
              candidate_id: 'prod-1',
              rationale: 'Top fit.',
              drawback: 'A bit expensive.',
            },
            {
              candidate_id: 'prod-2',
              rationale: 'Premium option.',
              drawback: 'Highest price here.',
            },
            {
              candidate_id: 'prod-3',
              rationale: 'Small-space option.',
              drawback: 'Less roomy.',
            },
            {
              candidate_id: 'prod-4',
              rationale: 'Comfort-focused.',
              drawback: 'Bulkier.',
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

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const prompt = requestBody.input[1].content

    expect(prompt).not.toContain('Badge strategy')
    expect(JSON.stringify(requestBody.text.format.schema)).not.toContain('badge_label')
    expect(result.results.every((item) => item.badgeLabel === '')).toBe(true)
  })

  it('omits low-value descriptions from the AI candidate summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          picks: [],
        }),
      }),
    })

    await selectAiResults(
      {
        apiKey: 'test-key',
        candidatePool: {
          query: 'painting',
          details: '',
          searchState: '',
          similarQueries: [],
          candidates: [
            createCandidate({
              description: '20% OFF',
            }),
          ],
        },
        finalResultLimit: 6,
      },
      fetchMock,
    )

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const prompt = requestBody.input[1].content

    expect(prompt).toContain('"description":""')
    expect(prompt).not.toContain('20% OFF')
  })

  it('drops redundant source, price, and delivery reasons from the AI candidate summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          picks: [],
        }),
      }),
    })

    await selectAiResults(
      {
        apiKey: 'test-key',
        candidatePool: {
          query: 'mens on cloud dress shoes',
          details: '',
          searchState: '',
          similarQueries: [],
          candidates: [
            createCandidate({
              price: '$149.99',
              reasons: [
                'Available from Target',
                'Listed around $149.99',
                'Free shipping',
                'Breathable knit upper for everyday wear',
                'Breathable knit upper for everyday wear.',
              ],
            }),
          ],
        },
        finalResultLimit: 6,
      },
      fetchMock,
    )

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const prompt = requestBody.input[1].content

    expect(prompt).not.toContain('Available from Target')
    expect(prompt).not.toContain('Listed around $149.99')
    expect(prompt).not.toContain('Free shipping')
    expect(prompt).toContain('Breathable knit upper for everyday wear')
  })

  it('drops boilerplate shop-style descriptions that mostly restate the title or query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          picks: [],
        }),
      }),
    })

    await selectAiResults(
      {
        apiKey: 'test-key',
        candidatePool: {
          query: 'mens on cloud dress shoes',
          details: '',
          searchState: '',
          similarQueries: [],
          candidates: [
            createCandidate({
              title: 'On Cloud 6',
              source: 'Nordstrom',
              description: 'Shop mens on cloud dress shoes at Nordstrom',
            }),
          ],
        },
        finalResultLimit: 6,
      },
      fetchMock,
    )

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const prompt = requestBody.input[1].content

    expect(prompt).toContain('"description":""')
    expect(prompt).not.toContain('Shop mens on cloud dress shoes at Nordstrom')
  })

  it('includes compact duplicate-family, attribute, and trimmed trust metadata in the AI summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          picks: [],
        }),
      }),
    })

    await selectAiResults(
      {
        apiKey: 'test-key',
        candidatePool: {
          query: 'mens on cloud dress shoes',
          details: '',
          searchState: '',
          similarQueries: [],
          candidates: [
            createCandidate({
              duplicateFamilyKey: 'cloud 6 shoe',
              attributes: ['waterproof', 'running'],
              trustSignals: {
                hasMultipleSources: true,
                hasRealDescription: true,
                ratingBand: 'high',
                reviewBand: 'moderate',
                score: 4,
              },
              variantTokens: ['waterproof'],
            }),
          ],
        },
        finalResultLimit: 6,
      },
      fetchMock,
    )

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const prompt = requestBody.input[1].content

    expect(prompt).toContain('"duplicateFamilyKey":"cloud 6 shoe"')
    expect(prompt).toContain('"attributes":[')
    expect(prompt).toContain('"trustScore":4')
    expect(prompt).not.toContain('"variantTokens": [')
    expect(prompt).not.toContain('"ratingBand": "high"')
  })

  it('drops backend-only and redundant prompt fields from finalize selection input', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          picks: [],
        }),
      }),
    })

    await selectAiResults(
      {
        apiKey: 'test-key',
        candidatePool: {
          query: 'stroller',
          details: 'airport travel and easy folding',
          searchState: 'Results for exact spelling',
          similarQueries: ['compact stroller'],
          candidates: [
            createCandidate({
              numericPrice: 199.99,
            }),
          ],
        },
        finalResultLimit: 6,
      },
      fetchMock,
    )

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const prompt = requestBody.input[1].content

    expect(prompt).not.toContain('Search state:')
    expect(prompt).not.toContain('Similar queries:')
    expect(prompt).not.toContain('"matchSignals"')
    expect(prompt).not.toContain('"numericPrice"')
    expect(prompt).toContain('"trustScore":null')
  })

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

    const result = await createPreRankArtifact(
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
        rank: 1,
        baselineFit: 'Best baseline option for frequent flights.',
        baselineCaution: 'Costs more than entry-level picks.',
      }),
      expect.objectContaining({
        candidateId: 'prod-1',
        rank: 2,
        baselineFit: 'Strong all-round fallback option.',
        baselineCaution: 'Fewer reviews than the top baseline pick.',
      }),
    ])
  })

  it('can materialize direct results from a reusable prerank artifact', () => {
    const materialized = materializePreRankArtifactResults({
      preRankArtifact: {
        version: 1,
        rankedCandidates: [
          {
            candidateId: 'prod-2',
            rank: 1,
            baselineFit: 'Best baseline fit.',
            baselineCaution: 'Pricier than the cheapest picks.',
          },
          {
            candidateId: 'prod-1',
            rank: 2,
            baselineFit: 'Solid backup option.',
            baselineCaution: 'Fewer reviews than the top pick.',
          },
        ],
      },
      candidatePool: {
        candidates: [
          createCandidate(),
          createCandidate({
            id: 'prod-2',
            title: 'Compact airport stroller',
          }),
        ],
      },
      finalResultLimit: 6,
    })

    expect(materialized.selectedCandidateIds).toEqual(['prod-2', 'prod-1'])
    expect(materialized.results[0].title).toBe('Compact airport stroller')
    expect(materialized.results[0].reasons).toEqual(['AI fit: Best baseline fit.'])
    expect(materialized.results[0].drawbacks).toEqual(['Pricier than the cheapest picks.'])
    expect(materialized.debug).toEqual({
      artifactCandidateCount: 2,
      intentMatchRerankUsed: false,
      preRankArtifactReused: true,
      preRankReuseReason: 'artifact_direct',
    })
  })

  it('uses a lighter artifact-aware rerank when a reusable prerank artifact is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: {
          input_tokens: 180,
          output_tokens: 24,
          total_tokens: 204,
          output_tokens_details: {
            reasoning_tokens: 4,
          },
        },
        output_text: JSON.stringify({
          picks: [
            {
              candidate_id: 'prod-2',
              rationale: 'Best match for airport travel and compact storage.',
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
          details: 'airport travel and compact storage',
          candidates: [
            createCandidate(),
            createCandidate({
              id: 'prod-2',
              title: 'Compact airport stroller',
            }),
          ],
        },
        finalResultLimit: 6,
        preRankArtifact: {
          version: 1,
          rankedCandidates: [
            {
              candidateId: 'prod-2',
              rank: 1,
              baselineFit: 'Best baseline option for frequent flights.',
              baselineCaution: 'Costs more than entry-level picks.',
            },
            {
              candidateId: 'prod-1',
              rank: 2,
              baselineFit: 'Strong all-round fallback option.',
              baselineCaution: 'Fewer reviews than the top baseline pick.',
            },
          ],
        },
      },
      fetchMock,
    )

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const prompt = requestBody.input[1].content

    expect(prompt).toContain('Reusable preranked candidates:')
    expect(prompt).toContain('airport travel and compact storage')
    expect(result.strategy).toBe('artifact_intent_rerank')
    expect(result.selectedCandidateIds).toEqual(['prod-2'])
    expect(result.results[0].drawbacks).toEqual(['Costs more than entry-level picks.'])
    expect(result.debug).toEqual({
      artifactCandidateCount: 2,
      intentMatchRerankUsed: true,
      preRankArtifactReused: true,
      preRankReuseReason: 'artifact_intent_rerank',
    })
  })

})
