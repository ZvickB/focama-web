import { useState } from 'react'
import { motion } from 'motion/react'
import {
  ChevronDown,
  Clock3,
  Sparkles,
} from 'lucide-react'

import ProductCard from '@/components/ProductCard.jsx'
import { RESULT_CARD_SLOTS } from '@/components/home/useGuidedSearch.js'
import { ResultSkeleton } from '@/components/home/ResultSkeleton.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Button } from '@/components/ui/button.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'

const RESULT_CARD_FADE_DELAYS_MS = [0, 260, 620, 1040, 1520, 2140]
const MotionDiv = motion.div

function handleRetryFeedbackKeyDown(event, { canSubmit, onSubmit }) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) {
    return
  }

  event.preventDefault()

  if (canSubmit) {
    onSubmit()
  }
}

export function ResultsSection({
  displayedResults,
  errorMessage,
  hasFinalResults,
  hasLoadedSuggestionAtTop,
  hasStartedSearch,
  isFinalizing,
  isLoading,
  isRetryReady,
  isRetrying,
  isGeneratingRetryAdvice,
  onJumpToSearchForm,
  onRetailerClick,
  onSelectProduct,
  onRetryAdviceRequest,
  onRetryFeedbackChange,
  previousResults = [],
  retryAdvice,
  selectionState,
  retryFeedback,
  showFinalResultBadges,
  showPreviewResults,
  suggestedRetryQuery,
  submittedQuery,
}) {
  const [showRetryView, setShowRetryView] = useState(false)
  const isRetryViewVisible = hasFinalResults && showRetryView

  const shouldShowBadgeLabels = !hasFinalResults || showFinalResultBadges
  const orderedResults = displayedResults
  const hasExplicitBadges = shouldShowBadgeLabels && displayedResults.some((item) => item.badgeLabel)
  const hasDisplayedResults = orderedResults.length > 0
  const shouldShowResultsIntro = !hasDisplayedResults || hasFinalResults
  const orderedPreviousResults = previousResults

  return (
    <section className="space-y-5">
      {!hasStartedSearch || !shouldShowResultsIntro ? null : (
        <div className="space-y-3">
          <Badge
            variant="outline"
            className="w-fit rounded-full border-[#e6d8c5] bg-[linear-gradient(180deg,rgba(250,245,239,0.98),rgba(255,255,255,0.96))] px-3 py-1 text-[#80573f]"
          >
            Results
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {isLoading && !hasFinalResults
              ? 'Shortlist in progress'
              : hasStartedSearch
                ? `Focused picks for "${submittedQuery}"`
                : 'A calmer shortlist starts here'}
          </h2>
          <p className="max-w-3xl text-base leading-7 text-slate-600">
            {hasFinalResults
              ? 'Six picks, chosen around what you told us.'
              : hasStartedSearch
                ? 'The shortlist is being built below while the AI helps narrow what matters.'
                : 'Search to see a calmer shortlist with clear tradeoffs instead of a noisy marketplace wall.'}
          </p>
        </div>
      )}

      {errorMessage ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {isLoading && displayedResults.length === 0 ? (
        <div className="space-y-4">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-full border border-[#e7dac8] bg-[linear-gradient(180deg,rgba(250,246,240,0.96),rgba(255,255,255,0.96))] px-4 py-2.5 text-sm text-[#6f5a47] shadow-[0_16px_42px_-34px_rgba(120,87,63,0.32)]"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 rounded-full bg-primary/25 animate-soft-pulse" />
              <span className="relative mt-[1px] h-2.5 w-2.5 rounded-full bg-primary/70" />
            </span>
            <span>Starting your search and getting the first options ready...</span>
          </div>

          <div>
            <div className="mobile-landscape-results-grid mx-auto grid max-w-6xl grid-cols-1 gap-3 sm:gap-5 xl:grid-cols-3">
              {RESULT_CARD_SLOTS.map((index) => (
                <div key={index}>
                  <ResultSkeleton />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {!hasFinalResults && !showPreviewResults && hasStartedSearch && !errorMessage && !isLoading ? (
        <div className="rounded-[28px] border border-dashed border-[#e6d8c5] bg-[linear-gradient(180deg,rgba(250,246,240,0.78),rgba(255,255,255,0.92))] px-6 py-12 text-center shadow-[0_24px_70px_-58px_rgba(120,87,63,0.3)] sm:px-8">
          <div className="mx-auto max-w-xl space-y-3">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <p className="text-lg font-medium text-slate-900">
              Your shortlist is taking shape.
            </p>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              Add a little context for a more focused set of picks, or skip ahead to see products
              now.
            </p>
          </div>
        </div>
      ) : null}

      {isFinalizing && hasDisplayedResults && !hasFinalResults ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-[24px] border border-[#e7dac8] bg-[linear-gradient(180deg,rgba(250,246,240,0.94),rgba(255,255,255,0.96))] px-4 py-4 text-left text-slate-600 shadow-[0_22px_60px_-42px_rgba(120,87,63,0.28)] transition-all duration-300 sm:px-5"
        >
          <div className="flex items-start gap-3">
            <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inset-0 rounded-full bg-primary/25 animate-soft-pulse" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-primary/70" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">Taking a closer look at these options.</p>
              <p className="text-sm leading-6 text-slate-600">
                We&apos;re narrowing things down and locking the shortlist.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {hasDisplayedResults ? (
        <div className="space-y-4">
          <div
            className={`relative overflow-hidden rounded-[30px] transition-all duration-500 ${
              isFinalizing && !hasFinalResults
                ? 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.96),rgba(250,247,242,0.82)_44%,rgba(244,238,231,0.64)_100%)] p-2 sm:p-3'
                : ''
            }`}
          >
            {isFinalizing && !hasFinalResults ? (
              <>
                <div className="pointer-events-none absolute inset-0 bg-white/22 backdrop-blur-[1.5px]" />
                <div className="pointer-events-none absolute inset-y-3 left-[-35%] w-[45%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/55 to-transparent animate-shimmer" />
              </>
            ) : null}

            <div
              className={`mobile-landscape-results-grid mx-auto grid max-w-6xl grid-cols-1 gap-3 transition-all duration-300 sm:gap-5 xl:grid-cols-3 ${
                isFinalizing && !hasFinalResults ? 'scale-[0.995] opacity-80' : 'opacity-100'
              }`}
            >
              {orderedResults.map((item, index) => {
                const visibleItem = {
                  ...item,
                  badgeLabel:
                    shouldShowBadgeLabels
                      ? item.badgeLabel || (!hasExplicitBadges && index === 0 ? 'Best match' : '')
                      : '',
                }

                return (
                  <MotionDiv
                    key={item.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.9,
                      delay: (RESULT_CARD_FADE_DELAYS_MS[index] ?? index * 900) / 1000,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <ProductCard
                      {...visibleItem}
                      onRetailerClick={() =>
                        onRetailerClick(visibleItem, {
                          position: index,
                          resultSet: hasFinalResults ? 'final' : 'preview',
                        })
                      }
                      onSelect={() =>
                        onSelectProduct(visibleItem, {
                          position: index,
                          resultSet: hasFinalResults ? 'final' : 'preview',
                        })
                      }
                    />
                  </MotionDiv>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {orderedPreviousResults.length > 0 ? (
        <details className="group rounded-[28px] border border-[#e7dac8] bg-[linear-gradient(180deg,rgba(250,246,240,0.84),rgba(255,255,255,0.94))] px-5 py-4 shadow-[0_24px_70px_-58px_rgba(120,87,63,0.24)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">Previous picks</p>
              <p className="text-sm leading-6 text-slate-600">
                These were the picks you rejected before the latest retry.
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="mobile-landscape-results-grid mt-4 grid max-w-6xl grid-cols-1 gap-3 sm:gap-5 xl:grid-cols-3">
            {orderedPreviousResults.map((item, index) => (
              <div key={`previous-${item.id}`}>
                <ProductCard
                  {...item}
                  onRetailerClick={() =>
                    onRetailerClick(item, {
                      position: index,
                      resultSet: 'previous',
                    })
                  }
                  onSelect={() =>
                    onSelectProduct(item, {
                      position: index,
                      resultSet: 'previous',
                    })
                  }
                />
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {selectionState?.mode === 'retry_exhausted' ? (
        <div className="rounded-[28px] border border-dashed border-[#e6d8c5] bg-[linear-gradient(180deg,rgba(250,246,240,0.78),rgba(255,255,255,0.92))] px-6 py-8 text-center shadow-[0_24px_70px_-58px_rgba(120,87,63,0.3)] sm:px-8">
          <div className="mx-auto max-w-xl space-y-3">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
              <Clock3 className="h-4 w-4 text-slate-500" />
            </div>
            <p className="text-lg font-medium text-slate-900">Nothing new came up from that feedback.</p>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              Try a different search direction.
            </p>
          </div>
        </div>
      ) : null}

      {hasFinalResults && !isRetryViewVisible ? (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full border-[#dcccc0] bg-white/94 px-6 text-sm text-slate-600 shadow-[0_16px_38px_-30px_rgba(120,87,63,0.26)] hover:border-[#cbb9a3] hover:bg-[#fdfaf6] hover:text-slate-900"
            onClick={() => setShowRetryView(true)}
          >
            Not quite what you needed?
          </Button>
        </div>
      ) : null}

      {isRetryViewVisible ? (
        <div className="rounded-[36px] border border-[#e7dac8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,246,240,0.9))] p-5 shadow-[0_28px_120px_-72px_rgba(120,87,63,0.3)]">
          <button
            type="button"
            className="mb-5 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
            onClick={() => setShowRetryView(false)}
          >
            <span aria-hidden="true">←</span> Back to results
          </button>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e6d8c5] bg-[linear-gradient(180deg,rgba(250,245,239,0.98),rgba(255,255,255,0.96))] px-3 py-1 text-sm text-[#80573f] shadow-[0_10px_30px_-24px_rgba(120,87,63,0.5)]">
              <Sparkles className="h-4 w-4" />
              Let&apos;s find a better direction
            </div>
            <p className="text-xl font-medium text-slate-900">
              What felt off about these picks?
            </p>
            <p className="text-sm leading-6 text-slate-600">
              Too expensive, wrong style, not the right category — anything helps.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-[30px] border border-[#e5dacb] bg-white p-1 shadow-[0_22px_60px_-42px_rgba(120,87,63,0.22)]">
              <Textarea
                id="results-retry-feedback"
                value={retryFeedback}
                onChange={(event) => onRetryFeedbackChange(event.target.value)}
                onKeyDown={(event) =>
                  handleRetryFeedbackKeyDown(event, {
                    canSubmit:
                      isRetryReady &&
                      !isRetrying &&
                      !isGeneratingRetryAdvice &&
                      Boolean(retryFeedback.trim()),
                    onSubmit: onRetryAdviceRequest,
                  })
                }
                disabled={!isRetryReady || isRetrying || isGeneratingRetryAdvice}
                className="min-h-32 resize-none rounded-[28px] border-0 bg-transparent px-5 py-4 text-base leading-7 shadow-none placeholder:text-slate-400 focus-visible:ring-0"
                placeholder="e.g. too expensive, wrong color, I wanted something more minimalist..."
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!isRetryReady || isRetrying || isGeneratingRetryAdvice || !retryFeedback.trim()}
                className="h-12 rounded-[24px] bg-primary px-6 text-sm text-primary-foreground shadow-[0_22px_48px_-26px_rgba(15,97,117,0.42)] hover:bg-primary/90"
                onClick={onRetryAdviceRequest}
              >
                {isGeneratingRetryAdvice ? 'Finding a better search...' : 'Get a suggestion'}
              </Button>
            </div>

            {retryAdvice ? (
              <div className="space-y-3 rounded-[24px] border border-[#e7dac8] bg-[linear-gradient(180deg,rgba(250,246,240,0.96),rgba(255,255,255,0.96))] p-4 shadow-[0_18px_42px_-32px_rgba(120,87,63,0.28)]">
                <div className="space-y-2">
                  {retryAdvice.rationale ? (
                    <p className="text-sm leading-6 text-slate-700">
                      {retryAdvice.rationale}
                    </p>
                  ) : null}
                  {suggestedRetryQuery.trim() ? (
                    <button
                      type="button"
                      className="text-sm text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline"
                      onClick={onJumpToSearchForm}
                    >
                      {hasLoadedSuggestionAtTop ? 'Go to search form' : 'View suggested search'}
                    </button>
                  ) : (
                    <p className="text-sm leading-6 text-slate-600">
                      We couldn&apos;t load a suggestion above yet. Try asking again in a moment.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!hasStartedSearch && !errorMessage ? null : !isLoading && displayedResults.length === 0 && !errorMessage ? (
        <div className="rounded-[28px] border border-dashed border-[#e6d8c5] bg-[linear-gradient(180deg,rgba(250,246,240,0.78),rgba(255,255,255,0.92))] px-6 py-12 text-center shadow-[0_24px_70px_-58px_rgba(120,87,63,0.3)] sm:px-8">
          <div className="mx-auto max-w-xl space-y-3">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
              <Clock3 className="h-4 w-4 text-slate-500" />
            </div>
            <p className="text-lg font-medium text-slate-900">We couldn&apos;t build a strong shortlist yet.</p>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              Try a more specific search or add more context so Focamai can narrow the best options.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default ResultsSection
