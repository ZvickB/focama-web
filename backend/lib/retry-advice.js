import { DEFAULT_REFINEMENT_MODEL, OPENAI_RESPONSES_ENDPOINT } from './ai-selector.js'

const MAX_QUERY_LENGTH = 80
const MAX_RATIONALE_LENGTH = 180
const MAX_FEEDBACK_LENGTH = 300
const MAX_NOTES_LENGTH = 500
const MAX_SHORTLIST_ITEMS = 6
const MAX_TITLE_LENGTH = 160

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
        enum: ['new_search', 'same_pool'],
      },
      suggested_query: {
        type: 'string',
        maxLength: MAX_QUERY_LENGTH,
      },
      rationale: {
        type: 'string',
        maxLength: MAX_RATIONALE_LENGTH,
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
    'A shopper rejected a product shortlist. Decide whether their feedback points to a wrong search pool or just imperfect picks.',
    'Always provide a concise suggested_query that can be pasted into a normal shopping search box.',
    'The suggested_query must be 80 characters or fewer — write a tight, complete phrase.',
    'If the pool seems wrong, rewrite the search more specifically around the feedback.',
    'If the same pool could work, still produce a better fresh-search query that preserves the original intent and adds the feedback.',
    'Do not include retailer names unless the user explicitly requested one.',
    `Original search: ${clampText(productQuery, MAX_QUERY_LENGTH)}`,
    `Follow-up notes: ${clampText(followUpNotes, MAX_NOTES_LENGTH) || 'None'}`,
    `Rejected shortlist:\n${titleLines}`,
    `User feedback: ${clampText(rejectionFeedback, MAX_FEEDBACK_LENGTH)}`,
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
  const suggestedQuery = clampText(parsed.suggested_query, MAX_QUERY_LENGTH)

  return {
    recommendation: parsed.recommendation === 'same_pool' ? 'same_pool' : 'new_search',
    suggestedQuery: suggestedQuery || clampText(productQuery, MAX_QUERY_LENGTH),
    rationale: clampText(parsed.rationale, MAX_RATIONALE_LENGTH),
    usage: normalizeOpenAiUsage(payload),
    generatedAt: new Date().toISOString(),
  }
}
