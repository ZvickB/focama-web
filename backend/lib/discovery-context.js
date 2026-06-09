import { truncateText } from './text-sanitizers.js'
import { readCachedSearchSnapshot } from './search-pipeline.js'
import {
  CACHE_SCOPE_DISCOVERY,
  CACHE_SCOPE_DISCOVERY_SESSION,
  CACHE_SCOPE_RAINFOREST,
} from './server-helpers.js'

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
  const { cachedEntry: sessionEntry } = await readCachedSearchSnapshot({
    productQuery: normalizedQuery,
    details: '',
    scope: sessionScope,
  })

  if (sessionEntry && truncateText(sessionEntry.discoveryToken, 300) === truncatedToken) {
    return {
      cachedEntry: sessionEntry,
      discoveryScope: sessionScope,
      isValid: true,
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
