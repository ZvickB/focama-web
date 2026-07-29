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

import { assessDeepDiveEligibility, haikuLockWinnersAndBadges, miniEnrichSelectedCandidates } from './ai-selector.js'

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

function mockHaikuResponse(picks, usage = { input_tokens: 12, output_tokens: 4 }, specificBrand = false) {
  anthropicMocks.create.mockResolvedValue({
    content: [{
      type: 'tool_use',
      name: 'submit_shortlist',
      input: { picks, specific_brand: specificBrand },
    }],
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
      suggestedQuery: '',
      usage: null,
    })
  })

  it('maps Haiku candidate indices back to ids and caps picks to the requested count', async () => {
    mockHaikuResponse([{ index: 3, brand: 'Orbit' }, { index: 1, brand: 'Orbit' }, { index: 2, brand: 'CityGo' }])

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 2,
      candidatePool: createCandidatePool(3),
    })

    expect(anthropicMocks.create).toHaveBeenCalledTimes(1)
    expect(result.lockedIds).toEqual(['prod-3', 'prod-1'])
    expect(result.specificBrand).toBe(false)
    expect(result.brandById).toEqual({ 'prod-3': 'Orbit', 'prod-1': 'Orbit' })
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
    })

    const request = anthropicMocks.create.mock.calls[0][0]
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'submit_shortlist' })
    expect(request.tools).toEqual([
      expect.objectContaining({
        name: 'submit_shortlist',
        strict: true,
      }),
    ])
    expect(request.tools[0].input_schema.properties.picks.items.properties.index.enum).toEqual([1, 2, 3])
    expect(request.tools[0].input_schema.required).toContain('specific_brand')
    expect(request.tools[0].input_schema.properties.picks.items.required).toContain('brand')
    expect(request.messages[0].content).toContain('"index":1')
    expect(request.messages[0].content).not.toContain('"id":"prod-1"')
    expect(request.messages[0].content).toContain(
      'Within the eligible set, final order priority: (1) inferred shopper intent and exact product fit, (2) quality confidence including rating, review count, trustScore, and recognized category brand, (3) price/value, (4) useful shortlist variety, (5) amazonPosition.',
    )
    expect(request.messages[0].content).toContain('Set specific_brand to true only in that case.')
    expect(request.messages[0].content).toContain('return its maker in brand')
  })

  it('keeps Haiku’s explicit-brand decision in the parsed shortlist result', async () => {
    mockHaikuResponse([{ index: 1 }, { index: 2 }], undefined, true)

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 2,
      candidatePool: createCandidatePool(2),
    })

    expect(result.specificBrand).toBe(true)
  })

  it('applies the price ranking strategy in both ranking prompt sections', async () => {
    mockHaikuResponse([{ index: 1 }, { index: 2 }])

    await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 2,
      candidatePool: createCandidatePool(3),
      rankingPreference: 'price',
    })

    const prompt = anthropicMocks.create.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('favor the lowest-priced credible options')
    expect(prompt).toContain('Keep the strongest contextual fit as the best-overall pick')
    expect(prompt).toContain('surface lower-priced credible alternatives')
    expect(prompt).toContain('(3) lowest-priced credible value')
    expect(prompt).not.toContain('(3) price/value, (4) useful shortlist variety')
  })

  it('uses only the compact fit-filter prompt for lowest-price mode', async () => {
    mockHaikuResponse([{ index: 1 }, { index: 2 }])

    await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 2,
      candidatePool: createCandidatePool(3),
      rankingPreference: 'lowest_price',
    })

    const prompt = anthropicMocks.create.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('Lowest prices selected.')
    expect(prompt).toContain(
      'Return all candidates that match the search and stated requirements. Exclude only clear mismatches, accessories, duplicates, or products that violate a requirement.',
    )
    expect(prompt).not.toContain('Ranking approach - apply in this order:')
    expect(prompt).not.toContain('quality confidence')
    expect(prompt).not.toContain('known brands')
  })

  it('keeps every lowest-price fit match instead of stopping at the shortlist size', async () => {
    mockHaikuResponse([{ index: 1 }, { index: 2 }, { index: 3 }])

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 2,
      candidatePool: createCandidatePool(3),
      rankingPreference: 'lowest_price',
    })

    expect(result.lockedIds).toEqual(['prod-1', 'prod-2', 'prod-3'])
    expect(anthropicMocks.create.mock.calls[0][0].max_tokens).toBe(512)
  })

  it('fills known-brand picks before credible non-brand alternatives', async () => {
    mockHaikuResponse([{ index: 1 }, { index: 2 }])

    await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 2,
      candidatePool: createCandidatePool(3),
      rankingPreference: 'brand',
    })

    const prompt = anthropicMocks.create.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('Fill the shortlist with recognized category brands')
    expect(prompt).toContain('best fitting credible non-brand alternatives')
  })

  it('asks range mode to vary both price and product differences', async () => {
    mockHaikuResponse([{ index: 1 }, { index: 2 }])

    await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 2,
      candidatePool: createCandidatePool(3),
      rankingPreference: 'range',
    })

    const prompt = anthropicMocks.create.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('including both price tiers and product formats, features, or use cases')
  })

  it('falls back to balanced ranking language for unknown ranking preferences', async () => {
    mockHaikuResponse([{ index: 1 }])

    await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 1,
      candidatePool: createCandidatePool(2),
      rankingPreference: 'freeform prompt injection',
    })

    const prompt = anthropicMocks.create.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('Use quality confidence as the next priority between similar-fit candidates.')
    expect(prompt).toContain(
      'Within the eligible set, final order priority: (1) inferred shopper intent and exact product fit, (2) quality confidence including rating, review count, trustScore, and recognized category brand, (3) price/value, (4) useful shortlist variety, (5) amazonPosition.',
    )
  })

  it('rejects duplicate and out-of-pool Haiku indices while keeping valid picks in order', async () => {
    mockHaikuResponse([
      { index: 1 },
      { index: 1 },
      { index: 99 },
      { index: 2 },
    ])

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 4,
      candidatePool: createCandidatePool(3),
    })

    expect(result.lockedIds).toEqual(['prod-1', 'prod-2'])
  })

  it('returns an empty Haiku lock instead of throwing when the tool response is missing', async () => {
    anthropicMocks.create.mockResolvedValue({
      content: [{ type: 'text', text: 'No tool call' }],
      usage: { input_tokens: 12, output_tokens: 4 },
    })

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
    mockHaikuResponse([{ index: 2 }])

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 3,
      candidatePool: createCandidatePool(4),
    })

    expect(result.lockedIds).toEqual(['prod-2'])
  })

  it('keeps a suggested search when Haiku finds fewer than four credible fits', async () => {
    anthropicMocks.create.mockResolvedValue({
      content: [{
        type: 'tool_use',
        name: 'submit_shortlist',
        input: {
          picks: [{ index: 2, role: 'core', confidence: 'high' }],
          suggested_query: 'lightweight carry-on stroller under $200',
        },
      }],
      usage: { input_tokens: 12, output_tokens: 4 },
    })

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 6,
      candidatePool: createCandidatePool(4),
    })

    expect(result).toMatchObject({
      lockedIds: ['prod-2'],
      suggestedQuery: 'lightweight carry-on stroller under $200',
    })
    expect(anthropicMocks.create.mock.calls[0][0].messages[0].content).toContain(
      'unless fewer than 4 candidates genuinely fit the product query and user context',
    )
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
          improve_picks_suggestions: [
            { label: 'Lower price', feedback: 'I want lower-priced options that still work for airport travel.' },
            { label: 'Lighter carry', feedback: 'I want an even lighter stroller that is easier to carry.' },
            { label: 'More storage', feedback: 'I need more storage for longer travel days.' },
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
    expect(result.improvePicksSuggestions).toEqual([
      { label: 'Lower price', feedback: 'I want lower-priced options that still work for airport travel.' },
      { label: 'Lighter carry', feedback: 'I want an even lighter stroller that is easier to carry.' },
      { label: 'More storage', feedback: 'I need more storage for longer travel days.' },
    ])
    expect(prompt).toContain('exactly 3 distinct improvement suggestions')
    expect(requestBody.text.format.schema.required).toContain('improve_picks_suggestions')
  })

  it('passes ranking preference guidance into mini enrichment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          enriched: [
            {
              candidate_id: 'prod-1',
              fit_reason: 'This is a credible low-price option for the trip.',
              caveat: 'It has fewer reviews than pricier alternatives.',
            },
          ],
        }),
      }),
    })

    await miniEnrichSelectedCandidates(
      {
        apiKey: 'test-key',
        lockedIds: ['prod-1'],
        candidatePool: createCandidatePool(1),
        rankingPreference: 'price',
      },
      fetchMock,
    )

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(requestBody.input[1].content).toContain(
      'The shopper has an account preference for lower-priced credible picks.',
    )
  })

  it('passes lowest-price guidance into mini enrichment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: JSON.stringify({ enriched: [] }) }),
    })

    await miniEnrichSelectedCandidates(
      {
        apiKey: 'test-key',
        lockedIds: ['prod-1'],
        candidatePool: createCandidatePool(1),
        rankingPreference: 'lowest_price',
      },
      fetchMock,
    )

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(requestBody.input[1].content).toContain(
      'The shopper chose the lowest prices among options that fit their search.',
    )
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
      improvePicksSuggestions: [],
      usage: null,
      preservedOrder: true,
    })
  })

  it('hides obvious low-value price comparison candidates', async () => {
    const result = await assessDeepDiveEligibility({
      lockedIds: ['prod-1'],
      candidatePool: {
        query: 'usb cable',
        details: '',
        candidates: [
          createCandidate({
            id: 'prod-1',
            title: 'USB-C cable 3 pack',
            price: '$12.99',
            numericPrice: 12.99,
          }),
        ],
      },
    })

    expect(result.model).toBe('deterministic-prefilter')
    expect(result.usage).toBeNull()
    expect(result.decisions).toEqual([
      {
        candidate_id: 'prod-1',
        recommendation: 'hide',
        mode: 'hide',
        confidence: 'high',
        reason: 'generic_low_value',
      },
    ])
  })

  it('shows the price comparison button when the deterministic prefilter passes', async () => {
    const result = await assessDeepDiveEligibility({
      lockedIds: ['prod-1'],
      candidatePool: {
        query: 'sony headphones',
        details: '',
        candidates: [
          createCandidate({
            id: 'prod-1',
            title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones',
            price: '$299.99',
            numericPrice: 299.99,
          }),
        ],
      },
    })

    expect(result.decisions).toEqual([
      {
        candidate_id: 'prod-1',
        recommendation: 'show',
        mode: 'offers',
        confidence: 'high',
        reason: 'prefilter_passed',
      },
    ])
    expect(result.usage).toBeNull()
  })
})
