const ACCESSORY_OR_CONDITION = /\b(?:case|cover|skin|sleeve|replacement|spare|adapter|cable|cord|charger|used|renewed|refurbished|open[ -]?box)\b/i
const GENERIC = new Set(['with', 'for', 'the', 'and', 'new', 'wireless', 'portable', 'black', 'white', 'gray', 'grey'])

function clean(value) { return String(value || '').trim() }
function normalized(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
function money(value) { const match = clean(value).replace(/,/g, '').match(/[0-9]+(?:\.[0-9]+)?/); return match ? Number(match[0]) : null }
function capacity(value) { return normalized(value).match(/\b\d+(?:\.\d+)?\s*(?:tb|gb|qt|oz|ml|l)\b/)?.[0]?.replace(/\s+/g, '') || '' }
function size(value) { return normalized(value).match(/\b\d+(?:\.\d+)?\s*(?:inch|in)\b/)?.[0]?.replace(/\s+/g, '') || '' }
function generation(value) { return normalized(value).match(/\b(?:m[1-9]|s\d{2,3}|gen(?:eration)?\s*\d+)\b/)?.[0]?.replace(/^generation/, 'gen') || '' }
function sharedCoreTerms(left, right, brand) {
  const ignored = new Set([...GENERIC, ...normalized(brand).split(' ')])
  const rightTerms = new Set(normalized(right).split(' '))
  return normalized(left).split(' ').filter((term) => term.length > 2 && !ignored.has(term) && rightTerms.has(term)).length
}

export function findSimilarShoppingAlternatives({ candidate, shoppingResults, currency = 'USD' }) {
  const name = clean(candidate?.display_title || candidate?.displayTitle || candidate?.source_title || candidate?.title)
  const brand = clean(candidate?.match_identifier?.brand || candidate?.matchIdentifier?.brand || name.split(/\s+/)[0])
  const sourcePrice = money(candidate?.numericPrice ?? candidate?.extracted_price ?? candidate?.price)
  const sourceCapacity = capacity(name); const sourceSize = size(name); const sourceGeneration = generation(name)
  const seen = new Set()
  return (Array.isArray(shoppingResults) ? shoppingResults : []).flatMap((result) => {
    const title = clean(result?.title); const url = clean(result?.product_link || result?.link)
    const price = money(result?.extracted_price ?? result?.price)
    if (!title || !url || !/google\.[^/]+\/shopping\/product/i.test(url) || !price || ACCESSORY_OR_CONDITION.test(title)) return []
    if (normalized(title) === normalized(name) || !normalized(title).includes(normalized(brand))) return []
    if (sharedCoreTerms(name, title, brand) < 2) return []
    const altCapacity = capacity(title); const altSize = size(title); const altGeneration = generation(title)
    const difference = altCapacity && sourceCapacity && altCapacity !== sourceCapacity
      ? `${altCapacity.toUpperCase()} instead of ${sourceCapacity.toUpperCase()}`
      : altSize && sourceSize && altSize !== sourceSize
        ? `${altSize.replace('inch', ' in')} instead of ${sourceSize.replace('inch', ' in')}`
        : altGeneration && sourceGeneration && altGeneration !== sourceGeneration
          ? `${altGeneration.toUpperCase()} instead of ${sourceGeneration.toUpperCase()}`
          : ''
    if (!difference || seen.has(normalized(title))) return []
    seen.add(normalized(title))
    const delta = sourcePrice === null ? null : Math.round((price - sourcePrice) * 100) / 100
    return [{ title, source: clean(result?.source) || 'Google Shopping', price, currency, url, difference, priceDelta: delta }]
  }).sort((a, b) => Math.abs(a.priceDelta ?? 0) - Math.abs(b.priceDelta ?? 0)).slice(0, 3)
}
