import { createClient } from '@supabase/supabase-js'
import { getEnv } from '../search-data.js'

export const SEARCH_CACHE_TABLE = 'search_cache'
export const SEARCH_HISTORY_TABLE = 'search_history'
export const PRODUCT_DETAILS_CACHE_TABLE = 'product_details_cache'
export const ANALYTICS_SEARCH_RUNS_TABLE = 'analytics_search_runs'
export const ANALYTICS_SEARCH_EVENTS_TABLE = 'analytics_search_events'
export const ANALYTICS_RESULT_IMPRESSIONS_TABLE = 'analytics_result_impressions'
export const ANALYTICS_RESULT_CLICKS_TABLE = 'analytics_result_clicks'
export const TESTER_FEEDBACK_TABLE = 'tester_feedback'
export const OXYLABS_PRODUCT_FAILURES_TABLE = 'oxylabs_product_failures'
export const RATE_LIMIT_EVENTS_TABLE = 'rate_limit_events'
export const SEARCH_ATTEMPTS_TABLE = 'search_attempts'
export const SEARCH_EVENTS_TABLE = 'search_events'
const DEFAULT_CACHE_TTL_MINUTES = 1440

let supabaseAdminClient = null

export function getCacheTtlMinutes() {
  const configuredValue = Number.parseInt(getEnv('SEARCH_CACHE_TTL_MINUTES') || '', 10)

  if (Number.isFinite(configuredValue) && configuredValue > 0) {
    return configuredValue
  }

  return DEFAULT_CACHE_TTL_MINUTES
}

export function getSupabaseConfig() {
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

export function getSupabaseAdminClient() {
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

export function getExpirationTimestamp(cachedAt, expiresAt) {
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

export function isExpiredCacheEntry(entry) {
  const expiration = getExpirationTimestamp(entry?.cachedAt, entry?.expiresAt)

  if (!expiration) {
    return false
  }

  return expiration.getTime() <= Date.now()
}

export function getCacheEntryTtlMs(entry) {
  const explicitExpirationMs = new Date(entry?.expiresAt || '').getTime()

  if (Number.isFinite(explicitExpirationMs)) {
    return explicitExpirationMs - Date.now()
  }

  const cachedAtMs = new Date(entry?.cachedAt || '').getTime()

  if (!Number.isFinite(cachedAtMs)) {
    return 0
  }

  return cachedAtMs + getCacheTtlMinutes() * 60 * 1000 - Date.now()
}

export function logStorageWarning(message, error) {
  const errorMessage = error instanceof Error ? error.message : ''

  if (errorMessage) {
    console.warn(`[search-storage] ${message}: ${errorMessage}`)
    return
  }

  console.warn(`[search-storage] ${message}`)
}

export async function readSupabaseRowsSince(table, columns, sinceIso, pageSize = 1000, maxPages = 10) {
  const supabase = getSupabaseAdminClient()

  if (!supabase) {
    return {
      rows: [],
      truncated: false,
    }
  }

  const rows = []

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const from = pageIndex * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw error
    }

    const nextRows = Array.isArray(data) ? data : []
    rows.push(...nextRows)

    if (nextRows.length < pageSize) {
      return {
        rows,
        truncated: false,
      }
    }
  }

  return {
    rows,
    truncated: true,
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
      checkSupabaseTable(supabase, PRODUCT_DETAILS_CACHE_TABLE, 'asin'),
      checkSupabaseTable(supabase, TESTER_FEEDBACK_TABLE, 'id'),
      checkSupabaseTable(supabase, ANALYTICS_SEARCH_RUNS_TABLE, 'search_id'),
      checkSupabaseTable(supabase, ANALYTICS_SEARCH_EVENTS_TABLE, 'search_id'),
      checkSupabaseTable(supabase, ANALYTICS_RESULT_IMPRESSIONS_TABLE, 'search_id'),
      checkSupabaseTable(supabase, ANALYTICS_RESULT_CLICKS_TABLE, 'search_id'),
      checkSupabaseTable(supabase, SEARCH_ATTEMPTS_TABLE, 'search_id'),
      checkSupabaseTable(supabase, SEARCH_EVENTS_TABLE, 'search_id'),
      checkSupabaseTable(supabase, OXYLABS_PRODUCT_FAILURES_TABLE, 'asin'),
      checkSupabaseTable(supabase, RATE_LIMIT_EVENTS_TABLE, 'rate_key'),
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
