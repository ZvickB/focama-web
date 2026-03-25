import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Search, Sparkles } from 'lucide-react'

import wordmark from '@/assets/wordmark.PNG'
import { ProductDetailModal, ResultsSection, ResultSkeleton } from '@/components/home/HomeShared.jsx'
import { RESULT_CARD_SLOTS, useGuidedSearch } from '@/components/home/useGuidedSearch.js'
import { Button } from '@/components/ui/button.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'

const HERO_SUBLINE = 'From too many choices to yours'

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
    onSelectProduct,
    onShowProductsNow,
    prompt,
    resetToNewSearch,
    setFollowUpNotes,
    setProductQuery,
    showPreviewResults,
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
  const showLoadingResults = (isLoading && displayedResults.length === 0) || state.isFinalizing

  return (
    <main className="px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8">
        <section className="w-full max-w-4xl space-y-6 text-center">
          <div className="space-y-4">
            <div className="space-y-2">
              <img
                src={wordmark}
                alt="Focama"
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
                style={{ fontFamily: '"Manrope", sans-serif' }}
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
                    placeholder='Try "lego", "office chair", or "travel stroller"'
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

              {hasStartedSearch ? (
                <div className="mt-5 space-y-5 border-t border-stone-200/80 pt-5">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 px-3 py-1 text-sm text-primary">
                      <Sparkles className="h-4 w-4" />
                      AI refinement
                    </div>
                    <p className="text-xl font-medium leading-8 text-slate-900">
                      {state.isGeneratingPrompt
                        ? 'Shaping your next question...'
                        : prompt?.prompt || `What should we optimize for with this ${submittedQuery}?`}
                    </p>
                    <p className="max-w-2xl text-sm leading-7 text-slate-600">
                      {state.isGeneratingPrompt
                        ? 'We’re preparing a more useful follow-up before you refine the shortlist.'
                        : prompt?.helperText ||
                          'Add any context that will help Focama narrow the shortlist more intelligently.'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="open-follow-up-notes" className="text-slate-700">
                      Add context for the AI
                    </Label>
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
                      className="min-h-36 resize-none rounded-[28px] border-stone-200 bg-[#fffdf9] px-5 py-4 text-base leading-7 placeholder:text-slate-400"
                      placeholder={
                        state.isGeneratingPrompt
                          ? 'Shaping your next question...'
                          : prompt?.followUpPlaceholder ||
                            'Examples: for a 6 year old, under $200, small apartment, should feel premium, or easy to clean.'
                      }
                      disabled={state.isFinalizing || state.isGeneratingPrompt}
                    />
                    {state.isGeneratingPrompt ? (
                      <div className="relative overflow-hidden rounded-full bg-stone-200/80">
                        <div className="h-2.5 w-full" />
                        <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-end">
                    <Button
                      type="button"
                      disabled={!hasDiscoveryResults || state.isFinalizing}
                      className="h-13 w-full rounded-[24px] bg-primary px-5 text-base text-primary-foreground hover:bg-primary/90 sm:w-auto"
                      onClick={onFinalize}
                    >
                      {state.isFinalizing ? 'Applying your priorities...' : 'Show focused picks'}
                      {state.isFinalizing ? (
                        <LoaderCircle className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="ml-2 h-4 w-4" />
                      )}
                    </Button>
                    <div className="space-y-1 text-right sm:flex sm:min-h-[56px] sm:flex-col sm:justify-between">
                      <Button
                        type="button"
                        disabled={!hasDiscoveryResults || state.isFinalizing}
                        className={`h-13 w-full rounded-[24px] px-5 text-base transition sm:w-auto ${
                          hasDiscoveryResults && !state.isFinalizing
                            ? 'bg-accent/70 text-accent-foreground hover:bg-accent/80'
                            : 'bg-stone-200 text-slate-500 hover:bg-stone-200'
                        }`}
                        onClick={onShowProductsNow}
                      >
                        Show products now
                      </Button>
                      <p className="text-xs text-slate-500">Skip AI refinement.</p>
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
                isLoading={isLoading}
                isRetryReady={state.retryCount < 2}
                isRetrying={state.isFinalizing}
                onSelectProduct={onSelectProduct}
                onRetryFeedbackChange={state.setRetryFeedback}
                onRetryWithFeedback={state.handleRetryWithFeedback}
                previousResults={state.previousResults}
                selectionState={state.selectionState}
                retryCount={state.retryCount}
                retryFeedback={state.retryFeedback}
                showPreviewResults={showPreviewResults}
                submittedQuery={submittedQuery}
              />
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export function HomeExperience() {
  const state = useGuidedSearch()

  const layoutProps = {
    displayedResults: state.displayedResults,
    errorMessage: state.errorMessage,
    hasFinalResults: state.hasFinalResults,
    hasStartedSearch: state.hasStartedSearch,
    isLoading: state.isLoading,
    onFinalize: state.handleFinalizeRefinement,
    onSelectProduct: state.setSelectedProduct,
    onShowProductsNow: state.handleShowProductsNow,
    prompt: state.refinementPrompt,
    previousResults: state.previousResults,
    resetToNewSearch: state.resetToNewSearch,
    selectionState: state.selectionState,
    retryCount: state.retryCount,
    retryFeedback: state.retryFeedback,
    setFollowUpNotes: state.setFollowUpNotes,
    setProductQuery: state.setProductQuery,
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
          onClose={() => state.setSelectedProduct(null)}
        />
      ) : null}
    </>
  )
}
