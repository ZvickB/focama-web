import { DEFAULT_FILTER_CONFIG, getFilteredSearchArtifacts } from './result-filter.js'
import { SERPAPI_ENDPOINT, buildCacheKey, buildQuery, validateSearchInput } from './search-data.js'
import { readStoredSearchCacheEntry, recordSearchHistory, writeStoredSearchCacheEntry } from './search-storage.js'

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
  const cachedEntry = await readStoredSearchCacheEntry({
    productQuery,
    details,
    scope,
  })
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
}) {
  const searchUrl = new URL(SERPAPI_ENDPOINT)
  searchUrl.searchParams.set('engine', 'google_shopping')
  searchUrl.searchParams.set('q', buildQuery(productQuery, details))
  searchUrl.searchParams.set('api_key', serpApiKey)
  searchUrl.searchParams.set('gl', 'us')
  searchUrl.searchParams.set('hl', 'en')

  const apiResponse = await fetch(searchUrl)

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text()

    return {
      error: {
        details: errorText.slice(0, 300),
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
  results,
  selection,
  source,
  scope = 'default',
}) {
  return writeStoredSearchCacheEntry({
    productQuery,
    details,
    candidatePool,
    results,
    selection,
    source,
    scope,
  })
}
