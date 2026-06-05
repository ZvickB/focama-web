import {
  appendAffiliateTag,
  buildAmazonBaseUrl,
  formatAmazonPrice,
  getAmazonPricePrefix,
  normalizeAmazonDomain,
} from '../../shared/amazon-marketplaces.js'

/**
 * Normalizes Oxylabs API responses to match the shapes expected by the pipeline.
 *
 * normalizeOxylabsSearchResult — matches the output of normalizeRainforestItem in rainforest-pipeline.js
 * normalizeOxylabsProduct      — maps amazon_product detail response for future enrichment use
 */

/**
 * Maps an Oxylabs amazon_search organic result to the shape produced by
 * normalizeRainforestItem in rainforest-pipeline.js.
 */
export function normalizeOxylabsSearchResult(item, { amazonDomain = 'amazon.com' } = {}) {
  const normalizedDomain = normalizeAmazonDomain(amazonDomain) || 'amazon.com'
  const rawLink = item.url || ''
  const baseLink = rawLink.startsWith('http')
    ? rawLink
    : `${buildAmazonBaseUrl(normalizedDomain)}${rawLink}`
  const productLink = appendAffiliateTag(baseLink, normalizedDomain)

  return {
    product_id: item.asin || null,
    title: item.title || '',
    extracted_price: typeof item.price === 'number' ? item.price : null,
    price: typeof item.price === 'number' ? formatAmazonPrice(item.price, normalizedDomain) : null,
    rating: item.rating ?? null,
    reviews: item.reviews_count ?? null,
    thumbnail: item.url_image || null,
    product_link: productLink,
    snippet: '',
    extensions: [],
    multiple_sources: false,
    isPrime: Boolean(item.is_prime),
    delivery: item.is_prime ? 'Prime delivery' : '',
    tag: '',
    source: 'Amazon',
    position: item.pos || null,
  }
}

function normalizeDeliveryDetails(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return ''
      }

      return [entry.type, entry.date?.by].filter(Boolean).join(' ')
    })
    .filter(Boolean)
}

function hasPrimeDeliveryDetails(value) {
  return normalizeDeliveryDetails(value).some((entry) => /\bprime\b/i.test(entry))
}

function getPrimeDeliveryLabel(item) {
  const deliveryDetails = [
    ...normalizeDeliveryDetails(item.delivery),
    ...(Array.isArray(item.buybox)
      ? item.buybox.flatMap((offer) => normalizeDeliveryDetails(offer?.delivery_details))
      : []),
  ]

  return deliveryDetails.find((entry) => /\bprime\b/i.test(entry)) || ''
}

/**
 * Maps an Oxylabs amazon_product detail response for enrichment use.
 *
 * Key field mappings:
 *   bullet_points (string)     → feature_bullets (array, split on newline)
 *   product_details (object)   → specifications (array of {name, value})
 *   price (number)             → price ({symbol, value, raw})
 *   reviews_count              → ratings_total
 *   category[0].ladder         → categories (array of name strings)
 */
export function normalizeOxylabsProduct(item, { amazonDomain = 'amazon.com' } = {}) {
  const featureBullets = typeof item.bullet_points === 'string'
    ? item.bullet_points.split('\n').filter(Boolean)
    : []

  const specifications = item.product_details && typeof item.product_details === 'object'
    ? Object.entries(item.product_details).map(([name, value]) => ({ name, value: String(value) }))
    : []

  const priceValue = typeof item.price === 'number' ? item.price : null
  const price = priceValue !== null
    ? {
        symbol: getAmazonPricePrefix(amazonDomain),
        value: priceValue,
        raw: formatAmazonPrice(priceValue, amazonDomain),
      }
    : null

  const categoryLadder = Array.isArray(item.category) && item.category[0]?.ladder
    ? item.category[0].ladder.map((c) => c.name).filter(Boolean)
    : []

  const mainImage = Array.isArray(item.images) && item.images[0] ? item.images[0] : null
  const primeDeliveryLabel = getPrimeDeliveryLabel(item)
  const isPrime = Boolean(
    item.is_prime ||
    item.is_prime_eligible ||
    primeDeliveryLabel ||
    hasPrimeDeliveryDetails(item.delivery),
  )

  return {
    asin: item.asin || null,
    title: item.title || '',
    brand: item.brand || item.manufacturer || '',
    price,
    rating: item.rating ?? null,
    ratings_total: item.reviews_count ?? null,
    main_image: mainImage,
    feature_bullets: featureBullets,
    specifications,
    description: item.description || '',
    categories: categoryLadder,
    isPrime,
    delivery: isPrime ? primeDeliveryLabel || 'Prime delivery' : '',
  }
}
