import { getClientIpAddress, takeRateLimitToken } from '../rate-limit.js'
import { getEnv, validateSearchInput } from '../search-data.js'
import { generateRetryAdvice } from '../retry-advice.js'
import { buildInternalErrorPayload, readJsonBody, sendJson } from '../http.js'
import { sanitizeRetryAdviceShortlist, truncateText } from '../text-sanitizers.js'

export function createRetryAdviceHandler({
  getRefinementModel,
  logSearchFlowEvent,
  nowMs,
  reportBackendError,
  rateLimitConfig,
  bodyLimitBytes,
  maxNoteLength,
  maxRejectionFeedbackLength,
  maxShortlistItems,
  maxShortlistTitleLength,
  rateLimitWaitMessage,
}) {
  return async function handleRetryAdvice(request, response) {
    const requestStartedAt = nowMs()
    const openAiApiKey = getEnv('OPENAI_API_KEY')

    if (!openAiApiKey) {
      sendJson(response, 500, { error: 'OPENAI_API_KEY is missing from the root .env file.' })
      return
    }

    let body

    try {
      body = await readJsonBody(request, { maxBytes: bodyLimitBytes })
      body.bodyReadDuration = nowMs() - requestStartedAt
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request body.' })
      return
    }

    const clientIpAddress = getClientIpAddress(request.headers || {})
    const rateLimit = await takeRateLimitToken(clientIpAddress, rateLimitConfig)

    if (!rateLimit.allowed) {
      logSearchFlowEvent('retry_advice_rate_limited', {
        route: '/api/search/retry-advice',
        clientIpAddress,
      })
      sendJson(response, 429, {
        error: `Too many retry advice requests from this connection. ${rateLimitWaitMessage}`,
      })
      return
    }

    const query = typeof body?.query === 'string' ? body.query : ''
    const { error, isValid, normalizedQuery } = validateSearchInput(query, '')

    if (!isValid) {
      logSearchFlowEvent('retry_advice_invalid', {
        route: '/api/search/retry-advice',
        error,
      })
      sendJson(response, 400, { error })
      return
    }

    const rejectionFeedback = truncateText(body?.rejectionFeedback, maxRejectionFeedbackLength)

    if (!rejectionFeedback) {
      sendJson(response, 400, { error: 'Tell us what felt off before trying again.' })
      return
    }

    try {
      const openAiStartedAt = nowMs()
      const advice = await generateRetryAdvice({
        productQuery: normalizedQuery,
        followUpNotes: truncateText(body?.followUpNotes, maxNoteLength),
        rejectionFeedback,
        shortlist: sanitizeRetryAdviceShortlist(body?.shortlist, {
          maxItems: maxShortlistItems,
          maxTitleLength: maxShortlistTitleLength,
        }),
        apiKey: openAiApiKey,
        model: getRefinementModel(),
      })
      const openAiDuration = nowMs() - openAiStartedAt
      const totalDuration = nowMs() - requestStartedAt

      logSearchFlowEvent('retry_advice_completed', {
        route: '/api/search/retry-advice',
        query: normalizedQuery,
        recommendation: advice.recommendation,
        suggestedQueryLength: advice.suggestedQuery.length,
        feedbackLength: rejectionFeedback.length,
        openaiMs: Math.round(openAiDuration * 10) / 10,
        openaiUsage: advice.usage || null,
        totalMs: Math.round(totalDuration * 10) / 10,
      })

      sendJson(response, 200, {
        recommendation: advice.recommendation,
        suggestedQuery: advice.suggestedQuery,
        rationale: advice.rationale,
        query: normalizedQuery,
      }, {
        serverTiming: [
          { name: 'body', duration: body.bodyReadDuration || 0 },
          { name: 'openai', duration: openAiDuration },
          { name: 'total', duration: totalDuration },
        ],
      })
    } catch (error) {
      logSearchFlowEvent('retry_advice_failed', {
        route: '/api/search/retry-advice',
        query: normalizedQuery,
        totalMs: Math.round((nowMs() - requestStartedAt) * 10) / 10,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      reportBackendError?.(error, {
        query: normalizedQuery,
        route: '/api/search/retry-advice',
        source: 'retry_advice',
        totalMs: Math.round((nowMs() - requestStartedAt) * 10) / 10,
      })
      sendJson(response, 500, buildInternalErrorPayload('Unable to suggest a better search direction.', error))
    }
  }
}
