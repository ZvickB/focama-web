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
      suggested_priorities: {
        type: 'array',
        items: {
          type: 'string',
        },
        minItems: 3,
        maxItems: 6,
      },
      follow_up_placeholder: {
        type: 'string',
      },
    },
    required: ['prompt', 'helper_text', 'suggested_priorities', 'follow_up_placeholder'],
    additionalProperties: false,
  }
}

function buildPromptInput(productQuery) {
  return [
    'You are helping a shopper clarify what matters before picking products.',
    'Keep the tone calm, practical, and lightweight.',
    'Return one short question, one short helper text, 3 to 6 selectable priorities, and one placeholder for optional free text.',
    'The priorities should help the shopper think through tradeoffs like comfort, durability, portability, price, style, size, safety, or ease of use when relevant.',
    'Do not ask more than one question in this step.',
    `Product request: ${productQuery}`,
  ].join('\n')
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

  if (!responseText) {
    throw new Error('OpenAI refinement prompt returned no structured output.')
  }

  const parsed = JSON.parse(responseText)

  return {
    prompt: parsed.prompt,
    helperText: parsed.helper_text,
    suggestedPriorities: parsed.suggested_priorities,
    followUpPlaceholder: parsed.follow_up_placeholder,
  }
}
