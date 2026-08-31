import Anthropic from '@anthropic-ai/sdk'

import { createQueryFramingContract } from './layered-contracts.js'
import { DEFAULT_HAIKU_MODEL, DEFAULT_REFINEMENT_MODEL, OPENAI_RESPONSES_ENDPOINT } from './ai-selector.js'

const MAX_PROMPT_LENGTH = 140
const MAX_REFINEMENT_SUGGESTION_LENGTH = 30
const MAX_REFINEMENT_SUGGESTIONS = 4

function clampText(value, maxLength) {
  const normalizedValue = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

  if (!normalizedValue) {
    return ''
  }

  return normalizedValue.slice(0, maxLength).trim()
}

function normalizeRefinementSuggestions(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const label = typeof item.label === 'string' ? item.label.trim().replace(/\s+/g, ' ') : ''
      const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : ''
      if (!label || label.length > MAX_REFINEMENT_SUGGESTION_LENGTH) return null
      return prompt ? { label, prompt } : { label }
    })
    .filter(Boolean)
    .slice(0, MAX_REFINEMENT_SUGGESTIONS)
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

function normalizeAnthropicUsage(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return null
  }

  const inputTokens = Number(usage.input_tokens)
  const outputTokens = Number(usage.output_tokens)
  const normalizedInputTokens = Number.isFinite(inputTokens) ? inputTokens : 0
  const normalizedOutputTokens = Number.isFinite(outputTokens) ? outputTokens : 0

  return {
    inputTokens: normalizedInputTokens,
    outputTokens: normalizedOutputTokens,
    totalTokens: normalizedInputTokens + normalizedOutputTokens,
    reasoningTokens: 0,
  }
}

function getAnthropicMessageText(message) {
  const content = Array.isArray(message?.content) ? message.content : []
  const chunks = []

  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
      chunks.push(part.text)
    }
  }

  return chunks.join('\n').trim()
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
        description:
          'A short multiple-choice question that can be answered directly by any refinement_suggestions label.',
      },
      alternate_prompt: {
        type: 'string',
        maxLength: MAX_PROMPT_LENGTH,
        description:
          'A short multiple-choice question that can be answered directly by any alternate_refinement_suggestions label.',
      },
      refinement_suggestions: {
        type: 'array',
        minItems: MAX_REFINEMENT_SUGGESTIONS,
        maxItems: MAX_REFINEMENT_SUGGESTIONS,
        description:
          'Four direct answers to prompt: three concrete mutually exclusive choices and one neutral choice.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', minLength: 1, maxLength: MAX_REFINEMENT_SUGGESTION_LENGTH },
            prompt: { type: 'string', minLength: 1 },
          },
          required: ['label', 'prompt'],
          additionalProperties: false,
        },
      },
      alternate_refinement_suggestions: {
        type: 'array',
        minItems: MAX_REFINEMENT_SUGGESTIONS,
        maxItems: MAX_REFINEMENT_SUGGESTIONS,
        description:
          'Four direct answers to alternate_prompt: three concrete mutually exclusive choices and one neutral choice.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', minLength: 1, maxLength: MAX_REFINEMENT_SUGGESTION_LENGTH },
            prompt: { type: 'string', minLength: 1 },
          },
          required: ['label', 'prompt'],
          additionalProperties: false,
        },
      },
    },
    required: [
      'prompt',
      'alternate_prompt',
      'refinement_suggestions',
      'alternate_refinement_suggestions',
    ],
    additionalProperties: false,
  }
}


function buildQuestionFastInput(productQuery) {
  return [
    'Write two short follow-up questions for a shopping search before any product results exist.',
    'Stay query-only. Do not assume specific products, brands, or merchants.',
    `Keep the question at or under ${MAX_PROMPT_LENGTH} characters.`,
    'Return the strongest question as prompt and a useful alternative as alternate_prompt.',
    'Each question must ask about one decision factor, and the two questions must explore different factors.',
    'Write the answer choices first in your reasoning, then write a question that those exact choices answer.',
    `For each question, write exactly ${MAX_REFINEMENT_SUGGESTIONS} mutually exclusive answer options that directly and grammatically answer that exact question.`,
    'The question must be multiple-choice, not yes/no. It should name or clearly frame the same concepts used in its first three answer labels.',
    'If the question asks about usage frequency, every concrete answer must be a frequency. If it asks about budget, every concrete answer must be a budget range. Apply this same-category rule to every question.',
    `Each answer label must be 1-4 words and ${MAX_REFINEMENT_SUGGESTION_LENGTH} characters or fewer.`,
    'Use refinement_suggestions for prompt and alternate_refinement_suggestions for alternate_prompt.',
    'The first three options should be useful concrete answers. The fourth must be a neutral answer such as "No preference" or "Not sure".',
    'For each answer, prompt must be one short natural-language sentence written as if the shopper is answering the question.',
    'Use natural shopping language.',
    'Do not use brands, merchants, hype, generic quality claims, or broad labels like "Quality", "Best option", "Top rated", or "Good product".',
    'Do not add helper text, examples, a placeholder, category notes, or reasoning fields.',
    'Focus on the detail most likely to change ranking, such as use case, must-have, budget, size, comfort, or what to avoid.',
    'Good pairing: question "How often will you use it?" with labels "Daily", "A few times weekly", "Occasionally", and "Not sure".',
    'Bad pairing: question "Do you need lumbar support?" with labels "Lower price", "More mobility", "Deep adjustability", and "No preference".',
    `Product request: ${productQuery}`,
  ].join('\n')
}

function buildQuestionFastAnthropicInput(productQuery) {
  return [
    buildQuestionFastInput(productQuery),
    '',
    'Return valid JSON only with this exact shape:',
    '{"prompt":"...","alternate_prompt":"...","refinement_suggestions":[{"label":"...","prompt":"..."},{"label":"...","prompt":"..."},{"label":"...","prompt":"..."},{"label":"No preference","prompt":"..."}],"alternate_refinement_suggestions":[{"label":"...","prompt":"..."},{"label":"...","prompt":"..."},{"label":"...","prompt":"..."},{"label":"No preference","prompt":"..."}]}',
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
          effort: 'low',
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

async function callHaikuQueryFraming(
  { apiKey, model = DEFAULT_HAIKU_MODEL, input, schemaName, debugContext = null },
) {
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY is missing from the root .env file.')
  }

  emitDebugEvent(debugContext, 'query_framing_haiku_request_started', {
    schemaName,
    model,
    inputLength: input.length,
  })

  let message

  try {
    const anthropic = new Anthropic({ apiKey })
    message = await anthropic.messages.create({
      model,
      max_tokens: 384,
      system: 'You help shoppers clarify what matters before choosing products. Return only valid JSON.',
      messages: [
        {
          role: 'user',
          content: input,
        },
      ],
    })
  } catch (error) {
    emitDebugEvent(debugContext, 'query_framing_haiku_request_failed', {
      schemaName,
      message: error instanceof Error ? error.message : 'Unknown Anthropic error',
    })
    throw error
  }

  const responseText = getAnthropicMessageText(message)
  const usage = normalizeAnthropicUsage(message?.usage)
  emitDebugEvent(debugContext, 'query_framing_haiku_response_received', {
    schemaName,
    responseId: typeof message?.id === 'string' ? message.id : null,
    hasOutputText: Boolean(responseText),
    outputTextLength: responseText.length,
    usage,
  })

  if (!responseText) {
    throw new Error(`Haiku ${schemaName} returned no structured output.`)
  }

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  const jsonText = jsonMatch ? jsonMatch[0] : responseText
  let parsed

  try {
    parsed = JSON.parse(jsonText)
  } catch (error) {
    emitDebugEvent(debugContext, 'query_framing_haiku_parse_failed', {
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
    alternatePrompt: clampText(parsed.alternate_prompt, MAX_PROMPT_LENGTH),
    refinementSuggestions: normalizeRefinementSuggestions(parsed.refinement_suggestions),
    alternateRefinementSuggestions: normalizeRefinementSuggestions(
      parsed.alternate_refinement_suggestions,
    ),
    usage,
    generatedAt: new Date().toISOString(),
  }
}

export async function generateQuestionFastHaiku(
  { productQuery, apiKey, model = DEFAULT_HAIKU_MODEL, debugContext = null },
) {
  const { parsed, usage } = await callHaikuQueryFraming({
    productQuery,
    apiKey,
    model,
    input: buildQuestionFastAnthropicInput(productQuery),
    schemaName: 'question_fast',
    debugContext,
  })

  return {
    prompt: clampText(parsed.prompt, MAX_PROMPT_LENGTH),
    alternatePrompt: clampText(parsed.alternate_prompt, MAX_PROMPT_LENGTH),
    refinementSuggestions: normalizeRefinementSuggestions(parsed.refinement_suggestions),
    alternateRefinementSuggestions: normalizeRefinementSuggestions(
      parsed.alternate_refinement_suggestions,
    ),
    usage,
    model,
    provider: 'anthropic',
    generatedAt: new Date().toISOString(),
  }
}


export function createQuestionOnlyQueryFramingContract({ productQuery, generatedAt = null } = {}) {
  return createQueryFramingContract({
    query: productQuery,
    generatedAt,
  })
}
