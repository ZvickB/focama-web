import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  SERPAPI_ENDPOINT,
  buildQuery,
  getEnv,
} from '../lib/search-data.js'

const FULL_RESPONSE_PATH = resolve(process.cwd(), 'temp-data', 'serp_api_full_response.json')

async function main() {
  const productQuery = process.argv[2] || 'ipad cover'
  const details = process.argv[3] || ''
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

  mkdirSync(resolve(process.cwd(), 'temp-data'), { recursive: true })
  writeFileSync(FULL_RESPONSE_PATH, JSON.stringify(payload, null, 2))

  console.log(`Saved full SerpApi response to ${FULL_RESPONSE_PATH} for "${buildQuery(productQuery, details)}"`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
