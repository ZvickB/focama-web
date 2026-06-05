import { DEFAULT_FILTER_CONFIG, getFilteredSearchArtifacts } from './result-filter.js'
import { buildProductDetailsCacheWriteEntry, fetchProductDetailsWithCache } from './product-details-cache.js'
import { buildQuery } from './search-data.js'
import { normalizeOxylabsProduct, normalizeOxylabsSearchResult } from './oxylabs-normalizer.js'
import { getOxylabsDomainFromAmazonDomain } from '../../shared/amazon-marketplaces.js'

export const OXYLABS_ENDPOINT = 'https://realtime.oxylabs.io/v1/queries'
const PRODUCT_DETAILS_FIRST_PASS_TIMEOUT_MS = 10000
const PRODUCT_DETAILS_RETRY_TIMEOUT_MS = 20000

function buildOxylabsAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

async function fetchSingleOxylabsProductDetail({
  asin,
  amazonDomain,
  authorization,
  oxylabsDomain,
  timeoutMs,
}) {
  const apiResponse = await fetch(OXYLABS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
    body: JSON.stringify({
      source: 'amazon_product',
      domain: oxylabsDomain,
      query: asin,
      parse: true,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!apiResponse.ok) {
    throw new Error(`Oxylabs product request failed with status ${apiResponse.status}.`)
  }

  const data = await apiResponse.json()
  const content = data?.results?.[0]?.content
  const normalized = normalizeOxylabsProduct(content || {}, { amazonDomain })

  return {
    asin,
    feature_bullets: Array.isArray(normalized.feature_bullets) ? normalized.feature_bullets : [],
    productDescription: typeof normalized.description === 'string' ? normalized.description : '',
    isPrime: Boolean(normalized.isPrime),
    delivery: normalized.delivery || '',
  }
}

export async function fetchOxylabsArtifacts({
  filterConfig = DEFAULT_FILTER_CONFIG,
  productQuery,
  details = '',
  reasonFallback,
  oxylabsUsername,
  oxylabsPassword,
  amazonDomain = 'amazon.com',
}) {
  if (!oxylabsUsername || !oxylabsPassword) {
    return {
      error: {
        error: 'Oxylabs credentials are missing.',
        statusCode: 500,
      },
      artifacts: null,
    }
  }

  try {
    const searchTerm = buildQuery(productQuery, details)
    const oxylabsDomain = getOxylabsDomainFromAmazonDomain(amazonDomain)
    const apiResponse = await fetch(OXYLABS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildOxylabsAuthHeader(oxylabsUsername, oxylabsPassword),
      },
      body: JSON.stringify({
        source: 'amazon_search',
        domain: oxylabsDomain,
        query: searchTerm,
        parse: true,
        pages: 1,
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!apiResponse.ok) {
      return {
        error: {
          error: 'Oxylabs search request failed.',
          statusCode: 502,
        },
        artifacts: null,
      }
    }

    const data = await apiResponse.json()
    const rawItems = data?.results?.[0]?.content?.results?.organic
    const normalizedItems = (Array.isArray(rawItems) ? rawItems : []).map((item) =>
      normalizeOxylabsSearchResult(item, { amazonDomain }),
    )

  const normalizedPayload = {
    shopping_results: normalizedItems,
    search_information: { shopping_results_state: '' },
    related_searches: [],
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
  } catch {
    return {
      error: {
        error: 'Oxylabs search request failed.',
        statusCode: 502,
      },
      artifacts: null,
    }
  }
}

function detectOxylabsFailureType(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout'
  if (typeof error?.message === 'string' && error.message.includes('failed with status')) return 'http_error'
  return 'unknown'
}

function extractStatusCode(error) {
  if (typeof error?.message !== 'string') return null
  const match = error.message.match(/status (\d+)/)
  return match ? Number(match[1]) : null
}

export async function fetchOxylabsProductDetailsByAsin({
  asins = [],
  oxylabsUsername,
  oxylabsPassword,
  amazonDomain = 'amazon.com',
  readCache = async () => new Map(),
  writeCache = async () => {},
  onAsinFailure = () => {},
  onBackgroundRetryResolved = async () => {},
}) {
  if (!oxylabsUsername || !oxylabsPassword) {
    return new Map()
  }

  const authorization = buildOxylabsAuthHeader(oxylabsUsername, oxylabsPassword)
  const oxylabsDomain = getOxylabsDomainFromAmazonDomain(amazonDomain)

  return fetchProductDetailsWithCache({
    asins,
    source: 'oxylabs',
    readCache,
    writeCache,
    logLabel: 'oxylabs-product-details',
    fetchFreshDetails: async (requestedAsins) => {
      const settledResults = await Promise.allSettled(
        requestedAsins.map((asin) =>
          fetchSingleOxylabsProductDetail({
            asin,
            amazonDomain,
            authorization,
            oxylabsDomain,
            timeoutMs: PRODUCT_DETAILS_FIRST_PASS_TIMEOUT_MS,
          }),
        ),
      )

      const detailsByAsin = new Map()
      const failedAsins = []

      for (let i = 0; i < settledResults.length; i += 1) {
        const settledResult = settledResults[i]

        if (settledResult.status !== 'fulfilled') {
          const failureType = detectOxylabsFailureType(settledResult.reason)
          const statusCode = extractStatusCode(settledResult.reason)
          onAsinFailure(requestedAsins[i], failureType, statusCode)
          failedAsins.push(requestedAsins[i])
          continue
        }

        detailsByAsin.set(settledResult.value.asin, {
          feature_bullets: settledResult.value.feature_bullets,
          productDescription: settledResult.value.productDescription,
          isPrime: Boolean(settledResult.value.isPrime),
          delivery: settledResult.value.delivery || '',
        })
      }

      if (failedAsins.length > 0) {
        Promise.resolve()
          .then(() =>
            Promise.allSettled(
              failedAsins.map((asin) =>
                fetchSingleOxylabsProductDetail({
                  asin,
                  amazonDomain,
                  authorization,
                  oxylabsDomain,
                  timeoutMs: PRODUCT_DETAILS_RETRY_TIMEOUT_MS,
                }),
              ),
            ),
          )
          .then(async (retryResults) => {
            const retryWrites = []
            const retryDetailsByAsin = new Map()

            for (const retryResult of retryResults) {
              if (retryResult.status !== 'fulfilled') {
                continue
              }

              retryDetailsByAsin.set(retryResult.value.asin, {
                feature_bullets: retryResult.value.feature_bullets,
                productDescription: retryResult.value.productDescription,
                isPrime: Boolean(retryResult.value.isPrime),
                delivery: retryResult.value.delivery || '',
              })

              const retryWrite = buildProductDetailsCacheWriteEntry({
                asin: retryResult.value.asin,
                feature_bullets: retryResult.value.feature_bullets,
                productDescription: retryResult.value.productDescription,
                isPrime: Boolean(retryResult.value.isPrime),
                delivery: retryResult.value.delivery || '',
                source: 'oxylabs',
              })

              if (retryWrite) {
                retryWrites.push(retryWrite)
              }
            }

            if (retryWrites.length > 0) {
              await writeCache(retryWrites)
            }

            if (retryDetailsByAsin.size > 0) {
              await onBackgroundRetryResolved(retryDetailsByAsin)
            }
          })
          .catch((error) => {
            const failureType = detectOxylabsFailureType(error)
            const statusCode = extractStatusCode(error)
            const extra = statusCode ? ` (status ${statusCode})` : ''
            console.warn(
              `[oxylabs-product-details] Background retry failed (${failureType})${extra}: ${
                error instanceof Error ? error.message : 'Unknown error'
              }`,
            )
          })
      }

      return detailsByAsin
    },
  })
}
