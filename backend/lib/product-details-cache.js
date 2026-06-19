const PARTIAL_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeFeatureBullets(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((entry) => normalizeString(entry))
      .filter(Boolean)
  }

  return []
}

function normalizeNextUpdateAt(value) {
  const normalized = normalizeString(value)

  if (!normalized) {
    return null
  }

  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function normalizeProviderIdentity(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : null
}

export function normalizeCachedProductDetailsEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const delivery = normalizeString(entry.delivery)
  const isPrime = Boolean(entry.isPrime ?? entry.is_prime)

  return {
    feature_bullets: normalizeFeatureBullets(entry.feature_bullets),
    productDescription: normalizeString(entry.productDescription ?? entry.product_description),
    ...(isPrime ? { isPrime: true } : {}),
    ...(delivery ? { delivery } : {}),
    source: normalizeString(entry.source),
    needsUpdating: Boolean(entry.needsUpdating ?? entry.needs_updating),
    nextUpdateAt: normalizeNextUpdateAt(entry.nextUpdateAt ?? entry.next_update_at),
    providerIdentity: normalizeProviderIdentity(entry.providerIdentity ?? entry.provider_identity),
  }
}

export function isPartialProductDetailsEntry(entry) {
  const normalized = normalizeCachedProductDetailsEntry(entry)

  if (!normalized) {
    return false
  }

  return normalized.feature_bullets.length === 0 || normalized.productDescription.length === 0
}

export function isEmptyProductDetailsEntry(entry) {
  const normalized = normalizeCachedProductDetailsEntry(entry)

  if (!normalized) {
    return true
  }

  return normalized.feature_bullets.length === 0 && normalized.productDescription.length === 0
}

export function shouldRefreshPartialProductDetails(entry, now = Date.now()) {
  const normalized = normalizeCachedProductDetailsEntry(entry)

  if (!normalized || !normalized.needsUpdating || !isPartialProductDetailsEntry(normalized)) {
    return false
  }

  if (!normalized.nextUpdateAt) {
    return true
  }

  const parsed = new Date(normalized.nextUpdateAt)

  if (Number.isNaN(parsed.getTime())) {
    return true
  }

  return parsed.getTime() <= now
}

export function buildProductDetailsCacheWriteEntry({ asin, feature_bullets, productDescription, isPrime, delivery, providerIdentity, source }) {
  const normalizedAsin = normalizeString(asin).slice(0, 200)

  if (!normalizedAsin) {
    return null
  }

  const normalizedEntry = normalizeCachedProductDetailsEntry({
    feature_bullets,
    productDescription,
    isPrime,
    delivery,
    providerIdentity,
    source,
  })

  if (!normalizedEntry || isEmptyProductDetailsEntry(normalizedEntry)) {
    return null
  }

  const needsUpdating = isPartialProductDetailsEntry(normalizedEntry)
  const nextUpdateAt = needsUpdating
    ? new Date(Date.now() + PARTIAL_REFRESH_INTERVAL_MS).toISOString()
    : null

  return {
    asin: normalizedAsin,
    feature_bullets: normalizedEntry.feature_bullets,
    productDescription: normalizedEntry.productDescription,
    ...(normalizedEntry.isPrime ? { isPrime: true } : {}),
    ...(normalizedEntry.delivery ? { delivery: normalizedEntry.delivery } : {}),
    ...(normalizedEntry.providerIdentity ? { providerIdentity: normalizedEntry.providerIdentity } : {}),
    source: normalizedEntry.source,
    needsUpdating,
    nextUpdateAt,
  }
}

function logProductDetailsCacheIssue(label, message, error) {
  const errorMessage = error instanceof Error ? error.message : normalizeString(error)

  if (errorMessage) {
    console.warn(`[${label}] ${message}: ${errorMessage}`)
    return
  }

  console.warn(`[${label}] ${message}`)
}

function queueCacheWrite({ entries, writeCache, logLabel }) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return
  }

  Promise.resolve()
    .then(() => writeCache(entries))
    .catch((error) => {
      logProductDetailsCacheIssue(logLabel, 'Product details cache write failed', error)
    })
}

function createDetailsValue(entry) {
  const normalized = normalizeCachedProductDetailsEntry(entry)

  if (!normalized) {
    return null
  }

  return {
    feature_bullets: normalized.feature_bullets,
    productDescription: normalized.productDescription,
    ...(normalized.isPrime ? { isPrime: true } : {}),
    ...(normalized.delivery ? { delivery: normalized.delivery } : {}),
    ...(normalized.providerIdentity ? { providerIdentity: normalized.providerIdentity } : {}),
  }
}

export async function fetchProductDetailsWithCache({
  asins = [],
  source,
  readCache = async () => new Map(),
  writeCache = async () => {},
  fetchFreshDetails,
  logLabel = 'product-details-cache',
}) {
  const uniqueAsins = Array.from(
    new Set(
      (Array.isArray(asins) ? asins : [])
        .map((asin) => normalizeString(asin).slice(0, 200))
        .filter(Boolean),
    ),
  )

  if (uniqueAsins.length === 0 || typeof fetchFreshDetails !== 'function') {
    return new Map()
  }

  let cachedEntries = new Map()

  try {
    const cacheResult = await readCache(uniqueAsins)
    cachedEntries = cacheResult instanceof Map ? cacheResult : new Map()
  } catch (error) {
    logProductDetailsCacheIssue(logLabel, 'Product details cache read failed', error)
  }

  const detailsByAsin = new Map()
  const missingAsins = []
  const refreshAsins = []

  for (const asin of uniqueAsins) {
    const cachedEntry = normalizeCachedProductDetailsEntry(cachedEntries.get(asin))

    if (!cachedEntry) {
      missingAsins.push(asin)
      continue
    }

    detailsByAsin.set(asin, createDetailsValue(cachedEntry))

    if (shouldRefreshPartialProductDetails(cachedEntry)) {
      refreshAsins.push(asin)
    }
  }

  if (refreshAsins.length > 0) {
    Promise.resolve()
      .then(() => fetchFreshDetails(refreshAsins))
      .then((freshEntries) => {
        const writes = []

        for (const asin of refreshAsins) {
          const refreshedEntry = buildProductDetailsCacheWriteEntry({
            asin,
            feature_bullets: freshEntries?.get?.(asin)?.feature_bullets,
            productDescription: freshEntries?.get?.(asin)?.productDescription,
            isPrime: freshEntries?.get?.(asin)?.isPrime,
            delivery: freshEntries?.get?.(asin)?.delivery,
            providerIdentity: freshEntries?.get?.(asin)?.providerIdentity,
            source,
          })

          if (refreshedEntry) {
            writes.push(refreshedEntry)
          }
        }

        queueCacheWrite({ entries: writes, writeCache, logLabel })
      })
      .catch((error) => {
        logProductDetailsCacheIssue(logLabel, 'Product details background refresh failed', error)
      })
  }

  if (missingAsins.length === 0) {
    return detailsByAsin
  }

  try {
    const freshEntries = await fetchFreshDetails(missingAsins)
    const cacheWrites = []

    for (const asin of missingAsins) {
      const freshEntry = normalizeCachedProductDetailsEntry(freshEntries?.get?.(asin))

      if (!freshEntry) {
        continue
      }

      detailsByAsin.set(asin, createDetailsValue(freshEntry))

      const cacheWriteEntry = buildProductDetailsCacheWriteEntry({
        asin,
        feature_bullets: freshEntry.feature_bullets,
        productDescription: freshEntry.productDescription,
        isPrime: freshEntry.isPrime,
        delivery: freshEntry.delivery,
        providerIdentity: freshEntry.providerIdentity,
        source,
      })

      if (cacheWriteEntry) {
        cacheWrites.push(cacheWriteEntry)
      }
    }

    queueCacheWrite({ entries: cacheWrites, writeCache, logLabel })
  } catch (error) {
    logProductDetailsCacheIssue(logLabel, 'Product details provider fetch failed', error)
  }

  return detailsByAsin
}
