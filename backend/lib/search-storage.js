import { createClient } from '@supabase/supabase-js'
import {
  buildCacheKey,
  getEnv,
  readSearchCache,
  writeSearchCacheEntry as writeLocalSearchCacheEntry,
} from './search-data.js'

const SEARCH_CACHE_TABLE = 'search_cache'
const SEARCH_HISTORY_TABLE = 'search_history'
const DEFAULT_CACHE_TTL_MINUTES = 360

let supabaseAdminClient = null

function getCacheTtlMinutes() {
  const configuredValue = Number.parseInt(getEnv('SEARCH_CACHE_TTL_MINUTES') || '', 10)

  if (Number.isFinite(configuredValue) && configuredValue > 0) {
    return configuredValue
  }

  return DEFAULT_CACHE_TTL_MINUTES
}

function getSupabaseConfig() {
  const url = getEnv('SUPABASE_URL')?.trim() || ''
  const secretKey = getEnv('SUPABASE_SECRET_KEY')?.trim() || ''
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')?.trim() || ''
  const serverKey = secretKey || serviceRoleKey

  return {
    serverKey,
    url,
  }
}

export function isSupabaseConfigured() {
  const { serverKey, url } = getSupabaseConfig()
  return Boolean(url && serverKey)
}

function getSupabaseAdminClient() {
  if (supabaseAdminClient) {
    return supabaseAdminClient
  }

  const { serverKey, url } = getSupabaseConfig()

  if (!url || !serverKey) {
    return null
  }

  supabaseAdminClient = createClient(url, serverKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return supabaseAdminClient
}

function getExpirationTimestamp(cachedAt, expiresAt) {
  if (expiresAt) {
    const explicitExpiration = new Date(expiresAt)

    if (!Number.isNaN(explicitExpiration.getTime())) {
      return explicitExpiration
    }
  }

  if (cachedAt) {
    const derivedExpiration = new Date(cachedAt)

    if (!Number.isNaN(derivedExpiration.getTime())) {
      derivedExpiration.setMinutes(derivedExpiration.getMinutes() + getCacheTtlMinutes())
      return derivedExpiration
    }
  }

  return null
}

function isExpiredCacheEntry(entry) {
  const expiration = getExpirationTimestamp(entry?.cachedAt, entry?.expiresAt)

  if (!expiration) {
    return false
  }

  return expiration.getTime() <= Date.now()
}

function mapSupabaseCacheRow(row) {
  if (!row) {
    return null
  }

  return {
    cacheKey: row.cache_key,
    cachedAt: row.cached_at,
    candidatePool: row.candidate_pool,
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
        return entry
      }
    } catch {
      return readLocalCacheEntry(cacheKey)
    }
  }

  return readLocalCacheEntry(cacheKey)
}

export async function writeStoredSearchCacheEntry({
  productQuery,
  details,
  candidatePool,
  results,
  selection,
  source = 'live_search',
  scope = 'default',
}) {
  const cacheKey = buildCacheKey(productQuery, details, scope)
  const cachedAt = new Date()
  const expiresAt = new Date(cachedAt)
  expiresAt.setMinutes(expiresAt.getMinutes() + getCacheTtlMinutes())

  const entry = {
    cacheKey,
    cachedAt: cachedAt.toISOString(),
    candidatePool,
    details,
    expiresAt: expiresAt.toISOString(),
    productQuery,
    results,
    selection,
    source,
  }

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
          selection,
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
        results,
        selection,
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
    results,
    selection,
    source,
    expiresAt: entry.expiresAt,
    scope,
  })

  return {
    ...entry,
    storage: 'local',
  }
}

export async function recordSearchHistory({
  cacheKey,
  cacheStatus,
  candidateCount,
  details,
  productQuery,
  resultCount,
  selectionMode,
  source,
}) {
  if (!isSupabaseConfigured()) {
    return
  }

  try {
    const supabase = getSupabaseAdminClient()
    const { error } = await supabase.from(SEARCH_HISTORY_TABLE).insert({
      cache_key: cacheKey,
      cache_status: cacheStatus,
      candidate_count: candidateCount,
      details,
      product_query: productQuery,
      result_count: resultCount,
      selection_mode: selectionMode,
      source,
    })

    if (error) {
      throw error
    }
  } catch {
    // History writes are best-effort so search responses stay fast and resilient.
  }
}

async function checkSupabaseTable(supabase, tableName, columnName) {
  const { error } = await supabase.from(tableName).select(columnName, { head: true, count: 'exact' }).limit(1)

  return {
    error: error ? error.message : null,
    ok: !error,
    table: tableName,
  }
}

export async function getSupabaseHealth() {
  const { serverKey, url } = getSupabaseConfig()

  if (!url || !serverKey) {
    return {
      configured: false,
      ok: false,
      tables: [],
    }
  }

  try {
    const supabase = getSupabaseAdminClient()
    const tableChecks = await Promise.all([
      checkSupabaseTable(supabase, SEARCH_CACHE_TABLE, 'cache_key'),
      checkSupabaseTable(supabase, SEARCH_HISTORY_TABLE, 'id'),
    ])

    return {
      configured: true,
      ok: tableChecks.every((table) => table.ok),
      tables: tableChecks,
    }
  } catch (error) {
    return {
      configured: true,
      ok: false,
      tables: [],
      error: error instanceof Error ? error.message : 'Unknown Supabase error',
    }
  }
}
