import { buildInternalErrorPayload, sendJson } from '../http.js'
import { reportBackendError } from '../observability.js'
import { fetchOxylabsProductDetailsByAsin } from '../oxylabs-pipeline.js'
import {
  recordOxylabsProductFailures,
  readProductDetailsCacheEntries,
  writeProductDetailsCacheEntries,
} from '../search-storage.js'
import { getEnv } from '../search-data.js'
import { normalizeCachedProductDetailsEntry } from '../product-details-cache.js'
import {
  getRequestedAmazonDomain,
} from '../server-helpers.js'

const PRODUCT_DETAILS_ASIN_MAX_LENGTH = 200

function normalizeProductDetailsAsin(value = '') {
  return String(value || '').trim().slice(0, PRODUCT_DETAILS_ASIN_MAX_LENGTH)
}

function buildProductDetailsPayload(asin, entry) {
  const normalizedEntry = normalizeCachedProductDetailsEntry(entry)

  if (!normalizedEntry) {
    return {
      asin,
      ready: false,
      feature_bullets: [],
      productDescription: '',
    }
  }

  return {
    asin,
    ready: normalizedEntry.feature_bullets.length > 0 || normalizedEntry.productDescription.length > 0,
    feature_bullets: normalizedEntry.feature_bullets,
    productDescription: normalizedEntry.productDescription,
    ...(normalizedEntry.isPrime ? { isPrime: true } : {}),
    ...(normalizedEntry.delivery ? { delivery: normalizedEntry.delivery } : {}),
    source: normalizedEntry.source,
  }
}

export async function handleProductDetails(requestUrl, response) {
  const asin = normalizeProductDetailsAsin(
    requestUrl.searchParams.get('asin') ||
    requestUrl.searchParams.get('id') ||
    requestUrl.searchParams.get('productId') ||
    '',
  )
  const amazonDomain = getRequestedAmazonDomain(requestUrl.searchParams.get('amazonDomain') || '') || 'amazon.com'

  if (!asin) {
    sendJson(response, 400, { error: 'Product ASIN is required.' })
    return
  }

  try {
    const cachedDetails = await readProductDetailsCacheEntries([asin])
    const cachedEntry = normalizeCachedProductDetailsEntry(cachedDetails?.get?.(asin))

    if (cachedEntry && (cachedEntry.feature_bullets.length > 0 || cachedEntry.productDescription.length > 0)) {
      sendJson(response, 200, buildProductDetailsPayload(asin, cachedEntry))
      return
    }

    const oxylabsUsername = getEnv('OXYLABS_USERNAME')
    const oxylabsPassword = getEnv('OXYLABS_PASSWORD')

    if (!oxylabsUsername || !oxylabsPassword) {
      sendJson(response, 200, buildProductDetailsPayload(asin, cachedEntry))
      return
    }

    const detailFailures = []
    const detailsById = await fetchOxylabsProductDetailsByAsin({
      asins: [asin],
      oxylabsUsername,
      oxylabsPassword,
      amazonDomain,
      readCache: readProductDetailsCacheEntries,
      writeCache: writeProductDetailsCacheEntries,
      onAsinFailure: (failedAsin, failureType, statusCode) => {
        detailFailures.push({ asin: failedAsin, failureType, statusCode, query: '' })
      },
    })

    if (detailFailures.length > 0) {
      await recordOxylabsProductFailures(detailFailures)
    }

    sendJson(response, 200, buildProductDetailsPayload(asin, detailsById.get(asin) || cachedEntry))
  } catch (error) {
    reportBackendError(error, {
      amazonDomain,
      asin,
      route: '/api/search/product-details',
      source: 'product_details',
    })
    sendJson(response, 500, buildInternalErrorPayload('Unable to load product details.', error))
  }
}
