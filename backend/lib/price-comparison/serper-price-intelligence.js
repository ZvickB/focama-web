import { createHash } from 'node:crypto'
import { getEnv } from '../search-data.js'
import { logSearchFlowEvent, nowMs, roundTimingDuration } from '../server-helpers.js'
import { takeRateLimitToken } from '../rate-limit.js'
import {
  buildHybridProviderCacheEntry,
  buildHybridProviderCacheKey,
  buildHybridIdentityJudgmentCacheKey,
  buildSerperMatchJudgmentCacheEntry,
  buildSerperResultCacheEntry,
  buildSerperResultCacheKey,
  HYBRID_IMMERSIVE_STRATEGY_VERSION,
  HYBRID_SHOPPING_STRATEGY_VERSION,
  readHybridProviderCacheState,
  readSerperMatchJudgmentCacheState,
  readSerperResultCacheState,
} from './comparison-cache.js'
import {
  readPriceComparisonCacheEntry,
  writePriceComparisonCacheEntry,
} from '../search-storage.js'
import { judgeSerperMatches } from './match-judgment.js'
import { searchSerperShoppingOffers } from './serper-client.js'
import { fetchImmersiveProduct, searchShoppingOffers } from './serpapi-client.js'
import {
  isMarketplaceRetailer,
  proveExactProductVariant,
  selectUniqueShoppingProduct,
} from './exact-product-proof.js'
import {
  parseRetailerDomainAllowlist,
  validateDirectRetailerUrl,
} from './retailer-link-validation.js'

const DEFAULT_PRICE_CHECK_THRESHOLD = 100
const DEFAULT_CONFIDENCE_THRESHOLD = 0.85
const DEFAULT_MIN_SAVINGS = 8
const DEFAULT_MIN_SAVINGS_PERCENT = 0.08
const DEFAULT_MAX_SAVINGS_PERCENT = 0.6
const DEFAULT_MAX_CANDIDATES = 3
const DEFAULT_SERPER_RATE_LIMIT_PER_MINUTE = 30
const DEFAULT_SERPAPI_DAILY_CALLS = 32
const DEFAULT_SERPAPI_CALLS_PER_MINUTE = 4
const DEFAULT_SERPAPI_MAX_CONCURRENCY = 1
const PRICE_COMPARISON_TIMEOUT_MS = 15_000
const NEGATIVE_CACHE_TTL_MS = 15 * 60 * 1000
const PROVIDER_ERROR_CACHE_TTL_MS = 5 * 60 * 1000
const PRICE_COMPARISON_DISCLAIMER = 'Prices are approximate. Verify the product matches before purchasing.'
const MARKETPLACE_OR_CONDITION = /\b(?:marketplace|used|renewed|refurbished|open[ -]?box|restored|pre[ -]?owned)\b/i
const ACCESSORY_TITLE_PATTERNS = [
  /\b(?:case|cover|skin|sleeve|ear\s*tips?|ear\s*hooks?|strap|holder|stand|mount)\s+for\b/i,
  /\b(?:compatible|designed)\s+with\b/i,
  /\b(?:protective|silicone|clear|hard|soft|carrying|storage|replacement)\s+(?:case|cover|skin|sleeve)\b/i,
  /\b(?:replacement|spare)\s+(?:part|parts|ear\s*tips?|ear\s*buds?|case|cable|charger)\b/i,
  /\b(?:charging|usb|lightning)\s+(?:cable|cord|adapter)\b/i,
]

let activeHybridJobs = 0

function finiteNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getPositiveEnvNumber(name, fallback) {
  const value = finiteNumber(getEnv(name))
  return value && value > 0 ? value : fallback
}

function getFractionEnvNumber(name, fallback) {
  const value = finiteNumber(getEnv(name))
  return value && value > 0 && value < 1 ? value : fallback
}

function getHybridMode() {
  const mode = String(getEnv('HYBRID_PRICE_INTEL_MODE') || '').trim().toLowerCase()
  return mode === 'shadow' || mode === 'surface' ? mode : 'off'
}

function getMatchConfig() {
  return {
    threshold: getPositiveEnvNumber('PRICE_CHECK_THRESHOLD', DEFAULT_PRICE_CHECK_THRESHOLD),
    confidenceThreshold: getFractionEnvNumber('PRICE_MATCH_CONFIDENCE', DEFAULT_CONFIDENCE_THRESHOLD),
    minSavings: getPositiveEnvNumber('PRICE_MATCH_MIN_SAVINGS', DEFAULT_MIN_SAVINGS),
    minSavingsPercent: getFractionEnvNumber('PRICE_MATCH_MIN_PERCENT', DEFAULT_MIN_SAVINGS_PERCENT),
    maxSavingsPercent: getFractionEnvNumber('PRICE_MATCH_MAX_PERCENT', DEFAULT_MAX_SAVINGS_PERCENT),
    maxCandidates: Math.max(1, Math.floor(getPositiveEnvNumber('SERPER_PRICE_INTEL_MAX_OFFERS', DEFAULT_MAX_CANDIDATES))),
    serperRateLimitPerMinute: Math.max(1, Math.floor(getPositiveEnvNumber('SERPER_PRICE_INTEL_RATE_LIMIT_PER_MINUTE', DEFAULT_SERPER_RATE_LIMIT_PER_MINUTE))),
    serpApiDailyCalls: Math.max(1, Math.floor(getPositiveEnvNumber('SERPAPI_PRICE_INTEL_DAILY_CALLS', DEFAULT_SERPAPI_DAILY_CALLS))),
    serpApiCallsPerMinute: Math.max(1, Math.floor(getPositiveEnvNumber('SERPAPI_PRICE_INTEL_CALLS_PER_MINUTE', DEFAULT_SERPAPI_CALLS_PER_MINUTE))),
    maxConcurrency: Math.max(1, Math.floor(getPositiveEnvNumber('SERPAPI_PRICE_INTEL_MAX_CONCURRENCY', DEFAULT_SERPAPI_MAX_CONCURRENCY))),
  }
}

function getCandidatePrice(candidate) {
  const direct = finiteNumber(candidate?.numericPrice)
  if (direct != null) return direct
  const match = String(candidate?.price || '').replace(/,/g, '').match(/[0-9]+(?:\.[0-9]+)?/)
  return match ? finiteNumber(match[0]) : null
}

function resolveMarketFromAmazonDomain(amazonDomain) {
  return String(amazonDomain || '').toLowerCase() === 'amazon.ca' ? 'CA' : 'US'
}

function marketCurrency(market) {
  return market === 'CA' ? 'CAD' : 'USD'
}

function getAllowedDomains(market) {
  return parseRetailerDomainAllowlist(getEnv(`PRICE_INTEL_ALLOWED_DOMAINS_${market}`))
}

function normalizePriceProduct({ candidate, enrichmentEntry, market, amazonDomain }) {
  const sourceTitle = enrichmentEntry?.source_title || enrichmentEntry?.sourceTitle || candidate?.title || ''
  return {
    candidate_id: String(candidate?.id || enrichmentEntry?.candidate_id || enrichmentEntry?.candidateId || ''),
    source_title: sourceTitle,
    display_title: enrichmentEntry?.display_title || enrichmentEntry?.displayTitle || sourceTitle,
    match_identifier: enrichmentEntry?.match_identifier || enrichmentEntry?.matchIdentifier || {},
    price: getCandidatePrice(candidate),
    currency: marketCurrency(market),
    source_retailer: candidate?.source || candidate?.subtitle || 'Amazon',
    source_url: candidate?.link || '',
    source_marketplace: amazonDomain || '',
  }
}

function normalizeRetailer(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(?:canada|marketplace|store|official|ca|us)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function retailersMatch(a, b) {
  const left = normalizeRetailer(a)
  const right = normalizeRetailer(b)
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)))
}

function isAmazonOffer(offer) {
  if (/\bamazon\b/i.test(String(offer?.retailer || ''))) return true
  try {
    return /(^|\.)amazon\.[a-z.]+$/i.test(new URL(String(offer?.url || '')).hostname)
  } catch {
    return false
  }
}

function isAccessoryLikeOffer(offer) {
  const title = String(offer?.title || '')
  return ACCESSORY_TITLE_PATTERNS.some((pattern) => pattern.test(title))
}

function deterministicCandidateRejection({ offer, product, config }) {
  const offerPrice = finiteNumber(offer?.price)
  const sourcePrice = finiteNumber(product?.price)
  const currency = String(offer?.currency || '').toUpperCase()
  const savings = sourcePrice != null && offerPrice != null ? sourcePrice - offerPrice : null
  const percent = savings != null && sourcePrice > 0 ? savings / sourcePrice : null
  if (!offerPrice || !sourcePrice) return 'invalid_price'
  if (currency !== product.currency) return 'currency_mismatch'
  if (!String(offer?.title || '').trim()) return 'missing_title'
  if (isAmazonOffer(offer)) return 'amazon_offer'
  if (isMarketplaceRetailer(offer?.retailer) || MARKETPLACE_OR_CONDITION.test(offer?.title || '')) return 'marketplace_or_condition'
  if (isAccessoryLikeOffer(offer)) return 'accessory_like_title'
  if (savings < config.minSavings || percent < config.minSavingsPercent) return 'insufficient_savings'
  if (percent > config.maxSavingsPercent) return 'implausible_savings'
  return ''
}

function filterSerperCandidates({ offers, product, config }) {
  const rejectedByReason = {}
  const accepted = (Array.isArray(offers) ? offers : []).filter((offer) => {
    const reason = deterministicCandidateRejection({ offer, product, config })
    if (!reason) return true
    rejectedByReason[reason] = (rejectedByReason[reason] || 0) + 1
    return false
  })
    .sort((a, b) => Number(a.price) - Number(b.price))
    .slice(0, config.maxCandidates)
  return { accepted, rejectedByReason }
}

function buildComparisonQuery(product) {
  const identifier = product?.match_identifier || {}
  const provenance = identifier?.provenance || {}
  const code = ['gtin', 'upc', 'ean']
    .filter((field) => provenance[field] !== 'ai_normalized')
    .map((field) => String(identifier?.[field] || '').trim())
    .find(Boolean)
  if (code) return code
  const attributes = identifier?.attributes || {}
  return [
    identifier?.brand,
    identifier?.model_number || identifier?.modelNumber,
    attributes?.generation,
    identifier?.product_type || identifier?.productType,
    attributes?.capacity,
    attributes?.size,
    attributes?.color,
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' ') || product?.source_title || product?.display_title || ''
}

function cacheIdentity(product) {
  return {
    candidate_id: product?.candidate_id,
    source_title: product?.source_title,
    match_identifier: product?.match_identifier,
    allowlist_version: String(getEnv('PRICE_INTEL_ALLOWLIST_VERSION') || '1'),
  }
}

async function readOrLoadProvider({
  mode,
  market,
  identity,
  strategyVersion,
  load,
  readCache,
  writeCache,
}) {
  const cacheKey = buildHybridProviderCacheKey({ mode, market, identity, strategyVersion })
  const cached = readHybridProviderCacheState(await readCache(cacheKey))
  if (cached.payload) {
    logSearchFlowEvent(`${mode}_cache_hit`, { market, cacheKey })
    if (cached.payload?.__hybrid_error) throw new Error(cached.payload.__hybrid_error)
    return { payload: cached.payload, cache: 'hit' }
  }
  logSearchFlowEvent(`${mode}_cache_miss`, { market, cacheKey })
  try {
    const payload = await load()
    const negative = Array.isArray(payload)
      ? payload.length === 0
      : Array.isArray(payload?.stores) && payload.stores.length === 0
    await writeCache(buildHybridProviderCacheEntry({
      cacheKey,
      mode,
      market,
      identity,
      payload,
      strategyVersion,
      ...(negative ? { ttlMs: NEGATIVE_CACHE_TTL_MS } : {}),
    }))
    return { payload, cache: 'miss' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'provider_failed'
    if (/^serpapi_(?:minute|daily)_budget$|persistent_rate_limit_unavailable/i.test(message)) {
      throw error
    }
    await writeCache(buildHybridProviderCacheEntry({
      cacheKey,
      mode,
      market,
      identity,
      payload: { __hybrid_error: message },
      strategyVersion,
      ttlMs: PROVIDER_ERROR_CACHE_TTL_MS,
    }))
    throw error
  }
}

async function reserveSerpApiCall(config, takeToken, metrics) {
  const minute = await takeToken('hybrid-price-intel:serpapi:minute', {
    limit: config.serpApiCallsPerMinute,
    windowMs: 60_000,
    failClosed: true,
  })
  if (!minute.allowed) {
    logSearchFlowEvent('hybrid_serpapi_budget_rejected', { reason: 'minute_budget' })
    return { allowed: false, reason: 'minute_budget' }
  }
  const daily = await takeToken('hybrid-price-intel:serpapi:daily', {
    limit: config.serpApiDailyCalls,
    windowMs: 24 * 60 * 60 * 1000,
    failClosed: true,
  })
  if (!daily.allowed) {
    logSearchFlowEvent('hybrid_serpapi_budget_rejected', { reason: 'daily_budget' })
    return { allowed: false, reason: 'daily_budget' }
  }
  metrics.serpApiCalls += 1
  logSearchFlowEvent('hybrid_serpapi_budget_reserved', { callNumber: metrics.serpApiCalls })
  return { allowed: true }
}

function priceCloseToSignal(storePrice, signalPrice) {
  const left = finiteNumber(storePrice)
  const right = finiteNumber(signalPrice)
  if (left == null || right == null) return false
  return Math.abs(left - right) <= Math.max(2, right * 0.02)
}

function mapCandidateStores(candidates, stores) {
  return (Array.isArray(stores) ? stores : []).flatMap((store) => {
    if (isMarketplaceRetailer(store?.retailer) || MARKETPLACE_OR_CONDITION.test(store?.title || '')) return []
    const candidate = candidates.find((entry) => (
      retailersMatch(entry?.retailer, store?.retailer) && priceCloseToSignal(store?.price, entry?.price)
    ))
    return candidate ? [{ candidate, store }] : []
  })
}

function surfaceSelected(discoveryToken) {
  if (getHybridMode() !== 'surface') return false
  const percent = Math.min(100, Math.max(0, finiteNumber(getEnv('PRICE_INTEL_SURFACE_PERCENT')) || 0))
  if (percent <= 0 || !discoveryToken) return false
  const bucket = Number.parseInt(createHash('sha256').update(String(discoveryToken)).digest('hex').slice(0, 8), 16) % 100
  return bucket < percent
}

function withTimeout(promise, timeoutMs = PRICE_COMPARISON_TIMEOUT_MS) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Hybrid price intelligence timed out')), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

export function createSerperPricePrefetches({
  candidates,
  selectedCandidateIds,
  amazonDomain,
  apiKey = getEnv('SERPER_API_KEY'),
  serpApiKey = getEnv('SERPAPI_API_KEY'),
  anthropicApiKey = getEnv('CLAUDE_API_KEY'),
  searchOffers = searchSerperShoppingOffers,
  readCache = readPriceComparisonCacheEntry,
  writeCache = writePriceComparisonCacheEntry,
  takeToken = takeRateLimitToken,
} = {}) {
  const mode = getHybridMode()
  const market = resolveMarketFromAmazonDomain(amazonDomain)
  const allowedDomains = getAllowedDomains(market)
  if (mode === 'off' || !apiKey || !serpApiKey || !anthropicApiKey || !allowedDomains.length) {
    logSearchFlowEvent('hybrid_price_intel_skipped', {
      reason: mode === 'off' ? 'disabled' : !allowedDomains.length ? 'allowlist_missing' : 'configuration_missing',
      market,
    })
    return []
  }

  const config = getMatchConfig()
  const heroId = String((Array.isArray(selectedCandidateIds) ? selectedCandidateIds : [])[0] || '')
  const hero = (Array.isArray(candidates) ? candidates : []).find((candidate) => String(candidate?.id) === heroId)
  if (!hero || (getCandidatePrice(hero) || 0) < config.threshold) return []

  logSearchFlowEvent('price_comparison_started', {
    qualifiedCount: 1,
    heroCandidateId: heroId,
    market,
    mode,
    threshold: config.threshold,
  })

  const query = hero?.title || ''
  const cacheKey = buildSerperResultCacheKey({ query, market })
  const promise = (async () => {
    const cached = readSerperResultCacheState(await readCache(cacheKey))
    if (cached.offers) {
      logSearchFlowEvent('serper_results_received', { candidateId: heroId, market, resultCount: cached.offers.length, cache: 'hit' })
      return { ok: true, offers: cached.offers, cache: 'hit' }
    }
    const rate = await takeToken('serper-price-intel:global', { limit: config.serperRateLimitPerMinute, windowMs: 60_000 })
    if (!rate.allowed) return { ok: false, offers: [], error: 'background_rate_limited' }
    const offers = await searchOffers(query, market, { apiKey })
    await writeCache(buildSerperResultCacheEntry({
      cacheKey,
      query,
      market,
      offers,
      ...(Array.isArray(offers) && offers.length === 0 ? { ttlMs: NEGATIVE_CACHE_TTL_MS } : {}),
    }))
    logSearchFlowEvent('serper_results_received', {
      candidateId: heroId,
      market,
      resultCount: Array.isArray(offers) ? offers.length : 0,
      cache: 'miss',
    })
    return { ok: true, offers: Array.isArray(offers) ? offers : [], cache: 'miss' }
  })().catch((error) => ({ ok: false, offers: [], error: error instanceof Error ? error.message : 'serper_failed' }))

  return [{ candidateId: heroId, candidate: hero, market, amazonDomain, allowedDomains, promise }]
}

async function verifyJob({
  job,
  enrichmentEntry,
  anthropicApiKey,
  serpApiKey,
  config,
  judgeMatches,
  searchShopping,
  fetchImmersive,
  validateLink,
  readCache,
  writeCache,
  takeToken,
  providerDeps,
  metrics,
}) {
  const prefetch = await job.promise
  if (!prefetch?.ok || !prefetch.offers?.length) return { results: [], usage: null, model: '', error: prefetch?.error || null }

  const product = normalizePriceProduct({ candidate: job.candidate, enrichmentEntry, market: job.market, amazonDomain: job.amazonDomain })
  const filtered = filterSerperCandidates({ offers: prefetch.offers, product, config })
  logSearchFlowEvent('price_comparison_offers_filtered', {
    candidateId: job.candidateId,
    acceptedCount: filtered.accepted.length,
    rejectedByReason: filtered.rejectedByReason,
  })
  if (!filtered.accepted.length) return { results: [], usage: null, model: '', error: null }

  const query = buildComparisonQuery(product)
  const identity = cacheIdentity(product)
  const shopping = await readOrLoadProvider({
    mode: 'hybrid_serpapi_shopping',
    market: job.market,
    identity: { ...identity, query },
    strategyVersion: HYBRID_SHOPPING_STRATEGY_VERSION,
    readCache,
    writeCache,
    load: async () => {
      const budget = await reserveSerpApiCall(config, takeToken, metrics)
      if (!budget.allowed) throw new Error(`serpapi_${budget.reason}`)
      return searchShopping(query, job.market, { apiKey: serpApiKey, ...(providerDeps?.serpapi || {}) })
    },
  })

  const selection = selectUniqueShoppingProduct(product, shopping.payload)
  logSearchFlowEvent('hybrid_shopping_product_selection', {
    candidateId: job.candidateId,
    reason: selection.reason,
    resultCount: Array.isArray(shopping.payload) ? shopping.payload.length : 0,
  })
  if (!selection.offer) return { results: [], usage: null, model: '', error: null }

  const immersive = await readOrLoadProvider({
    mode: 'hybrid_serpapi_immersive',
    market: job.market,
    identity: { ...identity, product_id: selection.offer.product_id, immersive_url: selection.offer.immersive_url },
    strategyVersion: HYBRID_IMMERSIVE_STRATEGY_VERSION,
    readCache,
    writeCache,
    load: async () => {
      const budget = await reserveSerpApiCall(config, takeToken, metrics)
      if (!budget.allowed) throw new Error(`serpapi_${budget.reason}`)
      return fetchImmersive(selection.offer.immersive_url, job.market, { apiKey: serpApiKey, ...(providerDeps?.serpapi || {}) })
    },
  })

  const mapped = mapCandidateStores(filtered.accepted, immersive.payload?.stores)
  logSearchFlowEvent('hybrid_immersive_coverage', {
    candidateId: job.candidateId,
    storeCount: Array.isArray(immersive.payload?.stores) ? immersive.payload.stores.length : 0,
    variantGroupCount: Array.isArray(immersive.payload?.variants) ? immersive.payload.variants.length : 0,
    mappedStoreCount: mapped.length,
  })
  const verified = []
  for (const mapping of mapped) {
    const proof = proveExactProductVariant({
      product,
      shoppingOffer: selection.offer,
      immersive: immersive.payload,
      storeOffer: mapping.store,
    })
    logSearchFlowEvent('hybrid_exact_product_proof', {
      candidateId: job.candidateId,
      retailer: mapping.store.retailer,
      accepted: proof.accepted,
      failures: proof.failures,
      proof: proof.proof,
    })
    if (proof.accepted) verified.push({ ...mapping, proof })
  }
  if (!verified.length) return { results: [], usage: null, model: '', error: null }

  const directOffers = verified.map((entry) => ({ ...entry.store, currency: product.currency }))
  const judgmentProduct = {
    ...product,
    match_policy: {
      confidenceThreshold: config.confidenceThreshold,
      minSavings: config.minSavings,
      minSavingsPercent: config.minSavingsPercent,
      maxSavingsPercent: config.maxSavingsPercent,
    },
  }
  const matchCacheKey = buildHybridIdentityJudgmentCacheKey({ product: judgmentProduct, offers: directOffers })
  const cachedJudgment = readSerperMatchJudgmentCacheState(await readCache(matchCacheKey))
  logSearchFlowEvent('hybrid_match_judgment_cache', {
    candidateId: job.candidateId,
    cache: Array.isArray(cachedJudgment.matches) ? 'hit' : 'miss',
    offerCount: directOffers.length,
  })
  const judgment = Array.isArray(cachedJudgment.matches)
    ? {
        matches: cachedJudgment.matches.map((match) => ({
          ...match,
          offer: directOffers[Number.parseInt(match?.offer_index, 10)],
        })).filter((match) => match.offer),
        usage: cachedJudgment.usage,
        model: cachedJudgment.model,
      }
    : await judgeMatches({
        product: judgmentProduct,
        offers: directOffers,
        apiKey: anthropicApiKey,
        confidenceThreshold: config.confidenceThreshold,
        minSavings: config.minSavings,
        minSavingsPercent: config.minSavingsPercent,
        maxSavingsPercent: config.maxSavingsPercent,
      })
  if (!Array.isArray(cachedJudgment.matches)) {
    await writeCache(buildSerperMatchJudgmentCacheEntry({
      cacheKey: matchCacheKey,
      product: judgmentProduct,
      matches: judgment.matches,
      rejectedCount: Math.max(0, directOffers.length - (judgment.matches?.length || 0)),
      model: judgment.model,
      usage: judgment.usage,
    }))
  }

  const results = []
  for (const match of Array.isArray(judgment.matches) ? judgment.matches : []) {
    const offer = match?.offer
    const sourcePrice = finiteNumber(product.price)
    const offerPrice = finiteNumber(offer?.price)
    if (!sourcePrice || !offerPrice) continue
    const savings = Number((sourcePrice - offerPrice).toFixed(2))
    const savingsPercent = Number((savings / sourcePrice).toFixed(4))
    if (deterministicCandidateRejection({ offer, product, config })) continue

    const link = await validateLink(offer.url, {
      allowedDomains: job.allowedDomains,
      retailer: offer.retailer,
      ...(providerDeps?.linkValidation || {}),
    })
    logSearchFlowEvent('hybrid_direct_link_validation', {
      candidateId: job.candidateId,
      retailer: offer.retailer,
      ok: link.ok,
      reason: link.reason,
      redirectCount: link.redirects?.length || 0,
    })
    if (!link.ok) continue

    results.push({
      candidate_id: job.candidateId,
      retailer: offer.retailer || '',
      price: offerPrice,
      currency: product.currency,
      savings,
      savings_percent: savingsPercent,
      url: link.finalUrl,
      confidence: match.confidence,
      disclaimer: PRICE_COMPARISON_DISCLAIMER,
      verified_at: new Date().toISOString(),
    })
  }

  return { results: results.slice(0, 1), usage: judgment.usage || null, model: judgment.model || '', error: null }
}

export async function runHybridPriceIntelligence({
  prefetches,
  enrichmentEntries,
  discoveryToken = '',
  anthropicApiKey = getEnv('CLAUDE_API_KEY'),
  serpApiKey = getEnv('SERPAPI_API_KEY'),
  judgeMatches = judgeSerperMatches,
  searchShopping = searchShoppingOffers,
  fetchImmersive = fetchImmersiveProduct,
  validateLink = validateDirectRetailerUrl,
  readCache = readPriceComparisonCacheEntry,
  writeCache = writePriceComparisonCacheEntry,
  takeToken = takeRateLimitToken,
  providerDeps = {},
} = {}) {
  const jobs = Array.isArray(prefetches) ? prefetches.slice(0, 1) : []
  if (!jobs.length || !anthropicApiKey || !serpApiKey || getHybridMode() === 'off') {
    return { results: [], shadowResults: [], model: '', usage: [], completed: false, shouldSurface: false }
  }

  const config = getMatchConfig()
  if (activeHybridJobs >= config.maxConcurrency) {
    logSearchFlowEvent('hybrid_price_intel_concurrency_limited', { activeHybridJobs, maxConcurrency: config.maxConcurrency })
    return { results: [], shadowResults: [], model: '', usage: [], completed: true, shouldSurface: false }
  }

  const entries = new Map((Array.isArray(enrichmentEntries) ? enrichmentEntries : []).map((entry) => [
    String(entry?.candidate_id || entry?.candidateId || ''), entry,
  ]))
  const entry = entries.get(jobs[0].candidateId)
  if (!entry) return { results: [], shadowResults: [], model: '', usage: [], completed: true, shouldSurface: false }

  activeHybridJobs += 1
  const startedAt = nowMs()
  const metrics = { serpApiCalls: 0 }
  try {
    const verified = await withTimeout(verifyJob({
      job: jobs[0],
      enrichmentEntry: entry,
      anthropicApiKey,
      serpApiKey,
      config,
      judgeMatches,
      searchShopping,
      fetchImmersive,
      validateLink,
      readCache,
      writeCache,
      takeToken,
      providerDeps,
      metrics,
    }))
    const shouldSurface = verified.results.length > 0 && surfaceSelected(discoveryToken)
    logSearchFlowEvent('price_comparison_complete', {
      qualifiedCount: 1,
      verifiedCount: verified.results.length,
      surfacedCount: shouldSurface ? verified.results.length : 0,
      mode: getHybridMode(),
      serpApiCalls: metrics.serpApiCalls,
      estimatedSerpApiCostUsd: Number((metrics.serpApiCalls * 0.025).toFixed(3)),
      durationMs: roundTimingDuration(nowMs() - startedAt),
    })
    return {
      results: shouldSurface ? verified.results : [],
      shadowResults: verified.results,
      model: verified.model,
      usage: verified.usage ? [verified.usage] : [],
      completed: true,
      shouldSurface,
    }
  } catch (error) {
    logSearchFlowEvent('price_comparison_failed', {
      qualifiedCount: 1,
      serpApiCalls: metrics.serpApiCalls,
      estimatedSerpApiCostUsd: Number((metrics.serpApiCalls * 0.025).toFixed(3)),
      durationMs: roundTimingDuration(nowMs() - startedAt),
      error: error instanceof Error ? error.message : 'hybrid_failed',
    })
    return { results: [], shadowResults: [], model: '', usage: [], completed: false, shouldSurface: false }
  } finally {
    activeHybridJobs = Math.max(0, activeHybridJobs - 1)
  }
}

// Compatibility export for existing handler imports while the automatic path is hybrid.
export const runSerperPriceIntelligence = runHybridPriceIntelligence

export function resetHybridPriceIntelligenceState() {
  activeHybridJobs = 0
}
