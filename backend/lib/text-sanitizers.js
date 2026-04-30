export function truncateText(value, maxLength) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''

  if (!normalizedValue) {
    return ''
  }

  return normalizedValue.slice(0, maxLength)
}

export function sanitizeStringList(values, { maxItems, maxItemLength }) {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .map((value) => truncateText(value, maxItemLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

export function sanitizeRetryAdviceShortlist(values, { maxItems, maxTitleLength }) {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .map((item) => ({
      title: truncateText(item?.title, maxTitleLength),
    }))
    .filter((item) => item.title)
    .slice(0, maxItems)
}

export function sanitizeAnalyticsEventData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 20)
      .map(([key, entryValue]) => {
        const normalizedKey = truncateText(key, 60)

        if (!normalizedKey) {
          return null
        }

        if (typeof entryValue === 'string') {
          return [normalizedKey, truncateText(entryValue, 500)]
        }

        if (typeof entryValue === 'number' || typeof entryValue === 'boolean' || entryValue === null) {
          return [normalizedKey, entryValue]
        }

        return [normalizedKey, truncateText(JSON.stringify(entryValue), 500)]
      })
      .filter(Boolean),
  )
}

export function sanitizeAnalyticsItems(items, { maxItems }) {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .slice(0, maxItems)
    .map((item, index) => {
      const resultKey = truncateText(item?.resultKey, 200)

      if (!resultKey) {
        return null
      }

      return {
        resultKey,
        position: Number.isFinite(Number(item?.position)) ? Number(item.position) : index,
        provider: truncateText(item?.provider, 160),
        badgeType: truncateText(item?.badgeType, 80),
        isBestPick: Boolean(item?.isBestPick),
      }
    })
    .filter(Boolean)
}
