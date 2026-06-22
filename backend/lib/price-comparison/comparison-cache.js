import { createHash } from 'node:crypto'

export const COMPARISON_MATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const COMPARISON_PRICE_TTL_MS = 30 * 60 * 1000
export const COMPARISON_MATCH_STRATEGY_VERSION = 1
export const SERPER_PRICE_RESULT_STRATEGY_VERSION = 1
export const SERPER_MATCH_JUDGMENT_STRATEGY_VERSION = 3
export const HYBRID_SHOPPING_STRATEGY_VERSION = 2
export const HYBRID_IMMERSIVE_STRATEGY_VERSION = 2
export const HYBRID_IDENTITY_JUDGMENT_STRATEGY_VERSION = 1

function clean(value) {
  return String(value || '').trim()
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableObject(value[key])]),
  )
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(stableObject(value))).digest('hex')
}

export function buildStableOfferKey(offer = {}) {
  const provider = clean(offer.provider).toLowerCase()
  const providerOfferId = clean(offer.provider_offer_id)

  if (provider && providerOfferId) {
    return `${provider}:${providerOfferId}`
  }

  return `derived:${hash({
    provider,
    retailer: clean(offer.retailer).toLowerCase(),
    seller: clean(offer.seller).toLowerCase(),
    title: clean(offer.title).toLowerCase(),
  })}`
}

export function buildComparisonCacheKey(input = {}) {
  const identifier = input.matchIdentifier || input.match_identifier || {}
  const candidateIdentity = clean(input.asin || input.candidateId || input.candidate_id)

  return hash({
    candidateIdentity,
    coverageMode: clean(input.sellerCoverageMode || input.seller_coverage_mode || 'major_retailers'),
    identifier,
    marketplace: clean(input.marketplace || input.market).toUpperCase(),
    strategyVersion: COMPARISON_MATCH_STRATEGY_VERSION,
  })
}

export function buildSerperResultCacheKey({ query = '', market = '' } = {}) {
  return hash({
    mode: 'serper_shopping_results',
    market: clean(market).toUpperCase(),
    query: clean(query).toLowerCase().replace(/\s+/g, ' '),
    strategyVersion: SERPER_PRICE_RESULT_STRATEGY_VERSION,
  })
}

export function buildSerperMatchJudgmentCacheKey({ product = {}, offers = [] } = {}) {
  const identifier = product.match_identifier || product.matchIdentifier || {}
  const offerSet = (Array.isArray(offers) ? offers : []).map((offer) => ({
    key: buildStableOfferKey(offer),
    currency: clean(offer?.currency).toUpperCase(),
    price: Number.isFinite(Number(offer?.price)) ? Number(offer.price) : null,
    retailer: clean(offer?.retailer).toLowerCase(),
    title: clean(offer?.title).toLowerCase(),
    url: clean(offer?.url),
  }))

  return hash({
    mode: 'serper_match_judgment',
    candidateIdentity: clean(product.candidate_id || product.candidateId),
    currency: clean(product.currency).toUpperCase(),
    identifier,
    offerSet,
    sourcePrice: Number.isFinite(Number(product.price)) ? Number(product.price) : null,
    strategyVersion: SERPER_MATCH_JUDGMENT_STRATEGY_VERSION,
  })
}

export function buildHybridIdentityJudgmentCacheKey({ product = {}, offers = [] } = {}) {
  const identifier = product.match_identifier || product.matchIdentifier || {}
  return hash({
    mode: 'hybrid_identity_judgment',
    candidateIdentity: clean(product.candidate_id || product.candidateId),
    sourceTitle: clean(product.source_title || product.sourceTitle).toLowerCase(),
    identifier,
    matchPolicy: stableObject(product.match_policy || product.matchPolicy || {}),
    offers: (Array.isArray(offers) ? offers : []).map((offer) => ({
      retailer: clean(offer?.retailer).toLowerCase(),
      title: clean(offer?.title).toLowerCase(),
      condition: clean(offer?.condition).toLowerCase(),
    })),
    strategyVersion: HYBRID_IDENTITY_JUDGMENT_STRATEGY_VERSION,
  })
}

export function buildHybridProviderCacheKey({ mode, market, identity, retailer = '', strategyVersion = 1 } = {}) {
  return hash({
    mode: clean(mode),
    market: clean(market).toUpperCase(),
    identity: stableObject(identity || {}),
    retailer: clean(retailer).toLowerCase(),
    strategyVersion,
  })
}

export function readHybridProviderCacheState(entry, nowMs = Date.now()) {
  if (!entry || typeof entry !== 'object') return { price: 'miss', payload: null }
  const price = isFresh(entry.priceExpiresAt, nowMs) ? 'hit' : 'stale'
  const wrapper = Array.isArray(entry.offers) ? entry.offers[0] : null
  return {
    price,
    payload: price === 'hit' && wrapper?.hybrid_payload ? wrapper.hybrid_payload : null,
  }
}

export function buildHybridProviderCacheEntry({
  cacheKey,
  mode,
  market,
  identity,
  payload,
  strategyVersion = 1,
  ttlMs = COMPARISON_PRICE_TTL_MS,
  now = new Date(),
}) {
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString()
  return {
    cacheKey,
    candidateId: clean(identity?.candidate_id || identity?.candidateId),
    marketplace: clean(market).toUpperCase(),
    coverageMode: clean(mode),
    strategyVersion,
    identity: stableObject(identity || {}),
    status: 'complete',
    query: null,
    offers: [{ hybrid_payload: payload }],
    accepted: [],
    rejected: [],
    providerErrors: {},
    matchCachedAt: now.toISOString(),
    matchExpiresAt: expiresAt,
    priceCachedAt: now.toISOString(),
    priceExpiresAt: expiresAt,
  }
}

function isFresh(expiresAt, nowMs) {
  const expiresAtMs = new Date(expiresAt || '').getTime()
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs
}

export function readComparisonCacheState(entry, nowMs = Date.now()) {
  if (!entry || typeof entry !== 'object') {
    return { match: 'miss', price: 'miss', result: null }
  }

  const match = isFresh(entry.matchExpiresAt, nowMs) ? 'hit' : 'stale'
  const price = isFresh(entry.priceExpiresAt, nowMs) ? 'hit' : 'stale'
  const result = price === 'hit'
    ? {
        status: entry.status || 'complete',
        query: entry.query || null,
        offers: Array.isArray(entry.offers) ? entry.offers : [],
        accepted: Array.isArray(entry.accepted) ? entry.accepted : [],
        rejected: Array.isArray(entry.rejected) ? entry.rejected : [],
        provider_errors: entry.providerErrors || {},
      }
    : null

  return { match, price, result }
}

export function readSerperResultCacheState(entry, nowMs = Date.now()) {
  if (!entry || typeof entry !== 'object') {
    return { price: 'miss', offers: null }
  }

  const price = isFresh(entry.priceExpiresAt, nowMs) ? 'hit' : 'stale'
  return {
    price,
    offers: price === 'hit' && Array.isArray(entry.offers) ? entry.offers : null,
  }
}

export function readSerperMatchJudgmentCacheState(entry, nowMs = Date.now()) {
  if (!entry || typeof entry !== 'object') {
    return { match: 'miss', matches: null, usage: null, model: '' }
  }

  const match = isFresh(entry.matchExpiresAt, nowMs) ? 'hit' : 'stale'
  return {
    match,
    matches: match === 'hit' && Array.isArray(entry.accepted) ? entry.accepted : null,
    usage: match === 'hit' ? entry.providerErrors?.usage || null : null,
    model: match === 'hit' ? entry.providerErrors?.model || '' : '',
  }
}

export function buildSerperResultCacheEntry({
  cacheKey,
  query,
  market,
  offers,
  ttlMs = COMPARISON_PRICE_TTL_MS,
  now = new Date(),
}) {
  const nowMs = now.getTime()
  return {
    cacheKey,
    candidateId: '',
    marketplace: clean(market).toUpperCase(),
    coverageMode: 'serper_shopping_results',
    strategyVersion: SERPER_PRICE_RESULT_STRATEGY_VERSION,
    identity: { query: clean(query) },
    status: 'complete',
    query: clean(query),
    offers: Array.isArray(offers)
      ? offers.map((offer) => ({ ...offer, offer_key: buildStableOfferKey(offer) }))
      : [],
    accepted: [],
    rejected: [],
    providerErrors: {},
    matchCachedAt: now.toISOString(),
    matchExpiresAt: now.toISOString(),
    priceCachedAt: now.toISOString(),
    priceExpiresAt: new Date(nowMs + ttlMs).toISOString(),
  }
}

export function buildSerperMatchJudgmentCacheEntry({
  cacheKey,
  product,
  matches,
  rejectedCount = 0,
  model = '',
  usage = null,
  now = new Date(),
}) {
  const nowMs = now.getTime()
  return {
    cacheKey,
    candidateId: clean(product?.candidate_id || product?.candidateId),
    marketplace: clean(product?.currency).toUpperCase(),
    coverageMode: 'serper_match_judgment',
    strategyVersion: SERPER_MATCH_JUDGMENT_STRATEGY_VERSION,
    identity: product?.match_identifier || product?.matchIdentifier || {},
    status: 'complete',
    query: product?.display_title || product?.displayTitle || null,
    offers: [],
    accepted: Array.isArray(matches) ? matches : [],
    rejected: Array.from({ length: Math.max(0, Number(rejectedCount) || 0) }, () => ({ reason: 'not_accepted' })),
    providerErrors: { model, usage },
    matchCachedAt: now.toISOString(),
    matchExpiresAt: new Date(nowMs + COMPARISON_MATCH_TTL_MS).toISOString(),
    priceCachedAt: now.toISOString(),
    priceExpiresAt: now.toISOString(),
  }
}

export function buildComparisonCacheEntry({
  cacheKey,
  existingEntry,
  input,
  result,
  now = new Date(),
}) {
  const nowMs = now.getTime()
  const existingMatchIsFresh = isFresh(existingEntry?.matchExpiresAt, nowMs)
  const checkedAt = now.toISOString()
  const offers = Array.isArray(result?.offers)
    ? result.offers.map((offer) => ({ ...offer, offer_key: buildStableOfferKey(offer) }))
    : []
  const accepted = Array.isArray(result?.accepted)
    ? result.accepted.map((offer) => ({ ...offer, offer_key: buildStableOfferKey(offer) }))
    : []

  return {
    cacheKey,
    candidateId: clean(input.candidateId || input.candidate_id || input.asin),
    marketplace: clean(input.marketplace || input.market).toUpperCase(),
    coverageMode: clean(input.sellerCoverageMode || input.seller_coverage_mode || 'major_retailers'),
    strategyVersion: COMPARISON_MATCH_STRATEGY_VERSION,
    identity: input.matchIdentifier || input.match_identifier || {},
    status: result?.status || 'complete',
    query: result?.query || null,
    offers,
    accepted,
    rejected: Array.isArray(result?.rejected) ? result.rejected : [],
    providerErrors: result?.provider_errors || {},
    matchCachedAt: existingMatchIsFresh ? existingEntry.matchCachedAt : checkedAt,
    matchExpiresAt: existingMatchIsFresh
      ? existingEntry.matchExpiresAt
      : new Date(nowMs + COMPARISON_MATCH_TTL_MS).toISOString(),
    priceCachedAt: checkedAt,
    priceExpiresAt: new Date(nowMs + COMPARISON_PRICE_TTL_MS).toISOString(),
  }
}
