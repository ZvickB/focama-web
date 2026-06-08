import { sendJson } from '../http.js'
import {
  truncateText,
} from '../text-sanitizers.js'
import {
  resolveDiscoveryContext,
} from '../discovery-context.js'
import { getRefinementModel } from './refine-handler.js'
import { generateQueryQualityReview } from '../query-quality-review.js'
import {
  writeSearchSnapshot,
} from '../search-pipeline.js'
import { getEnv, validateSearchInput } from '../search-data.js'
import {
  CACHE_SCOPE_DISCOVERY,
  CACHE_SCOPE_RAINFOREST,
  getAmazonMarketplaceScope,
  getRequestedAmazonDomain,
  logSearchFlowEvent,
  nowMs,
  roundTimingDuration,
  runInBackground,
} from '../server-helpers.js'

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
