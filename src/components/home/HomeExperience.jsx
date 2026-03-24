import { useEffect, useRef } from 'react'
import { LoaderCircle, Search, Sparkles } from 'lucide-react'

import wordmark from '@/assets/wordmark.PNG'
import { ProductDetailModal, ResultsSection, ResultSkeleton } from '@/components/home/HomeShared.jsx'
import { RESULT_CARD_SLOTS, useGuidedSearch } from '@/components/home/useGuidedSearch.js'
import { Button } from '@/components/ui/button.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'

function handleRefinementTextareaKeyDown(event, { canSubmit, onSubmit }) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) {
    return
  }

  event.preventDefault()

  if (canSubmit) {
    onSubmit()
  }
}

function OpenLayout(props) {
  const refinementRef = useRef(null)
  const resultsViewportRef = useRef(null)
  const lastRefinementScrollQueryRef = useRef('')
  const lastResultsScrollQueryRef = useRef('')
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
    setFollowUpNotes,
    setProductQuery,
    showPreviewResults,
    state,
    submittedQuery,
  } = props

  useEffect(() => {
    if (
      hasStartedSearch &&
      refinementRef.current &&
      typeof refinementRef.current.scrollIntoView === 'function'
    ) {
      refinementRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [hasStartedSearch])

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

      const absoluteTop = window.scrollY + refinementElement.getBoundingClientRect().top
      const targetTop = Math.max(0, absoluteTop - 96)

      window.scrollTo({
        top: targetTop,
        behavior: 'smooth',
      })
      lastRefinementScrollQueryRef.current = submittedQuery
    }, 220)

    return () => {
      window.clearTimeout(scrollTimer)
    }
  }, [hasStartedSearch, submittedQuery])

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

      const absoluteTop = window.scrollY + resultsElement.getBoundingClientRect().top
      const targetTop = Math.max(0, absoluteTop - 96)

      window.scrollTo({
        top: targetTop,
        behavior: 'smooth',
      })
      lastResultsScrollQueryRef.current = submittedQuery
    }, 180)

    return () => {
      window.clearTimeout(scrollTimer)
    }
  }, [hasFinalResults, submittedQuery])

  const hasDiscoveryResults = Boolean(state.candidatePool)

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
              <h2 className="text-2xl font-medium tracking-tight text-slate-900 sm:text-4xl">
                What are you looking for today?
              </h2>
            </div>
          </div>

          <form className="flex justify-center" onSubmit={state.beginGuidedSearch}>
            <div
              ref={refinementRef}
              className={`w-full max-w-3xl rounded-[36px] border p-4 text-left shadow-[0_28px_120px_-72px_rgba(15,23,42,0.45)] backdrop-blur transition-all duration-300 sm:p-5 ${
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
                  type="submit"
                  disabled={isLoading}
                  className="h-16 rounded-[28px] bg-primary px-6 text-base text-primary-foreground hover:bg-primary/90"
                >
                  {isLoading ? 'Starting your search...' : 'Start search'}
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
                      {prompt?.prompt || `What should we optimize for with this ${submittedQuery}?`}
                    </p>
                    <p className="max-w-2xl text-sm leading-7 text-slate-600">
                      {prompt?.helperText ||
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
                        prompt?.followUpPlaceholder ||
                        'Examples: for a 6 year old, under $200, small apartment, should feel premium, or easy to clean.'
                      }
                      disabled={state.isFinalizing}
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-end">
                    <Button
                      type="button"
                      disabled={!hasDiscoveryResults || state.isFinalizing}
                      className="h-13 rounded-[24px] bg-primary px-5 text-base text-primary-foreground hover:bg-primary/90"
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
                        className={`h-13 rounded-[24px] px-5 text-base transition ${
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
          {isLoading && displayedResults.length === 0 ? (
            <div ref={resultsViewportRef} className="max-h-[360px] overflow-hidden">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {RESULT_CARD_SLOTS.map((index) => (
                  <ResultSkeleton key={index} className="opacity-95" />
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={resultsViewportRef}
              className="rounded-[32px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.28)] backdrop-blur sm:p-6"
            >
              <ResultsSection
                displayedResults={displayedResults}
                errorMessage={errorMessage}
                hasFinalResults={hasFinalResults}
                hasStartedSearch={hasStartedSearch}
                isLoading={isLoading}
                onSelectProduct={onSelectProduct}
                showPreviewResults={showPreviewResults}
                submittedQuery={submittedQuery}
                variant="open"
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
