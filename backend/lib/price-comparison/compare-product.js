import { getEnv } from '../search-data.js'
import { searchWalmartOffers } from './bluecart-client.js'
import { fetchShoppingOfferStores, searchShoppingOffers } from './serpapi-client.js'
import { rankComparisonOffers } from './match-offers.js'

function clean(value) {
  return String(value || '').trim()
}

export function buildComparisonQueries(input) {
  const identifier = input?.matchIdentifier || input?.match_identifier || {}
  const provenance = identifier.provenance || {}
  const codes = ['gtin', 'upc', 'ean']
    .filter((field) => provenance[field] !== 'ai_normalized')
    .map((field) => clean(identifier[field]))
    .filter(Boolean)
  const brandModel = [identifier.brand, identifier.model_number || identifier.modelNumber].map(clean).filter(Boolean).join(' ')
  const normalizedQuery = clean(identifier.comparison_search_query || identifier.comparisonSearchQuery)
  const fallbackTitle = clean(input?.displayTitle || input?.sourceTitle || input?.source_title)
  return [...new Set([...codes, brandModel, normalizedQuery, fallbackTitle].filter(Boolean))]
}

function isEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim())
}

export async function compareProduct(input, deps = {}) {
  const enabled = deps.enabled ?? isEnabled(getEnv('PRICE_COMPARISON_ENABLED'))
  if (!enabled) {
    return { status: 'disabled', query: null, offers: [], accepted: [], rejected: [] }
  }

  const market = String(input?.market || input?.marketplace || '').toUpperCase()
  const currency = String(input?.currency || '').toUpperCase()
  if (market !== 'CA' || currency !== 'CAD') {
    return { status: 'unsupported_market', query: null, offers: [], accepted: [], rejected: [] }
  }

  const query = buildComparisonQueries(input)[0]
  if (!query) {
    return { status: 'missing_identity', query: null, offers: [], accepted: [], rejected: [] }
  }

  const searchShopping = deps.searchShoppingOffers || searchShoppingOffers
  const searchWalmart = deps.searchWalmartOffers || searchWalmartOffers
  const fetchStores = deps.fetchShoppingOfferStores || fetchShoppingOfferStores
  const providerDeps = deps.providerDeps || {}
  const [serpResult, walmartResult] = await Promise.allSettled([
    searchShopping(query, market, providerDeps.serpapi || {}),
    searchWalmart(query, market, providerDeps.bluecart || {}),
  ])

  const serpOffers = serpResult.status === 'fulfilled' ? serpResult.value : []
  const walmartOffers = walmartResult.status === 'fulfilled' ? walmartResult.value : []
  const preliminary = rankComparisonOffers({ ...input, offers: serpOffers, sellerCoverageMode: 'all_sellers' })
  const bestSerpCandidate = preliminary.accepted
    .map((accepted) => serpOffers.find((offer) => offer.provider_offer_id === accepted.provider_offer_id))
    .find((offer) => offer?.immersive_url)

  let expandedSerpOffers = serpOffers
  if (bestSerpCandidate?.immersive_url) {
    try {
      const stores = await fetchStores(bestSerpCandidate.immersive_url, market, providerDeps.serpapi || {})
      if (stores.length) expandedSerpOffers = stores
    } catch {
      // The top-level candidates remain useful for diagnostics when immersive detail fails.
    }
  }

  const ranked = rankComparisonOffers({ ...input, offers: [...expandedSerpOffers, ...walmartOffers] })
  return {
    status: 'complete',
    query,
    ...ranked,
    provider_errors: {
      serpapi: serpResult.status === 'rejected' ? serpResult.reason?.message || 'SerpApi failed' : null,
      bluecart: walmartResult.status === 'rejected' ? walmartResult.reason?.message || 'BlueCart failed' : null,
    },
  }
}
