import { describe, expect, it, vi } from 'vitest'

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

import { generateQuestionFast, generateQuestionFastHaiku } from './query-framing.js'

describe('query framing', () => {
  it('returns the follow-up question and chip labels from Haiku JSON', async () => {
    anthropicMocks.create.mockResolvedValueOnce({
      id: 'msg_test',
      content: [
        {
          type: 'text',
          text: 'Here is the JSON:\n{"prompt":"What matters most: budget, size, or comfort?","alternate_prompt":"Where and how often will you use it?","refinement_suggestions":[{"label":"Lower price","prompt":"I want the lowest reasonable price"},{"label":"Small size","prompt":"I need something compact"},{"label":"Comfort fit","prompt":"Comfort matters most"}]}',
        },
      ],
      usage: {
        input_tokens: 72,
        output_tokens: 31,
      },
    })

    const result = await generateQuestionFastHaiku({
      productQuery: 'travel stroller',
      apiKey: 'claude-key',
    })

    expect(anthropicMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 384,
        system: expect.stringContaining('Return only valid JSON'),
      }),
    )
    expect(result).toEqual({
      prompt: 'What matters most: budget, size, or comfort?',
      alternatePrompt: 'Where and how often will you use it?',
      alternateRefinementSuggestions: [],
      refinementSuggestions: [
        { label: 'Lower price', prompt: 'I want the lowest reasonable price' },
        { label: 'Small size', prompt: 'I need something compact' },
        { label: 'Comfort fit', prompt: 'Comfort matters most' },
      ],
      usage: {
        inputTokens: 72,
        outputTokens: 31,
        totalTokens: 103,
        reasoningTokens: 0,
      },
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
      generatedAt: expect.any(String),
    })
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
          alternate_prompt: 'Is there anything you want to avoid?',
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
    expect(result.alternatePrompt).toBe('Is there anything you want to avoid?')
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

    expect(parsedBody.reasoning.effort).toBe('low')
    expect(parsedBody.text.format.name).toBe('question_fast')
    expect(parsedBody.text.format.schema.required).toEqual([
      'prompt',
      'alternate_prompt',
      'refinement_suggestions',
      'alternate_refinement_suggestions',
    ])
    expect(parsedBody.text.format.schema.properties.refinement_suggestions).toEqual(expect.objectContaining({
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 30 },
          prompt: { type: 'string', minLength: 1 },
        },
        required: ['label', 'prompt'],
        additionalProperties: false,
      },
    }))
    expect(parsedBody.text.format.schema.properties).not.toHaveProperty('category_hint')
    expect(parsedBody.input[1].content).toContain('two short follow-up questions')
    expect(parsedBody.input[1].content).toContain('exactly 4 mutually exclusive answer options')
    expect(parsedBody.input[1].content).toContain('directly and grammatically answer')
    expect(parsedBody.input[1].content).toContain('multiple-choice, not yes/no')
    expect(parsedBody.input[1].content).toContain('30 characters or fewer')
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
                  alternate_prompt: `  What   would make this a poor fit ${'y'.repeat(130)}  `,
                  refinement_suggestions: [
                    { label: '  Easy   storage ', prompt: 'I have limited space and need something compact' },
                    { label: 'Quiet operation', prompt: 'I need something that runs quietly' },
                    { label: 'This label is definitely too long to fit', prompt: 'Some prompt' },
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
    expect(result.alternatePrompt.length).toBeLessThanOrEqual(140)
    expect(result.alternatePrompt).not.toContain('  ')
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
})
