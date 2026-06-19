import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const anthropicMocks = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function Anthropic() {
    return {
      messages: {
        create: anthropicMocks.create,
      },
    }
  }),
}))

import { haikuLockWinnersAndBadges, miniEnrichSelectedCandidates } from './ai-selector.js'

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

function createCandidatePool(candidateCount = 4) {
  return {
    query: 'travel stroller',
    details: 'compact enough for flights',
    candidates: Array.from({ length: candidateCount }, (_entry, index) => createCandidate({
      id: `prod-${index + 1}`,
      title: `Travel stroller ${index + 1}`,
      price: `$${199 + index}.99`,
      rating: 4.7 - (index * 0.1),
    })),
  }
}

function mockHaikuResponse(text, usage = { input_tokens: 12, output_tokens: 4 }) {
  anthropicMocks.create.mockResolvedValue({
    content: [{ type: 'text', text }],
    usage,
  })
}

describe('ai selector', () => {
  beforeEach(() => {
    anthropicMocks.create.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns no Haiku picks without calling the model when the pool is empty', async () => {
    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 6,
      candidatePool: {
        query: 'stroller',
        details: '',
        candidates: [],
      },
    })

    expect(anthropicMocks.create).not.toHaveBeenCalled()
    expect(result).toEqual({
      model: 'claude-haiku-4-5-20251001',
      lockedIds: [],
      usage: null,
    })
  })

  it('parses Haiku JSON from a text response and caps picks to the requested count', async () => {
    mockHaikuResponse('Sure:\n{"picks":[{"candidate_id":"prod-3"},{"candidate_id":"prod-1"},{"candidate_id":"prod-2"}]}')

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 2,
      candidatePool: createCandidatePool(3),
    })

    expect(anthropicMocks.create).toHaveBeenCalledTimes(1)
    expect(result.lockedIds).toEqual(['prod-3', 'prod-1'])
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
    })
  })

  it('gives Haiku one ordered shortlist policy with eligibility before ranking', async () => {
    mockHaikuResponse('{"picks":[{"candidate_id":"prod-1"}]}')

    await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 1,
      candidatePool: createCandidatePool(2),
    })

    const prompt = anthropicMocks.create.mock.calls[0][0].messages[0].content

    expect(prompt).toContain('Apply these rules in order:')
    expect(prompt).toContain('An eligible lower-rated product beats an ineligible higher-rated product.')
    expect(prompt).toContain('Match the requested product type before considering quality.')
    expect(prompt).toContain('Brand familiarity is positive only when the product also fits.')
    expect(prompt).toContain('Detect duplicates using duplicateFamilyKey first')
    expect(prompt).toContain('Use amazonPosition only as the final tie-breaker.')
    expect(prompt).not.toContain('Ranking approach - apply in this order:')
    expect(prompt).not.toContain('Eligibility rules (apply before ranking):')
    expect(prompt).not.toContain('Within the eligible set, final order priority:')
  })

  it('rejects duplicate and out-of-pool Haiku ids while keeping valid ids in order', async () => {
    mockHaikuResponse(JSON.stringify({
      picks: [
        { candidate_id: 'prod-1' },
        { candidate_id: 'prod-1' },
        { candidate_id: 'not-in-pool' },
        { candidate_id: 'prod-2' },
      ],
    }))

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 4,
      candidatePool: createCandidatePool(3),
    })

    expect(result.lockedIds).toEqual(['prod-1', 'prod-2'])
  })

  it('returns an empty Haiku lock instead of throwing on malformed model text', async () => {
    mockHaikuResponse('this is not JSON')

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 3,
      candidatePool: createCandidatePool(3),
    })

    expect(result.lockedIds).toEqual([])
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
    })
  })

  it('returns partial Haiku selections without inventing fallback ids in the selector layer', async () => {
    mockHaikuResponse(JSON.stringify({
      picks: [{ candidate_id: 'prod-2' }],
    }))

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 3,
      candidatePool: createCandidatePool(4),
    })

    expect(result.lockedIds).toEqual(['prod-2'])
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
              display_title: 'Travel Stroller',
              match_identifier: {
                brand: null,
                model_number: null,
                product_type: 'travel stroller',
                attributes: {
                  generation: null,
                  size: null,
                  capacity: null,
                  color: null,
                  material: null,
                  pack_count: null,
                  condition: null,
                },
              },
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
        display_title: 'Travel Stroller',
        match_identifier: expect.objectContaining({
          brand: null,
          model_number: null,
          upc: null,
          product_type: 'travel stroller',
        }),
        source_title: 'Travel stroller',
        feature_bullets: ['One-hand fold', 'Compact carry strap'],
      },
    ])
    expect(requestBody.text.format.schema.properties.enriched.items.properties.match_identifier.properties).not.toHaveProperty('upc')
  })

  it('reports whether mini enrichment preserved the locked shortlist order', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          enriched: [
            {
              candidate_id: 'prod-2',
              fit_reason: 'Second product was explained first.',
              caveat: 'It is not the first locked pick.',
            },
            {
              candidate_id: 'prod-1',
              fit_reason: 'First product was explained second.',
              caveat: 'The model changed the intended order.',
            },
          ],
        }),
      }),
    })

    const result = await miniEnrichSelectedCandidates(
      {
        apiKey: 'test-key',
        lockedIds: ['prod-1', 'prod-2'],
        candidatePool: createCandidatePool(2),
      },
      fetchMock,
    )

    expect(result.enrichedIds).toEqual(['prod-2', 'prod-1'])
    expect(result.preservedOrder).toBe(false)
  })

  it('skips mini enrichment when there are no locked ids', async () => {
    const fetchMock = vi.fn()

    const result = await miniEnrichSelectedCandidates(
      {
        apiKey: 'test-key',
        lockedIds: [],
        candidatePool: createCandidatePool(2),
      },
      fetchMock,
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      model: 'gpt-5-mini',
      enriched: [],
      enrichedIds: [],
      usage: null,
      preservedOrder: true,
    })
  })
})
