import { getEnv } from '../search-data.js'

export const BLUECART_ENDPOINT = 'https://api.bluecartapi.com/request'
const DEFAULT_TIMEOUT_MS = 15000

function requireApiKey(apiKey) {
  if (!apiKey) {
    throw new Error('BLUECART_API_KEY is not configured')
  }
}

export function normalizeBlueCartResult(result, { market = 'CA' } = {}) {
  const primaryOffer = result?.offers?.primary || {}
  const price = Number(primaryOffer.price)
  const isMarketplace = result?.offers?.is_marketplace_item
  const retailer = 'Walmart.ca'

  return {
    provider: 'bluecart',
    provider_offer_id: primaryOffer.id ? String(primaryOffer.id) : null,
    retailer,
    seller: String(primaryOffer?.seller?.name || '').trim() || null,
    sold_by_retailer: isMarketplace === false ? true : isMarketplace === true ? false : null,
    price: Number.isFinite(price) ? price : null,
    shipping: null,
    currency: String(market).toUpperCase() === 'CA' ? 'CAD' : null,
    url: String(result?.product?.link || '').trim(),
    title: String(result?.product?.title || '').trim(),
    brand: String(result?.product?.brand || '').trim() || null,
    condition: null,
    identifiers: {
      item_id: String(result?.product?.item_id || '').trim() || null,
      product_id: String(result?.product?.product_id || '').trim() || null,
    },
    attributes: {},
    in_stock: result?.inventory?.in_stock ?? null,
    fulfillment: {
      shipping: result?.fulfillment?.shipping ?? null,
      pickup: result?.fulfillment?.pickup ?? null,
      delivery_from_store: result?.fulfillment?.delivery_from_store ?? null,
    },
  }
}

export async function searchWalmartOffers(query, market = 'CA', deps = {}) {
  const apiKey = deps.apiKey ?? getEnv('BLUECART_API_KEY')
  const fetchImpl = deps.fetchImpl || fetch
  const timeoutMs = deps.timeoutMs || DEFAULT_TIMEOUT_MS
  requireApiKey(apiKey)

  if (String(market).toUpperCase() !== 'CA') {
    return []
  }

  const url = new URL(deps.endpoint || BLUECART_ENDPOINT)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('type', 'search')
  url.searchParams.set('search_term', query)
  url.searchParams.set('walmart_domain', 'walmart.ca')
  url.searchParams.set('condition', 'new')

  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`BlueCart request failed (${response.status}): ${text.slice(0, 200)}`)
  }

  const payload = JSON.parse(text)
  const results = Array.isArray(payload?.search_results) ? payload.search_results : []
  return results.map((result) => normalizeBlueCartResult(result, { market }))
}
