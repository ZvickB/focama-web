import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json'
export const SEARCH_CACHE_PATH = resolve(process.cwd(), 'temp-data', 'serpapi-cache.json')
const ENV_PATH = resolve(process.cwd(), '.env')
export const MAX_PRODUCT_QUERY_LENGTH = 80
export const MAX_DETAILS_LENGTH = 280

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

function normalizeInput(value) {
  return value.trim().replace(/\s+/g, ' ')
}

function hasEnoughLetters(value) {
  const letters = value.match(/[a-z]/gi) || []
  return letters.length >= 3
}

function hasWordLikeStructure(value) {
  return /[a-z]{2,}/i.test(value)
}

function looksLikeObviousGibberish(value) {
  const lettersOnly = value.replace(/[^a-z]/gi, '')

  if (lettersOnly.length < 4) {
    return false
  }

  return !/[aeiouy]/i.test(lettersOnly)
}

export function validateSearchInput(productQuery, details = '') {
  const normalizedQuery = normalizeInput(productQuery)
  const normalizedDetails = normalizeInput(details)

  if (!normalizedQuery) {
    return {
      isValid: false,
      error: 'Please enter a product topic first.',
      normalizedQuery,
      normalizedDetails,
    }
  }

  if (normalizedQuery.length > MAX_PRODUCT_QUERY_LENGTH) {
    return {
      isValid: false,
      error: `Keep the product topic under ${MAX_PRODUCT_QUERY_LENGTH} characters.`,
      normalizedQuery,
      normalizedDetails,
    }
  }

  if (normalizedDetails.length > MAX_DETAILS_LENGTH) {
    return {
      isValid: false,
      error: `Keep the extra context under ${MAX_DETAILS_LENGTH} characters.`,
      normalizedQuery,
      normalizedDetails,
    }
  }

  if (!hasEnoughLetters(normalizedQuery) || !hasWordLikeStructure(normalizedQuery)) {
    return {
      isValid: false,
      error: 'Try a real product topic, like "lego", "desk lamp", or "travel stroller".',
      normalizedQuery,
      normalizedDetails,
    }
  }

  if (looksLikeObviousGibberish(normalizedQuery)) {
    return {
      isValid: false,
      error: 'Try a real product topic, like "lego", "desk lamp", or "travel stroller".',
      normalizedQuery,
      normalizedDetails,
    }
  }

  return {
    isValid: true,
    error: '',
    normalizedQuery,
    normalizedDetails,
  }
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
      `Source: ${source}`,
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

export function writeSearchCacheEntry({ productQuery, details, results }) {
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
        results,
      },
    },
  }

  writeFileSync(SEARCH_CACHE_PATH, JSON.stringify(nextCache, null, 2))
}
