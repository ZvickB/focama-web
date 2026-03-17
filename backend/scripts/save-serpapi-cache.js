import {
  SERPAPI_ENDPOINT,
  buildQuery,
  getEnv,
  getNormalizedResults,
  writeSearchCacheEntry,
} from '../lib/search-data.js'

async function main() {
  const productQuery = process.argv[2] || 'lego'
  const details = process.argv[3] || 'For a 9 year old boy who enjoys imagination and building stories.'
  const apiKey = getEnv('SERPAPI_API_KEY')

  if (!apiKey) {
    throw new Error('SERPAPI_API_KEY is missing from the root .env file.')
  }

  const searchUrl = new URL(SERPAPI_ENDPOINT)
  searchUrl.searchParams.set('engine', 'google_shopping')
  searchUrl.searchParams.set('q', buildQuery(productQuery, details))
  searchUrl.searchParams.set('api_key', apiKey)
  searchUrl.searchParams.set('gl', 'us')
  searchUrl.searchParams.set('hl', 'en')

  const response = await fetch(searchUrl)

  if (!response.ok) {
    throw new Error(`SerpApi request failed with status ${response.status}.`)
  }

  const payload = await response.json()
  const results = getNormalizedResults(payload, 6, 'Returned by the saved SerpApi test cache')

  if (results.length === 0) {
    throw new Error('No usable SerpApi results were returned.')
  }

  writeSearchCacheEntry({ productQuery, details, results })
  console.log(`Saved ${results.length} cached results for "${buildQuery(productQuery, details)}"`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
