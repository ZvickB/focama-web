import {
  getSupabaseAdminClient,
  isSupabaseConfigured,
  logStorageWarning,
  readSupabaseRowsSince,
  SEARCH_ATTEMPTS_TABLE,
  SEARCH_EVENTS_TABLE,
} from './supabase-client.js'
import { truncateText } from '../text-sanitizers.js'

const MAX_METADATA_KEYS = 30

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toInteger(value) {
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) ? number : null
}

function toBooleanOrNull(value) {
  return typeof value === 'boolean' ? value : null
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_METADATA_KEYS)
      .map(([key, entryValue]) => {
        const safeKey = truncateText(key, 80)

        if (!safeKey) {
          return null
        }

        if (
          typeof entryValue === 'string' ||
          typeof entryValue === 'number' ||
          typeof entryValue === 'boolean' ||
          entryValue === null
        ) {
          return [safeKey, typeof entryValue === 'string' ? truncateText(entryValue, 500) : entryValue]
        }

        return [safeKey, truncateText(JSON.stringify(entryValue), 500)]
      })
      .filter(Boolean),
  )
}

function normalizeDiagnosticEvent(event = {}) {
  return {
    searchId: truncateText(event.searchId, 120),
    sessionId: truncateText(event.sessionId, 120),
    stage: truncateText(event.stage, 80),
    status: truncateText(event.status, 80),
    platform: truncateText(event.platform, 40) || 'web',
    appVersion: truncateText(event.appVersion, 80),
    query: truncateText(event.query, 240),
    amazonDomain: truncateText(event.amazonDomain || event.region, 80),
    provider: truncateText(event.provider, 80),
    finalStatus: truncateText(event.finalStatus, 80),
    errorType: truncateText(event.errorType || event.errorName, 120),
    errorMessage: truncateText(event.errorMessage, 500),
    reportedFilterType: truncateText(event.reportedFilterType, 80),
    retryCount: toInteger(event.retryCount),
    durationMs: toNumber(event.durationMs),
    providerStatusCode: toInteger(event.providerStatusCode),
    resultCountBeforeInternalFilters: toInteger(event.resultCountBeforeInternalFilters),
    resultCountAfterInternalFilters: toInteger(event.resultCountAfterInternalFilters),
    backendReachable: toBooleanOrNull(event.backendReachable),
    connectivityOk: toBooleanOrNull(event.connectivityOk),
    cachedOrFallbackUsed: toBooleanOrNull(event.cachedOrFallbackUsed),
    metadata: sanitizeMetadata(event.metadata),
  }
}

function buildAttemptPatch(event) {
  const patch = {
    search_id: event.searchId,
    last_event_at: new Date().toISOString(),
    platform: event.platform || 'web',
  }

  const optionalMappings = [
    ['session_id', event.sessionId],
    ['app_version', event.appVersion],
    ['query_text', event.query],
    ['amazon_domain', event.amazonDomain],
    ['provider', event.provider],
    ['status', event.status],
    ['final_status', event.finalStatus],
    ['error_type', event.errorType],
    ['error_message', event.errorMessage],
    ['reported_filter_type', event.reportedFilterType],
    ['retry_count', event.retryCount],
    ['duration_ms', event.durationMs],
    ['result_count_before_internal_filters', event.resultCountBeforeInternalFilters],
    ['result_count_after_internal_filters', event.resultCountAfterInternalFilters],
    ['backend_reachable', event.backendReachable],
    ['connectivity_ok', event.connectivityOk],
    ['cached_or_fallback_used', event.cachedOrFallbackUsed],
  ]

  for (const [column, value] of optionalMappings) {
    if (value !== null && value !== undefined && value !== '') {
      patch[column] = value
    }
  }

  return patch
}

export async function recordSearchDiagnosticEvent(rawEvent = {}) {
  const event = normalizeDiagnosticEvent(rawEvent)

  if (!isSupabaseConfigured() || !event.searchId || !event.stage) {
    return false
  }

  try {
    const supabase = getSupabaseAdminClient()

    const { error: attemptError } = await supabase.from(SEARCH_ATTEMPTS_TABLE).upsert(
      buildAttemptPatch(event),
      { onConflict: 'search_id' },
    )

    if (attemptError) {
      throw attemptError
    }

    const { error: eventError } = await supabase.from(SEARCH_EVENTS_TABLE).insert({
      search_id: event.searchId,
      session_id: event.sessionId || null,
      stage: event.stage,
      status: event.status || null,
      platform: event.platform,
      app_version: event.appVersion || null,
      query_text: event.query || null,
      amazon_domain: event.amazonDomain || null,
      provider: event.provider || null,
      duration_ms: event.durationMs,
      provider_status_code: event.providerStatusCode,
      result_count_before_internal_filters: event.resultCountBeforeInternalFilters,
      result_count_after_internal_filters: event.resultCountAfterInternalFilters,
      final_status: event.finalStatus || null,
      error_type: event.errorType || null,
      error_message: event.errorMessage || null,
      reported_filter_type: event.reportedFilterType || null,
      retry_count: event.retryCount,
      backend_reachable: event.backendReachable,
      connectivity_ok: event.connectivityOk,
      cached_or_fallback_used: event.cachedOrFallbackUsed,
      metadata: event.metadata,
    })

    if (eventError) {
      throw eventError
    }

    return true
  } catch (error) {
    logStorageWarning('Search diagnostic write failed', error)
    return false
  }
}

function countBy(rows, field) {
  const counts = {}

  for (const row of rows) {
    const key = row[field] || 'unknown'
    counts[key] = (counts[key] || 0) + 1
  }

  return counts
}

function latestEventForSearch(events, searchId) {
  return events.find((event) => event.search_id === searchId) || null
}

export async function readSearchDiagnosticsDashboardData({ sinceDays = 14 } = {}) {
  if (!isSupabaseConfigured()) {
    return {
      available: false,
      reason: 'supabase_not_configured',
    }
  }

  const lookbackDays = Number.isFinite(Number(sinceDays)) ? Number(sinceDays) : 14
  const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()

  try {
    const [attemptsResult, eventsResult] = await Promise.all([
      readSupabaseRowsSince(
        SEARCH_ATTEMPTS_TABLE,
        'search_id, session_id, platform, query_text, amazon_domain, provider, status, final_status, error_type, error_message, reported_filter_type, retry_count, duration_ms, result_count_before_internal_filters, result_count_after_internal_filters, backend_reachable, connectivity_ok, cached_or_fallback_used, first_seen_at, last_event_at, created_at',
        sinceIso,
      ),
      readSupabaseRowsSince(
        SEARCH_EVENTS_TABLE,
        'search_id, stage, status, platform, query_text, amazon_domain, provider, duration_ms, provider_status_code, result_count_before_internal_filters, result_count_after_internal_filters, final_status, error_type, error_message, reported_filter_type, retry_count, backend_reachable, connectivity_ok, cached_or_fallback_used, created_at',
        sinceIso,
      ),
    ])

    const attempts = attemptsResult.rows
    const events = eventsResult.rows
    const failureStatuses = new Set([
      'empty',
      'empty_results',
      'frontend_error',
      'network_blocked_possible',
      'provider_error',
      'rainforest_error',
      'timeout',
      'unknown',
    ])
    const failedAttempts = attempts.filter((attempt) =>
      failureStatuses.has(attempt.final_status) ||
      failureStatuses.has(attempt.status) ||
      Boolean(attempt.error_type || attempt.error_message),
    )
    const backendReceivedIds = new Set(
      events
        .filter((event) => event.stage === 'backend_received')
        .map((event) => event.search_id),
    )
    const latestEvents = [...events].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    return {
      available: true,
      summary: {
        attempts: attempts.length,
        failures: failedAttempts.length,
        rainforestTimeouts: events.filter((event) => event.stage === 'rainforest_timeout').length,
        rainforestErrors: events.filter((event) => event.stage === 'rainforest_error').length,
        emptyResults: events.filter((event) => event.stage === 'empty_results').length,
        neverReachedBackend: attempts.filter((attempt) => !backendReceivedIds.has(attempt.search_id)).length,
        backendReachableFailures: failedAttempts.filter((attempt) => attempt.backend_reachable === true).length,
      },
      byFilterType: countBy(failedAttempts, 'reported_filter_type'),
      byPlatform: countBy(failedAttempts, 'platform'),
      byMarketplace: countBy(failedAttempts, 'amazon_domain'),
      recentFailures: failedAttempts
        .sort((a, b) => new Date(b.last_event_at || b.created_at) - new Date(a.last_event_at || a.created_at))
        .slice(0, 50)
        .map((attempt) => {
          const latest = latestEventForSearch(latestEvents, attempt.search_id)
          return {
            searchId: attempt.search_id,
            time: attempt.last_event_at || attempt.created_at,
            query: attempt.query_text || '',
            status: attempt.final_status || attempt.status || latest?.status || '',
            stage: latest?.stage || '',
            platform: attempt.platform || '',
            amazonDomain: attempt.amazon_domain || '',
            provider: attempt.provider || '',
            reportedFilterType: attempt.reported_filter_type || '',
            backendReachable: attempt.backend_reachable,
            connectivityOk: attempt.connectivity_ok,
            durationMs: attempt.duration_ms,
            error: attempt.error_message || latest?.error_message || '',
          }
        }),
      recentEvents: latestEvents.slice(0, 100).map((event) => ({
        searchId: event.search_id,
        time: event.created_at,
        stage: event.stage,
        status: event.status || '',
        query: event.query_text || '',
        platform: event.platform || '',
        amazonDomain: event.amazon_domain || '',
        provider: event.provider || '',
        durationMs: event.duration_ms,
        beforeFilters: event.result_count_before_internal_filters,
        afterFilters: event.result_count_after_internal_filters,
        error: event.error_message || '',
      })),
      dataQuality: {
        truncated: attemptsResult.truncated || eventsResult.truncated,
      },
    }
  } catch (error) {
    logStorageWarning('Search diagnostics dashboard read failed', error)

    return {
      available: false,
      reason: 'read_failed',
    }
  }
}
