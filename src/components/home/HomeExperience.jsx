import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { LoaderCircle, Search, Sparkles } from 'lucide-react'
import { MAX_PRODUCT_QUERY_LENGTH, MAX_DETAILS_LENGTH } from '../../../shared/search-input.js'

import wordmark from '@/assets/wordmark.PNG'
// import { FeedbackFab } from '@/components/home/FeedbackFab.jsx'
import {
  applyPlainBackgroundMode,
  buildRefinementCopy,
  clampFollowUpNotes,
  handleNewSearchClick,
  handleProductQueryTextareaKeyDown,
  handleRefinementTextareaKeyDown,
  scrollElementNearTop,
  shouldShowCharCounter,
  shouldShowTimingPanel,
  smoothScrollIntoView,
} from '@/components/home/home-helpers.js'
import {
  CharCounter,
  FlowProgress,
  FlowStageSummary,
  ProductDetailModalFallback,
  QuerySuggestionPrompt,
  RefinementChips,
  RefinementCopy,
  ResultsSectionFallback,
  TimingPanel,
} from '@/components/home/home-components.jsx'
import {
  useGuidedSearch,
} from '@/components/home/useGuidedSearch.js'
import { resolveAmazonDomainForRequest } from '@/components/home/guided-search/constants.js'
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
  const { actions, diagnostics, query, querySuggestion, results, retry, status } = guided
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

  const resetToNewSearchRef = useRef(actions.resetToNewSearch)

  useEffect(() => {
    resetToNewSearchRef.current = actions.resetToNewSearch
  }, [actions.resetToNewSearch])

  useEffect(() => {
    function handleNewSearch() {
      resetToNewSearchRef.current()
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.setTimeout(() => searchInputRef.current?.focus(), 400)
    }

    window.addEventListener('focamai:new-search', handleNewSearch)
    return () => window.removeEventListener('focamai:new-search', handleNewSearch)
  }, [])

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
                  diagnostics={diagnostics}
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

export function HomeExperience({ initialSearchFollowUp = '', initialSearchQuery = '' } = {}) {
  const guided = useGuidedSearch()
  const { actions, query, results, status } = guided
  const { beginGuidedSearch, trackRetailerClick } = actions
  const { productQuery, setFollowUpNotes, setProductQuery } = query
  const initialSearchQueryText = String(initialSearchQuery || '').trim()
  const initialSearchFollowUpText = String(initialSearchFollowUp || '').trim()
  const initialSearchRef = useRef({ followUp: '', query: '', status: 'idle' })
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

    initialSearchRef.current = {
      followUp: initialSearchFollowUpText,
      query: initialSearchQueryText,
      status: 'set-query',
    }
    setProductQuery(initialSearchQueryText)
    setFollowUpNotes(initialSearchFollowUpText)
  }, [initialSearchFollowUpText, initialSearchQueryText, setFollowUpNotes, setProductQuery])

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
      initialSearchRef.current = {
        followUp: initialSearchFollowUpText,
        query: initialSearchQueryText,
        status: 'started',
      }
      beginGuidedSearch({ preventDefault() {} })
    }, 0)

    return () => {
      window.clearTimeout(startTimer)
    }
  }, [
    beginGuidedSearch,
    status.hasStartedSearch,
    initialSearchFollowUpText,
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
            amazonDomain={resolveAmazonDomainForRequest(guided.marketplace.selectedAmazonDomain, guided.marketplace.resolvedAmazonDomain)}
            discoveryToken={results.discoveryToken}
            item={results.selectedProduct}
            isEnrichmentSettled={status.isEnrichmentSettled}
            searchQuery={query.submittedQuery}
            showRecommendationAnalysis={results.selectedProduct?.analyticsMeta?.resultSet !== 'preview'}
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
