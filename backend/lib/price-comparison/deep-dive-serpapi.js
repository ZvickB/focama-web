import { getEnv } from '../search-data.js'
import { logSearchFlowEvent } from '../server-helpers.js'
import {
  proveExactProductVariant,
  selectUniqueShoppingProduct,
} from './exact-product-proof.js'
import {
  parseRetailerDomainAllowlist,
  validateDirectRetailerUrl,
} from './retailer-link-validation.js'

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json'
const PRICE_STALE_MS = 30 * 60 * 1000
const DEFAULT_ALLOWED_DOMAINS = {
  CA: 'bestbuy.ca,walmart.ca,staples.ca,londondrugs.com,visions.ca,costco.ca,canadiantire.ca,homedepot.ca,amazon.ca,newegg.ca,cameracanada.com',
  US: 'bestbuy.com,walmart.com,target.com,costco.com,staples.com,homedepot.com,lowes.com,bhphotovideo.com,adorama.com,newegg.com,amazon.com,abt.com,officedepot.com,dell.com,sweetwater.com,macys.com,pcrichard.com,verizon.com,sony.com',
}
const MODEL_TOKEN = /\b[A-Z]{1,5}[-\s]?\d{2,5}[A-Z0-9]{0,5}\b/

function clean(value) {
  return String(value || '').trim()
}

function normalizeMarket(amazonDomain = '') {
  return /amazon\.ca$/i.test(amazonDomain) ? 'CA' : 'US'
}

function getGlForMarket(market) {
  return market === 'CA' ? 'ca' : 'us'
}

function expectedCurrencyForMarket(market) {
  return market === 'CA' ? 'CAD' : 'USD'
}

function parseMoney(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = clean(value).replace(/,/g, '')
  const match = text.match(/[0-9]+(?:\.[0-9]+)?/)
  return match ? Number(match[0]) : null
}

function inferCurrency(value, market) {
  const text = clean(value).toUpperCase()
  if (/\bCAD\b|CA\$|C\$/.test(text)) return 'CAD'
  if (/\bUSD\b|US\$/.test(text)) return 'USD'
  return expectedCurrencyForMarket(market)
}

function normalizeProductIdentity(candidate) {
  const sourceTitle = clean(candidate?.source_title || candidate?.sourceTitle || candidate?.title)
  const attributes = {}
  const title = sourceTitle
  const capacity = title.match(/\b\d+(?:\.\d+)?\s*(?:tb|gb|qt|quart|oz|ml|l)\b/i)?.[0] || ''
  const color = title.match(/\b(?:black|white|blue|red|green|silver|graphite|gray|grey|pink|purple)\b/i)?.[0] || ''
  const model = title.match(MODEL_TOKEN)?.[0] || ''
  const titleWords = title.split(/\s+/).filter(Boolean)
  const inferredBrand = titleWords[1] && /[-\d]/.test(titleWords[1])
    ? titleWords[0]
    : titleWords.slice(0, 2).join(' ')
  const brand = clean(candidate?.brand) || inferredBrand

  if (capacity) attributes.capacity = capacity
  if (color) attributes.color = color

  return {
    source_title: sourceTitle,
    display_title: clean(candidate?.display_title || candidate?.displayTitle || sourceTitle),
    match_identifier: {
      brand,
      model_number: clean(candidate?.model_number || candidate?.modelNumber || model),
      product_type: '',
      attributes,
      comparison_search_query: [
        brand,
        model,
        sourceTitle,
      ].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 180),
    },
  }
}

function buildShoppingQuery(candidate) {
  const identity = candidate?.match_identifier || candidate?.matchIdentifier || {}
  return clean(
    identity.comparison_search_query ||
    [identity.brand, identity.model_number || identity.modelNumber, candidate?.display_title || candidate?.title]
      .filter(Boolean)
      .join(' '),
  ).slice(0, 220)
}

function normalizeShoppingResult(result) {
  return {
    title: clean(result?.title),
    source: clean(result?.source),
    price: result?.price || '',
    extracted_price: Number.isFinite(Number(result?.extracted_price)) ? Number(result.extracted_price) : null,
    immersive_url: result?.serpapi_immersive_product_api || '',
    immersive_product_page_token: result?.immersive_product_page_token || '',
    position: result?.position ?? null,
    reviews: Number.isFinite(Number(result?.reviews)) ? Number(result.reviews) : 0,
    rating: Number.isFinite(Number(result?.rating)) ? Number(result.rating) : 0,
  }
}

export function getImmersiveRequestFromShoppingOffer(offer, apiKey) {
  const immersiveUrl = clean(offer?.immersive_url)

  if (immersiveUrl) {
    const url = new URL(immersiveUrl)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('more_stores', 'true')
    return url
  }

  const token = clean(offer?.immersive_product_page_token)

  if (!token) {
    return null
  }

  const url = new URL(SERPAPI_ENDPOINT)
  url.searchParams.set('engine', 'google_immersive_product')
  url.searchParams.set('page_token', token)
  url.searchParams.set('more_stores', 'true')
  url.searchParams.set('api_key', apiKey)
  return url
}

async function fetchJson(url, { timeoutMs = 18000 } = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })

  if (!response.ok) {
    throw new Error(`SerpApi request failed with status ${response.status}.`)
  }

  return response.json()
}

export async function fetchShoppingProductGroup({ apiKey, candidate, market }) {
  const query = buildShoppingQuery(candidate)
  const url = new URL(SERPAPI_ENDPOINT)
  url.searchParams.set('engine', 'google_shopping')
  url.searchParams.set('q', query)
  url.searchParams.set('gl', getGlForMarket(market))
  url.searchParams.set('hl', 'en')
  url.searchParams.set('no_cache', 'false')
  url.searchParams.set('api_key', apiKey)

  const payload = await fetchJson(url)
  const offers = Array.isArray(payload?.shopping_results)
    ? payload.shopping_results.map(normalizeShoppingResult)
    : []
  const selected = selectUniqueShoppingProduct(candidate, offers)

  return {
    query,
    payload,
    selectedOffer: selected.offer,
    selectedReason: selected.reason,
    ambiguous: Boolean(selected.ambiguous),
    ranked: selected.ranked || [],
  }
}

export async function fetchImmersiveProduct({ apiKey, shoppingOffer }) {
  const url = getImmersiveRequestFromShoppingOffer(shoppingOffer, apiKey)

  if (!url) {
    throw new Error('Shopping result did not include an Immersive Product token.')
  }

  const payload = await fetchJson(url)
  return {
    payload,
    productResults: payload?.product_results && typeof payload.product_results === 'object'
      ? payload.product_results
      : {},
  }
}

function normalizeStoreOffer(store, market) {
  const price = parseMoney(store?.extracted_price ?? store?.price)
  const shipping = parseMoney(store?.extracted_shipping ?? store?.shipping)
  const knownTotal = parseMoney(store?.extracted_total ?? store?.total) ?? (
    price !== null ? price + (shipping || 0) : null
  )

  return {
    retailer: clean(store?.name || store?.retailer || store?.source),
    title: clean(store?.title || store?.name || store?.retailer),
    price,
    currency: inferCurrency(`${store?.price || ''} ${store?.total || ''}`, market),
    shipping: clean(store?.shipping || store?.delivery || ''),
    knownTotal,
    url: clean(store?.link || store?.product_link),
    raw: store,
  }
}

function parseCandidatePrice(candidate) {
  for (const value of [candidate?.numericPrice, candidate?.extracted_price, candidate?.price]) {
    const parsed = parseMoney(value)
    if (parsed !== null) return parsed
  }
  return null
}

function getAllowedDomains(market) {
  const configured = getEnv(`DEEP_DIVE_ALLOWED_DOMAINS_${market}`) || DEFAULT_ALLOWED_DOMAINS[market] || ''
  return parseRetailerDomainAllowlist(configured)
}

const SOFT_FAILURE_LABELS = {
  model_missing: 'Model number could not be confirmed',
  model_number_missing: 'Model number could not be confirmed',
  product_type_missing: 'Product type could not be confirmed',
  capacity_missing: 'Storage or size could not be confirmed',
  capacity_ambiguous: 'Listing mentions multiple sizes',
  generation_missing: 'Generation or version could not be confirmed',
  feature_tier_missing: 'Feature variant could not be confirmed',
  display_tier_missing: 'Display type could not be confirmed',
  insufficient_identity: 'Limited detail available to verify exact match',
}

function describeSoftFailure(code) {
  return SOFT_FAILURE_LABELS[code] || ''
}

function normalizeProof(proofResult) {
  return Array.isArray(proofResult?.proof)
    ? proofResult.proof.map((entry) => clean(entry?.field || entry?.value)).filter(Boolean).slice(0, 8)
    : []
}

export function calculateSavingsVsSource(sourceTotal, offerTotal) {
  if (sourceTotal === null || sourceTotal === undefined) return null

  const sourceValue = Number(sourceTotal)
  const offerValue = Number(offerTotal)

  if (!Number.isFinite(sourceValue) || !Number.isFinite(offerValue) || sourceValue <= 0 || offerValue <= 0) {
    return null
  }

  const amount = sourceValue - offerValue

  if (amount <= 0) return null

  return {
    amount: Math.round(amount * 100) / 100,
    percent: Math.round((amount / sourceValue) * 10000) / 10000,
  }
}

export async function normalizeDeepDiveOffers({
  candidate,
  immersive,
  market,
  shoppingOffer,
  skipSavingsFilter = false,
}) {
  const expectedCurrency = expectedCurrencyForMarket(market)
  const productResults = immersive?.productResults || {}
  const stores = Array.isArray(productResults?.stores) ? productResults.stores : []
  const amazonTotal = skipSavingsFilter ? null : parseCandidatePrice(candidate)
  const allowedDomains = getAllowedDomains(market)
  const offers = []
  const rejected = []

  for (const store of stores) {
    const normalized = normalizeStoreOffer(store, market)

    if (!normalized.retailer || !normalized.title || !normalized.url) {
      rejected.push({ reason: 'missing_required_offer_fields', retailer: normalized.retailer })
      continue
    }
    if (/\bamazon\b/i.test(normalized.retailer)) {
      rejected.push({ reason: 'source_retailer_skipped', retailer: normalized.retailer })
      continue
    }
    if (normalized.price === null || normalized.price <= 0 || normalized.knownTotal === null || normalized.knownTotal <= 0) {
      rejected.push({ reason: 'invalid_price', retailer: normalized.retailer })
      continue
    }
    if (normalized.currency !== expectedCurrency) {
      rejected.push({ reason: 'wrong_currency', retailer: normalized.retailer })
      continue
    }

    const proof = proveExactProductVariant({
      product: candidate,
      shoppingOffer,
      immersive: productResults,
      storeOffer: {
        retailer: normalized.retailer,
        title: normalized.title,
      },
    })

    if (!proof.accepted) {
      rejected.push({ reason: 'exact_product_proof_failed', retailer: normalized.retailer, failures: proof.failures })
      logSearchFlowEvent('deep_dive_exact_proof_rejected', {
        failures: proof.failures,
        retailer: normalized.retailer,
      })
      continue
    }

    const caveats = (proof.softFailures || []).map(describeSoftFailure).filter(Boolean)

    const linkValidation = await validateDirectRetailerUrl(normalized.url, {
      allowedDomains,
      retailer: normalized.retailer,
      softAcceptProbeFailures: true,
      timeoutMs: 2500,
    })

    if (!linkValidation.ok) {
      rejected.push({ reason: 'link_validation_failed', retailer: normalized.retailer, validation: linkValidation.reason })
      logSearchFlowEvent('deep_dive_link_validation_rejected', {
        reason: linkValidation.reason,
        retailer: normalized.retailer,
      })
      continue
    }

    const savingsVsAmazon = calculateSavingsVsSource(amazonTotal, normalized.knownTotal)

    if (amazonTotal !== null && !savingsVsAmazon) {
      rejected.push({ reason: 'not_lower_than_source', retailer: normalized.retailer })
      continue
    }

    offers.push({
      retailer: normalized.retailer,
      title: normalized.title,
      price: normalized.price,
      currency: expectedCurrency,
      shipping: normalized.shipping || null,
      knownTotal: normalized.knownTotal,
      url: linkValidation.finalUrl || normalized.url,
      savingsVsAmazon,
      confidence: proof.confidence || 'high',
      caveats,
      proof: [
        ...normalizeProof(proof),
        linkValidation.verification === 'soft' ? `link_${linkValidation.reason}` : 'direct_link',
      ].filter(Boolean),
      lastCheckedAt: new Date().toISOString(),
    })
  }

  offers.sort((left, right) => left.knownTotal - right.knownTotal)
  return { offers: offers.slice(0, 8), rejected }
}

export function buildDeepDiveProductPayload(productResults, candidate) {
  const variants = Array.isArray(productResults?.variants) ? productResults.variants : []
  const variantDimensions = variants
    .map((group) => {
      const title = clean(group?.title).toLowerCase()
      const items = Array.isArray(group?.items) ? group.items : []
      const selected = items.find((item) => item?.selected === true)
      const optionCount = items.filter((item) => clean(item?.name) && clean(item?.name).toLowerCase() !== 'any color').length
      if (!title || optionCount <= 1) return null
      return {
        dimension: title,
        yourPick: selected ? clean(selected.name) : null,
        optionCount,
      }
    })
    .filter(Boolean)
    .slice(0, 4)

  return {
    title: clean(productResults?.title || candidate?.title),
    brand: clean(productResults?.brand || candidate?.match_identifier?.brand) || null,
    rating: Number.isFinite(Number(productResults?.rating)) ? Number(productResults.rating) : candidate?.rating || null,
    reviewCount: Number.isFinite(Number(productResults?.reviews)) ? Number(productResults.reviews) : candidate?.reviewCount || null,
    selectedVariantProof: variants
      .flatMap((variant) => (Array.isArray(variant?.items) ? variant.items : []))
      .filter((item) => item?.selected === true)
      .map((item) => clean(item?.name))
      .filter(Boolean)
      .slice(0, 8),
    variantDimensions,
  }
}

export {
  normalizeMarket,
  PRICE_STALE_MS,
  normalizeProductIdentity,
}
