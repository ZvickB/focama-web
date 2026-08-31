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

import { generateRefinementPrompt } from './refinement-assistant.js'

describe('refinement assistant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses OpenAI Luna first for structured prompt text and chip suggestions', async () => {
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
          prompt: 'What matters most: budget, portability, or comfort?',
          alternate_prompt: 'Where will you use these most often?',
          refinement_suggestions: [
            { label: 'Lower price', prompt: 'I want to keep the price low without losing the basics' },
            { label: 'Easy travel', prompt: 'I need something that is simple to carry while traveling' },
            { label: 'Comfort first', prompt: 'Comfort matters most for longer use' },
          ],
          alternate_refinement_suggestions: [
            { label: 'At home', prompt: 'I will mostly use these at home.' },
            { label: 'At work', prompt: 'I will mostly use these at work.' },
            { label: 'While traveling', prompt: 'I will mostly use these while traveling.' },
          ],
        }),
      }),
    })

    const result = await generateRefinementPrompt(
      {
        productQuery: 'wireless headphones',
        anthropicApiKey: 'claude-key',
        openAiApiKey: 'openai-key',
      },
      fetchMock,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      }),
    )
    expect(anthropicMocks.create).not.toHaveBeenCalled()
    const [, request] = fetchMock.mock.calls[0]
    expect(JSON.parse(request.body).model).toBe('gpt-5.6-luna')
    expect(result).toEqual(
      expect.objectContaining({
        prompt: 'What matters most: budget, portability, or comfort?',
        alternatePrompt: 'Where will you use these most often?',
        refinementSuggestions: [
          { label: 'Lower price', prompt: 'I want to keep the price low without losing the basics' },
          { label: 'Easy travel', prompt: 'I need something that is simple to carry while traveling' },
          { label: 'Comfort first', prompt: 'Comfort matters most for longer use' },
        ],
        usage: {
          inputTokens: 78,
          outputTokens: 24,
          totalTokens: 102,
          reasoningTokens: 10,
        },
        provider: 'openai',
        model: 'gpt-5.6-luna',
        fallbackFrom: null,
      }),
    )
  })

  it('falls back to Haiku when OpenAI Luna fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'temporary openai outage',
    })
    anthropicMocks.create.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            prompt: 'What matters most here: price, size, or durability?',
            alternate_prompt: 'How often do you expect to use it?',
            refinement_suggestions: [
              { label: 'Under $100', prompt: 'I want to stay under $100' },
              { label: 'Compact size', prompt: 'I need something compact and easy to store' },
              { label: 'Long lasting', prompt: 'Durability matters more than extra features' },
            ],
            alternate_refinement_suggestions: [
              { label: 'Every day', prompt: 'I expect to use it every day.' },
              { label: 'A few times weekly', prompt: 'I expect to use it a few times each week.' },
              { label: 'Occasionally', prompt: 'I expect to use it occasionally.' },
            ],
          }),
        },
      ],
      usage: {
        input_tokens: 55,
        output_tokens: 28,
      },
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
    expect(anthropicMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 384,
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        prompt: 'What matters most here: price, size, or durability?',
        alternatePrompt: 'How often do you expect to use it?',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        fallbackFrom: 'gpt-5.6-luna',
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
          alternate_prompt: 'Is there anything you want to avoid?',
          refinement_suggestions: [
            { label: 'Travel use', prompt: 'I need something that works well for travel and is easy to carry' },
            { label: 'Long battery', prompt: 'Battery life is important — I want it to last a full day' },
            { label: 'Comfort fit', prompt: 'Comfort is a priority for me, especially for extended use' },
          ],
          alternate_refinement_suggestions: [
            { label: 'Bulky fit', prompt: 'I want to avoid a bulky fit.' },
            { label: 'Short battery', prompt: 'I want to avoid short battery life.' },
            { label: 'Weak isolation', prompt: 'I want to avoid weak noise isolation.' },
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

    expect(result).toEqual(expect.objectContaining({
      prompt: 'What matters most here: portability, comfort, or battery life?',
      alternatePrompt: 'Is there anything you want to avoid?',
      helperText: '',
      followUpPlaceholder: 'Budget, size, must-haves, or anything you want to avoid...',
      answerOptions: [
        { label: 'Travel use', prompt: 'I need something that works well for travel and is easy to carry' },
        { label: 'Long battery', prompt: 'Battery life is important — I want it to last a full day' },
        { label: 'Comfort fit', prompt: 'Comfort is a priority for me, especially for extended use' },
        { label: 'No preference', prompt: 'I do not have a preference here.' },
      ],
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
      model: 'gpt-5.6-luna',
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
    }))

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      }),
    )

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
          alternate_prompt: `What would rule an option out ${'y'.repeat(140)}`,
          refinement_suggestions: [
            { label: 'Daily use', prompt: 'I plan to use this every day so durability matters' },
            { label: 'Easy cleaning', prompt: 'I want something that is easy to clean after use' },
            { label: 'Under $200', prompt: 'My budget is under $200' },
          ],
          alternate_refinement_suggestions: [
            { label: 'Too loud', prompt: 'I want to avoid a grinder that is too loud.' },
            { label: 'Too large', prompt: 'I want to avoid a grinder that takes too much space.' },
            { label: 'Hard to clean', prompt: 'I want to avoid a grinder that is hard to clean.' },
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
    expect(result.alternatePrompt.length).toBeLessThanOrEqual(140)
    expect(result.helperText).toBe('')
    expect(result.followUpPlaceholder).toBe('Budget, size, must-haves, or anything you want to avoid...')
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

  it('keeps fallback questions matched to fallback answers when model options are incomplete', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          prompt: 'A question whose answers are missing?',
          alternate_prompt: 'Another question whose answers are missing?',
          refinement_suggestions: [{ label: 'Only one', prompt: 'Only one answer.' }],
          alternate_refinement_suggestions: [],
        }),
      }),
    })

    const result = await generateRefinementPrompt(
      {
        productQuery: 'desk lamp',
        apiKey: 'test-key',
      },
      fetchMock,
    )

    expect(result.prompt).toBe('What matters most when choosing your desk lamp?')
    expect(result.answerOptions.map((option) => option.label)).toEqual([
      'Best value',
      'Easiest to use',
      'Best fit',
      'No preference',
    ])
    expect(result.alternatePrompt).toBe('What would make a desk lamp a poor fit?')
    expect(result.alternateAnswerOptions.map((option) => option.label)).toEqual([
      'Too expensive',
      'Too complicated',
      'Wrong size',
      'Not sure',
    ])
  })
})
