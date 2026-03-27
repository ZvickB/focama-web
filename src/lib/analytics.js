const SESSION_STORAGE_KEY = 'focamai_analytics_session_id'

function isAnalyticsEnabled() {
  if (typeof window === 'undefined') {
    return false
  }

  if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') {
    return false
  }

  return window.__FOCAMAI_DISABLE_ANALYTICS__ !== true
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function getOrCreateAnalyticsSessionId() {
  if (!isAnalyticsEnabled()) {
    return 'analytics-disabled'
  }

  const storage = getStorage()

  if (!storage) {
    return crypto.randomUUID()
  }

  const existingSessionId = storage.getItem(SESSION_STORAGE_KEY)

  if (existingSessionId) {
    return existingSessionId
  }

  const nextSessionId = crypto.randomUUID()
  storage.setItem(SESSION_STORAGE_KEY, nextSessionId)
  return nextSessionId
}

export function createAnalyticsSearchId() {
  if (!isAnalyticsEnabled()) {
    return 'analytics-disabled'
  }

  return crypto.randomUUID()
}

export function trackAnalytics(event) {
  if (!isAnalyticsEnabled()) {
    return
  }

  const request = fetch('/api/analytics/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
    keepalive: true,
  })

  if (request && typeof request.catch === 'function') {
    request.catch(() => {})
  }
}
