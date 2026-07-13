import {
  assessDeepDiveEligibility,
  miniEnrichSelectedCandidates,
} from '../ai-selector.js'
import { resolveCorsOrigin, sendJson } from '../http.js'
import { emitEnrichmentReady, enrichmentBus } from '../enrichment-bus.js'
import {
  resolveDiscoveryContext,
} from './discovery-handler.js'
import {
  writeSearchSnapshot,
} from '../search-pipeline.js'
import { validateSearchInput } from '../search-data.js'
import {
  CACHE_SCOPE_DISCOVERY,
  CACHE_SCOPE_RAINFOREST,
  getAmazonMarketplaceScope,
  getRequestedAmazonDomain,
  logSearchFlowEvent,
} from '../server-helpers.js'

const ENRICHMENT_STREAM_TIMEOUT_MS = 30000

export function mergeProductDetailsIntoCandidatePool(candidatePool, productDetailsById) {
  if (!productDetailsById?.size) {
    return candidatePool
  }

  return {
    ...candidatePool,
    candidates: candidatePool.candidates.map((candidate) => {
      const productDetails = productDetailsById.get(String(candidate.id))

      if (!productDetails) {
        return candidate
      }

      return {
        ...candidate,
        feature_bullets: productDetails.feature_bullets,
        productDescription: productDetails.productDescription,
        isPrime: Boolean(candidate.isPrime || productDetails.isPrime),
        delivery: productDetails.delivery || candidate.delivery || '',
      }
    }),
  }
}

function mergeCandidateFactsIntoEnrichmentEntries(entries, candidatePool) {
  if (!Array.isArray(entries) || !Array.isArray(candidatePool?.candidates)) {
    return entries
  }

  const candidateById = new Map(
    candidatePool.candidates.map((candidate) => [String(candidate.id), candidate]),
  )

  return entries.map((entry) => {
    const candidateId = String(entry?.candidate_id || entry?.candidateId || '')
    const candidate = candidateById.get(candidateId)

    if (!candidate) {
      return entry
    }

    const isPrime = Boolean(entry?.isPrime || candidate.isPrime)
    const delivery = candidate.delivery || entry?.delivery || ''

    return {
      ...entry,
      ...(isPrime ? { isPrime: true } : {}),
      ...(delivery ? { delivery } : {}),
    }
  })
}

// Runs mini enrichment after Haiku has locked the shortlist, stores result in the token-scoped session snapshot.
export async function runMiniEnrichmentAsync({
  lockedIds,
  candidatePool,
  apiKey,
  model,
  normalizedQuery,
  discoveryToken,
  discoveryScope = CACHE_SCOPE_DISCOVERY,
  rankingPreference,
}) {
  const miniResult = await miniEnrichSelectedCandidates({
    lockedIds,
    candidatePool,
    apiKey,
    model,
    rankingPreference,
  })

  const resolvedDiscoveryContext = await resolveDiscoveryContext(
    normalizedQuery,
    discoveryToken,
    [discoveryScope],
  )

  if (!resolvedDiscoveryContext.isValid) {
    return
  }

  const { cachedEntry } = resolvedDiscoveryContext

  const updatedSelection = {
    ...(cachedEntry.selection && typeof cachedEntry.selection === 'object' ? cachedEntry.selection : {}),
    enrichment: {
      entries: mergeCandidateFactsIntoEnrichmentEntries(miniResult.enriched, candidatePool),
      model: miniResult.model,
      generatedAt: new Date().toISOString(),
      preservedOrder: miniResult.preservedOrder,
      rankingPreference,
    },
  }

  await writeSearchSnapshot({
    productQuery: normalizedQuery,
    details: '',
    candidatePool: cachedEntry.candidatePool,
    discoveryToken: discoveryToken || cachedEntry.discoveryToken || '',
    results: Array.isArray(cachedEntry.results) ? cachedEntry.results : [],
    selection: updatedSelection,
    source: 'enrichment_update',
    scope: discoveryScope,
  })

  emitEnrichmentReady(
    discoveryToken || cachedEntry.discoveryToken || '',
    updatedSelection.enrichment.entries,
    miniResult.model,
  )

  logSearchFlowEvent('mini_enrichment_stored', {
    query: normalizedQuery,
    entryCount: updatedSelection.enrichment.entries.length,
    preservedOrder: miniResult.preservedOrder,
    model: miniResult.model,
  })

  return miniResult
}

export async function runDeepDiveEligibilityAsync({
  lockedIds,
  candidatePool,
  normalizedQuery,
  discoveryToken,
  discoveryScope = CACHE_SCOPE_DISCOVERY,
}) {
  const resolvedBeforeAi = await resolveDiscoveryContext(
    normalizedQuery,
    discoveryToken,
    [discoveryScope],
  )

  if (!resolvedBeforeAi.isValid) {
    return
  }

  const eligibilityResult = await assessDeepDiveEligibility({
    lockedIds,
    candidatePool,
  })

  const resolvedAfterAi = await resolveDiscoveryContext(
    normalizedQuery,
    discoveryToken,
    [discoveryScope],
  )

  if (!resolvedAfterAi.isValid) {
    return
  }

  const { cachedEntry } = resolvedAfterAi
  const updatedSelection = {
    ...(cachedEntry.selection && typeof cachedEntry.selection === 'object' ? cachedEntry.selection : {}),
    deepDiveEligibility: {
      decisions: eligibilityResult.decisions,
      model: eligibilityResult.model,
      generatedAt: new Date().toISOString(),
    },
  }

  await writeSearchSnapshot({
    productQuery: normalizedQuery,
    details: '',
    candidatePool: cachedEntry.candidatePool,
    discoveryToken: discoveryToken || cachedEntry.discoveryToken || '',
    results: Array.isArray(cachedEntry.results) ? cachedEntry.results : [],
    selection: updatedSelection,
    source: 'deep_dive_eligibility_update',
    scope: discoveryScope,
  })

  emitEnrichmentReady(
    discoveryToken || cachedEntry.discoveryToken || '',
    updatedSelection.enrichment?.entries || [],
    updatedSelection.enrichment?.model || '',
    updatedSelection.deepDiveEligibility,
  )

  logSearchFlowEvent('deep_dive_eligibility_stored', {
    query: normalizedQuery,
    decisionCount: eligibilityResult.decisions.length,
    model: eligibilityResult.model,
  })

  return eligibilityResult
}

function mergeLateProductDetailsIntoEnrichmentEntries(entries, productDetailsById) {
  if (!Array.isArray(entries) || !productDetailsById?.size) {
    return {
      changed: false,
      entries,
    }
  }

  let changed = false
  const nextEntries = entries.map((entry) => {
    const candidateId = String(entry?.candidate_id || entry?.candidateId || '')
    const productDetails = productDetailsById.get(candidateId)

    if (!productDetails) {
      return entry
    }

    const nextFeatureBullets = Array.isArray(productDetails.feature_bullets)
      ? productDetails.feature_bullets
      : []
    const currentFeatureBullets = Array.isArray(entry?.feature_bullets)
      ? entry.feature_bullets
      : Array.isArray(entry?.featureBullets)
        ? entry.featureBullets
        : []

    const nextIsPrime = Boolean(entry?.isPrime || productDetails.isPrime)
    const nextDelivery = productDetails.delivery || entry?.delivery || ''

    if (
      JSON.stringify(currentFeatureBullets) === JSON.stringify(nextFeatureBullets) &&
      Boolean(entry?.isPrime) === nextIsPrime &&
      (entry?.delivery || '') === nextDelivery
    ) {
      return entry
    }

    changed = true

    return {
      ...entry,
      feature_bullets: nextFeatureBullets,
      ...(nextIsPrime ? { isPrime: true } : {}),
      ...(nextDelivery ? { delivery: nextDelivery } : {}),
    }
  })

  return {
    changed,
    entries: nextEntries,
  }
}

export async function applyLateProductDetailsToEnrichment({
  normalizedQuery,
  discoveryToken,
  discoveryScope = CACHE_SCOPE_DISCOVERY,
  productDetailsById,
  maxAttempts = 8,
  retryDelayMs = 250,
}) {
  if (!productDetailsById?.size) {
    return false
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const resolvedDiscoveryContext = await resolveDiscoveryContext(
      normalizedQuery,
      discoveryToken,
      [discoveryScope],
    )

    if (!resolvedDiscoveryContext.isValid) {
      return false
    }

    const { cachedEntry } = resolvedDiscoveryContext
    const enrichment = cachedEntry?.selection?.enrichment

    if (Array.isArray(enrichment?.entries) && enrichment.entries.length > 0) {
      const mergedEnrichment = mergeLateProductDetailsIntoEnrichmentEntries(
        enrichment.entries,
        productDetailsById,
      )

      if (!mergedEnrichment.changed) {
        return false
      }

      const updatedSelection = {
        ...(cachedEntry.selection && typeof cachedEntry.selection === 'object' ? cachedEntry.selection : {}),
        enrichment: {
          ...enrichment,
          entries: mergedEnrichment.entries,
          generatedAt: new Date().toISOString(),
        },
      }

      await writeSearchSnapshot({
        productQuery: normalizedQuery,
        details: '',
        candidatePool: cachedEntry.candidatePool,
        discoveryToken: discoveryToken || cachedEntry.discoveryToken || '',
        results: Array.isArray(cachedEntry.results) ? cachedEntry.results : [],
        selection: updatedSelection,
        source: 'enrichment_update',
        scope: discoveryScope,
      })

      emitEnrichmentReady(
        discoveryToken || cachedEntry.discoveryToken || '',
        mergedEnrichment.entries,
        enrichment.model || '',
      )

      logSearchFlowEvent('mini_enrichment_detail_retry_hydrated', {
        query: normalizedQuery,
        entryCount: mergedEnrichment.entries.length,
      })

      return true
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }

  return false
}

export async function handleEnrichmentPoll(request, response) {
  const requestUrl = new URL(request.url, 'http://localhost')
  const token = requestUrl.searchParams.get('token') || ''
  const query = requestUrl.searchParams.get('query') || ''
  const amazonDomain = getRequestedAmazonDomain(requestUrl.searchParams.get('amazonDomain') || '')

  if (!token || !query) {
    sendJson(response, 400, { error: 'token and query are required.' })
    return
  }

  const { isValid, normalizedQuery } = validateSearchInput(query, '')

  if (!isValid) {
    sendJson(response, 400, { error: 'Invalid query.' })
    return
  }

  const enrichmentScopes = amazonDomain
    ? [getAmazonMarketplaceScope(CACHE_SCOPE_RAINFOREST, amazonDomain)]
    : [CACHE_SCOPE_DISCOVERY, CACHE_SCOPE_RAINFOREST]
  const resolvedDiscoveryContext = await resolveDiscoveryContext(normalizedQuery, token, enrichmentScopes)

  if (!resolvedDiscoveryContext.isValid) {
    sendJson(response, resolvedDiscoveryContext.statusCode, { error: resolvedDiscoveryContext.error })
    return
  }

  const { cachedEntry } = resolvedDiscoveryContext

  const enrichment = cachedEntry?.selection?.enrichment
  const deepDiveEligibility = cachedEntry?.selection?.deepDiveEligibility || null

  if (!enrichment?.entries?.length) {
    sendJson(response, 200, { ready: false })
    return
  }

  sendJson(response, 200, {
    ready: true,
    deepDiveEligibility,
    entries: enrichment.entries,
    model: enrichment.model || '',
  })
}

export async function handleEnrichmentStream(request, response) {
  const requestUrl = new URL(request.url, 'http://localhost')
  const token = requestUrl.searchParams.get('token') || ''
  const query = requestUrl.searchParams.get('query') || ''
  const amazonDomain = getRequestedAmazonDomain(requestUrl.searchParams.get('amazonDomain') || '')

  if (!token || !query) {
    sendJson(response, 400, { error: 'token and query are required.' })
    return
  }

  const { isValid, normalizedQuery } = validateSearchInput(query, '')

  if (!isValid) {
    sendJson(response, 400, { error: 'Invalid query.' })
    return
  }

  const enrichmentScopes = amazonDomain
    ? [getAmazonMarketplaceScope(CACHE_SCOPE_RAINFOREST, amazonDomain)]
    : [CACHE_SCOPE_DISCOVERY, CACHE_SCOPE_RAINFOREST]
  const resolvedDiscoveryContext = await resolveDiscoveryContext(normalizedQuery, token, enrichmentScopes)

  if (!resolvedDiscoveryContext.isValid) {
    sendJson(response, resolvedDiscoveryContext.statusCode, { error: resolvedDiscoveryContext.error })
    return
  }

  const { cachedEntry } = resolvedDiscoveryContext
  const enrichment = cachedEntry?.selection?.enrichment
  const deepDiveEligibility = cachedEntry?.selection?.deepDiveEligibility || null

  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': resolveCorsOrigin(request.headers?.origin),
    Vary: 'Origin',
  })
  response.flushHeaders()

  if (enrichment?.entries?.length) {
    response.write(`data: ${JSON.stringify({
      ready: true,
      deepDiveEligibility,
      entries: enrichment.entries,
      model: enrichment.model || '',
    })}\n\n`)
    response.end()
    return
  }

  const eventName = `enrichment:${token}`
  let completed = false

  function cleanup() {
    enrichmentBus.off(eventName, handleReady)
    clearTimeout(timeoutId)
  }

  function finish(payload) {
    if (completed) {
      return
    }

    completed = true
    cleanup()
    response.write(`data: ${JSON.stringify(payload)}\n\n`)
    response.end()
  }

  function handleReady(payload) {
    finish({
      ready: true,
      entries: payload?.entries,
      deepDiveEligibility: payload?.deepDiveEligibility || null,
      model: payload?.model,
    })
  }

  const timeoutId = setTimeout(() => {
    finish({ ready: false })
  }, ENRICHMENT_STREAM_TIMEOUT_MS)

  enrichmentBus.on(eventName, handleReady)

  request.on('close', () => {
    if (completed) {
      return
    }

    completed = true
    cleanup()
  })
}
