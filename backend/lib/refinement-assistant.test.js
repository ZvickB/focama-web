import { beforeEach, describe, expect, it, vi } from 'vitest'

const anthropicMocks = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function Anthropic() {
    return { messages: { create: anthropicMocks.create } }
  }),
}))

import { generateRefinementPrompt } from './refinement-assistant.js'

const modelAnswer = {
  prompt: 'What matters most: budget, portability, or comfort?',
  alternate_prompt: 'Where will you use it most?',
  refinement_suggestions: [
    { label: 'Lower price', prompt: 'Keep the price low' },
    { label: 'Easy travel', prompt: 'Make it easy to carry' },
    { label: 'Comfort first', prompt: 'Prioritize comfort' },
  ],
  alternate_refinement_suggestions: [
    { label: 'At home', prompt: 'Mostly at home' },
    { label: 'At work', prompt: 'Mostly at work' },
    { label: 'Traveling', prompt: 'Mostly while traveling' },
  ],
}

describe('refinement assistant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns Luna structured primary and alternate questions with a neutral answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: JSON.stringify(modelAnswer) }),
    })

    const result = await generateRefinementPrompt({
      productQuery: 'wireless headphones',
      anthropicApiKey: 'claude-key',
      openAiApiKey: 'openai-key',
    }, fetchMock)

    expect(result).toMatchObject({
      prompt: modelAnswer.prompt,
      alternatePrompt: modelAnswer.alternate_prompt,
      provider: 'openai',
      model: 'gpt-5.6-luna',
    })
    expect(result.answerOptions).toEqual([
      ...modelAnswer.refinement_suggestions,
      { label: 'No preference', prompt: 'I do not have a preference here.' },
    ])
    expect(anthropicMocks.create).not.toHaveBeenCalled()
  })

  it('falls back to Haiku when Luna transport fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, text: async () => 'temporary outage' })
    anthropicMocks.create.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(modelAnswer) }],
      usage: { input_tokens: 55, output_tokens: 28 },
    })

    const result = await generateRefinementPrompt({
      productQuery: 'coffee grinder',
      anthropicApiKey: 'claude-key',
      openAiApiKey: 'openai-key',
    }, fetchMock)

    expect(result).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      fallbackFrom: 'gpt-5.6-luna',
    })
    expect(anthropicMocks.create).toHaveBeenCalledOnce()
  })
})
