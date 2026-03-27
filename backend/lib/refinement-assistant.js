import { DEFAULT_OPENAI_MODEL, OPENAI_RESPONSES_ENDPOINT } from './ai-selector.js'

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
      },
      helper_text: {
        type: 'string',
      },
      follow_up_placeholder: {
        type: 'string',
      },
    },
    required: ['prompt', 'helper_text', 'follow_up_placeholder'],
    additionalProperties: false,
  }
}

function buildPromptInput(productQuery) {
  return [
    'You are helping a shopper clarify what matters before picking products.',
    'Keep the tone calm, practical, and lightweight.',
    'Return one short question, one short helper text, and one placeholder for optional free text.',
    'Do not suggest chips, toggles, or selectable priorities.',
    'Do not ask more than one question in this step.',
    `Product request: ${productQuery}`,
  ].join('\n')
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
        effort: 'low',
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
    prompt: parsed.prompt,
    helperText: parsed.helper_text,
    followUpPlaceholder: parsed.follow_up_placeholder,
    usage,
  }
}
