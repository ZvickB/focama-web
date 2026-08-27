import {
  buildCacheKey,
  readSearchCache,
  writeSearchCacheEntry as writeLocalSearchCacheEntry,
} from '../search-data.js'
import { memoryGet, memorySet } from '../memory-cache.js'
import {
  getCacheEntryTtlMs,
  getCacheTtlMinutes,
  getSupabaseAdminClient,
  isExpiredCacheEntry,
  isSupabaseConfigured,
  SEARCH_CACHE_TABLE,
} from './supabase-client.js'

function mapSupabaseCacheRow(row) {
  if (!row) {
    return null
  }

  return {
    cacheKey: row.cache_key,
    cachedAt: row.cached_at,
    candidatePool: row.candidate_pool,
    discoveryToken:
      row.selection &&
      typeof row.selection === 'object' &&
      !Array.isArray(row.selection) &&
      typeof row.selection.discoveryToken === 'string'
        ? row.selection.discoveryToken
        : '',
    details: row.details,
    expiresAt: row.expires_at,
    productQuery: row.product_query,
    results: Array.isArray(row.results) ? row.results : [],
    selection: row.selection,
    source: row.source || 'supabase_cache',
  }
}

function readLocalCacheEntry(cacheKey) {
  const localCache = readSearchCache()
  const entry = localCache.entries?.[cacheKey]

  if (!entry || isExpiredCacheEntry(entry)) {
    return null
  }

  return {
    cacheKey,
    cachedAt: entry.cachedAt,
    candidatePool: entry.candidatePool ?? null,
    discoveryToken:
      entry.discoveryToken ??
      (entry.selection &&
      typeof entry.selection === 'object' &&
      !Array.isArray(entry.selection) &&
      typeof entry.selection.discoveryToken === 'string'
        ? entry.selection.discoveryToken
        : ''),
    details: entry.details ?? '',
    expiresAt: entry.expiresAt ?? null,
    productQuery: entry.productQuery ?? '',
    results: Array.isArray(entry.results) ? entry.results : [],
    selection: entry.selection ?? null,
    source: entry.source || 'local_file_cache',
  }
}

export async function readStoredSearchCacheEntry({ productQuery, details, scope = 'default' }) {
  const cacheKey = buildCacheKey(productQuery, details, scope)
  const memoryEntry = memoryGet(cacheKey)

  if (memoryEntry) {
    return memoryEntry
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const { data, error } = await supabase
        .from(SEARCH_CACHE_TABLE)
        .select('cache_key, product_query, details, candidate_pool, results, selection, source, cached_at, expires_at')
        .eq('cache_key', cacheKey)
        .maybeSingle()

      if (error) {
        throw error
      }

      const entry = mapSupabaseCacheRow(data)

      if (entry && !isExpiredCacheEntry(entry)) {
        memorySet(cacheKey, entry, getCacheEntryTtlMs(entry))
        return entry
      }
    } catch {
      const localEntry = readLocalCacheEntry(cacheKey)

      if (localEntry) {
        memorySet(cacheKey, localEntry, getCacheEntryTtlMs(localEntry))
      }

      return localEntry
    }
  }

  const localEntry = readLocalCacheEntry(cacheKey)

  if (localEntry) {
    memorySet(cacheKey, localEntry, getCacheEntryTtlMs(localEntry))
  }

  return localEntry
}

export async function writeStoredSearchCacheEntry({
  productQuery,
  details,
  candidatePool,
  discoveryToken = '',
  results,
  selection,
  source = 'live_search',
  scope = 'default',
}) {
  const cacheKey = buildCacheKey(productQuery, details, scope)
  const storedSelection =
    selection && typeof selection === 'object' && !Array.isArray(selection)
      ? {
          ...selection,
          ...(discoveryToken ? { discoveryToken } : {}),
        }
      : selection
  const cachedAt = new Date()
  const expiresAt = new Date(cachedAt)
  expiresAt.setMinutes(expiresAt.getMinutes() + getCacheTtlMinutes())

  const entry = {
    cacheKey,
    cachedAt: cachedAt.toISOString(),
    candidatePool,
    discoveryToken,
    details,
    expiresAt: expiresAt.toISOString(),
    productQuery,
    results,
    selection: storedSelection,
    source,
  }
  const ttlMs = getCacheEntryTtlMs(entry)

  // Make a newly issued discovery token usable immediately on this process.
  // Durable Supabase persistence may continue after the preview response.
  memorySet(cacheKey, entry, ttlMs)

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const { error } = await supabase.from(SEARCH_CACHE_TABLE).upsert(
        {
          cache_key: cacheKey,
          cached_at: entry.cachedAt,
          candidate_pool: candidatePool,
          details,
          expires_at: entry.expiresAt,
          product_query: productQuery,
          results,
          selection: storedSelection,
          source,
        },
        { onConflict: 'cache_key' },
      )

      if (error) {
        throw error
      }

      return {
        ...entry,
        storage: 'supabase',
      }
    } catch {
      writeLocalSearchCacheEntry({
        productQuery,
        details,
        candidatePool,
        discoveryToken,
        results,
        selection: storedSelection,
        source,
        expiresAt: entry.expiresAt,
        scope,
      })

      return {
        ...entry,
        storage: 'local',
      }
    }
  }

  writeLocalSearchCacheEntry({
    productQuery,
    details,
    candidatePool,
    discoveryToken,
    results,
    selection: storedSelection,
    source,
    expiresAt: entry.expiresAt,
    scope,
  })

  return {
    ...entry,
    storage: 'local',
  }
}
