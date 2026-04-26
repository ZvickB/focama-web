import { describe, expect, it, vi } from 'vitest'

import { generateRetryAdvice } from './retry-advice.js'

describe('retry advice', () => {
  it('returns structured advice with an editable suggested query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: {
          input_tokens: 90,
          output_tokens: 30,
          total_tokens: 120,
          output_tokens_details: {
            reasoning_tokens: 8,
          },
        },
        output_text: JSON.stringify({
          recommendation: 'new_search',
          suggested_query: 'compact city stroller under 18 pounds',
          rationale: 'The feedback points to portability, so a narrower search should help.',
        }),
      }),
    })

    const result = await generateRetryAdvice(
      {
        productQuery: 'stroller',
        followUpNotes: 'comfort matters most',
        rejectionFeedback: 'Still too bulky for city travel.',
        shortlist: [
          { title: 'Full-size stroller' },
          { title: 'Travel stroller' },
        ],
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result).toEqual({
      recommendation: 'new_search',
      suggestedQuery: 'compact city stroller under 18 pounds',
      rationale: 'The feedback points to portability, so a narrower search should help.',
      usage: {
        inputTokens: 90,
        outputTokens: 30,
        totalTokens: 120,
        reasoningTokens: 8,
      },
      generatedAt: expect.any(String),
    })

    const [, request] = fetchMock.mock.calls[0]
    const parsedBody = JSON.parse(request.body)

    expect(parsedBody.reasoning.effort).toBe('minimal')
    expect(parsedBody.text.format.name).toBe('retry_advice')
    expect(parsedBody.text.format.schema.required).toEqual([
      'recommendation',
      'suggested_query',
      'rationale',
    ])
    expect(parsedBody.input[1].content).toContain('User feedback: Still too bulky for city travel.')
    expect(parsedBody.input[1].content).toContain('1. Full-size stroller')
  })
})
