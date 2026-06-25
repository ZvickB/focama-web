const GENERIC_IDENTITY_TOKENS = new Set([
  'a', 'and', 'for', 'with', 'the', 'new', 'wireless', 'bluetooth', 'portable',
  'product', 'edition', 'model', 'black', 'white', 'gray', 'grey', 'gaming', 'cordless',
])

const ATTRIBUTE_ALIASES = {
  condition: {
    new: ['new'],
  },
  color: {
    graphite: ['graphite', 'graphite grey', 'graphite gray'],
    gray: ['gray', 'grey'],
    grey: ['gray', 'grey'],
  },
  generation: {
    '4': ['4', '4th', 'fourth'],
    '4th generation': ['4th generation', '4th gen', 'generation 4', 'airpods 4'],
  },
}

const CONDITION_CONFLICT = /\b(?:used|renewed|refurbished|remanufactured|open[ -]?box|pre[ -]?owned|restored)\b/i
const MARKETPLACE_LABEL = /\bmarketplace\b/i
const ACCESSORY_TITLE = /\b(?:case|cover|skin|sleeve|ear\s*tips?|ear\s*hooks?|strap|holder|stand|mount|replacement|spare|adapter|cable|cord|charger)\b/i
const MODEL_TOKEN = /\b[A-Z]{1,5}[-\s]?\d{2,5}[A-Z0-9]{0,5}\b/gi

function clean(value) {
  return String(value || '').trim()
}

export function normalizeEvidence(value) {
  return clean(value)
    .toLowerCase()
    .replace(/™|®|©/g, '')
    .replace(/\bactive noise cancel(?:ing|ling|lation)\b/g, ' anc ')
    .replace(/\bnoise cancel(?:ing|ling|lation)\b/g, ' anc ')
    .replace(/\bsolid state drive\b/g, ' ssd ')
    .replace(/\bterabytes?\b/g, ' tb ')
    .replace(/\bgigabytes?\b/g, ' gb ')
    .replace(/([0-9])\s+(tb|gb|qt|quart|inch|inches)\b/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(value) {
  return normalizeEvidence(value).replace(/\s+/g, '')
}

function evidenceIncludes(evidence, expected, field = '') {
  const normalizedEvidence = normalizeEvidence(evidence)
  const normalizedExpected = normalizeEvidence(expected)
  if (!normalizedExpected) return true

  if (field === 'product_type') {
    const requiredTokens = normalizedExpected.split(' ').filter((token) => token && !GENERIC_IDENTITY_TOKENS.has(token))
    return requiredTokens.length > 0 && requiredTokens.every((token) => normalizedEvidence.includes(token))
  }

  const aliases = ATTRIBUTE_ALIASES[field]?.[normalizedExpected] || [normalizedExpected]
  return aliases.some((alias) => {
    const normalizedAlias = normalizeEvidence(alias)
    return normalizedEvidence.includes(normalizedAlias) || compact(evidence).includes(compact(normalizedAlias))
  })
}

function getIdentifier(product) {
  return product?.match_identifier || product?.matchIdentifier || {}
}

function sourceTitle(product) {
  return clean(product?.source_title || product?.sourceTitle || product?.display_title || product?.displayTitle)
}

function authoritativeCode(identifier) {
  const provenance = identifier?.provenance || {}
  return ['gtin', 'upc', 'ean']
    .map((field) => provenance[field] === 'ai_normalized' ? '' : clean(identifier?.[field]))
    .find(Boolean) || ''
}

function identityTerms(product) {
  const identifier = getIdentifier(product)
  const attributes = identifier?.attributes || {}
  const direct = [
    identifier.brand,
    identifier.model_number || identifier.modelNumber,
    attributes.generation,
    identifier.product_type || identifier.productType,
  ]
    .flatMap((value) => normalizeEvidence(value).split(' '))
    .filter((token) => token.length >= 2 && !GENERIC_IDENTITY_TOKENS.has(token))

  const titleTerms = normalizeEvidence(sourceTitle(product))
    .split(' ')
    .filter((token) => token.length >= 3 && !GENERIC_IDENTITY_TOKENS.has(token))
    .slice(0, 8)

  return [...new Set([...direct, ...titleTerms])]
}

export function scoreShoppingIdentity(product, shoppingOffer) {
  const identifier = getIdentifier(product)
  const title = clean(shoppingOffer?.title)
  const normalizedTitle = normalizeEvidence(title)
  if (!normalizedTitle || ACCESSORY_TITLE.test(title)) return { accepted: false, score: 0, reason: 'invalid_title' }
  if (CONDITION_CONFLICT.test(title) && !CONDITION_CONFLICT.test(sourceTitle(product))) {
    return { accepted: false, score: 0, reason: 'condition_conflict' }
  }

  const brand = clean(identifier?.brand)
  const model = clean(identifier?.model_number || identifier?.modelNumber)
  const generation = clean(identifier?.attributes?.generation)
  const code = authoritativeCode(identifier)
  if (brand && !evidenceIncludes(title, brand)) return { accepted: false, score: 0, reason: 'brand_missing' }
  if (model && !evidenceIncludes(title, model)) return { accepted: false, score: 0, reason: 'model_missing' }
  if (code && evidenceIncludes(title, code)) return { accepted: true, score: 100, reason: 'authoritative_code' }

  let score = brand ? 3 : 0
  if (model) score += 5
  if (generation && evidenceIncludes(title, generation, 'generation')) score += 3
  score += identityTerms(product).filter((term) => normalizedTitle.includes(term)).length

  return {
    accepted: score >= (model ? 8 : 6),
    score,
    reason: score >= (model ? 8 : 6) ? 'identity_terms' : 'insufficient_identity',
  }
}

function modelTokens(value) {
  return [...clean(value).matchAll(MODEL_TOKEN)]
    .map((match) => normalizeEvidence(match[0]))
    .filter(Boolean)
}

function sameIdentityFamily(product, left, right) {
  const expectedModel = clean(getIdentifier(product)?.model_number || getIdentifier(product)?.modelNumber)
  if (expectedModel) {
    return evidenceIncludes(left?.title, expectedModel) && evidenceIncludes(right?.title, expectedModel)
  }

  const sourceModels = modelTokens(sourceTitle(product))
  if (sourceModels.length > 0) {
    return sourceModels.some((model) => (
      evidenceIncludes(left?.title, model) && evidenceIncludes(right?.title, model)
    ))
  }

  const leftModels = modelTokens(left?.title)
  const rightModels = modelTokens(right?.title)
  if (leftModels.length > 0 || rightModels.length > 0) {
    return leftModels.some((model) => rightModels.includes(model))
  }

  return normalizeEvidence(left?.title) === normalizeEvidence(right?.title)
}

const TRUSTED_SOURCE_PREFIXES = [
  'best buy', 'target', 'walmart', 'costco', 'staples', 'home depot', 'lowes',
  'b&h photo', 'bhphotovideo', 'adorama', 'newegg', 'amazon', 'dell',
  'sweetwater', 'macys', 'macy\'s', 'pc richard', 'verizon', 'sony',
  'apple', 'samsung', 'dyson', 'kitchenaid', 'lenovo', 'hp', 'lg',
  'canadian tire', 'london drugs', 'visions',
  'kohl\'s', 'kohls', 'overstock', 'office depot', 'abt',
]

function isTrustedSource(source) {
  const normalized = clean(source).toLowerCase()
  return TRUSTED_SOURCE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

export function selectUniqueShoppingProduct(product, offers, { preferTrustedSources = true } = {}) {
  const scored = (Array.isArray(offers) ? offers : [])
    .map((offer) => ({ offer, ...scoreShoppingIdentity(product, offer) }))
    .filter((entry) => entry.accepted && (entry.offer?.immersive_url || entry.offer?.immersive_product_page_token))

  const ranked = scored
    .map((entry) => ({
      ...entry,
      trustedSource: preferTrustedSources && isTrustedSource(entry.offer?.source),
    }))
    .sort((a, b) => (
      b.score - a.score ||
      Number(b.trustedSource) - Number(a.trustedSource)
    ))

  if (!ranked.length) return { offer: null, reason: 'no_exact_shopping_product', ranked }
  if (ranked[1] && ranked[1].score === ranked[0].score && !sameIdentityFamily(product, ranked[0].offer, ranked[1].offer)) {
    return { offer: ranked[0].offer, reason: 'ambiguous_top_pick', ambiguous: true, ranked }
  }
  return { offer: ranked[0].offer, reason: 'selected', ranked }
}

function selectedVariantEvidence(immersive) {
  return (Array.isArray(immersive?.variants) ? immersive.variants : [])
    .flatMap((variant) => (Array.isArray(variant?.items) ? variant.items : []))
    .filter((item) => item?.selected === true)
    .map((item) => clean(item?.name))
    .filter(Boolean)
}

function sourceRequirements(product) {
  const identifier = getIdentifier(product)
  const attributes = identifier?.attributes && typeof identifier.attributes === 'object'
    ? identifier.attributes
    : {}
  const title = sourceTitle(product)
  const requirements = []

  for (const [field, rawValue] of Object.entries(attributes)) {
    const value = clean(rawValue)
    if (!value || field === 'material' || field === 'color') continue
    if (evidenceIncludes(title, value, field) || field === 'condition') {
      requirements.push({ field, value })
    }
  }

  const tierRequirements = [
    [/\bactive noise cancel(?:ing|ling|lation)\b|\banc\b/i, 'feature_tier', 'anc'],
    [/\boled\b/i, 'display_tier', 'oled'],
  ]
  for (const [pattern, field, value] of tierRequirements) {
    if (pattern.test(title)) requirements.push({ field, value })
  }

  return requirements
}

function hasConflictingMultiValue(evidence, required) {
  const value = normalizeEvidence(required)
  if (/\b\d+(?:\.\d+)?\s*(?:tb|gb)\b/.test(value)) {
    const capacities = [...normalizeEvidence(evidence).matchAll(/\b\d+(?:\.\d+)?(?:tb|gb)\b/g)].map((match) => match[0])
    return new Set(capacities).size > 1
  }
  return false
}

function canUseGroupLevelAttributeProof(field) {
  return field === 'color' || field === 'generation' || field === 'display_tier' || field === 'feature_tier'
}

function addOptionalAttributeProof({ evidence, field, immersiveTitle, product, proof, variants, value }) {
  const expected = clean(value)
  if (!expected || !evidenceIncludes(sourceTitle(product), expected, field)) return

  const selectedProof = variants.some((variant) => evidenceIncludes(variant, expected, field))
  const groupProof = canUseGroupLevelAttributeProof(field) && evidenceIncludes(immersiveTitle, expected, field)
  const generalProof = evidenceIncludes(evidence, expected, field)

  if (selectedProof || groupProof || generalProof) {
    proof.push({
      field,
      value: expected,
      source: selectedProof ? 'selected_variant' : groupProof ? 'product_group_title' : 'product_or_store_title',
    })
  }
}

const HARD_FAILURE_SET = new Set(['marketplace_offer', 'accessory_like_title', 'condition_conflict', 'brand_missing'])

export function proveExactProductVariant({ product, shoppingOffer, immersive, storeOffer }) {
  const identifier = getIdentifier(product)
  const productTitle = clean(immersive?.title || shoppingOffer?.title)
  const storeTitle = clean(storeOffer?.title)
  const variants = selectedVariantEvidence(immersive)
  const evidence = [productTitle, storeTitle, ...variants].join(' | ')
  const failures = []
  const proof = []

  if (MARKETPLACE_LABEL.test(storeOffer?.retailer || '')) failures.push('marketplace_offer')
  if (ACCESSORY_TITLE.test(storeTitle)) failures.push('accessory_like_title')
  if (CONDITION_CONFLICT.test(storeTitle) && !CONDITION_CONFLICT.test(sourceTitle(product))) failures.push('condition_conflict')

  for (const [field, value] of [
    ['brand', identifier?.brand],
    ['model_number', identifier?.model_number || identifier?.modelNumber],
    ['product_type', identifier?.product_type || identifier?.productType],
  ]) {
    if (!clean(value)) continue
    if (evidenceIncludes(evidence, value, field)) proof.push({ field, value, source: 'product_or_store_title' })
    else failures.push(`${field}_missing`)
  }

  addOptionalAttributeProof({
    evidence,
    field: 'color',
    immersiveTitle: productTitle,
    product,
    proof,
    value: identifier?.attributes?.color,
    variants,
  })

  for (const requirement of sourceRequirements(product)) {
    const selectedProof = variants.some((variant) => evidenceIncludes(variant, requirement.value, requirement.field))
    const groupProof = canUseGroupLevelAttributeProof(requirement.field) &&
      evidenceIncludes(productTitle, requirement.value, requirement.field)
    const generalProof = evidenceIncludes(evidence, requirement.value, requirement.field)
    if (!selectedProof && hasConflictingMultiValue(storeTitle, requirement.value)) {
      failures.push(`${requirement.field}_ambiguous`)
    } else if (selectedProof || groupProof || generalProof) {
      proof.push({
        ...requirement,
        source: selectedProof ? 'selected_variant' : groupProof ? 'product_group_title' : 'product_or_store_title',
      })
    } else {
      failures.push(`${requirement.field}_missing`)
    }
  }

  const base = scoreShoppingIdentity(product, { ...shoppingOffer, title: productTitle })
  if (!base.accepted) failures.push(base.reason)

  const uniqueFailures = [...new Set(failures)]
  const hardFailures = uniqueFailures.filter((f) => HARD_FAILURE_SET.has(f))
  const softFailures = uniqueFailures.filter((f) => !HARD_FAILURE_SET.has(f))

  return {
    accepted: hardFailures.length === 0,
    confidence: uniqueFailures.length === 0 ? 'high' : hardFailures.length === 0 ? 'soft' : 'rejected',
    failures: uniqueFailures,
    hardFailures,
    softFailures,
    proof,
    selectedVariants: variants,
    evidence,
  }
}

export function isMarketplaceRetailer(value) {
  return MARKETPLACE_LABEL.test(clean(value))
}
