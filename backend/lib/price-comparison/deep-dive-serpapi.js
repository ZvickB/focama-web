import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'

import { DEFAULT_HAIKU_MODEL } from '../ai-selector.js'
import { getEnv } from '../search-data.js'
import { truncateText } from '../text-sanitizers.js'
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
  CA: 'bestbuy.ca,walmart.ca,staples.ca,londondrugs.com,visions.ca,costco.ca,canadiantire.ca,homedepot.ca,amazon.ca',
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

function moneyString(value, market) {
  if (typeof value === 'string' && value.trim()) return value
  const currency = expectedCurrencyForMarket(market) === 'CAD' ? 'CA$' : '$'
  return Number.isFinite(Number(value)) ? `${currency}${Number(value).toFixed(2)}` : ''
}

function hashPayload(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
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

function parseCandidatePrice(candidate, market) {
  return parseMoney(candidate?.numericPrice ?? candidate?.extracted_price ?? candidate?.price) ?? null
}

function getAllowedDomains(market) {
  const configured = getEnv(`DEEP_DIVE_ALLOWED_DOMAINS_${market}`) || DEFAULT_ALLOWED_DOMAINS[market] || ''
  return parseRetailerDomainAllowlist(configured)
}

function normalizeProof(proofResult) {
  return Array.isArray(proofResult?.proof)
    ? proofResult.proof.map((entry) => clean(entry?.field || entry?.value)).filter(Boolean).slice(0, 8)
    : []
}

export async function normalizeDeepDiveOffers({
  candidate,
  immersive,
  market,
  shoppingOffer,
}) {
  const expectedCurrency = expectedCurrencyForMarket(market)
  const productResults = immersive?.productResults || {}
  const stores = Array.isArray(productResults?.stores) ? productResults.stores : []
  const amazonTotal = parseCandidatePrice(candidate, market)
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

    const savingsAmount = amazonTotal !== null ? Math.max(0, amazonTotal - normalized.knownTotal) : 0
    const savingsPercent = amazonTotal && savingsAmount > 0 ? savingsAmount / amazonTotal : 0

    offers.push({
      retailer: normalized.retailer,
      title: normalized.title,
      price: normalized.price,
      currency: expectedCurrency,
      shipping: normalized.shipping || null,
      knownTotal: normalized.knownTotal,
      url: linkValidation.finalUrl || normalized.url,
      savingsVsAmazon: savingsAmount > 0
        ? {
            amount: Math.round(savingsAmount * 100) / 100,
            percent: Math.round(savingsPercent * 10000) / 10000,
          }
        : null,
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

function sourceName(value) {
  return clean(value?.source || value?.name || value?.author || value?.site || value?.retailer || value?.title)
}

function insightText(value) {
  return clean(value?.text || value?.summary || value?.title || value?.snippet || value?.description)
}

export function buildReviewEvidence(productResults) {
  const userReviews = (Array.isArray(productResults?.user_reviews) ? productResults.user_reviews : [])
    .map((review) => ({
      source: sourceName(review) || 'User reviews',
      rating: review?.rating || review?.score || null,
      text: truncateText(insightText(review) || clean(review?.review || review?.content), 600),
      date: clean(review?.date),
    }))
    .filter((entry) => entry.text)
    .slice(0, 8)
  const criticRatings = (Array.isArray(productResults?.critic_ratings) ? productResults.critic_ratings : [])
    .map((rating) => ({
      source: sourceName(rating),
      rating: clean(rating?.rating || rating?.score),
      text: truncateText(insightText(rating), 400),
      link: clean(rating?.link),
    }))
    .filter((entry) => entry.source || entry.text || entry.rating)
    .slice(0, 8)
  const topInsights = (Array.isArray(productResults?.top_insights) ? productResults.top_insights : [])
    .map((insight) => ({
      source: sourceName(insight) || 'Google Shopping',
      text: truncateText(insightText(insight), 400),
    }))
    .filter((entry) => entry.text)
    .slice(0, 8)

  return {
    userReviews,
    criticRatings,
    topInsights,
    evidenceCount: userReviews.length + criticRatings.length + topInsights.length,
    inputHash: hashPayload({ userReviews, criticRatings, topInsights }),
  }
}

export function normalizeReviewSignals(productResults) {
  const evidence = buildReviewEvidence(productResults)
  return {
    criticRatings: evidence.criticRatings,
    topInsights: evidence.topInsights,
    starDistribution: productResults?.ratings || productResults?.rating_distribution || [],
  }
}

export async function synthesizeDeepDiveReviews({ apiKey, evidence }) {
  if (!apiKey || !evidence || evidence.evidenceCount < 2) {
    return { summary: '', sources: [], limited: true, skipped: true, inputHash: evidence?.inputHash || '' }
  }

  const anthropic = new Anthropic({ apiKey })
  const prompt = [
    'Summarize only the provided product review evidence. Cite source names for every claim.',
    'Do not add your own opinion. Do not state facts that are not present in the input.',
    'If the evidence is limited, write less. Return JSON only: {"summary":"...","sources":["..."],"limited":false}.',
    '',
    JSON.stringify({
      user_reviews: evidence.userReviews,
      critic_ratings: evidence.criticRatings,
      top_insights: evidence.topInsights,
    }),
  ].join('\n')

  const message = await anthropic.messages.create({
    model: DEFAULT_HAIKU_MODEL,
    max_tokens: 320,
    temperature: 0,
    system: 'You summarize real product review evidence with strict source attribution.',
    messages: [{ role: 'user', content: prompt }],
  })
  const text = message.content?.[0]?.type === 'text' ? message.content[0].text.trim() : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
  const sources = Array.isArray(parsed?.sources)
    ? parsed.sources.map(clean).filter(Boolean).slice(0, 8)
    : []

  return {
    summary: truncateText(clean(parsed?.summary), 900),
    sources,
    limited: Boolean(parsed?.limited),
    skipped: false,
    inputHash: evidence.inputHash,
    usage: {
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
    },
  }
}

export function buildDeepDiveProductPayload(productResults, candidate) {
  return {
    title: clean(productResults?.title || candidate?.title),
    brand: clean(productResults?.brand || candidate?.match_identifier?.brand) || null,
    rating: Number.isFinite(Number(productResults?.rating)) ? Number(productResults.rating) : candidate?.rating || null,
    reviewCount: Number.isFinite(Number(productResults?.reviews)) ? Number(productResults.reviews) : candidate?.reviewCount || null,
    selectedVariantProof: (Array.isArray(productResults?.variants) ? productResults.variants : [])
      .flatMap((variant) => (Array.isArray(variant?.items) ? variant.items : []))
      .filter((item) => item?.selected === true)
      .map((item) => clean(item?.name))
      .filter(Boolean)
      .slice(0, 8),
  }
}

export {
  normalizeMarket,
  PRICE_STALE_MS,
  normalizeProductIdentity,
}
