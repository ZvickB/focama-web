const MAJOR_RETAILERS = [
  ['walmart', /walmart/i],
  ['best buy', /^best buy canada$/i],
  ['canadian tire', /canadian tire/i],
  ['costco', /costco/i],
  ['home depot', /home depot/i],
  ['staples', /^staples canada$/i],
]

const CONDITION_REJECTION = /\b(refurb(?:ished)?|renewed|used|pre[- ]?owned|open[ -]?box|openbox|remis(?:e)? à neuf|reconditionn(?:e|é))\b/i
const MODEL_TOKEN = /\b(?=[a-z0-9/-]{4,}\b)(?=[a-z0-9/-]*[a-z])(?=[a-z0-9/-]*\d)[a-z0-9]+(?:[-/][a-z0-9]+)+|\b(?=[a-z0-9]{5,}\b)(?=[a-z0-9]*[a-z])(?=[a-z0-9]*\d)[a-z0-9]+\b/gi

function cleanText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function comparable(value) {
  return cleanText(value).replace(/\s+/g, '')
}

function finiteNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function extractModelTokens(value) {
  return new Set(String(value || '').toLowerCase().match(MODEL_TOKEN) || [])
}

function tokenize(value) {
  return new Set(cleanText(value).split(' ').filter((token) => token.length > 1))
}

function jaccard(left, right) {
  const leftTokens = tokenize(left)
  const rightTokens = tokenize(right)
  if (!leftTokens.size || !rightTokens.size) return 0
  let intersection = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1
  }
  return intersection / (leftTokens.size + rightTokens.size - intersection)
}

function titleSimilarity(left, right) {
  const leftTokens = tokenize(left)
  const rightTokens = tokenize(right)
  if (!leftTokens.size || !rightTokens.size) return 0
  let intersection = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1
  }
  const overlap = intersection / Math.min(leftTokens.size, rightTokens.size)
  return Math.max(jaccard(left, right), overlap)
}

function normalizedIdentity(input) {
  const identifier = input?.matchIdentifier || input?.match_identifier || {}
  return {
    brand: identifier.brand || null,
    modelNumber: identifier.model_number || identifier.modelNumber || null,
    upc: identifier.upc || null,
    ean: identifier.ean || null,
    gtin: identifier.gtin || null,
    attributes: identifier.attributes || {},
  }
}

function offerIdentityCodes(offer) {
  const identifiers = offer?.identifiers || {}
  return [identifiers.upc, identifiers.ean, identifiers.gtin].filter(Boolean).map(comparable)
}

function sourceIdentityCodes(identity) {
  return [identity.upc, identity.ean, identity.gtin].filter(Boolean).map(comparable)
}

function hasIdentifierMatch(identity, offer) {
  const sourceCodes = sourceIdentityCodes(identity)
  if (!sourceCodes.length) return false
  const offerCodes = offerIdentityCodes(offer)
  return offerCodes.some((code) => sourceCodes.includes(code))
}

function normalizeAttributeValue(key, value) {
  if (value == null || value === '') return null
  if (key === 'pack_count') return finiteNumber(value)
  return comparable(value)
}

function getOfferAttribute(offer, key) {
  const explicit = offer?.attributes?.[key]
  if (explicit != null && explicit !== '') return explicit
  const title = String(offer?.title || '')
  const patterns = {
    generation: /\b(\d+(?:st|nd|rd|th)?\s+generation|gen\s*\d+)\b/i,
    size: /\b(\d+(?:\.\d+)?\s*(?:inch|in|cm|mm|ft))\b/i,
    capacity: /\b(\d+(?:\.\d+)?\s*(?:gb|tb|ml|l|litre|liter|oz|qt|quart))\b/i,
    pack_count: /\b(\d+)\s*(?:pack|count|ct|pk|pieces?|pcs?)\b/i,
  }
  const match = patterns[key]?.exec(title)
  return match?.[1] || null
}

function titleSupportsAttribute(title, key, expectedValue) {
  if (comparable(title).includes(comparable(expectedValue))) return true
  const number = String(expectedValue || '').match(/\d+(?:\.\d+)?/)?.[0]
  if (!number) return false
  if (key === 'generation') return new RegExp(`\\b${number}\\b`).test(String(title || ''))
  if (key === 'pack_count') return new RegExp(`\\b${number}\\s*(?:pack|count|ct|pk|pieces?|pcs?)\\b`, 'i').test(String(title || ''))
  return false
}

function attributeIssue(identity, offer, colorIsMaterial) {
  const exactModel = identity.modelNumber && comparable(offer?.title).includes(comparable(identity.modelNumber))
  for (const key of ['generation', 'size', 'capacity', 'pack_count']) {
    const expected = normalizeAttributeValue(key, identity.attributes?.[key])
    const actual = normalizeAttributeValue(key, getOfferAttribute(offer, key))
    if (expected == null) continue
    if (actual != null && expected !== actual) return `${key}_conflict`
    if (actual == null && !exactModel && !titleSupportsAttribute(offer?.title, key, identity.attributes?.[key])) {
      return `${key}_missing`
    }
  }

  if (colorIsMaterial) {
    const expectedColor = normalizeAttributeValue('color', identity.attributes?.color)
    const actualColor = normalizeAttributeValue('color', offer?.attributes?.color)
    if (expectedColor && actualColor && expectedColor !== actualColor) return 'color_conflict'
  }

  return null
}

function modelConflict(identity, offer) {
  const expected = comparable(identity.modelNumber)
  if (!expected) return false
  const title = comparable(offer?.title)
  if (title.includes(expected)) return false

  const offerModels = extractModelTokens(offer?.title)
  if (/^\d{4,}$/.test(expected)) {
    const numericCandidates = String(offer?.title || '').match(/\b\d{4,}\b/g) || []
    if (numericCandidates.some((candidate) => candidate.length === expected.length)) return true
  }
  return offerModels.size > 0
}

function retailerKey(value) {
  const retailer = String(value || '').trim()
  return MAJOR_RETAILERS.find(([, pattern]) => pattern.test(retailer))?.[0] || null
}

function isWalmart(offer) {
  return /walmart/i.test(offer?.retailer || '')
}

function sellerAllowed(offer, coverageMode) {
  if (coverageMode !== 'major_retailers') return true
  if (!retailerKey(offer?.retailer)) return false
  if (offer?.sold_by_retailer === false) return false
  if (/marketplace/i.test(offer?.retailer || '')) return false
  if (isWalmart(offer) && offer?.provider !== 'bluecart') return false
  return true
}

function calculateConfidence(input, identity, offer, identifierMatch) {
  const sourceTitle = input?.displayTitle || input?.sourceTitle || input?.source_title || ''
  const similarity = titleSimilarity(sourceTitle, offer?.title)
  const brand = comparable(identity.brand)
  const brandMatch = brand && comparable(offer?.brand || offer?.title).includes(brand)
  const model = comparable(identity.modelNumber)
  const modelMatch = model && comparable(offer?.title).includes(model)

  if (identifierMatch) return 0.99
  return Math.min(0.97,
    (similarity * 0.55) +
    (brandMatch ? 0.15 : 0) +
    (modelMatch ? 0.25 : 0) +
    (offer?.sold_by_retailer === true ? 0.05 : 0))
}

function reject(reason, offer, extra = {}) {
  return { offer, reason, ...extra }
}

function makeAcceptedOffer(input, offer, confidence) {
  const price = finiteNumber(offer.price)
  const shipping = finiteNumber(offer.shipping)
  const knownTotal = price + (shipping || 0)
  const notices = []
  if (shipping == null) notices.push('Shipping not included')
  if (/costco/i.test(offer.retailer || '')) notices.push('Membership may be required.')
  if (input?.amazonShipping == null) notices.push('Amazon shipping excluded from comparison')

  return {
    retailer: offer.retailer,
    seller: offer.seller || null,
    sold_by_retailer: offer.sold_by_retailer ?? null,
    price,
    shipping,
    known_total: knownTotal,
    currency: 'CAD',
    url: offer.url,
    title: offer.title,
    confidence: Number(confidence.toFixed(3)),
    checked_at: input?.checkedAt || new Date().toISOString(),
    notices,
    provider: offer.provider,
    provider_offer_id: offer.provider_offer_id || null,
  }
}

function selectOffers(offers, amazonTotal) {
  const qualifying = offers
    .map((offer) => {
      const savings = amazonTotal - offer.known_total
      const savingsPercent = amazonTotal > 0 ? savings / amazonTotal : 0
      return { ...offer, savings, savings_percent: savingsPercent }
    })
    .filter((offer) => offer.savings >= 3 && offer.savings_percent >= 0.05)
    .sort((left, right) => left.known_total - right.known_total || right.confidence - left.confidence)

  if (!qualifying.length) return []
  const lowest = qualifying[0]
  const walmart = qualifying.find(isWalmart)
  const selected = []

  if (walmart && walmart.savings_percent >= 0.1) selected.push(walmart)
  if (!selected.includes(lowest)) selected.push(lowest)
  if (walmart && !selected.includes(walmart)) selected.push(walmart)
  for (const offer of qualifying) {
    if (selected.length >= 2) break
    if (!selected.includes(offer)) selected.push(offer)
  }

  return selected.slice(0, 2)
}

export function rankComparisonOffers(input) {
  const identity = normalizedIdentity(input)
  const coverageMode = input?.sellerCoverageMode || input?.seller_coverage_mode || 'major_retailers'
  const amazonPrice = finiteNumber(input?.amazonPrice ?? input?.amazon_item_price)
  const amazonShipping = finiteNumber(input?.amazonShipping ?? input?.amazon_shipping)
  const amazonTotal = amazonPrice == null ? null : amazonPrice + (amazonShipping || 0)
  const offers = Array.isArray(input?.offers) ? input.offers : []
  const hasBlueCartWalmart = offers.some((offer) => offer?.provider === 'bluecart' && isWalmart(offer))
  const accepted = []
  const rejected = []

  if (amazonTotal == null || amazonTotal <= 0) {
    return { offers: [], accepted: [], rejected: offers.map((offer) => reject('missing_amazon_price', offer)) }
  }

  for (const offer of offers) {
    const price = finiteNumber(offer?.price)
    const currency = String(offer?.currency || '').toUpperCase()
    const conditionText = `${offer?.condition || ''} ${offer?.title || ''}`

    if (hasBlueCartWalmart && offer?.provider === 'serpapi' && isWalmart(offer)) {
      rejected.push(reject('walmart_superseded_by_bluecart', offer)); continue
    }
    if (price == null || price <= 0) {
      rejected.push(reject('missing_or_nonpositive_price', offer)); continue
    }
    if (currency !== 'CAD') {
      rejected.push(reject('wrong_currency', offer)); continue
    }
    if (CONDITION_REJECTION.test(conditionText)) {
      rejected.push(reject('used_or_refurbished', offer)); continue
    }
    if (!sellerAllowed(offer, coverageMode)) {
      rejected.push(reject('seller_not_allowed', offer)); continue
    }

    const identifierMatch = hasIdentifierMatch(identity, offer)
    if (!identifierMatch && modelConflict(identity, offer)) {
      rejected.push(reject('model_conflict', offer)); continue
    }
    const issue = attributeIssue(identity, offer, Boolean(input?.colorIsMaterial))
    if (!identifierMatch && issue) {
      rejected.push(reject(issue, offer)); continue
    }

    const confidence = calculateConfidence(input, identity, offer, identifierMatch)
    if (!identifierMatch && price < amazonTotal * 0.2) {
      rejected.push(reject('implausible_price_outlier', offer, { confidence })); continue
    }
    if (confidence < 0.72) {
      rejected.push(reject('low_confidence', offer, { confidence })); continue
    }

    accepted.push(makeAcceptedOffer({ ...input, amazonShipping }, offer, confidence))
  }

  return {
    offers: selectOffers(accepted, amazonTotal),
    accepted,
    rejected,
  }
}
