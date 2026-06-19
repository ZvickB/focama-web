import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeCachedProductDetailsEntry } from '../product-details-cache.js'
import {
  getSupabaseAdminClient,
  isSupabaseConfigured,
  logStorageWarning,
  PRODUCT_DETAILS_CACHE_TABLE,
} from './supabase-client.js'

const PRODUCT_DETAILS_CACHE_PATH = resolve(process.cwd(), 'temp-data', 'product-details-cache.json')

function readLocalProductDetailsCacheFile() {
  if (!existsSync(PRODUCT_DETAILS_CACHE_PATH)) {
    return { entries: {} }
  }

  try {
    const fileContents = readFileSync(PRODUCT_DETAILS_CACHE_PATH, 'utf8')
    const parsed = JSON.parse(fileContents)

    if (!parsed || typeof parsed !== 'object' || !parsed.entries || typeof parsed.entries !== 'object') {
      return { entries: {} }
    }

    return parsed
  } catch {
    return { entries: {} }
  }
}

function mapSupabaseProductDetailsRow(row) {
  const normalized = normalizeCachedProductDetailsEntry({
    feature_bullets: row?.feature_bullets,
    productDescription: row?.product_description,
    source: row?.source,
    needsUpdating: row?.needs_updating,
    nextUpdateAt: row?.next_update_at,
    providerIdentity: row?.provider_identity,
  })

  if (!row?.asin || !normalized) {
    return null
  }

  return normalized
}

function mapLocalProductDetailsEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const normalized = normalizeCachedProductDetailsEntry({
    feature_bullets: entry?.feature_bullets,
    productDescription: entry?.productDescription,
    isPrime: entry?.isPrime,
    delivery: entry?.delivery,
    source: entry?.source,
    needsUpdating: entry?.needsUpdating,
    nextUpdateAt: entry?.nextUpdateAt,
    providerIdentity: entry?.providerIdentity,
  })

  if (!normalized) {
    return null
  }

  return normalized
}

function writeLocalProductDetailsCacheEntries(entries) {
  mkdirSync(resolve(process.cwd(), 'temp-data'), { recursive: true })

  const existingCache = readLocalProductDetailsCacheFile()
  const nextEntries = { ...(existingCache.entries || {}) }
  const cachedAt = new Date().toISOString()

  for (const entry of entries) {
    const asin = typeof entry?.asin === 'string' ? entry.asin.trim() : ''
    const normalized = normalizeCachedProductDetailsEntry(entry)

    if (!asin || !normalized) {
      continue
    }

    nextEntries[asin] = {
      feature_bullets: normalized.feature_bullets,
      productDescription: normalized.productDescription,
      isPrime: normalized.isPrime,
      delivery: normalized.delivery,
      source: normalized.source,
      needsUpdating: normalized.needsUpdating,
      nextUpdateAt: normalized.nextUpdateAt,
      providerIdentity: normalized.providerIdentity,
      cachedAt,
    }
  }

  writeFileSync(
    PRODUCT_DETAILS_CACHE_PATH,
    JSON.stringify({ entries: nextEntries }, null, 2),
  )
}

export async function readProductDetailsCacheEntries(asins = []) {
  const uniqueAsins = Array.from(
    new Set(
      (Array.isArray(asins) ? asins : [])
        .map((asin) => (typeof asin === 'string' ? asin.trim().slice(0, 200) : ''))
        .filter(Boolean),
    ),
  )

  if (uniqueAsins.length === 0) {
    return new Map()
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const { data, error } = await supabase
        .from(PRODUCT_DETAILS_CACHE_TABLE)
        .select('asin, feature_bullets, product_description, source, needs_updating, next_update_at, provider_identity')
        .in('asin', uniqueAsins)

      if (error) {
        throw error
      }

      const rows = Array.isArray(data) ? data : []
      return new Map(
        rows
          .map((row) => [row.asin, mapSupabaseProductDetailsRow(row)])
          .filter(([, entry]) => Boolean(entry)),
      )
    } catch {
      // Fall through to local cache file.
    }
  }

  const localCache = readLocalProductDetailsCacheFile()

  return new Map(
    uniqueAsins
      .map((asin) => [asin, mapLocalProductDetailsEntry(localCache.entries?.[asin])])
      .filter(([, entry]) => Boolean(entry)),
  )
}

export async function writeProductDetailsCacheEntries(entries = []) {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const asin = typeof entry?.asin === 'string' ? entry.asin.trim().slice(0, 200) : ''
      const normalized = normalizeCachedProductDetailsEntry(entry)

      if (!asin || !normalized) {
        return null
      }

      return {
        asin,
        feature_bullets: normalized.feature_bullets,
        productDescription: normalized.productDescription,
        isPrime: normalized.isPrime,
        delivery: normalized.delivery,
        source: normalized.source,
        needsUpdating: normalized.needsUpdating,
        nextUpdateAt: normalized.nextUpdateAt,
        providerIdentity: normalized.providerIdentity,
      }
    })
    .filter(Boolean)

  if (normalizedEntries.length === 0) {
    return
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const cachedAt = new Date().toISOString()
      const { error } = await supabase.from(PRODUCT_DETAILS_CACHE_TABLE).upsert(
        normalizedEntries.map((entry) => ({
          asin: entry.asin,
          feature_bullets: entry.feature_bullets,
          product_description: entry.productDescription,
          source: entry.source,
          needs_updating: entry.needsUpdating,
          next_update_at: entry.nextUpdateAt,
          provider_identity: entry.providerIdentity,
          cached_at: cachedAt,
        })),
        { onConflict: 'asin' },
      )

      if (error) {
        throw error
      }

      return
    } catch (error) {
      logStorageWarning('Product details cache write fell back to local storage', error)

      try {
        writeLocalProductDetailsCacheEntries(normalizedEntries)
      } catch (localError) {
        logStorageWarning('Product details local cache write failed', localError)
      }

      return
    }
  }

  try {
    writeLocalProductDetailsCacheEntries(normalizedEntries)
  } catch (error) {
    logStorageWarning('Product details local cache write failed', error)
  }
}
