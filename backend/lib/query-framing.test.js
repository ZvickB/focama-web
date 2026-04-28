import { describe, expect, it, vi } from 'vitest'

import { generateQuestionFast } from './query-framing.js'

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

})
