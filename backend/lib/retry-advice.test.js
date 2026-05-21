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
          rationale: 'Focuses the search on lighter city strollers that fit daily travel better.',
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
      rationale: 'Focuses the search on lighter city strollers that fit daily travel better.',
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
    expect(parsedBody.text.format.schema.properties.recommendation.enum).toEqual(['new_search'])
    expect(parsedBody.text.format.schema.required).toEqual([
      'recommendation',
      'suggested_query',
      'rationale',
    ])
    expect(parsedBody.text.format.schema.properties.suggested_query.maxLength).toBe(80)
    expect(parsedBody.input[1].content).toContain('Always return recommendation as new_search.')
    expect(parsedBody.input[1].content).toContain('The suggested_query must be 80 characters or fewer')
    expect(parsedBody.input[1].content).toContain('Preserve accumulated must-have constraints')
    expect(parsedBody.input[1].content).toContain('Only drop or replace a previous constraint when the latest feedback clearly says')
    expect(parsedBody.input[1].content).toContain('keep the earlier requirements and add the new one')
    expect(parsedBody.input[1].content).toContain('Write rationale as exactly 1 sentence of natural UI copy.')
    expect(parsedBody.input[1].content).toContain('User feedback: Still too bulky for city travel.')
    expect(parsedBody.input[1].content).toContain('1. Full-size stroller')
  })

  it('tells the model to preserve earlier constraints while allowing explicit user changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          recommendation: 'new_search',
          suggested_query: 'Yupik dairy-free white chocolate chips',
          rationale: 'Keeps the brand and product type while adding the dietary need.',
        }),
      }),
    })

    await generateRetryAdvice(
      {
        productQuery: 'yupick white chocolate chips',
        followUpNotes: 'non dairy',
        rejectionFeedback: 'i wanted Yupik brand and white chocolate chips',
        shortlist: [
          { title: 'Yupik Organic Dark Chocolate Chips, 70% Cacao, 500 g' },
          { title: 'King David Vegan Lactose-Free White Chocolate Flavored Chips' },
        ],
        apiKey: 'test-key',
      },
      fetchMock,
    )

    const [, request] = fetchMock.mock.calls[0]
    const prompt = JSON.parse(request.body).input[1].content

    expect(prompt).toContain('Original search: yupick white chocolate chips')
    expect(prompt).toContain('Follow-up notes: non dairy')
    expect(prompt).toContain('User feedback: i wanted Yupik brand and white chocolate chips')
    expect(prompt).toContain('Only drop or replace a previous constraint when the latest feedback clearly says')
  })

  it('throws a useful error when OpenAI rejects the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'rate limit exceeded',
    })

    await expect(generateRetryAdvice(
      {
        productQuery: 'stroller',
        rejectionFeedback: 'Too bulky.',
        apiKey: 'test-key',
      },
      fetchMock,
    )).rejects.toThrow('OpenAI retry_advice failed: rate limit exceeded')
  })

  it('throws when OpenAI returns malformed structured output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: '{not valid json',
      }),
    })

    await expect(generateRetryAdvice(
      {
        productQuery: 'stroller',
        rejectionFeedback: 'Too bulky.',
        apiKey: 'test-key',
      },
      fetchMock,
    )).rejects.toThrow()
  })

  it('throws when OpenAI returns no structured output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: '   ',
        output: [
          {
            content: [
              { text: '   ' },
            ],
          },
        ],
      }),
    })

    await expect(generateRetryAdvice(
      {
        productQuery: 'stroller',
        rejectionFeedback: 'Too bulky.',
        apiKey: 'test-key',
      },
      fetchMock,
    )).rejects.toThrow('OpenAI retry_advice returned no structured output.')
  })

  it('normalizes model output from response content chunks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: {
          input_tokens: 'invalid',
          output_tokens: 12,
          total_tokens: 34,
          output_tokens_details: {
            reasoning_tokens: 2,
          },
        },
        output: [
          {
            content: [
              {
                text: JSON.stringify({
                  recommendation: 'new_search',
                  suggested_query: '  lightweight   stroller   for   city  travel  ',
                  rationale: '  Narrows   the search to lighter strollers for daily city trips.  ',
                }),
              },
            ],
          },
        ],
      }),
    })

    const result = await generateRetryAdvice(
      {
        productQuery: '  stroller  ',
        rejectionFeedback: 'Too bulky.',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result).toMatchObject({
      recommendation: 'new_search',
      suggestedQuery: 'lightweight stroller for city travel',
      rationale: 'Narrows the search to lighter strollers for daily city trips.',
      usage: {
        inputTokens: 0,
        outputTokens: 12,
        totalTokens: 34,
        reasoningTokens: 2,
      },
    })
  })

  it('clamps overlong model suggested queries to the product query limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          recommendation: 'new_search',
          suggested_query: `compact city stroller ${'with extra lightweight foldable travel storage '.repeat(4)}`,
          rationale: 'Narrows the search to lighter strollers for daily city trips.',
        }),
      }),
    })

    const result = await generateRetryAdvice(
      {
        productQuery: 'stroller',
        rejectionFeedback: 'Too bulky.',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result.suggestedQuery.length).toBeLessThanOrEqual(80)
    expect(result.suggestedQuery).toMatch(/^compact city stroller/)
  })

  it('falls back to the original query and default rationale when model fields are empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          recommendation: 'new_search',
          suggested_query: '   ',
          rationale: '   ',
        }),
      }),
    })

    const result = await generateRetryAdvice(
      {
        productQuery: '  travel   stroller  ',
        rejectionFeedback: 'Too bulky.',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result).toMatchObject({
      recommendation: 'new_search',
      suggestedQuery: 'travel stroller',
      rationale: 'Focuses the search more closely on what you want.',
      usage: null,
    })
  })

  it('normalizes shortlist context before sending it to OpenAI', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          recommendation: 'new_search',
          suggested_query: 'compact stroller',
          rationale: 'Focuses on compact options.',
        }),
      }),
    })

    await generateRetryAdvice(
      {
        productQuery: 'stroller',
        followUpNotes: '  folds   fast  ',
        rejectionFeedback: '  too   bulky  ',
        shortlist: [
          { title: '  First   stroller  ' },
          { title: '' },
          { title: 'Second stroller'.repeat(20) },
          { title: 'Third stroller' },
          { title: 'Fourth stroller' },
          { title: 'Fifth stroller' },
          { title: 'Sixth stroller' },
          { title: 'Seventh stroller should not be included' },
        ],
        apiKey: 'test-key',
      },
      fetchMock,
    )

    const [, request] = fetchMock.mock.calls[0]
    const prompt = JSON.parse(request.body).input[1].content

    expect(prompt).toContain('Follow-up notes: folds fast')
    expect(prompt).toContain('User feedback: too bulky')
    expect(prompt).toContain('1. First stroller')
    expect(prompt).toContain('6. Sixth stroller')
    expect(prompt).not.toContain('Seventh stroller should not be included')
    expect(prompt).not.toContain('2. \n')
  })
})
