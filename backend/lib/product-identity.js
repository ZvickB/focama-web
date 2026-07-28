const COSMETIC_TOKENS = new Set([
  'beige', 'black', 'blue', 'brown', 'cream', 'gold', 'graphite', 'gray', 'green', 'grey',
  'ivory', 'navy', 'orange', 'pink', 'purple', 'red', 'rose', 'silver', 'white', 'yellow',
])
const FEATURE_TIER_TOKENS = new Set(['elite', 'max', 'plus', 'pro', 'ultra'])
const WIDTH_TOKENS = new Set(['narrow', 'regular', 'wide'])

function tokens(value) {
  return String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []
}

function brandKey(candidate) {
  return tokens(candidate?.brandName || candidate?.brand).join(' ')
}

function capacityTokens(title) {
  return tokens(title).filter((token, index, values) => {
    if (!/^\d+(?:gb|tb|mb|oz|ml|ah|mah|inch|in)$/.test(token)) return false
    return values[index - 1] !== 'up' && values[index - 1] !== 'to'
  })
}

function generationTokens(title) {
  const values = tokens(title)
  const generations = []

  for (let index = 0; index < values.length; index += 1) {
    if ((values[index] === 'gen' || values[index] === 'generation') && /^\d+$/.test(values[index + 1] || '')) {
      generations.push(`${values[index]}-${values[index + 1]}`)
    }
  }

  return generations
}

function modelTokens(title) {
  const values = tokens(title)
  const capacity = new Set(capacityTokens(title))

  return values.filter((token, index) => {
    if (capacity.has(token)) return false
    if (/^[a-z]+\d+[a-z0-9]*$/.test(token)) return true
    if (/^\d+$/.test(token) && index > 0 && values[index - 1].length > 2) return true
    return false
  })
}

function signature(title, allowedTokens) {
  return tokens(title).filter((token) => allowedTokens.has(token)).sort().join('|')
}

function normalizedTitleWithoutCosmetics(title) {
  return tokens(title)
    .filter((token) => !COSMETIC_TOKENS.has(token))
    .filter((token) => !['by', 'for', 'the', 'with'].includes(token))
    .join(' ')
}

export function areSameProductFamily(leftCandidate, rightCandidate) {
  const leftBrand = brandKey(leftCandidate)
  const rightBrand = brandKey(rightCandidate)

  if (!leftBrand || leftBrand !== rightBrand) return false

  const leftTitle = String(leftCandidate?.title || '')
  const rightTitle = String(rightCandidate?.title || '')
  if (!leftTitle || !rightTitle) return false

  const leftModels = modelTokens(leftTitle)
  const rightModels = modelTokens(rightTitle)
  const sharedModel = leftModels.some((model) => rightModels.includes(model))
  const sameCosmeticStrippedTitle = normalizedTitleWithoutCosmetics(leftTitle) === normalizedTitleWithoutCosmetics(rightTitle)

  if (!sharedModel && !sameCosmeticStrippedTitle) return false
  if (signature(leftTitle, FEATURE_TIER_TOKENS) !== signature(rightTitle, FEATURE_TIER_TOKENS)) return false
  if (signature(leftTitle, WIDTH_TOKENS) !== signature(rightTitle, WIDTH_TOKENS)) return false
  if (capacityTokens(leftTitle).join('|') !== capacityTokens(rightTitle).join('|')) return false
  if (generationTokens(leftTitle).join('|') !== generationTokens(rightTitle).join('|')) return false

  return true
}

export function selectDistinctCandidates({ preferredCandidates = [], fallbackCandidates = [], limit }) {
  const selected = []
  const selectedIds = new Set()

  for (const candidate of [...preferredCandidates, ...fallbackCandidates]) {
    if (!candidate || selected.length >= limit) break

    const id = String(candidate.id || '')
    if (!id || selectedIds.has(id)) continue
    if (selected.some((existing) => areSameProductFamily(existing, candidate))) continue

    selected.push(candidate)
    selectedIds.add(id)
  }

  return selected
}
