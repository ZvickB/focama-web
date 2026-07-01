import { DEFAULT_REFINEMENT_MODEL, OPENAI_RESPONSES_ENDPOINT } from './ai-selector.js'
import { moderateQuery, MODERATION_OUTCOMES } from './content-moderation.js'

const MAX_QUERY_LENGTH = 100
const MAX_REASON_LENGTH = 180
const MAX_TITLE_LENGTH = 160
const MAX_CANDIDATE_ITEMS = 12
const MAX_PREVIEW_ITEMS = 6
const MAX_SIMILAR_QUERIES = 8
export const QUERY_QUALITY_REVIEW_TIMEOUT_MS = 20000

const CLASSIFICATIONS = new Set(['ok', 'likely_typo', 'weak_pool', 'ambiguous_language'])
const SUGGESTABLE_CLASSIFICATIONS = new Set(['likely_typo', 'weak_pool'])
const CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high'])

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function clampText(value, maxLength) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  return normalized.slice(0, maxLength).trim()
}

function normalizeComparableQuery(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeClassification(value) {
  const normalized = normalizeText(value).toLowerCase()
  return CLASSIFICATIONS.has(normalized) ? normalized : 'ok'
}

function normalizeConfidence(value) {
  const normalized = normalizeText(value).toLowerCase()
  return CONFIDENCE_LEVELS.has(normalized) ? normalized : 'low'
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

function createNoSuggestionReview({
  classification = 'ok',
  confidence = 'low',
  reason = '',
  usage = null,
} = {}) {
  return {
    classification: normalizeClassification(classification),
    suggestedQuery: '',
    confidence: normalizeConfidence(confidence),
    reason: clampText(reason, MAX_REASON_LENGTH),
    shouldSuggest: false,
    usage,
    generatedAt: new Date().toISOString(),
  }
}

function getErrorDetails(error) {
  const cause = error?.cause

  return {
    name: error instanceof Error ? error.name : 'NonErrorThrow',
    message: error instanceof Error ? error.message : String(error),
    causeName: cause instanceof Error ? cause.name : '',
    causeMessage: cause instanceof Error ? cause.message : '',
    code: typeof error?.code === 'string'
      ? error.code
      : typeof cause?.code === 'string'
        ? cause.code
        : '',
  }
}

function buildExternalRequestError(error, {
  durationMs,
  serviceName,
  url,
}) {
  const details = getErrorDetails(error)
  const message = details.name === 'TimeoutError'
    ? `${serviceName} query_quality_review request timed out after ${Math.round(durationMs)}ms.`
    : `${serviceName} query_quality_review request failed: ${details.message}`
  const wrappedError = new Error(message, { cause: error instanceof Error ? error : undefined })

  wrappedError.name = details.name === 'TimeoutError' ? 'ExternalRequestTimeoutError' : 'ExternalRequestError'
  wrappedError.externalServiceName = serviceName
  wrappedError.externalUrl = url
  wrappedError.durationMs = durationMs
  wrappedError.errorName = details.name
  wrappedError.errorMessage = details.message
  wrappedError.errorCauseName = details.causeName
  wrappedError.errorCauseMessage = details.causeMessage
  wrappedError.errorCode = details.code

  return wrappedError
}

function buildQueryQualityReviewSchema() {
  return {
    type: 'object',
    properties: {
      classification: {
        type: 'string',
        enum: ['ok', 'likely_typo', 'weak_pool', 'ambiguous_language'],
      },
      suggested_query: {
        type: 'string',
        maxLength: MAX_QUERY_LENGTH,
      },
      confidence: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
      },
      reason: {
        type: 'string',
        maxLength: MAX_REASON_LENGTH,
      },
      should_suggest: {
        type: 'boolean',
      },
    },
    required: ['classification', 'suggested_query', 'confidence', 'reason', 'should_suggest'],
    additionalProperties: false,
  }
}

function normalizeStringList(items, { maxItems, maxItemLength }) {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map((item) => clampText(item, maxItemLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function normalizeCandidateSummaryItems(candidatePoolSummary, candidatePool) {
  const source = Array.isArray(candidatePoolSummary)
    ? candidatePoolSummary
    : Array.isArray(candidatePool?.candidates)
      ? candidatePool.candidates
      : []

  return source
    .map((item) => {
      if (typeof item === 'string') {
        return clampText(item, MAX_TITLE_LENGTH)
      }

      const title = clampText(item?.title, MAX_TITLE_LENGTH)
      const source = clampText(item?.source || item?.provider, 40)
      const price = clampText(item?.price, 40)

      return [title, source && `source: ${source}`, price && `price: ${price}`]
        .filter(Boolean)
        .join(' | ')
    })
    .filter(Boolean)
    .slice(0, MAX_CANDIDATE_ITEMS)
}

function buildQueryQualityReviewInput({
  originalQuery,
  amazonDomain = '',
  candidatePoolSummary = [],
  candidatePool = null,
  previewResultTitles = [],
  similarQueries = [],
}) {
  const candidateLines = normalizeCandidateSummaryItems(candidatePoolSummary, candidatePool)
  const previewLines = normalizeStringList(previewResultTitles, {
    maxItems: MAX_PREVIEW_ITEMS,
    maxItemLength: MAX_TITLE_LENGTH,
  })
  const similarQueryLines = normalizeStringList(
    Array.isArray(similarQueries) ? similarQueries : candidatePool?.similarQueries,
    {
      maxItems: MAX_SIMILAR_QUERIES,
      maxItemLength: MAX_QUERY_LENGTH,
    },
  )

  return [
    'Review whether a shopping search appears to have returned a weak or mismatched product pool.',
    'The original results have already been shown. Only suggest a new query if the evidence is strong.',
    'Do not silently correct or rewrite meaning-bearing language.',
    'Do not normalize, correct, or suggest searches for explicit adult products, erotic content, sexual wellness, or personal lubricants.',
    'Treat community terms, transliterations, slang, regional spelling, aesthetic phrasing, and niche wording as possible intent.',
    'Only rewrite those terms when the returned product pool strongly indicates a mismatch.',
    'Use classification ok when the pool seems reasonable.',
    'Use classification likely_typo for obvious misspellings with a clear intended product or brand.',
    'Use classification weak_pool when the query seems valid but the returned products are plainly off target.',
    'Use classification ambiguous_language when a rewrite is plausible but could change meaning or vibe.',
    'Return should_suggest true only for high-confidence likely_typo or weak_pool cases.',
    'Examples:',
    '- Query "celcius drink" with generic energy drinks and no Celsius products can suggest "celsius drink".',
    '- Query "shabbos art" should usually stay "shabbos art", not become "shabbat art".',
    `Original query: ${clampText(originalQuery, MAX_QUERY_LENGTH)}`,
    `Marketplace domain: ${clampText(amazonDomain, 80) || 'unknown'}`,
    `Upstream similar queries:\n${similarQueryLines.length ? similarQueryLines.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'None provided.'}`,
    `Preview result titles:\n${previewLines.length ? previewLines.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'None provided.'}`,
    `Candidate pool summary:\n${candidateLines.length ? candidateLines.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'No candidates provided.'}`,
  ].join('\n')
}

function normalizeReviewOutput(parsed, { originalQuery, usage = null } = {}) {
  const classification = normalizeClassification(parsed?.classification)
  const confidence = normalizeConfidence(parsed?.confidence)
  const suggestedQuery = clampText(parsed?.suggested_query, MAX_QUERY_LENGTH)
  const reason = clampText(parsed?.reason, MAX_REASON_LENGTH)
  const requestedSuggestion = parsed?.should_suggest === true
  const originalComparable = normalizeComparableQuery(originalQuery)
  const suggestionComparable = normalizeComparableQuery(suggestedQuery)
  const shouldSuggest = Boolean(
    requestedSuggestion &&
      confidence === 'high' &&
      SUGGESTABLE_CLASSIFICATIONS.has(classification) &&
      suggestedQuery &&
      suggestionComparable &&
      suggestionComparable !== originalComparable &&
      moderateQuery(suggestedQuery).outcome !== MODERATION_OUTCOMES.BLOCK,
  )

  return {
    classification,
    suggestedQuery: shouldSuggest ? suggestedQuery : '',
    confidence,
    reason,
    shouldSuggest,
    usage,
    generatedAt: new Date().toISOString(),
  }
}

export async function generateQueryQualityReview(
  {
    originalQuery,
    amazonDomain = '',
    candidatePoolSummary = [],
    candidatePool = null,
    previewResultTitles = [],
    similarQueries = [],
    apiKey,
    model = DEFAULT_REFINEMENT_MODEL,
  },
  fetchImpl = fetch,
) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing from the root .env file.')
  }

  const input = buildQueryQualityReviewInput({
    originalQuery,
    amazonDomain,
    candidatePoolSummary,
    candidatePool,
    previewResultTitles,
    similarQueries,
  })

  const requestStartedAt = performance.now()
  let response

  try {
    response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(QUERY_QUALITY_REVIEW_TIMEOUT_MS),
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
              'You help shoppers identify weak search results without overriding intentional language. Return only structured output.',
          },
          {
            role: 'user',
            content: input,
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'query_quality_review',
            strict: true,
            schema: buildQueryQualityReviewSchema(),
          },
        },
      }),
    })
  } catch (error) {
    throw buildExternalRequestError(error, {
      durationMs: performance.now() - requestStartedAt,
      serviceName: 'OpenAI Responses API',
      url: OPENAI_RESPONSES_ENDPOINT,
    })
  }

  if (!response.ok) {
    const errorText = await response.text()
    const error = new Error(`OpenAI query_quality_review failed with status ${response.status}: ${errorText.slice(0, 300)}`)
    error.statusCode = response.status
    throw buildExternalRequestError(error, {
      durationMs: performance.now() - requestStartedAt,
      serviceName: 'OpenAI Responses API',
      url: OPENAI_RESPONSES_ENDPOINT,
    })
  }

  const payload = await response.json()
  const usage = normalizeOpenAiUsage(payload)
  const responseText = getResponseText(payload)

  if (!responseText) {
    return createNoSuggestionReview({ usage })
  }

  try {
    return normalizeReviewOutput(JSON.parse(responseText), {
      originalQuery,
      usage,
    })
  } catch {
    return createNoSuggestionReview({ usage })
  }
}
