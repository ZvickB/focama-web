import { DEFAULT_FILTER_CONFIG, getFilteredSearchArtifacts } from './result-filter.js'
import { buildQuery } from './search-data.js'

export const RAINFOREST_ENDPOINT = 'https://api.rainforestapi.com/request'

function normalizeRainforestItem(item) {
  return {
    product_id: item.asin || null,
    title: item.title || '',
    extracted_price: item.price?.value ?? null,
    price: item.price?.raw || (item.price?.value ? `$${item.price.value}` : null),
    rating: item.rating ?? null,
    reviews: item.ratings_total ?? null,
    thumbnail: item.image || null,
    product_link: item.link || '',
    snippet: item.description || item.brand || '',
    extensions: [],
    multiple_sources: false,
    delivery: item.delivery?.tagline || (item.is_prime ? 'Prime delivery' : ''),
    tag: '',
    source: '',
    store: 'Amazon',
    position: item.position || null,
  }
}

export async function fetchRainforestArtifacts({
  filterConfig = DEFAULT_FILTER_CONFIG,
  productQuery,
  details = '',
  reasonFallback,
  rainforestApiKey,
}) {
  const searchUrl = new URL(RAINFOREST_ENDPOINT)
  searchUrl.searchParams.set('api_key', rainforestApiKey)
  searchUrl.searchParams.set('type', 'search')
  searchUrl.searchParams.set('search_term', buildQuery(productQuery, details))
  searchUrl.searchParams.set('amazon_domain', 'amazon.com')

  const apiResponse = await fetch(searchUrl)

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text()

    return {
      error: {
        details: errorText.slice(0, 300),
        error: 'Rainforest API request failed.',
        statusCode: 502,
      },
      artifacts: null,
    }
  }

  const payload = await apiResponse.json()
  const rawItems = Array.isArray(payload.search_results) ? payload.search_results : []
  const normalizedItems = rawItems.map(normalizeRainforestItem)

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
