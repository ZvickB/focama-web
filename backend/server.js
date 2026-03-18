import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import {
  SERPAPI_ENDPOINT,
  buildCacheKey,
  buildQuery,
  getEnv,
  getNormalizedResults,
  readSearchCache,
  validateSearchInput,
} from './lib/search-data.js'

const PORT = Number(process.env.PORT || 8787)

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
  const apiKey = getEnv('SERPAPI_API_KEY')

  if (!apiKey) {
    sendJson(response, 500, { error: 'SERPAPI_API_KEY is missing from the root .env file.' })
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
  searchUrl.searchParams.set('api_key', apiKey)
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
    const results = getNormalizedResults(payload, 4, 'Returned by the live SerpApi search route')

    if (results.length === 0) {
      sendJson(response, 404, { error: 'No usable shopping results were returned.' })
      return
    }

    sendJson(response, 200, { results })
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
