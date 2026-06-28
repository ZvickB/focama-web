import {
  ANALYTICS_RESULT_CLICKS_TABLE,
  ANALYTICS_RESULT_IMPRESSIONS_TABLE,
  ANALYTICS_SEARCH_EVENTS_TABLE,
  ANALYTICS_SEARCH_RUNS_TABLE,
  getSupabaseAdminClient,
  isSupabaseConfigured,
  logStorageWarning,
  readSupabaseRowsSince,
  SEARCH_CACHE_TABLE,
  SEARCH_HISTORY_TABLE,
  TESTER_FEEDBACK_TABLE,
} from './supabase-client.js'
import { normalizeFeedbackValue } from './feedback-storage.js'
import { readSearchDiagnosticsDashboardData } from './search-diagnostics-storage.js'

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

    let searchDiagnostics = { available: false, reason: 'not_loaded' }
    try {
      searchDiagnostics = await readSearchDiagnosticsDashboardData({ sinceDays: lookbackDays })
    } catch {
      searchDiagnostics = { available: false, reason: 'read_failed' }
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
      searchDiagnostics,
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

export async function readCachePoolEntries({ query = '', limit = 25 } = {}) {
  if (!isSupabaseConfigured()) {
    return []
  }

  const supabase = getSupabaseAdminClient()

  if (!supabase) {
    return []
  }

  let dbQuery = supabase
    .from(SEARCH_CACHE_TABLE)
    .select('product_query, details, candidate_pool, cached_at, source')
    .order('cached_at', { ascending: false })
    .limit(limit)

  if (query) {
    dbQuery = dbQuery.ilike('product_query', `%${query}%`)
  }

  const { data, error } = await dbQuery

  if (error) {
    throw error
  }

  const rows = Array.isArray(data) ? data : []

  return rows.map((row) => {
    const candidates = Array.isArray(row.candidate_pool?.candidates) ? row.candidate_pool.candidates : []
    return {
      productQuery: row.product_query || '',
      details: row.details || '',
      cachedAt: row.cached_at || null,
      source: row.source || null,
      candidateCount: candidates.length,
      candidates: candidates.map((c, index) => ({
        id: c.id ?? null,
        rank: index + 1,
        title: c.title || '',
        price: c.price ?? null,
        rating: c.rating ?? null,
        reviewCount: c.reviewCount ?? null,
        source: c.source || null,
        attributes: Array.isArray(c.attributes) ? c.attributes.slice(0, 6) : [],
        description: typeof c.description === 'string' ? c.description.slice(0, 200) : '',
      })),
    }
  })
}
