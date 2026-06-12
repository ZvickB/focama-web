import { readJsonBody, sendJson } from '../http.js'
import { recordSearchDiagnosticEvent } from '../search-storage.js'
import { FINALIZE_BODY_LIMIT_BYTES } from '../server-helpers.js'
import { sanitizeAnalyticsEventData, truncateText } from '../text-sanitizers.js'

export async function handleSearchDiagnosticEvent(request, response) {
  let body

  try {
    body = await readJsonBody(request, { maxBytes: FINALIZE_BODY_LIMIT_BYTES })
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request body.' })
    return
  }

  const searchId = truncateText(body?.searchId, 120)
  const stage = truncateText(body?.stage, 80)

  if (!searchId || !stage) {
    sendJson(response, 400, { error: 'searchId and stage are required.' })
    return
  }

  await recordSearchDiagnosticEvent({
    searchId,
    sessionId: truncateText(body?.sessionId, 120),
    stage,
    status: truncateText(body?.status, 80),
    platform: truncateText(body?.platform, 40) || 'web',
    appVersion: truncateText(body?.appVersion, 80),
    query: truncateText(body?.query, 240),
    amazonDomain: truncateText(body?.amazonDomain || body?.region, 80),
    provider: truncateText(body?.provider, 80),
    finalStatus: truncateText(body?.finalStatus, 80),
    errorType: truncateText(body?.errorType || body?.errorName, 120),
    errorMessage: truncateText(body?.errorMessage, 500),
    reportedFilterType: truncateText(body?.reportedFilterType, 80),
    retryCount: Number.isFinite(Number(body?.retryCount)) ? Number(body.retryCount) : null,
    durationMs: Number.isFinite(Number(body?.durationMs)) ? Number(body.durationMs) : null,
    providerStatusCode: Number.isFinite(Number(body?.providerStatusCode)) ? Number(body.providerStatusCode) : null,
    resultCountBeforeInternalFilters: Number.isFinite(Number(body?.resultCountBeforeInternalFilters))
      ? Number(body.resultCountBeforeInternalFilters)
      : null,
    resultCountAfterInternalFilters: Number.isFinite(Number(body?.resultCountAfterInternalFilters))
      ? Number(body.resultCountAfterInternalFilters)
      : null,
    backendReachable: typeof body?.backendReachable === 'boolean' ? body.backendReachable : null,
    connectivityOk: typeof body?.connectivityOk === 'boolean' ? body.connectivityOk : null,
    cachedOrFallbackUsed: typeof body?.cachedOrFallbackUsed === 'boolean' ? body.cachedOrFallbackUsed : null,
    metadata: sanitizeAnalyticsEventData(body?.metadata),
  })

  sendJson(response, 202, { ok: true })
}

export function handleHealth(response) {
  sendJson(response, 200, {
    ok: true,
    service: 'focamai-api',
    timestamp: new Date().toISOString(),
  })
}

export function handleConnectivityDiagnostic(response) {
  sendJson(response, 200, {
    ok: true,
    checks: {
      backendReachable: true,
      jsonResponse: true,
    },
    timestamp: new Date().toISOString(),
  })
}
