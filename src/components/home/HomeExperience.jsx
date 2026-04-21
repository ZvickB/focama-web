import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LoaderCircle, Search, Sparkles } from 'lucide-react'

import wordmark from '@/assets/wordmark.PNG'
import { ProductDetailModal, ResultsSection, ResultSkeleton } from '@/components/home/HomeShared.jsx'
import { RESULT_CARD_SLOTS, useGuidedSearch } from '@/components/home/useGuidedSearch.js'
import { Button } from '@/components/ui/button.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'

const HERO_SUBLINE = "Tell us what you need. We'll find your six."

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
  const suggestedQuestion =
    prompt?.prompt || `What should we optimize for with this ${submittedQuery}?`

  return {
    helper:
      prompt?.helperText ||
      'Use this step for natural-language details like budget, size, comfort, style, or where you plan to use it.',
    placeholder:
      prompt?.followUpPlaceholder ||
      'Example: I want something lightweight for daily travel, under $200, and easy to clean.',
    titleEyebrow: isGeneratingPrompt ? 'You can add more detail right away' : 'One suggestion, such as:',
    titleQuestion: isGeneratingPrompt ? '' : suggestedQuestion,
  }
}

function RefinementCopy({ isGeneratingPrompt, prompt, submittedQuery }) {
  const displayedCopy = useMemo(
    () => buildRefinementCopy({ isGeneratingPrompt, prompt, submittedQuery }),
    [isGeneratingPrompt, prompt, submittedQuery],
  )
  const [streamedHelper, setStreamedHelper] = useState('')
  const [streamedHelperTarget, setStreamedHelperTarget] = useState('')
  const helperTarget = `${isGeneratingPrompt ? 'generating' : 'idle'}:${displayedCopy.helper}`
  const helperCopy =
    isGeneratingPrompt
      ? streamedHelperTarget === helperTarget
        ? streamedHelper
        : ''
      : displayedCopy.helper

  useEffect(() => {
    if (!isGeneratingPrompt) {
      return undefined
    }

    const resetTimer = window.setTimeout(() => {
      setStreamedHelper('')
      setStreamedHelperTarget(helperTarget)
    }, 0)

    let characterIndex = 0
    const intervalId = window.setInterval(() => {
      characterIndex += 2
      setStreamedHelper(displayedCopy.helper.slice(0, characterIndex))
      setStreamedHelperTarget(helperTarget)

      if (characterIndex >= displayedCopy.helper.length) {
        window.clearInterval(intervalId)
      }
    }, 40)

    return () => {
      window.clearTimeout(resetTimer)
      window.clearInterval(intervalId)
    }
  }, [displayedCopy.helper, helperTarget, isGeneratingPrompt])

  return (
    <div className="space-y-2">
      <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 px-3 py-1 text-sm text-primary">
        <Sparkles className={`h-4 w-4 ${isGeneratingPrompt ? 'animate-pulse' : ''}`} />
        The more you share, the better the picks
      </div>
      <div className="space-y-3">
        <AnimatePresence mode="wait">
          <motion.p
            key={displayedCopy.titleEyebrow}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-[13px] font-semibold uppercase tracking-[0.14em] text-primary/70 sm:text-sm"
            style={{ fontFamily: '"Instrument Sans", sans-serif' }}
          >
            {displayedCopy.titleEyebrow}
          </motion.p>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {displayedCopy.titleQuestion ? (
            <motion.p
              key={displayedCopy.titleQuestion}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-2xl text-xl font-medium leading-8 text-[#8f4e2f] sm:text-[1.65rem]"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              {displayedCopy.titleQuestion}
            </motion.p>
          ) : null}
        </AnimatePresence>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">
          {helperCopy}
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
    ['Framing fields', requestTiming?.framingFields],
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
                className={`text-2xl font-medium tracking-tight text-primary transition-opacity duration-300 sm:text-4xl ${
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
                    className="h-16 w-full rounded-[28px] border border-stone-200 bg-white px-5 text-lg text-slate-900 outline-none transition placeholder:text-[15px] placeholder:text-slate-400 sm:placeholder:text-base focus:border-primary/50"
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
                  Just the product for now — budget, size, and other details come next.
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
                      Your answer
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
                    <div className="order-2 flex flex-col gap-1 sm:order-1">
                      <Button
                        type="button"
                        disabled={!hasDiscoveryResults || state.isFinalizing}
                        variant="outline"
                        className={`h-12 w-full rounded-[24px] border-stone-300 px-6 text-sm font-medium transition sm:w-auto ${
                          hasDiscoveryResults && !state.isFinalizing
                            ? 'bg-white text-slate-700 hover:border-stone-400 hover:bg-stone-50 hover:text-slate-900'
                            : 'text-slate-400'
                        }`}
                        onClick={onShowProductsNow}
                      >
                        Just show me results
                      </Button>
                      <p className="px-1 text-xs text-slate-400">
                        No AI refinement — results based on your search only.
                      </p>
                    </div>
                    <div className="order-1 flex flex-col gap-1 sm:order-2 sm:items-end">
                      <Button
                        type="button"
                        disabled={!hasDiscoveryResults || state.isFinalizing}
                        className="h-14 w-full rounded-[24px] bg-primary px-6 text-[15px] font-medium text-primary-foreground shadow-[0_18px_40px_-24px_rgba(37,99,235,0.7)] hover:bg-primary/90 sm:w-auto sm:min-w-[220px]"
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
                        Best results — takes ~5 more seconds
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </form>
        </section>

        <section className="w-full max-w-[1100px] space-y-4">
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
              className="scroll-mt-28"
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
      <AnimatePresence>
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
      </AnimatePresence>
    </>
  )
}
