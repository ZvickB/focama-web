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
  return randomUUID()
}

async function ensureDiscoverySnapshotToken({
  normalizedQuery,
  normalizedDetails = '',
  cachedEntry,
  source = 'guided_discovery',
}) {
  const discoveryToken = createDiscoveryToken()
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
  const { cachedEntry, normalizedCachedResults } = await readCachedSearchSnapshot({
    productQuery: normalizedQuery,
    details: normalizedDetails,
    scope: rainforestScope,
  })
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

    const sessionSnapshotStartedAt = nowMs()
    const tokenizedDiscovery = await ensureDiscoverySnapshotToken({
      normalizedQuery,
      normalizedDetails,
      cachedEntry,
      source: cachedEntry?.source || 'guided_discovery',
    })
    const sessionSnapshotDuration = nowMs() - sessionSnapshotStartedAt
    const moderationDuration = Number.isFinite(resolvedOpenAiQueryModeration?.durationMs)
      ? resolvedOpenAiQueryModeration.durationMs
      : 0

    // Cache-history data is operational telemetry only. Keep it best-effort and
    // off the response path; the discovery snapshot above is the required write
    // that makes this token usable by finalize on any Render instance.
    runInBackground(
      recordSearchCacheEvent({
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
      moderationMs: roundTimingDuration(moderationDuration),
      sessionSnapshotMs: roundTimingDuration(sessionSnapshotDuration),
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })

    sendJson(response, 200, {
      discoveryToken: tokenizedDiscovery.discoveryToken,
      amazonDomain,
      candidatePool: tokenizedDiscovery.cachedEntry.candidatePool,
      previewResults: normalizedCachedResults,
      source: 'cache',
      cachedAt: tokenizedDiscovery.cachedEntry.cachedAt,
    }, {
      serverTiming: [
        { name: 'rate-limit', duration: rateLimitDuration },
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'moderation', duration: moderationDuration },
        { name: 'session', duration: sessionSnapshotDuration },
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
    })

    startQueryQualityReview({
      normalizedQuery,
      amazonDomain,
      candidatePool: tokenizedDiscovery.cachedEntry.candidatePool,
      previewResults: normalizedCachedResults,
      discoveryToken: tokenizedDiscovery.discoveryToken,
      discoveryScope: getDiscoverySessionScope(tokenizedDiscovery.discoveryToken),
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
    }).then((value) => ({ value }), (error) => ({ error }))

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
    const [revealedCandidates, revealedResults] = await applyCachedSensitiveImageVerdictsToGroups([
      artifacts.candidatePool?.candidates,
      artifacts.results,
    ])
    artifacts.candidatePool = { ...artifacts.candidatePool, candidates: revealedCandidates }
    artifacts.results = revealedResults
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

    runInBackground(
      writeSearchSnapshot({
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

    await writeSearchSnapshot({
      productQuery: normalizedQuery,
      details: normalizedDetails,
      candidatePool: {
        ...artifacts.candidatePool,
        amazonDomain,
      },
      discoveryToken,
      results: artifacts.results,
      selection: buildDiscoveryPreviewSelection(artifacts.results),
      source: `${discoverySource}_session`,
      scope: discoverySessionScope,
    })

    await recordSearchCacheEvent({
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
    })

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
      fallbackFrom,
      providerMs: roundTimingDuration(providerDuration),
      source: discoverySource,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })

    sendJson(response, 200, {
      discoveryToken,
      amazonDomain,
      candidatePool: {
        ...artifacts.candidatePool,
        amazonDomain,
      },
      previewResults: artifacts.results,
      source: discoverySource,
      fallbackFrom,
    }, {
      serverTiming: [
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'provider', duration: providerDuration },
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
    })

    startQueryQualityReview({
      normalizedQuery,
      amazonDomain,
      candidatePool: {
        ...artifacts.candidatePool,
        amazonDomain,
      },
      previewResults: artifacts.results,
      discoveryToken,
      discoveryScope: discoverySessionScope,
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
