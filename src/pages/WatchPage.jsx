import { Bell, ExternalLink, Pause, Play, Trash2, UserCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import Seo from '@/components/Seo.jsx'
import { useAuth } from '@/contexts/useAuth.js'
import { useWatches } from '@/components/watch/useWatches.js'

function formatMoney(value, amazonDomain = 'amazon.com') {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return ''

  return new Intl.NumberFormat(amazonDomain === 'amazon.ca' ? 'en-CA' : 'en-US', {
    currency: amazonDomain === 'amazon.ca' ? 'CAD' : 'USD',
    style: 'currency',
  }).format(numericValue)
}

function formatDate(value) {
  if (!value) return ''

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function WatchRow({ onRemove, onUpdate, watch }) {
  const lastSeen = watch.lastSeenPrice || watch.baselinePrice
  const checkedText = watch.lastCheckedAt
    ? `Checked ${formatDate(watch.lastCheckedAt)}`
    : 'Waiting for first price check'

  function handleThresholdBlur(event) {
    const nextValue = Number(event.target.value)
    if (Number.isFinite(nextValue) && nextValue > 0 && nextValue <= 100 && nextValue !== watch.thresholdPct) {
      void onUpdate(watch.id, { thresholdPct: nextValue })
    }
  }

  function handleTargetBlur(event) {
    const value = event.target.value.trim()
    const nextValue = value ? Number(value) : null
    if (nextValue === null || (Number.isFinite(nextValue) && nextValue > 0)) {
      void onUpdate(watch.id, { targetPrice: nextValue })
    }
  }

  return (
    <article className="rounded-[28px] border border-[#e4d7c6] bg-white/94 p-4 shadow-[0_24px_64px_-52px_rgba(15,23,42,0.26)] sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[6.5rem_1fr] sm:items-start">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-[#eee3d6] bg-[#fbf8f4]">
          {watch.imageUrl ? (
            <img src={watch.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain mix-blend-multiply" />
          ) : (
            <Bell className="h-8 w-8 text-slate-300" />
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="line-clamp-2 text-base font-semibold leading-6 text-slate-950">
                {watch.productTitle || watch.asin}
              </p>
              <p className="text-xs font-medium text-slate-400">
                {[watch.asin, watch.amazonDomain, checkedText].filter(Boolean).join(' | ')}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => onUpdate(watch.id, { paused: !watch.paused })}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#d9e6e8] bg-white px-3 text-sm font-medium text-primary transition hover:border-primary/30 hover:bg-[#eef7f6]"
              >
                {watch.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {watch.paused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove watch for ${watch.productTitle || watch.asin}`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#eadfce] bg-white text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-[#fbf8f4] px-3 py-2">
              <p className="text-xs font-medium text-slate-400">Added at</p>
              <p className="mt-0.5 font-semibold text-slate-800">
                {formatMoney(watch.baselinePrice, watch.amazonDomain)}
              </p>
            </div>
            <div className="rounded-2xl bg-[#eef7f6] px-3 py-2">
              <p className="text-xs font-medium text-slate-400">Last seen</p>
              <p className="mt-0.5 font-semibold text-primary">
                {formatMoney(lastSeen, watch.amazonDomain)}
              </p>
            </div>
            <label className="rounded-2xl bg-[#fbf8f4] px-3 py-2">
              <span className="text-xs font-medium text-slate-400">Drop alert</span>
              <span className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.5"
                  defaultValue={watch.thresholdPct}
                  onBlur={handleThresholdBlur}
                  className="h-9 w-full rounded-xl border border-[#e4d7c6] bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
                <span className="text-sm font-semibold text-slate-500">%</span>
              </span>
            </label>
            <label className="rounded-2xl bg-[#fbf8f4] px-3 py-2">
              <span className="text-xs font-medium text-slate-400">Target price</span>
              <input
                type="number"
                min="0"
                step="0.01"
                defaultValue={watch.targetPrice || ''}
                placeholder="Optional"
                onBlur={handleTargetBlur}
                className="mt-1 h-9 w-full rounded-xl border border-[#e4d7c6] bg-white px-2 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-300 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#f0e6da] pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className={watch.paused ? 'font-medium text-amber-700' : 'text-slate-500'}>
              {watch.paused ? 'Paused. This still counts toward your 5 watch limit.' : 'Active watch'}
            </p>
            {watch.productUrl ? (
              <a
                href={watch.productUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-primary transition hover:text-primary/80"
              >
                View on Amazon
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function WatchPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { error, loading, remove, update, watches } = useWatches({ enabled: Boolean(user) })

  function handleOpenAuth() {
    window.dispatchEvent(new CustomEvent('focamai:open-auth'))
  }

  return (
    <>
      <Seo
        title="Price watches | Focamai"
        description="Manage products Focamai is watching for price drops."
        path="/watches"
      />
      <main className="px-3 pt-4 pb-8 sm:px-6 sm:pt-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="space-y-3 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Price Watch
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Watched products
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-500 sm:text-[15px]">
                  Track up to 5 finalized Amazon picks. Alerts are not live yet; for now this is your watchlist setup.
                </p>
              </div>
              <p className="text-sm font-medium text-slate-400">
                {watches.length}/5 watches
              </p>
            </div>
          </section>

          {!user ? (
            <div className="rounded-[28px] border border-[#e4d7c6] bg-white/94 p-8 text-center shadow-[0_24px_64px_-52px_rgba(15,23,42,0.26)]">
              <UserCircle className="mx-auto h-9 w-9 text-primary" />
              <p className="mt-3 text-lg font-semibold text-slate-950">Sign in to watch prices.</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Watches are account-based so they can later power email alerts.
              </p>
              <button
                type="button"
                onClick={handleOpenAuth}
                className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary/90"
              >
                Sign in
              </button>
            </div>
          ) : loading ? (
            <div className="rounded-[28px] border border-[#e4d7c6] bg-white/90 p-6 text-center text-sm text-slate-500">
              Loading price watches...
            </div>
          ) : error ? (
            <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-center text-sm leading-6 text-red-700">
              {error}
            </div>
          ) : watches.length ? (
            <div className="space-y-4">
              {watches.map((watch) => (
                <WatchRow
                  key={watch.id}
                  watch={watch}
                  onRemove={() => remove(watch.id)}
                  onUpdate={update}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-[#e4d7c6] bg-white/94 p-8 text-center shadow-[0_24px_64px_-52px_rgba(15,23,42,0.26)]">
              <p className="text-lg font-semibold text-slate-950">No watches yet.</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Run a search, open a finalized pick, and choose Watch price.
              </p>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary/90"
              >
                Start a search
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

export default WatchPage
