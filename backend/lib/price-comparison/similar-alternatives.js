const ACCESSORY_OR_CONDITION = /\b(?:case|cover|skin|sleeve|replacement|spare|adapter|cable|cord|charger|band|strap|buckle|tool|screwdriver|repair|part|kit|book|catalog|used|renewed|refurbished|open[ -]?box)\b/i
const GENERIC = new Set(['with', 'for', 'the', 'and', 'new', 'wireless', 'portable', 'black', 'white', 'gray', 'grey'])

function clean(value) { return String(value || '').trim() }
function normalized(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
function money(value) { const match = clean(value).replace(/,/g, '').match(/[0-9]+(?:\.[0-9]+)?/); return match ? Number(match[0]) : null }
function capacity(value) { return normalized(value).match(/\b\d+(?:\.\d+)?\s*(?:tb|gb|qt|oz|ml|l)\b/)?.[0]?.replace(/\s+/g, '') || '' }
function size(value) { return normalized(value).match(/\b\d+(?:\.\d+)?\s*(?:mm|inch|in)\b/)?.[0]?.replace(/\s+/g, '') || '' }
function displaySize(value) { return value.replace('inch', ' in').replace(/(\d)mm$/, '$1 mm') }
function generation(value) { return normalized(value).match(/\b(?:m[1-9]|s\d{2,3}|gen(?:eration)?\s*\d+)\b/)?.[0]?.replace(/^generation/, 'gen') || '' }
function sharedCoreTerms(left, right) {
  const ignored = new Set(GENERIC)
  const rightTerms = new Set(normalized(right).split(' '))
  return normalized(left).split(' ').filter((term) => term.length > 2 && !ignored.has(term) && rightTerms.has(term)).length
}

function describeDifference({ alternativeTitle, sourceCapacity, sourcePrice, sourceSize, sourceGeneration }) {
  const alternativeCapacity = capacity(alternativeTitle)
  const alternativeSize = size(alternativeTitle)
  const alternativeGeneration = generation(alternativeTitle)

  if (alternativeCapacity && sourceCapacity && alternativeCapacity !== sourceCapacity) {
    return `${alternativeCapacity.toUpperCase()} instead of ${sourceCapacity.toUpperCase()}`
  }
  if (alternativeSize && sourceSize && alternativeSize !== sourceSize) {
    return `${displaySize(alternativeSize)} instead of ${displaySize(sourceSize)}`
  }
  if (alternativeGeneration && sourceGeneration && alternativeGeneration !== sourceGeneration) {
    return `${alternativeGeneration.toUpperCase()} instead of ${sourceGeneration.toUpperCase()}`
  }

  return Number.isFinite(sourcePrice) && sourcePrice > 0
    ? 'Different model or brand; compare the details before buying'
    : 'Different model or brand'
}

export function findSimilarShoppingAlternatives({ candidate, shoppingResults, currency = 'USD' }) {
  const name = clean(candidate?.display_title || candidate?.displayTitle || candidate?.source_title || candidate?.title)
  const sourcePrice = money(candidate?.numericPrice ?? candidate?.extracted_price ?? candidate?.price)
  const sourceCapacity = capacity(name); const sourceSize = size(name); const sourceGeneration = generation(name)
  const seen = new Set()
  return (Array.isArray(shoppingResults) ? shoppingResults : []).flatMap((result) => {
    const title = clean(result?.title); const url = clean(result?.product_link || result?.link)
    const price = money(result?.extracted_price ?? result?.price)
    if (!title || !url || !/google\.[^/]+\/shopping\/product/i.test(url) || !price || ACCESSORY_OR_CONDITION.test(title)) return []
    if (normalized(title) === normalized(name) || sharedCoreTerms(name, title) < 1 || seen.has(normalized(title))) return []
    seen.add(normalized(title))
    const delta = sourcePrice === null ? null : Math.round((price - sourcePrice) * 100) / 100
    return [{
      title,
      source: clean(result?.source) || 'Google Shopping',
      price,
      currency,
      url,
      difference: describeDifference({
        alternativeTitle: title,
        sourceCapacity,
        sourcePrice,
        sourceSize,
        sourceGeneration,
      }),
      priceDelta: delta,
    }]
  }).sort((a, b) => Math.abs(a.priceDelta ?? 0) - Math.abs(b.priceDelta ?? 0)).slice(0, 3)
}
