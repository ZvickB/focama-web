import { DEFAULT_FILTER_CONFIG, getFilteredSearchArtifacts, lacksKnownPositivePrice } from './result-filter.js'
import { SERPAPI_ENDPOINT, buildCacheKey, buildQuery, validateSearchInput } from './search-data.js'
import { readStoredSearchCacheEntry, recordSearchHistory, writeStoredSearchCacheEntry } from './search-storage.js'
import { appendAffiliateTag, normalizeAffiliateSupportedAmazonDomain } from '../../shared/amazon-marketplaces.js'

export function ensureBadges(results = []) {
  if (!Array.isArray(results) || results.length === 0) {
    return []
  }

  const hasExplicitBadges = results.some((item) => item?.badgeLabel)

  if (hasExplicitBadges) {
    return results
  }

  return results.map((item, index) => ({
    ...item,
    badgeLabel: index === 0 ? 'Best match' : '',
  }))
}

function getCachedAmazonDomain(cachedEntry, scope = '') {
  const candidatePoolDomain = normalizeAffiliateSupportedAmazonDomain(cachedEntry?.candidatePool?.amazonDomain || '')

  if (candidatePoolDomain) {
    return candidatePoolDomain
  }

  const scopeDomain = String(scope).split(':').find((part) =>
    Boolean(normalizeAffiliateSupportedAmazonDomain(part)),
  )

  return normalizeAffiliateSupportedAmazonDomain(scopeDomain || '') || 'amazon.com'
}

function sanitizeCachedAffiliateLink(link, amazonDomain) {
  if (typeof link !== 'string' || !link) {
    return link || ''
  }

  try {
    const url = new URL(link)
    const hostname = url.hostname.toLowerCase()

    if (!/(^|\.)amazon\./.test(hostname)) {
      return link
    }
  } catch {
    return ''
  }

  return appendAffiliateTag(link, amazonDomain)
}

function sanitizeCachedAffiliateLinks(results = [], amazonDomain = 'amazon.com') {
  if (!Array.isArray(results)) {
    return []
  }

  return results.map((item) => ({
    ...item,
    link: sanitizeCachedAffiliateLink(item?.link, amazonDomain),
  }))
}

export function getValidatedSearchRequest(requestUrl, { includeDetails = true } = {}) {
  const productQuery = requestUrl.searchParams.get('query')?.trim() || ''
  const details = includeDetails ? requestUrl.searchParams.get('details')?.trim() || '' : ''
  const { error, isValid, normalizedDetails, normalizedQuery } = validateSearchInput(productQuery, details)

  return {
    cacheKey: isValid ? buildCacheKey(normalizedQuery, normalizedDetails) : null,
    error,
    isValid,
    normalizedDetails,
    normalizedQuery,
  }
}

export async function readCachedSearchSnapshot({ productQuery, details, scope = 'default' }) {
  const storedEntry = await readStoredSearchCacheEntry({
    productQuery,
    details,
    scope,
  })
  const cachedAmazonDomain = getCachedAmazonDomain(storedEntry, scope)
  const cachedEntry = storedEntry
    ? {
        ...storedEntry,
        candidatePool: storedEntry.candidatePool && typeof storedEntry.candidatePool === 'object'
          ? {
              ...storedEntry.candidatePool,
              candidates: Array.isArray(storedEntry.candidatePool.candidates)
                ? sanitizeCachedAffiliateLinks(
                    storedEntry.candidatePool.candidates.filter((candidate) => !lacksKnownPositivePrice(candidate)),
                    cachedAmazonDomain,
                  )
                : [],
            }
          : storedEntry.candidatePool,
        results: Array.isArray(storedEntry.results)
          ? sanitizeCachedAffiliateLinks(
              storedEntry.results.filter((result) => !lacksKnownPositivePrice(result)),
              cachedAmazonDomain,
            )
          : [],
      }
    : storedEntry
  const normalizedCachedResults = ensureBadges(cachedEntry?.results || [])

  return {
    cachedEntry,
    normalizedCachedResults,
  }
}

export async function recordSearchCacheEvent({
  cacheKey,
  cacheStatus,
  candidateCount,
  details,
  productQuery,
  resultCount,
  selectionMode,
  source,
}) {
  await recordSearchHistory({
    cacheKey,
    cacheStatus,
    candidateCount,
    details,
    productQuery,
    resultCount,
    selectionMode,
    source,
  })
}

export async function fetchSearchArtifacts({
  filterConfig = DEFAULT_FILTER_CONFIG,
  productQuery,
  details = '',
  reasonFallback,
  serpApiKey,
  countryCode = 'US',
}) {
  const searchUrl = new URL(SERPAPI_ENDPOINT)
  searchUrl.searchParams.set('engine', 'google_shopping')
  searchUrl.searchParams.set('q', buildQuery(productQuery, details))
  searchUrl.searchParams.set('api_key', serpApiKey)
  searchUrl.searchParams.set('gl', countryCode.toLowerCase())
  searchUrl.searchParams.set('hl', 'en')

  const apiResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) })

  if (!apiResponse.ok) {
    return {
      error: {
        error: 'SerpApi request failed.',
        statusCode: 502,
      },
      artifacts: null,
    }
  }

  const payload = await apiResponse.json()
  const artifacts = getFilteredSearchArtifacts(payload, {
    productQuery,
    details,
    candidatePoolSize: filterConfig.candidatePoolSize,
    finalResultLimit: filterConfig.finalResultLimit,
    minimumScore: filterConfig.minimumScore,
    diversifyPoolMultiplier: filterConfig.diversifyPoolMultiplier,
    hardFilterFallbackThreshold: 15,
    hardFilterFallbackPoolSize: 20,
    reasonFallback,
  })

  if (artifacts.results.length === 0) {
    return {
      error: {
        error: 'No usable shopping results were returned.',
        statusCode: 404,
      },
      artifacts: null,
    }
  }

  return {
    error: null,
    artifacts,
  }
}

export async function writeSearchSnapshot({
  productQuery,
  details,
  candidatePool,
  discoveryToken,
  results,
  selection,
  source,
  scope = 'default',
}) {
  return writeStoredSearchCacheEntry({
    productQuery,
    details,
    candidatePool,
    discoveryToken,
    results,
    selection,
    source,
    scope,
  })
}
