import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import PageShell from '@/components/PageShell.jsx'
import Seo from '@/components/Seo.jsx'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''
const LOOKBACK_OPTIONS = [7, 14, 30]

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0)
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function createDashboardError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

async function fetchAnalyticsDashboard({ days }) {
  const response = await fetch(`${BACKEND_URL}/api/analytics/dashboard?days=${days}`)

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

function AnalyticsPage() {
  const [days, setDays] = useState(14)
  const [hasHydrated, setHasHydrated] = useState(false)

  useEffect(() => {
    setHasHydrated(true)
  }, [])

  const dashboardQuery = useQuery({
    queryKey: ['analytics-dashboard', days],
    queryFn: () => fetchAnalyticsDashboard({ days }),
    enabled: hasHydrated,
    retry: false,
  })

  const dashboard = dashboardQuery.data
  const summary = dashboard?.summary

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
        title="Search funnel signals, not just pageviews."
        description="Use this page to see where searches turn into final picks, where people bail out, and which query patterns or result positions deserve attention."
      >
        <div className="space-y-8">
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

              <div className="space-y-3">
                <SectionHeading
                  title="Daily funnel"
                  description="This is your quick trend line: are people reaching final results, and are those searches ending in outbound intent?"
                />
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
              </div>

              <div className="space-y-3">
                <SectionHeading
                  title="Top queries"
                  description="Look for search topics with lots of starts but weak finalize or clickout rates. Those are usually your highest-leverage product fixes."
                />
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
              </div>

              <div className="space-y-3">
                <SectionHeading
                  title="Recent searches"
                  description="The 25 most recent searches within this lookback window, newest first."
                />
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
              </div>

              {dashboard.oxylabsFailures ? (
                <div className="space-y-3">
                  <SectionHeading
                    title="Oxylabs product detail failures"
                    description={`${formatNumber(dashboard.oxylabsFailures.total)} failed ASIN fetches in this window — ${formatNumber(dashboard.oxylabsFailures.byType.timeout)} timeouts, ${formatNumber(dashboard.oxylabsFailures.byType.httpError)} HTTP errors, ${formatNumber(dashboard.oxylabsFailures.byType.unknown)} unknown.`}
                  />
                  <SimpleTable
                    columns={[
                      { key: 'asin', label: 'ASIN' },
                      { key: 'timeout', label: 'Timeouts', render: (row) => formatNumber(row.timeout) },
                      { key: 'httpError', label: 'HTTP errors', render: (row) => formatNumber(row.httpError) },
                      { key: 'unknown', label: 'Other', render: (row) => formatNumber(row.unknown) },
                      { key: 'total', label: 'Total', render: (row) => formatNumber(row.total) },
                    ]}
                    rows={dashboard.oxylabsFailures.topAsins}
                    emptyMessage="No product detail failures recorded in this window."
                  />
                </div>
              ) : null}

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="space-y-3">
                  <SectionHeading
                    title="Position performance"
                    description="This tells you whether ranking order is earning trust. Position 0 should usually be doing real work."
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
                    description="Use this to see whether labels like Best match are helping or just decorating the card."
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
                    description="Useful for separating result quality problems from UX friction problems."
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
                    description="This is your best lightweight signal for whether the guided flow feels too heavy."
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

              {dashboard.dataQuality?.truncated ? (
                <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-5 text-sm leading-6 text-amber-900">
                  This dashboard hit the current server-side pagination cap while reading raw analytics rows. It is still useful for early-stage review, but if your traffic grows we should switch the backend to SQL-level aggregation instead of row-by-row summarizing.
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </PageShell>
    </>
  )
}

export default AnalyticsPage
