import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { DEFAULT_OPENAI_MODEL, selectAiResults } from './lib/ai-selector.js'
import { DEFAULT_RATE_LIMIT_CONFIG, getClientIpAddress, takeRateLimitToken } from './lib/rate-limit.js'
import { generateRefinementPrompt } from './lib/refinement-assistant.js'
import { DEFAULT_FILTER_CONFIG, getFilteredSearchArtifacts } from './lib/result-filter.js'
import {
  getSupabaseHealth,
  isSupabaseConfigured,
  readStoredSearchCacheEntry,
  recordSearchHistory,
  writeStoredSearchCacheEntry,
} from './lib/search-storage.js'
import {
  SERPAPI_ENDPOINT,
  buildCacheKey,
  buildQuery,
  getEnv,
  validateSearchInput,
} from './lib/search-data.js'

const PORT = Number(process.env.PORT || 8787)
const LIVE_RESULT_FILTER_CONFIG = {
  ...DEFAULT_FILTER_CONFIG,
  candidatePoolSize: 20,
  finalResultLimit: 6,
}
const LIVE_SEARCH_RATE_LIMIT = {
  ...DEFAULT_RATE_LIMIT_CONFIG,
}
const FINALIZE_SELECTION_RATE_LIMIT = {
  ...DEFAULT_RATE_LIMIT_CONFIG,
}
const FINALIZE_BODY_LIMIT_BYTES = 32 * 1024
const FINALIZE_MAX_CANDIDATES = LIVE_RESULT_FILTER_CONFIG.candidatePoolSize
const FINALIZE_MAX_NOTE_LENGTH = 500
const FINALIZE_MAX_PRIORITIES = 8
const FINALIZE_MAX_PRIORITY_LENGTH = 80

function ensureBadges(results = []) {
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
    badgeReason: index === 0 ? 'Top overall fit for this shortlist.' : '',
  }))
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  response.end(JSON.stringify(payload))
}

function readRequestBody(request, { maxBytes = Infinity } = {}) {
  return new Promise((resolve, reject) => {
    let body = ''
    let byteLength = 0
    let aborted = false

    request.on('data', (chunk) => {
      if (aborted) {
        return
      }

      const chunkText = typeof chunk === 'string' ? chunk : String(chunk)
      byteLength += Buffer.byteLength(chunkText)

      if (byteLength > maxBytes) {
        aborted = true
        reject(new Error('Request body is too large.'))
        return
      }

      body += chunkText
    })

    request.on('end', () => {
      if (aborted) {
        return
      }

      resolve(body)
    })

    request.on('error', reject)
  })
}

async function readJsonBody(request, options) {
  const rawBody = await readRequestBody(request, options)

  if (!rawBody.trim()) {
    return {}
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

function truncateText(value, maxLength) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''

  if (!normalizedValue) {
    return ''
  }

  return normalizedValue.slice(0, maxLength)
}

function sanitizeStringList(values, { maxItems, maxItemLength }) {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .map((value) => truncateText(value, maxItemLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function sanitizeFinalizeCandidate(candidate, index) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {
      error: `Candidate ${index + 1} must be an object.`,
      isValid: false,
    }
  }

  const id = truncateText(candidate.id, 200)
  const title = truncateText(candidate.title, 300)

  if (!id || !title) {
    return {
      error: `Candidate ${index + 1} must include non-empty id and title fields.`,
      isValid: false,
    }
  }

  const numericPrice =
    candidate.numericPrice === null || candidate.numericPrice === undefined
      ? null
      : Number.isFinite(Number(candidate.numericPrice))
        ? Number(candidate.numericPrice)
        : null
  const rating =
    candidate.rating === null || candidate.rating === undefined
      ? null
      : Number.isFinite(Number(candidate.rating))
        ? Number(candidate.rating)
        : null
  const reviewCount =
    candidate.reviewCount === null || candidate.reviewCount === undefined
      ? null
      : Number.isFinite(Number(candidate.reviewCount))
        ? Number(candidate.reviewCount)
        : null

  return {
    isValid: true,
    candidate: {
      id,
      score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : 0,
      title,
      description: truncateText(candidate.description, 1200),
      source: truncateText(candidate.source, 160),
      price: truncateText(candidate.price, 80),
      numericPrice,
      rating,
      reviewCount,
      delivery: truncateText(candidate.delivery, 160),
      tag: truncateText(candidate.tag, 120),
      extensions: sanitizeStringList(candidate.extensions, { maxItems: 6, maxItemLength: 120 }),
      multipleSources: Boolean(candidate.multipleSources),
      link: truncateText(candidate.link, 1000),
      image: truncateText(candidate.image, 1000),
      reasons: sanitizeStringList(candidate.reasons, { maxItems: 5, maxItemLength: 240 }),
      matchSignals:
        candidate.matchSignals && typeof candidate.matchSignals === 'object' && !Array.isArray(candidate.matchSignals)
          ? {
              titleMatches: Number.isFinite(Number(candidate.matchSignals.titleMatches))
                ? Number(candidate.matchSignals.titleMatches)
                : 0,
              supportMatches: Number.isFinite(Number(candidate.matchSignals.supportMatches))
                ? Number(candidate.matchSignals.supportMatches)
                : 0,
              detailMatches: Number.isFinite(Number(candidate.matchSignals.detailMatches))
                ? Number(candidate.matchSignals.detailMatches)
                : 0,
              exactMatchSearchState: Boolean(candidate.matchSignals.exactMatchSearchState),
              hasMultipleSources: Boolean(candidate.matchSignals.hasMultipleSources),
              hasDeliveryInfo: Boolean(candidate.matchSignals.hasDeliveryInfo),
              hasTag: Boolean(candidate.matchSignals.hasTag),
            }
          : {
              titleMatches: 0,
              supportMatches: 0,
              detailMatches: 0,
              exactMatchSearchState: false,
              hasMultipleSources: false,
              hasDeliveryInfo: false,
              hasTag: false,
            },
    },
  }
}

function sanitizeFinalizeCandidatePool(candidatePool) {
  if (!candidatePool || typeof candidatePool !== 'object' || Array.isArray(candidatePool)) {
    return {
      error: 'A candidate pool is required to finalize the search.',
      isValid: false,
    }
  }

  if (!Array.isArray(candidatePool.candidates)) {
    return {
      error: 'A candidate pool with a candidates array is required to finalize the search.',
      isValid: false,
    }
  }

  if (candidatePool.candidates.length === 0) {
    return {
      error: 'Candidate pool must include at least one candidate.',
      isValid: false,
    }
  }

  const candidates = []

  for (const [index, candidate] of candidatePool.candidates.slice(0, FINALIZE_MAX_CANDIDATES).entries()) {
    const sanitized = sanitizeFinalizeCandidate(candidate, index)

    if (!sanitized.isValid) {
      return sanitized
    }

    candidates.push(sanitized.candidate)
  }

  return {
    isValid: true,
    candidatePool: {
      query: truncateText(candidatePool.query, 200),
      details: truncateText(candidatePool.details, 500),
      combinedSearchText: truncateText(candidatePool.combinedSearchText, 400),
      searchState: truncateText(candidatePool.searchState, 200),
      similarQueries: sanitizeStringList(candidatePool.similarQueries, { maxItems: 8, maxItemLength: 120 }),
      candidates,
    },
  }
}

function getValidatedSearchInput(productQuery, details = '') {
  const { error, isValid, normalizedDetails, normalizedQuery } = validateSearchInput(productQuery, details)

  if (!isValid) {
    return {
      error,
      isValid,
    }
  }

  return {
    isValid,
    normalizedDetails,
    normalizedQuery,
  }
}

async function fetchCandidatePool({ productQuery, details = '', serpApiKey, response }) {
  const searchUrl = new URL(SERPAPI_ENDPOINT)
  searchUrl.searchParams.set('engine', 'google_shopping')
  searchUrl.searchParams.set('q', buildQuery(productQuery, details))
  searchUrl.searchParams.set('api_key', serpApiKey)
  searchUrl.searchParams.set('gl', 'us')
  searchUrl.searchParams.set('hl', 'en')

  const apiResponse = await fetch(searchUrl)

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text()

    sendJson(response, 502, {
      error: 'SerpApi request failed.',
      details: errorText.slice(0, 300),
    })
    return null
  }

  const payload = await apiResponse.json()
  const artifacts = getFilteredSearchArtifacts(payload, {
    productQuery,
    details,
    candidatePoolSize: LIVE_RESULT_FILTER_CONFIG.candidatePoolSize,
    finalResultLimit: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
    minimumScore: LIVE_RESULT_FILTER_CONFIG.minimumScore,
    diversifyPoolMultiplier: LIVE_RESULT_FILTER_CONFIG.diversifyPoolMultiplier,
    reasonFallback: 'Returned by the live SerpApi search route',
  })

  if (artifacts.results.length === 0) {
    sendJson(response, 404, { error: 'No usable shopping results were returned.' })
    return null
  }

  return artifacts
}

export async function handleCachedSearch(requestUrl, response) {
  const productQuery = requestUrl.searchParams.get('query')?.trim() || ''
  const details = requestUrl.searchParams.get('details')?.trim() || ''
  const { error, isValid, normalizedDetails, normalizedQuery } = validateSearchInput(productQuery, details)

  if (!isValid) {
    sendJson(response, 400, { error })
    return
  }

  const cacheEntry = await readStoredSearchCacheEntry({
    productQuery: normalizedQuery,
    details: normalizedDetails,
  })

  if (cacheEntry?.results?.length) {
    const normalizedCachedResults = ensureBadges(cacheEntry.results)
    sendJson(response, 200, {
      results: normalizedCachedResults.slice(0, LIVE_RESULT_FILTER_CONFIG.finalResultLimit),
      source: 'cache',
      cachedAt: cacheEntry.cachedAt,
    })
    return
  }

  sendJson(response, 404, {
    error: 'No cached test results exist for this search yet.',
    details: 'Run the cache script first to save a temporary 6-item SerpApi sample for this query.',
  })
}

export async function handleLiveSearch(requestUrl, response, request = { headers: {} }) {
  const serpApiKey = getEnv('SERPAPI_API_KEY')
  const openAiApiKey = getEnv('OPENAI_API_KEY')

  if (!serpApiKey) {
    sendJson(response, 500, { error: 'SERPAPI_API_KEY is missing from the root .env file.' })
    return
  }

  if (!openAiApiKey) {
    sendJson(response, 500, { error: 'OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const rateLimit = takeRateLimitToken(clientIpAddress, LIVE_SEARCH_RATE_LIMIT)

  if (!rateLimit.allowed) {
    sendJson(response, 429, {
      error: 'Too many searches from this connection. Please wait a minute and try again.',
    })
    return
  }

  const productQuery = requestUrl.searchParams.get('query')?.trim() || ''
  const details = requestUrl.searchParams.get('details')?.trim() || ''
  const { error, isValid, normalizedDetails, normalizedQuery } = getValidatedSearchInput(productQuery, details)

  if (!isValid) {
    sendJson(response, 400, { error })
    return
  }

  const cacheKey = buildCacheKey(normalizedQuery, normalizedDetails)

  const cachedEntry = await readStoredSearchCacheEntry({
    productQuery: normalizedQuery,
    details: normalizedDetails,
  })

  if (cachedEntry?.results?.length) {
    const normalizedCachedResults = ensureBadges(cachedEntry.results)
    const cachedSelection = cachedEntry.selection || {
      mode: 'cache',
      model: null,
      selectedCandidateIds: normalizedCachedResults.map((item) => item.id),
      details: 'Cached search results were returned.',
    }

    await recordSearchHistory({
      cacheKey,
      cacheStatus: 'hit',
      candidateCount: Array.isArray(cachedEntry.candidatePool?.candidates)
        ? cachedEntry.candidatePool.candidates.length
        : normalizedCachedResults.length,
      details: normalizedDetails,
      productQuery: normalizedQuery,
      resultCount: normalizedCachedResults.length,
      selectionMode: cachedSelection.mode,
      source: cachedEntry.source || 'cache',
    })

    sendJson(response, 200, {
      candidatePool:
        cachedEntry.candidatePool ||
        {
          query: normalizedQuery,
          details: normalizedDetails,
          combinedSearchText: buildQuery(normalizedQuery, normalizedDetails),
          searchState: 'Cached search results',
          similarQueries: [],
          candidates: [],
        },
      results: normalizedCachedResults,
      selection: cachedSelection,
      source: 'cache',
      cachedAt: cachedEntry.cachedAt,
    })
    return
  }

  try {
    const artifacts = await fetchCandidatePool({
      productQuery: normalizedQuery,
      details: normalizedDetails,
      serpApiKey,
      response,
    })

    if (!artifacts) {
      return
    }

    const { candidatePool, results: fallbackResults } = artifacts

    let results = fallbackResults
    let selection = {
      mode: 'rules_fallback',
      model: null,
      selectedCandidateIds: fallbackResults.map((item) => item.id),
      details: 'Rules-based fallback was used.',
    }

    try {
      const aiSelection = await selectAiResults({
        candidatePool,
        finalResultLimit: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
        apiKey: openAiApiKey,
        model: getEnv('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL,
      })

      if (aiSelection.results.length > 0) {
        results = aiSelection.results
        selection = {
          mode: 'ai',
          model: aiSelection.model,
          selectedCandidateIds: aiSelection.selectedCandidateIds,
          details: 'AI selected the final recommendations from the cleaned candidate pool.',
        }
      }
    } catch (error) {
      selection = {
        ...selection,
        details: error instanceof Error ? error.message : 'AI selection failed; using fallback results.',
      }
    }

    await writeStoredSearchCacheEntry({
      productQuery: normalizedQuery,
      details: normalizedDetails,
      candidatePool,
      results,
      selection,
      source: 'live_search',
    })

    await recordSearchHistory({
      cacheKey,
      cacheStatus: 'miss',
      candidateCount: Array.isArray(candidatePool?.candidates) ? candidatePool.candidates.length : 0,
      details: normalizedDetails,
      productQuery: normalizedQuery,
      resultCount: results.length,
      selectionMode: selection.mode,
      source: 'live_search',
    })

    sendJson(response, 200, {
      candidatePool,
      results,
      selection,
    })
  } catch (error) {
    sendJson(response, 500, {
      error: 'Unable to reach SerpApi.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export async function handleDiscoverySearch(requestUrl, response, request = { headers: {} }) {
  const serpApiKey = getEnv('SERPAPI_API_KEY')

  if (!serpApiKey) {
    sendJson(response, 500, { error: 'SERPAPI_API_KEY is missing from the root .env file.' })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const rateLimit = takeRateLimitToken(clientIpAddress, LIVE_SEARCH_RATE_LIMIT)

  if (!rateLimit.allowed) {
    sendJson(response, 429, {
      error: 'Too many searches from this connection. Please wait a minute and try again.',
    })
    return
  }

  const productQuery = requestUrl.searchParams.get('query')?.trim() || ''
  const { error, isValid, normalizedQuery } = getValidatedSearchInput(productQuery)

  if (!isValid) {
    sendJson(response, 400, { error })
    return
  }

  const normalizedDetails = ''
  const cacheKey = buildCacheKey(normalizedQuery, normalizedDetails)
  const cachedEntry = await readStoredSearchCacheEntry({
    productQuery: normalizedQuery,
    details: normalizedDetails,
  })

  if (cachedEntry?.candidatePool && cachedEntry?.results?.length) {
    const normalizedCachedResults = ensureBadges(cachedEntry.results)

    await recordSearchHistory({
      cacheKey,
      cacheStatus: 'hit',
      candidateCount: Array.isArray(cachedEntry.candidatePool?.candidates)
        ? cachedEntry.candidatePool.candidates.length
        : normalizedCachedResults.length,
      details: normalizedDetails,
      productQuery: normalizedQuery,
      resultCount: normalizedCachedResults.length,
      selectionMode: cachedEntry.selection?.mode || 'discovery_cache',
      source: cachedEntry.source || 'cache',
    })

    sendJson(response, 200, {
      candidatePool: cachedEntry.candidatePool,
      previewResults: normalizedCachedResults,
      source: 'cache',
      cachedAt: cachedEntry.cachedAt,
    })
    return
  }

  try {
    const artifacts = await fetchCandidatePool({
      productQuery: normalizedQuery,
      details: normalizedDetails,
      serpApiKey,
      response,
    })

    if (!artifacts) {
      return
    }

    await writeStoredSearchCacheEntry({
      productQuery: normalizedQuery,
      details: normalizedDetails,
      candidatePool: artifacts.candidatePool,
      results: artifacts.results,
      selection: {
        mode: 'discovery_preview',
        model: null,
        selectedCandidateIds: artifacts.results.map((item) => item.id),
        details: 'Discovery preview results were cached for the guided search flow.',
      },
      source: 'guided_discovery',
    })

    await recordSearchHistory({
      cacheKey,
      cacheStatus: 'miss',
      candidateCount: Array.isArray(artifacts.candidatePool?.candidates)
        ? artifacts.candidatePool.candidates.length
        : 0,
      details: normalizedDetails,
      productQuery: normalizedQuery,
      resultCount: artifacts.results.length,
      selectionMode: 'discovery_preview',
      source: 'guided_discovery',
    })

    sendJson(response, 200, {
      candidatePool: artifacts.candidatePool,
      previewResults: artifacts.results,
    })
  } catch (error) {
    sendJson(response, 500, {
      error: 'Unable to reach SerpApi.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export async function handleRefinementPrompt(requestUrl, response) {
  const openAiApiKey = getEnv('OPENAI_API_KEY')
  const productQuery = requestUrl.searchParams.get('query')?.trim() || ''
  const { error, isValid, normalizedQuery } = getValidatedSearchInput(productQuery)

  if (!isValid) {
    sendJson(response, 400, { error })
    return
  }

  if (!openAiApiKey) {
    sendJson(response, 500, { error: 'OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  try {
    const refinementPrompt = await generateRefinementPrompt({
      productQuery: normalizedQuery,
      apiKey: openAiApiKey,
      model: getEnv('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL,
    })

    sendJson(response, 200, refinementPrompt)
  } catch (error) {
    sendJson(response, 500, {
      error: 'Unable to generate the refinement prompt.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export async function handleSupabaseHealth(response) {
  const health = await getSupabaseHealth()

  if (!health.configured) {
    sendJson(response, 500, {
      error: 'Supabase is not configured.',
      details: 'Add SUPABASE_URL and SUPABASE_SECRET_KEY or the legacy SUPABASE_SERVICE_ROLE_KEY.',
    })
    return
  }

  sendJson(response, health.ok ? 200 : 500, health)
}

export async function handleSearchDebug(requestUrl, response) {
  const productQuery = requestUrl.searchParams.get('query')?.trim() || ''
  const details = requestUrl.searchParams.get('details')?.trim() || ''
  const { error, isValid, normalizedDetails, normalizedQuery } = getValidatedSearchInput(productQuery, details)

  if (!isValid) {
    sendJson(response, 400, { error })
    return
  }

  const cacheKey = buildCacheKey(normalizedQuery, normalizedDetails)
  const cachedEntry = await readStoredSearchCacheEntry({
    productQuery: normalizedQuery,
    details: normalizedDetails,
  })
  const normalizedCachedResults = ensureBadges(cachedEntry?.results || [])
  const hasResults = normalizedCachedResults.length > 0
  const hasCandidatePool = Boolean(cachedEntry?.candidatePool?.candidates)
  const guidedDiscoveryUsesCache = normalizedDetails === '' && hasCandidatePool && hasResults
  const liveSearchUsesCache = hasResults

  sendJson(response, 200, {
    query: normalizedQuery,
    details: normalizedDetails,
    cacheKey,
    cache: {
      hasEntry: Boolean(cachedEntry),
      source: cachedEntry?.source || null,
      cachedAt: cachedEntry?.cachedAt || null,
      expiresAt: cachedEntry?.expiresAt || null,
      candidateCount: Array.isArray(cachedEntry?.candidatePool?.candidates)
        ? cachedEntry.candidatePool.candidates.length
        : 0,
      resultCount: normalizedCachedResults.length,
      selectionMode: cachedEntry?.selection?.mode || null,
    },
    environment: {
      serpApiConfigured: Boolean(getEnv('SERPAPI_API_KEY')),
      openAiConfigured: Boolean(getEnv('OPENAI_API_KEY')),
      supabaseConfigured: isSupabaseConfigured(),
    },
    flowBehavior: {
      guidedDiscovery: {
        usesCache: guidedDiscoveryUsesCache,
        callsSerpApi: !guidedDiscoveryUsesCache,
        callsOpenAi: false,
      },
      liveSearch: {
        usesCache: liveSearchUsesCache,
        callsSerpApi: !liveSearchUsesCache,
        callsOpenAi: !liveSearchUsesCache,
      },
    },
  })
}

export async function handleFinalizeSelection(request, response) {
  const openAiApiKey = getEnv('OPENAI_API_KEY')

  if (!openAiApiKey) {
    sendJson(response, 500, { error: 'OPENAI_API_KEY is missing from the root .env file.' })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const rateLimit = takeRateLimitToken(clientIpAddress, FINALIZE_SELECTION_RATE_LIMIT)

  if (!rateLimit.allowed) {
    sendJson(response, 429, {
      error: 'Too many finalize requests from this connection. Please wait a minute and try again.',
    })
    return
  }

  let body

  try {
    body = await readJsonBody(request, { maxBytes: FINALIZE_BODY_LIMIT_BYTES })
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request body.' })
    return
  }

  const sanitizedCandidatePool = sanitizeFinalizeCandidatePool(body?.candidatePool)

  if (!sanitizedCandidatePool.isValid) {
    sendJson(response, 400, { error: sanitizedCandidatePool.error })
    return
  }

  const candidatePool = sanitizedCandidatePool.candidatePool
  const priorities = sanitizeStringList(body?.priorities, {
    maxItems: FINALIZE_MAX_PRIORITIES,
    maxItemLength: FINALIZE_MAX_PRIORITY_LENGTH,
  })
  const followUpNotes = truncateText(body?.followUpNotes, FINALIZE_MAX_NOTE_LENGTH)
  const detailParts = []

  if (priorities.length > 0) {
    detailParts.push(`Priorities: ${priorities.join(', ')}`)
  }

  if (followUpNotes) {
    detailParts.push(`Notes: ${followUpNotes}`)
  }

  const refinedDetails = detailParts.join('. ')

  const nextCandidatePool = {
    ...candidatePool,
    details: refinedDetails,
  }

  try {
    const aiSelection = await selectAiResults({
      candidatePool: nextCandidatePool,
      finalResultLimit: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
      apiKey: openAiApiKey,
      model: getEnv('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL,
    })

    const fallbackResults = candidatePool.candidates
      .slice(0, LIVE_RESULT_FILTER_CONFIG.finalResultLimit)
      .map((candidate, index) => ({
        id: candidate.id,
        title: candidate.title,
        subtitle: candidate.source,
        price: candidate.price,
        rating: candidate.rating,
        reviewCount: candidate.reviewCount,
        description: candidate.description,
        reasons: candidate.reasons,
        image: candidate.image,
        link: candidate.link,
        badgeLabel: index === 0 ? 'Best match' : '',
        badgeReason: index === 0 ? 'Top overall fit from the refined product pool.' : '',
      }))

    const results = aiSelection.results.length > 0 ? aiSelection.results : fallbackResults

    sendJson(response, 200, {
      candidatePool: nextCandidatePool,
      results,
      selection: {
        mode: aiSelection.results.length > 0 ? 'ai' : 'rules_fallback',
        model: aiSelection.results.length > 0 ? aiSelection.model : null,
        selectedCandidateIds:
          aiSelection.results.length > 0
            ? aiSelection.selectedCandidateIds
            : fallbackResults.map((item) => item.id),
        details:
          aiSelection.results.length > 0
            ? 'AI selected the final recommendations from the cleaned candidate pool.'
            : 'Rules-based fallback was used.',
      },
    })
  } catch (error) {
    sendJson(response, 500, {
      error: 'Unable to finalize the product selection.',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export function createApiServer() {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      response.end()
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search') {
      await handleLiveSearch(requestUrl, response, request)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/discover') {
      await handleDiscoverySearch(requestUrl, response, request)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/refine') {
      await handleRefinementPrompt(requestUrl, response)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/health/supabase') {
      await handleSupabaseHealth(response)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/debug') {
      await handleSearchDebug(requestUrl, response)
      return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/search/finalize') {
      await handleFinalizeSelection(request, response)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/live') {
      await handleLiveSearch(requestUrl, response, request)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/cache') {
      await handleCachedSearch(requestUrl, response)
      return
    }

    sendJson(response, 404, { error: 'Not found.' })
  })
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  const server = createApiServer()

  server.listen(PORT, () => {
    console.log(`API server listening on http://127.0.0.1:${PORT}`)
  })
}
