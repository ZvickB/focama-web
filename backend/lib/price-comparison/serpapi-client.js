import { getEnv, SERPAPI_ENDPOINT } from '../search-data.js'

const DEFAULT_TIMEOUT_MS = 15000

function requireApiKey(apiKey) {
  if (!apiKey) {
    throw new Error('SERPAPI_API_KEY is not configured')
  }
}

async function fetchJson(url, { fetchImpl, timeoutMs }) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`SerpApi request failed (${response.status}): ${text.slice(0, 200)}`)
  }

  return JSON.parse(text)
}

function normalizeCurrency(value, market) {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized) return normalized
  return String(market || '').toUpperCase() === 'CA' ? 'CAD' : null
}

export function normalizeSerpShoppingResult(result, { market = 'CA' } = {}) {
  const price = Number(result?.extracted_price)

  return {
    provider: 'serpapi',
    provider_offer_id: result?.product_id ? String(result.product_id) : null,
    retailer: String(result?.source || '').trim(),
    seller: null,
    sold_by_retailer: /marketplace/i.test(result?.source || '') ? false : null,
    price: Number.isFinite(price) ? price : null,
    shipping: null,
    currency: normalizeCurrency(result?.currency, market),
    url: String(result?.link || result?.product_link || '').trim(),
    title: String(result?.title || '').trim(),
    brand: String(result?.brand || '').trim() || null,
    condition: String(result?.second_hand_condition || result?.condition || '').trim() || null,
    identifiers: {},
    attributes: {},
    immersive_url: String(result?.serpapi_immersive_product_api || '').trim() || null,
  }
}

export function normalizeSerpStoreOffer(store, { market = 'CA' } = {}) {
  const price = Number(store?.extracted_price)
  const shippingValue = store?.shipping_extracted
  const shipping = shippingValue == null || shippingValue === '' ? null : Number(shippingValue)

  return {
    provider: 'serpapi',
    provider_offer_id: null,
    retailer: String(store?.name || '').trim(),
    seller: null,
    sold_by_retailer: /marketplace/i.test(store?.name || '') ? false : null,
    price: Number.isFinite(price) ? price : null,
    shipping: Number.isFinite(shipping) ? shipping : null,
    currency: normalizeCurrency(store?.currency, market),
    url: String(store?.link || '').trim(),
    title: String(store?.title || '').trim(),
    brand: String(store?.brand || '').trim() || null,
    condition: String(store?.condition || '').trim() || null,
    identifiers: {},
    attributes: {},
  }
}

export async function searchShoppingOffers(query, market = 'CA', deps = {}) {
  const apiKey = deps.apiKey ?? getEnv('SERPAPI_API_KEY')
  const fetchImpl = deps.fetchImpl || fetch
  const timeoutMs = deps.timeoutMs || DEFAULT_TIMEOUT_MS
  requireApiKey(apiKey)

  const url = new URL(deps.endpoint || SERPAPI_ENDPOINT)
  url.searchParams.set('engine', 'google_shopping')
  url.searchParams.set('q', query)
  url.searchParams.set('gl', String(market).toLowerCase())
  url.searchParams.set('hl', 'en')
  url.searchParams.set('api_key', apiKey)

  const payload = await fetchJson(url, { fetchImpl, timeoutMs })
  const results = Array.isArray(payload?.shopping_results) ? payload.shopping_results : []
  return results.map((result) => normalizeSerpShoppingResult(result, { market }))
}

export async function fetchShoppingOfferStores(immersiveUrl, market = 'CA', deps = {}) {
  if (!immersiveUrl) return []

  const apiKey = deps.apiKey ?? getEnv('SERPAPI_API_KEY')
  const fetchImpl = deps.fetchImpl || fetch
  const timeoutMs = deps.timeoutMs || DEFAULT_TIMEOUT_MS
  requireApiKey(apiKey)

  const url = new URL(immersiveUrl)
  url.searchParams.set('api_key', apiKey)
  const payload = await fetchJson(url, { fetchImpl, timeoutMs })
  const stores = Array.isArray(payload?.product_results?.stores) ? payload.product_results.stores : []
  return stores.map((store) => normalizeSerpStoreOffer(store, { market }))
}
