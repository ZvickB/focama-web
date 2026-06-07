import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_FINALIZE_MODEL,
  DEFAULT_HAIKU_MODEL,
  DEFAULT_REFINEMENT_MODEL,
  haikuLockWinnersAndBadges,
  miniEnrichSelectedCandidates,
} from './lib/ai-selector.js'
import { createFinalizeFastContract, toFinalizeFastCard } from './lib/layered-contracts.js'
import { DEFAULT_RATE_LIMIT_CONFIG, getClientIpAddress, takeRateLimitToken } from './lib/rate-limit.js'
import { ALLOWED_ORIGIN, attachCorsOrigin, buildInternalErrorPayload, resolveCorsOrigin, sendJson, readJsonBody } from './lib/http.js'
import { emitEnrichmentReady, enrichmentBus } from './lib/enrichment-bus.js'
import {
  sanitizeStringList,
  truncateText,
} from './lib/text-sanitizers.js'
import { initObservability, registerProcessErrorHandlers, reportBackendError } from './lib/observability.js'
import {
  resolveDiscoveryContext,
  getDiscoverySessionScope,
} from './lib/handlers/discovery-handler.js'
import { createRetryAdviceHandler } from './lib/handlers/retry-advice-handler.js'
import { createFeedbackHandler } from './lib/handlers/feedback-handler.js'
import { createSupabaseHealthHandler } from './lib/handlers/supabase-health-handler.js'
import { generateRefinementPrompt } from './lib/refinement-assistant.js'
import { generateQueryQualityReview } from './lib/query-quality-review.js'
import { lacksKnownPositivePrice } from './lib/result-filter.js'
import {
  getValidatedSearchRequest,
  readCachedSearchSnapshot,
  writeSearchSnapshot,
} from './lib/search-pipeline.js'
import { fetchOxylabsProductDetailsByAsin } from './lib/oxylabs-pipeline.js'
import {
  isSupabaseConfigured,
  recordOxylabsProductFailures,
  readProductDetailsCacheEntries,
  writeProductDetailsCacheEntries,
} from './lib/search-storage.js'
import { buildCacheKey, getEnv, validateSearchInput } from './lib/search-data.js'
import { normalizeCachedProductDetailsEntry } from './lib/product-details-cache.js'
import {
  CACHE_SCOPE_DISCOVERY,
  CACHE_SCOPE_DISCOVERY_SESSION,
  CACHE_SCOPE_LIVE_SEARCH,
  CACHE_SCOPE_RAINFOREST,
  FINALIZE_BODY_LIMIT_BYTES,
  LIVE_RESULT_FILTER_CONFIG,
  MIN_DISCOVERY_PROVIDER_RESULT_COUNT,
  RATE_LIMIT_WAIT_MESSAGE,
  RECENT_FINALIZATIONS_MAX,
  recentFinalizations,
  clampInteger,
  getAmazonMarketplaceScope,
  getRequestedAmazonDomain,
  isLocalhostHost,
  logSearchFlowEvent,
  nowMs,
  readHeaderValue,
  resolveAmazonDomain,
  roundTimingDuration,
  runInBackground,
} from './lib/server-helpers.js'

const PORT = Number(process.env.PORT || 8787)
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
const FINALIZE_REQUEST_MODE_DEFAULT = 'guided_finalize'
const FINALIZE_REQUEST_MODE_EMPTY_NOTES = 'guided_empty_notes'
const PRODUCT_DETAILS_ASIN_MAX_LENGTH = 200


function recordRecentFinalization({ query, details, results, strategy, model, timestamp }) {
  recentFinalizations.unshift({
    query,
    details: details || '',
    picks: results.map((r, i) => ({
      rank: i + 1,
      id: r.id ?? null,
      title: r.title || '—',
      price: r.price ?? null,
      rating: r.rating ?? null,
      reviewCount: r.reviewCount ?? null,
      badge: r.badge ?? null,
    })),
    strategy: strategy || null,
    model: model || null,
    timestamp,
  })
  if (recentFinalizations.length > RECENT_FINALIZATIONS_MAX) {
    recentFinalizations.length = RECENT_FINALIZATIONS_MAX
  }
}



function getRefinementModel() {
  return getEnv('OPENAI_REFINEMENT_MODEL') || getEnv('OPENAI_MODEL') || DEFAULT_REFINEMENT_MODEL
}

function getHaikuRefinementModel() {
  return getEnv('CLAUDE_REFINEMENT_MODEL') || getEnv('CLAUDE_MODEL') || DEFAULT_HAIKU_MODEL
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

function hasPrimeDeliveryRequirement(...values) {
  const combined = values
    .map((value) => (typeof value === 'string' ? value : ''))
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  if (!combined) {
    return false
  }

  return /\b(amazon\s+prime|prime\s+(eligible|delivery|shipping|only|required|preferred|items?|products?)|with\s+prime|has\s+prime|must\s+have\s+prime)\b/.test(combined)
}



function buildStoredQueryQualityReview({
  status,
  originalQuery,
  review = null,
  error = '',
} = {}) {
  const now = new Date().toISOString()

  if (status === 'failed') {
    return {
      status: 'failed',
      classification: 'ok',
      originalQuery: truncateText(originalQuery, 200),
      suggestedQuery: '',
      confidence: 'low',
      reason: '',
      shouldSuggest: false,
      error: truncateText(error, 160),
      reviewedAt: now,
    }
  }

  if (status === 'pending') {
    return {
      status: 'pending',
      originalQuery: truncateText(originalQuery, 200),
      suggestedQuery: '',
      shouldSuggest: false,
      reviewedAt: now,
    }
  }

  return {
    status: review?.shouldSuggest ? 'ready' : 'skipped',
    classification: truncateText(review?.classification, 40) || 'ok',
    originalQuery: truncateText(originalQuery, 200),
    suggestedQuery: truncateText(review?.suggestedQuery, 100),
    confidence: truncateText(review?.confidence, 20) || 'low',
    reason: truncateText(review?.reason, 180),
    shouldSuggest: Boolean(review?.shouldSuggest),
    reviewedAt: review?.generatedAt || now,
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
      isPrime: Boolean(candidate.isPrime),
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
              hasPrimeDelivery: Boolean(candidate.matchSignals.hasPrimeDelivery),
              hasTag: Boolean(candidate.matchSignals.hasTag),
            }
          : {
              titleMatches: 0,
              supportMatches: 0,
              detailMatches: 0,
              exactMatchSearchState: false,
              hasMultipleSources: false,
              hasDeliveryInfo: false,
              hasPrimeDelivery: false,
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

    if (lacksKnownPositivePrice(sanitized.candidate)) {
      continue
    }

    candidates.push(sanitized.candidate)
  }

  if (candidates.length === 0) {
    return {
      error: 'Candidate pool must include at least one eligible candidate.',
      isValid: false,
    }
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


async function writeQueryQualityState({
  normalizedQuery,
  discoveryToken,
  discoveryScope,
  queryQuality,
}) {
  const resolvedDiscoveryContext = await resolveDiscoveryContext(
    normalizedQuery,
    discoveryToken,
    [discoveryScope],
  )

  if (!resolvedDiscoveryContext.isValid) {
    return false
  }

  const { cachedEntry } = resolvedDiscoveryContext
  const updatedSelection = {
    ...(cachedEntry.selection && typeof cachedEntry.selection === 'object' ? cachedEntry.selection : {}),
    queryQuality,
  }

  await writeSearchSnapshot({
    productQuery: normalizedQuery,
    details: '',
    candidatePool: cachedEntry.candidatePool,
    discoveryToken: discoveryToken || cachedEntry.discoveryToken || '',
    results: Array.isArray(cachedEntry.results) ? cachedEntry.results : [],
    selection: updatedSelection,
    source: 'query_quality_review_update',
    scope: discoveryScope,
  })

  return true
}

async function runQueryQualityReviewAsync({
  normalizedQuery,
  amazonDomain,
  candidatePool,
  previewResults,
  discoveryToken,
  discoveryScope,
  apiKey,
  model,
}) {
  const reviewStartedAt = nowMs()

  logSearchFlowEvent('query_quality_review_started', {
    route: '/api/search/rainforest-discover',
    query: normalizedQuery,
    candidateCount: Array.isArray(candidatePool?.candidates) ? candidatePool.candidates.length : 0,
    previewCount: Array.isArray(previewResults) ? previewResults.length : 0,
  })

  await writeQueryQualityState({
    normalizedQuery,
    discoveryToken,
    discoveryScope,
    queryQuality: buildStoredQueryQualityReview({
      status: 'pending',
      originalQuery: normalizedQuery,
    }),
  })

  try {
    const review = await generateQueryQualityReview({
      originalQuery: normalizedQuery,
      amazonDomain,
      candidatePool,
      previewResultTitles: Array.isArray(previewResults) ? previewResults.map((item) => item?.title || '') : [],
      similarQueries: Array.isArray(candidatePool?.similarQueries) ? candidatePool.similarQueries : [],
      apiKey,
      model,
    })
    const queryQuality = buildStoredQueryQualityReview({
      originalQuery: normalizedQuery,
      review,
    })

    await writeQueryQualityState({
      normalizedQuery,
      discoveryToken,
      discoveryScope,
      queryQuality,
    })

    logSearchFlowEvent(review?.shouldSuggest ? 'query_quality_review_ready' : 'query_quality_review_skipped', {
      route: '/api/search/rainforest-discover',
      query: normalizedQuery,
      suggestedQuery: review?.shouldSuggest ? review.suggestedQuery : '',
      classification: review?.classification || 'ok',
      confidence: review?.confidence || 'low',
      reviewMs: roundTimingDuration(nowMs() - reviewStartedAt),
    })
  } catch (error) {
    await writeQueryQualityState({
      normalizedQuery,
      discoveryToken,
      discoveryScope,
      queryQuality: buildStoredQueryQualityReview({
        status: 'failed',
        originalQuery: normalizedQuery,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    })

    logSearchFlowEvent('query_quality_review_failed', {
      route: '/api/search/rainforest-discover',
      query: normalizedQuery,
      reviewMs: roundTimingDuration(nowMs() - reviewStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    throw error
  }
}

export function startQueryQualityReview({
  normalizedQuery,
  amazonDomain,
  candidatePool,
  previewResults,
  discoveryToken,
  discoveryScope,
}) {
  if (!discoveryToken || !normalizedQuery) {
    return
  }

  const apiKey = getEnv('OPENAI_API_KEY')

  if (!apiKey) {
    logSearchFlowEvent('query_quality_review_skipped', {
      route: '/api/search/rainforest-discover',
      query: normalizedQuery,
      reason: 'missing_openai_api_key',
    })
    return
  }

  runInBackground(
    () => runQueryQualityReviewAsync({
      normalizedQuery,
      amazonDomain,
      candidatePool,
      previewResults,
      discoveryToken,
      discoveryScope,
      apiKey,
      model: getRefinementModel(),
    }),
    {
      amazonDomain,
      label: 'query_quality_review_async',
      query: normalizedQuery,
      route: '/api/search/rainforest-discover',
    },
  )
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

export async function handleRefinementPrompt(requestUrl, response) {
  const requestStartedAt = nowMs()
  const openAiApiKey = getEnv('OPENAI_API_KEY')
  const anthropicApiKey = getEnv('CLAUDE_API_KEY')
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

  if (!anthropicApiKey && !openAiApiKey) {
    logSearchFlowEvent('guided_refine_missing_ai_key', {
      route: '/api/search/refine',
      query: normalizedQuery,
    })
    sendJson(response, 500, { error: 'CLAUDE_API_KEY or OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  try {
    const aiStartedAt = nowMs()
    const refinementPrompt = await generateRefinementPrompt({
      productQuery: normalizedQuery,
      anthropicApiKey,
      openAiApiKey,
      haikuModel: getHaikuRefinementModel(),
      model: getRefinementModel(),
    })
    const aiDuration = nowMs() - aiStartedAt
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
      aiMs: roundTimingDuration(aiDuration),
      totalMs: roundTimingDuration(totalDuration),
      aiUsage: refinementPrompt.usage || null,
      aiProvider: refinementPrompt.provider || '',
      aiModel: refinementPrompt.model || '',
      fallbackFrom: refinementPrompt.fallbackFrom || null,
      queryFramingMode: refinementPrompt.queryFramingMode || 'legacy_query_framing',
      rankingOwner: refinementPrompt.provider === 'anthropic' ? 'haiku_question_fast' : 'openai_question_fast',
    })

    sendJson(response, 200, refinementPrompt, {
      serverTiming: [
        { name: refinementPrompt.provider === 'anthropic' ? 'haiku' : 'openai', duration: aiDuration },
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
    reportBackendError(error, {
      query: normalizedQuery,
      route: '/api/search/refine',
      source: 'guided_refine',
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })
    sendJson(response, 500, buildInternalErrorPayload('Unable to generate the refinement prompt.', error))
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
async function runMiniEnrichmentAsync({
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

async function applyLateProductDetailsToEnrichment({
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

export async function handleQueryQualityPoll(request, response) {
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

  const queryQualityScopes = amazonDomain
    ? [getAmazonMarketplaceScope(CACHE_SCOPE_RAINFOREST, amazonDomain)]
    : [CACHE_SCOPE_DISCOVERY, CACHE_SCOPE_RAINFOREST]
  const resolvedDiscoveryContext = await resolveDiscoveryContext(normalizedQuery, token, queryQualityScopes)

  if (!resolvedDiscoveryContext.isValid) {
    sendJson(response, resolvedDiscoveryContext.statusCode, { error: resolvedDiscoveryContext.error })
    return
  }

  const queryQuality = resolvedDiscoveryContext.cachedEntry?.selection?.queryQuality

  if (!queryQuality || queryQuality.status === 'pending') {
    sendJson(response, 200, { ready: false })
    return
  }

  if (queryQuality.status !== 'ready' || !queryQuality.shouldSuggest) {
    sendJson(response, 200, {
      ready: true,
      shouldSuggest: false,
    })
    return
  }

  sendJson(response, 200, {
    ready: true,
    shouldSuggest: true,
    originalQuery: queryQuality.originalQuery || normalizedQuery,
    suggestedQuery: queryQuality.suggestedQuery || '',
    reason: queryQuality.reason || '',
    classification: queryQuality.classification || '',
    confidence: queryQuality.confidence || '',
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
  const candidatesAfterExclusions =
    exclusionSet.size > 0
      ? candidatePool.candidates.filter((candidate) => !exclusionSet.has(String(candidate.id)))
      : candidatePool.candidates
  const hasPrimeRequirement = hasPrimeDeliveryRequirement(
    sanitizedDiscoveryContext.normalizedQuery,
    followUpNotes,
    rejectionFeedback,
    priorities.join(' '),
  )
  const primeEligibleCandidates = hasPrimeRequirement
    ? candidatesAfterExclusions.filter((candidate) => candidate.isPrime)
    : []
  const eligibleCandidates = primeEligibleCandidates.length > 0
    ? primeEligibleCandidates
    : candidatesAfterExclusions

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

    if (process.env.NODE_ENV !== 'production') {
      recordRecentFinalization({
        query: sanitizedDiscoveryContext.normalizedQuery,
        details: refinedDetails || sanitizedDiscoveryContext.latestUserContext || '',
        results,
        strategy: selectionStrategy,
        model: usedHaikuSelection ? haikuResult.model : null,
        timestamp: new Date().toISOString(),
      })
    }

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
          const detailFailures = []
          const productDetailsById = await fetchOxylabsProductDetailsByAsin({ // TODO: swap back to Rainforest before launch.
            asins: selectedCandidateIds,
            oxylabsUsername,
            oxylabsPassword,
            amazonDomain: sanitizedDiscoveryContext.amazonDomain,
            readCache: readProductDetailsCacheEntries,
            writeCache: writeProductDetailsCacheEntries,
            onAsinFailure: (asin, failureType, statusCode) => {
              detailFailures.push({ asin, failureType, statusCode, query: sanitizedDiscoveryContext.normalizedQuery })
            },
            onBackgroundRetryResolved: async (retryDetailsById) => {
              await applyLateProductDetailsToEnrichment({
                normalizedQuery: sanitizedDiscoveryContext.normalizedQuery,
                discoveryToken: sanitizedDiscoveryContext.discoveryToken,
                discoveryScope: resolvedDiscoveryContext.discoveryScope,
                productDetailsById: retryDetailsById,
              })
            },
          })
          if (detailFailures.length > 0) {
            await recordOxylabsProductFailures(detailFailures)
          }
          const productDetailsDuration = nowMs() - productDetailsStartedAt
          const enrichedCandidatePool = mergeProductDetailsIntoCandidatePool(nextCandidatePool, productDetailsById)

          await runMiniEnrichmentAsync({
            lockedIds: selectedCandidateIds,
            candidatePool: enrichedCandidatePool,
            apiKey: openAiApiKey,
            model: miniModel,
            normalizedQuery: sanitizedDiscoveryContext.normalizedQuery,
            discoveryToken: sanitizedDiscoveryContext.discoveryToken,
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
          reportBackendError(error, {
            label: 'mini_enrichment_async',
            query: sanitizedDiscoveryContext.normalizedQuery,
            route: '/api/search/finalize',
            source: 'guided_finalize_background',
          })
        }
      })(), {
        label: 'guided_finalize_async_enrichment',
        query: sanitizedDiscoveryContext.normalizedQuery,
        route: '/api/search/finalize',
      })
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
    reportBackendError(error, {
      candidateCount: nextCandidatePool.candidates.length,
      query: sanitizedDiscoveryContext.normalizedQuery,
      requestMode,
      retryCount,
      route: '/api/search/finalize',
      source: 'guided_finalize',
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })
    sendJson(response, 500, buildInternalErrorPayload('Unable to finalize the product selection.', error))
  }
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
