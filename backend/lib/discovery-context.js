import { truncateText } from './text-sanitizers.js'
import { readCachedSearchSnapshot } from './search-pipeline.js'
import { getEnv } from './search-data.js'
import { runWithTimeout } from './operation-timeout.js'
import {
  CACHE_SCOPE_DISCOVERY,
  CACHE_SCOPE_DISCOVERY_SESSION,
  CACHE_SCOPE_RAINFOREST,
} from './server-helpers.js'

const DEFAULT_SESSION_READY_TIMEOUT_MS = 2_500
const SESSION_READY_POLL_INTERVAL_MS = 100

function getSessionReadyTimeoutMs() {
  const configured = Number(getEnv('DISCOVERY_SESSION_READY_TIMEOUT_MS'))

  if (!Number.isFinite(configured)) {
    return DEFAULT_SESSION_READY_TIMEOUT_MS
  }

  return Math.min(5_000, Math.max(250, Math.round(configured)))
}

function isRecentlyIssuedToken(token, now = Date.now()) {
  const timestampPart = String(token).split('.', 1)[0]
  const issuedAt = Number.parseInt(timestampPart, 36)

  return Number.isFinite(issuedAt) && issuedAt > 0 && now - issuedAt >= 0 && now - issuedAt <= 10_000
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readSessionEntryWithReadinessWait({
  normalizedQuery,
  sessionScope,
  token,
}) {
  const timeoutMs = isRecentlyIssuedToken(token) ? getSessionReadyTimeoutMs() : 0
  const deadline = Date.now() + timeoutMs

  do {
    const remainingMs = Math.max(deadline - Date.now(), 0)
    const readOperation = () => readCachedSearchSnapshot({
      productQuery: normalizedQuery,
      details: '',
      scope: sessionScope,
    })
    let snapshot

    if (timeoutMs > 0) {
      try {
        snapshot = await runWithTimeout(readOperation, {
          label: 'Pending discovery session read',
          timeoutMs: Math.max(50, remainingMs),
        })
      } catch {
        return null
      }
    } else {
      snapshot = await readOperation()
    }

    const sessionEntry = snapshot?.cachedEntry
    if (sessionEntry && truncateText(sessionEntry.discoveryToken, 300) === token) {
      return sessionEntry
    }

    if (Date.now() >= deadline) {
      return null
    }

    await wait(Math.min(SESSION_READY_POLL_INTERVAL_MS, deadline - Date.now()))
  } while (Date.now() <= deadline)

  return null
}

export function getDiscoverySessionScope(discoveryToken = '') {
  const truncatedToken = truncateText(discoveryToken, 300)
  return truncatedToken ? `${CACHE_SCOPE_DISCOVERY_SESSION}:${truncatedToken}` : CACHE_SCOPE_DISCOVERY_SESSION
}

export async function resolveDiscoveryContext(
  normalizedQuery,
  discoveryToken,
  scopes = [CACHE_SCOPE_DISCOVERY, CACHE_SCOPE_RAINFOREST],
) {
  const truncatedToken = truncateText(discoveryToken, 300)

  if (!truncatedToken) {
    return {
      error: 'Your search session expired. Start a new search.',
      isValid: false,
      statusCode: 409,
    }
  }

  const sessionScope = getDiscoverySessionScope(truncatedToken)
  const sessionEntry = await readSessionEntryWithReadinessWait({
    normalizedQuery,
    sessionScope,
    token: truncatedToken,
  })

  if (sessionEntry) {
    return {
      cachedEntry: sessionEntry,
      discoveryScope: sessionScope,
      isValid: true,
    }
  }

  // New tokens are written only to their token-scoped session key. Once their
  // readiness window closes, avoid additional shared-cache reads that cannot
  // legitimately match and would extend an immediate-finalize delay.
  if (isRecentlyIssuedToken(truncatedToken)) {
    return {
      error: 'Your search session expired. Start a new search.',
      isValid: false,
      statusCode: 409,
    }
  }

  for (const scope of scopes) {
    const { cachedEntry } = await readCachedSearchSnapshot({
      productQuery: normalizedQuery,
      details: '',
      scope,
    })

    if (!cachedEntry) {
      continue
    }

    if (truncateText(cachedEntry.discoveryToken, 300) !== truncatedToken) {
      continue
    }

    return {
      cachedEntry,
      discoveryScope: scope,
      isValid: true,
    }
  }

  return {
    error: 'Your search session expired. Start a new search.',
    isValid: false,
    statusCode: 409,
  }
}
