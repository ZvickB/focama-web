import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { LoaderCircle, Search, Sparkles } from 'lucide-react'
import { MAX_PRODUCT_QUERY_LENGTH, MAX_DETAILS_LENGTH } from '../../../shared/search-input.js'

import wordmark from '@/assets/wordmark.PNG'
import { FeedbackFab } from '@/components/home/FeedbackFab.jsx'
import { ResultSkeleton } from '@/components/home/ResultSkeleton.jsx'
import {
  RESULT_CARD_SLOTS,
  useGuidedSearch,
} from '@/components/home/useGuidedSearch.js'
import { Button } from '@/components/ui/button.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'
import { useSearchProgress } from '@/contexts/useSearchProgress.js'
import { getOrCreateAnalyticsSessionId } from '@/lib/analytics.js'

const HERO_SUBLINE = "Tell us what you need. We'll find your six."
function loadResultsSection() {
  return import('@/components/home/ResultsSection.jsx')
}

function loadProductDetailModal() {
  return import('@/components/home/ProductDetailModal.jsx')
}

const ResultsSection = lazy(() => loadResultsSection())
const ProductDetailModal = lazy(() => loadProductDetailModal())

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

function getFeedbackStage(state) {
  if (state.selectedProduct) {
    return 'modal_open'
  }

  if (state.hasFinalResults) {
    return 'finalized'
  }

  if (state.showPreviewResults) {
    return 'preview'
  }

  if (state.hasStartedSearch && state.candidatePool) {
    return 'refine'
  }

  if (state.hasStartedSearch || state.isLoading) {
    return 'searching'
  }

  return 'home'
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
    titleEyebrow: isGeneratingPrompt ? 'You can add more detail right away' : 'For example:',
    titleQuestion: isGeneratingPrompt ? '' : suggestedQuestion,
  }
}

function RefinementCopy({ isGeneratingPrompt, prompt, submittedQuery }) {
  const displayedCopy = buildRefinementCopy({ isGeneratingPrompt, prompt, submittedQuery })

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-[#e6d8c5] bg-[linear-gradient(180deg,rgba(250,245,239,0.98),rgba(255,255,255,0.96))] px-3 py-1 text-sm text-[#80573f] shadow-[0_10px_30px_-24px_rgba(120,87,63,0.5)]">
        <Sparkles className={`h-4 w-4 ${isGeneratingPrompt ? 'animate-pulse' : ''}`} />
        The more you share, the better the picks
      </div>
      <div className="space-y-3">
        <p
          className="text-[13px] font-semibold uppercase tracking-[0.14em] text-primary/70 transition-opacity duration-300 sm:text-sm"
          style={{ fontFamily: '"Instrument Sans", sans-serif' }}
        >
          {displayedCopy.titleEyebrow}
        </p>
        {displayedCopy.titleQuestion ? (
          <p
            className="max-w-2xl text-lg font-normal leading-7 text-[#8f4e2f] transition-opacity duration-500 sm:text-xl"
            style={{ fontFamily: '"Manrope", sans-serif' }}
          >
            {displayedCopy.titleQuestion}
          </p>
        ) : null}
        <p className="max-w-2xl text-sm font-medium leading-7 text-slate-600 transition-opacity duration-300 sm:text-[15px]">
          {displayedCopy.helper}
          {isGeneratingPrompt ? (
            <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-slate-400 align-middle" />
          ) : null}
        </p>
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
    <section className="w-full max-w-5xl rounded-[28px] border border-dashed border-[#e6dacb] bg-[linear-gradient(180deg,rgba(250,246,240,0.68),rgba(255,255,255,0.92))] p-4 sm:p-5">
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
            className="rounded-[22px] border border-[#ece1d3] bg-white/92 p-4 text-sm text-slate-600 shadow-[0_18px_46px_-38px_rgba(120,87,63,0.24)]"
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


function ResultsSectionFallback({ isFinalizing = false }) {
  return (
    <div className="space-y-4">
      {isFinalizing ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-[24px] border border-[#e6dacc] bg-[linear-gradient(180deg,rgba(250,246,240,0.9),rgba(255,255,255,0.96))] px-4 py-4 text-left text-slate-600 shadow-[0_22px_58px_-42px_rgba(120,87,63,0.22)] sm:px-5"
        >
          <div className="flex items-start gap-3">
            <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inset-0 rounded-full bg-primary/25 animate-soft-pulse" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-primary/70" />
            </span>
            <div className="space-y-1">
              <p className="text-sm leading-6 text-slate-900">
                Selecting your picks — open any result to see why it fits <em>your</em> needs and
                what to watch for.
              </p>
            </div>
          </div>
        </div>
      ) : null}
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
      <div className="rounded-full border border-[#e7dac8] bg-white/96 px-4 py-3 text-sm text-slate-600 shadow-[0_16px_42px_-34px_rgba(120,87,63,0.32)]">
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
  const lastAppliedRetrySuggestionRef = useRef('')
  const [showHeroCopy, setShowHeroCopy] = useState(false)
  const [loadedRetrySuggestion, setLoadedRetrySuggestion] = useState(null)
  const {
    displayedResults,
    errorMessage,
    hasFinalResults,
    hasStartedSearch,
    isLoading,
    onFinalize,
    onRetailerClick,
    onSelectProduct,
    onShowProductsNow,
    prompt,
    resetToNewSearch,
    setFollowUpNotes,
    setProductQuery,
    showPreviewResults,
    showTimingPanel,
    state,
    submittedQuery,
  } = props
  const hasLoadedRetrySuggestion = Boolean(loadedRetrySuggestion)
  const shouldShowRefinementControls = hasStartedSearch && !hasLoadedRetrySuggestion

  useEffect(() => {
    const revealTimer = window.setTimeout(() => {
      setShowHeroCopy(true)
    }, 360)

    return () => {
      window.clearTimeout(revealTimer)
    }
  }, [])

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
      !state.isFinalizing ||
      !submittedQuery ||
      lastFinalizeScrollQueryRef.current === submittedQuery ||
      !resultsViewportRef.current
    ) {
      return
    }

    const resultsElement = resultsViewportRef.current

    smoothScrollIntoView(resultsElement)
    lastFinalizeScrollQueryRef.current = submittedQuery
  }, [state.isFinalizing, submittedQuery])

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

  useEffect(() => {
    const normalizedSuggestion = String(state.suggestedRetryQuery || '').trim()

    if (
      !state.retryAdvice ||
      !normalizedSuggestion ||
      !hasStartedSearch ||
      lastAppliedRetrySuggestionRef.current === normalizedSuggestion
    ) {
      return
    }

    lastAppliedRetrySuggestionRef.current = normalizedSuggestion
    setLoadedRetrySuggestion({
      previousQuery: submittedQuery || state.productQuery,
    })
    setProductQuery(normalizedSuggestion)

    window.setTimeout(() => {
      scrollElementNearTop(refinementRef.current, 20)
      searchInputRef.current?.focus?.()
      searchInputRef.current?.select?.()
    }, 0)
  }, [
    hasStartedSearch,
    setProductQuery,
    state.productQuery,
    state.retryAdvice,
    state.suggestedRetryQuery,
    submittedQuery,
  ])

  useEffect(() => {
    if (!hasStartedSearch) {
      setLoadedRetrySuggestion(null)
      lastAppliedRetrySuggestionRef.current = ''
    }
  }, [hasStartedSearch])

  const hasDiscoveryResults = Boolean(state.candidatePool)
  const showLoadingResults = isLoading && displayedResults.length === 0
  const shouldLoadResultsSection =
    hasStartedSearch || displayedResults.length > 0 || Boolean(errorMessage)
  const canSubmitTopQuery = !isLoading && (!hasStartedSearch || hasLoadedRetrySuggestion)

  function handleSearchSubmit(event) {
    if (hasLoadedRetrySuggestion) {
      setLoadedRetrySuggestion(null)
    }

    state.beginGuidedSearch(event)
  }

  function handleBackToResults() {
    if (!loadedRetrySuggestion) {
      return
    }

    setProductQuery(loadedRetrySuggestion.previousQuery || submittedQuery)
    setLoadedRetrySuggestion(null)

    window.setTimeout(() => {
      scrollElementNearTop(resultsViewportRef.current, 20)
    }, 0)
  }

  function handleJumpToSearchForm() {
    scrollElementNearTop(refinementRef.current, 20)
    window.setTimeout(() => {
      searchInputRef.current?.focus?.()
    }, 0)
  }

  const { setProgress } = useSearchProgress()
  useEffect(() => {
    setProgress({ hasStartedSearch, hasDiscoveryResults, hasFinalResults })
  }, [hasStartedSearch, hasDiscoveryResults, hasFinalResults, setProgress])
  const refinementCopy = buildRefinementCopy({
    isGeneratingPrompt: state.isGeneratingPrompt,
    prompt,
    submittedQuery,
  })

  return (
    <>
      <main className="px-3 pt-4 pb-6 sm:px-6 sm:pt-5 sm:pb-8 lg:px-6 xl:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8">
        <section className="relative w-full max-w-4xl overflow-hidden rounded-[36px] px-2 py-3 text-center sm:px-4 sm:py-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[78%] opacity-90"
            style={{
              background:
                'radial-gradient(circle at 20% 22%, rgba(229,155,38,0.11), transparent 26%), radial-gradient(circle at 78% 18%, rgba(15,97,117,0.09), transparent 24%), radial-gradient(circle at 50% 0%, rgba(255,255,255,0.9), transparent 56%)',
            }}
          />
          <div className="relative space-y-6">
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
              <div
                className="text-[13px] font-semibold uppercase tracking-[0.14em] sm:text-sm"
                style={{ fontFamily: '"Instrument Sans", sans-serif' }}
              >
                <span className={hasDiscoveryResults ? 'text-slate-400' : 'text-primary'}>
                  Search
                </span>
                <span className="px-2 text-slate-300">·</span>
                <span
                  className={
                    hasDiscoveryResults && !state.hasFinalResults ? 'text-primary' : 'text-slate-400'
                  }
                >
                  Refine
                </span>
                <span className="px-2 text-slate-300">·</span>
                <span className={state.hasFinalResults ? 'text-primary' : 'text-slate-400'}>
                  Get 6 picks
                </span>
              </div>
            </div>
          </div>

          <form className="flex justify-center" onSubmit={handleSearchSubmit}>
            <div
              className="w-full max-w-3xl"
            >
              {hasLoadedRetrySuggestion ? (
                <div className="mb-3 flex justify-start px-2">
                  <button
                    type="button"
                    className="text-left text-sm text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline"
                    onClick={handleBackToResults}
                  >
                    <span aria-hidden="true">←</span> Back to results
                  </button>
                </div>
              ) : null}

              <div
                ref={refinementRef}
                className={`scroll-mt-28 rounded-[36px] border p-4 text-left shadow-[0_28px_120px_-72px_rgba(15,23,42,0.45)] backdrop-blur transition-all duration-300 sm:p-5 ${
                  hasStartedSearch
                    ? 'border-[#e4d5c2] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,248,244,0.96))] shadow-[0_36px_140px_-68px_rgba(15,23,42,0.5)]'
                    : 'border-[#e4d7c6] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,246,241,0.94))]'
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
                      value={state.productQuery}
                      rows={2}
                      maxLength={MAX_PRODUCT_QUERY_LENGTH}
                      onChange={(event) => setProductQuery(event.target.value)}
                      onKeyDown={(event) =>
                        handleProductQueryTextareaKeyDown(event, {
                          canSubmit: canSubmitTopQuery,
                          onSubmit: () => handleSearchSubmit(event),
                        })
                      }
                      placeholder='Try "travel stroller for airplane", "ergonomic office chair", or "lego botanical set"'
                      className="min-h-[5.25rem] w-full resize-none rounded-[28px] border border-[#e5dacb] bg-white px-5 py-4 text-lg leading-7 text-slate-900 outline-none transition placeholder:text-[15px] placeholder:text-slate-400 focus-visible:border-primary/50 focus-visible:ring-[4px] focus-visible:ring-[rgba(15,97,117,0.08)] sm:placeholder:text-base"
                      autoFocus={isDesktop}
                      disabled={isLoading}
                    />
                    {hasLoadedRetrySuggestion ? (
                      <div className="mt-2 px-2">
                        <p className="text-sm text-slate-600">
                          Suggested based on your feedback — edit if needed.
                        </p>
                      </div>
                    ) : null}
                    {shouldShowCharCounter(state.productQuery.length, MAX_PRODUCT_QUERY_LENGTH) ? (
                      <div className="mt-1.5 flex justify-end px-2">
                        <CharCounter current={state.productQuery.length} max={MAX_PRODUCT_QUERY_LENGTH} />
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type={!hasStartedSearch || hasLoadedRetrySuggestion ? 'submit' : 'button'}
                    disabled={isLoading}
                    className={`h-16 rounded-[28px] px-6 text-base text-primary-foreground shadow-[0_22px_48px_-28px_rgba(15,97,117,0.38)] transition-transform hover:-translate-y-[1px] ${
                      hasStartedSearch && !hasLoadedRetrySuggestion
                        ? 'bg-primary/75 hover:bg-primary/85'
                        : 'bg-primary hover:bg-primary/90'
                    }`}
                    onClick={
                      hasStartedSearch && !hasLoadedRetrySuggestion
                        ? (event) => handleNewSearchClick(event, resetToNewSearch)
                        : undefined
                    }
                  >
                    {isLoading
                      ? 'Starting your search...'
                      : hasLoadedRetrySuggestion
                        ? 'Try this search'
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
                {!hasStartedSearch ? (
                  <p className="mt-3 px-2 text-sm leading-6 text-slate-500">
                    Just the product for now — budget, size, and other details come next.
                  </p>
                ) : null}

                {shouldShowRefinementControls ? (
                  <div className="mt-5 space-y-5 border-t border-stone-200/80 pt-5">
                  <RefinementCopy
                    isGeneratingPrompt={state.isGeneratingPrompt}
                    prompt={prompt}
                    submittedQuery={submittedQuery}
                  />

                  <div className="space-y-2">
                    <div
                      className={`rounded-[30px] border bg-white p-1 transition-all duration-300 ${
                        state.isGeneratingPrompt
                          ? 'border-primary/20 shadow-[0_24px_64px_-42px_rgba(15,97,117,0.34)] ring-1 ring-primary/15'
                          : 'border-[#e5dacb] shadow-[0_22px_64px_-42px_rgba(120,87,63,0.24)]'
                      }`}
                    >
                      <Label htmlFor="open-follow-up-notes" className="sr-only">
                        Tell us more
                      </Label>
                      <Textarea
                        id="open-follow-up-notes"
                        value={state.followUpNotes}
                        maxLength={MAX_DETAILS_LENGTH}
                        onChange={(event) => setFollowUpNotes(event.target.value)}
                        onKeyDown={(event) =>
                          handleRefinementTextareaKeyDown(event, {
                            canSubmit: hasDiscoveryResults && !state.isFinalizing,
                            onSubmit: onFinalize,
                          })
                        }
                        className="min-h-36 resize-none rounded-[28px] border-0 bg-transparent px-5 py-4 text-base leading-7 shadow-none placeholder:text-slate-400 focus-visible:ring-0"
                        placeholder={refinementCopy.placeholder}
                        disabled={state.isFinalizing}
                      />
                      {shouldShowCharCounter(state.followUpNotes.length, MAX_DETAILS_LENGTH) ? (
                        <div className="flex justify-end px-4 pb-3">
                          <CharCounter current={state.followUpNotes.length} max={MAX_DETAILS_LENGTH} />
                        </div>
                      ) : null}
                    </div>
                    {state.isGeneratingPrompt ? (
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
                        disabled={!hasDiscoveryResults || state.isFinalizing}
                        className="text-left text-sm text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline disabled:pointer-events-none disabled:opacity-40"
                        onClick={onShowProductsNow}
                      >
                        Just show me results
                      </button>
                      <p className="text-left text-xs text-slate-400">
                        No AI refinement<br />results based on your search only.
                      </p>
                    </div>
                    <div className="order-1 flex flex-col gap-1 sm:order-2 sm:items-end">
                      <Button
                        type="button"
                        disabled={!hasDiscoveryResults || state.isFinalizing}
                        className="h-14 w-full rounded-[24px] bg-primary px-6 text-[15px] font-medium text-primary-foreground shadow-[0_24px_52px_-28px_rgba(15,97,117,0.42)] hover:bg-primary/90 sm:w-auto sm:min-w-[220px]"
                        onClick={onFinalize}
                      >
                        {state.isFinalizing ? 'Narrowing your picks...' : 'Show focused picks'}
                        {state.isFinalizing ? (
                          <LoaderCircle className="ml-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="ml-2 h-4 w-4" />
                        )}
                      </Button>
                      <p className="px-1 text-xs text-slate-400">
                        Best results — takes ~4 more seconds
                      </p>
                    </div>
                  </div>
                  </div>
                ) : null}
              </div>
            </div>
          </form>
          </div>
        </section>

        <section className="w-full max-w-[1100px] space-y-4">
          {showLoadingResults ? (
            <div ref={resultsViewportRef} className="max-h-[360px] scroll-mt-28 overflow-hidden">
              <ResultsSectionFallback isFinalizing={state.isFinalizing} />
            </div>
          ) : shouldLoadResultsSection ? (
            <div
              ref={resultsViewportRef}
              className="scroll-mt-28"
            >
              <Suspense fallback={<ResultsSectionFallback isFinalizing={state.isFinalizing} />}>
                <ResultsSection
                  displayedResults={displayedResults}
                  errorMessage={errorMessage}
                  hasFinalResults={hasFinalResults}
                  hasStartedSearch={hasStartedSearch}
                  isFinalizing={state.isFinalizing}
                  isLoading={isLoading}
                  isRetryReady
                  isRetrying={state.isFinalizing}
                  isGeneratingRetryAdvice={state.isGeneratingRetryAdvice}
                  hasLoadedSuggestionAtTop={hasLoadedRetrySuggestion}
                  onRetailerClick={onRetailerClick}
                  onJumpToSearchForm={handleJumpToSearchForm}
                  onSelectProduct={onSelectProduct}
                  onRetryAdviceRequest={state.handleRetryAdviceRequest}
                  onRetryFeedbackChange={state.setRetryFeedback}
                  previousResults={state.previousResults}
                  retryAdvice={state.retryAdvice}
                  selectionState={state.selectionState}
                  retryCount={state.retryCount}
                  retryFeedback={state.retryFeedback}
                  showFinalResultBadges={state.showFinalResultBadges}
                  showPreviewResults={showPreviewResults}
                  suggestedRetryQuery={state.suggestedRetryQuery}
                  submittedQuery={submittedQuery}
                />
              </Suspense>
            </div>
          ) : null}
        </section>

        {showTimingPanel ? <TimingPanel requestTiming={state.requestTiming} /> : null}
      </div>
      </main>
    </>
  )
}

export function HomeExperience({ initialSearchQuery = '' } = {}) {
  const state = useGuidedSearch()
  const {
    beginGuidedSearch,
    hasStartedSearch,
    productQuery,
    setProductQuery,
  } = state
  const initialSearchQueryText = String(initialSearchQuery || '').trim()
  const initialSearchRef = useRef({ query: '', status: 'idle' })
  const showTimingPanel = shouldShowTimingPanel()
  const [feedbackSessionId] = useState(() => getOrCreateAnalyticsSessionId())
  const feedbackStage = getFeedbackStage(state)

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
      hasStartedSearch ||
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
    hasStartedSearch,
    initialSearchQueryText,
    productQuery,
  ])

  const layoutProps = {
    displayedResults: state.displayedResults,
    errorMessage: state.errorMessage,
    hasFinalResults: state.hasFinalResults,
    hasStartedSearch: state.hasStartedSearch,
    isLoading: state.isLoading,
    onFinalize: state.handleFinalizeRefinement,
    onRetailerClick: state.handleRetailerClick,
    onSelectProduct: state.handleSelectProduct,
    onShowProductsNow: state.handleShowProductsNow,
    prompt: state.refinementPrompt,
    previousResults: state.previousResults,
    resetToNewSearch: state.resetToNewSearch,
    selectionState: state.selectionState,
    retryCount: state.retryCount,
    retryFeedback: state.retryFeedback,
    setFollowUpNotes: state.setFollowUpNotes,
    setProductQuery: state.setProductQuery,
    showFinalResultBadges: state.showFinalResultBadges,
    showTimingPanel,
    showPreviewResults: state.showPreviewResults,
    state,
    submittedQuery: state.submittedQuery,
  }

  return (
    <>
      <OpenLayout {...layoutProps} />
      {state.selectedProduct ? (
        <Suspense fallback={<ProductDetailModalFallback />}>
          <ProductDetailModal
            item={state.selectedProduct}
            isEnrichmentSettled={state.isEnrichmentSettled}
            onRetailerClick={() =>
              state.handleRetailerClick(state.selectedProduct, {
                position: state.selectedProduct?.analyticsMeta?.position ?? 0,
                resultSet: state.selectedProduct?.analyticsMeta?.resultSet || 'final',
              })
            }
            onClose={() => state.setSelectedProduct(null)}
          />
        </Suspense>
      ) : null}
      <FeedbackFab
        finalized={state.hasFinalResults}
        hasStartedSearch={state.hasStartedSearch}
        queryText={state.submittedQuery || state.productQuery}
        resultsSeen={state.displayedResults.length > 0}
        searchId={state.analyticsSearchId}
        selectedProductId={state.selectedProduct?.id || ''}
        sessionId={state.analyticsSessionId || feedbackSessionId}
        stageReached={feedbackStage}
      />
    </>
  )
}
