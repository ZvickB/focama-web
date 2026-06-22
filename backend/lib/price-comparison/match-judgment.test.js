import { describe, expect, it, vi } from 'vitest'
import { judgeSerperMatches } from './match-judgment.js'

const product = {
  candidate_id: 'B0CZEGH123',
  display_title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Black',
  match_identifier: {
    brand: 'Sony',
    model_number: 'WH-1000XM5',
    product_type: 'wireless headphones',
    attributes: {
      generation: null,
      size: null,
      capacity: null,
      color: 'Black',
      material: null,
      pack_count: null,
      condition: 'New',
    },
  },
  price: 399.99,
  currency: 'CAD',
}

function offer(overrides = {}) {
  return {
    provider: 'serper',
    provider_offer_id: 'offer-1',
    retailer: 'Best Buy',
    seller: null,
    sold_by_retailer: null,
    price: 349.99,
    shipping: null,
    currency: 'CAD',
    url: 'https://retailer.example/sony',
    title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Black',
    brand: null,
    condition: null,
    identifiers: {},
    attributes: {},
    ...overrides,
  }
}

function anthropicClientWithInput(input, usage = { input_tokens: 100, output_tokens: 24 }) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'tool_use', name: 'record_matches', input }],
        usage,
      }),
    },
  }
}

describe('judgeSerperMatches', () => {
  it('calls Haiku with a tool schema and returns high-confidence savings matches', async () => {
    const anthropicClient = anthropicClientWithInput({
      matches: [{
        offer_index: 0,
        is_match: true,
        confidence: 0.95,
        reason: 'Same brand, model, and color.',
      }],
    })

    const result = await judgeSerperMatches({
      product,
      offers: [offer()],
      apiKey: 'claude-key',
      anthropicClient,
    })

    expect(anthropicClient.messages.create).toHaveBeenCalledTimes(1)
    expect(anthropicClient.messages.create.mock.calls[0][0]).toEqual(expect.objectContaining({
      model: 'claude-haiku-4-5-20251001',
      tool_choice: { type: 'tool', name: 'record_matches' },
    }))
    expect(result).toEqual({
      model: 'claude-haiku-4-5-20251001',
      matches: [{
        offer_index: 0,
        is_match: true,
        confidence: 0.95,
        reason: 'Same brand, model, and color.',
        offer: offer(),
        savings: 50,
        savings_percent: 0.125,
      }],
      usage: {
        inputTokens: 100,
        outputTokens: 24,
      },
    })
  })

  it('filters below-threshold confidence and non-matches', async () => {
    const anthropicClient = anthropicClientWithInput({
      matches: [
        { offer_index: 0, is_match: true, confidence: 0.84, reason: 'Close but uncertain.' },
        { offer_index: 1, is_match: false, confidence: 0.99, reason: 'Different color.' },
        { offer_index: 2, is_match: true, confidence: 0.9, reason: 'Same model.' },
      ],
    })

    const result = await judgeSerperMatches({
      product,
      offers: [offer(), offer({ price: 300 }), offer({ provider_offer_id: 'offer-3', price: 320 })],
      apiKey: 'claude-key',
      anthropicClient,
    })

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].offer_index).toBe(2)
  })

  it('applies minimum dollar and percentage savings thresholds', async () => {
    const anthropicClient = anthropicClientWithInput({
      matches: [
        { offer_index: 0, is_match: true, confidence: 0.95, reason: 'Same model.' },
        { offer_index: 1, is_match: true, confidence: 0.95, reason: 'Same model.' },
        { offer_index: 2, is_match: true, confidence: 0.95, reason: 'Same model.' },
      ],
    })

    const result = await judgeSerperMatches({
      product: { ...product, price: 100 },
      offers: [
        offer({ price: 93 }), // $7 fails dollar threshold
        offer({ price: 92.5 }), // 7.5% fails percent threshold
        offer({ price: 90 }), // passes both
      ],
      apiKey: 'claude-key',
      anthropicClient,
    })

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]).toEqual(expect.objectContaining({
      offer_index: 2,
      savings: 10,
      savings_percent: 0.1,
    }))
  })

  it('rejects implausibly extreme savings even when Haiku approves the match', async () => {
    const anthropicClient = anthropicClientWithInput({
      matches: [{ offer_index: 0, is_match: true, confidence: 0.99, reason: 'Claims same model.' }],
    })

    const result = await judgeSerperMatches({
      product: { ...product, price: 209 },
      offers: [offer({ price: 9.99 })],
      apiKey: 'claude-key',
      anthropicClient,
    })

    expect(result.matches).toEqual([])
  })

  it('does not surface savings when offer currency differs from the source product currency', async () => {
    const anthropicClient = anthropicClientWithInput({
      matches: [{ offer_index: 0, is_match: true, confidence: 0.95, reason: 'Same model.' }],
    })

    const result = await judgeSerperMatches({
      product,
      offers: [offer({ currency: 'USD', price: 249.99 })],
      apiKey: 'claude-key',
      anthropicClient,
    })

    expect(result.matches).toEqual([])
  })

  it('handles unexpected Haiku shapes without surfacing matches', async () => {
    const anthropicClient = anthropicClientWithInput({ not_matches: [] }, { input_tokens: 7, output_tokens: 3 })

    const result = await judgeSerperMatches({
      product,
      offers: [offer()],
      apiKey: 'claude-key',
      anthropicClient,
    })

    expect(result.matches).toEqual([])
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 3 })
  })

  it('parses text JSON fallback if a mock or provider response omits tool_use content', async () => {
    const anthropicClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              matches: [{ offer_index: 0, is_match: true, confidence: 0.9, reason: 'Same model.' }],
            }),
          }],
          usage: null,
        }),
      },
    }

    const result = await judgeSerperMatches({
      product,
      offers: [offer({ price: 300 })],
      apiKey: 'claude-key',
      anthropicClient,
    })

    expect(result.matches).toHaveLength(1)
    expect(result.usage).toBeNull()
  })

  it('skips model calls when there are no offers', async () => {
    const anthropicClient = anthropicClientWithInput({ matches: [] })

    const result = await judgeSerperMatches({
      product,
      offers: [],
      apiKey: 'claude-key',
      anthropicClient,
    })

    expect(anthropicClient.messages.create).not.toHaveBeenCalled()
    expect(result).toEqual({
      model: 'claude-haiku-4-5-20251001',
      matches: [],
      usage: null,
    })
  })
})
