import { buildQuery, normalizeResult } from './search-data.js'

export const DEFAULT_FILTER_CONFIG = {
  finalResultLimit: 6,
  candidatePoolSize: 20,
  minimumScore: 0,
  diversifyPoolMultiplier: 2,
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'the',
  'with',
  'to',
  'of',
  'in',
  'on',
  'by',
  'or',
  'at',
  'from',
])
const DUPLICATE_FAMILY_STOP_WORDS = new Set([
  ...STOP_WORDS,
  'edition',
  'new',
  'pack',
  'set',
  'size',
])
const VARIANT_TOKENS = new Set([
  'black',
  'blue',
  'brown',
  'casual',
  'coast',
  'compact',
  'extra',
  'formal',
  'gray',
  'green',
  'kids',
  'large',
  'leather',
  'lightweight',
  'max',
  'mens',
  'mini',
  'narrow',
  'premium',
  'pro',
  'running',
  'small',
  'waterproof',
  'white',
  'wide',
  'women',
  'womens',
])
const ATTRIBUTE_PATTERNS = [
  ['waterproof', /\bwaterproof\b/i],
  ['running', /\brunning\b/i],
  ['formal', /\b(dress|formal)\b/i],
  ['casual', /\bcasual\b/i],
  ['kit', /\b(kit|paint by numbers|diy)\b/i],
  ['wall_art', /\b(wall art|canvas art|framed art|poster|print)\b/i],
  ['abstract', /\babstract\b/i],
  ['framed', /\bframed\b/i],
  ['leather', /\bleather\b/i],
  ['beginner_friendly', /\bbeginner(s)?\b/i],
]

function tokenize(value) {
  return (value.toLowerCase().match(/[a-z0-9]+/g) || []).filter((token) => !STOP_WORDS.has(token))
}

function uniqueTokens(value) {
  return [...new Set(tokenize(value))]
}

function normalizedTitleKey(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(case|cover|folio|protective|generation|inch|ipad|apple)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildDuplicateFamilyKey(title) {
  const tokens = tokenize(title).filter((token) => !DUPLICATE_FAMILY_STOP_WORDS.has(token))
  const baseTokens = tokens.filter((token) => !VARIANT_TOKENS.has(token))

  return (baseTokens.length > 0 ? baseTokens : tokens).slice(0, 5).join(' ')
}

function getVariantTokens(title) {
  return uniqueTokens(title).filter((token) => VARIANT_TOKENS.has(token)).slice(0, 4)
}

function countTokenMatches(targetTokens, candidateText) {
  const haystack = new Set(tokenize(candidateText))
  return targetTokens.filter((token) => haystack.has(token)).length
}

function hasWeakMetadata(item) {
  const hasPrice = Number.isFinite(Number(item.extracted_price)) || Boolean(item.price)
  const hasImage = Boolean(
    item.thumbnail || item.thumbnail_hd || item.serpapi_thumbnail || item.product_link,
  )
  const hasText = Boolean(item.title?.trim()) && hasImage
  return !hasPrice || !hasText
}

function hasRealDescription(item) {
  const supportText = [item.snippet, ...(item.extensions || [])]
    .filter(Boolean)
    .join(' ')
    .trim()

  return supportText.length >= 20
}

function extractAttributes(item) {
  const supportText = [item.title, item.snippet, ...(item.extensions || [])].filter(Boolean).join(' ')

  return ATTRIBUTE_PATTERNS
    .filter(([, pattern]) => pattern.test(supportText))
    .map(([attribute]) => attribute)
    .slice(0, 6)
}

function buildTrustSignals(item, normalizedDescription) {
  const rating = Number(item.rating ?? 0)
  const reviews = Number(item.reviews ?? 0)
  let score = 0

  if (rating >= 4.5) {
    score += 2
  } else if (rating >= 4) {
    score += 1
  } else if (rating > 0 && rating < 3.5) {
    score -= 1
  }

  if (reviews >= 500) {
    score += 2
  } else if (reviews >= 50) {
    score += 1
  } else if (reviews <= 1) {
    score -= 2
  }

  if (normalizedDescription) {
    score += 1
  } else if (!hasRealDescription(item)) {
    score -= 1
  }

  if (item.multiple_sources) {
    score += 1
  }

  return {
    hasMultipleSources: Boolean(item.multiple_sources),
    hasRealDescription: Boolean(normalizedDescription),
    ratingBand: rating >= 4.5 ? 'high' : rating >= 4 ? 'solid' : rating > 0 ? 'mixed' : 'unknown',
    reviewBand: reviews >= 500 ? 'strong' : reviews >= 50 ? 'moderate' : reviews > 1 ? 'light' : 'thin',
    score,
  }
}

function scoreResult(item, queryTokens, detailsTokens, searchState) {
  const titleText = item.title || ''
  const supportText = [item.snippet, item.source, ...(item.extensions || [])].filter(Boolean).join(' ')
  const titleMatches = countTokenMatches(queryTokens, titleText)
  const supportMatches = countTokenMatches(queryTokens, supportText)
  const detailMatches = detailsTokens.length > 0 ? countTokenMatches(detailsTokens, `${titleText} ${supportText}`) : 0
  const rating = Number(item.rating ?? 0)
  const reviews = Number(item.reviews ?? 0)
  const reviewScore = Math.min(Math.log10(reviews + 1), 4)
  const price = Number(item.extracted_price ?? 0)

  let score = 0
  score += titleMatches * 8
  score += supportMatches * 3
  score += detailMatches * 1.5
  score += Math.max(Math.min(rating, 5), 0) * 1.25
  score += reviewScore
  score += item.multiple_sources ? 1.5 : 0
  score += item.delivery ? 0.5 : 0
  score += item.tag ? 0.25 : 0
  score += /exact/i.test(searchState || '') ? 2 : 0
  score += Number.isFinite(price) && price > 0 ? 0.25 : -2

  if (titleMatches === 0 && supportMatches === 0) {
    score -= 12
  }

  if (reviews <= 1) {
    score -= 1.5
  }

  return score
}

function passHardFilters(item, queryTokens) {
  if (!item?.title?.trim()) {
    return false
  }

  if (hasWeakMetadata(item)) {
    return false
  }

  const titleAndSnippet = `${item.title} ${item.snippet || ''}`
  const queryMatches = countTokenMatches(queryTokens, titleAndSnippet)

  if (queryTokens.length >= 2 && queryMatches === 0) {
    return false
  }

  return true
}

function diversifyResults(scoredItems, limit) {
  const selected = []
  const seenTitleKeys = new Set()
  const perSourceCount = new Map()

  for (const entry of scoredItems) {
    if (selected.length >= limit) {
      break
    }

    const titleKey = normalizedTitleKey(entry.item.title)

    if (titleKey && seenTitleKeys.has(titleKey)) {
      continue
    }

    const sourceKey = (entry.item.source || '').toLowerCase()
    const sourceCount = perSourceCount.get(sourceKey) || 0

    if (sourceKey && sourceCount >= 2) {
      continue
    }

    selected.push(entry.item)

    if (titleKey) {
      seenTitleKeys.add(titleKey)
    }

    if (sourceKey) {
      perSourceCount.set(sourceKey, sourceCount + 1)
    }
  }

  return selected
}

function buildMatchSignals(item, queryTokens, detailsTokens, searchState) {
  const titleText = item.title || ''
  const supportText = [item.snippet, item.source, ...(item.extensions || [])].filter(Boolean).join(' ')
  const titleMatches = countTokenMatches(queryTokens, titleText)
  const supportMatches = countTokenMatches(queryTokens, supportText)
  const detailMatches = detailsTokens.length > 0 ? countTokenMatches(detailsTokens, `${titleText} ${supportText}`) : 0

  return {
    titleMatches,
    supportMatches,
    detailMatches,
    exactMatchSearchState: /exact/i.test(searchState || ''),
    hasMultipleSources: Boolean(item.multiple_sources),
    hasDeliveryInfo: Boolean(item.delivery),
    hasTag: Boolean(item.tag),
  }
}

function buildAiCandidate(item, index, score, matchSignals, reasonFallback) {
  const normalized = normalizeResult(item, index, reasonFallback)

  if (!normalized) {
    return null
  }

  const duplicateFamilyKey = buildDuplicateFamilyKey(normalized.title)
  const attributes = extractAttributes(item)
  const trustSignals = buildTrustSignals(item, normalized.description)

  return {
    id: normalized.id,
    score: Number(score.toFixed(2)),
    title: normalized.title,
    description: normalized.description,
    source: normalized.subtitle,
    price: normalized.price,
    numericPrice: Number.isFinite(Number(item.extracted_price)) ? Number(item.extracted_price) : null,
    rating: normalized.rating,
    reviewCount: normalized.reviewCount,
    delivery: item.delivery || '',
    tag: item.tag || '',
    extensions: Array.isArray(item.extensions) ? item.extensions.filter(Boolean) : [],
    multipleSources: Boolean(item.multiple_sources),
    link: normalized.link,
    image: normalized.image,
    reasons: normalized.reasons,
    duplicateFamilyKey,
    matchSignals,
    attributes,
    trustSignals,
    variantTokens: getVariantTokens(normalized.title),
  }
}

export function getFilteredSearchArtifacts(
  payload,
  {
    productQuery,
    details = '',
    finalResultLimit = DEFAULT_FILTER_CONFIG.finalResultLimit,
    candidatePoolSize = DEFAULT_FILTER_CONFIG.candidatePoolSize,
    minimumScore = DEFAULT_FILTER_CONFIG.minimumScore,
    diversifyPoolMultiplier = DEFAULT_FILTER_CONFIG.diversifyPoolMultiplier,
    reasonFallback,
  },
) {
  const shoppingResults = Array.isArray(payload.shopping_results) ? payload.shopping_results : []
  const queryTokens = uniqueTokens(productQuery)
  const detailsTokens = uniqueTokens(details)
  const searchState = payload.search_information?.shopping_results_state || ''

  const dedupedByProductId = new Map()

  for (const item of shoppingResults) {
    const productId = item.product_id || `${item.title || ''}-${item.source || ''}-${item.position || ''}`

    if (!dedupedByProductId.has(productId)) {
      dedupedByProductId.set(productId, item)
    }
  }

  const candidates = [...dedupedByProductId.values()].filter((item) => passHardFilters(item, queryTokens))

  const scoredItems = candidates
    .map((item) => ({
      item,
      score: scoreResult(item, queryTokens, detailsTokens, searchState),
    }))
    .filter((entry) => entry.score > minimumScore)
    .sort((left, right) => right.score - left.score)

  const selectedItems = diversifyResults(
    scoredItems,
    Math.max(candidatePoolSize * diversifyPoolMultiplier, candidatePoolSize),
  )
  const aiCandidates = selectedItems
    .map((item, index) => {
      const scoredEntry = scoredItems.find((entry) => entry.item === item)
      const matchSignals = buildMatchSignals(item, queryTokens, detailsTokens, searchState)
      return buildAiCandidate(item, index, scoredEntry?.score || 0, matchSignals, reasonFallback)
    })
    .filter(Boolean)
    .slice(0, candidatePoolSize)

  return {
    candidatePool: {
      query: productQuery,
      details,
      combinedSearchText: buildQuery(productQuery, details),
      searchState,
      similarQueries: getSimilarQueries(payload),
      candidates: aiCandidates,
    },
    results: aiCandidates.slice(0, finalResultLimit).map((candidate, index) => ({
      id: candidate.id,
      title: candidate.title,
      subtitle: candidate.source,
      price: candidate.price,
      rating: candidate.rating,
      reviewCount: candidate.reviewCount,
      description: candidate.description,
      reasons: candidate.reasons,
      image: candidate.image,
      link: candidate.link,
      badgeLabel: index === 0 ? 'Best match' : '',
      badgeReason: index === 0 ? 'Top overall fit from the cleaned product pool.' : '',
    })),
  }
}

export function getFilteredNormalizedResults(payload, options) {
  return getFilteredSearchArtifacts(payload, options).results
}

export function getSimilarQueries(payload) {
  if (Array.isArray(payload.related_searches)) {
    return payload.related_searches
  }

  if (Array.isArray(payload.filters)) {
    return payload.filters
  }

  return []
}

export function getSearchState(payload) {
  return payload.search_information?.shopping_results_state || ''
}

export function getCombinedSearchText(productQuery, details = '') {
  return buildQuery(productQuery, details)
}
