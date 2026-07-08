import { fetchBackend } from '@/lib/backendUrl.js'

const SESSION_STORAGE_KEY = 'focamai_analytics_session_id'
const ANALYTICS_FLUSH_DELAY_MS = 2000

let queuedEvents = []
let flushTimerId = null
let flushListenersBound = false
let analyticsPostChain = Promise.resolve()

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

function clearScheduledFlush() {
  if (flushTimerId !== null && typeof window !== 'undefined') {
    window.clearTimeout(flushTimerId)
  }

  flushTimerId = null
}

function postAnalyticsEvent(event) {
  analyticsPostChain = analyticsPostChain
    .then(() => fetchBackend('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
      keepalive: true,
    }))
    .catch(() => {})
}

function flushAnalyticsQueue() {
  if (!isAnalyticsEnabled() || queuedEvents.length === 0) {
    clearScheduledFlush()
    return
  }

  clearScheduledFlush()
  const eventsToFlush = queuedEvents
  queuedEvents = []
  eventsToFlush.forEach(postAnalyticsEvent)
}

function scheduleAnalyticsFlush() {
  if (typeof window === 'undefined') {
    flushAnalyticsQueue()
    return
  }

  if (flushTimerId !== null) {
    return
  }

  flushTimerId = window.setTimeout(() => {
    flushAnalyticsQueue()
  }, ANALYTICS_FLUSH_DELAY_MS)
}

function bindFlushListeners() {
  if (flushListenersBound || typeof window === 'undefined') {
    return
  }

  const flushSoon = () => {
    flushAnalyticsQueue()
  }

  window.addEventListener('pagehide', flushSoon)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushSoon()
    }
  })
  flushListenersBound = true
}

export function trackAnalytics(event) {
  if (!isAnalyticsEnabled()) {
    return
  }

  bindFlushListeners()
  queuedEvents.push(event)

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => {
      flushAnalyticsQueue()
    }, { timeout: ANALYTICS_FLUSH_DELAY_MS })
  }

  scheduleAnalyticsFlush()
}
