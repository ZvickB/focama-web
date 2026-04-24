import { DEFAULT_FILTER_CONFIG, getFilteredSearchArtifacts } from './result-filter.js'
import { fetchProductDetailsWithCache } from './product-details-cache.js'
import { buildQuery } from './search-data.js'
import { normalizeOxylabsProduct, normalizeOxylabsSearchResult } from './oxylabs-normalizer.js'
import { getOxylabsDomainFromAmazonDomain } from '../../shared/amazon-marketplaces.js'

export const OXYLABS_ENDPOINT = 'https://realtime.oxylabs.io/v1/queries'

function buildOxylabsAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
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

export async function fetchOxylabsProductDetailsByAsin({
  asins = [],
  oxylabsUsername,
  oxylabsPassword,
  amazonDomain = 'amazon.com',
  readCache = async () => new Map(),
  writeCache = async () => {},
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
        requestedAsins.map(async (asin) => {
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
            signal: AbortSignal.timeout(10000),
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
        })
      }

      return detailsByAsin
    },
  })
}
