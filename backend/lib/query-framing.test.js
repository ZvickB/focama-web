import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { generateQuestionFast } from './query-framing.js'

describe('query framing', () => {
  beforeEach(() => {
    anthropicMocks.create.mockReset()
  })

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
          refinement_suggestions: [
            { label: 'Easy cleaning', prompt: 'I want something that cleans up quickly after use' },
            { label: 'Small batches', prompt: 'I only need to make small quantities at a time' },
            { label: 'Quiet operation', prompt: 'I need something that runs quietly at home' },
          ],
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
      { label: 'Easy cleaning', prompt: 'I want something that cleans up quickly after use' },
      { label: 'Small batches', prompt: 'I only need to make small quantities at a time' },
      { label: 'Quiet operation', prompt: 'I need something that runs quietly at home' },
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
        type: 'object',
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 22 },
          prompt: { type: 'string', minLength: 1 },
        },
        required: ['label', 'prompt'],
        additionalProperties: false,
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
                    { label: '  Easy   storage ', prompt: 'I have limited space and need something compact' },
                    { label: 'Quiet operation', prompt: 'I need something that runs quietly' },
                    { label: 'This label is too long to fit', prompt: 'Some prompt' },
                    'a plain string that is now ignored',
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
    expect(result.refinementSuggestions).toEqual([
      { label: 'Easy storage', prompt: 'I have limited space and need something compact' },
      { label: 'Quiet operation', prompt: 'I need something that runs quietly' },
    ])
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

  it('uses Haiku when claudeApiKey is provided', async () => {
    anthropicMocks.create.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            prompt: 'What matters most: portability, battery life, or noise cancellation?',
            refinement_suggestions: [
              { label: 'Portable', prompt: 'I want something easy to carry around' },
              { label: 'Long battery', prompt: 'Battery life is my top priority' },
              { label: 'Noise cancel', prompt: 'I need strong noise cancellation for focus' },
            ],
          }),
        },
      ],
      usage: { input_tokens: 50, output_tokens: 30 },
    })

    const fetchMock = vi.fn()

    const result = await generateQuestionFast(
      {
        productQuery: 'wireless headphones',
        apiKey: 'openai-key',
        claudeApiKey: 'claude-key',
      },
      fetchMock,
    )

    expect(anthropicMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.prompt).toBe('What matters most: portability, battery life, or noise cancellation?')
    expect(result.refinementSuggestions).toHaveLength(3)
    expect(result.usage).toEqual({ inputTokens: 50, outputTokens: 30, totalTokens: 80, reasoningTokens: 0 })
  })

  it('falls back to OpenAI when Haiku fails', async () => {
    anthropicMocks.create.mockRejectedValue(new Error('Haiku unavailable'))

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: { input_tokens: 60, output_tokens: 20, total_tokens: 80, output_tokens_details: { reasoning_tokens: 0 } },
        output_text: JSON.stringify({
          prompt: 'What is your primary use case?',
          refinement_suggestions: [
            { label: 'Travel', prompt: 'I need this for travel' },
            { label: 'Office', prompt: 'I will use it in the office' },
            { label: 'Gym', prompt: 'I plan to use it at the gym' },
          ],
        }),
      }),
    })

    const result = await generateQuestionFast(
      {
        productQuery: 'earbuds',
        apiKey: 'openai-key',
        claudeApiKey: 'claude-key',
      },
      fetchMock,
    )

    expect(anthropicMocks.create).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.prompt).toBe('What is your primary use case?')
  })
})
