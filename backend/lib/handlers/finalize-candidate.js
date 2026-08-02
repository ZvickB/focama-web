import { sanitizeStringList, truncateText } from '../text-sanitizers.js'

const NON_NEW_CONDITION_PATTERN = /\b(?:renewed|refurbished|refurb|remanufactured|open[ -]?box|pre[ -]?owned|used|second[ -]?hand|restored)\b/i
const NEW_ONLY_PATTERN = /\b(?:brand[- ]?new|new(?:\s+(?:items?|products?|condition))?\s+only)\b/i
const NON_NEW_CONDITION_NEGATION_PATTERN = new RegExp(
  String.raw`(?:\b(?:no|not|without|avoid|exclude)\b[^.!?]{0,40}\b(?:renewed|refurbished|refurb|remanufactured|open[ -]?box|pre[ -]?owned|used|second[ -]?hand|restored)\b|\b(?:renewed|refurbished|refurb|remanufactured|open[ -]?box|pre[ -]?owned|used|second[ -]?hand|restored)\b[^.!?]{0,30}\b(?:not|disallowed|unacceptable)\b)`,
  'i',
)

function normalizeConditionText(...values) {
  return values
    .filter((value) => typeof value === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function allowsNonNewCondition(productQuery = '', userContext = '') {
  const text = normalizeConditionText(productQuery, userContext)

  return Boolean(
    text &&
    NON_NEW_CONDITION_PATTERN.test(text) &&
    !NEW_ONLY_PATTERN.test(text) &&
    !NON_NEW_CONDITION_NEGATION_PATTERN.test(text),
  )
}

export function hasNonNewCondition(candidate = {}) {
  return NON_NEW_CONDITION_PATTERN.test(normalizeConditionText(
    candidate.title,
    candidate.description,
    candidate.tag,
    Array.isArray(candidate.extensions) ? candidate.extensions.join(' ') : '',
    Array.isArray(candidate.reasons) ? candidate.reasons.join(' ') : '',
  ))
}

export function filterNonNewConditionCandidates({ candidates = [], productQuery = '', userContext = '' } = {}) {
  const allowsNonNew = allowsNonNewCondition(productQuery, userContext)
  const source = Array.isArray(candidates) ? candidates : []
  const filteredCandidates = allowsNonNew
    ? source
    : source.filter((candidate) => !hasNonNewCondition(candidate))

  return {
    allowsNonNew,
    candidates: filteredCandidates,
    excludedCount: source.length - filteredCandidates.length,
  }
}

export function sanitizeFinalizeCandidate(candidate, index) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {
      error: `Candidate ${index + 1} must be an object.`,
      isValid: false,
    }
  }

  const id = truncateText(candidate.id, 200)
  const title = truncateText(candidate.title, 300)

  if (!id || !title) {
    return {
      error: `Candidate ${index + 1} must include non-empty id and title fields.`,
      isValid: false,
    }
  }

  const numericPrice = candidate.numericPrice === null || candidate.numericPrice === undefined
    ? null
    : Number.isFinite(Number(candidate.numericPrice)) ? Number(candidate.numericPrice) : null
  const rating = candidate.rating === null || candidate.rating === undefined
    ? null
    : Number.isFinite(Number(candidate.rating)) ? Number(candidate.rating) : null
  const reviewCount = candidate.reviewCount === null || candidate.reviewCount === undefined
    ? null
    : Number.isFinite(Number(candidate.reviewCount)) ? Number(candidate.reviewCount) : null

  return {
    isValid: true,
    candidate: {
      id,
      score: Number.isFinite(Number(candidate.score)) ? Number(candidate.score) : 0,
      title,
      brandName: truncateText(candidate.brandName, 120),
      description: truncateText(candidate.description, 1200),
      source: truncateText(candidate.source, 160),
      price: truncateText(candidate.price, 80),
      numericPrice,
      rating,
      reviewCount,
      isPrime: Boolean(candidate.isPrime || candidate.is_prime || candidate.primeEligible || candidate.isPrimeEligible),
      delivery: truncateText(candidate.delivery, 160),
      tag: truncateText(candidate.tag, 120),
      extensions: sanitizeStringList(candidate.extensions, { maxItems: 6, maxItemLength: 120 }),
      multipleSources: Boolean(candidate.multipleSources),
      link: truncateText(candidate.link, 1000),
      image: truncateText(candidate.image, 1000),
      reasons: sanitizeStringList(candidate.reasons, { maxItems: 5, maxItemLength: 240 }),
      duplicateFamilyKey: truncateText(candidate.duplicateFamilyKey, 240),
      matchSignals: normalizeMatchSignals(candidate.matchSignals),
      attributes: sanitizeStringList(candidate.attributes, { maxItems: 6, maxItemLength: 60 }),
      trustSignals: normalizeTrustSignals(candidate.trustSignals),
      variantTokens: sanitizeStringList(candidate.variantTokens, { maxItems: 4, maxItemLength: 40 }),
    },
  }
}

function normalizeMatchSignals(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      titleMatches: 0,
      supportMatches: 0,
      detailMatches: 0,
      exactMatchSearchState: false,
      hasMultipleSources: false,
      hasDeliveryInfo: false,
      hasPrimeDelivery: false,
      hasTag: false,
    }
  }

  return {
    titleMatches: Number.isFinite(Number(value.titleMatches)) ? Number(value.titleMatches) : 0,
    supportMatches: Number.isFinite(Number(value.supportMatches)) ? Number(value.supportMatches) : 0,
    detailMatches: Number.isFinite(Number(value.detailMatches)) ? Number(value.detailMatches) : 0,
    exactMatchSearchState: Boolean(value.exactMatchSearchState),
    hasMultipleSources: Boolean(value.hasMultipleSources),
    hasDeliveryInfo: Boolean(value.hasDeliveryInfo),
    hasPrimeDelivery: Boolean(value.hasPrimeDelivery),
    hasTag: Boolean(value.hasTag),
  }
}

function normalizeTrustSignals(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      hasMultipleSources: false,
      hasRealDescription: false,
      ratingBand: '',
      reviewBand: '',
      score: 0,
    }
  }

  return {
    hasMultipleSources: Boolean(value.hasMultipleSources),
    hasRealDescription: Boolean(value.hasRealDescription),
    ratingBand: truncateText(value.ratingBand, 40),
    reviewBand: truncateText(value.reviewBand, 40),
    score: Number.isFinite(Number(value.score)) ? Number(value.score) : 0,
  }
}
