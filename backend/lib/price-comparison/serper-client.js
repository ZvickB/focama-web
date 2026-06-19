import { getEnv, SERPER_SHOPPING_ENDPOINT } from '../search-data.js'

const DEFAULT_TIMEOUT_MS = 10000

function requireApiKey(apiKey) {
  if (!apiKey) {
    throw new Error('SERPER_API_KEY is not configured')
  }
}

function parsePrice(value) {
  const normalized = String(value || '').replace(/,/g, '')
  const match = normalized.match(/[0-9]+(?:\.[0-9]+)?/)
  if (!match) return null

  const price = Number.parseFloat(match[0])
  return Number.isFinite(price) ? price : null
}

function inferCurrency(priceText, market) {
  const normalized = String(priceText || '').trim().toUpperCase()
  if (normalized.includes('C$') || normalized.includes('CAD')) return 'CAD'
  if (normalized.includes('US$') || normalized.includes('USD')) return 'USD'
  if (normalized.includes('$') && String(market || '').toLowerCase() === 'ca') return 'CAD'
  return null
}

async function fetchJson(url, { fetchImpl, timeoutMs, apiKey, body }) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()

  if (!response.ok) {
    throw new Error(`Serper request failed (${response.status}): ${text.slice(0, 200)}`)
  }

  return JSON.parse(text)
}

export function normalizeSerperShoppingResult(result, { market = 'CA' } = {}) {
  return {
    provider: 'serper',
    provider_offer_id: result?.productId ? String(result.productId) : null,
    retailer: String(result?.source || '').trim(),
    seller: null,
    sold_by_retailer: null,
    price: parsePrice(result?.price),
    shipping: null,
    currency: inferCurrency(result?.price, market),
    url: String(result?.link || '').trim(),
    title: String(result?.title || '').trim(),
    brand: null,
    condition: null,
    identifiers: {},
    attributes: {},
  }
}

export async function searchSerperShoppingOffers(query, market = 'CA', deps = {}) {
  const apiKey = deps.apiKey ?? getEnv('SERPER_API_KEY')
  const fetchImpl = deps.fetchImpl || fetch
  const timeoutMs = deps.timeoutMs || DEFAULT_TIMEOUT_MS
  requireApiKey(apiKey)

  const body = {
    q: query,
    gl: String(market || '').toLowerCase(),
    hl: 'en',
    num: 20,
  }

  const payload = await fetchJson(deps.endpoint || SERPER_SHOPPING_ENDPOINT, {
    fetchImpl,
    timeoutMs,
    apiKey,
    body,
  })
  const results = Array.isArray(payload?.shopping) ? payload.shopping : []
  return results.map((result) => normalizeSerperShoppingResult(result, { market }))
}
