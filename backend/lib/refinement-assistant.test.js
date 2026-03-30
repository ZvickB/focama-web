import { describe, expect, it, vi } from 'vitest'

import { generateRefinementPrompt } from './refinement-assistant.js'

describe('refinement assistant', () => {
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
      helperText: 'Add the one detail that matters most and we will narrow faster.',
      followUpPlaceholder: 'Examples: budget, size, comfort, must-have, or what to avoid.',
      usage: {
        inputTokens: 78,
        outputTokens: 24,
        totalTokens: 102,
        reasoningTokens: 10,
      },
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
    expect(parsedBody.text.format.schema.properties.prompt.maxLength).toBe(90)
    expect(parsedBody.text.format.schema.required).toEqual(['prompt'])
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

    expect(result.prompt.length).toBeLessThanOrEqual(90)
    expect(result.helperText).toBe('Add the one detail that matters most and we will narrow faster.')
    expect(result.followUpPlaceholder).toBe('Examples: budget, size, comfort, must-have, or what to avoid.')
  })
})
