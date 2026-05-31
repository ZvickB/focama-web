const DEFAULT_PRODUCT_TITLE_LENGTH = 80

export function truncateProductTitleAtWord(value, maxLength = DEFAULT_PRODUCT_TITLE_LENGTH) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()

  if (!text || text.length <= maxLength) {
    return text
  }

  const clipped = text.slice(0, maxLength + 1).trimEnd()
  const lastSpace = clipped.lastIndexOf(' ')

  if (lastSpace < Math.floor(maxLength * 0.5)) {
    return `${text.slice(0, maxLength).trim()}...`
  }

  return `${clipped.slice(0, lastSpace).trim()}...`
}

export function getProductDisplayTitle(title, maxLength = DEFAULT_PRODUCT_TITLE_LENGTH) {
  const rawTitle = String(title || '').replace(/\s+/g, ' ').trim()

  if (!rawTitle) {
    return ''
  }

  const commaIndex = rawTitle.indexOf(',')
  const commaTrimmed =
    rawTitle.length > maxLength && commaIndex > 0
      ? rawTitle.slice(0, commaIndex).trim()
      : rawTitle

  return truncateProductTitleAtWord(commaTrimmed, maxLength)
}
