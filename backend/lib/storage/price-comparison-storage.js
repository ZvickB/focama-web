import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getSupabaseAdminClient,
  isSupabaseConfigured,
  logStorageWarning,
  PRICE_COMPARISON_CACHE_TABLE,
} from './supabase-client.js'

const PRICE_COMPARISON_CACHE_PATH = resolve(process.cwd(), 'temp-data', 'price-comparison-cache.json')

function mapRow(row) {
  if (!row?.cache_key) return null
  return {
    cacheKey: row.cache_key,
    candidateId: row.candidate_id || '',
    marketplace: row.marketplace || '',
    coverageMode: row.coverage_mode || '',
    strategyVersion: row.strategy_version || 1,
    identity: row.identity || {},
    status: row.status || 'complete',
    query: row.query || null,
    offers: Array.isArray(row.offers) ? row.offers : [],
    accepted: Array.isArray(row.accepted) ? row.accepted : [],
    rejected: Array.isArray(row.rejected) ? row.rejected : [],
    providerErrors: row.provider_errors || {},
    matchCachedAt: row.match_cached_at,
    matchExpiresAt: row.match_expires_at,
    priceCachedAt: row.price_cached_at,
    priceExpiresAt: row.price_expires_at,
  }
}

function readLocalFile() {
  if (!existsSync(PRICE_COMPARISON_CACHE_PATH)) return { entries: {} }
  try {
    const parsed = JSON.parse(readFileSync(PRICE_COMPARISON_CACHE_PATH, 'utf8'))
    return parsed && typeof parsed.entries === 'object' ? parsed : { entries: {} }
  } catch {
    return { entries: {} }
  }
}

function writeLocalEntry(entry) {
  mkdirSync(resolve(process.cwd(), 'temp-data'), { recursive: true })
  const cache = readLocalFile()
  cache.entries[entry.cacheKey] = entry
  writeFileSync(PRICE_COMPARISON_CACHE_PATH, JSON.stringify(cache, null, 2))
}

export async function readPriceComparisonCacheEntry(cacheKey) {
  if (!cacheKey) return null

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const { data, error } = await supabase
        .from(PRICE_COMPARISON_CACHE_TABLE)
        .select('*')
        .eq('cache_key', cacheKey)
        .maybeSingle()
      if (error) throw error
      return mapRow(data)
    } catch (error) {
      logStorageWarning('Price comparison cache read fell back to local storage', error)
    }
  }

  return readLocalFile().entries?.[cacheKey] || null
}

export async function writePriceComparisonCacheEntry(entry) {
  if (!entry?.cacheKey) return

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const { error } = await supabase.from(PRICE_COMPARISON_CACHE_TABLE).upsert({
        cache_key: entry.cacheKey,
        candidate_id: entry.candidateId,
        marketplace: entry.marketplace,
        coverage_mode: entry.coverageMode,
        strategy_version: entry.strategyVersion,
        identity: entry.identity,
        status: entry.status,
        query: entry.query,
        offers: entry.offers,
        accepted: entry.accepted,
        rejected: entry.rejected,
        provider_errors: entry.providerErrors,
        match_cached_at: entry.matchCachedAt,
        match_expires_at: entry.matchExpiresAt,
        price_cached_at: entry.priceCachedAt,
        price_expires_at: entry.priceExpiresAt,
      }, { onConflict: 'cache_key' })
      if (error) throw error
      return
    } catch (error) {
      logStorageWarning('Price comparison cache write fell back to local storage', error)
    }
  }

  try {
    writeLocalEntry(entry)
  } catch (error) {
    logStorageWarning('Price comparison local cache write failed', error)
  }
}
