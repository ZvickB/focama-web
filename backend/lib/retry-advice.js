import { DEFAULT_REFINEMENT_MODEL, OPENAI_RESPONSES_ENDPOINT } from './ai-selector.js'

const MAX_QUERY_LENGTH = 100
const MAX_SHORTLIST_ITEMS = 6
const MAX_TITLE_LENGTH = 160
const MAX_RATIONALE_LENGTH = 120

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function clampText(value, maxLength) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  return normalized.slice(0, maxLength).trim()
}

function normalizeRationale(value) {
  const normalized = clampText(value, MAX_RATIONALE_LENGTH)
  return normalized || 'Focuses the search more closely on what you want.'
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

function buildRetryAdviceSchema() {
  return {
    type: 'object',
    properties: {
      recommendation: {
        type: 'string',
        enum: ['new_search'],
      },
      suggested_query: {
        type: 'string',
        maxLength: MAX_QUERY_LENGTH,
      },
      rationale: {
        type: 'string',
      },
    },
    required: ['recommendation', 'suggested_query', 'rationale'],
    additionalProperties: false,
  }
}

function normalizeShortlistTitles(shortlist) {
  if (!Array.isArray(shortlist)) {
    return []
  }

  return shortlist
    .map((item) => clampText(item?.title, MAX_TITLE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_SHORTLIST_ITEMS)
}

function buildRetryAdviceInput({
  productQuery,
  followUpNotes = '',
  rejectionFeedback = '',
  shortlist = [],
}) {
  const titles = normalizeShortlistTitles(shortlist)
  const titleLines = titles.length > 0
    ? titles.map((title, index) => `${index + 1}. ${title}`).join('\n')
    : 'No shortlist titles were provided.'

  return [
    'A shopper rejected a set of product picks. Suggest a better fresh search they can try next.',
    'Always return recommendation as new_search.',
    'Always provide a concise suggested_query that can be pasted into a normal shopping search box.',
    'The suggested_query must be 100 characters or fewer — write a tight, complete phrase.',
    'Rewrite the search more specifically around the feedback while keeping the shopper intent.',
    'Write rationale as exactly 1 sentence of natural UI copy.',
    'Keep rationale concise, usually 10 to 20 words, and ideally under 120 characters.',
    'Briefly explain how the new search is better.',
    'Do not use the words intent, pool, shortlist, category, same pool, or original search.',
    'Do not include step-by-step reasoning, semicolons, slashes, or parentheses.',
    'Do not include retailer names unless the user explicitly requested one.',
    `Original search: ${normalizeText(productQuery)}`,
    `Follow-up notes: ${normalizeText(followUpNotes) || 'None'}`,
    `Rejected shortlist:\n${titleLines}`,
    `User feedback: ${normalizeText(rejectionFeedback)}`,
  ].join('\n')
}

export async function generateRetryAdvice(
  {
    productQuery,
    followUpNotes = '',
    rejectionFeedback = '',
    shortlist = [],
    apiKey,
    model = DEFAULT_REFINEMENT_MODEL,
  },
  fetchImpl = fetch,
) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing from the root .env file.')
  }

  const input = buildRetryAdviceInput({
    productQuery,
    followUpNotes,
    rejectionFeedback,
    shortlist,
  })
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
          content:
            'You help shoppers recover from bad search results. Return only structured output.',
        },
        {
          role: 'user',
          content: input,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'retry_advice',
          strict: true,
          schema: buildRetryAdviceSchema(),
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI retry_advice failed: ${errorText.slice(0, 300)}`)
  }

  const payload = await response.json()
  const responseText = getResponseText(payload)

  if (!responseText) {
    throw new Error('OpenAI retry_advice returned no structured output.')
  }

  const parsed = JSON.parse(responseText)
  const suggestedQuery = normalizeText(parsed.suggested_query)

  return {
    recommendation: 'new_search',
    suggestedQuery: suggestedQuery || normalizeText(productQuery),
    rationale: normalizeRationale(parsed.rationale),
    usage: normalizeOpenAiUsage(payload),
    generatedAt: new Date().toISOString(),
  }
}
