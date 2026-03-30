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

  it('uses parallel shard scoring for larger candidate pools and aggregates usage', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          usage: {
            input_tokens: 800,
            output_tokens: 220,
            total_tokens: 1020,
            output_tokens_details: {
              reasoning_tokens: 90,
            },
          },
          output_text: JSON.stringify({
            evaluations: [
              {
                candidate_id: 'prod-1',
                score: 88,
                rationale: 'Strong overall fit.',
                drawback: 'A bit pricier than the lowest-cost options.',
                badge_label: null,
                badge_reason: null,
              },
              {
                candidate_id: 'prod-2',
                score: 96,
                rationale: 'Best match for the travel use case.',
                drawback: 'Costs more than the budget picks.',
                badge_label: 'Best premium pick',
                badge_reason: 'Top overall quality for frequent travel.',
              },
              {
                candidate_id: 'prod-3',
                score: 95,
                rationale: 'Very close to the top option.',
                drawback: 'Only sold by one merchant here.',
                badge_label: null,
                badge_reason: null,
              },
              {
                candidate_id: 'prod-4',
                score: 84,
                rationale: 'Dependable backup choice.',
                drawback: 'Less compact when folded.',
                badge_label: null,
                badge_reason: null,
              },
              {
                candidate_id: 'prod-5',
                score: 82,
                rationale: 'Useful value-oriented option.',
                drawback: 'Fewer premium features.',
                badge_label: null,
                badge_reason: null,
              },
              {
                candidate_id: 'prod-6',
                score: 80,
                rationale: 'Good all-rounder.',
                drawback: 'Average review depth.',
                badge_label: null,
                badge_reason: null,
              },
              {
                candidate_id: 'prod-7',
                score: 78,
                rationale: 'Still relevant to the query.',
                drawback: 'Heavier than the top picks.',
                badge_label: null,
                badge_reason: null,
              },
            ],
          }),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          usage: {
            input_tokens: 420,
            output_tokens: 120,
            total_tokens: 540,
            output_tokens_details: {
              reasoning_tokens: 44,
            },
          },
          output_text: JSON.stringify({
            evaluations: [
              {
                candidate_id: 'prod-8',
                score: 91,
                rationale: 'Compact and travel-friendly.',
                drawback: 'Smaller basket.',
                badge_label: 'Best value',
                badge_reason: 'Strong feature-to-price balance.',
              },
              {
                candidate_id: 'prod-9',
                score: 79,
                rationale: 'Useful alternate option.',
                drawback: 'Not as easy to fold.',
                badge_label: null,
                badge_reason: null,
              },
              {
                candidate_id: 'prod-10',
                score: 77,
                rationale: 'Works for lighter use.',
                drawback: 'Lowest review confidence here.',
                badge_label: null,
                badge_reason: null,
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
          details: 'airport travel and easy folding',
          searchState: '',
          similarQueries: [],
          candidates: [
            createCandidate({ id: 'prod-1', title: 'Travel stroller 1' }),
            createCandidate({
              id: 'prod-2',
              title: 'Travel stroller 2',
              duplicateFamilyKey: 'airport-family',
            }),
            createCandidate({
              id: 'prod-3',
              title: 'Travel stroller 3',
              duplicateFamilyKey: 'airport-family',
            }),
            createCandidate({ id: 'prod-4', title: 'Travel stroller 4' }),
            createCandidate({ id: 'prod-5', title: 'Travel stroller 5' }),
            createCandidate({ id: 'prod-6', title: 'Travel stroller 6' }),
            createCandidate({ id: 'prod-7', title: 'Travel stroller 7' }),
            createCandidate({ id: 'prod-8', title: 'Travel stroller 8' }),
            createCandidate({ id: 'prod-9', title: 'Travel stroller 9' }),
            createCandidate({ id: 'prod-10', title: 'Travel stroller 10' }),
          ],
        },
        finalResultLimit: 6,
      },
      fetchMock,
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).input[1].content).toContain('Only score candidates from shard 1 of 2.')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).input[1].content).toContain('Only score candidates from shard 2 of 2.')
    expect(result.strategy).toBe('parallel_shards')
    expect(result.usage).toEqual({
      inputTokens: 1220,
      outputTokens: 340,
      totalTokens: 1560,
      reasoningTokens: 134,
    })
    expect(result.selectedCandidateIds).toEqual(['prod-2', 'prod-8', 'prod-1', 'prod-4', 'prod-5', 'prod-6'])
    expect(result.results).toHaveLength(6)
    expect(result.results[0].badgeLabel).toBe('Best match')
    expect(result.results[1].badgeLabel).toBe('Best value')
    expect(result.results.some((item) => item.title === 'Travel stroller 3')).toBe(false)
  })
})
