import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  ChevronDown,
  Check,
  Clock3,
  Copy,
  LayoutGrid,
  LayoutList,
  Plus,
  RotateCcw,
  ShieldQuestion,
  Sparkles,
} from 'lucide-react'

import ProductCard from '@/components/ProductCard.jsx'
import { FinalizeLoadingState } from '@/components/home/FinalizeLoadingState.jsx'
import { RESULT_CARD_SLOTS } from '@/components/home/useGuidedSearch.js'
import {
  handleRetryFeedbackKeyDown,
} from '@/components/home/results-helpers.js'
import {
  RankedPickRow,
  SelectedResultPanel,
} from '@/components/home/results-components.jsx'
import { ResultSkeleton } from '@/components/home/ResultSkeleton.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Button } from '@/components/ui/button.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import { getRetailerDisplayName } from '@/lib/retailerLabel.js'
import {
  RANKING_PREFERENCE_ACTIVE_LABELS,
  isActiveRankingPreference,
  normalizeRankingPreference,
} from '../../../shared/ranking-preference.js'
import { validateSuggestedSearchQuery } from '../../../shared/search-input.js'

const RESULT_CARD_FADE_DELAYS_MS = [0, 260, 620, 1040, 1520, 2140]
const FILTER_VPN_CHOICES = [
  { label: 'None', value: 'none' },
  { label: 'Techloq', value: 'techloq' },
  { label: 'MB Smart', value: 'mb_smart' },
  { label: 'Other filter/VPN', value: 'other_filter_vpn' },
  { label: 'Not sure', value: 'not_sure' },
]
const MotionDiv = motion.div
const PREFERENCE_HINT_DISMISSED_KEY = 'focamai:ranking-preference-hint-dismissed'
const INLINE_IMPROVE_PICKS = import.meta.env.VITE_INLINE_IMPROVE_PICKS !== 'false'

function readPreferenceHintDismissed() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(PREFERENCE_HINT_DISMISSED_KEY) === 'true'
}

function ImprovePicksEndcap({
  improvePicksSuggestions,
  isGeneratingRetryAdvice,
  isRetryReady,
  isRetrying,
  onRetryAdviceRequest,
  onRetryFeedbackChange,
  retryFeedback,
  showRetryView,
  setShowRetryView,
  standalone = false,
}) {
  const canRequestRetryAdvice = Boolean(retryFeedback.trim())
  const isBusy = isGeneratingRetryAdvice || isRetrying
  const collapsedTitle = standalone ? 'Improve these picks' : 'Not quite right?'

  function handleSubmit() {
    onRetryAdviceRequest({ rejectionFeedback: retryFeedback.trim() })
  }

  function handleSuggestionSelect(suggestion) {
    const feedback = String(suggestion?.feedback || '').trim()
    if (feedback) onRetryFeedbackChange(feedback)
  }

  return (
    <section
      data-testid="improve-picks-endcap"
      className={standalone
        ? 'rounded-[28px] border border-[#e7dac8] bg-white/94 p-5 shadow-[0_24px_64px_-50px_rgba(120,87,63,0.22)]'
        : 'pt-1'}
    >
      <button
        type="button"
        aria-expanded={showRetryView}
        aria-label="Improve picks"
        disabled={isBusy}
        className={standalone
          ? 'group flex w-full items-center gap-3 text-left disabled:cursor-default'
          : 'group inline-flex items-center gap-2 rounded-lg py-1 text-left text-sm text-slate-600 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-default'}
        onClick={() => setShowRetryView((isVisible) => !isVisible)}
      >
        {standalone ? (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5dacb] bg-[#fbf7f1] text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-medium text-slate-900">{collapsedTitle}</span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">
                Tell us what should change and Focamai will update the search direction.
              </span>
            </span>
          </>
        ) : (
          <span>
            <span className="font-medium text-slate-900">Not quite right?</span>{' '}
            <span className="font-medium group-hover:underline group-hover:underline-offset-4">Tell me what to change.</span>
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
            showRetryView ? 'rotate-180' : ''
          }`}
        />
      </button>

      {showRetryView ? (
        <div className={standalone ? 'mt-4 rounded-[22px] bg-[#fbf7f1] p-4 sm:p-5' : 'mt-5 border-t border-[#e7dac8] pt-5'}>
          {isBusy ? (
            <div role="status" className="text-sm leading-6 text-slate-600">
              <p className="font-medium text-slate-900">Updating your picks…</p>
              <p className="mt-1">Preparing a sharper search based on what should change.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-base font-medium text-slate-900">How can I improve these recommendations?</p>
              </div>
              {improvePicksSuggestions.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {improvePicksSuggestions.map((suggestion) => {
                      const feedback = String(suggestion?.feedback || '').trim()
                      const label = String(suggestion?.label || '').trim()
                      const isSelected = feedback && feedback === retryFeedback.trim()
                      if (!label || !feedback) return null

                      return (
                        <button
                          key={`${label}:${feedback}`}
                          type="button"
                          aria-pressed={isSelected}
                          className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-[#e5dacb] bg-white text-slate-700 hover:border-primary/45 hover:text-primary'
                          }`}
                          onClick={() => handleSuggestionSelect(suggestion)}
                        >
                          {label}
                          <Plus className="ml-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                <p className="text-sm text-slate-600">Or describe what you&apos;d like changed</p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <Textarea
                    id="results-retry-feedback"
                    aria-label="What should we change?"
                    value={retryFeedback}
                    onChange={(event) => onRetryFeedbackChange(event.target.value)}
                    onKeyDown={(event) =>
                      handleRetryFeedbackKeyDown(event, {
                        canSubmit: isRetryReady && canRequestRetryAdvice,
                        onSubmit: handleSubmit,
                      })
                    }
                    disabled={!isRetryReady}
                    className="min-h-24 flex-1 resize-none rounded-[18px] border-[#e5dacb] bg-white px-4 py-3 text-base leading-7 placeholder:text-slate-400"
                    placeholder="e.g., needs to be waterproof and under $100"
                  />
                  <Button
                    type="button"
                    disabled={!isRetryReady || !canRequestRetryAdvice}
                    className="h-11 shrink-0 rounded-[18px] bg-primary px-5 text-sm text-primary-foreground shadow-[0_16px_36px_-26px_rgba(15,97,117,0.34)] hover:bg-primary/90"
                    onClick={handleSubmit}
                  >
                    Update my picks
                  </Button>
                </div>
                <p className="text-xs leading-5 text-slate-500">Tip: Be as specific as you can for the best results.</p>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

export function ResultsSection({
  candidateRecovery,
  displayedResults,
  diagnostics,
  errorMessage,
  hasFinalResults,
  hasStartedSearch,
  improvePicksSuggestions = [],
  isEnrichmentSettled = false,
  isFinalizing,
  isLoading,
  isRetryReady,
  isRetrying,
  isGeneratingRetryAdvice,
  onRetailerClick,
  onSelectProduct,
  onFailureRetry = () => {},
  onFindBetterMatches = () => {},
  onKeepCandidateRecovery = () => {},
  onRetryAdviceRequest,
  onRetryFeedbackChange,
  onRedoBalanced,
  previousResults = [],
  rankingPreference = 'balanced',
  selectionState,
  retryFeedback,
  showFinalResultBadges,
  showPreviewResults,
  submittedQuery,
}) {
  const { selectedAmazonDomain, resolvedAmazonDomain } = useAmazonStore()
  const [showRetryView, setShowRetryView] = useState(false)
  const [dismissedCandidateRecoveryKey, setDismissedCandidateRecoveryKey] = useState('')
  const [cardView, setCardView] = useState('new')
  const [hasCopiedDebugInfo, setHasCopiedDebugInfo] = useState(false)
  const [activeResultSelection, setActiveResultSelection] = useState({ index: 0, resultsIdentity: '' })
  const [isPreferenceHintDismissed, setIsPreferenceHintDismissed] = useState(readPreferenceHintDismissed)
  const resultRowsScrollRef = useRef(null)
  const normalizedRankingPreference = normalizeRankingPreference(rankingPreference)
  const hasActiveRankingPreference = hasFinalResults && isActiveRankingPreference(normalizedRankingPreference)
  const activeRankingLabel = RANKING_PREFERENCE_ACTIVE_LABELS[normalizedRankingPreference]
  const shouldShowPreferenceHint =
    hasFinalResults && !hasActiveRankingPreference && !isPreferenceHintDismissed

  const shouldShowBadgeLabels = !hasFinalResults || showFinalResultBadges
  const orderedResults = displayedResults
  const hasExplicitBadges = shouldShowBadgeLabels && displayedResults.some((item) => item.badgeLabel)
  const hasDisplayedResults = orderedResults.length > 0
  const orderedResultsIdentity = orderedResults.map((item) => String(item.id || item.title || '')).join('|')
  const activeResultIndex =
    activeResultSelection.resultsIdentity === orderedResultsIdentity
      ? activeResultSelection.index
      : 0
  const orderedVisibleResults = orderedResults.map((item, index) => ({
    ...item,
    badgeLabel:
      shouldShowBadgeLabels
        ? item.badgeLabel || (!hasExplicitBadges && index === 0 ? 'Best match' : '')
        : '',
  }))
  const activeResult =
    orderedVisibleResults.length > 0
      ? orderedVisibleResults[Math.min(activeResultIndex, orderedVisibleResults.length - 1)]
      : null
  const activeResultSet = hasFinalResults ? 'final' : 'preview'
  const shouldShowResultsIntro = !hasDisplayedResults || hasFinalResults
  const orderedPreviousResults = previousResults
  const recoverySuggestion = validateSuggestedSearchQuery(String(candidateRecovery?.suggestedQuery || '').trim())
  const recoverySuggestedQuery = recoverySuggestion.isValid ? recoverySuggestion.normalizedQuery : ''
  const candidateRecoveryKey = `${submittedQuery}:${recoverySuggestedQuery}`
  const shouldShowCandidateRecovery =
    hasFinalResults && recoverySuggestedQuery && dismissedCandidateRecoveryKey !== candidateRecoveryKey

  function getItemRetailerLabel(item) {
    return getRetailerDisplayName({
      subtitle: item?.subtitle,
      selectedAmazonDomain,
      resolvedAmazonDomain,
    })
  }

  useEffect(() => {
    if (resultRowsScrollRef.current) {
      resultRowsScrollRef.current.scrollTop = 0
    }
  }, [orderedResultsIdentity])

  function selectActiveResult(index) {
    setActiveResultSelection({ index, resultsIdentity: orderedResultsIdentity })
  }

  function handleResultsListScroll(event) {
    const scrollContainer = event.currentTarget
    const containerTop = scrollContainer.getBoundingClientRect().top
    const rows = Array.from(scrollContainer.querySelectorAll('[data-result-row-index]'))
      .map((row) => ({
        index: Number(row.getAttribute('data-result-row-index')),
        rect: row.getBoundingClientRect(),
      }))
      .filter((row) => Number.isFinite(row.index))

    const topVisibleRow = rows.find((row) => row.rect.bottom > containerTop + 8) || rows[0]

    if (topVisibleRow) {
      selectActiveResult(topVisibleRow.index)
    }
  }

  async function handleCopyDebugInfo() {
    const copied = await diagnostics?.copyDebugInfo?.()
    setHasCopiedDebugInfo(Boolean(copied))

    if (copied) {
      window.setTimeout(() => setHasCopiedDebugInfo(false), 2200)
    }
  }

  function dismissPreferenceHint() {
    setIsPreferenceHintDismissed(true)
    window.localStorage.setItem(PREFERENCE_HINT_DISMISSED_KEY, 'true')
  }

  function openPreferences() {
    dismissPreferenceHint()
    window.dispatchEvent(new CustomEvent('focamai:open-preferences'))
  }

  return (
    <section className="space-y-5">
      {!hasStartedSearch || !shouldShowResultsIntro ? null : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="w-fit rounded-full border-[#e6d8c5] bg-white/90 px-3 py-1 text-[#80573f]"
            >
              Results
            </Badge>
            {hasDisplayedResults ? (
              <button
                type="button"
                onClick={() => setCardView((v) => (v === 'new' ? 'old' : 'new'))}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-white/80 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"
                title="Toggle results view (dev only)"
              >
                {cardView === 'new' ? (
                  <><LayoutGrid className="h-3 w-3" /> Grid view</>
                ) : (
                  <><LayoutList className="h-3 w-3" /> Rows view</>
                )}
              </button>
            ) : null}
          </div>
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
          {hasActiveRankingPreference ? (
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-primary/15 bg-[#eef7f6] px-3 py-1.5 text-xs font-medium text-primary">
              <span>{activeRankingLabel}</span>
              <button
                type="button"
                onClick={onRedoBalanced}
                className="rounded-full px-1 text-primary/70 underline underline-offset-2 transition hover:text-primary"
              >
                Show balanced picks
              </button>
            </div>
          ) : null}
          {shouldShowPreferenceHint ? (
            <div className="flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-white/86 px-3.5 py-2.5 text-sm text-slate-500 shadow-[0_16px_40px_-34px_rgba(15,23,42,0.22)]">
              <span>You can tell Focamai to always prioritize price, brands, or a wider range.</span>
              <button
                type="button"
                onClick={openPreferences}
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                Set preferences
              </button>
              <button
                type="button"
                aria-label="Dismiss preference tip"
                onClick={dismissPreferenceHint}
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-stone-100 hover:text-slate-700"
              >
                <ChevronDown className="h-4 w-4 rotate-45" />
              </button>
            </div>
          ) : null}
        </div>
      )}

      {errorMessage && !diagnostics?.failure ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {errorMessage}
        </div>
      ) : null}

      {errorMessage && diagnostics?.failure ? (
        <div className="space-y-4 rounded-[28px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 shadow-[0_18px_46px_-34px_rgba(180,83,9,0.22)] sm:px-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-700">
              <ShieldQuestion className="h-4 w-4" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-amber-950">We couldn’t finish that search.</p>
              <p className="leading-6 text-amber-900/85">
                This is usually temporary. We kept what you entered, so you can safely try again.
              </p>
            </div>
          </div>

          <Button
            type="button"
            className="h-11 rounded-full bg-amber-950 px-5 text-white hover:bg-amber-900"
            onClick={onFailureRetry}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>

          <details className="rounded-2xl border border-amber-200/80 bg-white/70 p-3">
            <summary className="cursor-pointer text-xs font-medium text-amber-950">
              Troubleshooting details
            </summary>
            <div className="mt-3 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-amber-900/80">
                  We logged this automatically. Support code:{' '}
                  <span className="font-mono font-semibold break-all text-amber-950">
                    {diagnostics?.failure?.searchId || 'not available'}
                  </span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 rounded-full border-amber-200 bg-white px-4 text-xs text-amber-950 hover:bg-amber-50"
                  disabled={!diagnostics?.failure}
                  onClick={handleCopyDebugInfo}
                >
                  {hasCopiedDebugInfo ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {hasCopiedDebugInfo ? 'Copied' : 'Copy report'}
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-amber-900/70">
                  Are you using a filter or VPN?
                </p>
                <div className="flex flex-wrap gap-2">
                  {FILTER_VPN_CHOICES.map((choice) => {
                    const isSelected = diagnostics?.failure?.reportedFilterType === choice.value

                    return (
                      <button
                        key={choice.value}
                        type="button"
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          isSelected
                            ? 'border-amber-300 bg-amber-100 text-amber-950'
                            : 'border-amber-100 bg-white/82 text-amber-900 hover:border-amber-200 hover:bg-amber-50'
                        }`}
                        onClick={() => diagnostics?.setReportedFilterType?.(choice.value)}
                      >
                        {choice.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </details>
        </div>
      ) : null}

      {isLoading && displayedResults.length === 0 ? (
        <div className="space-y-4">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-full border border-[#e7dac8] bg-white/90 px-4 py-2.5 text-sm text-[#6f5a47] shadow-[0_12px_32px_-26px_rgba(120,87,63,0.22)]"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 rounded-full bg-primary/25 animate-soft-pulse" />
              <span className="relative mt-[1px] h-2.5 w-2.5 rounded-full bg-primary/70" />
            </span>
            <span>Starting your search and getting the first options ready...</span>
          </div>

          <div>
            <div className="mobile-landscape-results-grid mx-auto grid max-w-6xl grid-cols-1 gap-3 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
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
        <div className="rounded-2xl border border-dashed border-[#e6d8c5] bg-white/82 px-6 py-12 text-center shadow-[0_14px_38px_-32px_rgba(120,87,63,0.18)] sm:px-8">
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
        <FinalizeLoadingState
          compact
          rankingPreference={normalizedRankingPreference}
          submittedQuery={submittedQuery}
        />
      ) : null}

      {hasDisplayedResults ? (
        <div className="space-y-4">
          <div
            className={`relative rounded-[30px] transition-all duration-500 ${
              isFinalizing && !hasFinalResults
                ? 'overflow-hidden bg-[#fbf7f1] p-2 sm:p-3'
                : 'overflow-visible'
            }`}
          >
            {isFinalizing && !hasFinalResults ? (
              <>
                <div className="pointer-events-none absolute inset-0 bg-white/22 backdrop-blur-[1.5px]" />
                <div className="pointer-events-none absolute inset-y-3 left-[-35%] w-[45%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/55 to-transparent animate-shimmer" />
              </>
            ) : null}

            <div
              className={`mx-auto transition-all duration-300 ${
                cardView === 'new'
                  ? 'max-w-6xl'
                  : 'mobile-landscape-results-grid grid max-w-6xl grid-cols-1 gap-3 sm:gap-5 md:grid-cols-2 xl:grid-cols-3'
              } ${isFinalizing && !hasFinalResults ? 'scale-[0.995] opacity-80' : 'opacity-100'}`}
            >
              {cardView === 'new' ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.25fr)] lg:items-start lg:gap-5">
                  <div className="lg:pt-0">
                    <SelectedResultPanel
                      hasFinalResults={hasFinalResults}
                      isEnrichmentSettled={isEnrichmentSettled}
                      item={activeResult}
                      onOpenDetails={() => {
                        if (!activeResult) return
                        onSelectProduct(activeResult, {
                          position: Math.min(activeResultIndex, orderedVisibleResults.length - 1),
                          resultSet: activeResultSet,
                        })
                      }}
                    />
                  </div>
                  <div
                    ref={resultRowsScrollRef}
                    className="grid grid-cols-1 gap-3 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pb-[min(30vh,16rem)] lg:pr-1 lg:pt-0 xl:max-h-[720px]"
                    onScroll={handleResultsListScroll}
                    style={{ scrollbarGutter: 'stable' }}
                  >
                    {orderedVisibleResults.map((visibleItem, index) => (
                      <MotionDiv
                        data-result-row-index={index}
                        key={visibleItem.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.9,
                          delay: (RESULT_CARD_FADE_DELAYS_MS[index] ?? index * 900) / 1000,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <RankedPickRow
                          hasFinalResults={hasFinalResults}
                          isActive={index === activeResultIndex}
                          isEnrichmentSettled={isEnrichmentSettled}
                          item={visibleItem}
                          onActivate={() => selectActiveResult(index)}
                          onOpenDetails={() =>
                            onSelectProduct(visibleItem, {
                              position: index,
                              resultSet: activeResultSet,
                            })
                          }
                          onRetailerClick={() =>
                            onRetailerClick(visibleItem, {
                              position: index,
                              resultSet: activeResultSet,
                            })
                          }
                          retailerLabel={getItemRetailerLabel(visibleItem)}
                        />
                      </MotionDiv>
                    ))}
                    {hasFinalResults && INLINE_IMPROVE_PICKS && !shouldShowCandidateRecovery ? (
                      <ImprovePicksEndcap
                        improvePicksSuggestions={improvePicksSuggestions}
                        isGeneratingRetryAdvice={isGeneratingRetryAdvice}
                        isRetryReady={isRetryReady}
                        isRetrying={isRetrying}
                        onRetryAdviceRequest={onRetryAdviceRequest}
                        onRetryFeedbackChange={onRetryFeedbackChange}
                        retryFeedback={retryFeedback}
                        setShowRetryView={setShowRetryView}
                        showRetryView={showRetryView}
                      />
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  {orderedVisibleResults.map((visibleItem, index) => (
                    <MotionDiv
                      key={visibleItem.id}
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
                        rating={visibleItem.rating || 0}
                        reviewCount={visibleItem.reviewCount || 0}
                        onSelect={() =>
                          onSelectProduct(visibleItem, {
                            position: index,
                            resultSet: activeResultSet,
                          })
                        }
                        onRetailerClick={() =>
                          onRetailerClick(visibleItem, {
                            position: index,
                            resultSet: activeResultSet,
                          })
                        }
                        retailerLabel={getItemRetailerLabel(visibleItem)}
                      />
                    </MotionDiv>
                  ))}
                  {hasFinalResults && INLINE_IMPROVE_PICKS && !shouldShowCandidateRecovery ? (
                    <div className="col-span-full">
                      <ImprovePicksEndcap
                        improvePicksSuggestions={improvePicksSuggestions}
                        isGeneratingRetryAdvice={isGeneratingRetryAdvice}
                        isRetryReady={isRetryReady}
                        isRetrying={isRetrying}
                        onRetryAdviceRequest={onRetryAdviceRequest}
                        onRetryFeedbackChange={onRetryFeedbackChange}
                        retryFeedback={retryFeedback}
                        setShowRetryView={setShowRetryView}
                        showRetryView={showRetryView}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {hasFinalResults ? (
        <>
          {shouldShowCandidateRecovery ? (
            <div className="rounded-[28px] border border-primary/20 bg-[#eef7f6] p-5 shadow-[0_24px_64px_-50px_rgba(15,97,117,0.28)]">
              <p className="text-lg font-medium text-slate-900">These are the strongest matches we found.</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                A more specific search may uncover better options for what you told us.
              </p>
              <div className="mt-4 rounded-[22px] border border-primary/15 bg-white/85 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Suggested search</p>
                <p className="mt-2 text-base font-semibold leading-6 text-primary">{recoverySuggestedQuery}</p>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="button" className="h-11 rounded-[18px] bg-primary px-5 text-primary-foreground hover:bg-primary/90" onClick={() => onFindBetterMatches(recoverySuggestedQuery)}>
                  Find better matches
                </Button>
                <button type="button" className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline" onClick={() => {
                  setDismissedCandidateRecoveryKey(candidateRecoveryKey)
                  onKeepCandidateRecovery()
                }}>
                  Keep these picks
                </button>
              </div>
            </div>
          ) : null}
        {!INLINE_IMPROVE_PICKS || !hasDisplayedResults || shouldShowCandidateRecovery ? (
          <ImprovePicksEndcap
            standalone
            improvePicksSuggestions={improvePicksSuggestions}
            isGeneratingRetryAdvice={isGeneratingRetryAdvice}
            isRetryReady={isRetryReady}
            isRetrying={isRetrying}
            onRetryAdviceRequest={onRetryAdviceRequest}
            onRetryFeedbackChange={onRetryFeedbackChange}
            retryFeedback={retryFeedback}
            setShowRetryView={setShowRetryView}
            showRetryView={showRetryView}
          />
        ) : null}
        </>
      ) : null}

      {orderedPreviousResults.length > 0 ? (
        <details className="group rounded-2xl border border-[#e7dac8] bg-white/88 px-5 py-4 shadow-[0_14px_38px_-32px_rgba(120,87,63,0.18)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">Previous picks</p>
              <p className="text-sm leading-6 text-slate-600">
                These were the picks you rejected before the latest retry.
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="mobile-landscape-results-grid mt-4 grid max-w-6xl grid-cols-1 gap-3 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
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
                  retailerLabel={getItemRetailerLabel(item)}
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
        <div className="rounded-2xl border border-dashed border-[#e6d8c5] bg-white/82 px-6 py-8 text-center shadow-[0_14px_38px_-32px_rgba(120,87,63,0.18)] sm:px-8">
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

      {!hasStartedSearch && !errorMessage ? null : !isLoading && displayedResults.length === 0 && !errorMessage ? (
        <div className="rounded-2xl border border-dashed border-[#e6d8c5] bg-white/82 px-6 py-12 text-center shadow-[0_14px_38px_-32px_rgba(120,87,63,0.18)] sm:px-8">
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
