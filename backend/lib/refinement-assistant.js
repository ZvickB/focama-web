import { DEFAULT_OPENAI_MODEL, OPENAI_RESPONSES_ENDPOINT } from './ai-selector.js'

const MAX_PROMPT_LENGTH = 90
const DEFAULT_HELPER_TEXT = 'Add the one detail that matters most and we will narrow faster.'
const DEFAULT_PLACEHOLDER = 'Examples: budget, size, comfort, must-have, or what to avoid.'

function getResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text
  }

  const output = Array.isArray(payload?.output) ? payload.output : []
  const chunks = []

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : []

    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        chunks.push(part.text)
      }
    }
  }

  return chunks.join('\n').trim()
}

function buildPromptSchema() {
  return {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        maxLength: MAX_PROMPT_LENGTH,
      },
    },
    required: ['prompt'],
    additionalProperties: false,
  }
}

function buildPromptInput(productQuery) {
  return [
    'Help a shopper clarify one detail that will change product ranking.',
    'Return one short question only.',
    `Keep the question at or under ${MAX_PROMPT_LENGTH} characters.`,
    'Ask only one question.',
    'Do not add helper text, examples, or a placeholder.',
    'Focus on the detail most likely to change ranking, such as use case, must-have, budget, size, comfort, or what to avoid.',
    `Product request: ${productQuery}`,
  ].join('\n')
}

function clampText(value, maxLength) {
  const normalizedValue = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

  if (!normalizedValue) {
    return ''
  }

  return normalizedValue.slice(0, maxLength).trim()
}

function normalizeOpenAiUsage(payload) {
  if (!payload?.usage || typeof payload.usage !== 'object' || Array.isArray(payload.usage)) {
    return null
  }

  const inputTokens = Number(payload.usage.input_tokens)
  const outputTokens = Number(payload.usage.output_tokens)
  const totalTokens = Number(payload.usage.total_tokens)
  const reasoningTokens = Number(payload.usage.output_tokens_details?.reasoning_tokens)

  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
    reasoningTokens: Number.isFinite(reasoningTokens) ? reasoningTokens : 0,
  }
}

export async function generateRefinementPrompt(
  { productQuery, apiKey, model = DEFAULT_OPENAI_MODEL },
  fetchImpl = fetch,
) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing from the root .env file.')
  }

  const response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: {
        effort: 'minimal',
      },
      input: [
        {
          role: 'system',
          content: 'You help shoppers clarify what matters before choosing products. Return only structured output.',
        },
        {
          role: 'user',
          content: buildPromptInput(productQuery),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'refinement_prompt',
          strict: true,
          schema: buildPromptSchema(),
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI refinement prompt failed: ${errorText.slice(0, 300)}`)
  }

  const payload = await response.json()
  const responseText = getResponseText(payload)
  const usage = normalizeOpenAiUsage(payload)

  if (!responseText) {
    throw new Error('OpenAI refinement prompt returned no structured output.')
  }

  const parsed = JSON.parse(responseText)

  return {
    prompt: clampText(parsed.prompt, MAX_PROMPT_LENGTH),
    helperText: DEFAULT_HELPER_TEXT,
    followUpPlaceholder: DEFAULT_PLACEHOLDER,
    usage,
  }
}
