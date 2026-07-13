import {
  CACHE_SCOPE_DISCOVERY,
  CACHE_SCOPE_RAINFOREST,
  getAmazonMarketplaceScope,
} from '../server-helpers.js'

export async function resolveFinalizeRequestContext({
  body,
  resolveCandidatePool,
  resolveDiscoveryContext,
  sanitizeDiscoveryContext,
}) {
  const discoveryContext = sanitizeDiscoveryContext(body)

  if (!discoveryContext.isValid) {
    return {
      discoveryContext,
      isValid: false,
      reason: 'invalid_request',
    }
  }

  const scopes = discoveryContext.amazonDomain
    ? [getAmazonMarketplaceScope(CACHE_SCOPE_RAINFOREST, discoveryContext.amazonDomain)]
    : [CACHE_SCOPE_DISCOVERY, CACHE_SCOPE_RAINFOREST]
  const resolvedDiscoveryContext = await resolveDiscoveryContext(
    discoveryContext.normalizedQuery,
    discoveryContext.discoveryToken,
    scopes,
  )

  if (!resolvedDiscoveryContext.isValid) {
    return {
      discoveryContext,
      isValid: false,
      reason: 'missing_discovery_context',
      resolvedDiscoveryContext,
    }
  }

  const resolvedCandidatePool = resolveCandidatePool(resolvedDiscoveryContext.cachedEntry)

  if (!resolvedCandidatePool.isValid) {
    return {
      discoveryContext,
      isValid: false,
      reason: 'invalid_candidate_pool',
      resolvedCandidatePool,
    }
  }

  return {
    candidatePool: resolvedCandidatePool.candidatePool,
    discoveryContext,
    isValid: true,
    resolvedDiscoveryContext,
  }
}
