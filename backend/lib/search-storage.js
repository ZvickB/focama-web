import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildCacheKey,
  getEnv,
  readSearchCache,
  writeSearchCacheEntry as writeLocalSearchCacheEntry,
} from './search-data.js'
import { normalizeCachedProductDetailsEntry } from './product-details-cache.js'
import { memoryGet, memorySet } from './memory-cache.js'

const SEARCH_CACHE_TABLE = 'search_cache'
const SEARCH_HISTORY_TABLE = 'search_history'
const PRODUCT_DETAILS_CACHE_TABLE = 'product_details_cache'
const ANALYTICS_SEARCH_RUNS_TABLE = 'analytics_search_runs'
const ANALYTICS_SEARCH_EVENTS_TABLE = 'analytics_search_events'
const ANALYTICS_RESULT_IMPRESSIONS_TABLE = 'analytics_result_impressions'
const ANALYTICS_RESULT_CLICKS_TABLE = 'analytics_result_clicks'
const TESTER_FEEDBACK_TABLE = 'tester_feedback'
const DEFAULT_CACHE_TTL_MINUTES = 1440
const PRODUCT_DETAILS_CACHE_PATH = resolve(process.cwd(), 'temp-data', 'product-details-cache.json')
const TESTER_FEEDBACK_PATH = resolve(process.cwd(), 'temp-data', 'tester-feedback.json')

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

function getCacheEntryTtlMs(entry) {
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

function logStorageWarning(message, error) {
  const errorMessage = error instanceof Error ? error.message : ''

  if (errorMessage) {
    console.warn(`[search-storage] ${message}: ${errorMessage}`)
    return
  }

  console.warn(`[search-storage] ${message}`)
}

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
    source: entry?.source,
    needsUpdating: entry?.needsUpdating,
    nextUpdateAt: entry?.nextUpdateAt,
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
      source: normalized.source,
      needsUpdating: normalized.needsUpdating,
      nextUpdateAt: normalized.nextUpdateAt,
      cachedAt,
    }
  }

  writeFileSync(
    PRODUCT_DETAILS_CACHE_PATH,
    JSON.stringify({ entries: nextEntries }, null, 2),
  )
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

function readLocalTesterFeedbackFile() {
  if (!existsSync(TESTER_FEEDBACK_PATH)) {
    return { entries: [] }
  }

  try {
    const fileContents = readFileSync(TESTER_FEEDBACK_PATH, 'utf8')
    const parsed = JSON.parse(fileContents)

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
      return { entries: [] }
    }

    return parsed
  } catch {
    return { entries: [] }
  }
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

      memorySet(cacheKey, entry, ttlMs)

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

      memorySet(cacheKey, entry, ttlMs)

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

  memorySet(cacheKey, entry, ttlMs)

  return {
    ...entry,
    storage: 'local',
  }
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
        .select('asin, feature_bullets, product_description, source, needs_updating, next_update_at')
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
        source: normalized.source,
        needsUpdating: normalized.needsUpdating,
        nextUpdateAt: normalized.nextUpdateAt,
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

export async function upsertAnalyticsSearchRun(run) {
  if (!isSupabaseConfigured() || !run?.searchId || !run?.sessionId || !run?.productQuery) {
    return
  }

  try {
    const supabase = getSupabaseAdminClient()
    const { error } = await supabase.from(ANALYTICS_SEARCH_RUNS_TABLE).upsert(
      {
        search_id: run.searchId,
        session_id: run.sessionId,
        product_query: run.productQuery,
        details: run.details || '',
        entered_ai_refinement: Boolean(run.enteredAiRefinement),
        used_show_products_now: Boolean(run.usedShowProductsNow),
        completed_finalize: Boolean(run.completedFinalize),
        retry_round: Number.isFinite(Number(run.retryRound)) ? Number(run.retryRound) : 0,
        best_result_key: run.bestResultKey || null,
      },
      { onConflict: 'search_id' },
    )

    if (error) {
      throw error
    }
  } catch {
    // Analytics writes are best-effort so user flows stay resilient.
  }
}

export async function recordAnalyticsSearchEvent(event) {
  if (!isSupabaseConfigured() || !event?.searchId || !event?.sessionId || !event?.eventType) {
    return
  }

  try {
    const supabase = getSupabaseAdminClient()
    const { error } = await supabase.from(ANALYTICS_SEARCH_EVENTS_TABLE).insert({
      search_id: event.searchId,
      session_id: event.sessionId,
      event_type: event.eventType,
      event_data:
        event.eventData && typeof event.eventData === 'object' && !Array.isArray(event.eventData)
          ? event.eventData
          : {},
    })

    if (error) {
      throw error
    }
  } catch {
    // Analytics writes are best-effort so user flows stay resilient.
  }
}

export async function recordAnalyticsResultImpressions({ items, resultSet, searchId, sessionId }) {
  if (!isSupabaseConfigured() || !searchId || !sessionId || !Array.isArray(items) || items.length === 0) {
    return
  }

  try {
    const supabase = getSupabaseAdminClient()
    const { error } = await supabase.from(ANALYTICS_RESULT_IMPRESSIONS_TABLE).insert(
      items.map((item) => ({
        search_id: searchId,
        session_id: sessionId,
        result_set: resultSet || 'final',
        result_key: item.resultKey,
        position: item.position,
        provider: item.provider || null,
        badge_type: item.badgeType || null,
        is_best_pick: Boolean(item.isBestPick),
      })),
    )

    if (error) {
      throw error
    }
  } catch {
    // Analytics writes are best-effort so user flows stay resilient.
  }
}

export async function recordAnalyticsResultClick(click) {
  if (!isSupabaseConfigured() || !click?.searchId || !click?.sessionId || !click?.resultKey || !click?.clickTarget) {
    return
  }

  try {
    const supabase = getSupabaseAdminClient()
    const { error } = await supabase.from(ANALYTICS_RESULT_CLICKS_TABLE).insert({
      search_id: click.searchId,
      session_id: click.sessionId,
      result_set: click.resultSet || 'final',
      result_key: click.resultKey,
      position: Number.isFinite(Number(click.position)) ? Number(click.position) : 0,
      provider: click.provider || null,
      badge_type: click.badgeType || null,
      is_best_pick: Boolean(click.isBestPick),
      click_target: click.clickTarget,
      retailer_url: click.retailerUrl || null,
    })

    if (error) {
      throw error
    }
  } catch {
    // Analytics writes are best-effort so user flows stay resilient.
  }
}

export async function recordTesterFeedback(feedback) {
  const payload = {
    email: feedback?.email || null,
    finalized: Boolean(feedback?.finalized),
    found_what_you_wanted: feedback?.foundWhatYouWanted || null,
    free_text: feedback?.freeText || null,
    enjoyed_experience: feedback?.enjoyedExperience || null,
    metadata:
      feedback?.metadata && typeof feedback.metadata === 'object' && !Array.isArray(feedback.metadata)
        ? feedback.metadata
        : {},
    page: feedback?.page || '/',
    query_text: feedback?.queryText || null,
    results_seen: Boolean(feedback?.resultsSeen),
    search_id: feedback?.searchId || null,
    selected_product_id: feedback?.selectedProductId || null,
    session_id: feedback?.sessionId || null,
    stage_reached: feedback?.stageReached || 'home',
    was_simple: feedback?.wasSimple || null,
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdminClient()
      const { error } = await supabase.from(TESTER_FEEDBACK_TABLE).insert(payload)

      if (!error) {
        return
      }

      throw error
    } catch (error) {
      logStorageWarning('Tester feedback write fell back to local storage', error)
    }
  }

  try {
    mkdirSync(resolve(process.cwd(), 'temp-data'), { recursive: true })
    const existingFeedback = readLocalTesterFeedbackFile()
    const entries = Array.isArray(existingFeedback.entries) ? existingFeedback.entries : []
    entries.push({
      ...payload,
      created_at: new Date().toISOString(),
    })

    writeFileSync(
      TESTER_FEEDBACK_PATH,
      JSON.stringify({ entries }, null, 2),
    )
  } catch (error) {
    logStorageWarning('Tester feedback local write failed', error)
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
