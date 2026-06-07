import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { CheckCircle2, LoaderCircle, PencilLine, Search, Sparkles } from 'lucide-react'
import { MAX_PRODUCT_QUERY_LENGTH, MAX_DETAILS_LENGTH } from '../../../shared/search-input.js'

import wordmark from '@/assets/wordmark.PNG'
// import { FeedbackFab } from '@/components/home/FeedbackFab.jsx'
import { ResultSkeleton } from '@/components/home/ResultSkeleton.jsx'
import { FinalizeLoadingState } from '@/components/home/FinalizeLoadingState.jsx'
import {
  RESULT_CARD_SLOTS,
  useGuidedSearch,
} from '@/components/home/useGuidedSearch.js'
import { Button } from '@/components/ui/button.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'
import { useSearchProgress } from '@/contexts/useSearchProgress.js'

const HERO_SUBLINE = "Tell us what you need. We'll find your six."
function loadResultsSection() {
  return import('@/components/home/ResultsSection.jsx')
}

function loadProductDetailModal() {
  return import('@/components/home/ProductDetailModal.jsx')
}

const ResultsSection = lazy(() => loadResultsSection())
const ProductDetailModal = lazy(() => loadProductDetailModal())
const DEFAULT_REFINEMENT_CHIPS = [
  { label: 'Good value' },
  { label: 'Easy to use' },
  { label: 'Fits my space' },
]
const MAX_REFINEMENT_CHIPS = 3

function applyPlainBackgroundMode() {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.bgMode = 'plain'
}

function CharCounter({ current, max }) {
  if (current === 0) return null
  const remaining = max - current
  const pct = current / max
  return (
    <span className={`text-xs transition-colors ${
      pct >= 0.95 ? 'text-red-500' : pct >= 0.8 ? 'text-amber-500' : 'text-slate-400'
    }`}>
      {remaining} characters left
    </span>
  )
}
function shouldShowCharCounter(current, max) {
  return current > 0 && max - current <= 20
}

function shouldShowTimingPanel() {
  if (import.meta.env.DEV) {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.get('timing') === '1'
}

function handleRefinementTextareaKeyDown(event, { canSubmit, onSubmit }) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) {
    return
  }

  event.preventDefault()

  if (canSubmit) {
    onSubmit()
  }
}

function handleProductQueryTextareaKeyDown(event, { canSubmit, onSubmit }) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) {
    return
  }

  event.preventDefault()

  if (canSubmit) {
    onSubmit()
  }
}

function smoothScrollIntoView(element) {
  if (!element || typeof element.scrollIntoView !== 'function') {
    return
  }

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

function scrollElementNearTop(element, offset = 24) {
  if (!element || typeof window === 'undefined') {
    return
  }

  const nextTop = Math.max(0, window.scrollY + element.getBoundingClientRect().top - offset)

  window.scrollTo({
    top: nextTop,
    behavior: 'smooth',
  })
}

function handleNewSearchClick(event, resetToNewSearch) {
  event.preventDefault()
  resetToNewSearch()
}

function formatTimingValue(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'n/a'
}

function buildRefinementCopy({ isGeneratingPrompt, prompt, submittedQuery }) {
  const suggestedQuestion =
    prompt?.prompt || `What should we optimize for with this ${submittedQuery}?`

  return {
      helper:
        prompt?.helperText ||
        'Or write whatever is important to you. Feel free to write in natural language.',
    placeholder:
      prompt?.followUpPlaceholder ||
      'Example: I want something lightweight for daily travel, under $200, and easy to clean.',
    titleEyebrow: isGeneratingPrompt ? 'You can add more detail right away' : 'Focamai asks:',
    titleQuestion: isGeneratingPrompt ? '' : suggestedQuestion,
  }
}

function RefinementCopy({ isGeneratingPrompt, prompt, submittedQuery }) {
  const displayedCopy = buildRefinementCopy({ isGeneratingPrompt, prompt, submittedQuery })

  return (
    <div className="space-y-4 text-center sm:text-left">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl"
          style={{ fontFamily: '"Manrope", sans-serif' }}
        >
          What should Focamai keep in mind?
        </h2>
        <p className="mx-auto max-w-2xl text-sm font-medium leading-6 text-slate-500 sm:mx-0 sm:text-[15px]">
          Add any preferences, must-haves, or deal breakers.
        </p>
      </div>
      <div className="rounded-2xl border border-[#e6d8c5] bg-white/90 p-4 shadow-[0_14px_36px_-30px_rgba(120,87,63,0.28)]">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[#80573f] sm:justify-start">
          <Sparkles className={`h-4 w-4 ${isGeneratingPrompt ? 'animate-pulse' : ''}`} />
          <span>{displayedCopy.titleEyebrow}</span>
        </div>
        {displayedCopy.titleQuestion ? (
          <p
            className="mt-2 text-base font-medium leading-7 text-[#8f4e2f] transition-opacity duration-500 sm:text-lg"
            style={{ fontFamily: '"Manrope", sans-serif' }}
          >
            {displayedCopy.titleQuestion}
          </p>
        ) : null}
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600 transition-opacity duration-300">
          {displayedCopy.helper}
          {isGeneratingPrompt ? (
            <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-slate-400 align-middle" />
          ) : null}
        </p>
      </div>
    </div>
  )
}

function clampFollowUpNotes(value) {
  return String(value ?? '').slice(0, MAX_DETAILS_LENGTH)
}

function addChipToNotes(currentNotes, chipLabel) {
  const trimmedNotes = String(currentNotes ?? '').trim()

  if (!trimmedNotes) {
    return clampFollowUpNotes(chipLabel)
  }

  if (trimmedNotes.toLowerCase().includes(String(chipLabel).toLowerCase())) {
    return currentNotes
  }

  return clampFollowUpNotes(`${trimmedNotes}, ${chipLabel}`)
}

function normalizeRefinementChips(refinementPrompt) {
  const suggestedRefinements =
    refinementPrompt?.refinementSuggestions ||
    refinementPrompt?.refinement_suggestions ||
    refinementPrompt?.suggestedRefinements ||
    []

  if (!Array.isArray(suggestedRefinements)) {
    return []
  }

  return suggestedRefinements
    .map((chip) => {
      if (typeof chip === 'string') {
        return { label: chip.trim() }
      }

      if (typeof chip?.label === 'string') {
        const label = chip.label.trim()
        const prompt = typeof chip.prompt === 'string' ? chip.prompt.trim() : ''
        return prompt ? { label, prompt } : { label }
      }

      return null
    })
    .filter((chip) => chip?.label)
    .slice(0, MAX_REFINEMENT_CHIPS)
}

function RefinementChips({
  disabled,
  followUpNotes,
  onFollowUpNotesChange,
  refinementPrompt,
}) {
  const normalizedChips = normalizeRefinementChips(refinementPrompt)
  const visibleChips = normalizedChips.length ? normalizedChips : DEFAULT_REFINEMENT_CHIPS

  function handleChipClick(chip) {
    if (disabled) {
      return
    }

    if (chip.prompt) {
      onFollowUpNotesChange(clampFollowUpNotes(chip.prompt))
      return
    }

    onFollowUpNotesChange(addChipToNotes(followUpNotes, chip.label))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-500">A few starting points</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {visibleChips.map((chip) => {
          const selected = String(followUpNotes ?? '')
            .toLowerCase()
            .includes(chip.label.toLowerCase())

          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              className={`min-h-12 rounded-full border px-4 py-2 text-center text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                selected
                  ? 'border-primary/45 bg-[#eef7f6] text-primary'
                  : 'border-[#e5dacb] bg-[#f8f4ee] text-slate-800 hover:border-primary/30 hover:bg-white'
              }`}
              onClick={() => handleChipClick(chip)}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
function TimingPanel({ requestTiming }) {
  const entries = [
    ['Discover', requestTiming?.discover],
    ['Refine', requestTiming?.refine],
    ['Finalize', requestTiming?.finalize],
  ].filter(([, timing]) => timing)

  if (entries.length === 0) {
    return null
  }

  return (
    <section className="w-full max-w-5xl rounded-2xl border border-dashed border-[#e6dacb] bg-white/80 p-4 sm:p-5">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Dev timing
        </p>
        <p className="text-sm leading-6 text-slate-600">
          Compare browser round-trip time with backend stage timings from the `Server-Timing` header.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {entries.map(([label, timing]) => (
          <div
            key={label}
            className="rounded-2xl border border-[#ece1d3] bg-white p-4 text-sm text-slate-600"
          >
            <p className="font-medium text-slate-900">{label}</p>
            <p className="mt-2">Client total: {formatTimingValue(timing?.client?.totalMs)}</p>
            <p>Client round trip: {formatTimingValue(timing?.client?.roundTripMs)}</p>
            <p>Response read: {formatTimingValue(timing?.client?.responseReadMs)}</p>
            <p className="mt-2">Backend total: {formatTimingValue(timing?.server?.total)}</p>
            {Object.entries(timing?.server || {})
              .filter(([name]) => name !== 'total')
              .map(([name, value]) => (
                <p key={name}>
                  {name}: {formatTimingValue(value)}
                </p>
              ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function QuerySuggestionPrompt({
  isApplying,
  onKeepResults,
  onTrySuggestedSearch,
  suggestion,
}) {
  if (!suggestion?.suggestedQuery) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-[#d9e6e8] bg-white/92 p-4 shadow-[0_14px_36px_-30px_rgba(15,97,117,0.22)] sm:flex sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="min-w-0 space-y-1 text-left">
        <p className="text-sm font-medium text-slate-600">
          We searched for &quot;{suggestion.originalQuery || suggestion.query}&quot;.
        </p>
        <p className="break-words text-base font-semibold text-[#155f70]">
          Try &quot;{suggestion.suggestedQuery}&quot; instead?
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:items-center">
        <Button
          type="button"
          disabled={isApplying}
          className="h-11 w-full rounded-2xl bg-primary px-4 text-sm text-primary-foreground shadow-[0_14px_32px_-24px_rgba(15,97,117,0.32)] hover:bg-primary/90 sm:w-auto"
          onClick={onTrySuggestedSearch}
        >
          {isApplying ? 'Starting...' : 'Try suggested search'}
        </Button>
        <button
          type="button"
          className="h-11 w-full rounded-2xl px-4 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 sm:w-auto"
          onClick={onKeepResults}
        >
          Keep these results
        </button>
      </div>
    </div>
  )
}

function FlowStageSummary({
  actionLabel,
  children,
  label,
  onAction,
  status = 'Done',
}) {
  return (
    <div className="w-full rounded-2xl border border-[#e6dacb] bg-white/92 px-4 py-3 shadow-[0_14px_36px_-30px_rgba(120,87,63,0.22)] backdrop-blur sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef7f6] text-primary">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                {label}
              </p>
              <span className="rounded-full bg-[#f6efe7] px-2 py-0.5 text-xs font-medium text-[#80573f]">
                {status}
              </span>
            </div>
            <div className="min-w-0 text-sm font-medium leading-6 text-slate-700 sm:text-[15px]">
              {children}
            </div>
          </div>
        </div>
        {onAction ? (
          <button
            type="button"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-stone-100/80 hover:text-slate-800"
            onClick={onAction}
          >
            <PencilLine className="h-4 w-4" />
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function FlowProgress({ hasDiscoveryResults, hasFinalResults, hasStartedSearch }) {
  const steps = [
    { key: 'search', label: 'Search', active: !hasStartedSearch, done: hasStartedSearch },
    {
      key: 'refine',
      label: 'Refine',
      active: hasStartedSearch && !hasFinalResults,
      done: hasFinalResults,
    },
    { key: 'picks', label: 'Picks', active: hasFinalResults, done: hasFinalResults },
  ]

  return (
    <div
      aria-label="Search progress"
      className="mx-auto flex w-full max-w-md items-center justify-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] sm:text-sm"
      style={{ fontFamily: '"Instrument Sans", sans-serif' }}
    >
      {steps.map((step, index) => (
        <div key={step.key} className="flex min-w-0 items-center gap-2">
          <span
            className={`whitespace-nowrap transition-colors ${
              step.active
                ? 'text-primary'
                : step.done || (step.key === 'refine' && hasDiscoveryResults)
                  ? 'text-[#80573f]'
                  : 'text-slate-400'
            }`}
          >
            {step.label}
          </span>
          {index < steps.length - 1 ? <span className="text-slate-300">/</span> : null}
        </div>
      ))}
    </div>
  )
}


function ResultsSectionFallback({ showFinalizeStatus = false }) {
  return (
    <div className="space-y-4">
      {showFinalizeStatus ? <FinalizeLoadingState /> : null}
      <div className="mobile-landscape-results-grid grid grid-cols-1 gap-4">
        {RESULT_CARD_SLOTS.map((index) => (
          <ResultSkeleton key={index} className="opacity-95" />
        ))}
      </div>
    </div>
  )
}

function ProductDetailModalFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(51,39,30,0.22)] backdrop-blur-[2px]">
      <div className="rounded-full border border-[#e7dac8] bg-white/96 px-4 py-3 text-sm text-slate-600 shadow-[0_12px_32px_-26px_rgba(120,87,63,0.28)]">
        Loading details...
      </div>
    </div>
  )
}

function OpenLayout(props) {
  const refinementRef = useRef(null)
  const searchInputRef = useRef(null)
  const resultsViewportRef = useRef(null)
  const isDesktop = typeof window !== 'undefined' && !('ontouchstart' in window)
  const lastRefinementScrollQueryRef = useRef('')
  const lastResultsScrollQueryRef = useRef('')
  const lastPreviewScrollQueryRef = useRef('')
  const lastFinalizeScrollQueryRef = useRef('')
  const [showHeroCopy, setShowHeroCopy] = useState(false)
  const [hasOpenedModal, setHasOpenedModal] = useState(false)
  const {
    guided,
    showTimingPanel,
  } = props
  const { actions, query, querySuggestion, results, retry, status } = guided
  const displayedResults = results.displayed
  const errorMessage = status.errorMessage
  const hasFinalResults = results.hasFinalResults
  const hasStartedSearch = status.hasStartedSearch
  const isLoading = status.isLoading
  const prompt = query.refinementPrompt
  const showPreviewResults = results.showPreview
  const submittedQuery = query.submittedQuery
  const shouldShowRefinementPanel = hasStartedSearch && !hasFinalResults

  useEffect(() => {
    const revealTimer = window.setTimeout(() => {
      setShowHeroCopy(true)
    }, 360)

    return () => {
      window.clearTimeout(revealTimer)
    }
  }, [])

  useEffect(() => {
    if (!hasFinalResults) {
      const resetTimer = window.setTimeout(() => {
        setHasOpenedModal(false)
      }, 0)

      return () => {
        window.clearTimeout(resetTimer)
      }
    }

    return undefined
  }, [hasFinalResults])

  function handleSelectProduct(product, analyticsMeta) {
    setHasOpenedModal(true)
    actions.selectProduct(product, analyticsMeta)
  }

  useEffect(() => {
    if (
      !hasStartedSearch ||
      !submittedQuery ||
      lastRefinementScrollQueryRef.current === submittedQuery ||
      !refinementRef.current
    ) {
      return
    }

    const scrollTimer = window.setTimeout(() => {
      const refinementElement = refinementRef.current

      if (!refinementElement) {
        return
      }

      smoothScrollIntoView(refinementElement)
      lastRefinementScrollQueryRef.current = submittedQuery
    }, 180)

    return () => {
      window.clearTimeout(scrollTimer)
    }
  }, [hasStartedSearch, submittedQuery])

  useEffect(() => {
    if (
      !showPreviewResults ||
      !submittedQuery ||
      lastPreviewScrollQueryRef.current === submittedQuery ||
      !resultsViewportRef.current
    ) {
      return
    }

    const scrollTimer = window.setTimeout(() => {
      const resultsElement = resultsViewportRef.current

      if (!resultsElement) {
        return
      }

      smoothScrollIntoView(resultsElement)
      lastPreviewScrollQueryRef.current = submittedQuery
    }, 140)

    return () => {
      window.clearTimeout(scrollTimer)
    }
  }, [showPreviewResults, submittedQuery])

  useEffect(() => {
    if (
      !status.isFinalizing ||
      !submittedQuery ||
      lastFinalizeScrollQueryRef.current === submittedQuery ||
      !resultsViewportRef.current
    ) {
      return
    }

    const resultsElement = resultsViewportRef.current

    smoothScrollIntoView(resultsElement)
    lastFinalizeScrollQueryRef.current = submittedQuery
  }, [status.isFinalizing, submittedQuery])

  useEffect(() => {
    if (
      !hasFinalResults ||
      !submittedQuery ||
      lastResultsScrollQueryRef.current === submittedQuery ||
      !resultsViewportRef.current
    ) {
      return
    }

    const scrollTimer = window.setTimeout(() => {
      const resultsElement = resultsViewportRef.current

      if (!resultsElement) {
        return
      }

      smoothScrollIntoView(resultsElement)
      lastResultsScrollQueryRef.current = submittedQuery
    }, 180)

    return () => {
      window.clearTimeout(scrollTimer)
    }
  }, [hasFinalResults, submittedQuery])

  const hasDiscoveryResults = Boolean(results.candidatePool)
  const showLoadingResults = isLoading && displayedResults.length === 0
  const shouldLoadResultsSection =
    hasStartedSearch || displayedResults.length > 0 || Boolean(errorMessage)
  const canSubmitTopQuery = !isLoading && !hasStartedSearch

  function handleSearchSubmit(event) {
    actions.beginGuidedSearch(event)
  }

  function handleRetrySearch(query) {
    const didStart = retry.trySuggestion(query)

    if (didStart) {
      window.setTimeout(() => {
        scrollElementNearTop(resultsViewportRef.current, 20)
      }, 0)
    }
  }

  const { setProgress } = useSearchProgress()
  useEffect(() => {
    setProgress({ hasStartedSearch, hasDiscoveryResults, hasFinalResults })
  }, [hasStartedSearch, hasDiscoveryResults, hasFinalResults, setProgress])
  const refinementCopy = buildRefinementCopy({
    isGeneratingPrompt: status.isGeneratingPrompt,
    prompt,
    submittedQuery,
  })
  const refinementSummary = query.followUpNotes.trim()

  return (
    <>
      <main className="px-3 pt-4 pb-6 sm:px-6 sm:pt-5 sm:pb-8 lg:px-6 xl:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8">
        <section
          className={`relative w-full max-w-4xl overflow-hidden rounded-[36px] text-center transition-all duration-300 ${
            hasStartedSearch ? 'px-0 py-0' : 'px-2 py-3 sm:px-4 sm:py-5'
          }`}
        >
          {!hasStartedSearch ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[#eadfce]"
            />
          ) : null}
          <div className={`relative ${hasStartedSearch ? 'space-y-3' : 'space-y-6'}`}>
          {!hasStartedSearch ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <img
                  src={wordmark}
                  alt="Focamai"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="mx-auto h-auto w-full max-w-[240px] sm:max-w-[340px] lg:max-w-[420px]"
                />
              </div>
              <div className="space-y-3">
                <h2
                  className={`text-2xl font-medium tracking-tight text-[#155f70] transition-opacity duration-300 sm:text-4xl ${
                    showHeroCopy ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  What are you looking for today?
                </h2>
                <p
                  className={`mx-auto max-w-xl text-[13px] italic font-medium tracking-[0.01em] text-slate-500 transition-opacity duration-300 sm:text-[15px] ${
                    showHeroCopy ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ fontFamily: '"Instrument Sans", sans-serif' }}
                >
                  {HERO_SUBLINE}
                </p>
                <FlowProgress
                  hasDiscoveryResults={hasDiscoveryResults}
                  hasFinalResults={hasFinalResults}
                  hasStartedSearch={hasStartedSearch}
                />
              </div>
            </div>
          ) : (
            <FlowProgress
              hasDiscoveryResults={hasDiscoveryResults}
              hasFinalResults={hasFinalResults}
              hasStartedSearch={hasStartedSearch}
            />
          )}

          <div className="flex justify-center">
            <div className="w-full max-w-3xl">
              {hasStartedSearch ? (
                <FlowStageSummary
                  actionLabel="New search"
                  label="Search"
                  onAction={actions.resetToNewSearch}
                >
                  <span className="line-clamp-2 break-words">
                    {submittedQuery || query.productQuery}
                  </span>
                </FlowStageSummary>
              ) : (
                <form onSubmit={handleSearchSubmit}>
              <div
                className={`scroll-mt-28 rounded-[28px] border p-4 text-left shadow-[0_24px_64px_-50px_rgba(15,23,42,0.28)] backdrop-blur transition-all duration-300 sm:p-5 ${
                  hasStartedSearch
                    ? 'border-[#e4d5c2] bg-white/96'
                    : 'border-[#e4d7c6] bg-white/94'
                }`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="flex-1">
                    <Label htmlFor="open-variant-query" className="sr-only">
                      Product topic
                    </Label>
                    <Textarea
                      ref={searchInputRef}
                      id="open-variant-query"
                      aria-label="Product topic"
                      value={query.productQuery}
                      rows={2}
                      maxLength={MAX_PRODUCT_QUERY_LENGTH}
                      onChange={(event) => query.setProductQuery(event.target.value)}
                      onKeyDown={(event) =>
                        handleProductQueryTextareaKeyDown(event, {
                          canSubmit: canSubmitTopQuery,
                          onSubmit: () => handleSearchSubmit(event),
                        })
                      }
                      placeholder='Try "travel stroller for airplane", "ergonomic office chair", or "lego botanical set"'
                      className="min-h-[5.25rem] w-full resize-none rounded-[22px] border border-[#e5dacb] bg-white px-5 py-4 text-lg leading-7 text-slate-900 outline-none transition placeholder:text-[15px] placeholder:text-slate-400 focus-visible:border-primary/50 focus-visible:ring-[4px] focus-visible:ring-[rgba(15,97,117,0.08)] sm:placeholder:text-base"
                      autoFocus={isDesktop}
                      disabled={isLoading}
                    />
                    {shouldShowCharCounter(query.productQuery.length, MAX_PRODUCT_QUERY_LENGTH) ? (
                      <div className="mt-2 flex items-center justify-between gap-3 px-2">
                        {shouldShowCharCounter(query.productQuery.length, MAX_PRODUCT_QUERY_LENGTH) ? (
                          <span className="shrink-0">
                            <CharCounter current={query.productQuery.length} max={MAX_PRODUCT_QUERY_LENGTH} />
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type={!hasStartedSearch ? 'submit' : 'button'}
                    disabled={isLoading}
                    className={`h-16 rounded-[22px] px-6 text-base text-primary-foreground shadow-[0_18px_40px_-28px_rgba(15,97,117,0.34)] transition-transform hover:-translate-y-[1px] ${
                      hasStartedSearch
                        ? 'bg-primary/75 hover:bg-primary/85'
                        : 'bg-primary hover:bg-primary/90'
                    }`}
                    onClick={
                      hasStartedSearch
                        ? (event) => handleNewSearchClick(event, actions.resetToNewSearch)
                        : undefined
                    }
                  >
                    {isLoading
                      ? 'Starting your search...'
                      : hasStartedSearch
                        ? 'New search'
                        : 'Start search'}
                    {isLoading ? (
                      <LoaderCircle className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="ml-2 h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="mt-3 px-2 text-sm leading-6 text-slate-500">
                  Just the product for now. Budget, size, and other details come next.
                </p>
              </div>
                </form>
              )}
            </div>
          </div>
          </div>
        </section>

        {shouldShowRefinementPanel ? (
          <section
            ref={refinementRef}
            className="w-full max-w-4xl scroll-mt-28 rounded-[28px] border border-[#e4d5c2] bg-white/96 p-4 text-left shadow-[0_24px_64px_-50px_rgba(15,23,42,0.24)] transition-all duration-300 sm:p-5"
          >
            <div className="space-y-5">
              <RefinementCopy
                isGeneratingPrompt={status.isGeneratingPrompt}
                prompt={prompt}
                submittedQuery={submittedQuery}
              />

              <RefinementChips
                disabled={status.isFinalizing}
                followUpNotes={query.followUpNotes}
                onFollowUpNotesChange={query.setFollowUpNotes}
                refinementPrompt={prompt}
              />

              <div className="space-y-2">
                <div
                  className={`rounded-[30px] border bg-white p-1 transition-all duration-300 ${
                    status.isGeneratingPrompt
                      ? 'border-primary/20 shadow-[0_16px_42px_-32px_rgba(15,97,117,0.24)] ring-1 ring-primary/15'
                      : 'border-[#e5dacb] shadow-[0_14px_38px_-32px_rgba(120,87,63,0.18)]'
                  }`}
                >
                  <Label htmlFor="open-follow-up-notes" className="sr-only">
                    Tell us more
                  </Label>
                  <Textarea
                    id="open-follow-up-notes"
                    value={query.followUpNotes}
                    maxLength={MAX_DETAILS_LENGTH}
                    onChange={(event) => query.setFollowUpNotes(clampFollowUpNotes(event.target.value))}
                    onKeyDown={(event) =>
                      handleRefinementTextareaKeyDown(event, {
                        canSubmit: hasDiscoveryResults && !status.isFinalizing,
                        onSubmit: actions.finalizeRefinement,
                      })
                    }
                    className="min-h-36 resize-none rounded-[28px] border-0 bg-transparent px-5 py-4 text-base leading-7 shadow-none placeholder:text-slate-400 focus-visible:ring-0"
                    placeholder={refinementCopy.placeholder}
                    disabled={status.isFinalizing}
                  />
                  {shouldShowCharCounter(query.followUpNotes.length, MAX_DETAILS_LENGTH) ? (
                    <div className="flex justify-end px-4 pb-3">
                      <CharCounter current={query.followUpNotes.length} max={MAX_DETAILS_LENGTH} />
                    </div>
                  ) : null}
                </div>
                {status.isGeneratingPrompt ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium tracking-[0.02em] text-slate-500">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inset-0 rounded-full bg-primary/20 animate-soft-pulse" />
                        <span className="relative h-2.5 w-2.5 rounded-full bg-primary/65" />
                      </span>
                      You can start typing while we put together an example suggestion, or just write your own.
                    </div>
                    <div className="relative overflow-hidden rounded-full bg-stone-200/80">
                      <div className="h-2.5 w-full" />
                      <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="order-2 flex flex-col items-start gap-1 sm:order-1">
                  <button
                    type="button"
                    disabled={!hasDiscoveryResults || status.isFinalizing}
                    className="rounded-full border border-[#e5dacb] bg-white/90 px-4 py-2 text-left text-sm font-medium text-slate-500 shadow-[0_12px_30px_-24px_rgba(120,87,63,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d7c7b3] hover:bg-white hover:text-slate-700 hover:shadow-[0_16px_36px_-24px_rgba(120,87,63,0.44)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-40 disabled:hover:translate-y-0"
                    onClick={actions.showProductsNow}
                  >
                    Skip the question and show results {'->'}
                  </button>
                  <p className="text-left text-xs text-slate-400">
                    Great for simple searches that don't need more detail. Uses your original search only.
                  </p>
                </div>
                <div className="order-1 flex flex-col gap-1 sm:order-2 sm:items-end">
                  <Button
                    type="button"
                    disabled={!hasDiscoveryResults || status.isFinalizing}
                    className="h-14 w-full rounded-[22px] bg-primary px-6 text-[15px] font-medium text-primary-foreground shadow-[0_18px_42px_-28px_rgba(15,97,117,0.36)] hover:bg-primary/90 sm:w-auto sm:min-w-[220px]"
                    onClick={actions.finalizeRefinement}
                  >
                    {status.isFinalizing ? 'Narrowing your picks...' : 'Show focused picks'}
                    {status.isFinalizing ? (
                      <LoaderCircle className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="ml-2 h-4 w-4" />
                    )}
                  </Button>
                  <p className="px-1 text-xs text-slate-400">
                    Best results - takes about 4 more seconds
                  </p>
                </div>
              </div>
            </div>
          </section>
        ) : hasFinalResults ? (
          <section className="w-full max-w-4xl">
            <FlowStageSummary label="Refine">
              <span className="line-clamp-2 break-words">
                {refinementSummary || 'No extra notes added.'}
              </span>
            </FlowStageSummary>
          </section>
        ) : null}

        <section className="w-full max-w-[1100px] space-y-4">
          <QuerySuggestionPrompt
            isApplying={querySuggestion.isApplying}
            onKeepResults={querySuggestion.reject}
            onTrySuggestedSearch={querySuggestion.trySuggestedSearch}
            suggestion={querySuggestion.suggestion}
          />
          {hasFinalResults && !hasOpenedModal ? (
            <p role="status" aria-live="polite" className="text-center text-sm text-slate-400">
              ✦&nbsp; Open any result to see why it fits you and what to watch out for.
            </p>
          ) : null}
          {showLoadingResults ? (
            <div ref={resultsViewportRef} className="max-h-[360px] scroll-mt-28 overflow-hidden">
              <ResultsSectionFallback showFinalizeStatus={status.isFinalizing} />
            </div>
          ) : shouldLoadResultsSection ? (
            <div
              ref={resultsViewportRef}
              className="scroll-mt-28"
            >
              <Suspense fallback={<ResultsSectionFallback showFinalizeStatus={status.isFinalizing} />}>
                <ResultsSection
                  displayedResults={displayedResults}
                  errorMessage={errorMessage}
                  hasFinalResults={hasFinalResults}
                  hasStartedSearch={hasStartedSearch}
                  isFinalizing={status.isFinalizing}
                  isEnrichmentSettled={status.isEnrichmentSettled}
                  isLoading={isLoading}
                  isRetryReady
                  isRetrying={status.isFinalizing}
                  isGeneratingRetryAdvice={retry.isGeneratingAdvice}
                  onRetailerClick={actions.trackRetailerClick}
                  onSelectProduct={handleSelectProduct}
                  onRetryAdviceRequest={retry.requestAdvice}
                  onRetryFeedbackChange={retry.setFeedback}
                  onRetrySearch={handleRetrySearch}
                  previousResults={results.previous}
                  retryAdvice={retry.advice}
                  selectionState={results.selectionState}
                  followUpNotes={query.followUpNotes}
                  retryCount={retry.count}
                  retryFeedback={retry.feedback}
                  showFinalResultBadges={results.showFinalBadges}
                  showPreviewResults={showPreviewResults}
                  suggestedRetryQuery={retry.suggestedQuery}
                  submittedQuery={submittedQuery}
                />
              </Suspense>
            </div>
          ) : null}
        </section>

        {showTimingPanel ? <TimingPanel requestTiming={status.requestTiming} /> : null}
      </div>
      </main>
    </>
  )
}

export function HomeExperience({ initialSearchQuery = '' } = {}) {
  const guided = useGuidedSearch()
  const { actions, query, results, status } = guided
  const { beginGuidedSearch, trackRetailerClick } = actions
  const { productQuery, setProductQuery } = query
  const initialSearchQueryText = String(initialSearchQuery || '').trim()
  const initialSearchRef = useRef({ query: '', status: 'idle' })
  const showTimingPanel = shouldShowTimingPanel()

  useEffect(() => {
    applyPlainBackgroundMode()
  }, [])

  useEffect(() => {
    void loadResultsSection()
    void loadProductDetailModal()
  }, [])

  useEffect(() => {
    if (
      !initialSearchQueryText ||
      initialSearchRef.current.query === initialSearchQueryText
    ) {
      return
    }

    initialSearchRef.current = { query: initialSearchQueryText, status: 'set-query' }
    setProductQuery(initialSearchQueryText)
  }, [initialSearchQueryText, setProductQuery])

  useEffect(() => {
    const initialSearch = initialSearchRef.current

    if (
      !initialSearchQueryText ||
      initialSearch.query !== initialSearchQueryText ||
      initialSearch.status !== 'set-query' ||
      status.hasStartedSearch ||
      productQuery !== initialSearchQueryText
    ) {
      return
    }

    const startTimer = window.setTimeout(() => {
      initialSearchRef.current = { query: initialSearchQueryText, status: 'started' }
      beginGuidedSearch({ preventDefault() {} })
    }, 0)

    return () => {
      window.clearTimeout(startTimer)
    }
  }, [
    beginGuidedSearch,
    status.hasStartedSearch,
    initialSearchQueryText,
    productQuery,
  ])

  const layoutProps = {
    guided,
    showTimingPanel,
  }

  return (
    <>
      <OpenLayout {...layoutProps} />
      {results.selectedProduct ? (
        <Suspense fallback={<ProductDetailModalFallback />}>
          <ProductDetailModal
            item={results.selectedProduct}
            isEnrichmentSettled={status.isEnrichmentSettled}
            onRetailerClick={() =>
              trackRetailerClick(results.selectedProduct, {
                position: results.selectedProduct?.analyticsMeta?.position ?? 0,
                resultSet: results.selectedProduct?.analyticsMeta?.resultSet || 'final',
              })
            }
            onClose={() => results.setSelectedProduct(null)}
          />
        </Suspense>
      ) : null}
      {/* FeedbackFab temporarily hidden — unused by testers */}
      {/* <FeedbackFab
        finalized={results.hasFinalResults}
        hasStartedSearch={status.hasStartedSearch}
        queryText={submittedQuery || productQuery}
        resultsSeen={results.displayed.length > 0}
        searchId={analytics.searchId}
        selectedProductId={results.selectedProduct?.id || ''}
        sessionId={analytics.sessionId || feedbackSessionId}
        stageReached={feedbackStage}
      /> */}
    </>
  )
}
