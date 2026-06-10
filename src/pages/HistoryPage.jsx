import { useState } from 'react'
import { ChevronDown, ExternalLink, History, RotateCcw, Trash2, UserCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import Seo from '@/components/Seo.jsx'
import { useSearchHistory } from '@/components/history/useSearchHistory.js'
import { useAuth } from '@/contexts/useAuth.js'

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

function getProductTitle(item, index) {
  return item?.title || item?.name || `Pick ${index + 1}`
}

function getProductMeta(item) {
  const parts = [
    item?.price,
    item?.rating ? `${item.rating} stars` : '',
    item?.reviews ? `${item.reviews} reviews` : item?.reviewCount ? `${item.reviewCount} reviews` : '',
  ].filter(Boolean)

  return parts.join(' | ')
}

function HistoryEntry({ entry, isOpen, onRemove, onRerun, onToggle }) {
  const results = Array.isArray(entry.results) ? entry.results : []
  const resultCountText = `${results.length} ${results.length === 1 ? 'pick' : 'picks'}`
  const savedAt = formatDate(entry.updatedAt || entry.createdAt)

  return (
    <article className="rounded-[28px] border border-[#e4d7c6] bg-white/94 p-4 shadow-[0_24px_64px_-52px_rgba(15,23,42,0.26)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="group flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef7f6] text-primary">
            <History className="h-4 w-4" />
          </span>
          <span className="min-w-0 space-y-1">
            <span className="block break-words text-base font-semibold text-slate-950 sm:text-lg">
              {entry.query}
            </span>
            {entry.followUp ? (
              <span className="line-clamp-2 block break-words text-sm leading-6 text-slate-600">
                {entry.followUp}
              </span>
            ) : (
              <span className="block text-sm text-slate-400">No extra notes added.</span>
            )}
            <span className="block text-xs font-medium text-slate-400">
              {[savedAt, resultCountText].filter(Boolean).join(' | ')}
            </span>
          </span>
          <ChevronDown
            className={`mt-2 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:text-slate-600 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
        <div className="flex shrink-0 gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onRerun}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#d9e6e8] bg-white px-3 text-sm font-medium text-primary transition hover:border-primary/30 hover:bg-[#eef7f6]"
          >
            <RotateCcw className="h-4 w-4" />
            Re-run
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Delete history entry for ${entry.query}`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#eadfce] bg-white text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isOpen ? (
        results.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((item, index) => (
              <a
                key={`${item?.id || item?.asin || item?.link || index}`}
                href={item?.link || '#'}
                target={item?.link ? '_blank' : undefined}
                rel={item?.link ? 'noreferrer' : undefined}
                className="group min-w-0 rounded-[22px] border border-[#eee3d6] bg-[#fbf8f4] p-3 transition hover:border-[#d6c7b4] hover:bg-white"
              >
                {item?.image ? (
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    className="mb-3 aspect-square w-full rounded-2xl bg-white object-contain"
                  />
                ) : null}
                <p className="line-clamp-3 text-sm font-semibold leading-5 text-slate-900">
                  {getProductTitle(item, index)}
                </p>
                {getProductMeta(item) ? (
                  <p className="mt-1 text-xs text-slate-500">{getProductMeta(item)}</p>
                ) : null}
                {item?.link ? (
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    View on Amazon
                    <ExternalLink className="h-3 w-3" />
                  </span>
                ) : null}
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-[22px] border border-[#eee3d6] bg-[#fbf8f4] px-4 py-3 text-sm text-slate-500">
            This saved search has no stored picks.
          </div>
        )
      ) : null}
    </article>
  )
}

function HistoryPage() {
  const navigate = useNavigate()
  const { clear, entries, error, loading, remove } = useSearchHistory()
  const { user } = useAuth()
  const [openEntryId, setOpenEntryId] = useState('')
  const storageLabel = user ? 'Saved to your account' : 'Saved on this device'

  function handleRerun(entry) {
    navigate('/', {
      state: {
        historySearch: {
          query: entry.query,
          followUp: entry.followUp,
        },
      },
    })
  }

  function handleOpenAuth() {
    window.dispatchEvent(new CustomEvent('focamai:open-auth'))
  }

  return (
    <>
      <Seo
        title="Search history | Focamai"
        description="Review recent Focamai searches."
        path="/history"
      />
      <main className="px-3 pt-4 pb-8 sm:px-6 sm:pt-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="space-y-3 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {storageLabel}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Search history
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-500 sm:text-[15px]">
                  Completed searches are saved after Focamai narrows them to six picks.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                {!user ? (
                  <button
                    type="button"
                    onClick={handleOpenAuth}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#d9e6e8] bg-white/90 px-4 text-sm font-medium text-primary transition hover:border-primary/30 hover:bg-[#eef7f6]"
                  >
                    <UserCircle className="h-4 w-4" />
                    Sign in to sync
                  </button>
                ) : null}
                {entries.length ? (
                  <button
                    type="button"
                    onClick={clear}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-[#eadfce] bg-white/90 px-4 text-sm font-medium text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                  >
                    Clear history
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          {!user ? (
            <section className="rounded-[24px] border border-[#d9e6e8] bg-[#eef7f6]/70 px-4 py-3 text-sm leading-6 text-slate-600 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <p>
                Device history is private to this browser. Sign in when you want searches to carry across devices.
              </p>
              <button
                type="button"
                onClick={handleOpenAuth}
                className="mt-3 inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-white px-3 text-sm font-semibold text-primary shadow-[0_12px_28px_-22px_rgba(15,23,42,0.35)] transition hover:bg-[#fbf8f4] sm:mt-0"
              >
                Sync searches
              </button>
            </section>
          ) : null}

          {loading ? (
            <div className="rounded-[28px] border border-[#e4d7c6] bg-white/90 p-6 text-center text-sm text-slate-500">
              Loading saved searches...
            </div>
          ) : error ? (
            <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-center text-sm leading-6 text-red-700">
              {error}
            </div>
          ) : entries.length ? (
            <div className="space-y-4">
              {entries.map((entry) => (
                <HistoryEntry
                  key={entry.id}
                  entry={entry}
                  isOpen={openEntryId === entry.id}
                  onRemove={() => remove(entry.id)}
                  onRerun={() => handleRerun(entry)}
                  onToggle={() =>
                    setOpenEntryId((current) => (current === entry.id ? '' : entry.id))
                  }
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-[#e4d7c6] bg-white/94 p-8 text-center shadow-[0_24px_64px_-52px_rgba(15,23,42,0.26)]">
              <p className="text-lg font-semibold text-slate-950">No saved searches yet.</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Run a search and choose focused picks. Once the six results are ready, they will show up here.
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

export default HistoryPage
