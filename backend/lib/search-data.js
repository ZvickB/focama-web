import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
export {
  MAX_DETAILS_LENGTH,
  MAX_PRODUCT_QUERY_LENGTH,
  validateSearchInput,
} from '../../shared/search-input.js'

export const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json'
export const SEARCH_CACHE_PATH = resolve(process.cwd(), 'temp-data', 'serpapi-cache.json')
export const SEARCH_EVALUATION_PATH = resolve(process.cwd(), 'temp-data', 'search-evaluation.json')
const ENV_PATH = resolve(process.cwd(), '.env')

export function readEnvFile() {
  try {
    const envContents = readFileSync(ENV_PATH, 'utf8')
    const pairs = envContents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=')

        if (separatorIndex === -1) {
          return null
        }

        return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()]
      })
      .filter(Boolean)

    return Object.fromEntries(pairs)
  } catch {
    return {}
  }
}

export function getEnv(name) {
  return process.env[name] || readEnvFile()[name]
}

export function buildQuery(productQuery, details) {
  return [productQuery, details].filter(Boolean).join(' ').trim()
}

export function buildCacheKey(productQuery, details) {
  return buildQuery(productQuery, details).toLowerCase()
}

function createFallbackImage(title) {
  const safeTitle = title.replace(/[<>&"]/g, '')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="700">
      <rect width="100%" height="100%" fill="#f5efe4" />
      <text x="50%" y="50%" fill="#475569" font-family="Arial, sans-serif" font-size="42" text-anchor="middle">
        ${safeTitle}
      </text>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function normalizeResult(item, index, reasonFallback) {
  const title = item.title?.trim()

  if (!title) {
    return null
  }

  const numericRating = Number(item.rating ?? 0)
  const numericReviews = Number(item.reviews ?? 0)
  const source = item.source?.trim() || item.store?.trim() || 'Marketplace result'
  const image = item.thumbnail || item.thumbnail_hd || item.serpapi_thumbnail || createFallbackImage(title)
  const description =
    item.snippet?.trim() ||
    item.extensions?.filter(Boolean).join(' - ') ||
    `Live product result returned for "${title}".`

  return {
    id: item.product_id || item.position || `${title}-${index}`,
    title,
    subtitle: source,
    price: item.price || (item.extracted_price ? `$${item.extracted_price}` : 'Price unavailable'),
    rating: Number.isFinite(numericRating) ? numericRating : 0,
    reviewCount: Number.isFinite(numericReviews) ? numericReviews : 0,
    description,
    reasons: [
      `Available from ${source}`,
      item.delivery || item.second_hand_condition || reasonFallback,
      item.extracted_price ? `Listed around $${item.extracted_price}` : 'Price details were limited in the raw result',
    ],
    image,
    link: item.product_link || item.link || '',
  }
}

export function getNormalizedResults(payload, limit, reasonFallback) {
  const shoppingResults = Array.isArray(payload.shopping_results) ? payload.shopping_results : []
  return shoppingResults.map((item, index) => normalizeResult(item, index, reasonFallback)).filter(Boolean).slice(0, limit)
}

export function readSearchCache() {
  if (!existsSync(SEARCH_CACHE_PATH)) {
    return { entries: {} }
  }

  try {
    const cacheContents = readFileSync(SEARCH_CACHE_PATH, 'utf8')
    const parsedCache = JSON.parse(cacheContents)

    if (!parsedCache || typeof parsedCache !== 'object' || !parsedCache.entries) {
      return { entries: {} }
    }

    return parsedCache
  } catch {
    return { entries: {} }
  }
}

export function readSearchEvaluationDataset() {
  if (!existsSync(SEARCH_EVALUATION_PATH)) {
    return {
      temporaryOnly: true,
      purpose: 'Temporary local development dataset for evaluating search quality. Remove or replace later.',
      cases: [],
    }
  }

  try {
    const datasetContents = readFileSync(SEARCH_EVALUATION_PATH, 'utf8')
    const parsedDataset = JSON.parse(datasetContents)

    if (!parsedDataset || typeof parsedDataset !== 'object' || !Array.isArray(parsedDataset.cases)) {
      return {
        temporaryOnly: true,
        purpose: 'Temporary local development dataset for evaluating search quality. Remove or replace later.',
        cases: [],
      }
    }

    return parsedDataset
  } catch {
    return {
      temporaryOnly: true,
      purpose: 'Temporary local development dataset for evaluating search quality. Remove or replace later.',
      cases: [],
    }
  }
}

export function writeSearchCacheEntry({
  productQuery,
  details,
  results,
  candidatePool = null,
  selection = null,
  source = 'local_file_cache',
  expiresAt = null,
}) {
  mkdirSync(resolve(process.cwd(), 'temp-data'), { recursive: true })

  const existingCache = readSearchCache()
  const cacheKey = buildCacheKey(productQuery, details)
  const nextCache = {
    entries: {
      ...(existingCache.entries || {}),
      [cacheKey]: {
        productQuery,
        details,
        cachedAt: new Date().toISOString(),
        candidatePool,
        selection,
        source,
        expiresAt,
        results,
      },
    },
  }

  writeFileSync(SEARCH_CACHE_PATH, JSON.stringify(nextCache, null, 2))
}

export function writeSearchEvaluationCase({ productQuery, details, results, source = 'manual-cache-script' }) {
  mkdirSync(resolve(process.cwd(), 'temp-data'), { recursive: true })

  const normalizedQuery = productQuery.trim()
  const normalizedDetails = details.trim()
  const cacheKey = buildCacheKey(normalizedQuery, normalizedDetails)
  const existingDataset = readSearchEvaluationDataset()
  const filteredCases = existingDataset.cases.filter((entry) => entry.cacheKey !== cacheKey)
  const nextDataset = {
    temporaryOnly: true,
    purpose: 'Temporary local development dataset for evaluating search quality. Remove or replace later.',
    cases: [
      {
        cacheKey,
        productQuery: normalizedQuery,
        details: normalizedDetails,
        capturedAt: new Date().toISOString(),
        source,
        status: 'unreviewed',
        notes: '',
        results,
      },
      ...filteredCases,
    ],
  }

  writeFileSync(SEARCH_EVALUATION_PATH, JSON.stringify(nextDataset, null, 2))
}
