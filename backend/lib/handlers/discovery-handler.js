import { randomUUID } from 'node:crypto'
import { buildInternalErrorPayload, sendJson } from '../http.js'
import { DEFAULT_RATE_LIMIT_CONFIG, getClientIpAddress, getCountryCode, takeRateLimitToken } from '../rate-limit.js'
import { reportBackendError } from '../observability.js'
import {
  getValidatedSearchRequest,
  readCachedSearchSnapshot,
  recordSearchCacheEvent,
  writeSearchSnapshot,
} from '../search-pipeline.js'
import { recordSearchDiagnosticEvent } from '../search-storage.js'
import { buildCacheKey, getEnv } from '../search-data.js'
import { fetchRainforestArtifacts } from '../rainforest-pipeline.js'
import { acquireRainforestSearchSlot } from '../provider-guard.js'
import {
  CACHE_SCOPE_LIVE_SEARCH,
  CACHE_SCOPE_RAINFOREST,
  LIVE_RESULT_FILTER_CONFIG,
  RATE_LIMIT_WAIT_MESSAGE,
  getAmazonMarketplaceScope,
  logSearchFlowEvent,
  nowMs,
  resolveAmazonDomain,
  roundTimingDuration,
  runInBackground,
} from '../server-helpers.js'
import {
  getDiscoverySessionScope,
  resolveDiscoveryContext,
} from '../discovery-context.js'
import { startQueryQualityReview } from './query-quality-handler.js'
import {
  beginOpenAiQueryModeration,
  moderateQuery,
  MODERATION_OUTCOMES,
} from '../content-moderation.js'
import { applyCachedSensitiveImageVerdictsToGroups } from '../sensitive-image-reveal.js'
import { isSupabaseConfigured } from '../storage/supabase-client.js'
import { isOperationTimeoutError, runWithTimeout } from '../operation-timeout.js'

const DEFAULT_DISCOVERY_CACHE_READ_TIMEOUT_MS = 750
const DEFAULT_DISCOVERY_SESSION_BACKGROUND_TIMEOUT_MS = 5_000

function getStorageTimeoutMs(name, defaultValue) {
  const configured = Number(getEnv(name))

  if (!Number.isFinite(configured)) {
    return defaultValue
  }

  return Math.min(10_000, Math.max(50, Math.round(configured)))
}

function getStorageFailureOutcome(error) {
  return isOperationTimeoutError(error) ? 'timeout' : 'error'
}

function logDiscoveryStorageEvent(eventName, {
  amazonDomain,
  durationMs,
  error,
  operation,
  outcome,
  route = '/api/search/rainforest-discover',
  searchId,
} = {}) {
  logSearchFlowEvent(eventName, {
    route,
    searchId,
    amazonDomain,
    operation,
    outcome,
    durationMs: roundTimingDuration(durationMs),
    errorType: error?.name || undefined,
    error: error instanceof Error ? error.message : undefined,
  })
}

async function persistDiscoverySessionInBackground(operation, context = {}) {
  const startedAt = nowMs()

  try {
    const value = await runWithTimeout(operation, {
      label: 'Background discovery session snapshot write',
      timeoutMs: getStorageTimeoutMs(
        'DISCOVERY_SESSION_BACKGROUND_TIMEOUT_MS',
        DEFAULT_DISCOVERY_SESSION_BACKGROUND_TIMEOUT_MS,
      ),
    })
    const durationMs = nowMs() - startedAt
    if (isSupabaseConfigured() && value?.storage === 'local') {
      logDiscoveryStorageEvent('discovery_storage_degraded', {
        ...context,
        durationMs,
        operation: 'session_write',
        outcome: 'local_fallback',
      })
      return { durationMs, ok: false, outcome: 'local_fallback', value }
    }

    return { durationMs, ok: true, outcome: 'ok', value }
  } catch (error) {
    const durationMs = nowMs() - startedAt
    const outcome = getStorageFailureOutcome(error)
    logDiscoveryStorageEvent('discovery_storage_degraded', {
      ...context,
      durationMs,
      error,
      operation: 'session_write',
      outcome,
    })
    return { durationMs, error, ok: false, outcome, value: null }
  }
}

function logOpenAiQueryModeration({ moderation, normalizedQuery, route, synchronous }) {
  if (moderation.outcome === MODERATION_OUTCOMES.BLOCK) {
    logSearchFlowEvent('query_moderation_blocked', {
      route,
      query: normalizedQuery,
      categories: moderation.categories,
      moderationMode: synchronous ? 'synchronous' : 'parallel',
      moderationMs: roundTimingDuration(moderation.durationMs),
      penaltyApplied: moderation.penaltyApplied,
    })
    return
  }

  if (moderation.failedOpen) {
    logSearchFlowEvent('query_moderation_failed_open', {
      route,
      failureType: moderation.failureType,
      moderationMode: synchronous ? 'synchronous' : 'parallel',
      moderationMs: roundTimingDuration(moderation.durationMs),
    })
  }
}

function sendBlockedQuery(response) {
  sendJson(response, 400, {
    error: 'Focamai can’t help with this search. Try searching for a different product.',
  })
}

async function fetchDiscoveryArtifacts({
  filterConfig,
  productQuery,
  details,
  reasonFallback,
  rainforestApiKey,
  countryCode,
  amazonDomain,
}) {
  if (rainforestApiKey) {
    let rainforestResult

    try {
      rainforestResult = await fetchRainforestArtifacts({
        filterConfig,
        productQuery,
        details,
        reasonFallback,
        rainforestApiKey,
        countryCode,
        amazonDomain,
      })
    } catch (error) {
      const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      rainforestResult = {
        error: {
          error: isTimeout ? 'Rainforest API request timed out.' : 'Rainforest API request failed.',
          statusCode: isTimeout ? 504 : 502,
          failureType: isTimeout ? 'timeout' : 'provider_error',
        },
        artifacts: null,
        diagnostics: null,
      }
    }

    return {
      ...rainforestResult,
      source: 'rainforest_discovery',
      fallbackFrom: null,
      diagnostics: rainforestResult.diagnostics || null,
    }
  }

  return {
    error: {
      error: 'RAINFOREST_API_KEY is required in the root .env file.',
      statusCode: 500,
    },
    artifacts: null,
    source: 'rainforest_discovery',
    fallbackFrom: null,
    diagnostics: null,
  }
}

function getDiagnosticContext(requestUrl) {
  return {
    searchId: String(requestUrl?.searchParams?.get('searchId') || '').trim(),
    sessionId: String(requestUrl?.searchParams?.get('sessionId') || '').trim(),
    platform: String(requestUrl?.searchParams?.get('platform') || 'web').trim() || 'web',
  }
}

function recordDiscoveryDiagnosticEvent(context, event = {}) {
  if (!context.searchId) {
    return
  }

  void recordSearchDiagnosticEvent({
    searchId: context.searchId,
    sessionId: context.sessionId,
    platform: context.platform,
    provider: 'rainforest',
    ...event,
  })
}

function shouldRefreshDiscoveryCache(requestUrl) {
  const cacheMode = String(requestUrl?.searchParams?.get('cacheMode') || '').trim().toLowerCase()
  const bypassCache = String(requestUrl?.searchParams?.get('bypassCache') || '').trim().toLowerCase()

  return cacheMode === 'refresh' || bypassCache === 'true'
}

function isThinDiscoveryCacheHit(cachedEntry, normalizedCachedResults = []) {
  if (!cachedEntry?.candidatePool || !cachedEntry?.results?.length) {
    return false
  }

  const candidateCount = Array.isArray(cachedEntry.candidatePool?.candidates)
    ? cachedEntry.candidatePool.candidates.length
    : 0
  const resultCount = Array.isArray(normalizedCachedResults)
    ? normalizedCachedResults.length
    : 0
  const minimumUsefulCount = LIVE_RESULT_FILTER_CONFIG.finalResultLimit

  return candidateCount < minimumUsefulCount || resultCount < minimumUsefulCount
}

function createDiscoveryToken() {
  return `${Date.now().toString(36)}.${randomUUID()}`
}

async function ensureDiscoverySnapshotToken({
  normalizedQuery,
  normalizedDetails = '',
  cachedEntry,
  discoveryToken = createDiscoveryToken(),
  source = 'guided_discovery',
}) {
  const selectionWithoutEnrichment =
    cachedEntry?.selection && typeof cachedEntry.selection === 'object' && !Array.isArray(cachedEntry.selection)
      ? { ...cachedEntry.selection, enrichment: null }
      : cachedEntry?.selection ?? null
  const sessionScope = getDiscoverySessionScope(discoveryToken)

  const updatedEntry = await writeSearchSnapshot({
    productQuery: normalizedQuery,
    details: normalizedDetails,
    candidatePool: cachedEntry?.candidatePool ?? null,
    discoveryToken,
    results: Array.isArray(cachedEntry?.results) ? cachedEntry.results : [],
    selection: selectionWithoutEnrichment,
    source,
    scope: sessionScope,
  })

  return {
    cachedEntry: {
      ...cachedEntry,
      discoveryToken,
      selection: selectionWithoutEnrichment,
      cachedAt: updatedEntry?.cachedAt || cachedEntry?.cachedAt,
      expiresAt: updatedEntry?.expiresAt || cachedEntry?.expiresAt,
    },
    discoveryToken,
    storage: updatedEntry?.storage,
  }
}

function buildDiscoveryPreviewSelection(results, extraSelection = {}) {
  return {
    mode: 'discovery_preview',
    model: null,
    selectedCandidateIds: results.map((item) => item.id),
    details: 'Discovery preview results were cached for the guided search flow. Finalized picks stay request-specific.',
    ...extraSelection,
  }
}

export async function handleCachedSearch(requestUrl, response) {
  const { error, isValid, normalizedDetails, normalizedQuery } = getValidatedSearchRequest(requestUrl)

  if (!isValid) {
    sendJson(response, 400, { error })
    return
  }

  const { cachedEntry, normalizedCachedResults } = await readCachedSearchSnapshot({
    productQuery: normalizedQuery,
    details: normalizedDetails,
    scope: CACHE_SCOPE_LIVE_SEARCH,
  })

  if (cachedEntry?.results?.length) {
    sendJson(response, 200, {
      results: normalizedCachedResults.slice(0, LIVE_RESULT_FILTER_CONFIG.finalResultLimit),
      source: 'cache',
      cachedAt: cachedEntry.cachedAt,
    })
    return
  }

  sendJson(response, 404, {
    error: 'No cached test results exist for this search yet.',
    details: 'Run the cache script first to save a temporary 6-item SerpApi sample for this query.',
  })
}

export async function handleRainforestDiscoverySearch(requestUrl, response, request = { headers: {} }) {
  const requestStartedAt = nowMs()
  const diagnosticContext = getDiagnosticContext(requestUrl)
  const supportSearchId = diagnosticContext.searchId || null
  const rainforestApiKey = getEnv('RAINFOREST_API_KEY')
  const openAiApiKey = getEnv('OPENAI_API_KEY')

  if (!rainforestApiKey) {
    logSearchFlowEvent('rainforest_discovery_configuration_error', {
      route: '/api/search/rainforest-discover',
      searchId: supportSearchId,
    })
    recordDiscoveryDiagnosticEvent(diagnosticContext, {
      stage: 'backend_response_sent',
      status: 'failed',
      finalStatus: 'provider_error',
      errorMessage: 'Rainforest API is not configured.',
    })
    sendJson(response, 500, {
      error: 'RAINFOREST_API_KEY is required in the root .env file.',
    })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const countryCode = getCountryCode(request.headers || {})
  const amazonDomain = resolveAmazonDomain({ requestUrl, countryCode })
  const rainforestScope = getAmazonMarketplaceScope(CACHE_SCOPE_RAINFOREST, amazonDomain)
  const rateLimitStartedAt = nowMs()
  const rateLimit = await takeRateLimitToken(clientIpAddress, DEFAULT_RATE_LIMIT_CONFIG)
  const rateLimitDuration = nowMs() - rateLimitStartedAt

  if (rateLimit.fallbackReason === 'timeout' || rateLimit.fallbackReason === 'error') {
    logDiscoveryStorageEvent('discovery_storage_fallback', {
      amazonDomain,
      durationMs: rateLimitDuration,
      operation: 'rate_limit',
      outcome: rateLimit.fallbackReason,
      searchId: supportSearchId,
    })
  }

  if (!rateLimit.allowed) {
    logSearchFlowEvent('rainforest_discovery_rate_limited', {
      route: '/api/search/rainforest-discover',
      searchId: supportSearchId,
    })
    recordDiscoveryDiagnosticEvent(diagnosticContext, {
      stage: 'backend_response_sent',
      status: 'rate_limited',
      amazonDomain,
      finalStatus: 'frontend_error',
      errorMessage: 'Search rate limit reached.',
    })
    sendJson(response, 429, {
      error: `Too many searches from this connection. ${RATE_LIMIT_WAIT_MESSAGE}`,
    })
    return
  }

  const { error, isValid, normalizedQuery } = getValidatedSearchRequest(requestUrl, {
    includeDetails: false,
  })

  if (!isValid) {
    recordDiscoveryDiagnosticEvent(diagnosticContext, {
      stage: 'backend_received',
      status: 'invalid_request',
      query: '',
      amazonDomain,
      finalStatus: 'frontend_error',
      errorMessage: error,
    })
    sendJson(response, 400, { error })
    return
  }

  const queryModeration = moderateQuery(normalizedQuery)
  if (queryModeration.outcome === MODERATION_OUTCOMES.BLOCK) {
    sendBlockedQuery(response)
    return
  }

  const openAiQueryModeration = beginOpenAiQueryModeration(normalizedQuery, {
    apiKey: openAiApiKey,
    clientIp: clientIpAddress,
    timeoutMs: getEnv('OPENAI_MODERATION_TIMEOUT_MS'),
  })
  let resolvedOpenAiQueryModeration = null

  async function awaitOpenAiQueryModeration() {
    if (!resolvedOpenAiQueryModeration) {
      resolvedOpenAiQueryModeration = await openAiQueryModeration.promise
      logOpenAiQueryModeration({
        moderation: resolvedOpenAiQueryModeration,
        normalizedQuery,
        route: '/api/search/rainforest-discover',
        synchronous: openAiQueryModeration.synchronous,
      })
    }
    return resolvedOpenAiQueryModeration
  }

  if (openAiQueryModeration.synchronous) {
    const moderation = await awaitOpenAiQueryModeration()
    if (moderation.outcome === MODERATION_OUTCOMES.BLOCK) {
      sendBlockedQuery(response)
      return
    }
  }

  recordDiscoveryDiagnosticEvent(diagnosticContext, {
    stage: 'backend_received',
    status: 'ok',
    query: normalizedQuery,
    amazonDomain,
  })

  const normalizedDetails = ''
  const discoveryCacheKey = buildCacheKey(normalizedQuery, normalizedDetails, rainforestScope)
  const cacheLookupStartedAt = nowMs()
  let cachedEntry = null
  let normalizedCachedResults = []
  let cacheLookupOutcome = 'ok'

  try {
    const cachedSnapshot = await runWithTimeout(
      () => readCachedSearchSnapshot({
        productQuery: normalizedQuery,
        details: normalizedDetails,
        scope: rainforestScope,
      }),
      {
        label: 'Discovery cache read',
        timeoutMs: getStorageTimeoutMs(
          'DISCOVERY_CACHE_READ_TIMEOUT_MS',
          DEFAULT_DISCOVERY_CACHE_READ_TIMEOUT_MS,
        ),
      },
    )
    cachedEntry = cachedSnapshot.cachedEntry
    normalizedCachedResults = cachedSnapshot.normalizedCachedResults
  } catch (error) {
    cacheLookupOutcome = getStorageFailureOutcome(error)
    logDiscoveryStorageEvent('discovery_storage_fallback', {
      amazonDomain,
      durationMs: nowMs() - cacheLookupStartedAt,
      error,
      operation: 'cache_read',
      outcome: cacheLookupOutcome,
      searchId: supportSearchId,
    })
  }
  const cacheLookupDuration = nowMs() - cacheLookupStartedAt
  const refreshCache = shouldRefreshDiscoveryCache(requestUrl)
  const thinCacheHit = isThinDiscoveryCacheHit(cachedEntry, normalizedCachedResults)
  const providerCacheStatus = refreshCache ? 'refresh' : thinCacheHit ? 'thin_cache_refresh' : 'miss'

  if (cachedEntry?.candidatePool && cachedEntry?.results?.length && !refreshCache && !thinCacheHit) {
    if (!openAiQueryModeration.synchronous) {
      const moderation = await awaitOpenAiQueryModeration()
      if (moderation.outcome === MODERATION_OUTCOMES.BLOCK) {
        sendBlockedQuery(response)
        return
      }
    }

    const discoveryToken = createDiscoveryToken()
    const discoverySessionScope = getDiscoverySessionScope(discoveryToken)
    const sessionPersistence = ensureDiscoverySnapshotToken({
      discoveryToken,
      normalizedQuery,
      normalizedDetails,
      cachedEntry,
      source: cachedEntry?.source || 'guided_discovery',
    })
    runInBackground(
      async () => {
        await persistDiscoverySessionInBackground(sessionPersistence, {
          amazonDomain,
          searchId: supportSearchId,
        })
      },
      {
        amazonDomain,
        label: 'persist_cached_discovery_session',
        query: normalizedQuery,
        route: '/api/search/rainforest-discover',
        searchId: supportSearchId,
      },
    )
    if (!cachedEntry.candidatePool?.searchCorrection?.suggestedQuery) {
      runInBackground(
        async () => {
          await sessionPersistence
          startQueryQualityReview({
            normalizedQuery,
            amazonDomain,
            candidatePool: cachedEntry.candidatePool,
            previewResults: normalizedCachedResults,
            discoveryToken,
            discoveryScope: discoverySessionScope,
          })
        },
        {
          amazonDomain,
          label: 'start_cached_query_quality_after_session',
          query: normalizedQuery,
          route: '/api/search/rainforest-discover',
          searchId: supportSearchId,
        },
      )
    }
    const moderationDuration = Number.isFinite(resolvedOpenAiQueryModeration?.durationMs)
      ? resolvedOpenAiQueryModeration.durationMs
      : 0

    runInBackground(
      () => recordSearchCacheEvent({
        cacheKey: discoveryCacheKey,
        cacheStatus: 'hit',
        candidateCount: Array.isArray(cachedEntry.candidatePool?.candidates)
          ? cachedEntry.candidatePool.candidates.length
          : normalizedCachedResults.length,
        details: normalizedDetails,
        productQuery: normalizedQuery,
        resultCount: normalizedCachedResults.length,
        selectionMode: cachedEntry.selection?.mode || 'discovery_cache',
        source: cachedEntry.source || 'cache',
      }),
      {
        label: 'record_guided_discovery_cache_hit',
        query: normalizedQuery,
        route: '/api/search/rainforest-discover',
        searchId: supportSearchId,
      },
    )

    logSearchFlowEvent('rainforest_discovery_cache_hit', {
      route: '/api/search/rainforest-discover',
      searchId: supportSearchId,
      query: normalizedQuery,
      candidateCount: Array.isArray(cachedEntry.candidatePool?.candidates)
        ? cachedEntry.candidatePool.candidates.length
        : normalizedCachedResults.length,
      previewCount: normalizedCachedResults.length,
      rateLimitMs: roundTimingDuration(rateLimitDuration),
      cacheMs: roundTimingDuration(cacheLookupDuration),
      cacheOutcome: cacheLookupOutcome,
      moderationMs: roundTimingDuration(moderationDuration),
      sessionOutcome: 'pending',
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })

    sendJson(response, 200, {
      discoveryToken,
      guidedAvailable: true,
      sessionStatus: 'pending',
      amazonDomain,
      candidatePool: cachedEntry.candidatePool,
      previewResults: normalizedCachedResults,
      source: 'cache',
      cachedAt: cachedEntry.cachedAt,
    }, {
      serverTiming: [
        { name: 'rate-limit', duration: rateLimitDuration },
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'moderation', duration: moderationDuration },
        { name: 'session', duration: 0 },
        { name: 'total', duration: nowMs() - requestStartedAt },
      ],
    })

    recordDiscoveryDiagnosticEvent(diagnosticContext, {
      stage: 'backend_response_sent',
      status: 'success',
      query: normalizedQuery,
      amazonDomain,
      durationMs: roundTimingDuration(nowMs() - requestStartedAt),
      finalStatus: 'success',
      resultCountBeforeInternalFilters: normalizedCachedResults.length,
      resultCountAfterInternalFilters: normalizedCachedResults.length,
      cachedOrFallbackUsed: true,
      metadata: { sessionStatus: 'pending' },
    })
    return
  }

  if (cachedEntry?.candidatePool && cachedEntry?.results?.length && (refreshCache || thinCacheHit)) {
    logSearchFlowEvent('rainforest_discovery_cache_refresh', {
      route: '/api/search/rainforest-discover',
      searchId: supportSearchId,
      query: normalizedQuery,
      cacheStatus: thinCacheHit ? 'thin_cache_bypass' : 'refresh_bypass',
      cachedCandidateCount: Array.isArray(cachedEntry.candidatePool?.candidates)
        ? cachedEntry.candidatePool.candidates.length
        : normalizedCachedResults.length,
      cachedPreviewCount: normalizedCachedResults.length,
      cacheMs: roundTimingDuration(cacheLookupDuration),
    })
  }

  try {
    const discoveryToken = createDiscoveryToken()
    const discoverySessionScope = getDiscoverySessionScope(discoveryToken)
    const providerSlot = acquireRainforestSearchSlot(clientIpAddress)

    if (!providerSlot.allowed) {
      logSearchFlowEvent('rainforest_paid_call_guard_blocked', {
        route: '/api/search/rainforest-discover',
        searchId: supportSearchId,
        query: normalizedQuery,
        amazonDomain,
        reason: providerSlot.reason,
      })
      sendJson(response, 429, {
        error: `Search capacity is busy. ${RATE_LIMIT_WAIT_MESSAGE}`,
      })
      return
    }

    const providerStartedAt = nowMs()
    recordDiscoveryDiagnosticEvent(diagnosticContext, {
      stage: 'rainforest_request_started',
      status: 'started',
      query: normalizedQuery,
      amazonDomain,
    })
    const discoveryArtifactsOutcomePromise = fetchDiscoveryArtifacts({
      filterConfig: LIVE_RESULT_FILTER_CONFIG,
      productQuery: normalizedQuery,
      details: normalizedDetails,
      reasonFallback: 'Returned by the Rainforest API search route',
      rainforestApiKey,
      countryCode,
      amazonDomain,
    })
      .then((value) => ({ value }), (error) => ({ error }))
      .finally(() => providerSlot.release())

    if (!openAiQueryModeration.synchronous) {
      const moderation = await awaitOpenAiQueryModeration()
      if (moderation.outcome === MODERATION_OUTCOMES.BLOCK) {
        sendBlockedQuery(response)
        return
      }
    }

    const discoveryArtifactsOutcome = await discoveryArtifactsOutcomePromise
    if (discoveryArtifactsOutcome.error) throw discoveryArtifactsOutcome.error
    const {
      artifacts,
      error: artifactsError,
      fallbackFrom,
      source: discoverySource,
      diagnostics,
    } = discoveryArtifactsOutcome.value

    if (artifactsError) {
      const finalStatus = artifactsError.failureType === 'timeout'
        ? 'timeout'
        : artifactsError.statusCode === 404
          ? 'empty'
          : 'provider_error'
      logSearchFlowEvent('rainforest_discovery_provider_failed', {
        route: '/api/search/rainforest-discover',
        searchId: supportSearchId,
        query: normalizedQuery,
        amazonDomain,
        finalStatus,
        providerStatusCode: artifactsError.providerStatusCode || artifactsError.statusCode,
        error: artifactsError.error,
      })
      recordDiscoveryDiagnosticEvent(diagnosticContext, {
        stage: artifactsError.failureType === 'timeout'
          ? 'rainforest_timeout'
          : artifactsError.statusCode === 404
            ? 'empty_results'
            : 'rainforest_error',
        status: 'failed',
        query: normalizedQuery,
        amazonDomain,
        durationMs: roundTimingDuration(nowMs() - providerStartedAt),
        providerStatusCode: artifactsError.providerStatusCode || artifactsError.statusCode,
        resultCountBeforeInternalFilters: diagnostics?.rawResultCount,
        resultCountAfterInternalFilters: diagnostics?.resultCountAfterInternalFilters,
        finalStatus,
        errorMessage: artifactsError.error,
      })
      recordDiscoveryDiagnosticEvent(diagnosticContext, {
        stage: 'backend_response_sent',
        status: 'failed',
        query: normalizedQuery,
        amazonDomain,
        durationMs: roundTimingDuration(nowMs() - requestStartedAt),
        finalStatus,
        errorMessage: artifactsError.error,
      })
      sendJson(response, artifactsError.statusCode, {
        error: artifactsError.error,
      })
      return
    }
    const providerDuration = nowMs() - providerStartedAt
    let imageVerdictOperation = { durationMs: 0, outcome: 'skipped' }
    const [revealedCandidates, revealedResults] = await applyCachedSensitiveImageVerdictsToGroups(
      [artifacts.candidatePool?.candidates, artifacts.results],
      {
        onStorageOutcome: (outcome) => {
          imageVerdictOperation = outcome
        },
      },
    )
    artifacts.candidatePool = { ...artifacts.candidatePool, candidates: revealedCandidates }
    artifacts.results = revealedResults

    if (imageVerdictOperation.outcome === 'timeout' || imageVerdictOperation.outcome === 'error') {
      logDiscoveryStorageEvent('discovery_storage_fallback', {
        amazonDomain,
        durationMs: imageVerdictOperation.durationMs,
        error: imageVerdictOperation.error,
        operation: 'sensitive_image_verdict_read',
        outcome: imageVerdictOperation.outcome,
        searchId: supportSearchId,
      })
    }
    const imageVerdictDuration = imageVerdictOperation.durationMs
    const imageVerdictOutcome = imageVerdictOperation.outcome
    recordDiscoveryDiagnosticEvent(diagnosticContext, {
      stage: 'rainforest_success',
      status: 'success',
      query: normalizedQuery,
      amazonDomain,
      durationMs: roundTimingDuration(providerDuration),
      resultCountBeforeInternalFilters: diagnostics?.rawResultCount,
      resultCountAfterInternalFilters: diagnostics?.resultCountAfterInternalFilters,
      cachedOrFallbackUsed: Boolean(fallbackFrom),
      metadata: {
        candidateCountAfterInternalFilters: diagnostics?.candidateCountAfterInternalFilters,
        discoverySource,
        fallbackFrom,
      },
    })
    recordDiscoveryDiagnosticEvent(diagnosticContext, {
      stage: 'app_filters_applied',
      status: 'success',
      query: normalizedQuery,
      amazonDomain,
      resultCountBeforeInternalFilters: diagnostics?.rawResultCount,
      resultCountAfterInternalFilters: artifacts.results.length,
      metadata: {
        candidateCountAfterInternalFilters: Array.isArray(artifacts.candidatePool?.candidates)
          ? artifacts.candidatePool.candidates.length
          : 0,
        priceKnownFilterActive: true,
        scoringActive: true,
        diversityActive: true,
      },
    })

    const sessionCandidatePool = {
      ...artifacts.candidatePool,
      amazonDomain,
    }
    const sessionPersistence = writeSearchSnapshot({
      productQuery: normalizedQuery,
      details: normalizedDetails,
      candidatePool: sessionCandidatePool,
      discoveryToken,
      results: artifacts.results,
      selection: buildDiscoveryPreviewSelection(artifacts.results),
      source: `${discoverySource}_session`,
      scope: discoverySessionScope,
    })
    runInBackground(
      async () => {
        await persistDiscoverySessionInBackground(sessionPersistence, {
          amazonDomain,
          searchId: supportSearchId,
        })
      },
      {
        amazonDomain,
        label: 'persist_provider_discovery_session',
        query: normalizedQuery,
        route: '/api/search/rainforest-discover',
        searchId: supportSearchId,
      },
    )
    if (!artifacts.candidatePool?.searchCorrection?.suggestedQuery) {
      runInBackground(
        async () => {
          await sessionPersistence
          startQueryQualityReview({
            normalizedQuery,
            amazonDomain,
            candidatePool: sessionCandidatePool,
            previewResults: artifacts.results,
            discoveryToken,
            discoveryScope: discoverySessionScope,
          })
        },
        {
          amazonDomain,
          label: 'start_provider_query_quality_after_session',
          query: normalizedQuery,
          route: '/api/search/rainforest-discover',
          searchId: supportSearchId,
        },
      )
    }

    // Shared cache and history are useful for later requests, but neither is
    // required to show this request's preview.
    runInBackground(
      () => writeSearchSnapshot({
        productQuery: normalizedQuery,
        details: normalizedDetails,
        candidatePool: {
          ...artifacts.candidatePool,
          amazonDomain,
        },
        discoveryToken: '',
        results: artifacts.results,
        selection: buildDiscoveryPreviewSelection(artifacts.results),
        source: discoverySource,
        scope: rainforestScope,
      }),
      {
        amazonDomain,
        fallbackFrom,
        label: 'write_guided_discovery_snapshot',
        query: normalizedQuery,
        route: '/api/search/rainforest-discover',
        searchId: supportSearchId,
      },
    )

    runInBackground(
      () => recordSearchCacheEvent({
        cacheKey: discoveryCacheKey,
        cacheStatus: providerCacheStatus,
        candidateCount: Array.isArray(artifacts.candidatePool?.candidates)
          ? artifacts.candidatePool.candidates.length
          : 0,
        details: normalizedDetails,
        productQuery: normalizedQuery,
        resultCount: artifacts.results.length,
        selectionMode: 'discovery_preview',
        source: discoverySource,
      }),
      {
        label: 'record_guided_discovery_cache_event',
        route: '/api/search/rainforest-discover',
        searchId: supportSearchId,
      },
    )

    logSearchFlowEvent('rainforest_discovery_completed', {
      route: '/api/search/rainforest-discover',
      searchId: supportSearchId,
      query: normalizedQuery,
      cacheStatus: providerCacheStatus,
      candidateCount: Array.isArray(artifacts.candidatePool?.candidates)
        ? artifacts.candidatePool.candidates.length
        : 0,
      previewCount: artifacts.results.length,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      cacheOutcome: cacheLookupOutcome,
      fallbackFrom,
      imageVerdictMs: roundTimingDuration(imageVerdictDuration),
      imageVerdictOutcome,
      providerMs: roundTimingDuration(providerDuration),
      sessionOutcome: 'pending',
      source: discoverySource,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })

    sendJson(response, 200, {
      discoveryToken,
      guidedAvailable: true,
      sessionStatus: 'pending',
      amazonDomain,
      candidatePool: sessionCandidatePool,
      previewResults: artifacts.results,
      source: discoverySource,
      fallbackFrom,
    }, {
      serverTiming: [
        { name: 'rate-limit', duration: rateLimitDuration },
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'provider', duration: providerDuration },
        { name: 'image-verdicts', duration: imageVerdictDuration },
        { name: 'session', duration: 0 },
        { name: 'total', duration: nowMs() - requestStartedAt },
      ],
    })

    recordDiscoveryDiagnosticEvent(diagnosticContext, {
      stage: 'backend_response_sent',
      status: 'success',
      query: normalizedQuery,
      amazonDomain,
      durationMs: roundTimingDuration(nowMs() - requestStartedAt),
      finalStatus: 'success',
      resultCountBeforeInternalFilters: diagnostics?.rawResultCount,
      resultCountAfterInternalFilters: artifacts.results.length,
      cachedOrFallbackUsed: Boolean(fallbackFrom),
      metadata: { sessionStatus: 'pending' },
    })
  } catch (error) {
    logSearchFlowEvent('rainforest_discovery_failed', {
      route: '/api/search/rainforest-discover',
      searchId: supportSearchId,
      query: normalizedQuery,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    reportBackendError(error, {
      amazonDomain,
      query: normalizedQuery,
      route: '/api/search/rainforest-discover',
      searchId: supportSearchId,
      source: 'rainforest_discovery',
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })
    recordDiscoveryDiagnosticEvent(diagnosticContext, {
      stage: 'rainforest_error',
      status: 'failed',
      query: normalizedQuery,
      amazonDomain,
      durationMs: roundTimingDuration(nowMs() - requestStartedAt),
      finalStatus: 'provider_error',
      errorType: error?.name || 'Error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    })
    recordDiscoveryDiagnosticEvent(diagnosticContext, {
      stage: 'backend_response_sent',
      status: 'failed',
      query: normalizedQuery,
      amazonDomain,
      durationMs: roundTimingDuration(nowMs() - requestStartedAt),
      finalStatus: 'provider_error',
      errorType: error?.name || 'Error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    })
    sendJson(response, 500, buildInternalErrorPayload('Unable to reach Rainforest API.', error))
  }
}

// Keep these re-exports stable for handlers and tests that import discovery helpers here.
export {
  resolveDiscoveryContext,
  getDiscoverySessionScope,
  ensureDiscoverySnapshotToken,
  buildDiscoveryPreviewSelection,
  createDiscoveryToken,
  fetchDiscoveryArtifacts,
  isThinDiscoveryCacheHit,
  shouldRefreshDiscoveryCache,
}
