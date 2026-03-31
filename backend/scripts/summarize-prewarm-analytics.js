import { createClient } from '@supabase/supabase-js'
import { getEnv } from '../lib/search-data.js'

const SEARCH_EVENTS_TABLE = 'analytics_search_events'
const SEARCH_RUNS_TABLE = 'analytics_search_runs'
const PAGE_SIZE = 1000
const DEFAULT_LOOKBACK_HOURS = 24
const PREWARM_EVENT_TYPES = [
  'finalize_prewarm_started',
  'finalize_prewarm_ready',
  'finalize_prewarm_waited_on',
  'finalize_prewarm_consumed',
  'finalize_prewarm_unused',
  'finalize_prewarm_aborted',
  'finalize_prewarm_failed',
  'final_results_shown',
]

function parseArgs(argv) {
  const options = {
    hours: DEFAULT_LOOKBACK_HOURS,
  }

  for (const argument of argv) {
    if (argument.startsWith('--hours=')) {
      const parsed = Number(argument.slice('--hours='.length))

      if (Number.isFinite(parsed) && parsed > 0) {
        options.hours = parsed
      }
    }
  }

  return options
}

function average(values) {
  const numericValues = values.filter((value) => Number.isFinite(value))

  if (numericValues.length === 0) {
    return null
  }

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
}

function roundMetric(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null
}

function percentage(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return null
  }

  return roundMetric((part / total) * 100)
}

function summarizeByReason(events) {
  const counts = new Map()

  for (const event of events) {
    const reason =
      typeof event?.event_data?.reason === 'string' && event.event_data.reason.trim()
        ? event.event_data.reason.trim()
        : 'unknown'
    counts.set(reason, (counts.get(reason) || 0) + 1)
  }

  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1]))
}

async function fetchAllRows(queryBuilderFactory) {
  const rows = []
  let offset = 0

  while (true) {
    const query = queryBuilderFactory(offset, offset + PAGE_SIZE - 1)
    const { data, error } = await query

    if (error) {
      throw error
    }

    if (!Array.isArray(data) || data.length === 0) {
      break
    }

    rows.push(...data)

    if (data.length < PAGE_SIZE) {
      break
    }

    offset += PAGE_SIZE
  }

  return rows
}

function getSupabaseClient() {
  const url = getEnv('SUPABASE_URL')?.trim() || ''
  const secretKey = getEnv('SUPABASE_SECRET_KEY')?.trim() || ''
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')?.trim() || ''
  const serverKey = secretKey || serviceRoleKey

  if (!url || !serverKey) {
    throw new Error(
      'Supabase is not configured. Add SUPABASE_URL plus SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY before running this summary.',
    )
  }

  return createClient(url, serverKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function printSection(title, rows) {
  console.log(`\n${title}`)

  for (const row of rows) {
    console.log(`- ${row}`)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const supabase = getSupabaseClient()
  const since = new Date(Date.now() - options.hours * 60 * 60 * 1000).toISOString()

  const [events, runs] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from(SEARCH_EVENTS_TABLE)
        .select('search_id, event_type, event_data, created_at')
        .gte('created_at', since)
        .in('event_type', PREWARM_EVENT_TYPES)
        .order('created_at', { ascending: false })
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from(SEARCH_RUNS_TABLE)
        .select('search_id, product_query, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .range(from, to),
    ),
  ])

  const eventsByType = Object.fromEntries(
    PREWARM_EVENT_TYPES.map((eventType) => [
      eventType,
      events.filter((event) => event.event_type === eventType),
    ]),
  )
  const recentConsumedSearches = eventsByType.finalize_prewarm_consumed
    .slice(0, 5)
    .map((event) => {
      const run = runs.find((entry) => entry.search_id === event.search_id)
      return {
        clickToResultsMs: roundMetric(Number(event.event_data?.clickToResultsMs)),
        createdAt: event.created_at,
        productQuery: run?.product_query || 'unknown query',
        totalPrewarmMs: roundMetric(Number(event.event_data?.totalPrewarmMs)),
      }
    })

  const startedCount = eventsByType.finalize_prewarm_started.length
  const consumedCount = eventsByType.finalize_prewarm_consumed.length
  const abortedCount = eventsByType.finalize_prewarm_aborted.length
  const unusedCount = eventsByType.finalize_prewarm_unused.length
  const failedCount = eventsByType.finalize_prewarm_failed.length
  const waitedOnCount = eventsByType.finalize_prewarm_waited_on.length
  const finalResultsWithPrewarmCount = eventsByType.final_results_shown.filter((event) =>
    Boolean(event.event_data?.usedPrewarm),
  ).length

  const averageReadyTotalMs = roundMetric(
    average(eventsByType.finalize_prewarm_ready.map((event) => Number(event.event_data?.totalMs))),
  )
  const averageReadyOpenAiMs = roundMetric(
    average(eventsByType.finalize_prewarm_ready.map((event) => Number(event.event_data?.openaiMs))),
  )
  const averageReadyTokens = roundMetric(
    average(eventsByType.finalize_prewarm_ready.map((event) => Number(event.event_data?.totalTokens))),
  )
  const averageConsumedClickToResultsMs = roundMetric(
    average(eventsByType.finalize_prewarm_consumed.map((event) => Number(event.event_data?.clickToResultsMs))),
  )
  const averageConsumedPrewarmTotalMs = roundMetric(
    average(eventsByType.finalize_prewarm_consumed.map((event) => Number(event.event_data?.totalPrewarmMs))),
  )

  const wastedCount = abortedCount + unusedCount + failedCount

  console.log('Finalize prewarm summary')
  console.log(`Lookback window: last ${options.hours} hour(s)`)
  console.log(`Window start: ${since}`)

  printSection('Counts', [
    `search runs seen: ${runs.length}`,
    `prewarm started: ${startedCount}`,
    `prewarm ready: ${eventsByType.finalize_prewarm_ready.length}`,
    `prewarm waited on: ${waitedOnCount}`,
    `prewarm consumed: ${consumedCount}`,
    `prewarm final results confirmed: ${finalResultsWithPrewarmCount}`,
    `prewarm aborted: ${abortedCount}`,
    `prewarm unused: ${unusedCount}`,
    `prewarm failed: ${failedCount}`,
  ])

  printSection('Rates', [
    `consumed / started: ${percentage(consumedCount, startedCount) ?? 'n/a'}%`,
    `wasted / started: ${percentage(wastedCount, startedCount) ?? 'n/a'}%`,
    `waited on / started: ${percentage(waitedOnCount, startedCount) ?? 'n/a'}%`,
  ])

  printSection('Timing', [
    `average prewarm ready total: ${averageReadyTotalMs ?? 'n/a'} ms`,
    `average prewarm ready OpenAI: ${averageReadyOpenAiMs ?? 'n/a'} ms`,
    `average prewarm ready tokens: ${averageReadyTokens ?? 'n/a'}`,
    `average consumed click-to-results: ${averageConsumedClickToResultsMs ?? 'n/a'} ms`,
    `average consumed full prewarm total: ${averageConsumedPrewarmTotalMs ?? 'n/a'} ms`,
  ])

  printSection('Discard reasons', [
    `unused: ${JSON.stringify(summarizeByReason(eventsByType.finalize_prewarm_unused))}`,
    `aborted: ${JSON.stringify(summarizeByReason(eventsByType.finalize_prewarm_aborted))}`,
  ])

  if (recentConsumedSearches.length > 0) {
    printSection(
      'Recent consumed searches',
      recentConsumedSearches.map(
        (entry) =>
          `${entry.createdAt}: "${entry.productQuery}" | click-to-results ${entry.clickToResultsMs ?? 'n/a'} ms | prewarm total ${entry.totalPrewarmMs ?? 'n/a'} ms`,
      ),
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
