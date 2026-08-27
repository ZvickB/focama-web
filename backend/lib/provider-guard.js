import { getEnv } from './search-data.js'

const RAINFOREST_CLIENT_WINDOWS = new Map()
let activeRainforestSearches = 0

const DEFAULT_CLIENT_LIMIT = 4
const DEFAULT_WINDOW_MS = 10_000
const DEFAULT_MAX_CONCURRENCY = 4

function readBoundedInteger(name, defaultValue, { min, max }) {
  const configured = Number(getEnv(name))

  if (!Number.isFinite(configured)) {
    return defaultValue
  }

  return Math.min(max, Math.max(min, Math.round(configured)))
}

function getConfig() {
  const testMode = process.env.NODE_ENV === 'test'

  return {
    clientLimit: readBoundedInteger(
      'RAINFOREST_SEARCH_RATE_LIMIT',
      testMode ? 10_000 : DEFAULT_CLIENT_LIMIT,
      { min: 1, max: 100 },
    ),
    maxConcurrency: readBoundedInteger(
      'RAINFOREST_SEARCH_MAX_CONCURRENCY',
      testMode ? 100 : DEFAULT_MAX_CONCURRENCY,
      { min: 1, max: 50 },
    ),
    windowMs: readBoundedInteger(
      'RAINFOREST_SEARCH_RATE_WINDOW_MS',
      DEFAULT_WINDOW_MS,
      { min: 1_000, max: 60_000 },
    ),
  }
}

function takeClientToken(clientKey, { clientLimit, windowMs }) {
  const now = Date.now()
  const normalizedKey = String(clientKey || 'anonymous').trim() || 'anonymous'
  const existing = RAINFOREST_CLIENT_WINDOWS.get(normalizedKey)

  if (!existing || existing.resetAt <= now) {
    RAINFOREST_CLIENT_WINDOWS.set(normalizedKey, {
      count: 1,
      resetAt: now + windowMs,
    })
    return { allowed: true, resetAt: now + windowMs }
  }

  if (existing.count >= clientLimit) {
    return { allowed: false, resetAt: existing.resetAt }
  }

  existing.count += 1
  return { allowed: true, resetAt: existing.resetAt }
}

export function acquireRainforestSearchSlot(clientKey) {
  const config = getConfig()
  const clientToken = takeClientToken(clientKey, config)

  if (!clientToken.allowed) {
    return {
      allowed: false,
      reason: 'client_rate_limit',
      resetAt: clientToken.resetAt,
    }
  }

  if (activeRainforestSearches >= config.maxConcurrency) {
    return {
      allowed: false,
      reason: 'concurrency_limit',
      resetAt: Date.now() + 1_000,
    }
  }

  activeRainforestSearches += 1
  let released = false

  return {
    allowed: true,
    release() {
      if (released) return
      released = true
      activeRainforestSearches = Math.max(0, activeRainforestSearches - 1)
    },
  }
}

export function resetProviderGuard() {
  RAINFOREST_CLIENT_WINDOWS.clear()
  activeRainforestSearches = 0
}
