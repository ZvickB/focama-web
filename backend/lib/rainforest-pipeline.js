import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchProductDetailsWithCache } from './product-details-cache.js'
import { DEFAULT_FILTER_CONFIG, getFilteredSearchArtifacts } from './result-filter.js'
import { buildQuery } from './search-data.js'
import {
  appendAffiliateTag,
  formatAmazonPrice,
  getAffiliateSupportedAmazonDomainFromCountryCode,
  normalizeAffiliateSupportedAmazonDomain,
} from '../../shared/amazon-marketplaces.js'

const SAMPLES_DIR = join(process.cwd(), 'temp-data', 'rainforest-samples')

function saveRainforestSample(query, payload) {
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${slug}_${timestamp}.json`
  mkdir(SAMPLES_DIR, { recursive: true })
    .then(() => writeFile(join(SAMPLES_DIR, filename), JSON.stringify(payload, null, 2)))
    .catch(() => {}) // fire-and-forget, never block the response
}

export const RAINFOREST_ENDPOINT = 'https://api.rainforestapi.com/request'

export function getAmazonDomain({ countryCode = 'US', amazonDomain = '' } = {}) {
  return normalizeAffiliateSupportedAmazonDomain(amazonDomain) ||
    getAffiliateSupportedAmazonDomainFromCountryCode(countryCode)
}

function getRainforestDeliveryTagline(value) {
  return typeof value?.tagline === 'string' ? value.tagline : ''
}

function hasRainforestPrimeSignal(value) {
  const deliveryTagline = getRainforestDeliveryTagline(value?.delivery)

  return Boolean(
    value?.is_prime ||
    value?.is_prime_eligible ||
    /\bprime\b/i.test(deliveryTagline),
  )
}

function normalizeRainforestItem(item, { amazonDomain = 'amazon.com' } = {}) {
  const numericPrice = Number.isFinite(Number(item.price?.value)) ? Number(item.price.value) : null
  const deliveryTagline = getRainforestDeliveryTagline(item.delivery)
  const isPrime = hasRainforestPrimeSignal(item)

  return {
    product_id: item.asin || null,
    title: item.title || '',
    extracted_price: numericPrice,
    price: item.price?.raw || (numericPrice !== null ? formatAmazonPrice(numericPrice, amazonDomain) : null),
    rating: item.rating ?? null,
    reviews: item.ratings_total ?? null,
    thumbnail: item.image || null,
    product_link: appendAffiliateTag(item.link || '', amazonDomain),
    snippet: item.description || item.brand || '',
    extensions: [],
    multiple_sources: false,
    isPrime,
    delivery: deliveryTagline || (isPrime ? 'Prime delivery' : ''),
    tag: '',
    source: '',
    store: 'Amazon',
    position: item.position || null,
  }
}

function normalizeRainforestFeatureBullets(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  return []
}

function normalizeRainforestDescription(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeRainforestProductDetailPayload(payload, fallbackAsin) {
  const product = payload?.product && typeof payload.product === 'object'
    ? payload.product
    : payload?.product_results && typeof payload.product_results === 'object'
      ? payload.product_results
      : payload?.results?.[0]?.product && typeof payload.results[0].product === 'object'
        ? payload.results[0].product
        : payload

  const isPrime = hasRainforestPrimeSignal(product)
  const deliveryTagline = getRainforestDeliveryTagline(product?.delivery)

  return {
    asin: typeof product?.asin === 'string' && product.asin.trim() ? product.asin.trim() : fallbackAsin,
    feature_bullets: normalizeRainforestFeatureBullets(
      product?.feature_bullets ??
      product?.bullet_points ??
      product?.bullets ??
      product?.highlights,
    ),
    productDescription: normalizeRainforestDescription(
      product?.description ??
      product?.product_description ??
      product?.overview,
    ),
    isPrime,
    delivery: deliveryTagline || (isPrime ? 'Prime delivery' : ''),
  }
}

export async function fetchRainforestArtifacts({
  filterConfig = DEFAULT_FILTER_CONFIG,
  productQuery,
  details = '',
  reasonFallback,
  rainforestApiKey,
  countryCode = 'US',
  amazonDomain = '',
}) {
  const resolvedAmazonDomain = getAmazonDomain({ countryCode, amazonDomain })
  const searchUrl = new URL(RAINFOREST_ENDPOINT)
  searchUrl.searchParams.set('api_key', rainforestApiKey)
  searchUrl.searchParams.set('type', 'search')
  searchUrl.searchParams.set('search_term', buildQuery(productQuery, details))
  searchUrl.searchParams.set('amazon_domain', resolvedAmazonDomain)

  const apiResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) })

  if (!apiResponse.ok) {
    return {
      error: {
        error: 'Rainforest API request failed.',
        providerStatusCode: apiResponse.status,
        statusCode: 502,
      },
      artifacts: null,
    }
  }

  const payload = await apiResponse.json()
  saveRainforestSample(buildQuery(productQuery, details), payload)
  const rawItems = Array.isArray(payload.search_results) ? payload.search_results : []
  const normalizedItems = rawItems.map((item) =>
    normalizeRainforestItem(item, { amazonDomain: resolvedAmazonDomain }),
  )

  const normalizedPayload = {
    shopping_results: normalizedItems,
    search_information: { shopping_results_state: '' },
    related_searches: Array.isArray(payload.related_searches) ? payload.related_searches : [],
  }

  const artifacts = getFilteredSearchArtifacts(normalizedPayload, {
    productQuery,
    details,
    candidatePoolSize: filterConfig.candidatePoolSize,
    finalResultLimit: filterConfig.finalResultLimit,
    minimumScore: filterConfig.minimumScore,
    diversifyPoolMultiplier: filterConfig.diversifyPoolMultiplier,
    diversifyBySource: false,
    skipHardFilter: true,
    reasonFallback,
  })

  if (artifacts.results.length === 0) {
    return {
      error: {
        error: 'No usable Amazon results were returned.',
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

export async function fetchRainforestProductDetailsByAsin({
  asins = [],
  rainforestApiKey,
  countryCode = 'US',
  amazonDomain = '',
  readCache = async () => new Map(),
  writeCache = async () => {},
}) {
  if (!rainforestApiKey) {
    return new Map()
  }

  const resolvedAmazonDomain = getAmazonDomain({ countryCode, amazonDomain })

  return fetchProductDetailsWithCache({
    asins,
    source: 'rainforest',
    readCache,
    writeCache,
    logLabel: 'rainforest-product-details',
    fetchFreshDetails: async (requestedAsins) => {
      const settledResults = await Promise.allSettled(
        requestedAsins.map(async (asin) => {
          const productUrl = new URL(RAINFOREST_ENDPOINT)
          productUrl.searchParams.set('type', 'product')
          productUrl.searchParams.set('asin', asin)
          productUrl.searchParams.set('amazon_domain', resolvedAmazonDomain)
          productUrl.searchParams.set('api_key', rainforestApiKey)

          const apiResponse = await fetch(productUrl, {
            signal: AbortSignal.timeout(10000),
          })

          if (!apiResponse.ok) {
            throw new Error(`Rainforest product request failed with status ${apiResponse.status}.`)
          }

          const payload = await apiResponse.json()
          const normalized = normalizeRainforestProductDetailPayload(payload, asin)

          return {
            asin: normalized.asin,
            feature_bullets: normalized.feature_bullets,
            productDescription: normalized.productDescription,
            isPrime: Boolean(normalized.isPrime),
            delivery: normalized.delivery || '',
          }
        }),
      )

      const detailsByAsin = new Map()

      for (const settledResult of settledResults) {
        if (settledResult.status !== 'fulfilled') {
          continue
        }

        detailsByAsin.set(settledResult.value.asin, {
          feature_bullets: settledResult.value.feature_bullets,
          productDescription: settledResult.value.productDescription,
          isPrime: Boolean(settledResult.value.isPrime),
          delivery: settledResult.value.delivery || '',
        })
      }

      return detailsByAsin
    },
  })
}
