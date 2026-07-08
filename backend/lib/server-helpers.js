import { reportBackendError } from './observability.js'
import {
  getActiveAmazonDomainFromCountryCode,
  normalizeActiveAmazonDomain,
} from '../../shared/amazon-marketplaces.js'
import { DEFAULT_FILTER_CONFIG } from './result-filter.js'

export const LIVE_RESULT_FILTER_CONFIG = {
  ...DEFAULT_FILTER_CONFIG,
  candidatePoolSize: 30,
  finalResultLimit: 6,
}
export const FINALIZE_BODY_LIMIT_BYTES = 32 * 1024
export const CACHE_SCOPE_DISCOVERY = 'guided_discovery'
export const CACHE_SCOPE_RAINFOREST = 'rainforest_discovery:v3'
export const CACHE_SCOPE_DISCOVERY_SESSION = 'guided_discovery_session'
export const CACHE_SCOPE_LIVE_SEARCH = 'live_search'
export const MIN_DISCOVERY_PROVIDER_RESULT_COUNT = LIVE_RESULT_FILTER_CONFIG.finalResultLimit
export const RATE_LIMIT_WAIT_MESSAGE = 'Please wait about 10 seconds and try again.'

export const FINALIZE_MAX_CANDIDATES = LIVE_RESULT_FILTER_CONFIG.candidatePoolSize
export const FINALIZE_MAX_NOTE_LENGTH = 500
export const FINALIZE_MAX_REJECTION_FEEDBACK_LENGTH = 300
export const FINALIZE_MAX_PRIORITIES = 8
export const FINALIZE_MAX_PRIORITY_LENGTH = 80
export const FINALIZE_MAX_RETRY_COUNT = 2

// In-memory ring buffer for recent finalizations (dev analytics only; resets on server restart).
export const RECENT_FINALIZATIONS_MAX = 25
export const recentFinalizations = []

export function getRequestedAmazonDomain(value = '') {
  return normalizeActiveAmazonDomain(value)
}

export function getAmazonMarketplaceScope(scope, amazonDomain = '') {
  const normalizedAmazonDomain = getRequestedAmazonDomain(amazonDomain)
  return normalizedAmazonDomain ? `${scope}:${normalizedAmazonDomain}` : scope
}

export function resolveAmazonDomain({ requestUrl = null, body = null, countryCode = 'US' } = {}) {
  const requestedAmazonDomain =
    getRequestedAmazonDomain(body?.amazonDomain) ||
    getRequestedAmazonDomain(requestUrl?.searchParams?.get('amazonDomain') || '')

  return requestedAmazonDomain || getActiveAmazonDomainFromCountryCode(countryCode)
}

export function roundTimingDuration(value) {
  return Math.round(value * 10) / 10
}

export function clampInteger(value, { defaultValue, min, max }) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return defaultValue
  }

  return Math.min(max, Math.max(min, Math.round(numericValue)))
}

export function readHeaderValue(headers, key) {
  const rawValue = headers?.[key]

  if (Array.isArray(rawValue)) {
    return rawValue[0] || ''
  }

  return typeof rawValue === 'string' ? rawValue : ''
}

export function isLocalhostHost(hostValue = '') {
  const normalizedHost = hostValue.trim().toLowerCase()

  return (
    normalizedHost.startsWith('localhost:') ||
    normalizedHost === 'localhost' ||
    normalizedHost.startsWith('127.0.0.1:') ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost.startsWith('[::1]:') ||
    normalizedHost === '::1'
  )
}

export function nowMs() {
  return performance.now()
}

export function runInBackground(task, context = {}) {
  Promise.resolve()
    .then(() => (typeof task === 'function' ? task() : task))
    .catch((error) => {
      reportBackendError(error, {
        ...context,
        source: context.source || 'background_task',
      })
    })
}

export function logSearchFlowEvent(eventName, details = {}) {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  const payload = Object.fromEntries(
    Object.entries({
      event: eventName,
      timestamp: new Date().toISOString(),
      ...details,
    }).filter(([, value]) => value !== undefined),
  )

  console.info('[search-flow]', JSON.stringify(payload))
}
