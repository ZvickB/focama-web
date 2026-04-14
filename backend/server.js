import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_FINALIZE_MODEL,
  DEFAULT_REFINEMENT_MODEL,
  DEFAULT_CONTEXT_FINALIZE_MODEL,
  createCandidateAwarePrior,
  selectAiResults,
  nanoLockWinnersAndBadges,
  miniEnrichSelectedCandidates,
} from './lib/ai-selector.js'
import { createFinalizeFastContract } from './lib/layered-contracts.js'
import { DEFAULT_RATE_LIMIT_CONFIG, getClientIpAddress, takeRateLimitToken } from './lib/rate-limit.js'
import { generateRefinementPrompt } from './lib/refinement-assistant.js'
import { generateFramingFields } from './lib/query-framing.js'
import { DEFAULT_FILTER_CONFIG } from './lib/result-filter.js'
import {
  fetchSearchArtifacts,
  getValidatedSearchRequest,
  readCachedSearchSnapshot,
  recordSearchCacheEvent,
  writeSearchSnapshot,
} from './lib/search-pipeline.js'
import {
  getSupabaseHealth,
  isSupabaseConfigured,
  recordAnalyticsResultClick,
  recordAnalyticsResultImpressions,
  recordAnalyticsSearchEvent,
  upsertAnalyticsSearchRun,
} from './lib/search-storage.js'
import { buildCacheKey, getEnv, validateSearchInput } from './lib/search-data.js'

const PORT = Number(process.env.PORT || 8787)
const LIVE_RESULT_FILTER_CONFIG = {
  ...DEFAULT_FILTER_CONFIG,
  candidatePoolSize: 20,
  finalResultLimit: 6,
}
const LIVE_SEARCH_RATE_LIMIT = {
  ...DEFAULT_RATE_LIMIT_CONFIG,
}
const PREWARM_SELECTION_RATE_LIMIT = {
  ...DEFAULT_RATE_LIMIT_CONFIG,
}
const FINALIZE_SELECTION_RATE_LIMIT = {
  ...DEFAULT_RATE_LIMIT_CONFIG,
}
const PREWARM_BODY_LIMIT_BYTES = 96 * 1024
const FINALIZE_BODY_LIMIT_BYTES = 32 * 1024
const FINALIZE_MAX_CANDIDATES = LIVE_RESULT_FILTER_CONFIG.candidatePoolSize
const FINALIZE_MAX_NOTE_LENGTH = 500
const FINALIZE_MAX_REJECTION_FEEDBACK_LENGTH = 300
const FINALIZE_MAX_PRIORITIES = 8
const FINALIZE_MAX_PRIORITY_LENGTH = 80
const FINALIZE_MAX_RETRY_COUNT = 2
const CACHE_SCOPE_DISCOVERY = 'guided_discovery'
const CACHE_SCOPE_LIVE_SEARCH = 'live_search'
const PREWARM_REQUEST_MODE_DEFAULT = 'guided_prerank_prewarm'
const FINALIZE_REQUEST_MODE_DEFAULT = 'guided_finalize'
const FINALIZE_REQUEST_MODE_EMPTY_NOTES = 'guided_empty_notes'
const RATE_LIMIT_WAIT_MESSAGE = 'Please wait about 10 seconds and try again.'

function getRefinementModel() {
  return getEnv('OPENAI_REFINEMENT_MODEL') || getEnv('OPENAI_MODEL') || DEFAULT_REFINEMENT_MODEL
}

function hasContextAddedFinalizeSignals({
  priorities = [],
  followUpNotes = '',
  rejectionFeedback = '',
  retryCount = 0,
  excludedCandidateIds = [],
} = {}) {
  return (
    priorities.length > 0 ||
    Boolean(followUpNotes) ||
    Boolean(rejectionFeedback) ||
    retryCount > 0 ||
    excludedCandidateIds.length > 0
  )
}

function getFinalizeModel({ hasContextSignals = false } = {}) {
  const sharedFinalizeModel = getEnv('OPENAI_FINALIZE_MODEL') || getEnv('OPENAI_MODEL') || DEFAULT_FINALIZE_MODEL

  if (!hasContextSignals) {
    return getEnv('OPENAI_FINALIZE_EMPTY_MODEL') || sharedFinalizeModel
  }

  return getEnv('OPENAI_FINALIZE_CONTEXT_MODEL') || DEFAULT_CONTEXT_FINALIZE_MODEL
}

function roundTimingDuration(value) {
  return Math.round(value * 10) / 10
}

function formatServerTiming(metrics = []) {
  return metrics
    .filter((metric) => metric && metric.name && Number.isFinite(metric.duration))
    .map((metric) => `${metric.name};dur=${roundTimingDuration(metric.duration)}`)
    .join(', ')
}

function nowMs() {
  return performance.now()
}

function runInBackground(task) {
  Promise.resolve(task).catch(() => {})
}

function logSearchFlowEvent(eventName, details = {}) {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  const payload = Object.fromEntries(
    Object.entries({
      event: eventName,
      timestamp: new Date().toISOString(),
      ...details,
    }).filter(([, value]) => value !== undefined),
  )

  console.info('[search-flow]', JSON.stringify(payload))
}

function safeJsonByteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value))
  } catch {
    return null
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

function getStoredCandidateAwarePrior(selection) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    return null
  }

  const candidateAwarePrior =
    selection.candidateAwarePrior &&
    typeof selection.candidateAwarePrior === 'object' &&
    !Array.isArray(selection.candidateAwarePrior)
      ? selection.candidateAwarePrior
      : null

  if (candidateAwarePrior) {
    return candidateAwarePrior
  }

  // Compatibility for guided-discovery cache entries written before the prior rename.
  return selection.preRankArtifact &&
    typeof selection.preRankArtifact === 'object' &&
    !Array.isArray(selection.preRankArtifact)
    ? selection.preRankArtifact
    : null
}

export function sendJson(response, statusCode, payload, headers = {}) {
  const serverTiming = formatServerTiming(headers.serverTiming)
  const responseHeaders = {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  }

  delete responseHeaders.serverTiming

  if (serverTiming) {
    responseHeaders['Server-Timing'] = serverTiming
  }

  response.writeHead(statusCode, responseHeaders)
  response.end(JSON.stringify(payload))
}

function readRequestBody(request, { maxBytes = Infinity } = {}) {
  return new Promise((resolve, reject) => {
    let body = ''
    let byteLength = 0
    let aborted = false

    request.on('data', (chunk) => {
      if (aborted) {
        return
      }

      const chunkText = typeof chunk === 'string' ? chunk : String(chunk)
      byteLength += Buffer.byteLength(chunkText)

      if (byteLength > maxBytes) {
        aborted = true
        reject(new Error('Request body is too large.'))
        return
      }

      body += chunkText
    })

    request.on('end', () => {
      if (aborted) {
        return
      }

      resolve(body)
    })

    request.on('error', reject)
  })
}

async function readJsonBody(request, options) {
  const rawBody = await readRequestBody(request, options)

  if (!rawBody.trim()) {
    return {}
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

function truncateText(value, maxLength) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''

  if (!normalizedValue) {
    return ''
  }

  return normalizedValue.slice(0, maxLength)
}

function sanitizeStringList(values, { maxItems, maxItemLength }) {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .map((value) => truncateText(value, maxItemLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function sanitizeExcludedCandidateIds(values) {
  return sanitizeStringList(values, {
    maxItems: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
    maxItemLength: 200,
  })
}

function sanitizeFinalizeDiscoveryContext(body) {
  const query = typeof body?.query === 'string' ? body.query : ''
  const discoveryToken = truncateText(body?.discoveryToken, 300)
  const { error, isValid, normalizedQuery } = validateSearchInput(query, '')

  if (!isValid) {
    return {
      error,
      isValid: false,
    }
  }

  if (!discoveryToken) {
    return {
      error: 'A discovery token is required to finalize the search.',
      isValid: false,
    }
  }

  const expectedDiscoveryToken = buildCacheKey(normalizedQuery, '', CACHE_SCOPE_DISCOVERY)

  if (discoveryToken !== expectedDiscoveryToken) {
    return {
      error: 'The guided discovery token is invalid for this query. Please start the search again.',
      isValid: false,
    }
  }

  return {
    discoveryToken,
    isValid: true,
    normalizedQuery,
    requestMode: truncateText(body?.requestMode, 80) || FINALIZE_REQUEST_MODE_DEFAULT,
  }
}

function sanitizeFinalizeCandidate(candidate, index) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {
      error: `Candidate ${index + 1} must be an object.`,
      isValid: false,
    }
  }

  const id = truncateText(candidate.id, 200)
  const title = truncateText(candidate.title, 300)

  if (!id || !title) {
    return {
      error: `Candidate ${index + 1} must include non-empty id and title fields.`,
      isValid: false,
    }
  }

  const numericPrice =
    candidate.numericPrice === null || candidate.numericPrice === undefined
      ? null
      : Number.isFinite(Number(candidate.numericPrice))
        ? Number(candidate.numericPrice)
        : null
  const rating =
    candidate.rating === null || candidate.rating === undefined
      ? null
      : Number.isFinite(Number(candidate.rating))
        ? Number(candidate.rating)
        : null
  const reviewCount =
    candidate.reviewCount === null || candidate.reviewCount === undefined
      ? null
      : Number.isFinite(Number(candidate.reviewCount))
        ? Number(candidate.reviewCount)
        : null

  return {
    isValid: true,
    candidate: {
      id,
      score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : 0,
      title,
      description: truncateText(candidate.description, 1200),
      source: truncateText(candidate.source, 160),
      price: truncateText(candidate.price, 80),
      numericPrice,
      rating,
      reviewCount,
      delivery: truncateText(candidate.delivery, 160),
      tag: truncateText(candidate.tag, 120),
      extensions: sanitizeStringList(candidate.extensions, { maxItems: 6, maxItemLength: 120 }),
      multipleSources: Boolean(candidate.multipleSources),
      link: truncateText(candidate.link, 1000),
      image: truncateText(candidate.image, 1000),
      reasons: sanitizeStringList(candidate.reasons, { maxItems: 5, maxItemLength: 240 }),
      duplicateFamilyKey: truncateText(candidate.duplicateFamilyKey, 240),
      matchSignals:
        candidate.matchSignals && typeof candidate.matchSignals === 'object' && !Array.isArray(candidate.matchSignals)
          ? {
              titleMatches: Number.isFinite(Number(candidate.matchSignals.titleMatches))
                ? Number(candidate.matchSignals.titleMatches)
                : 0,
              supportMatches: Number.isFinite(Number(candidate.matchSignals.supportMatches))
                ? Number(candidate.matchSignals.supportMatches)
                : 0,
              detailMatches: Number.isFinite(Number(candidate.matchSignals.detailMatches))
                ? Number(candidate.matchSignals.detailMatches)
                : 0,
              exactMatchSearchState: Boolean(candidate.matchSignals.exactMatchSearchState),
              hasMultipleSources: Boolean(candidate.matchSignals.hasMultipleSources),
              hasDeliveryInfo: Boolean(candidate.matchSignals.hasDeliveryInfo),
              hasTag: Boolean(candidate.matchSignals.hasTag),
            }
          : {
              titleMatches: 0,
              supportMatches: 0,
              detailMatches: 0,
              exactMatchSearchState: false,
              hasMultipleSources: false,
              hasDeliveryInfo: false,
              hasTag: false,
            },
      attributes: sanitizeStringList(candidate.attributes, { maxItems: 6, maxItemLength: 60 }),
      trustSignals:
        candidate.trustSignals && typeof candidate.trustSignals === 'object' && !Array.isArray(candidate.trustSignals)
          ? {
              hasMultipleSources: Boolean(candidate.trustSignals.hasMultipleSources),
              hasRealDescription: Boolean(candidate.trustSignals.hasRealDescription),
              ratingBand: truncateText(candidate.trustSignals.ratingBand, 40),
              reviewBand: truncateText(candidate.trustSignals.reviewBand, 40),
              score: Number.isFinite(Number(candidate.trustSignals.score))
                ? Number(candidate.trustSignals.score)
                : 0,
            }
          : {
              hasMultipleSources: false,
              hasRealDescription: false,
              ratingBand: '',
              reviewBand: '',
              score: 0,
            },
      variantTokens: sanitizeStringList(candidate.variantTokens, { maxItems: 4, maxItemLength: 40 }),
    },
  }
}

function sanitizeFinalizeCandidatePool(candidatePool) {
  if (!candidatePool || typeof candidatePool !== 'object' || Array.isArray(candidatePool)) {
    return {
      error: 'A candidate pool is required to finalize the search.',
      isValid: false,
    }
  }

  if (!Array.isArray(candidatePool.candidates)) {
    return {
      error: 'A candidate pool with a candidates array is required to finalize the search.',
      isValid: false,
    }
  }

  if (candidatePool.candidates.length === 0) {
    return {
      error: 'Candidate pool must include at least one candidate.',
      isValid: false,
    }
  }

  if (candidatePool.candidates.length > FINALIZE_MAX_CANDIDATES) {
    return {
      error: `Candidate pool cannot include more than ${FINALIZE_MAX_CANDIDATES} candidates.`,
      isValid: false,
    }
  }

  const candidates = []

  for (const [index, candidate] of candidatePool.candidates.entries()) {
    const sanitized = sanitizeFinalizeCandidate(candidate, index)

    if (!sanitized.isValid) {
      return sanitized
    }

    candidates.push(sanitized.candidate)
  }

  return {
    isValid: true,
    candidatePool: {
      query: truncateText(candidatePool.query, 200),
      details: truncateText(candidatePool.details, 500),
      combinedSearchText: truncateText(candidatePool.combinedSearchText, 400),
      searchState: truncateText(candidatePool.searchState, 200),
      similarQueries: sanitizeStringList(candidatePool.similarQueries, { maxItems: 8, maxItemLength: 120 }),
      candidates,
    },
  }
}

async function readFinalizeCandidatePoolFromDiscovery(normalizedQuery) {
  const { cachedEntry } = await readCachedSearchSnapshot({
    productQuery: normalizedQuery,
    details: '',
    scope: CACHE_SCOPE_DISCOVERY,
  })

  if (!cachedEntry?.candidatePool?.candidates?.length) {
    return {
      error: 'The guided search context expired. Please start the search again.',
      isValid: false,
      statusCode: 409,
    }
  }

  const sanitizedCandidatePool = sanitizeFinalizeCandidatePool(cachedEntry.candidatePool)

  if (!sanitizedCandidatePool.isValid) {
    return {
      error: 'The cached guided discovery data was invalid. Please start the search again.',
      isValid: false,
      statusCode: 500,
    }
  }

  const cachedPrior = getStoredCandidateAwarePrior(cachedEntry?.selection)

  return {
    candidatePool: sanitizedCandidatePool.candidatePool,
    cachedEntry,
    candidateAwarePrior: cachedPrior,
    isValid: true,
  }
}

function buildFinalizeFallbackResults(candidatePool) {
  return candidatePool.candidates
    .slice(0, LIVE_RESULT_FILTER_CONFIG.finalResultLimit)
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      subtitle: candidate.source,
      price: candidate.price,
      rating: candidate.rating,
      reviewCount: candidate.reviewCount,
      description: candidate.description,
      reasons: candidate.reasons,
      image: candidate.image,
      link: candidate.link,
      badgeLabel: '',
    }))
}

function buildFinalizeFastResponseContract({
  query = '',
  discoveryToken = '',
  latestUserContext = '',
  results = [],
  selectedCandidateIds = [],
  model = '',
  strategy = '',
} = {}) {
  return createFinalizeFastContract({
    query,
    discoveryToken,
    latestUserContext,
    selectedCandidateIds,
    shortlist: results.slice(0, LIVE_RESULT_FILTER_CONFIG.finalResultLimit),
    model,
    strategy,
    generatedAt: new Date().toISOString(),
  })
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

export async function handleLiveSearch(requestUrl, response, request = { headers: {} }) {
  const requestStartedAt = nowMs()
  const serpApiKey = getEnv('SERPAPI_API_KEY')
  const openAiApiKey = getEnv('OPENAI_API_KEY')

  if (!serpApiKey) {
    sendJson(response, 500, { error: 'SERPAPI_API_KEY is missing from the root .env file.' })
    return
  }

  if (!openAiApiKey) {
    sendJson(response, 500, { error: 'OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const rateLimit = await takeRateLimitToken(clientIpAddress, LIVE_SEARCH_RATE_LIMIT)

  if (!rateLimit.allowed) {
    logSearchFlowEvent('guided_discovery_rate_limited', {
      route: '/api/search/discover',
      query: requestUrl.searchParams.get('query') || '',
      clientIpAddress,
    })
    sendJson(response, 429, {
      error: `Too many searches from this connection. ${RATE_LIMIT_WAIT_MESSAGE}`,
    })
    return
  }

  const { cacheKey, error, isValid, normalizedDetails, normalizedQuery } = getValidatedSearchRequest(requestUrl)

  if (!isValid) {
    logSearchFlowEvent('guided_discovery_invalid', {
      route: '/api/search/discover',
      query: requestUrl.searchParams.get('query') || '',
      error,
    })
    sendJson(response, 400, { error })
    return
  }

  try {
    const searchStartedAt = nowMs()
    let openAiDuration = null
    const { artifacts, error: artifactsError } = await fetchSearchArtifacts({
      filterConfig: LIVE_RESULT_FILTER_CONFIG,
      productQuery: normalizedQuery,
      details: normalizedDetails,
      reasonFallback: 'Returned by the live SerpApi search route',
      serpApiKey,
    })

    if (artifactsError) {
      sendJson(response, artifactsError.statusCode, {
        error: artifactsError.error,
        ...(artifactsError.details ? { details: artifactsError.details } : {}),
      })
      return
    }

    const serpApiDuration = nowMs() - searchStartedAt
    const { candidatePool, results: fallbackResults } = artifacts

    let results = fallbackResults
    let selection = {
      mode: 'rules_fallback',
      model: null,
      selectedCandidateIds: fallbackResults.map((item) => item.id),
      details: 'Rules-based fallback was used.',
    }

    try {
      const aiStartedAt = nowMs()
      const aiSelection = await selectAiResults({
        candidatePool,
        finalResultLimit: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
        apiKey: openAiApiKey,
        model: getFinalizeModel(),
      })
      openAiDuration = nowMs() - aiStartedAt

      if (aiSelection.results.length > 0) {
        results = aiSelection.results
        selection = {
          mode: 'ai',
          model: aiSelection.model,
          usage: aiSelection.usage,
          selectedCandidateIds: aiSelection.selectedCandidateIds,
          details: 'AI selected the final recommendations from the cleaned candidate pool.',
        }
      }
    } catch (error) {
      selection = {
        ...selection,
        details: error instanceof Error ? error.message : 'AI selection failed; using fallback results.',
      }
    }

    await recordSearchCacheEvent({
      cacheKey,
      cacheStatus: 'bypass',
      candidateCount: Array.isArray(candidatePool?.candidates) ? candidatePool.candidates.length : 0,
      details: normalizedDetails,
      productQuery: normalizedQuery,
      resultCount: results.length,
      selectionMode: selection.mode,
      source: 'live_search',
    })

    sendJson(response, 200, {
      candidatePool,
      results,
      selection,
      usage: {
        openai: selection.usage || null,
      },
    }, {
      serverTiming: [
        { name: 'serpapi', duration: serpApiDuration },
        ...(Number.isFinite(openAiDuration) ? [{ name: 'openai', duration: openAiDuration }] : []),
        { name: 'total', duration: nowMs() - requestStartedAt },
      ],
    })
  } catch (error) {
    sendJson(response, 500, {
      error: 'Unable to reach SerpApi.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export async function handleDiscoverySearch(requestUrl, response, request = { headers: {} }) {
  const requestStartedAt = nowMs()
  const serpApiKey = getEnv('SERPAPI_API_KEY')

  if (!serpApiKey) {
    sendJson(response, 500, { error: 'SERPAPI_API_KEY is missing from the root .env file.' })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const rateLimit = await takeRateLimitToken(clientIpAddress, LIVE_SEARCH_RATE_LIMIT)

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
  const discoveryCacheKey = buildCacheKey(normalizedQuery, normalizedDetails, CACHE_SCOPE_DISCOVERY)
  const cacheLookupStartedAt = nowMs()
  const { cachedEntry, normalizedCachedResults } = await readCachedSearchSnapshot({
    productQuery: normalizedQuery,
    details: normalizedDetails,
    scope: CACHE_SCOPE_DISCOVERY,
  })
  const cacheLookupDuration = nowMs() - cacheLookupStartedAt

  if (cachedEntry?.candidatePool && cachedEntry?.results?.length) {
    const cachedCandidateAwarePrior = getStoredCandidateAwarePrior(cachedEntry.selection)

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

    logSearchFlowEvent('guided_discovery_cache_hit', {
      route: '/api/search/discover',
      lane: 'discover',
      query: normalizedQuery,
      candidateCount: Array.isArray(cachedEntry.candidatePool?.candidates)
        ? cachedEntry.candidatePool.candidates.length
        : normalizedCachedResults.length,
      previewCount: normalizedCachedResults.length,
      candidateAwarePriorReady: Boolean(cachedCandidateAwarePrior),
      prewarmArtifactReady: Boolean(cachedCandidateAwarePrior),
      cacheMs: roundTimingDuration(cacheLookupDuration),
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })

    sendJson(response, 200, {
      discoveryToken: discoveryCacheKey,
      candidatePool: cachedEntry.candidatePool,
      previewResults: normalizedCachedResults,
      prewarm: {
        priorReady: Boolean(cachedCandidateAwarePrior),
        priorGeneratedAt: cachedCandidateAwarePrior?.generatedAt || null,
        artifactReady: Boolean(cachedCandidateAwarePrior),
        artifactGeneratedAt: cachedCandidateAwarePrior?.generatedAt || null,
      },
      source: 'cache',
      cachedAt: cachedEntry.cachedAt,
    }, {
      serverTiming: [
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'total', duration: nowMs() - requestStartedAt },
      ],
    })
    return
  }

  try {
    const serpApiStartedAt = nowMs()
    const { artifacts, error: artifactsError } = await fetchSearchArtifacts({
      filterConfig: LIVE_RESULT_FILTER_CONFIG,
      productQuery: normalizedQuery,
      details: normalizedDetails,
      reasonFallback: 'Returned by the live SerpApi search route',
      serpApiKey,
    })

    if (artifactsError) {
      sendJson(response, artifactsError.statusCode, {
        error: artifactsError.error,
        ...(artifactsError.details ? { details: artifactsError.details } : {}),
      })
      return
    }
    const serpApiDuration = nowMs() - serpApiStartedAt

    runInBackground(
      writeSearchSnapshot({
        productQuery: normalizedQuery,
        details: normalizedDetails,
        candidatePool: artifacts.candidatePool,
        results: artifacts.results,
        selection: buildDiscoveryPreviewSelection(artifacts.results),
        source: 'guided_discovery',
        scope: CACHE_SCOPE_DISCOVERY,
      }),
    )

    await recordSearchCacheEvent({
      cacheKey: discoveryCacheKey,
      cacheStatus: 'miss',
      candidateCount: Array.isArray(artifacts.candidatePool?.candidates)
        ? artifacts.candidatePool.candidates.length
        : 0,
      details: normalizedDetails,
      productQuery: normalizedQuery,
      resultCount: artifacts.results.length,
      selectionMode: 'discovery_preview',
      source: 'guided_discovery',
    })

    logSearchFlowEvent('guided_discovery_completed', {
      route: '/api/search/discover',
      lane: 'discover',
      query: normalizedQuery,
      cacheStatus: 'miss',
      candidateCount: Array.isArray(artifacts.candidatePool?.candidates)
        ? artifacts.candidatePool.candidates.length
        : 0,
      previewCount: artifacts.results.length,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      serpapiMs: roundTimingDuration(serpApiDuration),
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })

    sendJson(response, 200, {
      discoveryToken: discoveryCacheKey,
      candidatePool: artifacts.candidatePool,
      previewResults: artifacts.results,
      prewarm: {
        artifactReady: false,
        artifactGeneratedAt: null,
      },
    }, {
      serverTiming: [
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'serpapi', duration: serpApiDuration },
        { name: 'total', duration: nowMs() - requestStartedAt },
      ],
    })
  } catch (error) {
    logSearchFlowEvent('guided_discovery_failed', {
      route: '/api/search/discover',
      lane: 'discover',
      query: normalizedQuery,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    sendJson(response, 500, {
      error: 'Unable to reach SerpApi.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export async function handleRefinementPrompt(requestUrl, response) {
  const requestStartedAt = nowMs()
  const openAiApiKey = getEnv('OPENAI_API_KEY')
  const { error, isValid, normalizedQuery } = getValidatedSearchRequest(requestUrl, {
    includeDetails: false,
  })

  if (!isValid) {
    logSearchFlowEvent('guided_refine_invalid', {
      route: '/api/search/refine',
      query: requestUrl.searchParams.get('query') || '',
      error,
    })
    sendJson(response, 400, { error })
    return
  }

  if (!openAiApiKey) {
    logSearchFlowEvent('guided_refine_missing_openai_key', {
      route: '/api/search/refine',
      query: normalizedQuery,
    })
    sendJson(response, 500, { error: 'OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  try {
    const openAiStartedAt = nowMs()
    const refinementPrompt = await generateRefinementPrompt({
      productQuery: normalizedQuery,
      apiKey: openAiApiKey,
      model: getRefinementModel(),
    })
    const openAiDuration = nowMs() - openAiStartedAt
    const totalDuration = nowMs() - requestStartedAt

    logSearchFlowEvent('guided_refine_completed', {
      route: '/api/search/refine',
      lane: 'question_fast',
      query: normalizedQuery,
      promptLength: refinementPrompt.prompt.length,
      helperTextLength: refinementPrompt.helperText.length,
      placeholderLength: refinementPrompt.followUpPlaceholder.length,
      queryFramingCategoryHint: refinementPrompt.queryFraming?.categoryHint || '',
      queryFramingAxisCount: Array.isArray(refinementPrompt.queryFraming?.tradeoffAxes)
        ? refinementPrompt.queryFraming.tradeoffAxes.length
        : 0,
      openaiMs: roundTimingDuration(openAiDuration),
      totalMs: roundTimingDuration(totalDuration),
      openaiUsage: refinementPrompt.usage || null,
      queryFramingMode: refinementPrompt.queryFramingMode || 'legacy_query_framing',
      framingFieldsReturned: Boolean(refinementPrompt.framingFields),
      rankingOwner: 'openai_question_fast',
    })

    sendJson(response, 200, refinementPrompt, {
      serverTiming: [
        { name: 'openai', duration: openAiDuration },
        { name: 'total', duration: totalDuration },
      ],
    })
  } catch (error) {
    logSearchFlowEvent('guided_refine_failed', {
      route: '/api/search/refine',
      query: normalizedQuery,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    sendJson(response, 500, {
      error: 'Unable to generate the refinement prompt.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export async function handleQueryFramingFields(requestUrl, response) {
  const requestStartedAt = nowMs()
  const openAiApiKey = getEnv('OPENAI_API_KEY')
  const { error, isValid, normalizedQuery } = getValidatedSearchRequest(requestUrl, {
    includeDetails: false,
  })

  if (!isValid) {
    logSearchFlowEvent('query_framing_fields_invalid', {
      route: '/api/search/framing-fields',
      lane: 'framing_fields',
      query: requestUrl.searchParams.get('query') || '',
      error,
    })
    sendJson(response, 400, { error })
    return
  }

  if (!openAiApiKey) {
    logSearchFlowEvent('query_framing_fields_missing_openai_key', {
      route: '/api/search/framing-fields',
      lane: 'framing_fields',
      query: normalizedQuery,
    })
    sendJson(response, 500, { error: 'OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  try {
    const openAiStartedAt = nowMs()
    const framingFields = await generateFramingFields({
      productQuery: normalizedQuery,
      apiKey: openAiApiKey,
      model: getRefinementModel(),
    })
    const openAiDuration = nowMs() - openAiStartedAt
    const totalDuration = nowMs() - requestStartedAt
    const contract = framingFields.contract || null

    logSearchFlowEvent('query_framing_fields_completed', {
      route: '/api/search/framing-fields',
      lane: 'framing_fields',
      query: normalizedQuery,
      categoryHint: contract?.categoryHint || '',
      tradeoffAxisCount: Array.isArray(contract?.tradeoffAxes) ? contract.tradeoffAxes.length : 0,
      refinementHintCount: Array.isArray(contract?.refinementHints) ? contract.refinementHints.length : 0,
      openaiMs: roundTimingDuration(openAiDuration),
      totalMs: roundTimingDuration(totalDuration),
      openaiUsage: framingFields.usage || null,
      queryFramingMode: 'framing_fields',
      rankingOwner: 'query_framing_background',
    })

    sendJson(response, 200, {
      queryFraming: contract,
      usage: framingFields.usage || null,
      queryFramingMode: 'framing_fields',
    }, {
      serverTiming: [
        { name: 'openai', duration: openAiDuration },
        { name: 'total', duration: totalDuration },
      ],
    })
  } catch (error) {
    logSearchFlowEvent('query_framing_fields_failed', {
      route: '/api/search/framing-fields',
      lane: 'framing_fields',
      query: normalizedQuery,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    sendJson(response, 500, {
      error: 'Unable to generate query framing fields.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export async function handlePrewarmSelection(request, response) {
  const requestStartedAt = nowMs()
  const openAiApiKey = getEnv('OPENAI_API_KEY')

  if (!openAiApiKey) {
    sendJson(response, 500, { error: 'OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const rateLimit = await takeRateLimitToken(clientIpAddress, PREWARM_SELECTION_RATE_LIMIT)

  if (!rateLimit.allowed) {
    logSearchFlowEvent('guided_prewarm_rate_limited', {
      route: '/api/search/prewarm',
      clientIpAddress,
    })
    sendJson(response, 429, {
      error: `Too many prewarm requests from this connection. ${RATE_LIMIT_WAIT_MESSAGE}`,
    })
    return
  }

  let body

  try {
    const bodyReadStartedAt = nowMs()
    body = await readJsonBody(request, { maxBytes: PREWARM_BODY_LIMIT_BYTES })
    body.bodyReadDuration = nowMs() - bodyReadStartedAt
  } catch (error) {
    logSearchFlowEvent('guided_prewarm_invalid_body', {
      route: '/api/search/prewarm',
      error: error instanceof Error ? error.message : 'Invalid request body.',
    })
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request body.' })
    return
  }

  const sanitizedDiscoveryContext = sanitizeFinalizeDiscoveryContext({
    ...body,
    requestMode: truncateText(body?.requestMode, 80) || PREWARM_REQUEST_MODE_DEFAULT,
  })

  if (!sanitizedDiscoveryContext.isValid) {
    logSearchFlowEvent('guided_prewarm_invalid', {
      route: '/api/search/prewarm',
      query: typeof body?.query === 'string' ? body.query : '',
      error: sanitizedDiscoveryContext.error,
    })
    sendJson(response, 400, { error: sanitizedDiscoveryContext.error })
    return
  }

  const cacheLookupStartedAt = nowMs()
  const resolvedCandidatePool = await readFinalizeCandidatePoolFromDiscovery(
    sanitizedDiscoveryContext.normalizedQuery,
  )
  const cacheLookupDuration = nowMs() - cacheLookupStartedAt
  let candidatePool = resolvedCandidatePool.isValid ? resolvedCandidatePool.candidatePool : null
  let cachedEntry = resolvedCandidatePool.isValid ? resolvedCandidatePool.cachedEntry : null
  let candidateAwarePrior = resolvedCandidatePool.isValid ? resolvedCandidatePool.candidateAwarePrior : null
  let candidatePoolSource = resolvedCandidatePool.isValid ? 'discovery_cache' : 'request_candidate_pool'
  const prewarmPriorSummary =
    cachedEntry?.selection &&
    typeof cachedEntry.selection === 'object' &&
    !Array.isArray(cachedEntry.selection) &&
    cachedEntry.selection.prewarm &&
    typeof cachedEntry.selection.prewarm === 'object' &&
    !Array.isArray(cachedEntry.selection.prewarm)
      ? cachedEntry.selection.prewarm
      : null

  if (!candidatePool) {
    const requestCandidatePool = sanitizeFinalizeCandidatePool(body?.candidatePool)

    if (requestCandidatePool.isValid) {
      candidatePool = requestCandidatePool.candidatePool
      cachedEntry = null
      candidateAwarePrior = null
    } else {
      logSearchFlowEvent('guided_prewarm_missing_discovery_context', {
        route: '/api/search/prewarm',
        query: sanitizedDiscoveryContext.normalizedQuery,
        error: resolvedCandidatePool.error,
      })
      sendJson(response, resolvedCandidatePool.statusCode || 409, {
        error: resolvedCandidatePool.error || 'The guided search context expired. Please start the search again.',
      })
      return
    }
  }

  if (candidateAwarePrior?.rankedCandidates?.length) {
    const priorCandidateCount = Array.isArray(candidateAwarePrior.rankedCandidates)
      ? candidateAwarePrior.rankedCandidates.length
      : 0
    const priorByteLength = safeJsonByteLength(candidateAwarePrior)
    const priorSummary = {
      priorByteLength,
      priorCandidateCount,
      priorGeneratedAt: candidateAwarePrior.generatedAt || null,
      priorReady: true,
      artifactByteLength: priorByteLength,
      artifactCandidateCount: priorCandidateCount,
      artifactGeneratedAt: candidateAwarePrior.generatedAt || null,
      artifactReady: true,
      candidatePoolSource,
      model: candidateAwarePrior.model || null,
      openaiMs: prewarmPriorSummary?.openaiMs ?? null,
      requestMode: PREWARM_REQUEST_MODE_DEFAULT,
      reusedStoredPrior: true,
      reusedStoredArtifact: true,
      storageWriteCompleted: true,
      strategy: prewarmPriorSummary?.strategy || 'candidate_aware_prior',
      totalMs: prewarmPriorSummary?.totalMs ?? null,
      usage: prewarmPriorSummary?.usage || null,
    }

    logSearchFlowEvent('guided_prewarm_reused', {
      route: '/api/search/prewarm',
      query: sanitizedDiscoveryContext.normalizedQuery,
      candidateCount: candidatePool.candidates.length,
      ...priorSummary,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })

    sendJson(response, 200, {
      requestMode: PREWARM_REQUEST_MODE_DEFAULT,
      prewarm: priorSummary,
    }, {
      serverTiming: [
        { name: 'body', duration: body.bodyReadDuration || 0 },
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'total', duration: nowMs() - requestStartedAt },
      ],
    })
    return
  }

  logSearchFlowEvent('guided_prewarm_started', {
    route: '/api/search/prewarm',
    query: sanitizedDiscoveryContext.normalizedQuery,
    candidateCount: candidatePool.candidates.length,
    candidatePoolSource,
    requestMode: PREWARM_REQUEST_MODE_DEFAULT,
  })

  try {
    const openAiStartedAt = nowMs()
    const prewarmed = await createCandidateAwarePrior({
      candidatePool,
      apiKey: openAiApiKey,
      model: getFinalizeModel(),
    })
    const openAiDuration = nowMs() - openAiStartedAt
    const prior = prewarmed.prior || prewarmed.artifact
    const priorByteLength = safeJsonByteLength(prior)
    const priorCandidateCount = Array.isArray(prior?.rankedCandidates)
      ? prior.rankedCandidates.length
      : 0
    const totalDuration = nowMs() - requestStartedAt

    let storageWriteCompleted = false
    const persistedPreviewResults = Array.isArray(cachedEntry?.results) && cachedEntry.results.length > 0
      ? cachedEntry.results
      : buildFinalizeFallbackResults(candidatePool)

    try {
      await writeSearchSnapshot({
        productQuery: sanitizedDiscoveryContext.normalizedQuery,
        details: '',
        candidatePool,
        results: persistedPreviewResults,
        selection: buildDiscoveryPreviewSelection(
          persistedPreviewResults,
          {
            candidateAwarePrior: prior,
            preRankArtifact: prior,
            prewarm: {
              priorByteLength,
              priorCandidateCount,
              priorGeneratedAt: prior?.generatedAt || null,
              artifactByteLength: priorByteLength,
              artifactCandidateCount: priorCandidateCount,
              artifactGeneratedAt: prior?.generatedAt || null,
              model: prewarmed.model,
              openaiMs: roundTimingDuration(openAiDuration),
              strategy: prewarmed.strategy || 'candidate_aware_prior',
              totalMs: roundTimingDuration(totalDuration),
              usage: prewarmed.usage || null,
            },
          },
        ),
        source: 'guided_discovery',
        scope: CACHE_SCOPE_DISCOVERY,
      })
      storageWriteCompleted = true
    } catch {
      storageWriteCompleted = false
    }

    logSearchFlowEvent('guided_prewarm_completed', {
      route: '/api/search/prewarm',
      query: sanitizedDiscoveryContext.normalizedQuery,
      priorByteLength,
      priorCandidateCount,
      artifactByteLength: priorByteLength,
      artifactCandidateCount: priorCandidateCount,
      candidateCount: candidatePool.candidates.length,
      candidatePoolSource,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      openaiMs: roundTimingDuration(openAiDuration),
      openaiUsage: prewarmed.usage || null,
      requestMode: PREWARM_REQUEST_MODE_DEFAULT,
      storageWriteCompleted,
      totalMs: roundTimingDuration(totalDuration),
    })

    sendJson(response, 200, {
      requestMode: PREWARM_REQUEST_MODE_DEFAULT,
      prewarm: {
        priorByteLength,
        priorCandidateCount,
        priorGeneratedAt: prior?.generatedAt || null,
        priorReady: true,
        artifactByteLength: priorByteLength,
        artifactCandidateCount: priorCandidateCount,
        artifactGeneratedAt: prior?.generatedAt || null,
        artifactReady: true,
        candidatePoolSource,
        model: prewarmed.model,
        openaiMs: roundTimingDuration(openAiDuration),
        requestMode: PREWARM_REQUEST_MODE_DEFAULT,
        reusedStoredPrior: false,
        reusedStoredArtifact: false,
        storageWriteCompleted,
        strategy: prewarmed.strategy || 'candidate_aware_prior',
        totalMs: roundTimingDuration(totalDuration),
        usage: prewarmed.usage || null,
      },
      usage: {
        openai: prewarmed.usage || null,
      },
    }, {
      serverTiming: [
        { name: 'body', duration: body.bodyReadDuration || 0 },
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'openai', duration: openAiDuration },
        { name: 'total', duration: totalDuration },
      ],
    })
  } catch (error) {
    logSearchFlowEvent('guided_prewarm_failed', {
      route: '/api/search/prewarm',
      query: sanitizedDiscoveryContext.normalizedQuery,
      candidateCount: candidatePool.candidates.length,
      candidatePoolSource,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      requestMode: PREWARM_REQUEST_MODE_DEFAULT,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    sendJson(response, 500, {
      error: 'Unable to generate the candidate-aware prior.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export async function handleSupabaseHealth(response) {
  const health = await getSupabaseHealth()

  if (!health.configured) {
    sendJson(response, 200, {
      ...health,
      storageMode: 'local_file_fallback',
      status: 'optional',
      details: 'Supabase is not configured. The app is using the supported local cache/history fallback for this environment.',
      setupHint: 'Add SUPABASE_URL and SUPABASE_SECRET_KEY or the legacy SUPABASE_SERVICE_ROLE_KEY to enable Supabase-backed storage.',
    })
    return
  }

  sendJson(response, health.ok ? 200 : 500, {
    ...health,
    storageMode: 'supabase',
    status: health.ok ? 'ok' : 'error',
  })
}

export async function handleSearchDebug(requestUrl, response) {
  const { error, isValid, normalizedDetails, normalizedQuery } = getValidatedSearchRequest(requestUrl)

  if (!isValid) {
    sendJson(response, 400, { error })
    return
  }

  const { cachedEntry: discoveryCachedEntry, normalizedCachedResults: discoveryCachedResults } = await readCachedSearchSnapshot({
    productQuery: normalizedQuery,
    details: '',
    scope: CACHE_SCOPE_DISCOVERY,
  })
  const guidedDiscoveryUsesCache =
    normalizedDetails === '' &&
    Boolean(discoveryCachedEntry?.candidatePool?.candidates) &&
    discoveryCachedResults.length > 0
  const guidedDiscoveryCandidateAwarePrior = getStoredCandidateAwarePrior(discoveryCachedEntry?.selection)

  sendJson(response, 200, {
    query: normalizedQuery,
    details: normalizedDetails,
    cache: {
      guidedDiscovery: {
        cacheKey: buildCacheKey(normalizedQuery, '', CACHE_SCOPE_DISCOVERY),
        hasEntry: Boolean(discoveryCachedEntry),
        source: discoveryCachedEntry?.source || null,
        cachedAt: discoveryCachedEntry?.cachedAt || null,
        expiresAt: discoveryCachedEntry?.expiresAt || null,
        candidateCount: Array.isArray(discoveryCachedEntry?.candidatePool?.candidates)
          ? discoveryCachedEntry.candidatePool.candidates.length
          : 0,
        previewResultCount: discoveryCachedResults.length,
        selectionMode: discoveryCachedEntry?.selection?.mode || null,
        candidateAwarePriorReady: Boolean(guidedDiscoveryCandidateAwarePrior),
        candidateAwarePriorGeneratedAt: guidedDiscoveryCandidateAwarePrior?.generatedAt || null,
        candidateAwarePriorCandidateCount: Array.isArray(guidedDiscoveryCandidateAwarePrior?.rankedCandidates)
          ? guidedDiscoveryCandidateAwarePrior.rankedCandidates.length
          : 0,
        prewarmArtifactReady: Boolean(guidedDiscoveryCandidateAwarePrior),
        prewarmArtifactGeneratedAt: guidedDiscoveryCandidateAwarePrior?.generatedAt || null,
        prewarmArtifactCandidateCount: Array.isArray(guidedDiscoveryCandidateAwarePrior?.rankedCandidates)
          ? guidedDiscoveryCandidateAwarePrior.rankedCandidates.length
          : 0,
      },
    },
    environment: {
      serpApiConfigured: Boolean(getEnv('SERPAPI_API_KEY')),
      openAiConfigured: Boolean(getEnv('OPENAI_API_KEY')),
      supabaseConfigured: isSupabaseConfigured(),
    },
      architecture: {
        primaryProductFlow: [
          '/api/search/discover',
          '/api/search/prewarm',
          '/api/search/refine',
          '/api/search/finalize',
        ],
        manualCombinedRoute: '/api/search/live',
        storageMode: isSupabaseConfigured() ? 'supabase' : 'local_file_fallback',
        finalizeUsesDiscoveryCache: true,
        finalizeUsesRequestCandidatePool: false,
      },
      flowBehavior: {
        guidedDiscovery: {
          usesCache: guidedDiscoveryUsesCache,
          callsSerpApi: !guidedDiscoveryUsesCache,
          callsOpenAi: false,
        },
        guidedFinalize: {
          usesCache: true,
          callsSerpApi: false,
          callsOpenAi: true,
        },
      guidedPrewarm: {
        usesCache: true,
        callsSerpApi: false,
        callsOpenAi: true,
        priorReady: Boolean(guidedDiscoveryCandidateAwarePrior),
        artifactReady: Boolean(guidedDiscoveryCandidateAwarePrior),
      },
      liveSearch: {
        usesCache: false,
        callsSerpApi: true,
        callsOpenAi: true,
      },
    },
  })
}

// Temporary harness-only handler — not wired to Vercel or frontend.
// Measures nano lock/badges then mini async enrichment as two separate AI calls.
export async function handleNanoMiniSplitFinalize(request, response) {
  const requestStartedAt = nowMs()
  const openAiApiKey = getEnv('OPENAI_API_KEY')

  if (!openAiApiKey) {
    sendJson(response, 500, { error: 'OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  let body

  try {
    body = await readJsonBody(request, { maxBytes: FINALIZE_BODY_LIMIT_BYTES })
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request body.' })
    return
  }

  const sanitizedDiscoveryContext = sanitizeFinalizeDiscoveryContext(body)

  if (!sanitizedDiscoveryContext.isValid) {
    sendJson(response, 400, { error: sanitizedDiscoveryContext.error })
    return
  }

  const resolvedCandidatePool = await readFinalizeCandidatePoolFromDiscovery(
    sanitizedDiscoveryContext.normalizedQuery,
  )

  if (!resolvedCandidatePool.isValid) {
    sendJson(response, resolvedCandidatePool.statusCode, { error: resolvedCandidatePool.error })
    return
  }

  const followUpNotes = truncateText(body?.followUpNotes, FINALIZE_MAX_NOTE_LENGTH)
  const candidatePool = {
    ...resolvedCandidatePool.candidatePool,
    details: followUpNotes || '',
  }

  const nanoModel = DEFAULT_CONTEXT_FINALIZE_MODEL
  const miniModel = DEFAULT_FINALIZE_MODEL

  try {
    const nanoStartedAt = nowMs()
    const nanoResult = await nanoLockWinnersAndBadges({
      candidatePool,
      finalResultLimit: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
      apiKey: openAiApiKey,
      model: nanoModel,
    })
    const nanoDuration = nowMs() - nanoStartedAt

    const miniStartedAt = nowMs()
    const miniResult = await miniEnrichSelectedCandidates({
      lockedIds: nanoResult.lockedIds,
      candidatePool,
      apiKey: openAiApiKey,
      model: miniModel,
    })
    const miniDuration = nowMs() - miniStartedAt

    sendJson(
      response,
      200,
      {
        nanoModel,
        miniModel,
        nanoLockMs: roundTimingDuration(nanoDuration),
        miniEnrichMs: roundTimingDuration(miniDuration),
        totalMs: roundTimingDuration(nowMs() - requestStartedAt),
        lockedIds: nanoResult.lockedIds,
        lockedBadges: nanoResult.lockedBadges,
        nanoUsage: nanoResult.usage,
        miniUsage: miniResult.usage,
        miniPreservedOrder: miniResult.preservedOrder,
        enriched: miniResult.enriched,
        candidateCount: candidatePool.candidates.length,
      },
      {
        serverTiming: [
          { name: 'nano-lock', duration: nanoDuration },
          { name: 'mini-enrich', duration: miniDuration },
          { name: 'total', duration: nowMs() - requestStartedAt },
        ],
      },
    )
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'nano-mini split finalize failed.',
    })
  }
}

export async function handleFinalizeSelection(request, response) {
  const requestStartedAt = nowMs()
  const openAiApiKey = getEnv('OPENAI_API_KEY')

  if (!openAiApiKey) {
    sendJson(response, 500, { error: 'OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const rateLimit = await takeRateLimitToken(clientIpAddress, FINALIZE_SELECTION_RATE_LIMIT)

  if (!rateLimit.allowed) {
    logSearchFlowEvent('guided_finalize_rate_limited', {
      route: '/api/search/finalize',
      clientIpAddress,
    })
    sendJson(response, 429, {
      error: `Too many finalize requests from this connection. ${RATE_LIMIT_WAIT_MESSAGE}`,
    })
    return
  }

  let body

  try {
    const bodyReadStartedAt = nowMs()
    body = await readJsonBody(request, { maxBytes: FINALIZE_BODY_LIMIT_BYTES })
    body.bodyReadDuration = nowMs() - bodyReadStartedAt
  } catch (error) {
    logSearchFlowEvent('guided_finalize_invalid_body', {
      route: '/api/search/finalize',
      error: error instanceof Error ? error.message : 'Invalid request body.',
    })
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request body.' })
    return
  }

  const sanitizedDiscoveryContext = sanitizeFinalizeDiscoveryContext(body)

  if (!sanitizedDiscoveryContext.isValid) {
    logSearchFlowEvent('guided_finalize_invalid', {
      route: '/api/search/finalize',
      query: typeof body?.query === 'string' ? body.query : '',
      error: sanitizedDiscoveryContext.error,
    })
    sendJson(response, 400, { error: sanitizedDiscoveryContext.error })
    return
  }

  const cacheLookupStartedAt = nowMs()
  const resolvedCandidatePool = await readFinalizeCandidatePoolFromDiscovery(
    sanitizedDiscoveryContext.normalizedQuery,
  )
  const cacheLookupDuration = nowMs() - cacheLookupStartedAt

  if (!resolvedCandidatePool.isValid) {
    logSearchFlowEvent('guided_finalize_missing_discovery_context', {
      route: '/api/search/finalize',
      query: sanitizedDiscoveryContext.normalizedQuery,
      error: resolvedCandidatePool.error,
    })
    sendJson(response, resolvedCandidatePool.statusCode, { error: resolvedCandidatePool.error })
    return
  }

  const candidatePool = resolvedCandidatePool.candidatePool
  const candidateAwarePrior = resolvedCandidatePool.candidateAwarePrior
  const priorities = sanitizeStringList(body?.priorities, {
    maxItems: FINALIZE_MAX_PRIORITIES,
    maxItemLength: FINALIZE_MAX_PRIORITY_LENGTH,
  })
  const followUpNotes = truncateText(body?.followUpNotes, FINALIZE_MAX_NOTE_LENGTH)
  const rejectionFeedback = truncateText(
    body?.rejectionFeedback,
    FINALIZE_MAX_REJECTION_FEEDBACK_LENGTH,
  )
  const excludedCandidateIds = sanitizeExcludedCandidateIds(body?.excludedCandidateIds)
  const retryCount = Number.isFinite(Number(body?.retryCount))
    ? Math.max(0, Math.min(FINALIZE_MAX_RETRY_COUNT, Number(body.retryCount)))
    : 0
  const requestMode = sanitizedDiscoveryContext.requestMode
  const detailParts = []
  const hasContextSignals = hasContextAddedFinalizeSignals({
    priorities,
    followUpNotes,
    rejectionFeedback,
    retryCount,
    excludedCandidateIds,
  })
  const finalizeModel = getFinalizeModel({
    hasContextSignals,
  })

  if (priorities.length > 0) {
    detailParts.push(`Priorities: ${priorities.join(', ')}`)
  }

  if (followUpNotes) {
    detailParts.push(`Notes: ${followUpNotes}`)
  }

  if (rejectionFeedback) {
    detailParts.push(`Retry feedback: ${rejectionFeedback}`)
  }

  if (excludedCandidateIds.length > 0) {
    detailParts.push(`Excluded previous picks: ${excludedCandidateIds.join(', ')}`)
  }

  const refinedDetails = detailParts.join('. ')
  const exclusionSet = new Set(excludedCandidateIds.map((value) => String(value)))
  const eligibleCandidates =
    exclusionSet.size > 0
      ? candidatePool.candidates.filter((candidate) => !exclusionSet.has(String(candidate.id)))
      : candidatePool.candidates

  const nextCandidatePool = {
    ...candidatePool,
    details: refinedDetails,
    candidates: eligibleCandidates,
  }
  const prewarmPriorSummary =
    resolvedCandidatePool.cachedEntry?.selection &&
    typeof resolvedCandidatePool.cachedEntry.selection === 'object' &&
    !Array.isArray(resolvedCandidatePool.cachedEntry.selection) &&
    resolvedCandidatePool.cachedEntry.selection.prewarm &&
    typeof resolvedCandidatePool.cachedEntry.selection.prewarm === 'object' &&
    !Array.isArray(resolvedCandidatePool.cachedEntry.selection.prewarm)
      ? resolvedCandidatePool.cachedEntry.selection.prewarm
      : null
  const tokenUsageByStage = {
    finalize: null,
    candidateAwarePrior: prewarmPriorSummary?.usage || null,
    prewarmArtifact: prewarmPriorSummary?.usage || null,
  }

  if (retryCount > 0 && nextCandidatePool.candidates.length === 0) {
    const finalizeFast = buildFinalizeFastResponseContract({
      query: sanitizedDiscoveryContext.normalizedQuery,
      discoveryToken: sanitizedDiscoveryContext.discoveryToken,
      latestUserContext: refinedDetails,
      results: [],
      selectedCandidateIds: [],
      model: '',
      strategy: 'retry_exhausted',
    })

    logSearchFlowEvent('guided_finalize_retry_exhausted', {
      route: '/api/search/finalize',
      query: sanitizedDiscoveryContext.normalizedQuery,
      candidateCount: 0,
      retryCount,
      requestMode,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })
    sendJson(response, 200, {
      finalizeFast,
      requestMode,
      retryCount,
      results: finalizeFast.shortlist,
      selection: {
        layer: finalizeFast.layer,
        mode: 'retry_exhausted',
        model: null,
        requestMode,
        shortlistLocked: finalizeFast.shortlistLocked,
        selectedCandidateIds: finalizeFast.selectedCandidateIds,
        details: 'No new candidates remained after excluding the previously rejected picks.',
      },
    }, {
      serverTiming: [
        { name: 'body', duration: body.bodyReadDuration || 0 },
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'total', duration: nowMs() - requestStartedAt },
      ],
    })
    return
  }

  try {
    const openAiStartedAt = nowMs()
    const aiSelection = await selectAiResults({
      candidatePool: nextCandidatePool,
      finalResultLimit: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
      apiKey: openAiApiKey,
      model: finalizeModel,
      candidateAwarePrior,
    })
    const openAiDuration = nowMs() - openAiStartedAt
    tokenUsageByStage.finalize = aiSelection.usage || null

    const fallbackResults = buildFinalizeFallbackResults(nextCandidatePool)

    const results = aiSelection.results.length > 0 ? aiSelection.results : fallbackResults
    const selectedCandidateIds =
      aiSelection.results.length > 0
        ? aiSelection.selectedCandidateIds
        : fallbackResults.map((item) => item.id)
    const selectionStrategy =
      aiSelection.strategy || (aiSelection.results.length > 0 ? 'single_pass' : 'rules_fallback')
    const finalizeFast = buildFinalizeFastResponseContract({
      query: sanitizedDiscoveryContext.normalizedQuery,
      discoveryToken: sanitizedDiscoveryContext.discoveryToken,
      latestUserContext: refinedDetails,
      results,
      selectedCandidateIds,
      model: aiSelection.results.length > 0 ? aiSelection.model : '',
      strategy: selectionStrategy,
    })
    const totalDuration = nowMs() - requestStartedAt
    const reusedCandidateAwarePrior = Boolean(
      aiSelection.debug?.candidateAwarePriorReused || aiSelection.debug?.preRankArtifactReused,
    )
    const usedIntentMatchRerank = Boolean(aiSelection.debug?.intentMatchRerankUsed)
    const fallbackReason =
      aiSelection.results.length > 0
        ? null
        : reusedCandidateAwarePrior
          ? aiSelection.debug?.candidateAwarePriorReuseReason || aiSelection.debug?.preRankReuseReason || 'prior_rerank_empty_fallback'
          : candidateAwarePrior
            ? aiSelection.debug?.candidateAwarePriorReuseReason || aiSelection.debug?.preRankReuseReason || 'prior_unusable_fallback'
            : 'prior_missing'
    const flowPath =
      aiSelection.results.length > 0
        ? reusedCandidateAwarePrior
          ? 'candidate_aware_prior_rerank'
          : 'full_finalize'
        : 'full_finalize_fallback'

    logSearchFlowEvent('guided_finalize_completed', {
      route: '/api/search/finalize',
      query: sanitizedDiscoveryContext.normalizedQuery,
      candidateCount: nextCandidatePool.candidates.length,
      finalCount: results.length,
      retryCount,
      requestMode,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      openaiMs: roundTimingDuration(openAiDuration),
      totalMs: roundTimingDuration(totalDuration),
      openaiUsage: aiSelection.usage || null,
      rankingOwner: reusedCandidateAwarePrior
        ? 'openai_with_candidate_aware_prior'
        : aiSelection.results.length > 0
          ? 'openai_then_backend_select'
          : 'deterministic_fallback',
      selectionMode: aiSelection.results.length > 0 ? 'ai' : 'rules_fallback',
      selectionStrategy,
      flowPath,
      intentMatchRerankingUsed: usedIntentMatchRerank,
      reusedCandidateAwarePrior,
      reusedPreRankArtifact: reusedCandidateAwarePrior,
      fallbackReason,
      priorByteLength: safeJsonByteLength(candidateAwarePrior),
      priorCandidateCount: aiSelection.debug?.priorCandidateCount || aiSelection.debug?.artifactCandidateCount || 0,
      artifactByteLength: safeJsonByteLength(candidateAwarePrior),
      artifactCandidateCount: aiSelection.debug?.artifactCandidateCount || aiSelection.debug?.priorCandidateCount || 0,
      finalizeModel,
      finalizeModelPath: hasContextSignals ? 'context_added' : 'baseline',
    })

    sendJson(response, 200, {
      debug: {
        finalizeFastLayer: finalizeFast.layer,
        priorByteLength: safeJsonByteLength(candidateAwarePrior),
        priorCandidateCount: aiSelection.debug?.priorCandidateCount || aiSelection.debug?.artifactCandidateCount || 0,
        artifactByteLength: safeJsonByteLength(candidateAwarePrior),
        artifactCandidateCount: aiSelection.debug?.artifactCandidateCount || aiSelection.debug?.priorCandidateCount || 0,
        fallbackReason,
        flowPath,
        finalizeModel,
        finalizeModelPath: hasContextSignals ? 'context_added' : 'baseline',
        requestMode,
        reusedCandidateAwarePrior,
        reusedPreRankArtifact: reusedCandidateAwarePrior,
        stageLatencyMs: {
          body: roundTimingDuration(body.bodyReadDuration || 0),
          cache: roundTimingDuration(cacheLookupDuration),
          openai: roundTimingDuration(openAiDuration),
          total: roundTimingDuration(totalDuration),
        },
        tokenUsageByStage,
        usedIntentMatchRerank,
      },
      finalizeFast,
      requestMode,
      retryCount,
      results: finalizeFast.shortlist,
      selection: {
        layer: finalizeFast.layer,
        mode: aiSelection.results.length > 0 ? 'ai' : 'rules_fallback',
        strategy: selectionStrategy,
        model: aiSelection.results.length > 0 ? aiSelection.model : null,
        modelPath: hasContextSignals ? 'context_added' : 'baseline',
        requestMode,
        shortlistLocked: finalizeFast.shortlistLocked,
        usage: aiSelection.results.length > 0 ? aiSelection.usage || null : null,
        selectedCandidateIds: finalizeFast.selectedCandidateIds,
        details:
          aiSelection.results.length > 0
            ? reusedCandidateAwarePrior
              ? 'AI finalized the shortlist using the stored candidate-aware prewarm prior.'
              : 'AI selected the final recommendations from the cleaned candidate pool.'
            : 'Rules-based fallback was used.',
        flowPath,
        fallbackReason,
        reusedCandidateAwarePrior,
        reusedPreRankArtifact: reusedCandidateAwarePrior,
        usedIntentMatchRerank,
      },
      usage: {
        openai: aiSelection.usage || null,
      },
    }, {
      serverTiming: [
        { name: 'body', duration: body.bodyReadDuration || 0 },
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'openai', duration: openAiDuration },
        { name: 'total', duration: totalDuration },
      ],
    })
  } catch (error) {
    logSearchFlowEvent('guided_finalize_failed', {
      route: '/api/search/finalize',
      query: sanitizedDiscoveryContext.normalizedQuery,
      candidateCount: nextCandidatePool.candidates.length,
      retryCount,
      requestMode,
      priorReady: Boolean(candidateAwarePrior),
      priorByteLength: safeJsonByteLength(candidateAwarePrior),
      artifactReady: Boolean(candidateAwarePrior),
      artifactByteLength: safeJsonByteLength(candidateAwarePrior),
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    sendJson(response, 500, {
      error: 'Unable to finalize the product selection.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

function sanitizeAnalyticsEventData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).slice(0, 20).map(([key, entryValue]) => {
      const normalizedKey = truncateText(key, 60)

      if (!normalizedKey) {
        return null
      }

      if (typeof entryValue === 'string') {
        return [normalizedKey, truncateText(entryValue, 500)]
      }

      if (typeof entryValue === 'number' || typeof entryValue === 'boolean' || entryValue === null) {
        return [normalizedKey, entryValue]
      }

      return [normalizedKey, truncateText(JSON.stringify(entryValue), 500)]
    }).filter(Boolean),
  )
}

function sanitizeAnalyticsItems(items) {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .slice(0, LIVE_RESULT_FILTER_CONFIG.finalResultLimit)
    .map((item, index) => {
      const resultKey = truncateText(item?.resultKey, 200)

      if (!resultKey) {
        return null
      }

      return {
        resultKey,
        position: Number.isFinite(Number(item?.position)) ? Number(item.position) : index,
        provider: truncateText(item?.provider, 160),
        badgeType: truncateText(item?.badgeType, 80),
        isBestPick: Boolean(item?.isBestPick),
      }
    })
    .filter(Boolean)
}

export async function handleAnalyticsTrack(request, response) {
  let body

  try {
    body = await readJsonBody(request, { maxBytes: FINALIZE_BODY_LIMIT_BYTES })
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request body.' })
    return
  }

  const searchId = truncateText(body?.searchId, 100)
  const sessionId = truncateText(body?.sessionId, 120)
  const eventType = truncateText(body?.eventType, 80)

  if (!searchId || !sessionId || !eventType) {
    sendJson(response, 400, { error: 'searchId, sessionId, and eventType are required.' })
    return
  }

  const resultSet = truncateText(body?.resultSet, 40) || 'final'

  switch (eventType) {
    case 'search_run_upsert': {
      const productQuery = truncateText(body?.productQuery, 200)

      if (!productQuery) {
        sendJson(response, 400, { error: 'productQuery is required for search_run_upsert.' })
        return
      }

      await upsertAnalyticsSearchRun({
        searchId,
        sessionId,
        productQuery,
        details: truncateText(body?.details, 500),
        enteredAiRefinement: Boolean(body?.enteredAiRefinement),
        usedShowProductsNow: Boolean(body?.usedShowProductsNow),
        completedFinalize: Boolean(body?.completedFinalize),
        retryRound: Number.isFinite(Number(body?.retryRound)) ? Number(body.retryRound) : 0,
        bestResultKey: truncateText(body?.bestResultKey, 200),
      })
      break
    }
    case 'search_event':
      await recordAnalyticsSearchEvent({
        searchId,
        sessionId,
        eventType: truncateText(body?.name, 80) || 'unknown',
        eventData: sanitizeAnalyticsEventData(body?.eventData),
      })
      break
    case 'result_impressions': {
      const items = sanitizeAnalyticsItems(body?.items)

      if (items.length === 0) {
        sendJson(response, 400, { error: 'At least one result impression item is required.' })
        return
      }

      await recordAnalyticsResultImpressions({
        searchId,
        sessionId,
        resultSet,
        items,
      })
      break
    }
    case 'result_click':
      await recordAnalyticsResultClick({
        searchId,
        sessionId,
        resultSet,
        resultKey: truncateText(body?.resultKey, 200),
        position: Number.isFinite(Number(body?.position)) ? Number(body.position) : 0,
        provider: truncateText(body?.provider, 160),
        badgeType: truncateText(body?.badgeType, 80),
        isBestPick: Boolean(body?.isBestPick),
        clickTarget: truncateText(body?.clickTarget, 80),
        retailerUrl: truncateText(body?.retailerUrl, 1000),
      })
      break
    default:
      sendJson(response, 400, { error: 'Unsupported analytics event type.' })
      return
  }

  sendJson(response, 202, { ok: true })
}

export function createApiServer() {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      response.end()
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/discover') {
      await handleDiscoverySearch(requestUrl, response, request)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/refine') {
      await handleRefinementPrompt(requestUrl, response)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/framing-fields') {
      await handleQueryFramingFields(requestUrl, response)
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/search/prewarm') {
      await handlePrewarmSelection(request, response)
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

    if (request.method === 'POST' && requestUrl.pathname === '/api/search/finalize-nano-mini-split') {
      await handleNanoMiniSplitFinalize(request, response)
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/search/finalize') {
      await handleFinalizeSelection(request, response)
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/analytics/track') {
      await handleAnalyticsTrack(request, response)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/live') {
      await handleLiveSearch(requestUrl, response, request)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/cache') {
      await handleCachedSearch(requestUrl, response)
      return
    }

    sendJson(response, 404, { error: 'Not found.' })
  })
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  const server = createApiServer()

  server.listen(PORT, () => {
    console.log(`API server listening on http://127.0.0.1:${PORT}`)
  })
}
