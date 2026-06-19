import { buildInternalErrorPayload, readJsonBody, sendJson } from '../http.js'
import { resolveOptionalAuthenticatedUser } from '../auth.js'
import { normalizeProductIdentity } from '../product-identity.js'
import { compareProduct } from '../price-comparison/compare-product.js'
import {
  buildComparisonCacheEntry,
  buildComparisonCacheKey,
  readComparisonCacheState,
} from '../price-comparison/comparison-cache.js'
import { getClientIpAddress, takeRateLimitToken } from '../rate-limit.js'
import { getEnv, validateSearchInput } from '../search-data.js'
import {
  readPriceComparisonCacheEntry,
  writePriceComparisonCacheEntry,
} from '../search-storage.js'
import { reportBackendError } from '../observability.js'
import { getAmazonMarketplaceScope, CACHE_SCOPE_RAINFOREST } from '../server-helpers.js'
import { resolveDiscoveryContext } from './discovery-handler.js'

const PRICE_CHECK_BODY_LIMIT_BYTES = 16 * 1024
const PRICE_CHECK_ANONYMOUS_RATE_LIMIT = { limit: 4, windowMs: 60_000 }
const PRICE_CHECK_AUTHENTICATED_RATE_LIMIT = { limit: 12, windowMs: 60_000 }
const COVERAGE_MODES = new Set(['major_retailers', 'all_sellers'])

function enabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim())
}

function clean(value, maxLength = 300) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function findEnrichmentEntry(cachedEntry, candidateId) {
  return cachedEntry?.selection?.enrichment?.entries?.find((entry) =>
    String(entry?.candidate_id || entry?.candidateId || '') === candidateId,
  ) || null
}

function resolveComparisonInput(cachedEntry, candidateId, coverageMode) {
  const selectedIds = Array.isArray(cachedEntry?.selection?.selectedCandidateIds)
    ? cachedEntry.selection.selectedCandidateIds.map(String)
    : []

  if (!selectedIds.includes(candidateId)) return null

  const candidate = cachedEntry?.candidatePool?.candidates?.find((item) => String(item?.id) === candidateId)
  if (!candidate) return null

  const enrichment = findEnrichmentEntry(cachedEntry, candidateId)
  const sourceTitle = enrichment?.source_title || enrichment?.sourceTitle || candidate.title || ''
  const identity = enrichment?.match_identifier || enrichment?.matchIdentifier
    ? {
        source_title: sourceTitle,
        display_title: enrichment?.display_title || enrichment?.displayTitle || sourceTitle,
        match_identifier: enrichment?.match_identifier || enrichment?.matchIdentifier,
      }
    : normalizeProductIdentity({
        sourceTitle,
        providerIdentity: candidate.providerIdentity,
        aiNormalization: null,
      })

  return {
    asin: candidateId,
    candidateId,
    market: 'CA',
    marketplace: 'amazon.ca',
    currency: 'CAD',
    sourceTitle: identity.source_title || sourceTitle,
    displayTitle: identity.display_title || sourceTitle,
    matchIdentifier: identity.match_identifier,
    amazonPrice: candidate.numericPrice,
    amazonShipping: Number.isFinite(Number(candidate.shipping)) ? Number(candidate.shipping) : null,
    sellerCoverageMode: coverageMode,
  }
}

function responsePayload(result, authenticated, cacheState) {
  const offers = Array.isArray(result?.offers) ? result.offers.slice(0, 2) : []
  if (!authenticated) {
    return { cheaperOffersFound: offers.length > 0 }
  }

  const base = {
    status: result?.status || 'complete',
    cheaperOffersFound: offers.length > 0,
    cache: { match: cacheState.match, price: cacheState.price },
  }

  return { ...base, offers }
}

export function createPriceCheckHandler(deps = {}) {
  const resolveUser = deps.resolveUser || resolveOptionalAuthenticatedUser
  const takeToken = deps.takeRateLimitToken || takeRateLimitToken
  const resolveContext = deps.resolveDiscoveryContext || resolveDiscoveryContext
  const readCache = deps.readCache || readPriceComparisonCacheEntry
  const writeCache = deps.writeCache || writePriceComparisonCacheEntry
  const compare = deps.compareProduct || compareProduct

  return async function handlePriceCheck(request, response) {
    let body
    try {
      body = await readJsonBody(request, { maxBytes: PRICE_CHECK_BODY_LIMIT_BYTES })
    } catch (error) {
      sendJson(response, 400, { error: error.message })
      return
    }

    if (!enabled(getEnv('PRICE_COMPARISON_ENABLED'))) {
      sendJson(response, 200, { status: 'disabled', cheaperOffersFound: false })
      return
    }

    const query = clean(body?.query, 200)
    const discoveryToken = clean(body?.discoveryToken)
    const candidateId = clean(body?.candidateId, 200)
    const marketplace = clean(body?.marketplace, 40).toLowerCase()
    const coverageMode = clean(body?.coverageMode, 40) || 'major_retailers'
    const { isValid, normalizedQuery } = validateSearchInput(query, '')

    if (!isValid || !discoveryToken || !candidateId || !COVERAGE_MODES.has(coverageMode)) {
      sendJson(response, 400, { error: 'query, discoveryToken, candidateId, and a valid coverageMode are required.' })
      return
    }

    if (marketplace !== 'amazon.ca' || (getEnv('PRICE_COMPARISON_MARKET') || 'CA').toUpperCase() !== 'CA') {
      sendJson(response, 400, { error: 'Price comparison is currently limited to Amazon Canada in CAD.' })
      return
    }

    const user = await resolveUser(request)
    const rateKey = user?.id
      ? `price-check:user:${user.id}`
      : `price-check:ip:${getClientIpAddress(request?.headers || {})}`
    const rateLimit = await takeToken(
      rateKey,
      user?.id ? PRICE_CHECK_AUTHENTICATED_RATE_LIMIT : PRICE_CHECK_ANONYMOUS_RATE_LIMIT,
    )

    if (!rateLimit.allowed) {
      sendJson(response, 429, { error: 'Too many price checks. Please wait and try again.' }, {
        'Retry-After': Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
      })
      return
    }

    try {
      const scopes = [getAmazonMarketplaceScope(CACHE_SCOPE_RAINFOREST, 'amazon.ca')]
      const resolved = await resolveContext(normalizedQuery, discoveryToken, scopes)
      if (!resolved.isValid) {
        sendJson(response, resolved.statusCode || 409, { error: resolved.error || 'Search session expired.' })
        return
      }

      const comparisonInput = resolveComparisonInput(resolved.cachedEntry, candidateId, coverageMode)
      if (!comparisonInput || !Number.isFinite(Number(comparisonInput.amazonPrice))) {
        sendJson(response, 409, { error: 'The product is not part of the finalized shortlist.' })
        return
      }

      const cacheKey = buildComparisonCacheKey(comparisonInput)
      const cachedEntry = await readCache(cacheKey)
      const cachedState = readComparisonCacheState(cachedEntry)

      if (cachedState.result) {
        sendJson(response, 200, responsePayload(cachedState.result, Boolean(user?.id), cachedState))
        return
      }

      const result = await compare(comparisonInput, { enabled: true })
      const nextEntry = buildComparisonCacheEntry({
        cacheKey,
        existingEntry: cachedEntry,
        input: comparisonInput,
        result,
      })
      await writeCache(nextEntry)

      sendJson(response, 200, responsePayload(result, Boolean(user?.id), {
        match: cachedState.match === 'hit' ? 'hit' : 'miss',
        price: 'miss',
      }))
    } catch (error) {
      reportBackendError(error, { route: '/api/product/price-check', source: 'price_comparison' })
      sendJson(response, 500, buildInternalErrorPayload('Unable to check prices.', error))
    }
  }
}
