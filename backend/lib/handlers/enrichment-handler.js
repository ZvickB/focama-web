import {
  miniEnrichSelectedCandidates,
} from '../ai-selector.js'
import { resolveCorsOrigin, sendJson } from '../http.js'
import { emitEnrichmentReady, emitPriceComparisonReady, enrichmentBus } from '../enrichment-bus.js'
import {
  resolveDiscoveryContext,
} from './discovery-handler.js'
import {
  writeSearchSnapshot,
} from '../search-pipeline.js'
import { getEnv, validateSearchInput } from '../search-data.js'
import { runSerperPriceIntelligence } from '../price-comparison/serper-price-intelligence.js'
import {
  CACHE_SCOPE_DISCOVERY,
  CACHE_SCOPE_RAINFOREST,
  getAmazonMarketplaceScope,
  getRequestedAmazonDomain,
  logSearchFlowEvent,
} from '../server-helpers.js'
import { normalizeProductIdentity } from '../product-identity.js'

const ENRICHMENT_STREAM_TIMEOUT_MS = 30000
const PRICE_COMPARISON_STREAM_TIMEOUT_MS = 10000

function isEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim())
}

function isSerperPriceStreamEnabled() {
  return isEnabled(getEnv('SERPER_PRICE_INTEL_ENABLED')) && Boolean(getEnv('SERPER_API_KEY'))
}

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
        providerIdentity: productDetails.providerIdentity || candidate.providerIdentity || null,
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

function sameSelectedCandidateSet(currentIds, expectedIds) {
  const current = Array.isArray(currentIds) ? currentIds.map(String).filter(Boolean).sort() : []
  const expected = Array.isArray(expectedIds) ? expectedIds.map(String).filter(Boolean).sort() : []
  return current.length === expected.length && current.every((id, index) => id === expected[index])
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
  priceComparisonPrefetches = [],
  priceComparisonApiKey = null,
}) {
  const miniResult = await miniEnrichSelectedCandidates({
    lockedIds,
    candidatePool,
    apiKey,
    model,
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

  const enrichmentEntries = mergeCandidateFactsIntoEnrichmentEntries(miniResult.enriched, candidatePool)
  const updatedSelection = {
    ...(cachedEntry.selection && typeof cachedEntry.selection === 'object' ? cachedEntry.selection : {}),
    enrichment: {
      entries: enrichmentEntries,
      model: miniResult.model,
      generatedAt: new Date().toISOString(),
      preservedOrder: miniResult.preservedOrder,
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

  if (Array.isArray(priceComparisonPrefetches) && priceComparisonPrefetches.length > 0) {
    const expectedLockedIds = Array.isArray(lockedIds) ? lockedIds.map(String).filter(Boolean) : []
    const priceComparison = await runSerperPriceIntelligence({
      prefetches: priceComparisonPrefetches,
      enrichmentEntries,
      anthropicApiKey: priceComparisonApiKey,
    })

    if (priceComparison.completed) {
      const latestDiscoveryContext = await resolveDiscoveryContext(
        normalizedQuery,
        discoveryToken,
        [discoveryScope],
      )

      if (latestDiscoveryContext.isValid) {
        const latestEntry = latestDiscoveryContext.cachedEntry
        if (!sameSelectedCandidateSet(latestEntry?.selection?.selectedCandidateIds, expectedLockedIds)) {
          logSearchFlowEvent('price_comparison_stale_selection_skipped', {
            query: normalizedQuery,
            expectedCount: expectedLockedIds.length,
            currentCount: Array.isArray(latestEntry?.selection?.selectedCandidateIds)
              ? latestEntry.selection.selectedCandidateIds.length
              : 0,
          })
          return miniResult
        }

        await writeSearchSnapshot({
          productQuery: normalizedQuery,
          details: '',
          candidatePool: latestEntry.candidatePool,
          discoveryToken: discoveryToken || latestEntry.discoveryToken || '',
          results: Array.isArray(latestEntry.results) ? latestEntry.results : [],
          selection: {
            ...(latestEntry.selection && typeof latestEntry.selection === 'object' ? latestEntry.selection : {}),
            priceComparison: {
              results: priceComparison.results,
              model: priceComparison.model,
              generatedAt: new Date().toISOString(),
              usage: priceComparison.usage,
            },
          },
          source: 'price_comparison_update',
          scope: discoveryScope,
        })

        emitPriceComparisonReady(
          discoveryToken || latestEntry.discoveryToken || '',
          priceComparison.results,
        )
      }
    }
  }

  return miniResult
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
    const normalizedIdentity = productDetails.providerIdentity
      ? normalizeProductIdentity({
          sourceTitle: entry?.source_title || entry?.sourceTitle,
          providerIdentity: productDetails.providerIdentity,
          aiNormalization: entry,
        })
      : null

    if (
      JSON.stringify(currentFeatureBullets) === JSON.stringify(nextFeatureBullets) &&
      Boolean(entry?.isPrime) === nextIsPrime &&
      (entry?.delivery || '') === nextDelivery &&
      (!normalizedIdentity || (
        normalizedIdentity.display_title === (entry?.display_title || '') &&
        JSON.stringify(normalizedIdentity.match_identifier) === JSON.stringify(entry?.match_identifier)
      ))
    ) {
      return entry
    }

    changed = true

    return {
      ...entry,
      feature_bullets: nextFeatureBullets,
      ...(nextIsPrime ? { isPrime: true } : {}),
      ...(nextDelivery ? { delivery: nextDelivery } : {}),
      ...(normalizedIdentity || {}),
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
  const priceComparison = cachedEntry?.selection?.priceComparison

  if (!enrichment?.entries?.length) {
    sendJson(response, 200, {
      ready: false,
      ...(Array.isArray(priceComparison?.results) ? { priceComparison: { results: priceComparison.results } } : {}),
    })
    return
  }

  sendJson(response, 200, {
    ready: true,
    entries: enrichment.entries,
    model: enrichment.model || '',
    ...(Array.isArray(priceComparison?.results) ? { priceComparison: { results: priceComparison.results } } : {}),
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
  const priceComparison = cachedEntry?.selection?.priceComparison
  const shouldWaitForPriceComparison = isSerperPriceStreamEnabled()

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
      type: 'enrichment',
      ready: true,
      entries: enrichment.entries,
      model: enrichment.model || '',
    })}\n\n`)

    if (!shouldWaitForPriceComparison) {
      response.end()
      return
    }

    if (Array.isArray(priceComparison?.results)) {
      response.write(`data: ${JSON.stringify({
        type: 'price_comparison',
        results: priceComparison.results,
      })}\n\n`)
      response.end()
      return
    }

    waitForPriceComparisonThenEnd({ request, response, token })
    return
  }

  if (shouldWaitForPriceComparison && Array.isArray(priceComparison?.results)) {
    response.write(`data: ${JSON.stringify({
      type: 'price_comparison',
      results: priceComparison.results,
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

  function finish(payload, { waitForPriceComparison = false } = {}) {
    if (completed) {
      return
    }

    completed = true
    cleanup()
    response.write(`data: ${JSON.stringify(payload)}\n\n`)

    if (waitForPriceComparison) {
      waitForPriceComparisonThenEnd({ request, response, token })
      return
    }

    response.end()
  }

  function handleReady(payload) {
    finish({
      type: 'enrichment',
      ready: true,
      entries: payload?.entries,
      model: payload?.model,
    }, {
      waitForPriceComparison: shouldWaitForPriceComparison,
    })
  }

  const timeoutId = setTimeout(() => {
    finish({ type: 'enrichment', ready: false })
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

function waitForPriceComparisonThenEnd({ request, response, token }) {
  const eventName = `price_comparison:${token}`
  let completed = false

  function cleanup() {
    enrichmentBus.off(eventName, handleReady)
    clearTimeout(timeoutId)
  }

  function end() {
    if (completed) {
      return
    }

    completed = true
    cleanup()
    response.end()
  }

  function handleReady(payload) {
    if (completed) {
      return
    }

    completed = true
    cleanup()
    response.write(`data: ${JSON.stringify({
      type: 'price_comparison',
      results: Array.isArray(payload?.results) ? payload.results : [],
    })}\n\n`)
    response.end()
  }

  const timeoutId = setTimeout(end, PRICE_COMPARISON_STREAM_TIMEOUT_MS)
  enrichmentBus.on(eventName, handleReady)

  request.on('close', () => {
    if (completed) {
      return
    }

    completed = true
    cleanup()
  })
}
