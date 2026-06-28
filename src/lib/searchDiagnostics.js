const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''
const APP_VERSION = import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || ''

function isDiagnosticsEnabled() {
  if (typeof window === 'undefined') {
    return false
  }

  if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') {
    return false
  }

  return window.__FOCAMAI_DISABLE_SEARCH_DIAGNOSTICS__ !== true
}

function getApiBaseHost() {
  try {
    const url = new URL(BACKEND_URL || window.location.origin)
    return url.host
  } catch {
    return ''
  }
}

function getSafeError(error) {
  if (!error) {
    return {
      errorType: '',
      errorMessage: '',
    }
  }

  return {
    errorType: error?.name || 'Error',
    errorMessage: error instanceof Error ? error.message : String(error || ''),
  }
}

function normalizeDiagnosticEvent(event = {}) {
  const safeError = getSafeError(event.error)

  return {
    platform: 'web',
    appVersion: APP_VERSION,
    ...event,
    error: undefined,
    errorType: event.errorType || safeError.errorType,
    errorMessage: event.errorMessage || safeError.errorMessage,
  }
}

export function reportSearchDiagnosticEvent(event = {}) {
  if (!isDiagnosticsEnabled() || !event.searchId || !event.stage) {
    return
  }

  const request = fetch(`${BACKEND_URL}/api/search/diagnostics/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(normalizeDiagnosticEvent(event)),
    keepalive: true,
  })

  if (request && typeof request.then === 'function') {
    request
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Diagnostic endpoint returned ${response.status}.`)
        }
      })
      .catch((error) => {
        if (import.meta.env?.DEV) {
          console.warn('[search-diagnostics] Event write failed.', {
            error: error instanceof Error ? error.message : String(error || 'Unknown error'),
            searchId: event.searchId,
            stage: event.stage,
          })
        }
      })
  }
}

async function pingJson(path) {
  const startedAt = performance.now()
  const response = await fetch(`${BACKEND_URL}${path}`, {
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({}))

  return {
    ok: response.ok && payload?.ok !== false,
    status: response.status,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
  }
}

export async function runSearchFailureDiagnostics({
  amazonDomain = '',
  error,
  query = '',
  retryCount = 0,
  searchId,
  sessionId,
} = {}) {
  const safeError = getSafeError(error)
  const base = {
    amazonDomain,
    query,
    retryCount,
    searchId,
    sessionId,
    ...safeError,
  }

  reportSearchDiagnosticEvent({
    ...base,
    stage: 'backend_health_check_started',
    status: 'started',
  })

  let backendHealth = {
    ok: false,
    status: 0,
    durationMs: null,
    errorMessage: '',
  }

  try {
    backendHealth = await pingJson('/api/health')
    reportSearchDiagnosticEvent({
      ...base,
      backendReachable: backendHealth.ok,
      durationMs: backendHealth.durationMs,
      providerStatusCode: backendHealth.status,
      stage: backendHealth.ok ? 'backend_health_check_success' : 'backend_health_check_failed',
      status: backendHealth.ok ? 'success' : 'failed',
      finalStatus: backendHealth.ok ? 'frontend_error' : 'network_blocked_possible',
    })
  } catch (healthError) {
    const healthSafeError = getSafeError(healthError)
    backendHealth = {
      ok: false,
      status: 0,
      durationMs: null,
      errorMessage: healthSafeError.errorMessage,
    }
    reportSearchDiagnosticEvent({
      ...base,
      ...healthSafeError,
      backendReachable: false,
      stage: 'backend_health_check_failed',
      status: 'failed',
      finalStatus: 'network_blocked_possible',
    })
  }

  reportSearchDiagnosticEvent({
    ...base,
    stage: 'connectivity_diagnostic_started',
    status: 'started',
  })

  let connectivity = {
    ok: false,
    status: 0,
    durationMs: null,
    errorMessage: '',
  }

  try {
    connectivity = await pingJson('/api/diagnostics/connectivity')
    reportSearchDiagnosticEvent({
      ...base,
      backendReachable: backendHealth.ok,
      connectivityOk: connectivity.ok,
      durationMs: connectivity.durationMs,
      providerStatusCode: connectivity.status,
      stage: connectivity.ok ? 'connectivity_diagnostic_success' : 'connectivity_diagnostic_failed',
      status: connectivity.ok ? 'success' : 'failed',
      finalStatus: connectivity.ok ? 'frontend_error' : 'network_blocked_possible',
    })
  } catch (connectivityError) {
    const connectivitySafeError = getSafeError(connectivityError)
    connectivity = {
      ok: false,
      status: 0,
      durationMs: null,
      errorMessage: connectivitySafeError.errorMessage,
    }
    reportSearchDiagnosticEvent({
      ...base,
      ...connectivitySafeError,
      backendReachable: backendHealth.ok,
      connectivityOk: false,
      stage: 'connectivity_diagnostic_failed',
      status: 'failed',
      finalStatus: 'network_blocked_possible',
    })
  }

  return {
    apiBaseHost: getApiBaseHost(),
    backendHealth,
    connectivity,
    errorType: safeError.errorType,
    errorMessage: safeError.errorMessage,
    time: new Date().toISOString(),
  }
}

export function buildSearchDebugInfoText({
  amazonDomain = '',
  apiBaseHost = getApiBaseHost(),
  backendHealth,
  connectivity,
  durationMs,
  errorMessage = '',
  errorType = '',
  fallbackUsed = false,
  query = '',
  reportedFilterType = '',
  retryCount = 0,
  searchId = '',
  searchStatus = '',
  time = new Date().toISOString(),
} = {}) {
  return [
    `supportCode: ${searchId || 'unknown'}`,
    `time: ${time}`,
    'platform: web',
    `appVersion: ${APP_VERSION || 'unknown'}`,
    `apiBaseHost: ${apiBaseHost || 'unknown'}`,
    `backendHealthPassed: ${backendHealth?.ok === true ? 'yes' : 'no'}`,
    `backendHealthStatus: ${backendHealth?.status || 'unknown'}`,
    `connectivityDiagnosticPassed: ${connectivity?.ok === true ? 'yes' : 'no'}`,
    `searchStatus: ${searchStatus || 'unknown'}`,
    `query: ${query || 'unknown'}`,
    `selectedMarketplace: ${amazonDomain || 'auto'}`,
    `durationMs: ${Number.isFinite(Number(durationMs)) ? Number(durationMs) : 'unknown'}`,
    `retryCount: ${Number.isFinite(Number(retryCount)) ? Number(retryCount) : 0}`,
    `errorType: ${errorType || 'unknown'}`,
    `errorMessage: ${errorMessage || 'unknown'}`,
    `networkOnline: ${typeof navigator !== 'undefined' ? navigator.onLine : 'unknown'}`,
    `fallbackOrCacheUsed: ${fallbackUsed ? 'yes' : 'no'}`,
    `reportedFilterOrVpn: ${reportedFilterType || 'not answered'}`,
  ].join('\n')
}
