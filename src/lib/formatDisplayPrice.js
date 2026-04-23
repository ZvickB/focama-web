const PRICE_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatDisplayPrice(value) {
  const text = String(value || '').trim()

  if (!text) {
    return ''
  }

  const numericMatch = text.match(/-?\d[\d,]*(?:\.\d+)?/)

  if (!numericMatch) {
    return text
  }

  const numericValue = Number(numericMatch[0].replace(/,/g, ''))

  if (!Number.isFinite(numericValue)) {
    return text
  }

  const formattedValue = PRICE_NUMBER_FORMATTER.format(numericValue)
  const matchStart = numericMatch.index ?? 0
  const matchEnd = matchStart + numericMatch[0].length

  return `${text.slice(0, matchStart)}${formattedValue}${text.slice(matchEnd)}`
}
