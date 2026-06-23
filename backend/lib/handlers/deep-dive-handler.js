import { createHash } from 'node:crypto'

import { verifySupabaseBearerToken } from '../auth.js'
import { buildInternalErrorPayload, readJsonBody, sendJson } from '../http.js'
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
  buildReviewEvidence,
  fetchImmersiveProduct,
  fetchShoppingProductGroup,
  normalizeDeepDiveOffers,
  normalizeMarket,
  normalizeProductIdentity,
  normalizeReviewSignals,
  PRICE_STALE_MS,
  synthesizeDeepDiveReviews,
} from '../price-comparison/deep-dive-serpapi.js'
import {
  incrementDeepDiveUsage,
  readDeepDiveCacheEntry,
  readDeepDiveUsage,
  writeDeepDiveCacheEntry,
} from '../storage/deep-dive-storage.js'

const DEEP_DIVE_BODY_LIMIT_BYTES = 12 * 1024
const PRODUCT_GROUP_TTL_MS = 7 * 24 * 60 * 60 * 1000
const IMMERSIVE_TTL_MS = 24 * 60 * 60 * 1000
const SYNTHESIS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_FREE_DEEP_DIVES_PER_ACCOUNT = 1
const RATE_LIMIT_CONFIG = { limit: 5, windowMs: 60_000 }
const IN_FLIGHT = new Set()

function clean(value) {
  return String(value || '').trim()
}

function isEnabled() {
  return String(getEnv('DEEP_DIVE_ENABLED') || '').trim().toLowerCase() === 'true'
}

function getFreeDeepDiveLimit() {
  const configured = Number.parseInt(getEnv('DEEP_DIVE_FREE_LIMIT') || '', 10)
  return Number.isFinite(configured) ? configured : DEFAULT_FREE_DEEP_DIVES_PER_ACCOUNT
}

function isFreeDeepDiveLimitDisabled() {
  return /^(true|1|yes)$/i.test(clean(getEnv('DEEP_DIVE_FREE_LIMIT_DISABLED')))
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
      synthesis: cache.synthesis || 'skipped',
    },
    product: null,
    offers: [],
    reviews: {
      summary: '',
      sources: [],
      criticRatings: [],
      topInsights: [],
      starDistribution: [],
    },
    limitedData: { reason, message },
  }
}

function readyOrLimitedPayload({ candidateId, product, offers, reviews, cache }) {
  const hasData = offers.length > 0 || reviews.summary || reviews.criticRatings.length > 0 || reviews.topInsights.length > 0

  if (!hasData) {
    return limitedPayload({
      candidateId,
      reason: 'no_review_data',
      message: 'Deep Dive found the product group, but Google did not have enough offer or review detail to show.',
      cache,
    })
  }

  return {
    status: offers.length > 0 ? 'ready' : 'limited',
    candidateId,
    generatedAt: new Date().toISOString(),
    cache,
    product,
    offers,
    reviews,
    limitedData: offers.length > 0
      ? null
      : {
          reason: 'no_valid_direct_offers',
          message: 'I found review signals, but could not verify a direct store offer confidently enough to show it.',
        },
  }
}

async function getCachedOrFetchProductGroup({ apiKey, cacheKey, candidate, market }) {
  const cached = await readDeepDiveCacheEntry(cacheKey)
  if (cached?.payload?.selectedOffer) {
    return { cacheStatus: 'hit', value: cached.payload }
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

async function getCachedOrFetchImmersive({ apiKey, cacheKey, shoppingOffer }) {
  const cached = await readDeepDiveCacheEntry(cacheKey)
  if (cached?.payload?.productResults) {
    const cachedAtMs = new Date(cached.cachedAt || '').getTime()
    const isStale = Number.isFinite(cachedAtMs) && Date.now() - cachedAtMs > PRICE_STALE_MS

    if (!isStale) {
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

  logSearchFlowEvent('deep_dive_immersive_started', {})
  const value = await fetchImmersiveProduct({ apiKey, shoppingOffer })
  logSearchFlowEvent('deep_dive_immersive_succeeded', {
    storeCount: Array.isArray(value?.productResults?.stores) ? value.productResults.stores.length : 0,
  })
  await writeDeepDiveCacheEntry({ cacheKey, layer: 'immersive', payload: value, ttlMs: IMMERSIVE_TTL_MS })
  return { cacheStatus: 'miss', value }
}

async function getCachedOrCreateSynthesis({ cacheKey, evidence, includeSynthesis }) {
  if (!includeSynthesis || evidence.evidenceCount < 2) {
    return {
      cacheStatus: 'skipped',
      value: { summary: '', sources: [], limited: true, skipped: true },
    }
  }

  const cached = await readDeepDiveCacheEntry(cacheKey)
  if (cached?.payload?.summary) {
    return { cacheStatus: 'hit', value: cached.payload }
  }

  const apiKey = getEnv('CLAUDE_API_KEY')
  if (!apiKey) {
    return {
      cacheStatus: 'skipped',
      value: { summary: '', sources: [], limited: true, skipped: true },
    }
  }

  logSearchFlowEvent('deep_dive_synthesis_started', {})
  const value = await synthesizeDeepDiveReviews({ apiKey, evidence })
  logSearchFlowEvent('deep_dive_synthesis_succeeded', {
    sourceCount: value.sources.length,
    skipped: Boolean(value.skipped),
  })
  if (value.summary) {
    await writeDeepDiveCacheEntry({ cacheKey, layer: 'synthesis', payload: value, ttlMs: SYNTHESIS_TTL_MS })
  }
  return { cacheStatus: value.skipped ? 'skipped' : 'miss', value }
}

export async function handleDeepDive(request, response) {
  const startedAt = nowMs()
  const candidateIdForLogs = ''

  if (!isEnabled()) {
    sendJson(response, 200, {
      status: 'unavailable',
      error: 'Deep Dive is not enabled yet.',
    })
    return
  }

  const auth = await verifySupabaseBearerToken(request.headers || {})
  if (!auth.ok) {
    sendJson(response, 401, {
      status: 'gated',
      error: auth.reason === 'supabase_not_configured'
        ? 'Sign in is not configured for Deep Dive yet.'
        : 'Sign in to use Deep Dive.',
    })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const [ipLimit, accountLimit] = await Promise.all([
    takeRateLimitToken(clientIpAddress, RATE_LIMIT_CONFIG),
    takeRateLimitToken(`deep-dive-account:${auth.user.id}`, RATE_LIMIT_CONFIG),
  ])

  if (!ipLimit.allowed || !accountLimit.allowed) {
    sendJson(response, 429, { status: 'unavailable', error: 'Too many Deep Dive requests. Please wait a moment and try again.' })
    return
  }

  const usage = await readDeepDiveUsage(auth.user.id)
  const freeLimit = getFreeDeepDiveLimit()
  const hasUnlimitedDeepDives = Boolean(auth.entitlements?.deepDiveUnlimited) || isFreeDeepDiveLimitDisabled() || freeLimit <= 0

  if (!hasUnlimitedDeepDives && usage.count >= freeLimit) {
    logSearchFlowEvent('deep_dive_gated', { userIdHash: buildHash(auth.user.id).slice(0, 12) })
    sendJson(response, 200, {
      status: 'gated',
      error: freeLimit === 1
        ? 'Your first Deep Dive is free. More Deep Dives will be available after subscriptions are enabled.'
        : 'More Deep Dives will be available after subscriptions are enabled.',
    })
    return
  }

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
  const includeSynthesis = body.includeSynthesis !== false
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
    sendJson(response, 429, { status: 'unavailable', error: 'Deep Dive is already running for this product.' })
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
      message: 'Deep Dive needs SerpApi to be configured before it can run.',
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
      synthesis: 'skipped',
    }

    if (!productGroup.value.selectedOffer) {
      sendJson(response, 200, limitedPayload({
        candidateId,
        reason: 'no_exact_product',
        message: 'Deep Dive could not prove a unique Google Shopping product group for this exact item.',
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
    const shouldShowPrices = immersive.cacheStatus !== 'stale'
    const offerResult = shouldShowPrices
      ? await normalizeDeepDiveOffers({
          candidate,
          immersive: immersive.value,
          market,
          shoppingOffer: productGroup.value.selectedOffer,
        })
      : { offers: [], rejected: [] }

    const evidence = buildReviewEvidence(productResults)
    const synthesisCacheKey = buildCacheKey('synthesis', [market, candidateId, evidence.inputHash])
    const synthesis = await getCachedOrCreateSynthesis({
      cacheKey: synthesisCacheKey,
      evidence,
      includeSynthesis,
    })
    cache.synthesis = synthesis.cacheStatus

    const signals = normalizeReviewSignals(productResults)
    const reviews = {
      summary: synthesis.value.summary || '',
      sources: synthesis.value.sources || [],
      criticRatings: signals.criticRatings,
      topInsights: signals.topInsights,
      starDistribution: signals.starDistribution,
    }

    await incrementDeepDiveUsage(auth.user.id)

    const payload = readyOrLimitedPayload({
      candidateId,
      product: buildDeepDiveProductPayload(productResults, candidate),
      offers: offerResult.offers,
      reviews,
      cache,
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
      message: 'Deep Dive was limited this time because the provider request did not complete.',
    }))
  } finally {
    IN_FLIGHT.delete(inFlightKey)
  }
}
