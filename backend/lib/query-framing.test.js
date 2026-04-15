import { describe, expect, it, vi } from 'vitest'

import { generateFramingFields, generateQuestionFast, generateQueryFraming } from './query-framing.js'

describe('query framing', () => {
  it('returns the follow-up question without asking for background framing fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: {
          input_tokens: 92,
          output_tokens: 44,
          total_tokens: 136,
          output_tokens_details: {
            reasoning_tokens: 16,
          },
        },
        output_text: JSON.stringify({
          prompt: 'What matters most here: airline carry-on size, one-hand fold, or lower price?',
        }),
      }),
    })

    const result = await generateQuestionFast(
      {
        productQuery: 'travel stroller',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result.prompt).toBe(
      'What matters most here: airline carry-on size, one-hand fold, or lower price?',
    )
    expect(result.usage).toEqual({
      inputTokens: 92,
      outputTokens: 44,
      totalTokens: 136,
      reasoningTokens: 16,
    })
    expect(result.generatedAt).toEqual(expect.any(String))

    const [, request] = fetchMock.mock.calls[0]
    const parsedBody = JSON.parse(request.body)

    expect(parsedBody.reasoning.effort).toBe('minimal')
    expect(parsedBody.text.format.name).toBe('question_fast')
    expect(parsedBody.text.format.schema.required).toEqual(['prompt'])
    expect(parsedBody.text.format.schema.properties).not.toHaveProperty('category_hint')
  })

  it('returns background framing fields without the follow-up question', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: {
          input_tokens: 94,
          output_tokens: 46,
          total_tokens: 140,
          output_tokens_details: {
            reasoning_tokens: 18,
          },
        },
        output_text: JSON.stringify({
          category_hint: 'compact stroller',
          framing_summary: 'Portability and fold size will likely matter more than brand here.',
          tradeoff_axes: ['weight', 'fold size', 'durability', 'price', 'storage'],
          refinement_hints: [
            'Ask whether airline carry-on fit matters.',
            'Ask whether one-hand fold matters.',
            'Ask about daily city use.',
            'Ask about budget.',
            'Ask about recline.',
          ],
        }),
      }),
    })

    const result = await generateFramingFields(
      {
        productQuery: 'travel stroller',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result.usage).toEqual({
      inputTokens: 94,
      outputTokens: 46,
      totalTokens: 140,
      reasoningTokens: 18,
    })
    expect(result.contract).toEqual({
      version: 1,
      layer: 'query_framing',
      query: 'travel stroller',
      categoryHint: 'compact stroller',
      framingSummary: 'Portability and fold size will likely matter more than brand here.',
      tradeoffAxes: ['weight', 'fold size', 'durability', 'price'],
      refinementHints: [
        'Ask whether airline carry-on fit matters.',
        'Ask whether one-hand fold matters.',
        'Ask about daily city use.',
        'Ask about budget.',
      ],
      generatedAt: expect.any(String),
    })

    const [, request] = fetchMock.mock.calls[0]
    const parsedBody = JSON.parse(request.body)

    expect(parsedBody.text.format.name).toBe('framing_fields')
    expect(parsedBody.text.format.schema.required).toEqual([
      'category_hint',
      'framing_summary',
      'tradeoff_axes',
      'refinement_hints',
    ])
    expect(parsedBody.text.format.schema.properties).not.toHaveProperty('prompt')
  })

  it('can still combine the question and framing fields for explicit background callers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          usage: {
            input_tokens: 40,
            output_tokens: 10,
            total_tokens: 50,
            output_tokens_details: {
              reasoning_tokens: 2,
            },
          },
          output_text: JSON.stringify({
            prompt: 'What matters most here: carry-on size, comfort, or price?',
          }),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          usage: {
            input_tokens: 50,
            output_tokens: 20,
            total_tokens: 70,
            output_tokens_details: {
              reasoning_tokens: 3,
            },
          },
          output_text: JSON.stringify({
            category_hint: 'compact stroller',
            framing_summary: 'Portability and comfort are likely ranking pivots.',
            tradeoff_axes: ['weight'],
            refinement_hints: ['Ask about carry-on fit.'],
          }),
        }),
      })

    const result = await generateQueryFraming(
      {
        productQuery: 'travel stroller',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.prompt).toBe('What matters most here: carry-on size, comfort, or price?')
    expect(result.usage.totalTokens).toBe(50)
    expect(result.framingFieldsUsage.totalTokens).toBe(70)
    expect(result.contract).toEqual(
      expect.objectContaining({
        query: 'travel stroller',
        categoryHint: 'compact stroller',
        tradeoffAxes: ['weight'],
      }),
    )
  })
})
