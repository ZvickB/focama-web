import { reportBackendError } from './observability.js'
import { getAmazonDomainFromCountryCode, normalizeAmazonDomain } from '../../shared/amazon-marketplaces.js'

export function getRequestedAmazonDomain(value = '') {
  return normalizeAmazonDomain(value)
}

export function getAmazonMarketplaceScope(scope, amazonDomain = '') {
  const normalizedAmazonDomain = getRequestedAmazonDomain(amazonDomain)
  return normalizedAmazonDomain ? `${scope}:${normalizedAmazonDomain}` : scope
}

export function resolveAmazonDomain({ requestUrl = null, body = null, countryCode = 'US' } = {}) {
  const requestedAmazonDomain =
    getRequestedAmazonDomain(body?.amazonDomain) ||
    getRequestedAmazonDomain(requestUrl?.searchParams?.get('amazonDomain') || '')

  return requestedAmazonDomain || getAmazonDomainFromCountryCode(countryCode)
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
