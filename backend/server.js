import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { DEFAULT_OPENAI_MODEL, selectAiResults } from './lib/ai-selector.js'
import { DEFAULT_FILTER_CONFIG, getFilteredSearchArtifacts } from './lib/result-filter.js'
import {
  SERPAPI_ENDPOINT,
  buildCacheKey,
  buildQuery,
  getEnv,
  readSearchCache,
  validateSearchInput,
} from './lib/search-data.js'

const PORT = Number(process.env.PORT || 8787)
const LIVE_RESULT_FILTER_CONFIG = {
  ...DEFAULT_FILTER_CONFIG,
  candidatePoolSize: 20,
  finalResultLimit: 4,
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  response.end(JSON.stringify(payload))
}

export async function handleCachedSearch(requestUrl, response) {
  const productQuery = requestUrl.searchParams.get('query')?.trim() || ''
  const details = requestUrl.searchParams.get('details')?.trim() || ''
  const { error, isValid, normalizedDetails, normalizedQuery } = validateSearchInput(productQuery, details)

  if (!isValid) {
    sendJson(response, 400, { error })
    return
  }

  const cache = readSearchCache()
  const cacheEntry = cache.entries?.[buildCacheKey(normalizedQuery, normalizedDetails)]

  if (cacheEntry?.results?.length) {
    sendJson(response, 200, {
      results: cacheEntry.results.slice(0, 4),
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

export async function handleLiveSearch(requestUrl, response) {
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

  const productQuery = requestUrl.searchParams.get('query')?.trim() || ''
  const details = requestUrl.searchParams.get('details')?.trim() || ''
  const { error, isValid, normalizedDetails, normalizedQuery } = validateSearchInput(productQuery, details)

  if (!isValid) {
    sendJson(response, 400, { error })
    return
  }

  const searchUrl = new URL(SERPAPI_ENDPOINT)
  searchUrl.searchParams.set('engine', 'google_shopping')
  searchUrl.searchParams.set('q', buildQuery(normalizedQuery, normalizedDetails))
  searchUrl.searchParams.set('api_key', serpApiKey)
  searchUrl.searchParams.set('gl', 'us')
  searchUrl.searchParams.set('hl', 'en')

  try {
    const apiResponse = await fetch(searchUrl)

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text()

      sendJson(response, 502, {
        error: 'SerpApi request failed.',
        details: errorText.slice(0, 300),
      })
      return
    }

    const payload = await apiResponse.json()
    const { candidatePool, results: fallbackResults } = getFilteredSearchArtifacts(payload, {
      productQuery: normalizedQuery,
      details: normalizedDetails,
      candidatePoolSize: LIVE_RESULT_FILTER_CONFIG.candidatePoolSize,
      finalResultLimit: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
      minimumScore: LIVE_RESULT_FILTER_CONFIG.minimumScore,
      diversifyPoolMultiplier: LIVE_RESULT_FILTER_CONFIG.diversifyPoolMultiplier,
      reasonFallback: 'Returned by the live SerpApi search route',
    })

    if (fallbackResults.length === 0) {
      sendJson(response, 404, { error: 'No usable shopping results were returned.' })
      return
    }

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

    sendJson(response, 200, { candidatePool, results, selection })
  } catch (error) {
    sendJson(response, 500, {
      error: 'Unable to reach SerpApi.',
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
      await handleLiveSearch(requestUrl, response)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search/live') {
      await handleLiveSearch(requestUrl, response)
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
