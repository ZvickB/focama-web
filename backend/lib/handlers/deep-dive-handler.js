import { createHash } from 'node:crypto'

import { verifySupabaseBearerToken } from '../auth.js'
import { readJsonBody, sendJson } from '../http.js'
import { reportBackendError } from '../observability.js'
import { getClientIpAddress, takeRateLimitToken } from '../rate-limit.js'
import { getEnv, validateSearchInput } from '../search-data.js'
import {
  CACHE_SCOPE_DISCOVERY,
  CACHE_SCOPE_RAINFOREST,
  getAmazonMarketplaceScope,
  getRequestedAmazonDomain,
  logSearchFlowEvent,
  nowMs,
  roundTimingDuration,
} from '../server-helpers.js'
import { resolveDiscoveryContext } from './discovery-handler.js'
import {
  buildDeepDiveProductPayload,
  fetchImmersiveProduct,
  fetchShoppingProductGroup,
  normalizeDeepDiveOffers,
  normalizeMarket,
  normalizeProductIdentity,
  PRICE_STALE_MS,
} from '../price-comparison/deep-dive-serpapi.js'
import { findSimilarShoppingAlternatives } from '../price-comparison/similar-alternatives.js'
import {
  incrementDeepDiveUsage,
  readDeepDiveCacheEntry,
  writeDeepDiveCacheEntry,
} from '../storage/deep-dive-storage.js'

const DEEP_DIVE_BODY_LIMIT_BYTES = 12 * 1024
const PRODUCT_GROUP_TTL_MS = 7 * 24 * 60 * 60 * 1000
const IMMERSIVE_TTL_MS = 24 * 60 * 60 * 1000
const RATE_LIMIT_CONFIG = { limit: 5, windowMs: 60_000 }
const IN_FLIGHT = new Set()

function clean(value) {
  return String(value || '').trim()
}

function isEnabled() {
  return String(getEnv('DEEP_DIVE_ENABLED') || '').trim().toLowerCase() === 'true'
}

function areSimilarOptionsEnabled() {
  return String(getEnv('SIMILAR_OPTIONS_ENABLED') || '').trim().toLowerCase() === 'true'
}

function buildHash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex')
}

function buildCacheKey(layer, parts = []) {
  return `deep_dive:v1:${layer}:${buildHash(parts.map(clean).join('|'))}`
}

function findCandidate(cachedEntry, candidateId) {
  const id = clean(candidateId)
  const candidates = Array.isArray(cachedEntry?.candidatePool?.candidates)
    ? cachedEntry.candidatePool.candidates
    : []
  const results = Array.isArray(cachedEntry?.results) ? cachedEntry.results : []
  const candidate = candidates.find((entry) => String(entry?.id) === id)
  const result = results.find((entry) => String(entry?.id) === id)

  if (!candidate && !result) return null
  return { ...(candidate || {}), ...(result || {}) }
}

function selectedIds(cachedEntry) {
  const ids = cachedEntry?.selection?.selectedCandidateIds
  return Array.isArray(ids) ? ids.map((id) => String(id)) : []
}

function limitedPayload({ candidateId, reason, message, cache = {} }) {
  return {
    status: 'limited',
    candidateId,
    generatedAt: new Date().toISOString(),
    cache: {
      productGroup: cache.productGroup || 'miss',
      immersive: cache.immersive || 'miss',
    },
    product: null,
    offers: [],
    checkedStoreCount: 0,
    limitedData: { reason, message },
  }
}

function readyPayload({ candidateId, product, offers, similarAlternatives = [], checkedStoreCount, cache, ambiguous }) {
  return {
    status: 'ready',
    candidateId,
    generatedAt: new Date().toISOString(),
    cache,
    product,
    offers,
    similarAlternatives,
    checkedStoreCount,
    ambiguous: ambiguous || false,
    limitedData: null,
  }
}

async function getCachedOrFetchProductGroup({ apiKey, cacheKey, candidate, market }) {
  const cached = await readDeepDiveCacheEntry(cacheKey)
  if (cached?.payload?.selectedOffer) {
    if (!Object.prototype.hasOwnProperty.call(cached.payload.selectedOffer, 'reviews')) {
      logSearchFlowEvent('deep_dive_product_group_cache_incomplete', {
        reason: 'missing_review_tiebreaker',
      })
    } else {
      return { cacheStatus: 'hit', value: cached.payload }
    }
  }

  logSearchFlowEvent('deep_dive_serpapi_shopping_started', { market })
  const value = await fetchShoppingProductGroup({ apiKey, candidate, market })
  logSearchFlowEvent('deep_dive_serpapi_shopping_succeeded', {
    market,
    selectedReason: value.selectedReason,
  })
  await writeDeepDiveCacheEntry({ cacheKey, layer: 'product_group', payload: value, ttlMs: PRODUCT_GROUP_TTL_MS })
  return { cacheStatus: 'miss', value }
}

function hasReviewSignals(productResults) {
  if (!productResults || typeof productResults !== 'object') return false
  return Boolean(
    productResults.rating ||
    productResults.reviews ||
    Array.isArray(productResults.user_reviews) && productResults.user_reviews.length > 0 ||
    Array.isArray(productResults.critic_ratings) && productResults.critic_ratings.length > 0 ||
    Array.isArray(productResults.ratings) && productResults.ratings.length > 0 ||
    Array.isArray(productResults.top_insights) && productResults.top_insights.length > 0,
  )
}

function hasStoreOffers(productResults) {
  return Array.isArray(productResults?.stores) && productResults.stores.length > 0
}

function hasUsefulImmersiveData(productResults) {
  return hasReviewSignals(productResults) || hasStoreOffers(productResults)
}

function isPriceStale(cachedAt) {
  const cachedAtMs = new Date(cachedAt || '').getTime()
  return Number.isFinite(cachedAtMs) && Date.now() - cachedAtMs > PRICE_STALE_MS
}

async function getCachedOrFetchImmersive({ apiKey, cacheKey, shoppingOffer }) {
  const cached = await readDeepDiveCacheEntry(cacheKey)
  if (cached?.payload?.productResults) {
    const cachedHasUsefulData = hasUsefulImmersiveData(cached.payload.productResults)
    const cachedIsStale = isPriceStale(cached.cachedAt)

    // Treat empty cached entries as incomplete; useful no-review store offers can still be reused while price-fresh.
    if (!cachedHasUsefulData) {
      logSearchFlowEvent('deep_dive_immersive_cache_incomplete', {
        reason: 'no_review_or_store_signals',
        keys: Object.keys(cached.payload.productResults).join(','),
      })
    } else {
      if (!cachedIsStale) {
        return { cacheStatus: 'hit', value: cached.payload }
      }

      try {
        logSearchFlowEvent('deep_dive_immersive_refresh_started', { reason: 'price_stale' })
        const refreshed = await fetchImmersiveProduct({ apiKey, shoppingOffer })
        logSearchFlowEvent('deep_dive_immersive_refresh_succeeded', {
          storeCount: Array.isArray(refreshed?.productResults?.stores) ? refreshed.productResults.stores.length : 0,
        })
        await writeDeepDiveCacheEntry({ cacheKey, layer: 'immersive', payload: refreshed, ttlMs: IMMERSIVE_TTL_MS })
        return { cacheStatus: 'stale_refresh', value: refreshed }
      } catch (error) {
        logSearchFlowEvent('deep_dive_immersive_refresh_failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        })
        return { cacheStatus: 'stale', value: cached.payload }
      }
    }

    try {
      logSearchFlowEvent('deep_dive_immersive_refresh_started', { reason: 'cache_incomplete' })
      const refreshed = await fetchImmersiveProduct({ apiKey, shoppingOffer })
      logSearchFlowEvent('deep_dive_immersive_refresh_succeeded', {
        storeCount: Array.isArray(refreshed?.productResults?.stores) ? refreshed.productResults.stores.length : 0,
      })
      if (hasUsefulImmersiveData(refreshed.productResults)) {
        await writeDeepDiveCacheEntry({ cacheKey, layer: 'immersive', payload: refreshed, ttlMs: IMMERSIVE_TTL_MS })
      }
      return { cacheStatus: 'miss', value: refreshed }
    } catch (error) {
      logSearchFlowEvent('deep_dive_immersive_refresh_failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
        reason: 'cache_incomplete',
      })
      return { cacheStatus: cachedIsStale ? 'stale' : 'incomplete_fallback', value: cached.payload }
    }
  }

  logSearchFlowEvent('deep_dive_immersive_started', {})
  const value = await fetchImmersiveProduct({ apiKey, shoppingOffer })
  logSearchFlowEvent('deep_dive_immersive_succeeded', {
    storeCount: Array.isArray(value?.productResults?.stores) ? value.productResults.stores.length : 0,
  })
  // Cache useful review data or fresh store offers; avoid caching truly empty provider responses.
  if (hasUsefulImmersiveData(value.productResults)) {
    await writeDeepDiveCacheEntry({ cacheKey, layer: 'immersive', payload: value, ttlMs: IMMERSIVE_TTL_MS })
  } else {
    logSearchFlowEvent('deep_dive_immersive_not_cached', {
      reason: 'no_review_or_store_signals',
      keys: Object.keys(value.productResults || {}).join(','),
    })
  }
  return { cacheStatus: 'miss', value }
}

export async function handleDeepDive(request, response) {
  const startedAt = nowMs()
  const candidateIdForLogs = ''

  if (!isEnabled()) {
    sendJson(response, 200, {
      status: 'unavailable',
      error: 'Price comparison is not enabled yet.',
    })
    return
  }

  const auth = await verifySupabaseBearerToken(request.headers || {})
  if (!auth.ok) {
    sendJson(response, 401, {
      status: 'gated',
      error: auth.reason === 'supabase_not_configured'
        ? 'Sign in is not configured for price comparison yet.'
        : 'Sign in to compare prices.',
    })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const [ipLimit, accountLimit] = await Promise.all([
    takeRateLimitToken(clientIpAddress, RATE_LIMIT_CONFIG),
    takeRateLimitToken(`deep-dive-account:${auth.user.id}`, RATE_LIMIT_CONFIG),
  ])

  if (!ipLimit.allowed || !accountLimit.allowed) {
    sendJson(response, 429, { status: 'unavailable', error: 'Too many price comparison requests. Please wait a moment and try again.' })
    return
  }

  // Usage gate disabled during testing — re-enable after testers confirm quality
  // const usage = await readDeepDiveUsage(auth.user.id)
  // const freeLimit = getFreeDeepDiveLimit()
  // const hasUnlimitedDeepDives = Boolean(auth.entitlements?.deepDiveUnlimited) || isFreeDeepDiveLimitDisabled() || freeLimit <= 0
  // if (!hasUnlimitedDeepDives && usage.count >= freeLimit) {
  //   logSearchFlowEvent('deep_dive_gated', { userIdHash: buildHash(auth.user.id).slice(0, 12) })
  //   sendJson(response, 200, {
  //     status: 'gated',
  //     error: freeLimit === 1
  //       ? 'Your first Deep Dive is free. More Deep Dives will be available after subscriptions are enabled.'
  //       : 'More Deep Dives will be available after subscriptions are enabled.',
  //   })
  //   return
  // }

  let body
  try {
    body = await readJsonBody(request, { maxBytes: DEEP_DIVE_BODY_LIMIT_BYTES })
  } catch (error) {
    sendJson(response, 400, { error: error.message || 'Request body must be valid JSON.' })
    return
  }

  const query = clean(body.query)
  const candidateId = clean(body.candidateId)
  const discoveryToken = clean(body.discoveryToken)
  const amazonDomain = getRequestedAmazonDomain(body.amazonDomain || '') || 'amazon.com'
  const crossMarketFallback = Boolean(body.crossMarketFallback)
  const market = normalizeMarket(amazonDomain)
  const inFlightKey = `${auth.user.id}:${discoveryToken}:${candidateId}`

  logSearchFlowEvent('deep_dive_requested', {
    candidateId: candidateId || candidateIdForLogs,
    market,
  })

  if (!query || !candidateId || !discoveryToken) {
    sendJson(response, 400, { error: 'query, discoveryToken, and candidateId are required.' })
    return
  }

  if (IN_FLIGHT.has(inFlightKey)) {
    sendJson(response, 429, { status: 'unavailable', error: 'A price comparison is already running for this product.' })
    return
  }

  const { isValid, normalizedQuery } = validateSearchInput(query, '')
  if (!isValid) {
    sendJson(response, 400, { error: 'Invalid query.' })
    return
  }

  const apiKey = getEnv('SERPAPI_API_KEY')
  if (!apiKey) {
    sendJson(response, 200, limitedPayload({
      candidateId,
      reason: 'provider_unavailable',
      message: 'Price comparison needs SerpApi to be configured before it can run.',
    }))
    return
  }

  IN_FLIGHT.add(inFlightKey)

  try {
    const resolved = await resolveDiscoveryContext(normalizedQuery, discoveryToken, [
      getAmazonMarketplaceScope(CACHE_SCOPE_RAINFOREST, amazonDomain),
      CACHE_SCOPE_DISCOVERY,
    ])

    if (!resolved.isValid) {
      sendJson(response, resolved.statusCode || 404, { error: resolved.error || 'Search session was not found.' })
      return
    }

    const selectedCandidateIds = selectedIds(resolved.cachedEntry)
    if (selectedCandidateIds.length > 0 && !selectedCandidateIds.includes(candidateId)) {
      sendJson(response, 404, { error: 'Product is not part of the finalized shortlist.' })
      return
    }

    const sourceCandidate = findCandidate(resolved.cachedEntry, candidateId)
    if (!sourceCandidate) {
      sendJson(response, 404, { error: 'Product is not part of this search session.' })
      return
    }

    const candidate = {
      ...sourceCandidate,
      ...normalizeProductIdentity(sourceCandidate),
    }
    const sourceTitle = candidate.source_title || candidate.title
    const productGroupCacheKey = buildCacheKey('product_group', [market, candidateId, sourceTitle, normalizedQuery])
    const productGroup = await getCachedOrFetchProductGroup({ apiKey, cacheKey: productGroupCacheKey, candidate, market })
    const cache = {
      productGroup: productGroup.cacheStatus,
      immersive: 'miss',
    }

    if (!productGroup.value.selectedOffer) {
      sendJson(response, 200, limitedPayload({
        candidateId,
        reason: 'no_exact_product',
        message: 'Focamai could not confirm this exact product at other stores, so there are no prices to compare.',
        cache,
      }))
      return
    }

    const immersiveToken = productGroup.value.selectedOffer.immersive_product_page_token || productGroup.value.selectedOffer.immersive_url
    const immersiveCacheKey = buildCacheKey('immersive', [market, candidateId, immersiveToken])
    const immersive = await getCachedOrFetchImmersive({
      apiKey,
      cacheKey: immersiveCacheKey,
      shoppingOffer: productGroup.value.selectedOffer,
    })
    cache.immersive = immersive.cacheStatus

    const productResults = immersive.value.productResults || {}

    if (immersive.cacheStatus === 'stale') {
      await incrementDeepDiveUsage(auth.user.id)
      sendJson(response, 200, limitedPayload({
        candidateId,
        reason: 'price_data_stale',
        message: 'Current store prices could not be confirmed right now. Try again in a little while.',
        cache,
      }))
      return
    }

    const offerResult = await normalizeDeepDiveOffers({
      candidate,
      immersive: immersive.value,
      market,
      shoppingOffer: productGroup.value.selectedOffer,
      skipSavingsFilter: crossMarketFallback,
    })

    await incrementDeepDiveUsage(auth.user.id)

    const payload = readyPayload({
      candidateId,
      product: buildDeepDiveProductPayload(productResults, candidate),
      offers: offerResult.offers,
      similarAlternatives: areSimilarOptionsEnabled() && offerResult.offers.length === 0
        ? findSimilarShoppingAlternatives({
            candidate,
            shoppingResults: productGroup.value.payload?.shopping_results,
            currency: market === 'CA' ? 'CAD' : 'USD',
          })
        : [],
      checkedStoreCount: Array.isArray(productResults.stores) ? productResults.stores.length : 0,
      cache,
      ambiguous: Boolean(productGroup.value.ambiguous),
    })

    logSearchFlowEvent('deep_dive_completed', {
      candidateId,
      market,
      status: payload.status,
      offerCount: offerResult.offers.length,
      rejectedOfferCount: offerResult.rejected.length,
      totalMs: roundTimingDuration(nowMs() - startedAt),
    })

    sendJson(response, 200, payload, {
      serverTiming: [{ name: 'total', duration: nowMs() - startedAt }],
    })
  } catch (error) {
    logSearchFlowEvent('deep_dive_immersive_failed', {
      candidateId,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    reportBackendError(error, {
      candidateId,
      market,
      route: '/api/product/deep-dive',
      source: 'deep_dive',
    })
    sendJson(response, 200, limitedPayload({
      candidateId,
      reason: 'provider_unavailable',
      message: 'Price comparison was limited this time because the provider request did not complete.',
    }))
  } finally {
    IN_FLIGHT.delete(inFlightKey)
  }
}
