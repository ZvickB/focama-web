import { sendJson, readJsonBody } from '../http.js'
import { verifySupabaseBearerToken } from '../auth.js'
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
const MOBILE_ANALYTICS_EVENTS = new Set([
  'candidate_recovery_accepted',
  'candidate_recovery_kept_partial_picks',
  'candidate_recovery_shown',
  'refinement_completed',
  'refinement_presented',
  'results_shown',
  'retailer_clicked',
  'product_opened',
  'retry_started',
  'search_failed',
  'search_started',
])

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
  const deviceId = truncateText(body?.deviceId, 120)
  const sessionId = truncateText(body?.sessionId, 120)
  const eventType = truncateText(body?.eventType, 80)

  if (!searchId || !sessionId || !eventType) {
    sendJson(response, 400, { error: 'searchId, sessionId, and eventType are required.' })
    return
  }

  const resultSet = truncateText(body?.resultSet, 40) || 'final'
  const platform = ['mobile', 'web'].includes(truncateText(body?.platform, 20))
    ? truncateText(body?.platform, 20)
    : 'web'
  const auth = await verifySupabaseBearerToken(request.headers || {})
  const accountId = auth.ok ? auth.user.id : ''

  switch (eventType) {
    case 'search_run_upsert': {
      const productQuery = truncateText(body?.productQuery, 200)

      if (!productQuery) {
        sendJson(response, 400, { error: 'productQuery is required for search_run_upsert.' })
        return
      }

      await upsertAnalyticsSearchRun({
        searchId,
        deviceId,
        sessionId,
        accountId,
        platform,
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
        deviceId,
        sessionId,
        accountId,
        platform,
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
        deviceId,
        sessionId,
        accountId,
        platform,
        resultSet,
        items,
      })
      break
    }
    case 'result_click':
      await recordAnalyticsResultClick({
        searchId,
        deviceId,
        sessionId,
        accountId,
        platform,
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

// Mobile has a deliberately narrow contract. It shares the existing analytics
// storage, but cannot send the free-form fields accepted by the legacy web route.
export async function handleMobileAnalyticsTrack(request, response) {
  let body

  try {
    body = await readJsonBody(request, { maxBytes: 20 * 1024 })
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request body.' })
    return
  }

  const event = truncateText(body?.event, 80)
  const searchId = truncateText(body?.searchId, 100)
  const sessionId = truncateText(body?.sessionId, 120)
  const payload = body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
    ? body.payload
    : {}

  if (!MOBILE_ANALYTICS_EVENTS.has(event) || !searchId || !sessionId) {
    sendJson(response, 400, { error: 'A supported event, searchId, and sessionId are required.' })
    return
  }

  const base = { accountId: '', deviceId: '', platform: 'mobile', searchId, sessionId }

  if (event === 'search_started') {
    const productQuery = truncateText(payload.query, 200)

    if (!productQuery) {
      sendJson(response, 400, { error: 'A search query is required when a mobile search starts.' })
      return
    }

    await upsertAnalyticsSearchRun({
      ...base,
      bestResultKey: '',
      completedFinalize: false,
      details: '',
      enteredAiRefinement: false,
      productQuery,
      retryRound: 0,
      usedShowProductsNow: false,
    })
  }

  if (event === 'results_shown') {
    const productQuery = truncateText(payload.query, 200)
    await upsertAnalyticsSearchRun({
      ...base,
      bestResultKey: '',
      completedFinalize: true,
      details: '',
      enteredAiRefinement: true,
      productQuery,
      retryRound: 0,
      usedShowProductsNow: false,
    })
    const items = sanitizeAnalyticsItems(payload.items, { maxItems: LIVE_RESULT_FILTER_CONFIG.finalResultLimit })
    if (items.length) {
      await recordAnalyticsResultImpressions({ ...base, items, resultSet: 'final' })
    }
  }

  if (event === 'product_opened' || event === 'retailer_clicked') {
    await recordAnalyticsResultClick({
      ...base,
      badgeType: '',
      clickTarget: event === 'product_opened' ? 'card' : 'retailer',
      isBestPick: Number(payload.position) === 1,
      position: Number.isFinite(Number(payload.position)) ? Number(payload.position) : 0,
      provider: truncateText(payload.provider, 160),
      resultKey: truncateText(payload.resultKey, 200),
      resultSet: 'final',
      retailerUrl: '',
    })
  }

  await recordAnalyticsSearchEvent({
    ...base,
    eventData: event === 'search_failed'
      ? { stage: ['discovery', 'refinement', 'finalize'].includes(payload.stage) ? payload.stage : 'unknown' }
      : event === 'results_shown'
        ? { resultCount: Math.max(0, Math.min(Number(payload.resultCount) || 0, LIVE_RESULT_FILTER_CONFIG.finalResultLimit)) }
      : event === 'search_started'
          ? { amazonDomain: truncateText(payload.amazonDomain, 80) }
          : event.startsWith('candidate_recovery_')
            ? {
                goodCandidateCount: Math.max(0, Math.min(Number(payload.goodCandidateCount) || 0, 3)),
                suggestedQueryLength: Math.max(0, Math.min(Number(payload.suggestedQueryLength) || 0, 200)),
              }
          : {},
    eventType: `mobile.${event}`,
  })

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
