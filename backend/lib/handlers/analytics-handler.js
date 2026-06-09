import { sendJson, readJsonBody } from '../http.js'
import {
  sanitizeAnalyticsEventData,
  sanitizeAnalyticsItems,
  truncateText,
} from '../text-sanitizers.js'
import {
  isSupabaseConfigured,
  readAnalyticsDashboardData,
  readCachePoolEntries,
  recordAnalyticsResultClick,
  recordAnalyticsResultImpressions,
  recordAnalyticsSearchEvent,
  upsertAnalyticsSearchRun,
} from '../search-storage.js'
import { getValidatedSearchRequest, readCachedSearchSnapshot } from '../search-pipeline.js'
import { buildCacheKey, getEnv } from '../search-data.js'
import {
  CACHE_SCOPE_DISCOVERY,
  FINALIZE_BODY_LIMIT_BYTES,
  LIVE_RESULT_FILTER_CONFIG,
  recentFinalizations,
  clampInteger,
  isLocalhostHost,
  readHeaderValue,
} from '../server-helpers.js'

const ANALYTICS_DASHBOARD_MAX_DAYS = 90
const ANALYTICS_DASHBOARD_DEFAULT_DAYS = 14

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

export async function handleAnalyticsDashboard(request, response) {
  if (process.env.NODE_ENV === 'production') {
    sendJson(response, 404, { error: 'Not found.' })
    return
  }

  if (!isSupabaseConfigured()) {
    sendJson(response, 503, {
      error: 'Supabase is not configured, so the analytics dashboard cannot read stored funnel data.',
    })
    return
  }

  const host = readHeaderValue(request.headers, 'host')

  if (!isLocalhostHost(host)) {
    sendJson(response, 403, {
      error: 'Analytics dashboard is only available from localhost in development.',
    })
    return
  }

  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
  const days = clampInteger(requestUrl.searchParams.get('days'), {
    defaultValue: ANALYTICS_DASHBOARD_DEFAULT_DAYS,
    min: 1,
    max: ANALYTICS_DASHBOARD_MAX_DAYS,
  })
  const dashboard = await readAnalyticsDashboardData({ sinceDays: days })

  if (!dashboard.available) {
    sendJson(response, 500, { error: 'Unable to read analytics dashboard data right now.' })
    return
  }

  sendJson(response, 200, dashboard)
}

export async function handleCachePoolInspect(request, response) {
  if (process.env.NODE_ENV === 'production') {
    sendJson(response, 404, { error: 'Not found.' })
    return
  }

  if (!isSupabaseConfigured()) {
    sendJson(response, 503, { error: 'Supabase is not configured.' })
    return
  }

  const host = readHeaderValue(request.headers, 'host')

  if (!isLocalhostHost(host)) {
    sendJson(response, 403, { error: 'Cache pool inspector is only available from localhost in development.' })
    return
  }

  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
  const rawQuery = (requestUrl.searchParams.get('q') || '').trim().slice(0, 200)
  const limit = clampInteger(requestUrl.searchParams.get('limit'), { defaultValue: 25, min: 1, max: 100 })

  try {
    const entries = await readCachePoolEntries({ query: rawQuery, limit })
    sendJson(response, 200, { query: rawQuery || null, count: entries.length, entries })
  } catch {
    sendJson(response, 500, { error: 'Failed to read cache pool data.' })
  }
}

export function handleFinalizeHistory(request, response) {
  if (process.env.NODE_ENV === 'production') {
    sendJson(response, 404, { error: 'Not found.' })
    return
  }

  const host = readHeaderValue(request.headers, 'host')

  if (!isLocalhostHost(host)) {
    sendJson(response, 403, { error: 'Finalize history is only available from localhost in development.' })
    return
  }

  sendJson(response, 200, { count: recentFinalizations.length, entries: recentFinalizations })
}
