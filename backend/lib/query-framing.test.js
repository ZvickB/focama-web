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
          refinement_suggestions: ['Easy cleaning', 'Small batches', 'Quiet operation'],
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
    expect(result.refinementSuggestions).toEqual([
      'Easy cleaning',
      'Small batches',
      'Quiet operation',
    ])
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
    expect(parsedBody.text.format.schema.required).toEqual(['prompt', 'refinement_suggestions'])
    expect(parsedBody.text.format.schema.properties.refinement_suggestions).toEqual({
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 22,
      },
    })
    expect(parsedBody.text.format.schema.properties).not.toHaveProperty('category_hint')
    expect(parsedBody.input[1].content).toContain('exactly 3 short refinement chip labels')
    expect(parsedBody.input[1].content).toContain('22 characters or fewer')
  })

  it('normalizes and clamps model prompts from response content chunks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: {
          input_tokens: 'invalid',
          output_tokens: 12,
          total_tokens: 30,
          output_tokens_details: {
            reasoning_tokens: 4,
          },
        },
        output: [
          {
            content: [
              {
                text: JSON.stringify({
                  prompt: `  What   matters   most if you want this for travel, daily use, and tight storage ${'x'.repeat(80)}  `,
                  refinement_suggestions: [
                    '  Easy   storage ',
                    'Quiet operation',
                    'This label is too long to fit',
                    { label: 'ignored' },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    })

    const result = await generateQuestionFast(
      {
        productQuery: 'folding bike',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result.prompt.length).toBeLessThanOrEqual(140)
    expect(result.prompt).toMatch(/^What matters most if you want this for travel, daily use/)
    expect(result.prompt).not.toContain('  ')
    expect(result.refinementSuggestions).toEqual(['Easy storage', 'Quiet operation'])
    expect(result.usage).toEqual({
      inputTokens: 0,
      outputTokens: 12,
      totalTokens: 30,
      reasoningTokens: 4,
    })
  })

  it('throws a useful error when OpenAI rejects the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'rate limit exceeded',
    })

    await expect(generateQuestionFast(
      {
        productQuery: 'travel stroller',
        apiKey: 'test-key',
      },
      fetchMock,
    )).rejects.toThrow('OpenAI question_fast failed: rate limit exceeded')
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

    await expect(generateQuestionFast(
      {
        productQuery: 'travel stroller',
        apiKey: 'test-key',
      },
      fetchMock,
    )).rejects.toThrow('OpenAI question_fast returned no structured output.')
  })

  it('emits debug events when malformed structured output cannot be parsed', async () => {
    const onEvent = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: '{not valid json',
      }),
    })

    await expect(generateQuestionFast(
      {
        productQuery: 'travel stroller',
        apiKey: 'test-key',
        debugContext: { onEvent },
      },
      fetchMock,
    )).rejects.toThrow()

    expect(onEvent).toHaveBeenCalledWith(
      'query_framing_openai_parse_failed',
      expect.objectContaining({
        schemaName: 'question_fast',
        outputPreview: '{not valid json',
      }),
    )
  })
})
