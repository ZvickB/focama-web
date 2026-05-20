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

import { generateRefinementPrompt } from './refinement-assistant.js'

describe('refinement assistant', () => {
  it('uses Haiku first for structured prompt text and chip suggestions', async () => {
    anthropicMocks.create.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            prompt: 'What matters most: budget, portability, or comfort?',
            refinement_suggestions: [
              { label: 'Lower price', prompt: 'I want to keep the price low without losing the basics' },
              { label: 'Easy travel', prompt: 'I need something that is simple to carry while traveling' },
              { label: 'Comfort first', prompt: 'Comfort matters most for longer use' },
            ],
          }),
        },
      ],
      usage: {
        input_tokens: 55,
        output_tokens: 28,
      },
    })
    const fetchMock = vi.fn()

    const result = await generateRefinementPrompt(
      {
        productQuery: 'wireless headphones',
        anthropicApiKey: 'claude-key',
        openAiApiKey: 'openai-key',
      },
      fetchMock,
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(anthropicMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 384,
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        prompt: 'What matters most: budget, portability, or comfort?',
        refinementSuggestions: [
          { label: 'Lower price', prompt: 'I want to keep the price low without losing the basics' },
          { label: 'Easy travel', prompt: 'I need something that is simple to carry while traveling' },
          { label: 'Comfort first', prompt: 'Comfort matters most for longer use' },
        ],
        usage: {
          inputTokens: 55,
          outputTokens: 28,
          totalTokens: 83,
          reasoningTokens: 0,
        },
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        fallbackFrom: null,
      }),
    )
  })

  it('falls back to OpenAI mini when Haiku fails', async () => {
    anthropicMocks.create.mockRejectedValueOnce(new Error('temporary claude outage'))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          prompt: 'What matters most here: price, size, or durability?',
          refinement_suggestions: [
            { label: 'Under $100', prompt: 'I want to stay under $100' },
            { label: 'Compact size', prompt: 'I need something compact and easy to store' },
            { label: 'Long lasting', prompt: 'Durability matters more than extra features' },
          ],
        }),
      }),
    })

    const result = await generateRefinementPrompt(
      {
        productQuery: 'coffee grinder',
        anthropicApiKey: 'claude-key',
        openAiApiKey: 'openai-key',
      },
      fetchMock,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual(
      expect.objectContaining({
        prompt: 'What matters most here: price, size, or durability?',
        provider: 'openai',
        model: 'gpt-5-mini',
        fallbackFrom: 'claude-haiku-4-5-20251001',
      }),
    )
  })

  it('returns structured prompt text plus OpenAI usage metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: {
          input_tokens: 78,
          output_tokens: 24,
          total_tokens: 102,
          output_tokens_details: {
            reasoning_tokens: 10,
          },
        },
        output_text: JSON.stringify({
          prompt: 'What matters most here: portability, comfort, or battery life?',
          refinement_suggestions: [
            { label: 'Travel use', prompt: 'I need something that works well for travel and is easy to carry' },
            { label: 'Long battery', prompt: 'Battery life is important — I want it to last a full day' },
            { label: 'Comfort fit', prompt: 'Comfort is a priority for me, especially for extended use' },
          ],
        }),
      }),
    })

    const result = await generateRefinementPrompt(
      {
        productQuery: 'wireless headphones',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result).toEqual({
      prompt: 'What matters most here: portability, comfort, or battery life?',
      helperText: 'Or write whatever is important to you. Feel free to write in natural language.',
      followUpPlaceholder: 'Example: I want something lightweight for daily travel, under $200, and easy to clean.',
      refinementSuggestions: [
        { label: 'Travel use', prompt: 'I need something that works well for travel and is easy to carry' },
        { label: 'Long battery', prompt: 'Battery life is important — I want it to last a full day' },
        { label: 'Comfort fit', prompt: 'Comfort is a priority for me, especially for extended use' },
      ],
      usage: {
        inputTokens: 78,
        outputTokens: 24,
        totalTokens: 102,
        reasoningTokens: 10,
      },
      provider: 'openai',
      model: 'gpt-5-mini',
      fallbackFrom: null,
      queryFraming: {
        version: 1,
        layer: 'query_framing',
        query: 'wireless headphones',
        categoryHint: '',
        framingSummary: '',
        tradeoffAxes: [],
        refinementHints: [],
        generatedAt: expect.any(String),
      },
      queryFramingMode: 'question_fast',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      }),
    )

    const [, request] = fetchMock.mock.calls[0]
    const parsedBody = JSON.parse(request.body)

    expect(parsedBody.reasoning.effort).toBe('minimal')
    expect(parsedBody.text.format.name).toBe('question_fast')
    expect(parsedBody.text.format.schema.required).toEqual(['prompt', 'refinement_suggestions'])
    expect(parsedBody.text.format.schema.properties).not.toHaveProperty('tradeoff_axes')
  })

  it('clamps an overly long prompt before returning it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: {
          input_tokens: 80,
          output_tokens: 40,
          total_tokens: 120,
          output_tokens_details: {
            reasoning_tokens: 12,
          },
        },
        output_text: JSON.stringify({
          prompt: `What matters most for this pick if you want it for travel and also home use every day ${'x'.repeat(40)}`,
          refinement_suggestions: [
            { label: 'Daily use', prompt: 'I plan to use this every day so durability matters' },
            { label: 'Easy cleaning', prompt: 'I want something that is easy to clean after use' },
            { label: 'Under $200', prompt: 'My budget is under $200' },
          ],
        }),
      }),
    })

    const result = await generateRefinementPrompt(
      {
        productQuery: 'coffee grinder',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result.prompt.length).toBeLessThanOrEqual(140)
    expect(result.helperText).toBe('Or write whatever is important to you. Feel free to write in natural language.')
    expect(result.followUpPlaceholder).toBe('Example: I want something lightweight for daily travel, under $200, and easy to clean.')
    expect(result.refinementSuggestions).toEqual([
      { label: 'Daily use', prompt: 'I plan to use this every day so durability matters' },
      { label: 'Easy cleaning', prompt: 'I want something that is easy to clean after use' },
      { label: 'Under $200', prompt: 'My budget is under $200' },
    ])
    expect(result.queryFraming).toEqual(
      expect.objectContaining({
        layer: 'query_framing',
        query: 'coffee grinder',
      }),
    )
  })
})
