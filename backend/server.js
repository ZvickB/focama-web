import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_FINALIZE_MODEL,
  DEFAULT_REFINEMENT_MODEL,
  haikuLockWinnersAndBadges,
  miniEnrichSelectedCandidates,
} from './lib/ai-selector.js'
import { createFinalizeFastContract, toFinalizeFastCard } from './lib/layered-contracts.js'
import { DEFAULT_RATE_LIMIT_CONFIG, getClientIpAddress, getCountryCode, takeRateLimitToken } from './lib/rate-limit.js'
import { ALLOWED_ORIGIN, sendJson, readJsonBody } from './lib/http.js'
import { emitEnrichmentReady, enrichmentBus } from './lib/enrichment-bus.js'
import {
  sanitizeAnalyticsEventData,
  sanitizeAnalyticsItems,
  sanitizeStringList,
  truncateText,
} from './lib/text-sanitizers.js'
import { createRetryAdviceHandler } from './lib/handlers/retry-advice-handler.js'
import { createFeedbackHandler } from './lib/handlers/feedback-handler.js'
import { createSupabaseHealthHandler } from './lib/handlers/supabase-health-handler.js'
import { generateRefinementPrompt } from './lib/refinement-assistant.js'
import { DEFAULT_FILTER_CONFIG } from './lib/result-filter.js'
import {
  getValidatedSearchRequest,
  readCachedSearchSnapshot,
  recordSearchCacheEvent,
  writeSearchSnapshot,
} from './lib/search-pipeline.js'
import { fetchOxylabsArtifacts, fetchOxylabsProductDetailsByAsin } from './lib/oxylabs-pipeline.js'
import {
  isSupabaseConfigured,
  recordAnalyticsResultClick,
  recordAnalyticsResultImpressions,
  recordAnalyticsSearchEvent,
  readProductDetailsCacheEntries,
  upsertAnalyticsSearchRun,
  writeProductDetailsCacheEntries,
} from './lib/search-storage.js'
import { buildCacheKey, getEnv, validateSearchInput } from './lib/search-data.js'
import { getAmazonDomainFromCountryCode, normalizeAmazonDomain } from '../shared/amazon-marketplaces.js'

const PORT = Number(process.env.PORT || 8787)
const LIVE_RESULT_FILTER_CONFIG = {
  ...DEFAULT_FILTER_CONFIG,
  candidatePoolSize: 30,
  finalResultLimit: 6,
}
const FINALIZE_BODY_LIMIT_BYTES = 32 * 1024
const RETRY_ADVICE_BODY_LIMIT_BYTES = 16 * 1024
const FEEDBACK_BODY_LIMIT_BYTES = 16 * 1024
const FINALIZE_MAX_CANDIDATES = LIVE_RESULT_FILTER_CONFIG.candidatePoolSize
const FINALIZE_MAX_NOTE_LENGTH = 500
const FINALIZE_MAX_REJECTION_FEEDBACK_LENGTH = 300
const RETRY_ADVICE_MAX_SHORTLIST_ITEMS = 6
const RETRY_ADVICE_MAX_TITLE_LENGTH = 160
const FINALIZE_MAX_PRIORITIES = 8
const FINALIZE_MAX_PRIORITY_LENGTH = 80
const FINALIZE_MAX_RETRY_COUNT = 2
const FEEDBACK_MAX_SESSION_ID_LENGTH = 120
const FEEDBACK_MAX_SEARCH_ID_LENGTH = 100
const FEEDBACK_MAX_STAGE_LENGTH = 40
const FEEDBACK_MAX_PAGE_LENGTH = 120
const FEEDBACK_MAX_QUERY_LENGTH = 200
const FEEDBACK_MAX_FREE_TEXT_LENGTH = 2000
const FEEDBACK_MAX_EMAIL_LENGTH = 240
const FEEDBACK_MAX_SELECTED_PRODUCT_ID_LENGTH = 200
const ENRICHMENT_STREAM_TIMEOUT_MS = 30000
const CACHE_SCOPE_DISCOVERY = 'guided_discovery'
const CACHE_SCOPE_RAINFOREST = 'rainforest_discovery'
const CACHE_SCOPE_LIVE_SEARCH = 'live_search'
const FINALIZE_REQUEST_MODE_DEFAULT = 'guided_finalize'
const FINALIZE_REQUEST_MODE_EMPTY_NOTES = 'guided_empty_notes'
const RATE_LIMIT_WAIT_MESSAGE = 'Please wait about 10 seconds and try again.'

function getRequestedAmazonDomain(value = '') {
  return normalizeAmazonDomain(value)
}

function getAmazonMarketplaceScope(scope, amazonDomain = '') {
  const normalizedAmazonDomain = getRequestedAmazonDomain(amazonDomain)
  return normalizedAmazonDomain ? `${scope}:${normalizedAmazonDomain}` : scope
}

function resolveAmazonDomain({ requestUrl = null, body = null, countryCode = 'US' } = {}) {
  const requestedAmazonDomain =
    getRequestedAmazonDomain(body?.amazonDomain) ||
    getRequestedAmazonDomain(requestUrl?.searchParams?.get('amazonDomain') || '')

  return requestedAmazonDomain || getAmazonDomainFromCountryCode(countryCode)
}
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

function roundTimingDuration(value) {
  return Math.round(value * 10) / 10
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

function buildDiscoveryPreviewSelection(results, extraSelection = {}) {
  return {
    mode: 'discovery_preview',
    model: null,
    selectedCandidateIds: results.map((item) => item.id),
    details: 'Discovery preview results were cached for the guided search flow. Finalized picks stay request-specific.',
    ...extraSelection,
  }
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
  const amazonDomain = getRequestedAmazonDomain(body?.amazonDomain)
  const { error, isValid, normalizedQuery } = validateSearchInput(query, '')

  if (!isValid) {
    return {
      error,
      isValid: false,
    }
  }

  if (!discoveryToken) {
    return {
      error: 'Your search session expired. Start a new search.',
      isValid: false,
    }
  }

  return {
    amazonDomain,
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

function resolveFinalizeCandidatePool(cachedEntry) {
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

  return {
    candidatePool: sanitizedCandidatePool.candidatePool,
    cachedEntry,
    isValid: true,
  }
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
  scope,
}) {
  const storedToken = truncateText(cachedEntry?.discoveryToken, 300)

  if (storedToken) {
    return {
      cachedEntry,
      discoveryToken: storedToken,
    }
  }

  const discoveryToken = createDiscoveryToken()
  const updatedEntry = await writeSearchSnapshot({
    productQuery: normalizedQuery,
    details: normalizedDetails,
    candidatePool: cachedEntry?.candidatePool ?? null,
    discoveryToken,
    results: Array.isArray(cachedEntry?.results) ? cachedEntry.results : [],
    selection: cachedEntry?.selection ?? null,
    source: cachedEntry?.source || 'guided_discovery',
    scope,
  })

  return {
    cachedEntry: {
      ...cachedEntry,
      discoveryToken,
      cachedAt: updatedEntry?.cachedAt || cachedEntry?.cachedAt,
      expiresAt: updatedEntry?.expiresAt || cachedEntry?.expiresAt,
    },
    discoveryToken,
  }
}

function buildFinalizeFallbackResults(candidatePool) {
  return candidatePool.candidates
    .slice(0, LIVE_RESULT_FILTER_CONFIG.finalResultLimit)
    .map((candidate) => toFinalizeFastCard(candidate))
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

function mergeProductDetailsIntoCandidatePool(candidatePool, productDetailsById) {
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
      }
    }),
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
  const oxylabsUsername = getEnv('OXYLABS_USERNAME') // TODO: swap back to Rainforest before launch.
  const oxylabsPassword = getEnv('OXYLABS_PASSWORD') // TODO: swap back to Rainforest before launch.

  if (!oxylabsUsername || !oxylabsPassword) {
    sendJson(response, 500, { error: 'OXYLABS_USERNAME and OXYLABS_PASSWORD are required in the root .env file.' })
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

  if (cachedEntry?.candidatePool && cachedEntry?.results?.length) {
    const tokenizedDiscovery = await ensureDiscoverySnapshotToken({
      normalizedQuery,
      normalizedDetails,
      cachedEntry,
      scope: rainforestScope,
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
    return
  }

  try {
    const discoveryToken = createDiscoveryToken()
    const rainforestStartedAt = nowMs()
    const { artifacts, error: artifactsError } = await fetchOxylabsArtifacts({ // TODO: swap back to Rainforest before launch.
      filterConfig: LIVE_RESULT_FILTER_CONFIG,
      productQuery: normalizedQuery,
      details: normalizedDetails,
      reasonFallback: 'Returned by the Rainforest API search route',
      oxylabsUsername,
      oxylabsPassword,
      amazonDomain,
    })

    if (artifactsError) {
      sendJson(response, artifactsError.statusCode, {
        error: artifactsError.error,
      })
      return
    }
    const rainforestDuration = nowMs() - rainforestStartedAt

    runInBackground(
      writeSearchSnapshot({
        productQuery: normalizedQuery,
        details: normalizedDetails,
        candidatePool: {
          ...artifacts.candidatePool,
          amazonDomain,
        },
        discoveryToken,
        results: artifacts.results,
        selection: buildDiscoveryPreviewSelection(artifacts.results),
        source: 'rainforest_discovery',
        scope: rainforestScope,
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
      source: 'rainforest_discovery',
    })

    logSearchFlowEvent('rainforest_discovery_completed', {
      route: '/api/search/rainforest-discover',
      query: normalizedQuery,
      cacheStatus: 'miss',
      candidateCount: Array.isArray(artifacts.candidatePool?.candidates)
        ? artifacts.candidatePool.candidates.length
        : 0,
      previewCount: artifacts.results.length,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      rainforestMs: roundTimingDuration(rainforestDuration),
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
    }, {
      serverTiming: [
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'rainforest', duration: rainforestDuration },
        { name: 'total', duration: nowMs() - requestStartedAt },
      ],
    })
  } catch (error) {
    logSearchFlowEvent('rainforest_discovery_failed', {
      route: '/api/search/rainforest-discover',
      query: normalizedQuery,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    sendJson(response, 500, {
      error: 'Unable to reach Rainforest API.',
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


export const handleRetryAdvice = createRetryAdviceHandler({
  getRefinementModel,
  logSearchFlowEvent,
  nowMs,
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
      },
    },
    environment: {
      serpApiConfigured: Boolean(getEnv('SERPAPI_API_KEY')),
      openAiConfigured: Boolean(getEnv('OPENAI_API_KEY')),
      supabaseConfigured: isSupabaseConfigured(),
    },
      architecture: {
        primaryProductFlow: [
          '/api/search/rainforest-discover',
          '/api/search/refine',
          '/api/search/finalize',
        ],
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
    },
  })
}

// Runs mini enrichment after Haiku has locked the shortlist, stores result in discovery cache.
async function runMiniEnrichmentAsync({ lockedIds, candidatePool, apiKey, model, normalizedQuery, discoveryScope = CACHE_SCOPE_DISCOVERY }) {
  const miniResult = await miniEnrichSelectedCandidates({
    lockedIds,
    candidatePool,
    apiKey,
    model,
  })

  const { cachedEntry } = await readCachedSearchSnapshot({
    productQuery: normalizedQuery,
    details: '',
    scope: discoveryScope,
  })

  if (!cachedEntry) {
    return
  }

  const updatedSelection = {
    ...(cachedEntry.selection && typeof cachedEntry.selection === 'object' ? cachedEntry.selection : {}),
    enrichment: {
      entries: miniResult.enriched,
      model: miniResult.model,
      generatedAt: new Date().toISOString(),
      preservedOrder: miniResult.preservedOrder,
    },
  }

  await writeSearchSnapshot({
    productQuery: normalizedQuery,
    details: '',
    candidatePool: cachedEntry.candidatePool,
    discoveryToken: cachedEntry.discoveryToken || '',
    results: Array.isArray(cachedEntry.results) ? cachedEntry.results : [],
    selection: updatedSelection,
    source: 'enrichment_update',
    scope: discoveryScope,
  })

  emitEnrichmentReady(
    cachedEntry.discoveryToken || '',
    miniResult.enriched,
    miniResult.model,
  )

  logSearchFlowEvent('mini_enrichment_stored', {
    query: normalizedQuery,
    entryCount: miniResult.enriched.length,
    preservedOrder: miniResult.preservedOrder,
    model: miniResult.model,
  })

  return miniResult
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
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
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

export async function handleFinalizeSelection(request, response) {
  const requestStartedAt = nowMs()
  const openAiApiKey = getEnv('OPENAI_API_KEY')

  if (!openAiApiKey) {
    sendJson(response, 500, { error: 'OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const rateLimit = await takeRateLimitToken(clientIpAddress, DEFAULT_RATE_LIMIT_CONFIG)

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

  logSearchFlowEvent('guided_finalize_request_received', {
    route: '/api/search/finalize',
    bodyKeys: Object.keys(body || {}),
    hasQuery: typeof body?.query === 'string',
    hasDiscoveryToken: typeof body?.discoveryToken === 'string',
    queryLength: typeof body?.query === 'string' ? body.query.length : 0,
    tokenLength: typeof body?.discoveryToken === 'string' ? body.discoveryToken.length : 0,
    requestMode: typeof body?.requestMode === 'string' ? body.requestMode : null,
    bodyReadDuration: body?.bodyReadDuration,
  })

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
  const finalizeScopes = sanitizedDiscoveryContext.amazonDomain
    ? [getAmazonMarketplaceScope(CACHE_SCOPE_RAINFOREST, sanitizedDiscoveryContext.amazonDomain)]
    : [CACHE_SCOPE_DISCOVERY, CACHE_SCOPE_RAINFOREST]
  const resolvedDiscoveryContext = await resolveDiscoveryContext(
    sanitizedDiscoveryContext.normalizedQuery,
    sanitizedDiscoveryContext.discoveryToken,
    finalizeScopes,
  )
  const cacheLookupDuration = nowMs() - cacheLookupStartedAt

  if (!resolvedDiscoveryContext.isValid) {
    logSearchFlowEvent('guided_finalize_missing_discovery_context', {
      route: '/api/search/finalize',
      query: sanitizedDiscoveryContext.normalizedQuery,
      error: resolvedDiscoveryContext.error,
    })
    sendJson(response, resolvedDiscoveryContext.statusCode, { error: resolvedDiscoveryContext.error })
    return
  }

  const resolvedCandidatePool = resolveFinalizeCandidatePool(resolvedDiscoveryContext.cachedEntry)

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
  const tokenUsageByStage = {
    finalize: null,
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
    const haikuStartedAt = nowMs()
    const haikuResult = await haikuLockWinnersAndBadges({
      candidatePool: nextCandidatePool,
      finalResultLimit: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
      apiKey: getEnv('CLAUDE_API_KEY'),
    })
    const haikuDuration = nowMs() - haikuStartedAt
    tokenUsageByStage.finalize = haikuResult.usage || null

    const candidateById = new Map(
      nextCandidatePool.candidates.map((c) => [String(c.id), c]),
    )
    const seenHaikuIds = new Set()
    const haikuResults = haikuResult.lockedIds
      .map((id) => {
        const normalizedId = String(id)

        if (seenHaikuIds.has(normalizedId)) {
          return null
        }

        seenHaikuIds.add(normalizedId)
        const candidate = candidateById.get(normalizedId)
        return candidate ? toFinalizeFastCard(candidate) : null
      })
      .filter(Boolean)

    const fallbackResults = buildFinalizeFallbackResults(nextCandidatePool)
    const targetResultCount = fallbackResults.length
    const fallbackTopUpResults = fallbackResults.filter(
      (item) => !haikuResults.some((haikuItem) => String(haikuItem.id) === String(item.id)),
    )

    let results = fallbackResults
    let selectionStrategy = 'rules_fallback'
    let flowPath = 'nano_lock_fallback'
    let miniEnrichmentStatus = 'skipped'

    if (haikuResults.length > 0) {
      if (haikuResults.length >= targetResultCount) {
        results = haikuResults.slice(0, targetResultCount)
        selectionStrategy = 'haiku_lock'
        flowPath = 'haiku_lock'
      } else {
        results = [
          ...haikuResults,
          ...fallbackTopUpResults.slice(0, Math.max(0, targetResultCount - haikuResults.length)),
        ]
        selectionStrategy = 'haiku_lock_topped_up'
        flowPath = 'haiku_lock_topped_up'
      }

      miniEnrichmentStatus = 'running_async'
    }

    const selectedCandidateIds = results.map((item) => item.id)
    const usedHaikuSelection = haikuResults.length > 0

    const finalizeFast = buildFinalizeFastResponseContract({
      query: sanitizedDiscoveryContext.normalizedQuery,
      discoveryToken: sanitizedDiscoveryContext.discoveryToken,
      latestUserContext: refinedDetails,
      results,
      selectedCandidateIds,
      model: usedHaikuSelection ? haikuResult.model : '',
      strategy: selectionStrategy,
    })
    const totalDuration = nowMs() - requestStartedAt

    logSearchFlowEvent('guided_finalize_completed', {
      route: '/api/search/finalize',
      query: sanitizedDiscoveryContext.normalizedQuery,
      candidateCount: nextCandidatePool.candidates.length,
      finalCount: results.length,
      retryCount,
      requestMode,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      haikuMs: roundTimingDuration(haikuDuration),
      productDetailsMs: null,
      totalMs: roundTimingDuration(totalDuration),
      haikuUsage: haikuResult.usage || null,
      rankingOwner: usedHaikuSelection
        ? selectionStrategy === 'haiku_lock'
          ? 'haiku_lock'
          : 'haiku_lock_topped_up'
        : 'deterministic_fallback',
      selectionMode: usedHaikuSelection ? 'ai' : 'rules_fallback',
      selectionStrategy,
      flowPath,
      finalizeModel: haikuResult.model,
      finalizeModelPath: hasContextSignals ? 'context_added' : 'baseline',
    })

    sendJson(response, 200, {
      debug: {
        finalizeFastLayer: finalizeFast.layer,
        flowPath,
        finalizeModel: haikuResult.model,
        finalizeModelPath: hasContextSignals ? 'context_added' : 'baseline',
        requestMode,
        miniEnrichmentStatus,
        stageLatencyMs: {
          body: roundTimingDuration(body.bodyReadDuration || 0),
          cache: roundTimingDuration(cacheLookupDuration),
          haiku: roundTimingDuration(haikuDuration),
          productDetails: null,
          total: roundTimingDuration(totalDuration),
        },
        tokenUsageByStage,
      },
      finalizeFast,
      requestMode,
      retryCount,
      results,
      selection: {
        layer: finalizeFast.layer,
        mode: usedHaikuSelection ? 'ai' : 'rules_fallback',
        strategy: selectionStrategy,
        model: usedHaikuSelection ? haikuResult.model : null,
        modelPath: hasContextSignals ? 'context_added' : 'baseline',
        requestMode,
        shortlistLocked: finalizeFast.shortlistLocked,
        usage: usedHaikuSelection ? haikuResult.usage || null : null,
        selectedCandidateIds: finalizeFast.selectedCandidateIds,
        details: selectionStrategy === 'haiku_lock'
          ? 'Haiku locked the shortlist. Product details and mini enrichment are running async.'
          : selectionStrategy === 'haiku_lock_topped_up'
            ? 'Haiku locked part of the shortlist. The remaining picks were topped up from deterministic fallback, and product details plus mini enrichment are running async.'
            : 'Rules-based fallback was used.',
        flowPath,
        miniEnrichmentStatus,
      },
      usage: {
        haiku: haikuResult.usage || null,
      },
    }, {
      serverTiming: [
        { name: 'body', duration: body.bodyReadDuration || 0 },
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'haiku', duration: haikuDuration },
        { name: 'total', duration: totalDuration },
      ],
    })

    // Fire off product details and mini enrichment async; do not block the response.
    if (usedHaikuSelection) {
      const miniModel = getEnv('OPENAI_FINALIZE_MODEL') || getEnv('OPENAI_MODEL') || DEFAULT_FINALIZE_MODEL
      const oxylabsUsername = getEnv('OXYLABS_USERNAME') // TODO: swap back to Rainforest before launch.
      const oxylabsPassword = getEnv('OXYLABS_PASSWORD') // TODO: swap back to Rainforest before launch.

      runInBackground((async () => {
        try {
          const productDetailsStartedAt = nowMs()
          const productDetailsById = await fetchOxylabsProductDetailsByAsin({ // TODO: swap back to Rainforest before launch.
            asins: selectedCandidateIds,
            oxylabsUsername,
            oxylabsPassword,
            amazonDomain: sanitizedDiscoveryContext.amazonDomain,
            readCache: readProductDetailsCacheEntries,
            writeCache: writeProductDetailsCacheEntries,
          })
          const productDetailsDuration = nowMs() - productDetailsStartedAt
          const enrichedCandidatePool = mergeProductDetailsIntoCandidatePool(nextCandidatePool, productDetailsById)

          await runMiniEnrichmentAsync({
            lockedIds: selectedCandidateIds,
            candidatePool: enrichedCandidatePool,
            apiKey: openAiApiKey,
            model: miniModel,
            normalizedQuery: sanitizedDiscoveryContext.normalizedQuery,
            discoveryScope: resolvedDiscoveryContext.discoveryScope,
          })

          logSearchFlowEvent('mini_enrichment_background_completed', {
            query: sanitizedDiscoveryContext.normalizedQuery,
            productDetailsMs: roundTimingDuration(productDetailsDuration),
            mode: 'async',
          })
        } catch (error) {
          logSearchFlowEvent('mini_enrichment_failed', {
            query: sanitizedDiscoveryContext.normalizedQuery,
            error: error instanceof Error ? error.message : 'Unknown error',
            mode: 'async',
          })
        }
      })())
    }
  } catch (error) {
    logSearchFlowEvent('guided_finalize_failed', {
      route: '/api/search/finalize',
      query: sanitizedDiscoveryContext.normalizedQuery,
      candidateCount: nextCandidatePool.candidates.length,
      retryCount,
      requestMode,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    sendJson(response, 500, {
      error: 'Unable to finalize the product selection.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
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
      const items = sanitizeAnalyticsItems(body?.items, {
        maxItems: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
      })

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
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
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

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/enrichment-stream') {
      await handleEnrichmentStream(request, response)
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/analytics/track') {
      await handleAnalyticsTrack(request, response)
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
  })
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  const server = createApiServer()

  server.listen(PORT, () => {
    console.log(`API server listening on http://127.0.0.1:${PORT}`)
  })
}
