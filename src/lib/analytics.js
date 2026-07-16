import { fetchBackend } from '@/lib/backendUrl.js'

const LEGACY_SESSION_STORAGE_KEY = 'focamai_analytics_session_id'
const DEVICE_STORAGE_KEY = 'focamai_analytics_device_id'
const SESSION_STORAGE_KEY = 'focamai_analytics_session_id:v2'
const ANALYTICS_FLUSH_DELAY_MS = 2000

let queuedEvents = []
let flushTimerId = null
let flushListenersBound = false
let analyticsPostChain = Promise.resolve()
let fallbackDeviceId = ''
let fallbackSessionId = ''

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

function getSessionStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function getOrCreateAnalyticsDeviceId() {
  if (!isAnalyticsEnabled()) {
    return 'analytics-disabled'
  }

  const storage = getStorage()

  if (!storage) {
    fallbackDeviceId = fallbackDeviceId || crypto.randomUUID()
    return fallbackDeviceId
  }

  const existingDeviceId = storage.getItem(DEVICE_STORAGE_KEY)

  if (existingDeviceId) {
    return existingDeviceId
  }

  // The previous "session" value persisted across browser restarts, so it is
  // safely reused as this device's stable identifier during the transition.
  const legacyDeviceId = storage.getItem(LEGACY_SESSION_STORAGE_KEY)
  const nextDeviceId = legacyDeviceId || crypto.randomUUID()
  storage.setItem(DEVICE_STORAGE_KEY, nextDeviceId)
  return nextDeviceId
}

export function getOrCreateAnalyticsSessionId() {
  if (!isAnalyticsEnabled()) {
    return 'analytics-disabled'
  }

  const storage = getSessionStorage()

  if (!storage) {
    fallbackSessionId = fallbackSessionId || crypto.randomUUID()
    return fallbackSessionId
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
  const { analyticsAccessToken, ...payload } = event

  analyticsPostChain = analyticsPostChain
    .then(() => fetchBackend('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(analyticsAccessToken ? { Authorization: `Bearer ${analyticsAccessToken}` } : {}),
      },
      body: JSON.stringify(payload),
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
