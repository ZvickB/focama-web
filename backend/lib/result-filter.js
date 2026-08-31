import { buildQuery, normalizeResult } from './search-data.js'
import { moderateProductList } from './content-moderation.js'
import { areSameProductFamily } from './product-identity.js'

export const DEFAULT_FILTER_CONFIG = {
  finalResultLimit: 6,
  candidatePoolSize: 30,
  minimumScore: 0,
  diversifyPoolMultiplier: 2,
  diversifyBySource: true,
  skipHardFilter: false,
  hardFilterFallbackThreshold: 0,
  hardFilterFallbackPoolSize: 20,
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
const REFERENCE_CONTENT_PATTERN = /\b(book|books|calendar|guide|history|magazine|manual|poster|print)\b/i
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

function parsePriceText(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().replace(/,/g, '')

  if (!normalized) {
    return null
  }

  const match = normalized.match(/-?\d+(?:\.\d+)?/)

  if (!match) {
    return null
  }

  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

export function hasKnownNonPositivePrice(item) {
  if (!item || typeof item !== 'object') {
    return false
  }

  const numericCandidates = [
    item.extracted_price,
    item.numericPrice,
    item.price?.value,
  ]

  for (const candidate of numericCandidates) {
    const numericValue = Number(candidate)

    if (Number.isFinite(numericValue)) {
      return numericValue <= 0
    }
  }

  const parsedTextPrice = parsePriceText(
    typeof item.price === 'string'
      ? item.price
      : typeof item.price?.raw === 'string'
        ? item.price.raw
        : '',
  )

  return parsedTextPrice !== null ? parsedTextPrice <= 0 : false
}

export function lacksKnownPositivePrice(item) {
  if (!item || typeof item !== 'object') {
    return true
  }

  const numericCandidates = [
    item.extracted_price,
    item.numericPrice,
    item.price?.value,
  ]

  for (const candidate of numericCandidates) {
    const numericValue = Number(candidate)

    if (Number.isFinite(numericValue)) {
      return numericValue <= 0
    }
  }

  const parsedTextPrice = parsePriceText(
    typeof item.price === 'string'
      ? item.price
      : typeof item.price?.raw === 'string'
        ? item.price.raw
        : '',
  )

  if (parsedTextPrice !== null) {
    return parsedTextPrice <= 0
  }

  return true
}

function uniqueTokens(value) {
  return [...new Set(tokenize(value))]
}

function normalizedText(value) {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() : ''
}

function containsTokenSequence(text, tokens) {
  if (!text || tokens.length === 0) return false
  return ` ${text} `.includes(` ${tokens.join(' ')} `)
}

function compactText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function editDistance(left, right) {
  if (left === right) return 0
  if (!left || !right) return Math.max(left.length, right.length)

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]
    previous[0] = leftIndex

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const saved = previous[rightIndex]
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
      diagonal = saved
    }
  }

  return previous[right.length]
}

function isOneCharacterNearMatch(left, right) {
  return left.length >= 5 && right.length >= 5 && editDistance(left, right) === 1
}

function getHighConfidenceSearchCorrection(productQuery, candidates, explicitIdentifierRequirement) {
  // A correction is deliberately advisory. Unlike an exact, structured brand
  // match, it never changes the candidate pool or acts as a hard constraint.
  if (explicitIdentifierRequirement.hasRequirement) return null

  const queryTokens = uniqueTokens(productQuery)
  const correctionsByBrand = new Map()

  for (const item of candidates) {
    const brand = String(item?.brand || '').trim()
    const compactBrand = compactText(brand)
    if (compactBrand.length < 5) continue

    const matchedBrandToken = queryTokens.find((token) =>
      isOneCharacterNearMatch(compactText(token), compactBrand),
    )
    if (!matchedBrandToken) continue

    const remainingTokens = queryTokens.filter((token) => token !== matchedBrandToken)
    if (remainingTokens.length === 0) continue

    const titleTokens = uniqueTokens(item?.title || '')
    const correctedProductTokens = new Map()

    for (const token of remainingTokens) {
      const titleMatch = titleTokens.find((titleToken) =>
        titleToken === token || isOneCharacterNearMatch(token, titleToken),
      )
      if (titleMatch) correctedProductTokens.set(token, titleMatch)
    }

    // Brand similarity alone is not enough. The candidate must also prove the
    // requested product context; this is what keeps "apple sauce" from being
    // treated as an Apple-electronics correction.
    if (correctedProductTokens.size === 0) continue

    const suggestedQuery = queryTokens
      .map((token) => {
        if (token === matchedBrandToken) return brand
        return correctedProductTokens.get(token) || token
      })
      .join(' ')

    const brandKey = compactBrand
    correctionsByBrand.set(brandKey, {
      originalQuery: productQuery,
      suggestedQuery,
      source: 'brand_correction',
    })
  }

  return correctionsByBrand.size === 1 ? [...correctionsByBrand.values()][0] : null
}

function getExplicitIdentifierRequirement(productQuery, candidates) {
  const queryTokens = uniqueTokens(productQuery)
  const queryText = normalizedText(productQuery)
  const structuredBrands = new Map()

  for (const item of candidates) {
    const brandTokens = uniqueTokens(item?.brand || '')
    // Short single-word brands (notably "On") are often ordinary language.
    // Requiring at least three characters here avoids turning ambiguous wording
    // into a hidden hard constraint.
    if (brandTokens.length === 0 || (brandTokens.length === 1 && brandTokens[0].length < 3)) continue
    const brandKey = brandTokens.join(' ')
    const remainingQueryTokens = queryTokens.filter((token) => !brandTokens.includes(token))
    const itemTitle = normalizedText(item?.title || '')
    const hasProductContext = remainingQueryTokens.length === 0 ||
      remainingQueryTokens.some((token) => containsTokenSequence(itemTitle, [token]))

    // The brand must occur in an actual result for the rest of the query too.
    // This prevents a stray Apple Watch result from making "apple pie pan" an
    // Apple-brand-only search, while still accepting "Apple Watch" or
    // "Rolex watch" as explicit identifiers.
    if (containsTokenSequence(queryText, brandTokens) && hasProductContext) {
      structuredBrands.set(brandKey, brandTokens)
    }
  }

  const brands = [...structuredBrands.values()]
  const brandTokens = new Set(brands.flat())
  // Plain words are too ambiguous to enforce before AI ranking: a word such
  // as "undershirt" can describe the requested product while Amazon calls an
  // exact match a "T-Shirt". Only compact alphanumeric identifiers provide
  // enough deterministic evidence to remove same-brand candidates here.
  // Natural-language model names and product descriptors remain visible to
  // the ranker, which can apply the full query without shrinking the pool.
  const modelTokens = queryTokens.filter((token) => (
    !brandTokens.has(token) &&
    // Alphanumeric strings with a digit are explicit model-like identifiers
    // (for example WH1000XM5 or Q30), unlike a plain size such as "42".
    /[a-z]/.test(token) && /\d/.test(token)
  ))

  return {
    brands,
    modelTokens,
    hasRequirement: brands.length > 0 || modelTokens.length > 0,
  }
}

function passesExplicitIdentifierRequirement(item, requirement, productQuery) {
  if (!requirement.hasRequirement) return true

  const titleAndBrand = normalizedText(`${item.title || ''} ${item.brand || ''}`)
  const hasRequiredBrand = requirement.brands.every((brandTokens) =>
    containsTokenSequence(titleAndBrand, brandTokens),
  )
  const hasRequiredModel = requirement.modelTokens.every((token) =>
    containsTokenSequence(titleAndBrand, [token]),
  )

  if (!hasRequiredBrand || !hasRequiredModel) return false

  // A branded product search should not turn into a bibliography just because
  // a title repeats the requested make/model (for example, a Rolex history).
  return REFERENCE_CONTENT_PATTERN.test(productQuery) || !REFERENCE_CONTENT_PATTERN.test(item.title || '')
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
  const hasPrice = !lacksKnownPositivePrice(item) && (
    Number.isFinite(Number(item.extracted_price)) ||
    Number.isFinite(Number(item.numericPrice)) ||
    Boolean(item.price)
  )
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

function diversifyResults(scoredItems, limit, { diversifyBySource = true } = {}) {
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

    if (diversifyBySource && sourceKey && sourceCount >= 2) {
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

function buildVariantSignature(title) {
  return getVariantTokens(title).sort().join('|')
}

function isClosePriceMatch(leftPrice, rightPrice) {
  const left = Number(leftPrice)
  const right = Number(rightPrice)

  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) {
    return false
  }

  const threshold = Math.max(5, Math.min(left, right) * 0.08)
  return Math.abs(left - right) <= threshold
}

function isLikelySameFamilyVariant(leftItem, rightItem) {
  if (areSameProductFamily(leftItem, rightItem)) {
    return true
  }

  const leftFamilyKey = buildDuplicateFamilyKey(leftItem.title)
  const rightFamilyKey = buildDuplicateFamilyKey(rightItem.title)

  if (!leftFamilyKey || !rightFamilyKey || leftFamilyKey !== rightFamilyKey) {
    return false
  }

  const leftVariantSignature = buildVariantSignature(leftItem.title)
  const rightVariantSignature = buildVariantSignature(rightItem.title)

  if (leftVariantSignature !== rightVariantSignature) {
    return false
  }

  const leftSource = String(leftItem.source || '').toLowerCase().trim()
  const rightSource = String(rightItem.source || '').toLowerCase().trim()

  if (leftSource && rightSource && leftSource === rightSource) {
    return true
  }

  const leftPrice = Number(leftItem.extracted_price)
  const rightPrice = Number(rightItem.extracted_price)

  if (isClosePriceMatch(leftPrice, rightPrice)) {
    return true
  }

  return false
}

function collapseDuplicateFamilies(selectedItems) {
  const collapsed = []

  for (const item of selectedItems) {
    const isRedundant = collapsed.some((existingItem) => isLikelySameFamilyVariant(existingItem, item))

    if (isRedundant) {
      continue
    }

    collapsed.push(item)
  }

  return collapsed
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
    hasPrimeDelivery: Boolean(item.isPrime),
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
  const isPrime = Boolean(
    item.isPrime ||
    item.is_prime ||
    item.primeEligible ||
    item.isPrimeEligible ||
    item.is_prime_eligible,
  )

  return {
    id: normalized.id,
    score: Number(score.toFixed(2)),
    title: normalized.title,
    brandName: typeof item.brand === 'string' ? item.brand.trim().slice(0, 120) : '',
    description: normalized.description,
    source: normalized.subtitle,
    price: normalized.price,
    numericPrice: Number.isFinite(Number(item.extracted_price)) ? Number(item.extracted_price) : null,
    rating: normalized.rating,
    reviewCount: normalized.reviewCount,
    amazonPosition: typeof item.position === 'number' ? item.position : null,
    isPrime,
    delivery: item.delivery || '',
    tag: item.tag || '',
    extensions: Array.isArray(item.extensions) ? item.extensions.filter(Boolean) : [],
    multipleSources: Boolean(item.multiple_sources),
    link: normalized.link,
    image: item.moderation?.outcome === 'hide_image' ? '' : normalized.image,
    moderation: item.moderation,
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
    diversifyBySource = DEFAULT_FILTER_CONFIG.diversifyBySource,
    skipHardFilter = DEFAULT_FILTER_CONFIG.skipHardFilter,
    hardFilterFallbackThreshold = DEFAULT_FILTER_CONFIG.hardFilterFallbackThreshold,
    hardFilterFallbackPoolSize = DEFAULT_FILTER_CONFIG.hardFilterFallbackPoolSize,
    reasonFallback,
  },
) {
  const shoppingResults = moderateProductList(payload.shopping_results)
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

  const dedupedCandidates = [...dedupedByProductId.values()]
    .filter((item) => !lacksKnownPositivePrice(item))
  const explicitIdentifierRequirement = getExplicitIdentifierRequirement(productQuery, dedupedCandidates)
  const searchCorrection = getHighConfidenceSearchCorrection(
    productQuery,
    dedupedCandidates,
    explicitIdentifierRequirement,
  )
  const identifierEligibleCandidates = dedupedCandidates.filter((item) =>
    passesExplicitIdentifierRequirement(item, explicitIdentifierRequirement, productQuery),
  )
  const hardFilteredCandidates = skipHardFilter
    ? identifierEligibleCandidates
    : identifierEligibleCandidates.filter((item) => passHardFilters(item, queryTokens))
  const useHardFilterFallback = !skipHardFilter
    && hardFilterFallbackThreshold > 0
    && hardFilteredCandidates.length < hardFilterFallbackThreshold
  const candidates = useHardFilterFallback
    // Never bypass an explicit named brand/model requirement during the broad
    // Serp-style fallback. A short exact pool must reach finalize as short.
    ? identifierEligibleCandidates.slice(0, Math.max(hardFilterFallbackPoolSize, candidatePoolSize))
    : hardFilteredCandidates

  const scoredEntries = candidates
    .map((item) => ({
      item,
      score: scoreResult(item, queryTokens, detailsTokens, searchState),
    }))
  const scoredItems = (useHardFilterFallback ? scoredEntries : scoredEntries.filter(
    (entry) => entry.score > minimumScore,
  ))
    .sort((left, right) => right.score - left.score)

  const selectedItems = diversifyResults(
    scoredItems,
    Math.max(candidatePoolSize * diversifyPoolMultiplier, candidatePoolSize),
    { diversifyBySource },
  )
  const collapsedItems = collapseDuplicateFamilies(selectedItems)
  const aiCandidates = collapsedItems
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
      searchCorrection,
      candidates: aiCandidates,
    },
    results: aiCandidates.slice(0, finalResultLimit).map((candidate, index) => ({
      id: candidate.id,
      title: candidate.title,
      subtitle: candidate.source,
      price: candidate.price,
      rating: candidate.rating,
      reviewCount: candidate.reviewCount,
      isPrime: Boolean(candidate.isPrime),
      delivery: candidate.delivery || '',
      description: candidate.description,
      reasons: candidate.reasons,
      image: candidate.image,
      moderation: candidate.moderation,
      link: candidate.link,
      badgeLabel: index === 0 ? 'Best match' : '',
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
