import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { DEFAULT_RATE_LIMIT_CONFIG } from './lib/rate-limit.js'
import { attachCorsOrigin, buildInternalErrorPayload, resolveCorsOrigin, sendJson } from './lib/http.js'
import { initObservability, registerProcessErrorHandlers, reportBackendError } from './lib/observability.js'
import { getRefinementModel } from './lib/handlers/refine-handler.js'
import { createRetryAdviceHandler } from './lib/handlers/retry-advice-handler.js'
import { createFeedbackHandler } from './lib/handlers/feedback-handler.js'
import { createSupabaseHealthHandler } from './lib/handlers/supabase-health-handler.js'
import {
  FINALIZE_MAX_NOTE_LENGTH,
  FINALIZE_MAX_REJECTION_FEEDBACK_LENGTH,
  RATE_LIMIT_WAIT_MESSAGE,
  logSearchFlowEvent,
  nowMs,
} from './lib/server-helpers.js'

const PORT = Number(process.env.PORT || 8787)
const RETRY_ADVICE_BODY_LIMIT_BYTES = 16 * 1024
const FEEDBACK_BODY_LIMIT_BYTES = 16 * 1024
const RETRY_ADVICE_MAX_SHORTLIST_ITEMS = 6
const RETRY_ADVICE_MAX_TITLE_LENGTH = 160
const FEEDBACK_MAX_SESSION_ID_LENGTH = 120
const FEEDBACK_MAX_SEARCH_ID_LENGTH = 100
const FEEDBACK_MAX_STAGE_LENGTH = 40
const FEEDBACK_MAX_PAGE_LENGTH = 120
const FEEDBACK_MAX_QUERY_LENGTH = 200
const FEEDBACK_MAX_FREE_TEXT_LENGTH = 2000
const FEEDBACK_MAX_EMAIL_LENGTH = 240
const FEEDBACK_MAX_SELECTED_PRODUCT_ID_LENGTH = 200

export const handleRetryAdvice = createRetryAdviceHandler({
  getRefinementModel,
  logSearchFlowEvent,
  nowMs,
  reportBackendError,
  rateLimitConfig: DEFAULT_RATE_LIMIT_CONFIG,
  bodyLimitBytes: RETRY_ADVICE_BODY_LIMIT_BYTES,
  maxNoteLength: FINALIZE_MAX_NOTE_LENGTH,
  maxRejectionFeedbackLength: FINALIZE_MAX_REJECTION_FEEDBACK_LENGTH,
  maxShortlistItems: RETRY_ADVICE_MAX_SHORTLIST_ITEMS,
  maxShortlistTitleLength: RETRY_ADVICE_MAX_TITLE_LENGTH,
  rateLimitWaitMessage: RATE_LIMIT_WAIT_MESSAGE,
})

export const handleFeedbackSubmission = createFeedbackHandler({
  bodyLimitBytes: FEEDBACK_BODY_LIMIT_BYTES,
  maxEmailLength: FEEDBACK_MAX_EMAIL_LENGTH,
  maxFreeTextLength: FEEDBACK_MAX_FREE_TEXT_LENGTH,
  maxPageLength: FEEDBACK_MAX_PAGE_LENGTH,
  maxQueryLength: FEEDBACK_MAX_QUERY_LENGTH,
  maxSearchIdLength: FEEDBACK_MAX_SEARCH_ID_LENGTH,
  maxSelectedProductIdLength: FEEDBACK_MAX_SELECTED_PRODUCT_ID_LENGTH,
  maxSessionIdLength: FEEDBACK_MAX_SESSION_ID_LENGTH,
  maxStageLength: FEEDBACK_MAX_STAGE_LENGTH,
})

export const handleSupabaseHealth = createSupabaseHealthHandler()

export {
  handleAnalyticsTrack,
  handleAnalyticsDashboard,
  handleCachePoolInspect,
  handleFinalizeHistory,
  handleSearchDebug,
} from './lib/handlers/analytics-handler.js'

export {
  handleCachedSearch,
  handleRainforestDiscoverySearch,
} from './lib/handlers/discovery-handler.js'

export { handleRefinementPrompt } from './lib/handlers/refine-handler.js'

export { handleFinalizeSelection } from './lib/handlers/finalize-handler.js'

export {
  handleQueryQualityPoll,
  startQueryQualityReview,
} from './lib/handlers/query-quality-handler.js'

export {
  handleEnrichmentPoll,
  handleEnrichmentStream,
  runMiniEnrichmentAsync,
  mergeProductDetailsIntoCandidatePool,
  applyLateProductDetailsToEnrichment,
} from './lib/handlers/enrichment-handler.js'

export { handleProductDetails } from './lib/handlers/product-details-handler.js'

export function createApiServer() {
  initObservability()
  registerProcessErrorHandlers()

  return createServer(async (request, response) => {
    attachCorsOrigin(response, request.headers?.origin)
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)

    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'Access-Control-Allow-Origin': resolveCorsOrigin(request.headers?.origin),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          Vary: 'Origin',
        })
        response.end()
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/search/rainforest-discover') {
        await handleRainforestDiscoverySearch(requestUrl, response, request)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/search/refine') {
        await handleRefinementPrompt(requestUrl, response)
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/search/retry-advice') {
        await handleRetryAdvice(request, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/health/supabase') {
        await handleSupabaseHealth(response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/search/debug') {
        await handleSearchDebug(requestUrl, response)
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/search/finalize') {
        await handleFinalizeSelection(request, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/search/enrichment') {
        await handleEnrichmentPoll(request, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/search/query-quality') {
        await handleQueryQualityPoll(request, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/search/product-details') {
        await handleProductDetails(requestUrl, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/search/enrichment-stream') {
        await handleEnrichmentStream(request, response)
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/analytics/track') {
        await handleAnalyticsTrack(request, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/analytics/dashboard') {
        await handleAnalyticsDashboard(request, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/analytics/cache-pool') {
        await handleCachePoolInspect(request, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/analytics/finalize-history') {
        handleFinalizeHistory(request, response)
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/feedback') {
        await handleFeedbackSubmission(request, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/search/cache') {
        await handleCachedSearch(requestUrl, response)
        return
      }

      sendJson(response, 404, { error: 'Not found.' })
    } catch (error) {
      reportBackendError(error, {
        method: request.method,
        route: requestUrl.pathname,
        source: 'node_http_server',
      })

      if (!response.headersSent) {
        sendJson(response, 500, buildInternalErrorPayload('Something went wrong on the server.', error))
        return
      }

      response.end()
    }
  })
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  initObservability()
  registerProcessErrorHandlers()
  const server = createApiServer()

  server.listen(PORT, () => {
    console.log(`API server listening on http://127.0.0.1:${PORT}`)
  })
}
