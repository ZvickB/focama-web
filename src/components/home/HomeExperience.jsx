import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Search, Sparkles } from 'lucide-react'

import wordmark from '@/assets/wordmark.PNG'
import { ProductDetailModal, ResultsSection, ResultSkeleton } from '@/components/home/HomeShared.jsx'
import { RESULT_CARD_SLOTS, useGuidedSearch } from '@/components/home/useGuidedSearch.js'
import { Button } from '@/components/ui/button.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'

const HERO_SUBLINE = 'From too many choices to yours'

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

function smoothScrollIntoView(element) {
  if (!element || typeof element.scrollIntoView !== 'function') {
    return
  }

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
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
  return {
    helper:
      prompt?.helperText ||
      'Use this step for natural-language details like budget, size, comfort, style, or where you plan to use it.',
    placeholder:
      prompt?.followUpPlaceholder ||
      'Example: I want something lightweight for daily travel, under $200, and easy to clean.',
    title: isGeneratingPrompt
      ? 'You can add more detail right away'
      : prompt?.prompt || `What should we optimize for with this ${submittedQuery}?`,
  }
}

function RefinementCopy({ isGeneratingPrompt, prompt, submittedQuery }) {
  const [displayedCopy, setDisplayedCopy] = useState(() =>
    buildRefinementCopy({ isGeneratingPrompt, prompt, submittedQuery }),
  )
  const [displayedTitle, setDisplayedTitle] = useState(() =>
    buildRefinementCopy({ isGeneratingPrompt, prompt, submittedQuery }).title,
  )
  const [isTitleVisible, setIsTitleVisible] = useState(true)
  const [streamedHelper, setStreamedHelper] = useState(() =>
    isGeneratingPrompt ? '' : buildRefinementCopy({ isGeneratingPrompt, prompt, submittedQuery }).helper,
  )

  useEffect(() => {
    const nextCopy = buildRefinementCopy({ isGeneratingPrompt, prompt, submittedQuery })

    if (
      displayedCopy.title === nextCopy.title &&
      displayedCopy.helper === nextCopy.helper &&
      displayedCopy.placeholder === nextCopy.placeholder
    ) {
      return
    }

    setDisplayedCopy(nextCopy)
  }, [displayedCopy.helper, displayedCopy.placeholder, displayedCopy.title, isGeneratingPrompt, prompt, submittedQuery])

  useEffect(() => {
    if (displayedTitle === displayedCopy.title) {
      return
    }

    const hideTimer = window.setTimeout(() => {
      setIsTitleVisible(false)
    }, 0)

    const swapTimer = window.setTimeout(() => {
      setDisplayedTitle(displayedCopy.title)
      setIsTitleVisible(true)
    }, 300)

    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(swapTimer)
    }
  }, [displayedCopy.title, displayedTitle])

  useEffect(() => {
    if (!isGeneratingPrompt) {
      setStreamedHelper(displayedCopy.helper)
      return
    }

    setStreamedHelper('')

    let characterIndex = 0
    const intervalId = window.setInterval(() => {
      characterIndex += 2
      setStreamedHelper(displayedCopy.helper.slice(0, characterIndex))

      if (characterIndex >= displayedCopy.helper.length) {
        window.clearInterval(intervalId)
      }
    }, 40)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [displayedCopy.helper, isGeneratingPrompt])

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 px-3 py-1 text-sm text-primary">
        <Sparkles className={`h-4 w-4 ${isGeneratingPrompt ? 'animate-pulse' : ''}`} />
        A little more context
      </div>
      <div className="space-y-3">
        <p
          className={`text-xl font-medium leading-8 text-slate-900 transition-opacity duration-300 ${
            isTitleVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {displayedTitle}
        </p>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">
          {isGeneratingPrompt ? streamedHelper : displayedCopy.helper}
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
    <section className="w-full max-w-5xl rounded-[28px] border border-dashed border-stone-200 bg-stone-50/70 p-4 sm:p-5">
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
            className="rounded-[22px] border border-stone-200/80 bg-white/85 p-4 text-sm text-slate-600"
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

function OpenLayout(props) {
  const refinementRef = useRef(null)
  const resultsViewportRef = useRef(null)
  const lastRefinementScrollQueryRef = useRef('')
  const lastResultsScrollQueryRef = useRef('')
  const lastPreviewScrollQueryRef = useRef('')
  const lastFinalizeScrollQueryRef = useRef('')
  const [showHeroCopy, setShowHeroCopy] = useState(false)
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

  const hasDiscoveryResults = Boolean(state.candidatePool)
  const showLoadingResults = isLoading && displayedResults.length === 0
  const refinementCopy = buildRefinementCopy({
    isGeneratingPrompt: state.isGeneratingPrompt,
    prompt,
    submittedQuery,
  })

  return (
    <main className="px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8">
        <section className="w-full max-w-4xl space-y-6 text-center">
          <div className="space-y-4">
            <div className="space-y-2">
              <img
                src={wordmark}
                alt="Focamai"
                className="mx-auto h-auto w-full max-w-[240px] sm:max-w-[340px] lg:max-w-[420px]"
              />
            </div>
            <div className="space-y-3">
              <h2
                className={`text-2xl font-medium tracking-tight text-slate-900 transition-opacity duration-300 sm:text-4xl ${
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
            </div>
          </div>

          <form className="flex justify-center" onSubmit={state.beginGuidedSearch}>
            <div
              ref={refinementRef}
              className={`scroll-mt-28 w-full max-w-3xl rounded-[36px] border p-4 text-left shadow-[0_28px_120px_-72px_rgba(15,23,42,0.45)] backdrop-blur transition-all duration-300 sm:p-5 ${
                hasStartedSearch
                  ? 'border-primary/25 bg-white/92 shadow-[0_36px_140px_-68px_rgba(15,23,42,0.5)]'
                  : 'border-white/70 bg-white/80'
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <Label htmlFor="open-variant-query" className="sr-only">
                    Product topic
                  </Label>
                  <input
                    id="open-variant-query"
                    aria-label="Product topic"
                    value={state.productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                    placeholder='Try "travel stroller for airplane", "ergonomic office chair", or "lego botanical set"'
                    className="h-16 w-full rounded-[28px] border border-stone-200 bg-white px-5 text-lg text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary/50"
                    disabled={isLoading}
                  />
                </div>
                <Button
                  type={hasStartedSearch ? 'button' : 'submit'}
                  disabled={isLoading}
                  className={`h-16 rounded-[28px] px-6 text-base text-primary-foreground ${
                    hasStartedSearch
                      ? 'bg-primary/70 hover:bg-primary/80'
                      : 'bg-primary hover:bg-primary/90'
                  }`}
                  onClick={
                    hasStartedSearch
                      ? (event) => handleNewSearchClick(event, resetToNewSearch)
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
              {!hasStartedSearch ? (
                <p className="mt-3 px-2 text-sm leading-6 text-slate-500">
                  Start with the product search you&apos;d normally type into Google. Use the next
                  step for budget, size, comfort, style, or other must-haves.
                </p>
              ) : null}

              {hasStartedSearch ? (
                <div className="mt-5 space-y-5 border-t border-stone-200/80 pt-5">
                  <RefinementCopy
                    isGeneratingPrompt={state.isGeneratingPrompt}
                    prompt={prompt}
                    submittedQuery={submittedQuery}
                  />

                  <div className="space-y-2">
                    <Label htmlFor="open-follow-up-notes" className="text-slate-700">
                      Add details to narrow the search
                    </Label>
                    <div
                      className={`rounded-[30px] border border-stone-200 bg-[#fffdf9] p-1 transition-all duration-300 ${
                        state.isGeneratingPrompt
                          ? 'translate-y-0 shadow-[0_20px_60px_-42px_rgba(37,99,235,0.45)] ring-1 ring-primary/12'
                          : 'translate-y-0 shadow-[0_16px_40px_-36px_rgba(15,23,42,0.2)]'
                      }`}
                    >
                      <Textarea
                        id="open-follow-up-notes"
                        value={state.followUpNotes}
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
                    </div>
                    {state.isGeneratingPrompt ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium tracking-[0.02em] text-slate-500">
                          <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inset-0 rounded-full bg-primary/20 animate-soft-pulse" />
                          <span className="relative h-2.5 w-2.5 rounded-full bg-primary/65" />
                          </span>
                          You can start typing while we put together a suggestion.
                        </div>
                        <div className="relative overflow-hidden rounded-full bg-stone-200/80">
                          <div className="h-2.5 w-full" />
                          <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-end">
                    <Button
                      type="button"
                      disabled={!hasDiscoveryResults || state.isFinalizing}
                      className="h-14 w-full rounded-[24px] bg-primary px-6 text-[15px] font-medium text-primary-foreground shadow-[0_18px_40px_-24px_rgba(37,99,235,0.7)] hover:bg-primary/90 sm:min-w-[220px]"
                      onClick={onFinalize}
                    >
                      {state.isFinalizing ? 'Narrowing your picks...' : 'Show focused picks'}
                      {state.isFinalizing ? (
                        <LoaderCircle className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="ml-2 h-4 w-4" />
                      )}
                    </Button>
                    <div className="space-y-1 text-right sm:max-w-[240px] sm:flex sm:min-h-[56px] sm:flex-col sm:justify-between">
                      <Button
                        type="button"
                        disabled={!hasDiscoveryResults || state.isFinalizing}
                        className={`h-13 w-full rounded-[24px] px-5 text-sm transition sm:min-w-[220px] ${
                          hasDiscoveryResults && !state.isFinalizing
                            ? 'bg-accent/70 text-accent-foreground hover:bg-accent/80'
                            : 'bg-stone-200 text-slate-500 hover:bg-stone-200'
                        }`}
                        onClick={onShowProductsNow}
                      >
                        Show products now
                      </Button>
                      <p className="text-xs text-slate-500">
                        Fast picks now. Add detail for a more focused shortlist.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </form>
        </section>

        <section className="w-full max-w-5xl space-y-4">
          {showLoadingResults ? (
            <div ref={resultsViewportRef} className="max-h-[360px] scroll-mt-28 overflow-hidden">
              {state.isFinalizing ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-4 rounded-[24px] border border-stone-200/80 bg-stone-50/90 px-4 py-4 text-left text-slate-600 sm:px-5"
                >
                  <div className="flex items-start gap-3">
                    <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inset-0 rounded-full bg-primary/25 animate-soft-pulse" />
                      <span className="relative h-2.5 w-2.5 rounded-full bg-primary/70" />
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-900">Taking a closer look at the options.</p>
                      <p className="text-sm leading-6 text-slate-600">
                        We&apos;re narrowing the shortlist and locking the final picks.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {RESULT_CARD_SLOTS.map((index) => (
                  <ResultSkeleton key={index} className="opacity-95" />
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={resultsViewportRef}
              className="scroll-mt-28 rounded-[32px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.28)] backdrop-blur sm:p-6"
            >
              <ResultsSection
                displayedResults={displayedResults}
                errorMessage={errorMessage}
                hasFinalResults={hasFinalResults}
                hasStartedSearch={hasStartedSearch}
                isFinalizing={state.isFinalizing}
                isLoading={isLoading}
                isRetryReady={state.retryCount < 2}
                isRetrying={state.isFinalizing}
                onRetailerClick={onRetailerClick}
                onSelectProduct={onSelectProduct}
                onRetryFeedbackChange={state.setRetryFeedback}
                onRetryWithFeedback={state.handleRetryWithFeedback}
                previousResults={state.previousResults}
                selectionState={state.selectionState}
                retryCount={state.retryCount}
                retryFeedback={state.retryFeedback}
                showFinalResultBadges={state.showFinalResultBadges}
                showPreviewResults={showPreviewResults}
                submittedQuery={submittedQuery}
              />
            </div>
          )}
        </section>

        {showTimingPanel ? <TimingPanel requestTiming={state.requestTiming} /> : null}
      </div>
    </main>
  )
}

export function HomeExperience() {
  const state = useGuidedSearch()
  const showTimingPanel = shouldShowTimingPanel()

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
        <ProductDetailModal
          item={state.selectedProduct}
          onRetailerClick={() =>
            state.handleRetailerClick(state.selectedProduct, {
              position: state.selectedProduct?.analyticsMeta?.position ?? 0,
              resultSet: state.selectedProduct?.analyticsMeta?.resultSet || 'final',
            })
          }
          onClose={() => state.setSelectedProduct(null)}
        />
      ) : null}
    </>
  )
}
