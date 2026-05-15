const MAX_DEBUG_EVENTS = 100
const DEBUG_EVENTS_GLOBAL = '__FOCAMAI_SEARCH_DEBUG_EVENTS__'

const searchDebugEvents = []

function exposeDebugEvents() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return
  }

  window[DEBUG_EVENTS_GLOBAL] = searchDebugEvents
}

function toCount(value) {
  return Number.isFinite(value) ? value : undefined
}

function toBoolean(value) {
  return typeof value === 'boolean' ? value : undefined
}

function getQueryLength(data = {}) {
  if (Number.isFinite(data.queryLength)) {
    return data.queryLength
  }

  if (typeof data.query === 'string') {
    return data.query.length
  }

  return undefined
}

function getErrorData(error) {
  if (!error) {
    return {}
  }

  return {
    errorName: error?.name || '',
    errorMessage: error instanceof Error ? error.message : String(error || ''),
  }
}

function createDebugEvent(phase, status, data = {}) {
  const hasDiscoveryToken =
    typeof data.hasDiscoveryToken === 'boolean'
      ? data.hasDiscoveryToken
      : Boolean(data.discoveryToken || data.token)
  const errorData = getErrorData(data.error)

  return Object.fromEntries(
    Object.entries({
      timestamp: new Date().toISOString(),
      phase,
      status,
      activeSearchId: data.activeSearchId ?? data.searchId,
      queryLength: getQueryLength(data),
      amazonDomain: data.amazonDomain,
      hasDiscoveryToken,
      candidateCount: toCount(data.candidateCount),
      previewCount: toCount(data.previewCount),
      resultCount: toCount(data.resultCount),
      constraintCategory: data.constraintCategory,
      matchedTerm: data.matchedTerm,
      errorName: data.errorName || errorData.errorName,
      errorMessage: data.errorMessage || errorData.errorMessage,
      stale: toBoolean(data.stale),
      aborted: toBoolean(data.aborted),
      sessionExpired: toBoolean(data.sessionExpired),
    }).filter(([, value]) => value !== undefined && value !== ''),
  )
}

export function recordSearchDebugEvent(phase, status, data = {}) {
  const event = createDebugEvent(phase, status, data)

  searchDebugEvents.push(event)

  if (searchDebugEvents.length > MAX_DEBUG_EVENTS) {
    searchDebugEvents.splice(0, searchDebugEvents.length - MAX_DEBUG_EVENTS)
  }

  exposeDebugEvents()

  return event
}

export function getSearchDebugEvents() {
  return [...searchDebugEvents]
}

export function clearSearchDebugEvents() {
  searchDebugEvents.length = 0
  exposeDebugEvents()
}

exposeDebugEvents()
