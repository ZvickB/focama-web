import { createQueryFramingContract } from './layered-contracts.js'
import { DEFAULT_REFINEMENT_MODEL, OPENAI_RESPONSES_ENDPOINT } from './ai-selector.js'

const MAX_PROMPT_LENGTH = 140
const MAX_CATEGORY_HINT_LENGTH = 80
const MAX_FRAMING_SUMMARY_LENGTH = 160
const MAX_TRADEOFF_AXES = 4
const MAX_REFINEMENT_HINTS = 4

function clampText(value, maxLength) {
  const normalizedValue = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

  if (!normalizedValue) {
    return ''
  }

  return normalizedValue.slice(0, maxLength).trim()
}

function normalizeStringArray(values, { maxItems, maxLength }) {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .map((value) => clampText(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
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

function buildQuestionFastSchema() {
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

function buildFramingFieldsSchema() {
  return {
    type: 'object',
    properties: {
      category_hint: {
        type: 'string',
        maxLength: MAX_CATEGORY_HINT_LENGTH,
      },
      framing_summary: {
        type: 'string',
        maxLength: MAX_FRAMING_SUMMARY_LENGTH,
      },
      tradeoff_axes: {
        type: 'array',
        maxItems: MAX_TRADEOFF_AXES,
        items: {
          type: 'string',
          maxLength: 80,
        },
      },
      refinement_hints: {
        type: 'array',
        maxItems: MAX_REFINEMENT_HINTS,
        items: {
          type: 'string',
          maxLength: 120,
        },
      },
    },
    required: ['category_hint', 'framing_summary', 'tradeoff_axes', 'refinement_hints'],
    additionalProperties: false,
  }
}

function buildQuestionFastInput(productQuery) {
  return [
    'Write one short follow-up question for a shopping search before any product results exist.',
    'Stay query-only. Do not assume specific products, brands, or merchants.',
    `Keep the question at or under ${MAX_PROMPT_LENGTH} characters.`,
    'Ask only one question.',
    'Do not add helper text, examples, a placeholder, category notes, or reasoning fields.',
    'Focus on the detail most likely to change ranking, such as use case, must-have, budget, size, comfort, or what to avoid.',
    `Product request: ${productQuery}`,
  ].join('\n')
}

function buildFramingFieldsInput(productQuery) {
  return [
    'Create background query-framing fields for a shopping search before any product results exist.',
    'Stay query-only. Do not assume specific products, brands, or merchants.',
    'Infer the likely shopping category and the tradeoff dimensions most likely to change ranking.',
    'Return only background fields. Do not write the user-facing follow-up question.',
    `Product request: ${productQuery}`,
  ].join('\n')
}

function emitDebugEvent(debugContext, eventName, details = {}) {
  if (typeof debugContext?.onEvent !== 'function') {
    return
  }

  debugContext.onEvent(eventName, details)
}

async function callStructuredQueryFraming(
  { apiKey, model = DEFAULT_REFINEMENT_MODEL, input, schemaName, schema, debugContext = null },
  fetchImpl = fetch,
) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing from the root .env file.')
  }

  emitDebugEvent(debugContext, 'query_framing_openai_request_started', {
    schemaName,
    model,
    inputLength: input.length,
  })

  let response

  try {
    response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
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
            content:
              'You help shoppers clarify what matters before choosing products. Return only structured output.',
          },
          {
            role: 'user',
            content: input,
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: schemaName,
            strict: true,
            schema,
          },
        },
      }),
    })
  } catch (error) {
    emitDebugEvent(debugContext, 'query_framing_openai_request_failed', {
      schemaName,
      message: error instanceof Error ? error.message : 'Unknown fetch error',
    })
    throw error
  }

  if (!response.ok) {
    const errorText = await response.text()
    emitDebugEvent(debugContext, 'query_framing_openai_response_error', {
      schemaName,
      status: response.status,
      statusText: response.statusText,
      bodyPreview: errorText.slice(0, 300),
    })
    throw new Error(`OpenAI ${schemaName} failed: ${errorText.slice(0, 300)}`)
  }

  const payload = await response.json()
  const responseText = getResponseText(payload)
  const usage = normalizeOpenAiUsage(payload)
  emitDebugEvent(debugContext, 'query_framing_openai_response_received', {
    schemaName,
    responseId: typeof payload?.id === 'string' ? payload.id : null,
    hasOutputText: Boolean(responseText),
    outputTextLength: responseText.length,
    usage,
  })

  if (!responseText) {
    throw new Error(`OpenAI ${schemaName} returned no structured output.`)
  }

  let parsed

  try {
    parsed = JSON.parse(responseText)
  } catch (error) {
    emitDebugEvent(debugContext, 'query_framing_openai_parse_failed', {
      schemaName,
      message: error instanceof Error ? error.message : 'Unknown parse error',
      outputPreview: responseText.slice(0, 300),
    })
    throw error
  }

  return {
    parsed,
    usage,
  }
}

export async function generateQuestionFast(
  { productQuery, apiKey, model = DEFAULT_REFINEMENT_MODEL, debugContext = null },
  fetchImpl = fetch,
) {
  const { parsed, usage } = await callStructuredQueryFraming(
    {
      productQuery,
      apiKey,
      model,
      input: buildQuestionFastInput(productQuery),
      schemaName: 'question_fast',
      schema: buildQuestionFastSchema(),
      debugContext,
    },
    fetchImpl,
  )

  return {
    prompt: clampText(parsed.prompt, MAX_PROMPT_LENGTH),
    usage,
    generatedAt: new Date().toISOString(),
  }
}

export async function generateFramingFields(
  { productQuery, apiKey, model = DEFAULT_REFINEMENT_MODEL, debugContext = null },
  fetchImpl = fetch,
) {
  const { parsed, usage } = await callStructuredQueryFraming(
    {
      productQuery,
      apiKey,
      model,
      input: buildFramingFieldsInput(productQuery),
      schemaName: 'framing_fields',
      schema: buildFramingFieldsSchema(),
      debugContext,
    },
    fetchImpl,
  )

  const generatedAt = new Date().toISOString()

  return {
    usage,
    contract: createQueryFramingContract({
      query: productQuery,
      categoryHint: clampText(parsed.category_hint, MAX_CATEGORY_HINT_LENGTH),
      framingSummary: clampText(parsed.framing_summary, MAX_FRAMING_SUMMARY_LENGTH),
      tradeoffAxes: normalizeStringArray(parsed.tradeoff_axes, {
        maxItems: MAX_TRADEOFF_AXES,
        maxLength: 80,
      }),
      refinementHints: normalizeStringArray(parsed.refinement_hints, {
        maxItems: MAX_REFINEMENT_HINTS,
        maxLength: 120,
      }),
      generatedAt,
    }),
  }
}

export async function generateQueryFraming(
  { productQuery, apiKey, model = DEFAULT_REFINEMENT_MODEL },
  fetchImpl = fetch,
) {
  const [questionFast, framingFields] = await Promise.all([
    generateQuestionFast({ productQuery, apiKey, model }, fetchImpl),
    generateFramingFields({ productQuery, apiKey, model }, fetchImpl),
  ])

  return {
    prompt: questionFast.prompt,
    usage: questionFast.usage,
    framingFieldsUsage: framingFields.usage,
    contract: framingFields.contract,
  }
}

export function createQuestionOnlyQueryFramingContract({ productQuery, generatedAt = null } = {}) {
  return createQueryFramingContract({
    query: productQuery,
    generatedAt,
  })
}
