import { randomUUID } from 'node:crypto'
import { buildInternalErrorPayload, sendJson } from '../http.js'
import { DEFAULT_RATE_LIMIT_CONFIG, getClientIpAddress, getCountryCode, takeRateLimitToken } from '../rate-limit.js'
import { reportBackendError } from '../observability.js'
import { truncateText } from '../text-sanitizers.js'
import {
  getValidatedSearchRequest,
  readCachedSearchSnapshot,
  recordSearchCacheEvent,
  writeSearchSnapshot,
} from '../search-pipeline.js'
import { fetchOxylabsArtifacts } from '../oxylabs-pipeline.js'
import { buildCacheKey, getEnv } from '../search-data.js'
import { fetchRainforestArtifacts } from '../rainforest-pipeline.js'
import { lacksKnownPositivePrice } from '../result-filter.js'
import {
  CACHE_SCOPE_DISCOVERY,
  CACHE_SCOPE_DISCOVERY_SESSION,
  CACHE_SCOPE_LIVE_SEARCH,
  CACHE_SCOPE_RAINFOREST,
  LIVE_RESULT_FILTER_CONFIG,
  MIN_DISCOVERY_PROVIDER_RESULT_COUNT,
  RATE_LIMIT_WAIT_MESSAGE,
  getAmazonMarketplaceScope,
  getRequestedAmazonDomain,
  logSearchFlowEvent,
  nowMs,
  resolveAmazonDomain,
  roundTimingDuration,
  runInBackground,
} from '../server-helpers.js'
import { startQueryQualityReview } from './query-quality-handler.js'

function isThinDiscoveryResult(result) {
  const resultCount = Array.isArray(result?.artifacts?.results)
    ? result.artifacts.results.length
    : 0
  const candidateCount = Array.isArray(result?.artifacts?.candidatePool?.candidates)
    ? result.artifacts.candidatePool.candidates.length
    : 0

  return (
    !result?.error &&
    (
      resultCount < MIN_DISCOVERY_PROVIDER_RESULT_COUNT ||
      candidateCount < MIN_DISCOVERY_PROVIDER_RESULT_COUNT
    )
  )
}

async function fetchDiscoveryArtifactsWithFallback({
  filterConfig,
  productQuery,
  details,
  reasonFallback,
  rainforestApiKey,
  oxylabsUsername,
  oxylabsPassword,
  countryCode,
  amazonDomain,
}) {
  const hasOxylabsCredentials = Boolean(oxylabsUsername && oxylabsPassword)

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
    } catch {
      rainforestResult = {
        error: {
          error: 'Rainforest API request failed.',
          statusCode: 502,
        },
        artifacts: null,
      }
    }

    const shouldFallbackFromThinRainforest = hasOxylabsCredentials && isThinDiscoveryResult(rainforestResult)

    if ((!rainforestResult.error && !shouldFallbackFromThinRainforest) || !hasOxylabsCredentials) {
      return {
        ...rainforestResult,
        source: 'rainforest_discovery',
        fallbackFrom: null,
        fallbackReason: null,
      }
    }

    const oxylabsResult = await fetchOxylabsArtifacts({
      filterConfig,
      productQuery,
      details,
      reasonFallback,
      oxylabsUsername,
      oxylabsPassword,
      amazonDomain,
    })

    return {
      ...oxylabsResult,
      source: 'oxylabs_discovery',
      fallbackFrom: 'rainforest_discovery',
      fallbackReason: shouldFallbackFromThinRainforest ? 'thin_rainforest_results' : 'rainforest_error',
    }
  }

  if (hasOxylabsCredentials) {
    const oxylabsResult = await fetchOxylabsArtifacts({
      filterConfig,
      productQuery,
      details,
      reasonFallback,
      oxylabsUsername,
      oxylabsPassword,
      amazonDomain,
    })

    return {
      ...oxylabsResult,
      source: 'oxylabs_discovery',
      fallbackFrom: null,
      fallbackReason: null,
    }
  }

  return {
    error: {
      error: 'RAINFOREST_API_KEY or OXYLABS_USERNAME and OXYLABS_PASSWORD are required in the root .env file.',
      statusCode: 500,
    },
    artifacts: null,
    source: 'rainforest_discovery',
    fallbackFrom: null,
  }
}

function getDiscoverySessionScope(discoveryToken = '') {
  const truncatedToken = truncateText(discoveryToken, 300)
  return truncatedToken ? `${CACHE_SCOPE_DISCOVERY_SESSION}:${truncatedToken}` : CACHE_SCOPE_DISCOVERY_SESSION
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

async function resolveDiscoveryContext(normalizedQuery, discoveryToken, scopes = [CACHE_SCOPE_DISCOVERY, CACHE_SCOPE_RAINFOREST]) {
  const truncatedToken = truncateText(discoveryToken, 300)

  if (!truncatedToken) {
    return {
      error: 'Your search session expired. Start a new search.',
      isValid: false,
      statusCode: 409,
    }
  }

  const sessionScope = getDiscoverySessionScope(truncatedToken)
  const { cachedEntry: sessionEntry } = await readCachedSearchSnapshot({
    productQuery: normalizedQuery,
    details: '',
    scope: sessionScope,
  })

  if (sessionEntry && truncateText(sessionEntry.discoveryToken, 300) === truncatedToken) {
    return {
      cachedEntry: sessionEntry,
      discoveryScope: sessionScope,
      isValid: true,
    }
  }

  for (const scope of scopes) {
    const { cachedEntry } = await readCachedSearchSnapshot({
      productQuery: normalizedQuery,
      details: '',
      scope,
    })

    if (!cachedEntry) {
      continue
    }

    if (truncateText(cachedEntry.discoveryToken, 300) !== truncatedToken) {
      continue
    }

    return {
      cachedEntry,
      discoveryScope: scope,
      isValid: true,
    }
  }

  return {
    error: 'Your search session expired. Start a new search.',
    isValid: false,
    statusCode: 409,
  }
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
  const rainforestApiKey = getEnv('RAINFOREST_API_KEY')
  const oxylabsUsername = getEnv('OXYLABS_USERNAME')
  const oxylabsPassword = getEnv('OXYLABS_PASSWORD')

  if (!rainforestApiKey && (!oxylabsUsername || !oxylabsPassword)) {
    sendJson(response, 500, {
      error: 'OXYLABS_USERNAME and OXYLABS_PASSWORD or RAINFOREST_API_KEY are required in the root .env file.',
    })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const countryCode = getCountryCode(request.headers || {})
  const amazonDomain = resolveAmazonDomain({ requestUrl, countryCode })
  const rainforestScope = getAmazonMarketplaceScope(CACHE_SCOPE_RAINFOREST, amazonDomain)
  const rateLimit = await takeRateLimitToken(clientIpAddress, DEFAULT_RATE_LIMIT_CONFIG)

  if (!rateLimit.allowed) {
    sendJson(response, 429, {
      error: `Too many searches from this connection. ${RATE_LIMIT_WAIT_MESSAGE}`,
    })
    return
  }

  const { error, isValid, normalizedQuery } = getValidatedSearchRequest(requestUrl, {
    includeDetails: false,
  })

  if (!isValid) {
    sendJson(response, 400, { error })
    return
  }

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
    const tokenizedDiscovery = await ensureDiscoverySnapshotToken({
      normalizedQuery,
      normalizedDetails,
      cachedEntry,
      source: cachedEntry?.source || 'guided_discovery',
    })
    await recordSearchCacheEvent({
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
    })

    logSearchFlowEvent('rainforest_discovery_cache_hit', {
      route: '/api/search/rainforest-discover',
      query: normalizedQuery,
      candidateCount: Array.isArray(cachedEntry.candidatePool?.candidates)
        ? cachedEntry.candidatePool.candidates.length
        : normalizedCachedResults.length,
      previewCount: normalizedCachedResults.length,
      cacheMs: roundTimingDuration(cacheLookupDuration),
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
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'total', duration: nowMs() - requestStartedAt },
      ],
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
    const {
      artifacts,
      error: artifactsError,
      fallbackFrom,
      fallbackReason,
      source: discoverySource,
    } = await fetchDiscoveryArtifactsWithFallback({
      filterConfig: LIVE_RESULT_FILTER_CONFIG,
      productQuery: normalizedQuery,
      details: normalizedDetails,
      reasonFallback: 'Returned by the Rainforest API search route',
      rainforestApiKey,
      oxylabsUsername,
      oxylabsPassword,
      countryCode,
      amazonDomain,
    })

    if (artifactsError) {
      sendJson(response, artifactsError.statusCode, {
        error: artifactsError.error,
      })
      return
    }
    const providerDuration = nowMs() - providerStartedAt

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
      fallbackReason,
      label: 'write_guided_discovery_snapshot',
        query: normalizedQuery,
        route: '/api/search/rainforest-discover',
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
      query: normalizedQuery,
      cacheStatus: providerCacheStatus,
      candidateCount: Array.isArray(artifacts.candidatePool?.candidates)
        ? artifacts.candidatePool.candidates.length
        : 0,
      previewCount: artifacts.results.length,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      fallbackFrom,
      fallbackReason,
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
      fallbackReason,
    }, {
      serverTiming: [
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'provider', duration: providerDuration },
        { name: 'total', duration: nowMs() - requestStartedAt },
      ],
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
      query: normalizedQuery,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    reportBackendError(error, {
      amazonDomain,
      query: normalizedQuery,
      route: '/api/search/rainforest-discover',
      source: 'rainforest_discovery',
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })
    sendJson(response, 500, buildInternalErrorPayload('Unable to reach Rainforest API.', error))
  }
}

// These helpers are also used by other handlers (finalize, enrichment, query-quality)
// that haven't been extracted yet. Export them so those handlers can import from here.
export {
  resolveDiscoveryContext,
  getDiscoverySessionScope,
  ensureDiscoverySnapshotToken,
  buildDiscoveryPreviewSelection,
  createDiscoveryToken,
  fetchDiscoveryArtifactsWithFallback,
  isThinDiscoveryCacheHit,
  shouldRefreshDiscoveryCache,
}
