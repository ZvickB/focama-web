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
          helper_text: 'A little detail helps us narrow faster.',
          follow_up_placeholder: 'Anything specific to avoid or prioritize?',
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
      helperText: 'A little detail helps us narrow faster.',
      followUpPlaceholder: 'Anything specific to avoid or prioritize?',
      usage: {
        inputTokens: 78,
        outputTokens: 24,
        totalTokens: 102,
        reasoningTokens: 10,
      },
    })
  })
})
