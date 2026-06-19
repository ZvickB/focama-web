import { getEnv } from '../search-data.js'
import { logSearchFlowEvent, nowMs, roundTimingDuration } from '../server-helpers.js'
import { takeRateLimitToken } from '../rate-limit.js'
import {
  buildSerperMatchJudgmentCacheEntry,
  buildSerperMatchJudgmentCacheKey,
  buildSerperResultCacheEntry,
  buildSerperResultCacheKey,
  readSerperMatchJudgmentCacheState,
  readSerperResultCacheState,
} from './comparison-cache.js'
import {
  readPriceComparisonCacheEntry,
  writePriceComparisonCacheEntry,
} from '../search-storage.js'
import { judgeSerperMatches } from './match-judgment.js'
import { searchSerperShoppingOffers } from './serper-client.js'

const DEFAULT_PRICE_CHECK_THRESHOLD = 100
const DEFAULT_CONFIDENCE_THRESHOLD = 0.85
const DEFAULT_MIN_SAVINGS = 8
const DEFAULT_MIN_SAVINGS_PERCENT = 0.08
const DEFAULT_MAX_OFFERS_TO_JUDGE = 8
const DEFAULT_MAX_PRODUCTS_PER_SEARCH = 3
const DEFAULT_BACKGROUND_RATE_LIMIT_PER_MINUTE = 30
const PRICE_COMPARISON_TIMEOUT_MS = 15000
const PRICE_COMPARISON_DISCLAIMER = 'Prices are approximate. Verify the product matches before purchasing.'

function finiteNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function isEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim())
}

function getPositiveEnvNumber(name, fallback) {
  const configured = finiteNumber(getEnv(name))
  return configured && configured > 0 ? configured : fallback
}

function getThreshold() {
  return getPositiveEnvNumber('PRICE_CHECK_THRESHOLD', DEFAULT_PRICE_CHECK_THRESHOLD)
}

function getMatchConfig() {
  return {
    confidenceThreshold: getPositiveEnvNumber('PRICE_MATCH_CONFIDENCE', DEFAULT_CONFIDENCE_THRESHOLD),
    minSavings: getPositiveEnvNumber('PRICE_MATCH_MIN_SAVINGS', DEFAULT_MIN_SAVINGS),
    minSavingsPercent: getPositiveEnvNumber('PRICE_MATCH_MIN_PERCENT', DEFAULT_MIN_SAVINGS_PERCENT),
    maxOffersToJudge: Math.max(1, Math.floor(getPositiveEnvNumber('SERPER_PRICE_INTEL_MAX_OFFERS', DEFAULT_MAX_OFFERS_TO_JUDGE))),
    maxProductsPerSearch: Math.max(1, Math.floor(getPositiveEnvNumber('SERPER_PRICE_INTEL_MAX_PRODUCTS', DEFAULT_MAX_PRODUCTS_PER_SEARCH))),
    backgroundRateLimitPerMinute: Math.max(1, Math.floor(getPositiveEnvNumber('SERPER_PRICE_INTEL_RATE_LIMIT_PER_MINUTE', DEFAULT_BACKGROUND_RATE_LIMIT_PER_MINUTE))),
  }
}

function getCandidatePrice(candidate) {
  const numericPrice = finiteNumber(candidate?.numericPrice)
  if (numericPrice != null) return numericPrice

  const priceText = String(candidate?.price || '').replace(/,/g, '')
  const match = priceText.match(/[0-9]+(?:\.[0-9]+)?/)
  if (!match) return null

  return finiteNumber(match[0])
}

function resolveMarketFromAmazonDomain(amazonDomain) {
  return String(amazonDomain || '').toLowerCase() === 'amazon.ca' ? 'CA' : 'US'
}

function normalizePriceProduct({ candidate, enrichmentEntry, market }) {
  const price = getCandidatePrice(candidate)
  return {
    candidate_id: String(candidate?.id || enrichmentEntry?.candidate_id || enrichmentEntry?.candidateId || ''),
    display_title:
      enrichmentEntry?.display_title ||
      enrichmentEntry?.displayTitle ||
      candidate?.title ||
      '',
    match_identifier: enrichmentEntry?.match_identifier || enrichmentEntry?.matchIdentifier || {},
    price,
    currency: market === 'CA' ? 'CAD' : 'USD',
  }
}

function toClientPriceResult(candidateId, match) {
  return {
    candidate_id: candidateId,
    retailer: match.offer?.retailer || '',
    price: match.offer?.price ?? null,
    currency: match.offer?.currency || null,
    savings: match.savings,
    savings_percent: match.savings_percent,
    url: match.offer?.url || '',
    confidence: match.confidence,
    disclaimer: PRICE_COMPARISON_DISCLAIMER,
  }
}

function filterOffersForJudgment({ offers, product, matchConfig }) {
  const sourceCurrency = String(product?.currency || '').trim().toUpperCase()
  const sourcePrice = finiteNumber(product?.price)

  return (Array.isArray(offers) ? offers : [])
    .filter((offer) => {
      const offerPrice = finiteNumber(offer?.price)
      const offerCurrency = String(offer?.currency || '').trim().toUpperCase()
      const savings = sourcePrice != null && offerPrice != null ? sourcePrice - offerPrice : null
      return (
        offerPrice != null &&
        sourcePrice != null &&
        savings >= matchConfig.minSavings &&
        savings / sourcePrice >= matchConfig.minSavingsPercent &&
        sourceCurrency &&
        offerCurrency === sourceCurrency &&
        String(offer?.url || '').trim() &&
        String(offer?.title || '').trim()
      )
    })
    .sort((a, b) => finiteNumber(a.price) - finiteNumber(b.price))
    .slice(0, matchConfig.maxOffersToJudge)
}

function withTimeout(promise, timeoutMs = PRICE_COMPARISON_TIMEOUT_MS) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Serper price comparison timed out'))
    }, timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

export function createSerperPricePrefetches({
  candidates,
  selectedCandidateIds,
  amazonDomain,
  apiKey = getEnv('SERPER_API_KEY'),
  searchOffers = searchSerperShoppingOffers,
  readCache = readPriceComparisonCacheEntry,
  writeCache = writePriceComparisonCacheEntry,
  takeToken = takeRateLimitToken,
} = {}) {
  if (!isEnabled(getEnv('SERPER_PRICE_INTEL_ENABLED')) || !apiKey) return []

  const selectedIds = new Set((Array.isArray(selectedCandidateIds) ? selectedCandidateIds : []).map(String))
  const market = resolveMarketFromAmazonDomain(amazonDomain)
  const threshold = getThreshold()
  const matchConfig = getMatchConfig()
  const selectedCandidates = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => selectedIds.has(String(candidate?.id)))
    .filter((candidate) => {
      const price = getCandidatePrice(candidate)
      return price != null && price >= threshold
    })
    .slice(0, matchConfig.maxProductsPerSearch)

  if (selectedCandidates.length === 0) return []

  logSearchFlowEvent('price_comparison_started', {
    qualifiedCount: selectedCandidates.length,
    threshold,
    market,
    maxProductsPerSearch: matchConfig.maxProductsPerSearch,
    maxOffersToJudge: matchConfig.maxOffersToJudge,
    minSavings: matchConfig.minSavings,
    minSavingsPercent: matchConfig.minSavingsPercent,
    confidenceThreshold: matchConfig.confidenceThreshold,
  })

  return selectedCandidates.map((candidate) => {
    const startedAt = nowMs()
    const query = candidate?.title || ''
    const cacheKey = buildSerperResultCacheKey({ query, market })
    const promise = (async () => {
      const cachedEntry = await readCache(cacheKey)
      const cachedState = readSerperResultCacheState(cachedEntry)

      logSearchFlowEvent('serper_results_cache_' + (cachedState.offers ? 'hit' : 'miss'), {
        candidateId: String(candidate?.id || ''),
        cacheKey,
        market,
      })

      if (cachedState.offers) {
        logSearchFlowEvent('serper_results_received', {
          candidateId: String(candidate?.id || ''),
          market,
          query,
          resultCount: cachedState.offers.length,
          durationMs: roundTimingDuration(nowMs() - startedAt),
          cache: 'hit',
        })
        return { ok: true, offers: cachedState.offers, cache: 'hit' }
      }

      const rateLimit = await takeToken('serper-price-intel:global', {
        limit: matchConfig.backgroundRateLimitPerMinute,
        windowMs: 60_000,
      })

      if (!rateLimit.allowed) {
        logSearchFlowEvent('price_comparison_background_rate_limited', {
          candidateId: String(candidate?.id || ''),
          market,
          resetAt: rateLimit.resetAt,
        })
        return { ok: false, offers: [], error: 'background_rate_limited' }
      }

      const offers = await searchOffers(query, market, { apiKey })
      await writeCache(buildSerperResultCacheEntry({
        cacheKey,
        query,
        market,
        offers,
      }))

      logSearchFlowEvent('serper_results_received', {
        candidateId: String(candidate?.id || ''),
        market,
        query,
        resultCount: Array.isArray(offers) ? offers.length : 0,
        durationMs: roundTimingDuration(nowMs() - startedAt),
        cache: 'miss',
      })
      return { ok: true, offers: Array.isArray(offers) ? offers : [], cache: 'miss' }
    })().catch((error) => ({
      ok: false,
      offers: [],
      error: error instanceof Error ? error.message : 'Unknown Serper error',
    }))

    return {
      candidateId: String(candidate?.id || ''),
      candidate,
      market,
      promise,
    }
  })
}

export async function runSerperPriceIntelligence({
  prefetches,
  enrichmentEntries,
  anthropicApiKey = getEnv('CLAUDE_API_KEY'),
  judgeMatches = judgeSerperMatches,
  readCache = readPriceComparisonCacheEntry,
  writeCache = writePriceComparisonCacheEntry,
} = {}) {
  if (!anthropicApiKey) return { results: [], model: '', usage: [], completed: false }

  const jobs = Array.isArray(prefetches) ? prefetches : []
  if (jobs.length === 0) return { results: [], model: '', usage: [], completed: false }

  const startedAt = nowMs()
  const matchConfig = getMatchConfig()
  const entriesById = new Map(
    (Array.isArray(enrichmentEntries) ? enrichmentEntries : []).map((entry) => [
      String(entry?.candidate_id || entry?.candidateId || ''),
      entry,
    ]),
  )

  async function processJob(job) {
    try {
      const prefetch = await job.promise
      if (!prefetch?.ok || !prefetch.offers.length) {
        return {
          candidateId: job.candidateId,
          results: [],
          usage: null,
          acceptedCount: 0,
          rejectedCount: prefetch?.offers?.length || 0,
          error: prefetch?.error || null,
        }
      }

      const enrichmentEntry = entriesById.get(job.candidateId)
      if (!enrichmentEntry) {
        return {
          candidateId: job.candidateId,
          results: [],
          usage: null,
          acceptedCount: 0,
          rejectedCount: prefetch.offers.length,
          error: 'missing_enrichment_entry',
        }
      }

      const product = normalizePriceProduct({
        candidate: job.candidate,
        enrichmentEntry,
        market: job.market,
      })
      const offersForJudgment = filterOffersForJudgment({
        offers: prefetch.offers,
        product,
        matchConfig,
      })
      if (offersForJudgment.length === 0) {
        return {
          candidateId: job.candidateId,
          results: [],
          usage: null,
          acceptedCount: 0,
          rejectedCount: prefetch.offers.length,
          error: null,
        }
      }

      const matchCacheKey = buildSerperMatchJudgmentCacheKey({ product, offers: offersForJudgment })
      const cachedMatchEntry = await readCache(matchCacheKey)
      const cachedMatchState = readSerperMatchJudgmentCacheState(cachedMatchEntry)
      const matchCacheHit = Array.isArray(cachedMatchState.matches)

      logSearchFlowEvent('match_judgment_cache_' + (matchCacheHit ? 'hit' : 'miss'), {
        candidateId: job.candidateId,
        cacheKey: matchCacheKey,
        offerCount: offersForJudgment.length,
      })

      const judgment = matchCacheHit
        ? {
            model: cachedMatchState.model,
            usage: cachedMatchState.usage,
            matches: cachedMatchState.matches,
          }
        : await judgeMatches({
            product,
            offers: offersForJudgment,
            apiKey: anthropicApiKey,
            confidenceThreshold: matchConfig.confidenceThreshold,
            minSavings: matchConfig.minSavings,
            minSavingsPercent: matchConfig.minSavingsPercent,
          })
      const matches = Array.isArray(judgment?.matches) ? judgment.matches : []

      if (!matchCacheHit) {
        await writeCache(buildSerperMatchJudgmentCacheEntry({
          cacheKey: matchCacheKey,
          product,
          matches,
          rejectedCount: Math.max(0, offersForJudgment.length - matches.length),
          model: judgment?.model || '',
          usage: judgment?.usage || null,
        }))
      }

      logSearchFlowEvent('match_judgment_complete', {
        candidateId: job.candidateId,
        acceptedCount: matches.length,
        rejectedCount: Math.max(0, offersForJudgment.length - matches.length),
        skippedBeforeJudgmentCount: Math.max(0, prefetch.offers.length - offersForJudgment.length),
        confidenceScores: matches.map((match) => match.confidence),
        savingsAmounts: matches.map((match) => match.savings),
        model: judgment?.model || '',
        cache: matchCacheHit ? 'hit' : 'miss',
      })

      return {
        candidateId: job.candidateId,
        model: judgment?.model || '',
        results: matches.map((match) => toClientPriceResult(job.candidateId, match)),
        usage: judgment?.usage || null,
        acceptedCount: matches.length,
        rejectedCount: Math.max(0, offersForJudgment.length - matches.length),
        error: null,
      }
    } catch (error) {
      logSearchFlowEvent('price_comparison_product_failed', {
        candidateId: job?.candidateId || '',
        error: error instanceof Error ? error.message : 'Unknown product price comparison error',
      })
      return {
        candidateId: job?.candidateId || '',
        results: [],
        usage: null,
        acceptedCount: 0,
        rejectedCount: 0,
        error: error instanceof Error ? error.message : 'Unknown product price comparison error',
      }
    }
  }

  const pipeline = Promise.all(jobs.map(processJob))

  try {
    const completed = await withTimeout(pipeline)
    const results = completed.flatMap((entry) => entry.results)
    const model = completed.find((entry) => entry.model)?.model || ''

    logSearchFlowEvent('price_comparison_complete', {
      qualifiedCount: jobs.length,
      surfacedCount: results.length,
      failedProductCount: completed.filter((entry) => entry.error).length,
      durationMs: roundTimingDuration(nowMs() - startedAt),
    })
    if (results.length > 0) {
      logSearchFlowEvent('price_comparison_surfaced', {
        surfacedCount: results.length,
        candidateIds: [...new Set(results.map((result) => result.candidate_id))],
      })
    }

    return {
      results,
      model,
      usage: completed.map((entry) => entry.usage).filter(Boolean),
      completed: true,
    }
  } catch (error) {
    logSearchFlowEvent('price_comparison_failed', {
      qualifiedCount: jobs.length,
      durationMs: roundTimingDuration(nowMs() - startedAt),
      error: error instanceof Error ? error.message : 'Unknown price comparison error',
    })
    return { results: [], model: '', usage: [], completed: false }
  }
}
