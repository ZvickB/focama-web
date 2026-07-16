import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import PageShell from '@/components/PageShell.jsx'
import Seo from '@/components/Seo.jsx'
import { fetchBackend } from '@/lib/backendUrl.js'

const LOOKBACK_OPTIONS = [7, 14, 30]
const ACTIVITY_LAYOUT_STORAGE_KEY = 'focamai:activity-dashboard-layout:v1'

const ACTIVITY_WIDGETS = [
  {
    id: 'users-today',
    title: 'Users Today',
    description: 'Distinct devices with a search started today (UTC).',
  },
  {
    id: 'recent-journeys',
    title: 'Recent User Journeys',
    description: 'The latest search flows and their current stage.',
  },
  {
    id: 'recent-searches',
    title: 'Recent Searches',
    description: 'The latest submitted product searches.',
  },
  {
    id: 'retailer-activity',
    title: 'Retailer Activity',
    description: 'Amazon clickouts from today’s searches (UTC).',
  },
  {
    id: 'possible-confusion',
    title: 'Possible Confusion',
    description: 'Searches where someone asked to improve the picks today (UTC).',
  },
  {
    id: 'errors',
    title: 'Errors',
    description: 'Recent failed search attempts requiring a closer look.',
  },
]

const DEFAULT_ACTIVITY_LAYOUT = ACTIVITY_WIDGETS.map((widget) => ({
  id: widget.id,
  visible: true,
}))

function normalizeActivityLayout(value) {
  const savedItems = Array.isArray(value) ? value : []
  const knownIds = new Set(ACTIVITY_WIDGETS.map((widget) => widget.id))
  const seenIds = new Set()
  const orderedKnownItems = savedItems.filter((item) => {
    if (!knownIds.has(item?.id) || seenIds.has(item.id)) return false
    seenIds.add(item.id)
    return true
  })
  const missingItems = DEFAULT_ACTIVITY_LAYOUT.filter((item) => !seenIds.has(item.id))

  return [...orderedKnownItems, ...missingItems].map((item) => ({
    id: item.id,
    visible: item.visible !== false,
  }))
}

function readActivityLayout() {
  if (typeof window === 'undefined') return DEFAULT_ACTIVITY_LAYOUT

  try {
    return normalizeActivityLayout(JSON.parse(window.localStorage.getItem(ACTIVITY_LAYOUT_STORAGE_KEY)))
  } catch {
    return DEFAULT_ACTIVITY_LAYOUT
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0)
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatActivityTime(value) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function createDashboardError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

async function fetchCachePool({ query, limit = 10 }) {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  params.set('limit', String(limit))
  const response = await fetchBackend(`/api/analytics/cache-pool?${params}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw createDashboardError(response.status, payload.error || 'Unable to load cache pool.')
  return payload
}

async function fetchFinalizeHistory() {
  const response = await fetchBackend('/api/analytics/finalize-history')
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw createDashboardError(response.status, payload.error || 'Unable to load finalize history.')
  return payload
}

function buildCopyText(entry) {
  const lines = [
    `Product query: ${entry.productQuery || '(none)'}`,
    `User context: ${entry.details || 'None provided.'}`,
    '',
    'Candidates:',
  ]
  entry.candidates.forEach((c) => {
    const meta = [c.price, c.rating != null ? `${c.rating}★` : null, c.reviewCount != null ? `${formatNumber(c.reviewCount)} reviews` : null, c.source].filter(Boolean).join(' | ')
    lines.push(`${c.rank}. ${c.title || '—'}${meta ? `  —  ${meta}` : ''}`)
    if (c.attributes.length > 0) lines.push(`   Attributes: ${c.attributes.join(', ')}`)
    if (c.description) lines.push(`   ${c.description}`)
  })
  return lines.join('\n')
}

function buildCopyAllText(entries) {
  return entries.map((entry, i) => {
    const separator = i > 0 ? '\n\n' + '─'.repeat(60) + '\n\n' : ''
    return separator + buildCopyText(entry)
  }).join('')
}

async function fetchAnalyticsDashboard({ days }) {
  const response = await fetchBackend(`/api/analytics/dashboard?days=${days}`)

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw createDashboardError(response.status, payload.error || 'Unable to load analytics dashboard.')
  }

  return payload
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-[22px] border border-stone-200/80 bg-white/90 p-4 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.35)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{hint}</p>
    </div>
  )
}

function SectionHeading({ title, description }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="text-sm leading-6 text-slate-500">{description}</p>
    </div>
  )
}

function CollapsibleSection({ title, description, defaultOpen = false, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className="rounded-[24px] border border-stone-200/80 bg-white/90 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-stone-50/80 transition"
      >
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
          {description ? <p className="text-sm leading-5 text-slate-500">{description}</p> : null}
        </div>
        <span className="mt-0.5 shrink-0 text-slate-400 text-sm">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen ? <div className="border-t border-stone-100 px-5 py-5 space-y-4">{children}</div> : null}
    </div>
  )
}

function SimpleTable({ columns, rows, emptyMessage }) {
  if (!rows.length) {
    return (
      <div className="rounded-[20px] border border-dashed border-stone-300 bg-stone-50/70 px-4 py-5 text-sm text-slate-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-[22px] border border-stone-200/80 bg-white/92">
      <table className="min-w-full divide-y divide-stone-200 text-sm">
        <thead className="bg-stone-50/80">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${columns[0]?.key || 'row'}`} className="align-top">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-slate-700">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CandidatePoolInspector() {
  const [inputValue, setInputValue] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [expandedIndex, setExpandedIndex] = useState(null)
  const [copiedIndex, setCopiedIndex] = useState(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const inputRef = useRef(null)

  const poolQuery = useQuery({
    queryKey: ['cache-pool', submittedQuery],
    queryFn: () => fetchCachePool({ query: submittedQuery }),
    enabled: true,
    retry: false,
  })

  function handleCopy(e, entry, index) {
    e.stopPropagation()
    navigator.clipboard.writeText(buildCopyText(entry)).then(() => {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    })
  }

  function handleCopyAll(entries) {
    navigator.clipboard.writeText(buildCopyAllText(entries)).then(() => {
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    setExpandedIndex(null)
    setSubmittedQuery(inputValue.trim())
  }

  const entries = poolQuery.data?.entries || []

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="e.g. travel stroller — leave blank to see recent"
          className="flex-1 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <button
          type="submit"
          className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 transition"
        >
          Inspect
        </button>
      </form>

      {poolQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : poolQuery.isError ? (
        <div className="rounded-[20px] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900">
          {poolQuery.error?.message || 'Unable to load cache pool.'}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-stone-300 bg-stone-50/70 px-4 py-5 text-sm text-slate-500">
          {submittedQuery ? `No cache entries found matching "${submittedQuery}".` : 'No cache entries found.'}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => handleCopyAll(entries)}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-stone-50 transition"
            >
              {copiedAll ? 'Copied!' : `Copy all ${entries.length}`}
            </button>
          </div>
          {entries.map((entry, index) => {
            const isOpen = expandedIndex === index
            return (
              <div key={`${entry.productQuery}-${entry.cachedAt}`} className="rounded-[20px] border border-stone-200/80 bg-white/90 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedIndex(isOpen ? null : index)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-stone-50/80 transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{entry.productQuery || '—'}</p>
                    {entry.details ? (
                      <p className="mt-0.5 text-xs text-slate-500 truncate">Context: {entry.details}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
                    <span>{entry.candidateCount} candidates</span>
                    <span>{entry.cachedAt ? new Date(entry.cachedAt).toLocaleString() : '—'}</span>
                    <button
                      type="button"
                      onClick={(e) => handleCopy(e, entry, index)}
                      className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-stone-50 transition"
                    >
                      {copiedIndex === index ? 'Copied!' : 'Copy'}
                    </button>
                    <span className="text-slate-400">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen ? (
                  <div className="border-t border-stone-100 divide-y divide-stone-100">
                    {entry.candidates.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-slate-400">No candidates stored.</p>
                    ) : (
                      entry.candidates.map((c) => (
                        <div key={c.id ?? c.rank} className="px-4 py-3 text-sm">
                          <div className="flex items-start gap-3">
                            <span className="shrink-0 w-6 text-center text-xs font-semibold text-slate-400 mt-0.5">{c.rank}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 leading-snug">{c.title || '—'}</p>
                              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                                {c.price != null ? <span>{c.price}</span> : null}
                                {c.rating != null ? <span>{c.rating} ★</span> : null}
                                {c.reviewCount != null ? <span>{formatNumber(c.reviewCount)} reviews</span> : null}
                                {c.id != null ? <span className="text-slate-400">id: {c.id}</span> : null}
                              </div>
                              {c.attributes.length > 0 ? (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {c.attributes.map((attr, i) => (
                                    <span key={i} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-slate-600">{attr}</span>
                                  ))}
                                </div>
                              ) : null}
                              {c.description ? (
                                <p className="mt-1 text-xs text-slate-400 leading-relaxed">{c.description}</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FinalizeHistoryInspector() {
  const [expandedIndex, setExpandedIndex] = useState(null)

  const historyQuery = useQuery({
    queryKey: ['finalize-history'],
    queryFn: fetchFinalizeHistory,
    retry: false,
    refetchInterval: 10000,
  })

  const entries = historyQuery.data?.entries || []

  return (
    <div className="space-y-4">
      {historyQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : historyQuery.isError ? (
        <div className="rounded-[20px] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900">
          {historyQuery.error?.message || 'Unable to load finalize history.'}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-stone-300 bg-stone-50/70 px-4 py-5 text-sm text-slate-500">
          No finalizations recorded yet this session. Run a search through to the picks screen and it will appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => {
            const isOpen = expandedIndex === index
            const strategyLabel = entry.strategy === 'haiku_lock' ? 'Haiku' : entry.strategy === 'haiku_lock_topped_up' ? 'Haiku + top-up' : entry.strategy === 'rules_fallback' ? 'Rules fallback' : entry.strategy || '—'
            return (
              <div key={`${entry.query}-${entry.timestamp}`} className="rounded-[20px] border border-stone-200/80 bg-white/90 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedIndex(isOpen ? null : index)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-stone-50/80 transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{entry.query || '—'}</p>
                    {entry.details ? (
                      <p className="mt-0.5 text-xs text-slate-500 truncate">Context: {entry.details}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
                    <span>{entry.picks?.length ?? 0} picks</span>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-slate-600">{strategyLabel}</span>
                    <span>{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '—'}</span>
                    <span className="text-slate-400">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen ? (
                  <div className="border-t border-stone-100 divide-y divide-stone-100">
                    {!entry.picks?.length ? (
                      <p className="px-4 py-3 text-sm text-slate-400">No picks recorded.</p>
                    ) : (
                      entry.picks.map((p) => (
                        <div key={p.rank} className="px-4 py-3 text-sm">
                          <div className="flex items-start gap-3">
                            <span className="shrink-0 w-6 text-center text-xs font-semibold text-slate-400 mt-0.5">{p.rank}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-800 leading-snug">{p.title}</p>
                              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                                {p.price != null ? <span>{p.price}</span> : null}
                                {p.rating != null ? <span>{p.rating} ★</span> : null}
                                {p.reviewCount != null ? <span>{formatNumber(p.reviewCount)} reviews</span> : null}
                                {p.badge ? <span className="text-indigo-500">{p.badge}</span> : null}
                                {p.id != null ? <span className="text-slate-400">id: {p.id}</span> : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ActivityWidget({ activity, widget }) {
  const usersToday = activity?.usersToday
  const journeys = activity?.recentJourneys || []
  const searches = activity?.recentSearches || []
  const retailerActivity = activity?.retailerActivity
  const confusion = activity?.possibleConfusion
  const errors = activity?.errors

  let content = null

  if (widget.id === 'users-today') {
    content = (
      <>
        <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">{formatNumber(usersToday?.devices)}</p>
        <p className="mt-1 text-sm text-slate-500">devices started {formatNumber(usersToday?.searches)} searches today</p>
        {usersToday?.accounts ? <p className="mt-3 text-xs text-slate-500">{formatNumber(usersToday.accounts)} signed-in account{usersToday.accounts === 1 ? '' : 's'} active</p> : null}
      </>
    )
  } else if (widget.id === 'recent-journeys') {
    content = journeys.length ? (
      <ol className="mt-5 space-y-3">
        {journeys.map((journey) => (
          <li key={journey.searchId} className="border-t border-stone-100 pt-3 first:border-0 first:pt-0">
            <p className="truncate text-sm font-medium text-slate-800">{journey.query}</p>
            <p className="mt-1 text-xs text-slate-500">{journey.status} · {journey.platform} · {formatActivityTime(journey.createdAt)}</p>
          </li>
        ))}
      </ol>
    ) : null
  } else if (widget.id === 'recent-searches') {
    content = searches.length ? (
      <ol className="mt-5 space-y-3">
        {searches.map((search) => (
          <li key={search.searchId} className="flex items-start justify-between gap-3 border-t border-stone-100 pt-3 first:border-0 first:pt-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{search.query}</p>
              <p className="mt-1 text-xs text-slate-500">{search.platform} · {formatActivityTime(search.createdAt)}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${search.finalized ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-slate-500'}`}>
              {search.finalized ? 'Picks shown' : 'Started'}
            </span>
          </li>
        ))}
      </ol>
    ) : null
  } else if (widget.id === 'retailer-activity') {
    content = (
      <>
        <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">{formatNumber(retailerActivity?.clickoutsToday)}</p>
        <p className="mt-1 text-sm text-slate-500">Amazon clickouts from {formatNumber(retailerActivity?.searchesToday)} searches today</p>
        {retailerActivity?.recent?.length ? (
          <ol className="mt-4 space-y-2 border-t border-stone-100 pt-3">
            {retailerActivity.recent.map((entry) => <li key={`${entry.searchId}-${entry.createdAt}`} className="truncate text-xs text-slate-500">{entry.query} · {formatActivityTime(entry.createdAt)}</li>)}
          </ol>
        ) : null}
      </>
    )
  } else if (widget.id === 'possible-confusion') {
    content = (
      <>
        <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">{formatNumber(confusion?.improvePicksToday)}</p>
        <p className="mt-1 text-sm text-slate-500">Improve Picks requests today</p>
        {confusion?.recent?.length ? (
          <ol className="mt-4 space-y-2 border-t border-stone-100 pt-3">
            {confusion.recent.map((entry) => <li key={entry.searchId} className="truncate text-xs text-slate-500">{entry.query} · {formatActivityTime(entry.createdAt)}</li>)}
          </ol>
        ) : null}
      </>
    )
  } else if (widget.id === 'errors') {
    content = (
      <>
        <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">{formatNumber(errors?.count)}</p>
        <p className="mt-1 text-sm text-slate-500">failed attempts in the current lookback window</p>
        {errors?.recent?.length ? (
          <ol className="mt-4 space-y-2 border-t border-stone-100 pt-3">
            {errors.recent.map((entry) => <li key={entry.searchId} className="truncate text-xs text-slate-500">{entry.query || 'Search'} · {entry.error || entry.status}</li>)}
          </ol>
        ) : null}
      </>
    )
  }

  return (
    <section className="rounded-[24px] border border-stone-200/80 bg-white/90 p-5 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.35)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Activity</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{widget.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{widget.description}</p>
      {content || <p className="mt-5 rounded-[18px] border border-dashed border-stone-300 bg-stone-50/70 px-4 py-5 text-sm leading-6 text-slate-500">No activity recorded yet.</p>}
    </section>
  )
}

function ActivityDashboard({ activity, error, isCustomizing, isLoading, layout, onToggleCustomization, onToggleWidget, onMoveWidget, onRestoreDefaults }) {
  const widgetsById = new Map(ACTIVITY_WIDGETS.map((widget) => [widget.id, widget]))
  const visibleWidgets = layout
    .filter((item) => item.visible)
    .map((item) => widgetsById.get(item.id))
    .filter(Boolean)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-sm font-medium text-slate-700">Operational snapshot</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            This shell is ready for shared activity events. It intentionally does not change the existing analytics reports.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleCustomization}
          aria-expanded={isCustomizing}
          className="shrink-0 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          {isCustomizing ? 'Close customization' : 'Customize Dashboard'}
        </button>
      </div>

      <div className={`grid gap-5 ${isCustomizing ? 'xl:grid-cols-[minmax(0,1fr)_18rem]' : ''}`}>
        <div className="grid gap-4 md:grid-cols-2">
          {visibleWidgets.length ? (
            visibleWidgets.map((widget) => <ActivityWidget key={widget.id} activity={activity} widget={widget} />)
          ) : (
            <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50/70 px-5 py-8 text-sm leading-6 text-slate-500 md:col-span-2">
              All Activity widgets are hidden. Use Customize Dashboard to show one again.
            </div>
          )}
        </div>

        {isCustomizing ? (
          <aside aria-label="Customize dashboard" className="h-fit rounded-[24px] border border-stone-200/80 bg-white/90 p-4 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-slate-900">Customize Dashboard</h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">Choose what appears and set its order.</p>
              </div>
              <button
                type="button"
                onClick={onRestoreDefaults}
                className="shrink-0 text-xs font-medium text-slate-600 underline underline-offset-4 transition hover:text-slate-900"
              >
                Restore defaults
              </button>
            </div>
            <ol className="mt-4 divide-y divide-stone-100 border-y border-stone-100">
              {layout.map((item, index) => {
                const widget = widgetsById.get(item.id)
                if (!widget) return null

                return (
                  <li key={item.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={item.visible}
                          onChange={() => onToggleWidget(item.id)}
                          className="h-4 w-4 rounded border-stone-300 text-slate-900 focus:ring-slate-400"
                        />
                        <span className="truncate">{widget.title}</span>
                      </label>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => onMoveWidget(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${widget.title} up`}
                          className="rounded-full border border-stone-200 px-2 py-0.5 text-xs text-slate-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveWidget(index, 1)}
                          disabled={index === layout.length - 1}
                          aria-label={`Move ${widget.title} down`}
                          className="rounded-full border border-stone-200 px-2 py-0.5 text-xs text-slate-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </aside>
        ) : null}
      </div>

      {isLoading ? <p className="text-sm text-slate-500">Loading activity…</p> : null}
      {error ? <p className="rounded-[18px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">{error.message || 'Unable to load activity right now.'}</p> : null}
    </div>
  )
}

function MobileDashboard({ error, isLoading, mobile }) {
  const summary = mobile?.summary

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-4 text-sm leading-6 text-slate-600 sm:p-5">
        Mobile activity is development-only. It uses per-search run IDs, not persistent devices or accounts.
      </div>
      {isLoading ? <p className="text-sm text-slate-500">Loading mobile activity…</p> : null}
      {error ? <p className="rounded-[18px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">{error.message || 'Unable to load mobile activity right now.'}</p> : null}
      {!isLoading && !error && !mobile?.available ? (
        <div className="rounded-[24px] border border-dashed border-stone-300 bg-white/80 px-5 py-8 text-sm leading-6 text-slate-500">
          No mobile events yet. Enable the internal mobile analytics flag in a development build, then complete a search.
        </div>
      ) : null}
      {mobile?.available ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Searches', summary?.searches],
              ['Results success', formatPercent(summary?.resultsSuccessRate)],
              ['Failures', summary?.failures],
              ['Amazon click rate', formatPercent(summary?.amazonClickRate)],
              ['Partial shortlists', summary?.candidateRecoveryShown],
              ['Better search chosen', summary?.candidateRecoveryAccepted],
              ['Partial picks kept', summary?.candidateRecoveryKept],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[20px] border border-stone-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Mobile funnel</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              {(mobile.funnel || []).map((step) => <div key={step.label} className="rounded-2xl bg-stone-50 p-3"><p className="text-2xl font-semibold text-slate-900">{formatNumber(step.count)}</p><p className="mt-1 text-xs leading-5 text-slate-500">{step.label}</p></div>)}
            </div>
          </section>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Recent mobile searches</h2>
              <ul className="mt-3 divide-y divide-stone-100">
                {(mobile.recentSearches || []).map((search) => <li key={`${search.query}-${search.createdAt}`} className="py-3"><p className="truncate text-sm font-medium text-slate-800">{search.query}</p><p className="mt-1 text-xs text-slate-500">{search.status} · {search.resultCount} results · {formatActivityTime(search.createdAt)}</p></li>)}
              </ul>
            </section>
            <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Failures to investigate</h2>
              <ul className="mt-3 divide-y divide-stone-100">
                {(mobile.failures || []).length ? mobile.failures.map((failure) => <li key={`${failure.query}-${failure.createdAt}`} className="py-3"><p className="truncate text-sm font-medium text-slate-800">{failure.query}</p><p className="mt-1 text-xs text-slate-500">{failure.stage} · {formatActivityTime(failure.createdAt)}</p></li>) : <li className="py-3 text-sm text-slate-500">No mobile failures in this window.</li>}
              </ul>
            </section>
          </div>
        </>
      ) : null}
    </div>
  )
}

function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('activity')
  const [activityLayout, setActivityLayout] = useState(readActivityLayout)
  const [isCustomizingActivity, setIsCustomizingActivity] = useState(false)
  const [days, setDays] = useState(14)
  const [diagnosticFilter, setDiagnosticFilter] = useState('')
  const hasHydrated = typeof window !== 'undefined'

  const dashboardQuery = useQuery({
    queryKey: ['analytics-dashboard', days],
    queryFn: () => fetchAnalyticsDashboard({ days }),
    enabled: hasHydrated,
    retry: false,
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVITY_LAYOUT_STORAGE_KEY, JSON.stringify(activityLayout))
    } catch {
      // The in-memory layout remains usable when browser storage is unavailable.
    }
  }, [activityLayout])

  function toggleActivityWidget(id) {
    setActivityLayout((current) => current.map((item) => (
      item.id === id ? { ...item, visible: !item.visible } : item
    )))
  }

  function moveActivityWidget(index, direction) {
    setActivityLayout((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.length) return current

      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  const dashboard = dashboardQuery.data
  const summary = dashboard?.summary
  const diagnostics = dashboard?.searchDiagnostics
  const normalizedDiagnosticFilter = diagnosticFilter.trim().toLowerCase()
  const filteredDiagnosticFailures = (diagnostics?.recentFailures || []).filter((row) => {
    if (!normalizedDiagnosticFilter) {
      return true
    }

    return [
      row.searchId,
      row.status,
      row.stage,
      row.platform,
      row.query,
      row.amazonDomain,
      row.provider,
      row.reportedFilterType,
      row.error,
      row.backendReachable === true ? 'backend reachable' : 'backend not reachable',
      row.connectivityOk === true ? 'connectivity ok' : 'connectivity failed',
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedDiagnosticFilter))
  })

  return (
    <>
      <Seo
        title="Internal Analytics"
        description="Internal Focamai search funnel dashboard."
        path="/admin/analytics"
        noindex
      />
      <PageShell
        eyebrow="Internal Analytics"
        title={activeTab === 'activity' ? 'What needs attention right now.' : activeTab === 'mobile' ? 'Is the mobile search flow working?' : 'Search funnel signals, not just pageviews.'}
        description={activeTab === 'activity'
          ? 'A configurable operational view for the activity signals that will matter as Focamai grows.'
          : activeTab === 'mobile'
            ? 'Inspect mobile search outcomes, engagement, and failures without persistent user tracking.'
          : 'Use this page to see where searches turn into final picks, where people bail out, and which query patterns or result positions deserve attention.'}
      >
        <div className="space-y-6">
          <div className="flex gap-2 border-b border-stone-200" role="tablist" aria-label="Dashboard views">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'activity'}
              onClick={() => setActiveTab('activity')}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                activeTab === 'activity'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Activity
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'analytics'}
              onClick={() => setActiveTab('analytics')}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                activeTab === 'analytics'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Analytics
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'mobile'}
              onClick={() => setActiveTab('mobile')}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                activeTab === 'mobile'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Mobile
            </button>
          </div>

          {activeTab === 'activity' ? (
            <ActivityDashboard
              layout={activityLayout}
              activity={dashboard?.activity}
              error={dashboardQuery.isError ? dashboardQuery.error : null}
              isCustomizing={isCustomizingActivity}
              isLoading={dashboardQuery.isLoading}
              onToggleCustomization={() => setIsCustomizingActivity((value) => !value)}
              onToggleWidget={toggleActivityWidget}
              onMoveWidget={moveActivityWidget}
              onRestoreDefaults={() => setActivityLayout(DEFAULT_ACTIVITY_LAYOUT)}
            />
          ) : activeTab === 'mobile' ? (
            <MobileDashboard
              error={dashboardQuery.isError ? dashboardQuery.error : null}
              isLoading={dashboardQuery.isLoading}
              mobile={dashboard?.mobile}
            />
          ) : (
        <div className="space-y-4">
          <div className="rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Lookback window</p>
                <div className="flex flex-wrap gap-2">
                  {LOOKBACK_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDays(option)}
                      className={`rounded-full px-4 py-2 text-sm transition ${
                        days === option
                          ? 'bg-slate-900 text-white'
                          : 'border border-stone-200 bg-white text-slate-600 hover:border-stone-300 hover:text-slate-900'
                      }`}
                    >
                      Last {option} days
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              This page is intended for local development only. Run the app locally, then open
              <code> /admin/analytics</code> to inspect live funnel data through your localhost backend.
            </p>
          </div>

          {dashboardQuery.isLoading ? (
            <div className="rounded-[24px] border border-stone-200/80 bg-white/90 px-4 py-6 text-sm text-slate-500">
              Loading funnel data…
            </div>
          ) : null}

          {dashboardQuery.isError ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-5 text-sm leading-6 text-amber-900">
              <p className="font-medium">
                {dashboardQuery.error?.message || 'Unable to load the analytics dashboard.'}
              </p>
              <p className="mt-1 text-amber-800/90">
                Check that you are running the local backend, Supabase is configured, and the analytics tables exist.
              </p>
            </div>
          ) : null}

          {summary ? (
            <>
              <CollapsibleSection title="Summary metrics" defaultOpen={true}>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Searches"
                    value={formatNumber(summary.searches)}
                    hint={`${formatNumber(summary.sessions)} sessions in the last ${dashboard.lookbackDays} days`}
                  />
                  <MetricCard
                    label="Finalize Rate"
                    value={formatPercent(summary.finalizeRate)}
                    hint={`${formatNumber(summary.finalizedSearches)} searches made it to focused picks`}
                  />
                  <MetricCard
                    label="Retailer Click Rate"
                    value={formatPercent(summary.retailerClickRate)}
                    hint={`${formatNumber(summary.searchesWithRetailerClick)} searches produced at least one clickout`}
                  />
                  <MetricCard
                    label="Refinement Usage"
                    value={formatPercent(summary.refinementRate)}
                    hint={`${formatNumber(summary.refinedSearches)} searches submitted follow-up notes`}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Preview Usage"
                    value={formatPercent(summary.previewRate)}
                    hint={`${formatNumber(summary.previewSearches)} searches used Show products now`}
                  />
                  <MetricCard
                    label="Card Opens"
                    value={formatNumber(summary.cardOpens)}
                    hint={`${formatNumber(summary.searchesWithCardOpen)} searches opened at least one result card`}
                  />
                  <MetricCard
                    label="Retry Advice"
                    value={formatNumber(summary.retryAdviceSearches)}
                    hint="Searches that asked for a better next query after rejecting the shortlist"
                  />
                  <MetricCard
                    label="Feedback Responses"
                    value={formatNumber(summary.feedbackResponses)}
                    hint="Tester feedback submissions captured during the same lookback window"
                  />
                </div>
              </CollapsibleSection>

              {diagnostics?.available ? (
                <CollapsibleSection
                  title="Search reliability"
                  description="Failed search attempts, provider failures, backend reachability, and tester-reported filters/VPNs by support code."
                  defaultOpen={true}
                >
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label="Failed Searches"
                      value={formatNumber(diagnostics.summary?.failures)}
                      hint={`${formatNumber(diagnostics.summary?.attempts)} diagnostic attempts in this window`}
                    />
                    <MetricCard
                      label="Rainforest Timeouts"
                      value={formatNumber(diagnostics.summary?.rainforestTimeouts)}
                      hint={`${formatNumber(diagnostics.summary?.rainforestErrors)} Rainforest error events`}
                    />
                    <MetricCard
                      label="Empty Results"
                      value={formatNumber(diagnostics.summary?.emptyResults)}
                      hint="Provider returned data, but no usable shortlist survived"
                    />
                    <MetricCard
                      label="Never Reached Backend"
                      value={formatNumber(diagnostics.summary?.neverReachedBackend)}
                      hint={`${formatNumber(diagnostics.summary?.backendReachableFailures)} failures still had backend health pass`}
                    />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-3">
                    <div className="space-y-3">
                      <SectionHeading title="Filter/VPN reports" description="Tester-selected network filtering context on failed attempts." />
                      <SimpleTable
                        columns={[
                          { key: 'label', label: 'Reported type' },
                          { key: 'count', label: 'Failures', render: (row) => formatNumber(row.count) },
                        ]}
                        rows={Object.entries(diagnostics.byFilterType || {}).map(([label, count]) => ({ label, count }))}
                        emptyMessage="No filter/VPN reports yet."
                      />
                    </div>
                    <div className="space-y-3">
                      <SectionHeading title="Platforms" description="Where failures are being reported." />
                      <SimpleTable
                        columns={[
                          { key: 'label', label: 'Platform' },
                          { key: 'count', label: 'Failures', render: (row) => formatNumber(row.count) },
                        ]}
                        rows={Object.entries(diagnostics.byPlatform || {}).map(([label, count]) => ({ label, count }))}
                        emptyMessage="No platform failures yet."
                      />
                    </div>
                    <div className="space-y-3">
                      <SectionHeading title="Marketplaces" description="Selected Amazon region/domain on failed attempts." />
                      <SimpleTable
                        columns={[
                          { key: 'label', label: 'Marketplace' },
                          { key: 'count', label: 'Failures', render: (row) => formatNumber(row.count) },
                        ]}
                        rows={Object.entries(diagnostics.byMarketplace || {}).map(([label, count]) => ({ label: label || 'unknown', count }))}
                        emptyMessage="No marketplace failures yet."
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <SectionHeading
                        title="Recent failed searches"
                        description="Search by support code, status, platform, query, marketplace, provider, filter/VPN type, or health result."
                      />
                      <label className="flex w-full flex-col gap-1 text-sm text-slate-600 sm:w-80">
                        <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Filter</span>
                        <input
                          value={diagnosticFilter}
                          onChange={(event) => setDiagnosticFilter(event.target.value)}
                          placeholder="support code, Techloq, timeout..."
                          className="h-10 rounded-full border border-stone-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                        />
                      </label>
                    </div>
                    <SimpleTable
                      columns={[
                        {
                          key: 'time',
                          label: 'Time',
                          render: (row) => row.time ? new Date(row.time).toLocaleString() : '—',
                        },
                        { key: 'searchId', label: 'Support code' },
                        { key: 'status', label: 'Status' },
                        { key: 'stage', label: 'Last stage' },
                        { key: 'query', label: 'Query' },
                        { key: 'platform', label: 'Platform' },
                        { key: 'amazonDomain', label: 'Region' },
                        { key: 'reportedFilterType', label: 'Filter/VPN' },
                        {
                          key: 'backendReachable',
                          label: 'Backend health',
                          render: (row) => row.backendReachable === true ? 'Passed' : row.backendReachable === false ? 'Failed' : '—',
                        },
                        {
                          key: 'durationMs',
                          label: 'Duration',
                          render: (row) => Number.isFinite(Number(row.durationMs)) ? `${Math.round(Number(row.durationMs))} ms` : '—',
                        },
                        { key: 'error', label: 'Safe error' },
                      ]}
                      rows={filteredDiagnosticFailures}
                      emptyMessage="No failed diagnostic attempts match this filter."
                    />
                  </div>
                </CollapsibleSection>
              ) : (
                <CollapsibleSection
                  title="Search reliability"
                  description="Create the search_attempts and search_events tables to enable support-code diagnostics."
                >
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-900">
                    Search diagnostics are not available yet.
                  </div>
                </CollapsibleSection>
              )}

              <CollapsibleSection title="Daily funnel" description="Quick trend line: are people reaching final results, and are those searches ending in outbound intent?">
                <SimpleTable
                  columns={[
                    { key: 'day', label: 'Day' },
                    { key: 'searches', label: 'Searches', render: (row) => formatNumber(row.searches) },
                    { key: 'finalized', label: 'Finalized', render: (row) => formatNumber(row.finalized) },
                    { key: 'finalizeRate', label: 'Finalize rate', render: (row) => formatPercent(row.finalizeRate) },
                    {
                      key: 'searchesWithRetailerClick',
                      label: 'Searches with clickout',
                      render: (row) => formatNumber(row.searchesWithRetailerClick),
                    },
                    {
                      key: 'retailerClickRate',
                      label: 'Clickout rate',
                      render: (row) => formatPercent(row.retailerClickRate),
                    },
                  ]}
                  rows={dashboard.dailyFunnel}
                  emptyMessage="No analytics rows were found in this time window yet."
                />
              </CollapsibleSection>

              <CollapsibleSection title="Top queries" description="Look for topics with lots of starts but weak finalize or clickout rates — usually your highest-leverage product fixes.">
                <SimpleTable
                  columns={[
                    { key: 'label', label: 'Query' },
                    { key: 'searches', label: 'Searches', render: (row) => formatNumber(row.searches) },
                    { key: 'finalizeRate', label: 'Finalize rate', render: (row) => formatPercent(row.finalizeRate) },
                    {
                      key: 'retailerClickRate',
                      label: 'Clickout rate',
                      render: (row) => formatPercent(row.retailerClickRate),
                    },
                    { key: 'refined', label: 'Refined', render: (row) => formatNumber(row.refined) },
                    { key: 'previewUsed', label: 'Preview used', render: (row) => formatNumber(row.previewUsed) },
                    { key: 'retailerClicks', label: 'Retailer clicks', render: (row) => formatNumber(row.retailerClicks) },
                  ]}
                  rows={dashboard.topQueries}
                  emptyMessage="No query-level data is available yet."
                />
              </CollapsibleSection>

              <CollapsibleSection title="Recent searches" description="The 25 most recent searches within this lookback window, newest first.">
                <SimpleTable
                  columns={[
                    {
                      key: 'createdAt',
                      label: 'Time',
                      render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleString() : '—',
                    },
                    { key: 'query', label: 'Query' },
                    { key: 'finalized', label: 'Finalized', render: (row) => (row.finalized ? 'Yes' : 'No') },
                    { key: 'refined', label: 'Refined', render: (row) => (row.refined ? 'Yes' : 'No') },
                    {
                      key: 'hadRetailerClick',
                      label: 'Retailer click',
                      render: (row) => (row.hadRetailerClick ? 'Yes' : '—'),
                    },
                  ]}
                  rows={dashboard.recentSearches || []}
                  emptyMessage="No searches recorded in this window yet."
                />
              </CollapsibleSection>

              <CollapsibleSection title="Position &amp; badge performance" description="Whether ranking order and labels are earning trust.">
                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="space-y-3">
                    <SectionHeading
                      title="Position performance"
                      description="Position 0 should usually be doing real work."
                    />
                    <SimpleTable
                      columns={[
                        { key: 'resultSet', label: 'Set' },
                        { key: 'position', label: 'Position', render: (row) => row.position + 1 },
                        { key: 'impressions', label: 'Impressions', render: (row) => formatNumber(row.impressions) },
                        { key: 'cardOpenRate', label: 'Card open rate', render: (row) => formatPercent(row.cardOpenRate) },
                        {
                          key: 'retailerClickRate',
                          label: 'Retailer click rate',
                          render: (row) => formatPercent(row.retailerClickRate),
                        },
                      ]}
                      rows={dashboard.positionPerformance}
                      emptyMessage="No impression and click data is available yet."
                    />
                  </div>

                  <div className="space-y-3">
                    <SectionHeading
                      title="Badge performance"
                      description="Whether labels like Best match are helping or just decorating."
                    />
                    <SimpleTable
                      columns={[
                        { key: 'badgeType', label: 'Badge' },
                        { key: 'impressions', label: 'Impressions', render: (row) => formatNumber(row.impressions) },
                        { key: 'cardOpenRate', label: 'Card open rate', render: (row) => formatPercent(row.cardOpenRate) },
                        {
                          key: 'retailerClickRate',
                          label: 'Retailer click rate',
                          render: (row) => formatPercent(row.retailerClickRate),
                        },
                      ]}
                      rows={dashboard.badgePerformance}
                      emptyMessage="No badge-level data is available yet."
                    />
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Tester feedback" description="Satisfaction signals from tester feedback submissions.">
                <div className="grid gap-6 xl:grid-cols-3">
                  <div className="space-y-3">
                    <SectionHeading
                      title="Found what they wanted"
                      description="A quick read on whether the shortlist felt successful."
                    />
                    <SimpleTable
                      columns={[
                        { key: 'label', label: 'Answer' },
                        { key: 'count', label: 'Responses', render: (row) => formatNumber(row.count) },
                      ]}
                      rows={Object.entries(dashboard.feedbackSummary.foundWhatYouWanted || {}).map(([label, count]) => ({
                        count,
                        label,
                      }))}
                      emptyMessage="No tester feedback has been recorded yet."
                    />
                  </div>

                  <div className="space-y-3">
                    <SectionHeading
                      title="Enjoyed experience"
                      description="Separates result quality problems from UX friction problems."
                    />
                    <SimpleTable
                      columns={[
                        { key: 'label', label: 'Answer' },
                        { key: 'count', label: 'Responses', render: (row) => formatNumber(row.count) },
                      ]}
                      rows={Object.entries(dashboard.feedbackSummary.enjoyedExperience || {}).map(([label, count]) => ({
                        count,
                        label,
                      }))}
                      emptyMessage="No enjoyment feedback has been recorded yet."
                    />
                  </div>

                  <div className="space-y-3">
                    <SectionHeading
                      title="Was simple"
                      description="Your best signal for whether the guided flow feels too heavy."
                    />
                    <SimpleTable
                      columns={[
                        { key: 'label', label: 'Answer' },
                        { key: 'count', label: 'Responses', render: (row) => formatNumber(row.count) },
                      ]}
                      rows={Object.entries(dashboard.feedbackSummary.wasSimple || {}).map(([label, count]) => ({
                        count,
                        label,
                      }))}
                      emptyMessage="No simplicity feedback has been recorded yet."
                    />
                  </div>
                </div>
              </CollapsibleSection>

              {dashboard.dataQuality?.truncated ? (
                <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-5 text-sm leading-6 text-amber-900">
                  This dashboard hit the current server-side pagination cap while reading raw analytics rows. It is still useful for early-stage review, but if your traffic grows we should switch the backend to SQL-level aggregation instead of row-by-row summarizing.
                </div>
              ) : null}
            </>
          ) : null}

          <CollapsibleSection
            title="Candidate pool inspector"
            description="Browse what was sent to Haiku for picking. Shows candidates from the search_cache table, most recent first."
          >
            <CandidatePoolInspector />
          </CollapsibleSection>

          <CollapsibleSection
            title="Recent AI picks"
            description="The 6 picks returned by the last finalize calls this session. Resets on server restart. Polls every 10 seconds."
          >
            <FinalizeHistoryInspector />
          </CollapsibleSection>
        </div>
          )}
        </div>
      </PageShell>
    </>
  )
}

export default AnalyticsPage
