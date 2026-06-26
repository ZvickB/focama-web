import { RAINFOREST_ENDPOINT, getAmazonDomain } from '../rainforest-pipeline.js'
import { appendAffiliateTag, getAmazonPricePrefix } from '../../../shared/amazon-marketplaces.js'

const DEFAULT_PRODUCT_TIMEOUT_MS = 10000

function normalizeAsin(value = '') {
  return String(value || '').trim().slice(0, 200)
}

function uniqueAsins(asins = []) {
  return Array.from(new Set((Array.isArray(asins) ? asins : []).map(normalizeAsin).filter(Boolean)))
}

function getProductPayload(payload, fallbackAsin) {
  const product = payload?.product && typeof payload.product === 'object'
    ? payload.product
    : payload?.product_results && typeof payload.product_results === 'object'
      ? payload.product_results
      : payload?.results?.[0]?.product && typeof payload.results[0].product === 'object'
        ? payload.results[0].product
        : payload

  if (!product || typeof product !== 'object') {
    return { asin: fallbackAsin }
  }

  return product
}

function getNumericPriceValue(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null
}

function getRainforestPriceValue(product = {}) {
  return getNumericPriceValue(product?.price?.value) ??
    getNumericPriceValue(product?.buybox_winner?.price?.value) ??
    getNumericPriceValue(product?.buybox_winner?.rrp?.value) ??
    getNumericPriceValue(product?.sale_price?.value) ??
    null
}

function isOutOfStock(product = {}) {
  const text = [
    product?.availability?.raw,
    product?.availability?.type,
    product?.availability,
    product?.buybox_winner?.availability?.raw,
    product?.buybox_winner?.availability?.type,
    product?.buybox_winner?.availability,
  ]
    .filter(Boolean)
    .join(' ')

  return /\b(out of stock|currently unavailable|temporarily unavailable|unavailable)\b/i.test(text)
}

function getCurrencyForAmazonDomain(amazonDomain) {
  const pricePrefix = getAmazonPricePrefix(amazonDomain)
  if (pricePrefix === 'CA$') return 'CAD'
  if (pricePrefix === '$') return 'USD'
  return pricePrefix.trim() || ''
}

function getProductUrl(product = {}, amazonDomain) {
  const link = typeof product?.link === 'string' ? product.link : ''
  return appendAffiliateTag(link, amazonDomain) || ''
}

function buildPriceCheckResult({
  amazonDomain,
  asin,
  checkedAt,
  currentPrice = null,
  productUrl = '',
  unavailableReason,
}) {
  return {
    amazonDomain,
    asin,
    checkedAt,
    currency: getCurrencyForAmazonDomain(amazonDomain),
    currentPrice,
    productUrl,
    source: 'rainforest',
    ...(unavailableReason ? { unavailableReason } : {}),
  }
}

export async function checkAmazonPricesByAsin({
  asins = [],
  rainforestApiKey,
  amazonDomain = 'amazon.com',
  countryCode = 'US',
  fetchImpl = globalThis.fetch,
  checkedAt = new Date().toISOString(),
  timeoutMs = DEFAULT_PRODUCT_TIMEOUT_MS,
} = {}) {
  const requestedAsins = uniqueAsins(asins)
  const resolvedAmazonDomain = getAmazonDomain({ countryCode, amazonDomain })
  const resultsByAsin = new Map()

  if (requestedAsins.length === 0) {
    return resultsByAsin
  }

  if (!rainforestApiKey || typeof fetchImpl !== 'function') {
    for (const asin of requestedAsins) {
      resultsByAsin.set(asin, buildPriceCheckResult({
        amazonDomain: resolvedAmazonDomain,
        asin,
        checkedAt,
        unavailableReason: 'provider_error',
      }))
    }
    return resultsByAsin
  }

  const settledResults = await Promise.allSettled(
    requestedAsins.map(async (asin) => {
      const productUrl = new URL(RAINFOREST_ENDPOINT)
      productUrl.searchParams.set('type', 'product')
      productUrl.searchParams.set('asin', asin)
      productUrl.searchParams.set('amazon_domain', resolvedAmazonDomain)
      productUrl.searchParams.set('api_key', rainforestApiKey)

      const response = await fetchImpl(productUrl, {
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!response.ok) {
        throw new Error(`Rainforest product request failed with status ${response.status}.`)
      }

      const payload = await response.json()
      const product = getProductPayload(payload, asin)
      const normalizedAsin = normalizeAsin(product?.asin) || asin
      const currentPrice = getRainforestPriceValue(product)

      if (!currentPrice) {
        return buildPriceCheckResult({
          amazonDomain: resolvedAmazonDomain,
          asin: normalizedAsin,
          checkedAt,
          productUrl: getProductUrl(product, resolvedAmazonDomain),
          unavailableReason: isOutOfStock(product) ? 'out_of_stock' : 'missing_price',
        })
      }

      return buildPriceCheckResult({
        amazonDomain: resolvedAmazonDomain,
        asin: normalizedAsin,
        checkedAt,
        currentPrice,
        productUrl: getProductUrl(product, resolvedAmazonDomain),
      })
    }),
  )

  for (let index = 0; index < requestedAsins.length; index += 1) {
    const requestedAsin = requestedAsins[index]
    const settledResult = settledResults[index]

    if (settledResult.status === 'fulfilled') {
      resultsByAsin.set(requestedAsin, {
        ...settledResult.value,
        asin: requestedAsin,
      })
      continue
    }

    resultsByAsin.set(requestedAsin, buildPriceCheckResult({
      amazonDomain: resolvedAmazonDomain,
      asin: requestedAsin,
      checkedAt,
      unavailableReason: 'provider_error',
    }))
  }

  return resultsByAsin
}
