import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_FINALIZE_MODEL,
  miniEnrichSelectedCandidates,
} from './lib/ai-selector.js'
import { DEFAULT_RATE_LIMIT_CONFIG } from './lib/rate-limit.js'
import { ALLOWED_ORIGIN, attachCorsOrigin, buildInternalErrorPayload, resolveCorsOrigin, sendJson } from './lib/http.js'
import { emitEnrichmentReady, enrichmentBus } from './lib/enrichment-bus.js'
import { initObservability, registerProcessErrorHandlers, reportBackendError } from './lib/observability.js'
import {
  resolveDiscoveryContext,
} from './lib/handlers/discovery-handler.js'
import { getRefinementModel } from './lib/handlers/refine-handler.js'
import { createRetryAdviceHandler } from './lib/handlers/retry-advice-handler.js'
import { createFeedbackHandler } from './lib/handlers/feedback-handler.js'
import { createSupabaseHealthHandler } from './lib/handlers/supabase-health-handler.js'
import {
  getValidatedSearchRequest,
  writeSearchSnapshot,
} from './lib/search-pipeline.js'
import { fetchOxylabsProductDetailsByAsin } from './lib/oxylabs-pipeline.js'
import {
  recordOxylabsProductFailures,
  readProductDetailsCacheEntries,
  writeProductDetailsCacheEntries,
} from './lib/search-storage.js'
import { getEnv, validateSearchInput } from './lib/search-data.js'
import { normalizeCachedProductDetailsEntry } from './lib/product-details-cache.js'
import {
  CACHE_SCOPE_DISCOVERY,
  CACHE_SCOPE_RAINFOREST,
  FINALIZE_MAX_NOTE_LENGTH,
  FINALIZE_MAX_REJECTION_FEEDBACK_LENGTH,
  RATE_LIMIT_WAIT_MESSAGE,
  getAmazonMarketplaceScope,
  getRequestedAmazonDomain,
  logSearchFlowEvent,
  nowMs,
  roundTimingDuration,
  runInBackground,
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
const ENRICHMENT_STREAM_TIMEOUT_MS = 30000
const PRODUCT_DETAILS_ASIN_MAX_LENGTH = 200

export function mergeProductDetailsIntoCandidatePool(candidatePool, productDetailsById) {
  if (!productDetailsById?.size) {
    return candidatePool
  }

  return {
    ...candidatePool,
    candidates: candidatePool.candidates.map((candidate) => {
      const productDetails = productDetailsById.get(String(candidate.id))

      if (!productDetails) {
        return candidate
      }

      return {
        ...candidate,
        feature_bullets: productDetails.feature_bullets,
        productDescription: productDetails.productDescription,
        isPrime: Boolean(candidate.isPrime || productDetails.isPrime),
        delivery: productDetails.delivery || candidate.delivery || '',
      }
    }),
  }
}

function normalizeProductDetailsAsin(value = '') {
  return String(value || '').trim().slice(0, PRODUCT_DETAILS_ASIN_MAX_LENGTH)
}

function buildProductDetailsPayload(asin, entry) {
  const normalizedEntry = normalizeCachedProductDetailsEntry(entry)

  if (!normalizedEntry) {
    return {
      asin,
      ready: false,
      feature_bullets: [],
      productDescription: '',
    }
  }

  return {
    asin,
    ready: normalizedEntry.feature_bullets.length > 0 || normalizedEntry.productDescription.length > 0,
    feature_bullets: normalizedEntry.feature_bullets,
    productDescription: normalizedEntry.productDescription,
    ...(normalizedEntry.isPrime ? { isPrime: true } : {}),
    ...(normalizedEntry.delivery ? { delivery: normalizedEntry.delivery } : {}),
    source: normalizedEntry.source,
  }
}

function mergeCandidateFactsIntoEnrichmentEntries(entries, candidatePool) {
  if (!Array.isArray(entries) || !Array.isArray(candidatePool?.candidates)) {
    return entries
  }

  const candidateById = new Map(
    candidatePool.candidates.map((candidate) => [String(candidate.id), candidate]),
  )

  return entries.map((entry) => {
    const candidateId = String(entry?.candidate_id || entry?.candidateId || '')
    const candidate = candidateById.get(candidateId)

    if (!candidate) {
      return entry
    }

    const isPrime = Boolean(entry?.isPrime || candidate.isPrime)
    const delivery = candidate.delivery || entry?.delivery || ''

    return {
      ...entry,
      ...(isPrime ? { isPrime: true } : {}),
      ...(delivery ? { delivery } : {}),
    }
  })
}

export async function handleProductDetails(requestUrl, response) {
  const asin = normalizeProductDetailsAsin(
    requestUrl.searchParams.get('asin') ||
    requestUrl.searchParams.get('id') ||
    requestUrl.searchParams.get('productId') ||
    '',
  )
  const amazonDomain = getRequestedAmazonDomain(requestUrl.searchParams.get('amazonDomain') || '') || 'amazon.com'

  if (!asin) {
    sendJson(response, 400, { error: 'Product ASIN is required.' })
    return
  }

  try {
    const cachedDetails = await readProductDetailsCacheEntries([asin])
    const cachedEntry = normalizeCachedProductDetailsEntry(cachedDetails?.get?.(asin))

    if (cachedEntry && (cachedEntry.feature_bullets.length > 0 || cachedEntry.productDescription.length > 0)) {
      sendJson(response, 200, buildProductDetailsPayload(asin, cachedEntry))
      return
    }

    const oxylabsUsername = getEnv('OXYLABS_USERNAME')
    const oxylabsPassword = getEnv('OXYLABS_PASSWORD')

    if (!oxylabsUsername || !oxylabsPassword) {
      sendJson(response, 200, buildProductDetailsPayload(asin, cachedEntry))
      return
    }

    const detailFailures = []
    const detailsById = await fetchOxylabsProductDetailsByAsin({
      asins: [asin],
      oxylabsUsername,
      oxylabsPassword,
      amazonDomain,
      readCache: readProductDetailsCacheEntries,
      writeCache: writeProductDetailsCacheEntries,
      onAsinFailure: (failedAsin, failureType, statusCode) => {
        detailFailures.push({ asin: failedAsin, failureType, statusCode, query: '' })
      },
    })

    if (detailFailures.length > 0) {
      await recordOxylabsProductFailures(detailFailures)
    }

    sendJson(response, 200, buildProductDetailsPayload(asin, detailsById.get(asin) || cachedEntry))
  } catch (error) {
    reportBackendError(error, {
      amazonDomain,
      asin,
      route: '/api/search/product-details',
      source: 'product_details',
    })
    sendJson(response, 500, buildInternalErrorPayload('Unable to load product details.', error))
  }
}

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


// Runs mini enrichment after Haiku has locked the shortlist, stores result in the token-scoped session snapshot.
export async function runMiniEnrichmentAsync({
  lockedIds,
  candidatePool,
  apiKey,
  model,
  normalizedQuery,
  discoveryToken,
  discoveryScope = CACHE_SCOPE_DISCOVERY,
}) {
  const miniResult = await miniEnrichSelectedCandidates({
    lockedIds,
    candidatePool,
    apiKey,
    model,
  })

  const resolvedDiscoveryContext = await resolveDiscoveryContext(
    normalizedQuery,
    discoveryToken,
    [discoveryScope],
  )

  if (!resolvedDiscoveryContext.isValid) {
    return
  }

  const { cachedEntry } = resolvedDiscoveryContext

  const updatedSelection = {
    ...(cachedEntry.selection && typeof cachedEntry.selection === 'object' ? cachedEntry.selection : {}),
    enrichment: {
      entries: mergeCandidateFactsIntoEnrichmentEntries(miniResult.enriched, candidatePool),
      model: miniResult.model,
      generatedAt: new Date().toISOString(),
      preservedOrder: miniResult.preservedOrder,
    },
  }

  await writeSearchSnapshot({
    productQuery: normalizedQuery,
    details: '',
    candidatePool: cachedEntry.candidatePool,
    discoveryToken: discoveryToken || cachedEntry.discoveryToken || '',
    results: Array.isArray(cachedEntry.results) ? cachedEntry.results : [],
    selection: updatedSelection,
    source: 'enrichment_update',
    scope: discoveryScope,
  })

  emitEnrichmentReady(
    discoveryToken || cachedEntry.discoveryToken || '',
    updatedSelection.enrichment.entries,
    miniResult.model,
  )

  logSearchFlowEvent('mini_enrichment_stored', {
    query: normalizedQuery,
    entryCount: updatedSelection.enrichment.entries.length,
    preservedOrder: miniResult.preservedOrder,
    model: miniResult.model,
  })

  return miniResult
}

function mergeLateProductDetailsIntoEnrichmentEntries(entries, productDetailsById) {
  if (!Array.isArray(entries) || !productDetailsById?.size) {
    return {
      changed: false,
      entries,
    }
  }

  let changed = false
  const nextEntries = entries.map((entry) => {
    const candidateId = String(entry?.candidate_id || entry?.candidateId || '')
    const productDetails = productDetailsById.get(candidateId)

    if (!productDetails) {
      return entry
    }

    const nextFeatureBullets = Array.isArray(productDetails.feature_bullets)
      ? productDetails.feature_bullets
      : []
    const currentFeatureBullets = Array.isArray(entry?.feature_bullets)
      ? entry.feature_bullets
      : Array.isArray(entry?.featureBullets)
        ? entry.featureBullets
        : []

    const nextIsPrime = Boolean(entry?.isPrime || productDetails.isPrime)
    const nextDelivery = productDetails.delivery || entry?.delivery || ''

    if (
      JSON.stringify(currentFeatureBullets) === JSON.stringify(nextFeatureBullets) &&
      Boolean(entry?.isPrime) === nextIsPrime &&
      (entry?.delivery || '') === nextDelivery
    ) {
      return entry
    }

    changed = true

    return {
      ...entry,
      feature_bullets: nextFeatureBullets,
      ...(nextIsPrime ? { isPrime: true } : {}),
      ...(nextDelivery ? { delivery: nextDelivery } : {}),
    }
  })

  return {
    changed,
    entries: nextEntries,
  }
}

export async function applyLateProductDetailsToEnrichment({
  normalizedQuery,
  discoveryToken,
  discoveryScope = CACHE_SCOPE_DISCOVERY,
  productDetailsById,
  maxAttempts = 8,
  retryDelayMs = 250,
}) {
  if (!productDetailsById?.size) {
    return false
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const resolvedDiscoveryContext = await resolveDiscoveryContext(
      normalizedQuery,
      discoveryToken,
      [discoveryScope],
    )

    if (!resolvedDiscoveryContext.isValid) {
      return false
    }

    const { cachedEntry } = resolvedDiscoveryContext
    const enrichment = cachedEntry?.selection?.enrichment

    if (Array.isArray(enrichment?.entries) && enrichment.entries.length > 0) {
      const mergedEnrichment = mergeLateProductDetailsIntoEnrichmentEntries(
        enrichment.entries,
        productDetailsById,
      )

      if (!mergedEnrichment.changed) {
        return false
      }

      const updatedSelection = {
        ...(cachedEntry.selection && typeof cachedEntry.selection === 'object' ? cachedEntry.selection : {}),
        enrichment: {
          ...enrichment,
          entries: mergedEnrichment.entries,
          generatedAt: new Date().toISOString(),
        },
      }

      await writeSearchSnapshot({
        productQuery: normalizedQuery,
        details: '',
        candidatePool: cachedEntry.candidatePool,
        discoveryToken: discoveryToken || cachedEntry.discoveryToken || '',
        results: Array.isArray(cachedEntry.results) ? cachedEntry.results : [],
        selection: updatedSelection,
        source: 'enrichment_update',
        scope: discoveryScope,
      })

      emitEnrichmentReady(
        discoveryToken || cachedEntry.discoveryToken || '',
        mergedEnrichment.entries,
        enrichment.model || '',
      )

      logSearchFlowEvent('mini_enrichment_detail_retry_hydrated', {
        query: normalizedQuery,
        entryCount: mergedEnrichment.entries.length,
      })

      return true
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }

  return false
}

export async function handleEnrichmentPoll(request, response) {
  const requestUrl = new URL(request.url, 'http://localhost')
  const token = requestUrl.searchParams.get('token') || ''
  const query = requestUrl.searchParams.get('query') || ''
  const amazonDomain = getRequestedAmazonDomain(requestUrl.searchParams.get('amazonDomain') || '')

  if (!token || !query) {
    sendJson(response, 400, { error: 'token and query are required.' })
    return
  }

  const { isValid, normalizedQuery } = validateSearchInput(query, '')

  if (!isValid) {
    sendJson(response, 400, { error: 'Invalid query.' })
    return
  }

  const enrichmentScopes = amazonDomain
    ? [getAmazonMarketplaceScope(CACHE_SCOPE_RAINFOREST, amazonDomain)]
    : [CACHE_SCOPE_DISCOVERY, CACHE_SCOPE_RAINFOREST]
  const resolvedDiscoveryContext = await resolveDiscoveryContext(normalizedQuery, token, enrichmentScopes)

  if (!resolvedDiscoveryContext.isValid) {
    sendJson(response, resolvedDiscoveryContext.statusCode, { error: resolvedDiscoveryContext.error })
    return
  }

  const { cachedEntry } = resolvedDiscoveryContext

  const enrichment = cachedEntry?.selection?.enrichment

  if (!enrichment?.entries?.length) {
    sendJson(response, 200, { ready: false })
    return
  }

  sendJson(response, 200, {
    ready: true,
    entries: enrichment.entries,
    model: enrichment.model || '',
  })
}

export async function handleEnrichmentStream(request, response) {
  const requestUrl = new URL(request.url, 'http://localhost')
  const token = requestUrl.searchParams.get('token') || ''
  const query = requestUrl.searchParams.get('query') || ''
  const amazonDomain = getRequestedAmazonDomain(requestUrl.searchParams.get('amazonDomain') || '')

  if (!token || !query) {
    sendJson(response, 400, { error: 'token and query are required.' })
    return
  }

  const { isValid, normalizedQuery } = validateSearchInput(query, '')

  if (!isValid) {
    sendJson(response, 400, { error: 'Invalid query.' })
    return
  }

  const enrichmentScopes = amazonDomain
    ? [getAmazonMarketplaceScope(CACHE_SCOPE_RAINFOREST, amazonDomain)]
    : [CACHE_SCOPE_DISCOVERY, CACHE_SCOPE_RAINFOREST]
  const resolvedDiscoveryContext = await resolveDiscoveryContext(normalizedQuery, token, enrichmentScopes)

  if (!resolvedDiscoveryContext.isValid) {
    sendJson(response, resolvedDiscoveryContext.statusCode, { error: resolvedDiscoveryContext.error })
    return
  }

  const { cachedEntry } = resolvedDiscoveryContext
  const enrichment = cachedEntry?.selection?.enrichment

  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': resolveCorsOrigin(request.headers?.origin),
    Vary: 'Origin',
  })
  response.flushHeaders()

  if (enrichment?.entries?.length) {
    response.write(`data: ${JSON.stringify({
      ready: true,
      entries: enrichment.entries,
      model: enrichment.model || '',
    })}\n\n`)
    response.end()
    return
  }

  const eventName = `enrichment:${token}`
  let completed = false

  function cleanup() {
    enrichmentBus.off(eventName, handleReady)
    clearTimeout(timeoutId)
  }

  function finish(payload) {
    if (completed) {
      return
    }

    completed = true
    cleanup()
    response.write(`data: ${JSON.stringify(payload)}\n\n`)
    response.end()
  }

  function handleReady(payload) {
    finish({
      ready: true,
      entries: payload?.entries,
      model: payload?.model,
    })
  }

  const timeoutId = setTimeout(() => {
    finish({ ready: false })
  }, ENRICHMENT_STREAM_TIMEOUT_MS)

  enrichmentBus.on(eventName, handleReady)

  request.on('close', () => {
    if (completed) {
      return
    }

    completed = true
    cleanup()
  })
}

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
