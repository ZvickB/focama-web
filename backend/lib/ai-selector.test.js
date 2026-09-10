import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const anthropicMocks = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function Anthropic() {
    return { messages: { create: anthropicMocks.create } }
  }),
}))

import {
  assessDeepDiveEligibility,
  haikuLockWinnersAndBadges,
  lockWinnersAndBadges,
  miniEnrichSelectedCandidates,
} from './ai-selector.js'

function candidate(overrides = {}) {
  return {
    id: 'prod-1',
    title: 'Travel stroller',
    description: 'Lightweight stroller for flights',
    source: 'Amazon',
    price: '$199.99',
    numericPrice: 199.99,
    rating: 4.7,
    reviewCount: 342,
    link: 'https://example.com/stroller',
    image: 'https://example.com/stroller.jpg',
    matchSignals: { titleMatches: 1, supportMatches: 1, detailMatches: 1 },
    ...overrides,
  }
}

function pool(count = 4) {
  return {
    query: 'travel stroller',
    details: 'compact enough for flights',
    candidates: Array.from({ length: count }, (_, index) => candidate({
      id: `prod-${index + 1}`,
      title: `Travel stroller ${index + 1}`,
      numericPrice: 100 + index,
    })),
  }
}

function mockSelection(picks, extra = {}) {
  anthropicMocks.create.mockResolvedValue({
    content: [{
      type: 'tool_use',
      name: 'submit_shortlist',
      input: {
        picks: picks.map((pick) => ({ brand: '', role: 'core', confidence: 'high', ...pick })),
        specific_brand: false,
        ...extra,
      },
    }],
    usage: { input_tokens: 12, output_tokens: 4 },
  })
}

describe('AI selection contracts', () => {
  beforeEach(() => {
    anthropicMocks.create.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => vi.restoreAllMocks())

  it('maps server-owned candidate indices to IDs and enforces the requested cap', async () => {
    mockSelection([{ index: 3, brand: 'Orbit' }, { index: 1, brand: 'Orbit' }, { index: 2 }])

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 2,
      candidatePool: pool(3),
    })

    expect(result.lockedIds).toEqual(['prod-3', 'prod-1'])
    expect(result.brandById).toEqual({ 'prod-3': 'Orbit', 'prod-1': 'Orbit' })
    expect(anthropicMocks.create).toHaveBeenCalledTimes(1)
    expect(anthropicMocks.create.mock.calls[0][0].tools[0]).toMatchObject({
      name: 'submit_shortlist',
      strict: true,
      input_schema: {
        properties: {
          suggested_query: { maxLength: 80 },
        },
      },
    })
  })

  it('returns the complete fit frontier in lowest-price mode for downstream deterministic ranking', async () => {
    mockSelection([{ index: 1 }, { index: 2 }, { index: 3 }])

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 2,
      candidatePool: pool(3),
      rankingPreference: 'lowest_price',
    })

    expect(result.lockedIds).toEqual(['prod-1', 'prod-2', 'prod-3'])
  })

  it('drops duplicate and out-of-pool indices without changing valid order', async () => {
    mockSelection([{ index: 1 }, { index: 1 }, { index: 99 }, { index: 2 }])

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 4,
      candidatePool: pool(3),
    })

    expect(result.lockedIds).toEqual(['prod-1', 'prod-2'])
  })

  it('accepts only high-confidence core picks and reserves', async () => {
    mockSelection([
      { index: 1 },
      { index: 2, confidence: 'medium' },
      { index: 3, role: 'alternative' },
      { index: 4, role: 'alternative', confidence: 'low' },
    ])

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 8,
      candidatePool: pool(8),
      allowOptionalAlternatives: true,
    })

    expect(result).toMatchObject({
      lockedIds: ['prod-1', 'prod-3'],
      coreIds: ['prod-1'],
      alternativeIds: ['prod-3'],
    })
  })

  it('returns an empty lock when the provider omits tool output', async () => {
    anthropicMocks.create.mockResolvedValue({
      content: [{ type: 'text', text: 'No tool call' }],
      usage: { input_tokens: 12, output_tokens: 4 },
    })

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 3,
      candidatePool: pool(3),
    })

    expect(result.lockedIds).toEqual([])
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 4 })
  })

  it('returns a partial selection and its better-search suggestion without inventing IDs', async () => {
    mockSelection([{ index: 2 }], { suggested_query: 'lightweight carry-on stroller under $200' })

    const result = await haikuLockWinnersAndBadges({
      apiKey: 'claude-key',
      finalResultLimit: 6,
      candidatePool: pool(4),
    })

    expect(result).toMatchObject({
      lockedIds: ['prod-2'],
      suggestedQuery: 'lightweight carry-on stroller under $200',
    })
    expect(anthropicMocks.create.mock.calls[0][0].messages[0].content).toContain(
      'combines the product query with every explicit must-have from the user context',
    )
  })

  it('uses Terra as the primary blocking selector with low reasoning and strict output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          picks: [
            { index: 2, brand: 'Orbit', role: 'core', confidence: 'high' },
            { index: 1, brand: 'Orbit', role: 'alternative', confidence: 'high' },
          ],
          suggested_query: '',
          specific_brand: false,
        }),
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          total_tokens: 120,
          output_tokens_details: { reasoning_tokens: 5 },
        },
      }),
    })

    const result = await lockWinnersAndBadges({
      candidatePool: pool(3),
      finalResultLimit: 3,
      openAiApiKey: 'openai-key',
      claudeApiKey: 'claude-key',
      allowOptionalAlternatives: true,
    }, fetchMock)

    expect(result).toMatchObject({
      model: 'gpt-5.6-terra',
      provider: 'openai',
      fallbackUsed: false,
      lockedIds: ['prod-2', 'prod-1'],
      coreIds: ['prod-2'],
      alternativeIds: ['prod-1'],
    })
    expect(anthropicMocks.create).not.toHaveBeenCalled()
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request).toMatchObject({
      model: 'gpt-5.6-terra',
      store: false,
      max_output_tokens: 4096,
      reasoning: { effort: 'low' },
      text: {
        format: {
          type: 'json_schema',
          name: 'submit_shortlist',
          strict: true,
        },
      },
    })
  })

  it('falls back to Haiku when the primary OpenAI selector fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'provider unavailable',
    })
    mockSelection([{ index: 3 }])

    const result = await lockWinnersAndBadges({
      candidatePool: pool(3),
      finalResultLimit: 3,
      openAiApiKey: 'openai-key',
      claudeApiKey: 'claude-key',
    }, fetchMock)

    expect(result).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
      primaryModel: 'gpt-5.6-terra',
      fallbackUsed: true,
      lockedIds: ['prod-3'],
    })
    expect(anthropicMocks.create).toHaveBeenCalledTimes(1)
  })

  it('attaches mini enrichment to the selected candidate and preserves provider feature evidence', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          enriched: [{ candidate_id: 'prod-1', fit_reason: 'Easy to carry.', caveat: 'Small basket.' }],
          improve_picks_suggestions: [
            { label: 'Lower price', feedback: 'Find lower-priced airport strollers.' },
            { label: 'Lighter', feedback: 'Find a lighter carry option.' },
            { label: 'Storage', feedback: 'Find more storage.' },
          ],
        }),
      }),
    })

    const result = await miniEnrichSelectedCandidates({
      apiKey: 'openai-key',
      lockedIds: ['prod-1'],
      candidatePool: { query: 'stroller', details: '', candidates: [candidate({ feature_bullets: ['One-hand fold'] })] },
    }, fetchMock)

    expect(result.enriched).toEqual([expect.objectContaining({
      candidate_id: 'prod-1',
      fit_reason: 'Easy to carry.',
      feature_bullets: ['One-hand fold'],
    })])
    expect(result.preservedOrder).toBe(true)
  })

  it('shows price comparison only for products that pass the deterministic value gate', async () => {
    const hidden = await assessDeepDiveEligibility({
      lockedIds: ['prod-1'],
      candidatePool: { query: 'usb cable', candidates: [candidate({ title: 'USB-C cable 3 pack', numericPrice: 12.99 })] },
    })
    const shown = await assessDeepDiveEligibility({
      lockedIds: ['prod-1'],
      candidatePool: { query: 'sony headphones', candidates: [candidate({ title: 'Sony WH-1000XM5 Headphones', numericPrice: 299.99 })] },
    })

    expect(hidden.decisions[0]).toMatchObject({ recommendation: 'hide', reason: 'generic_low_value' })
    expect(shown.decisions[0]).toMatchObject({ recommendation: 'show', mode: 'offers' })
  })
})
