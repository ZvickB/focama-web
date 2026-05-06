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
const OXYLABS_PRODUCT_FAILURES_TABLE = 'oxylabs_product_failures'
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

function createDayKey(value) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString().slice(0, 10)
}

function safeRate(part, whole) {
  if (!whole) {
    return 0
  }

  return Math.round((part / whole) * 1000) / 10
}

function normalizeFeedbackValue(value) {
  if (typeof value !== 'string') {
    return 'unknown'
  }

  const normalized = value.trim().toLowerCase()
  return normalized || 'unknown'
}

async function readSupabaseRowsSince(table, columns, sinceIso, pageSize = 1000, maxPages = 10) {
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

export async function readAnalyticsDashboardData({ sinceDays = 14, topQueryLimit = 12 } = {}) {
  if (!isSupabaseConfigured()) {
    return {
      available: false,
      reason: 'supabase_not_configured',
    }
  }

  const now = Date.now()
  const lookbackDays = Number.isFinite(Number(sinceDays)) ? Number(sinceDays) : 14
  const queryLimit = Number.isFinite(Number(topQueryLimit)) ? Number(topQueryLimit) : 12
  const sinceIso = new Date(now - lookbackDays * 24 * 60 * 60 * 1000).toISOString()

  try {
    let oxylabsFailuresResult = { rows: [], truncated: false }
    try {
      oxylabsFailuresResult = await readSupabaseRowsSince(
        OXYLABS_PRODUCT_FAILURES_TABLE,
        'asin, failure_type, status_code, query, created_at',
        sinceIso,
      )
    } catch {
      // Table may not exist yet — failures section will show empty.
    }

    const [runsResult, eventsResult, impressionsResult, clicksResult, feedbackResult] = await Promise.all([
      readSupabaseRowsSince(
        ANALYTICS_SEARCH_RUNS_TABLE,
        'search_id, session_id, product_query, entered_ai_refinement, used_show_products_now, completed_finalize, retry_round, best_result_key, created_at',
        sinceIso,
      ),
      readSupabaseRowsSince(
        ANALYTICS_SEARCH_EVENTS_TABLE,
        'search_id, event_type, event_data, created_at',
        sinceIso,
      ),
      readSupabaseRowsSince(
        ANALYTICS_RESULT_IMPRESSIONS_TABLE,
        'search_id, result_set, result_key, position, badge_type, is_best_pick, created_at',
        sinceIso,
      ),
      readSupabaseRowsSince(
        ANALYTICS_RESULT_CLICKS_TABLE,
        'search_id, result_set, result_key, position, badge_type, is_best_pick, click_target, created_at',
        sinceIso,
      ),
      readSupabaseRowsSince(
        TESTER_FEEDBACK_TABLE,
        'search_id, found_what_you_wanted, enjoyed_experience, was_simple, results_seen, finalized, stage_reached, created_at',
        sinceIso,
      ),
    ])

    const runs = runsResult.rows
    const events = eventsResult.rows
    const impressions = impressionsResult.rows
    const clicks = clicksResult.rows
    const feedback = feedbackResult.rows

    const retailerClicks = clicks.filter((entry) => entry.click_target === 'retailer')
    const cardClicks = clicks.filter((entry) => entry.click_target === 'card')
    const searchIdsWithRetailerClicks = new Set(retailerClicks.map((entry) => entry.search_id))
    const searchIdsWithCardClicks = new Set(cardClicks.map((entry) => entry.search_id))
    const runsBySearchId = new Map(runs.map((entry) => [entry.search_id, entry]))
    const retryAdviceSearchIds = new Set(
      events
        .filter((entry) => entry.event_type === 'retry_advice_started')
        .map((entry) => entry.search_id),
    )
    const refinedSearches = runs.filter((entry) => entry.entered_ai_refinement)
    const previewSearches = runs.filter((entry) => entry.used_show_products_now)
    const finalizedSearches = runs.filter((entry) => entry.completed_finalize)
    const dailyMap = new Map()
    const queryMap = new Map()
    const positionMap = new Map()
    const badgeMap = new Map()
    const feedbackSummary = {
      foundWhatYouWanted: {},
      enjoyedExperience: {},
      wasSimple: {},
    }

    for (const run of runs) {
      const dayKey = createDayKey(run.created_at)

      if (dayKey) {
        const dayEntry = dailyMap.get(dayKey) || {
          day: dayKey,
          finalized: 0,
          searches: 0,
          searchesWithRetailerClick: 0,
        }

        dayEntry.searches += 1
        if (run.completed_finalize) {
          dayEntry.finalized += 1
        }
        if (searchIdsWithRetailerClicks.has(run.search_id)) {
          dayEntry.searchesWithRetailerClick += 1
        }
        dailyMap.set(dayKey, dayEntry)
      }

      const normalizedQuery = typeof run.product_query === 'string' ? run.product_query.trim() : ''

      if (normalizedQuery) {
        const queryKey = normalizedQuery.toLowerCase()
        const queryEntry = queryMap.get(queryKey) || {
          finalized: 0,
          label: normalizedQuery,
          previewUsed: 0,
          refined: 0,
          retailerClicks: 0,
          searches: 0,
          searchesWithRetailerClick: 0,
        }

        queryEntry.searches += 1
        if (run.completed_finalize) {
          queryEntry.finalized += 1
        }
        if (run.entered_ai_refinement) {
          queryEntry.refined += 1
        }
        if (run.used_show_products_now) {
          queryEntry.previewUsed += 1
        }
        if (searchIdsWithRetailerClicks.has(run.search_id)) {
          queryEntry.searchesWithRetailerClick += 1
        }
        queryMap.set(queryKey, queryEntry)
      }
    }

    for (const click of retailerClicks) {
      const positionKey = `${click.result_set || 'final'}:${Number(click.position) || 0}`
      const positionEntry = positionMap.get(positionKey) || {
        cardClicks: 0,
        impressions: 0,
        position: Number(click.position) || 0,
        resultSet: click.result_set || 'final',
        retailerClicks: 0,
      }

      positionEntry.retailerClicks += 1
      positionMap.set(positionKey, positionEntry)

      const badgeLabel = click.badge_type || (click.is_best_pick ? 'Best match' : 'Unlabeled')
      const badgeEntry = badgeMap.get(badgeLabel) || {
        badgeType: badgeLabel,
        cardClicks: 0,
        impressions: 0,
        retailerClicks: 0,
      }

      badgeEntry.retailerClicks += 1
      badgeMap.set(badgeLabel, badgeEntry)
    }

    for (const click of cardClicks) {
      const positionKey = `${click.result_set || 'final'}:${Number(click.position) || 0}`
      const positionEntry = positionMap.get(positionKey) || {
        cardClicks: 0,
        impressions: 0,
        position: Number(click.position) || 0,
        resultSet: click.result_set || 'final',
        retailerClicks: 0,
      }

      positionEntry.cardClicks += 1
      positionMap.set(positionKey, positionEntry)

      const badgeLabel = click.badge_type || (click.is_best_pick ? 'Best match' : 'Unlabeled')
      const badgeEntry = badgeMap.get(badgeLabel) || {
        badgeType: badgeLabel,
        cardClicks: 0,
        impressions: 0,
        retailerClicks: 0,
      }

      badgeEntry.cardClicks += 1
      badgeMap.set(badgeLabel, badgeEntry)
    }

    for (const impression of impressions) {
      const positionKey = `${impression.result_set || 'final'}:${Number(impression.position) || 0}`
      const positionEntry = positionMap.get(positionKey) || {
        cardClicks: 0,
        impressions: 0,
        position: Number(impression.position) || 0,
        resultSet: impression.result_set || 'final',
        retailerClicks: 0,
      }

      positionEntry.impressions += 1
      positionMap.set(positionKey, positionEntry)

      const badgeLabel =
        impression.badge_type || (impression.is_best_pick ? 'Best match' : 'Unlabeled')
      const badgeEntry = badgeMap.get(badgeLabel) || {
        badgeType: badgeLabel,
        cardClicks: 0,
        impressions: 0,
        retailerClicks: 0,
      }

      badgeEntry.impressions += 1
      badgeMap.set(badgeLabel, badgeEntry)
    }

    for (const click of retailerClicks) {
      const run = runsBySearchId.get(click.search_id)

      if (!run) {
        continue
      }

      const normalizedQuery = typeof run.product_query === 'string' ? run.product_query.trim().toLowerCase() : ''
      const queryEntry = normalizedQuery ? queryMap.get(normalizedQuery) : null

      if (queryEntry) {
        queryEntry.retailerClicks += 1
      }
    }

    for (const entry of feedback) {
      const foundKey = normalizeFeedbackValue(entry.found_what_you_wanted)
      const enjoyedKey = normalizeFeedbackValue(entry.enjoyed_experience)
      const simpleKey = normalizeFeedbackValue(entry.was_simple)
      feedbackSummary.foundWhatYouWanted[foundKey] =
        (feedbackSummary.foundWhatYouWanted[foundKey] || 0) + 1
      feedbackSummary.enjoyedExperience[enjoyedKey] =
        (feedbackSummary.enjoyedExperience[enjoyedKey] || 0) + 1
      feedbackSummary.wasSimple[simpleKey] =
        (feedbackSummary.wasSimple[simpleKey] || 0) + 1
    }

    const topQueries = Array.from(queryMap.values())
      .map((entry) => ({
        ...entry,
        finalizeRate: safeRate(entry.finalized, entry.searches),
        retailerClickRate: safeRate(entry.searchesWithRetailerClick, entry.searches),
      }))
      .sort((left, right) => {
        if (right.searches !== left.searches) {
          return right.searches - left.searches
        }

        return right.retailerClicks - left.retailerClicks
      })
      .slice(0, queryLimit)

    const positionPerformance = Array.from(positionMap.values())
      .map((entry) => ({
        ...entry,
        cardOpenRate: safeRate(entry.cardClicks, entry.impressions),
        retailerClickRate: safeRate(entry.retailerClicks, entry.impressions),
      }))
      .sort((left, right) => {
        if (left.resultSet !== right.resultSet) {
          return left.resultSet.localeCompare(right.resultSet)
        }

        return left.position - right.position
      })

    const badgePerformance = Array.from(badgeMap.values())
      .map((entry) => ({
        ...entry,
        cardOpenRate: safeRate(entry.cardClicks, entry.impressions),
        retailerClickRate: safeRate(entry.retailerClicks, entry.impressions),
      }))
      .sort((left, right) => right.impressions - left.impressions)

    const dailyFunnel = Array.from(dailyMap.values())
      .map((entry) => ({
        ...entry,
        finalizeRate: safeRate(entry.finalized, entry.searches),
        retailerClickRate: safeRate(entry.searchesWithRetailerClick, entry.searches),
      }))
      .sort((left, right) => right.day.localeCompare(left.day))

    const oxylabsFailureRows = oxylabsFailuresResult.rows
    const oxylabsAsinMap = new Map()
    for (const row of oxylabsFailureRows) {
      const entry = oxylabsAsinMap.get(row.asin) || { asin: row.asin, timeout: 0, httpError: 0, unknown: 0, total: 0 }
      entry.total += 1
      if (row.failure_type === 'timeout') entry.timeout += 1
      else if (row.failure_type === 'http_error') entry.httpError += 1
      else entry.unknown += 1
      oxylabsAsinMap.set(row.asin, entry)
    }

    const oxylabsFailures = {
      total: oxylabsFailureRows.length,
      byType: {
        timeout: oxylabsFailureRows.filter((r) => r.failure_type === 'timeout').length,
        httpError: oxylabsFailureRows.filter((r) => r.failure_type === 'http_error').length,
        unknown: oxylabsFailureRows.filter((r) => r.failure_type === 'unknown').length,
      },
      topAsins: Array.from(oxylabsAsinMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 20),
    }

    return {
      available: true,
      generatedAt: new Date().toISOString(),
      lookbackDays,
      summary: {
        searches: runs.length,
        sessions: new Set(runs.map((entry) => entry.session_id)).size,
        finalizedSearches: finalizedSearches.length,
        finalizeRate: safeRate(finalizedSearches.length, runs.length),
        refinedSearches: refinedSearches.length,
        refinementRate: safeRate(refinedSearches.length, runs.length),
        previewSearches: previewSearches.length,
        previewRate: safeRate(previewSearches.length, runs.length),
        searchesWithRetailerClick: searchIdsWithRetailerClicks.size,
        retailerClickRate: safeRate(searchIdsWithRetailerClicks.size, runs.length),
        retailerClicks: retailerClicks.length,
        cardOpens: cardClicks.length,
        searchesWithCardOpen: searchIdsWithCardClicks.size,
        retryAdviceSearches: retryAdviceSearchIds.size,
        feedbackResponses: feedback.length,
      },
      dailyFunnel,
      topQueries,
      positionPerformance,
      badgePerformance,
      feedbackSummary,
      oxylabsFailures,
      recentSearches: [...runs]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 25)
        .map((run) => ({
          searchId: run.search_id,
          query: run.product_query,
          finalized: run.completed_finalize,
          refined: run.entered_ai_refinement,
          hadRetailerClick: searchIdsWithRetailerClicks.has(run.search_id),
          createdAt: run.created_at,
        })),
      dataQuality: {
        truncated:
          runsResult.truncated ||
          eventsResult.truncated ||
          impressionsResult.truncated ||
          clicksResult.truncated ||
          feedbackResult.truncated,
      },
    }
  } catch (error) {
    logStorageWarning('Analytics dashboard read failed', error)

    return {
      available: false,
      reason: 'read_failed',
    }
  }
}

export async function recordOxylabsProductFailures(failures = []) {
  if (!isSupabaseConfigured() || !Array.isArray(failures) || failures.length === 0) {
    return
  }

  try {
    const supabase = getSupabaseAdminClient()
    const { error } = await supabase.from(OXYLABS_PRODUCT_FAILURES_TABLE).insert(
      failures.map((f) => ({
        asin: f.asin,
        failure_type: f.failureType,
        status_code: f.statusCode || null,
        query: f.query || null,
      })),
    )

    if (error) {
      throw error
    }
  } catch {
    // Best-effort — don't block the enrichment path.
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
