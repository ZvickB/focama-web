const CODE_FIELDS = ['upc', 'ean', 'gtin']
const CRITICAL_ATTRIBUTE_FIELDS = ['generation', 'size', 'capacity', 'pack_count', 'condition']

function cleanString(value, maxLength = 200) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : ''
}

function cleanIdentityValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cleanIdentityValue(entry)).find(Boolean) || ''
  }
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    return cleanIdentityValue(value.value ?? value.raw ?? value.name)
  }
  return cleanString(value)
}

function comparable(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function titleContains(sourceTitle, value) {
  const needle = comparable(value)
  return Boolean(needle && comparable(sourceTitle).includes(needle))
}

function normalizePackCount(value) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 && numeric <= 1000 ? numeric : null
}

function normalizeProviderIdentity(identity) {
  const attributes = identity?.attributes && typeof identity.attributes === 'object'
    ? identity.attributes
    : {}
  const provenance = identity?.provenance && typeof identity.provenance === 'object'
    ? identity.provenance
    : {}

  return {
    brand: cleanIdentityValue(identity?.brand) || null,
    model_number: cleanIdentityValue(identity?.model_number ?? identity?.modelNumber) || null,
    upc: cleanIdentityValue(identity?.upc) || null,
    ean: cleanIdentityValue(identity?.ean) || null,
    gtin: cleanIdentityValue(identity?.gtin) || null,
    product_type: cleanString(identity?.product_type ?? identity?.productType) || '',
    attributes: {
      generation: cleanString(attributes.generation) || null,
      size: cleanString(attributes.size) || null,
      capacity: cleanString(attributes.capacity) || null,
      color: cleanString(attributes.color) || null,
      material: cleanString(attributes.material) || null,
      pack_count: normalizePackCount(attributes.pack_count ?? attributes.packCount),
      condition: cleanString(attributes.condition) || null,
    },
    provenance,
  }
}

function extractLabeledCode(sourceTitle, label, digits) {
  const match = sourceTitle.match(new RegExp(`\\b${label}\\s*[:#-]?\\s*(\\d{${digits}})\\b`, 'i'))
  return match?.[1] || null
}

export function extractDeterministicIdentity(sourceTitle) {
  const title = cleanString(sourceTitle, 500)
  const modelMatches = title.match(/\b(?=[A-Z0-9-]{4,}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)+|\b(?=[A-Z0-9]{4,}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+\b/g) || []
  const generationMatch = title.match(/\b(?:\d+(?:st|nd|rd|th)\s+generation|gen(?:eration)?\s*\d+|series\s*\d+)\b/i)
  const capacityMatch = title.match(/\b\d+(?:\.\d+)?\s?(?:GB|TB|MB|mAh|L|mL|oz|fl\.?\s?oz|qt|gal)\b/i)
  const packMatch = title.match(/\b(?:pack of\s*(\d+)|(\d+)\s*(?:pack|count|ct)\b)/i)
  const sizeMatch = title.match(/\b\d+(?:\.\d+)?\s?(?:inches|inch|in\.?|cm|mm|ft)\b/i)

  return {
    model_number: modelMatches[0] || null,
    upc: extractLabeledCode(title, 'UPC', 12),
    ean: extractLabeledCode(title, 'EAN', 13),
    gtin: extractLabeledCode(title, 'GTIN', '8,14'),
    attributes: {
      generation: generationMatch?.[0] || null,
      size: sizeMatch?.[0] || null,
      capacity: capacityMatch?.[0] || null,
      pack_count: normalizePackCount(packMatch?.[1] || packMatch?.[2]),
      condition: title.match(/\b(?:new|open[ -]?box|refurbished|renewed|used)\b/i)?.[0] || null,
    },
  }
}

function chooseCriticalValue({ sourceTitle, providerValue, deterministicValue, aiValue }) {
  if (providerValue && titleContains(sourceTitle, providerValue)) {
    return { value: providerValue, provenance: 'provider' }
  }
  if (deterministicValue && titleContains(sourceTitle, deterministicValue)) {
    return { value: deterministicValue, provenance: 'deterministic' }
  }
  if (aiValue && titleContains(sourceTitle, aiValue)) {
    return { value: aiValue, provenance: 'ai_normalized' }
  }
  return { value: null, provenance: null }
}

function chooseDescriptiveValue({ providerValue, deterministicValue, aiValue }) {
  if (providerValue) return { value: providerValue, provenance: 'provider' }
  if (deterministicValue) return { value: deterministicValue, provenance: 'deterministic' }
  if (aiValue) return { value: aiValue, provenance: 'ai_normalized' }
  return { value: null, provenance: null }
}

function buildComparisonQuery(identifier, sourceTitle) {
  const parts = [
    identifier.brand,
    identifier.model_number,
    identifier.product_type,
    identifier.attributes.generation,
    identifier.attributes.size,
    identifier.attributes.capacity,
    identifier.attributes.pack_count ? `${identifier.attributes.pack_count} pack` : '',
  ].filter(Boolean)

  return cleanString(parts.join(' ') || sourceTitle, 300)
}

export function normalizeProductIdentity({ sourceTitle, providerIdentity, aiNormalization }) {
  const normalizedSourceTitle = cleanString(sourceTitle, 500)
  const provider = normalizeProviderIdentity(providerIdentity)
  const deterministic = extractDeterministicIdentity(normalizedSourceTitle)
  const ai = normalizeProviderIdentity(aiNormalization?.match_identifier ?? aiNormalization?.matchIdentifier)
  const provenance = {}

  const brand = chooseDescriptiveValue({ providerValue: provider.brand, aiValue: ai.brand })
  const model = chooseCriticalValue({
    sourceTitle: normalizedSourceTitle,
    providerValue: provider.model_number,
    deterministicValue: deterministic.model_number,
    aiValue: ai.model_number,
  })
  const productType = chooseDescriptiveValue({
    providerValue: provider.product_type,
    aiValue: ai.product_type,
  })

  const attributes = {}
  for (const field of ['generation', 'size', 'capacity', 'pack_count']) {
    const chosen = chooseCriticalValue({
      sourceTitle: normalizedSourceTitle,
      providerValue: provider.attributes[field],
      deterministicValue: deterministic.attributes[field],
      aiValue: ai.attributes[field],
    })
    attributes[field] = chosen.value
    if (chosen.provenance) provenance[`attributes.${field}`] = chosen.provenance
  }

  for (const field of ['color', 'material']) {
    const chosen = chooseDescriptiveValue({
      providerValue: provider.attributes[field],
      aiValue: ai.attributes[field],
    })
    attributes[field] = chosen.value
    if (chosen.provenance) provenance[`attributes.${field}`] = chosen.provenance
  }

  const condition = chooseCriticalValue({
    sourceTitle: normalizedSourceTitle,
    providerValue: provider.attributes.condition,
    deterministicValue: deterministic.attributes.condition,
    aiValue: ai.attributes.condition,
  })
  attributes.condition = condition.value
  if (condition.provenance) provenance['attributes.condition'] = condition.provenance

  const matchIdentifier = {
    brand: brand.value,
    model_number: model.value,
    upc: null,
    ean: null,
    gtin: null,
    product_type: productType.value || '',
    attributes,
    comparison_search_query: '',
    provenance,
  }

  if (brand.provenance) provenance.brand = brand.provenance
  if (model.provenance) provenance.model_number = model.provenance
  if (productType.provenance) provenance.product_type = productType.provenance

  for (const field of CODE_FIELDS) {
    const providerCode = provider[field]
    const deterministicCode = deterministic[field]
    matchIdentifier[field] = providerCode || deterministicCode || null
    if (providerCode) provenance[field] = 'provider'
    else if (deterministicCode) provenance[field] = 'deterministic'
  }

  matchIdentifier.comparison_search_query = buildComparisonQuery(matchIdentifier, normalizedSourceTitle)

  const proposedDisplayTitle = cleanString(
    aiNormalization?.display_title ?? aiNormalization?.displayTitle,
    300,
  )
  const requiredValues = [
    matchIdentifier.model_number,
    ...CRITICAL_ATTRIBUTE_FIELDS.map((field) => matchIdentifier.attributes[field]),
  ].filter(Boolean)
  const displayTitleIsSafe = Boolean(proposedDisplayTitle) && requiredValues.every((value) => {
    const renderedValue = typeof value === 'number' ? String(value) : value
    return titleContains(proposedDisplayTitle, renderedValue)
  })

  return {
    source_title: normalizedSourceTitle,
    display_title: displayTitleIsSafe ? proposedDisplayTitle : normalizedSourceTitle,
    match_identifier: matchIdentifier,
  }
}

function normalizeSpecificationMap(specifications) {
  if (!Array.isArray(specifications)) return new Map()
  return new Map(specifications.map((entry) => [comparable(entry?.name), cleanString(entry?.value)]))
}

function firstValue(...values) {
  return values.map((value) => cleanIdentityValue(value)).find(Boolean) || null
}

export function buildProviderIdentity({ product = {}, specifications = [] } = {}) {
  const specificationMap = normalizeSpecificationMap(specifications)
  const getSpec = (...names) => names.map((name) => specificationMap.get(comparable(name))).find(Boolean) || null

  const identity = {
    brand: firstValue(product.brand, product.manufacturer, getSpec('brand', 'manufacturer')),
    model_number: firstValue(
      product.model_number,
      product.model,
      product.item_model_number,
      product.part_number,
      product.manufacturer_part_number,
      getSpec('model number', 'item model number', 'part number', 'manufacturer part number'),
    ),
    upc: firstValue(product.upc, getSpec('upc')),
    ean: firstValue(product.ean, getSpec('ean')),
    gtin: firstValue(product.gtin, getSpec('gtin', 'global trade identification number')),
    product_type: firstValue(product.product_type, product.category, getSpec('product type')) || '',
    attributes: {
      generation: firstValue(product.generation, getSpec('generation')),
      size: firstValue(product.size, getSpec('size', 'product dimensions')),
      capacity: firstValue(product.capacity, getSpec('capacity', 'memory storage capacity', 'volume')),
      color: firstValue(product.color, getSpec('color', 'colour')),
      material: firstValue(product.material, getSpec('material')),
      pack_count: normalizePackCount(firstValue(product.pack_count, product.unit_count, getSpec('pack count', 'unit count'))),
      condition: firstValue(product.condition, getSpec('condition')),
    },
    provenance: {},
  }

  const hasIdentity = Boolean(
    identity.brand ||
    identity.model_number ||
    identity.upc ||
    identity.ean ||
    identity.gtin ||
    identity.product_type ||
    Object.values(identity.attributes).some(Boolean),
  )

  return hasIdentity ? identity : null
}
