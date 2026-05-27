import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  ArrowUpRight,
  ChevronDown,
  Clock3,
  LayoutGrid,
  LayoutList,
  RotateCcw,
  Sparkles,
} from 'lucide-react'

import ProductCard from '@/components/ProductCard.jsx'
import logo from '@/assets/logo_master_version.svg'
import { FinalizeLoadingState } from '@/components/home/FinalizeLoadingState.jsx'
import { getUserFacingDescription, getUserFacingReasons } from '@/components/home/homeContentUtils.js'
import { RESULT_CARD_SLOTS } from '@/components/home/useGuidedSearch.js'
import { ResultSkeleton } from '@/components/home/ResultSkeleton.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Button } from '@/components/ui/button.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'
import { formatDisplayPrice } from '@/lib/formatDisplayPrice.js'

const RESULT_CARD_FADE_DELAYS_MS = [0, 260, 620, 1040, 1520, 2140]
const RETRY_CORRECTION_CHIPS = [
  'Too expensive',
  'Wrong style',
  'Missing a must-have',
]
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

function getRatingValue(rating) {
  if (rating === null || rating === undefined || rating === '' || typeof rating === 'boolean') {
    return null
  }

  const ratingValue = Number(rating)

  return Number.isFinite(ratingValue) ? ratingValue : null
}

function getFeatureBullets(item) {
  return Array.isArray(item?.feature_bullets)
    ? item.feature_bullets.map((bullet) => String(bullet || '').trim()).filter(Boolean)
    : []
}

function getShortReason(item, { hasFinalResults, isEnrichmentSettled }) {
  const fitReason = String(item?.fit_reason || item?.fitReason || '').trim()
  const caveat = String(item?.caveat || '').trim()
  const primaryReason = getUserFacingReasons(item?.reasons || [])[0] || ''
  const description = getUserFacingDescription(item?.description)
  const featureBullets = getFeatureBullets(item)

  if (fitReason) return fitReason
  if (primaryReason) return primaryReason
  if (description) return description
  if (caveat) return caveat
  if (featureBullets[0]) return featureBullets[0]
  if (hasFinalResults && !isEnrichmentSettled) return 'Checking why this fits your search...'

  return hasFinalResults
    ? 'Open details for product facts and retailer info.'
    : 'A credible option from the first pass.'
}

function ProductImage({ className = '', image, title }) {
  const [imgError, setImgError] = useState(false)

  if (imgError || !image) {
    return (
      <div className={`flex items-center justify-center bg-stone-200/55 ${className}`}>
        <img
          src={logo}
          alt=""
          aria-hidden="true"
          className="h-12 w-12 object-contain opacity-[0.14]"
        />
      </div>
    )
  }

  return (
    <img
      src={image}
      alt={title}
      loading="lazy"
      decoding="async"
      className={`object-contain mix-blend-multiply ${className}`}
      onError={() => setImgError(true)}
    />
  )
}

function RankedPickRow({
  hasFinalResults,
  isActive,
  isEnrichmentSettled,
  item,
  onActivate,
  onOpenDetails,
  onRetailerClick,
}) {
  const displayPrice = formatDisplayPrice(item.price)
  const shortReason = getShortReason(item, { hasFinalResults, isEnrichmentSettled })

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-white/96 transition duration-200 hover:border-[#d8c9b6] hover:bg-white ${
        isActive
          ? 'border-primary/35 bg-[#fbf7f1] shadow-[0_18px_44px_-34px_rgba(15,97,117,0.28)]'
          : 'border-[#eadfce]'
      }`}
    >
      {isActive ? <div className="absolute bottom-0 left-0 top-0 w-1 bg-primary" /> : null}
      <button
        type="button"
        className="flex w-full gap-3 p-3 text-left sm:p-4"
        onClick={onOpenDetails}
        onFocus={onActivate}
        onMouseEnter={onActivate}
      >
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-[#eee5da] bg-[#fbf7f1]">
          <ProductImage className="h-full w-full rounded-xl" image={item.image} title={item.title} />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-900">{item.title}</p>
          <p className="line-clamp-2 text-sm leading-5 text-slate-600">{shortReason}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="font-semibold text-primary">{displayPrice}</span>
            <span>{getRatingValue(item.rating)?.toFixed(1) || 'No rating'}</span>
            {item.subtitle ? <span>{item.subtitle}</span> : null}
          </div>
        </div>
      </button>
      <div className="flex items-center justify-between border-t border-[#f0e7da] bg-[#fbf7f1]/70 px-4 py-2">
        <button
          type="button"
          className="text-xs font-semibold text-primary transition hover:text-primary/80"
          onClick={onOpenDetails}
        >
          View details
        </button>
        {item.link ? (
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-800"
            onClick={(event) => {
              event.stopPropagation()
              onRetailerClick?.()
            }}
          >
            Retailer
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  )
}

function SelectedResultPanel({ hasFinalResults, isEnrichmentSettled, item, onOpenDetails }) {
  if (!item) {
    return null
  }

  const displayPrice = formatDisplayPrice(item.price)
  const shortReason = getShortReason(item, {
    hasFinalResults,
    isEnrichmentSettled,
  })

  return (
    <button
      type="button"
      aria-label={`Open selected result details: ${item.title}`}
      className="group sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-hidden rounded-[28px] border border-[#e7dac8] bg-white/95 p-4 text-left shadow-[0_24px_68px_-54px_rgba(120,87,63,0.24)] transition hover:border-[#d8c9b6] lg:block"
      onClick={onOpenDetails}
    >
      <div className="aspect-square overflow-hidden rounded-[24px] border border-[#eee5da] bg-[#fbf7f1] p-4">
        <ProductImage
          className="h-full w-full rounded-[18px]"
          image={item.image}
          title={item.title}
        />
      </div>
      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <p className="line-clamp-3 text-lg font-semibold leading-6 text-slate-950">
            {item.title}
          </p>
          <p className="line-clamp-3 text-sm leading-6 text-slate-600">{shortReason}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#f0e7da] pt-3 text-sm">
          <span className="font-semibold text-primary">{displayPrice}</span>
          <span className="text-slate-500">{getRatingValue(item.rating)?.toFixed(1) || 'No rating'}</span>
          {item.subtitle ? <span className="text-slate-500">{item.subtitle}</span> : null}
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition group-hover:text-primary/80">
          View details
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  )
}

export function ResultsSection({
  displayedResults,
  errorMessage,
  hasFinalResults,
  hasStartedSearch,
  isEnrichmentSettled = false,
  isFinalizing,
  isLoading,
  isRetryReady,
  isRetrying,
  isGeneratingRetryAdvice,
  onRetailerClick,
  onSelectProduct,
  onRetryAdviceRequest,
  onRetryFeedbackChange,
  onRetrySearch = () => {},
  previousResults = [],
  retryAdvice,
  selectionState,
  retryFeedback,
  showFinalResultBadges,
  showPreviewResults,
  suggestedRetryQuery,
  submittedQuery,
}) {
  const retryViewRef = useRef(null)
  const [showRetryView, setShowRetryView] = useState(false)
  const [cardView, setCardView] = useState('new')
  const [editableSuggestedQuery, setEditableSuggestedQuery] = useState('')
  const [hasEditedSuggestedQuery, setHasEditedSuggestedQuery] = useState(false)
  const [retryViewQuery, setRetryViewQuery] = useState('')
  const [activeResultSelection, setActiveResultSelection] = useState({ index: 0, resultsIdentity: '' })
  const resultRowsScrollRef = useRef(null)
  const isRetryViewVisible = hasFinalResults && showRetryView && retryViewQuery === submittedQuery
  const normalizedSuggestedRetryQuery = suggestedRetryQuery.trim()
  const visibleSuggestedQuery = hasEditedSuggestedQuery
    ? editableSuggestedQuery
    : normalizedSuggestedRetryQuery

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
  const canRequestRetryAdvice = Boolean(retryFeedback.trim())

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

  function handleCorrectionChipClick(chipLabel) {
    const nextFeedback = retryFeedback.trim()
      ? `${retryFeedback.trim()}\n${chipLabel}`
      : `${chipLabel}\n`
    onRetryFeedbackChange(nextFeedback)
  }

  function handleRetryAdviceSubmit() {
    onRetryAdviceRequest({ rejectionFeedback: retryFeedback.trim() })
  }

  function handleSearchSuggestedQuery() {
    const queryToSearch = visibleSuggestedQuery.trim()
    setShowRetryView(false)
    setEditableSuggestedQuery('')
    setHasEditedSuggestedQuery(false)
    setRetryViewQuery('')
    onRetrySearch(queryToSearch)
  }

  function handleRetryFabClick() {
    handleOpenRetryView()
    setTimeout(() => {
      retryViewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  function handleOpenRetryView() {
    setRetryViewQuery(submittedQuery)
    setEditableSuggestedQuery('')
    setHasEditedSuggestedQuery(false)
    setShowRetryView(true)
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
                title="Toggle card style (dev only)"
              >
                {cardView === 'new' ? (
                  <><LayoutGrid className="h-3 w-3" /> Old cards</>
                ) : (
                  <><LayoutList className="h-3 w-3" /> New cards</>
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
        </div>
      )}

      {errorMessage ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Hi there, thanks so much for testing Focamai — it&apos;s times like this that your testing shines. Don&apos;t worry, this error is being sent to us to fix ASAP. Thanks again!
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
        <FinalizeLoadingState compact />
      ) : null}

      {hasDisplayedResults ? (
        <div className="space-y-4">
          <div
            className={`relative overflow-hidden rounded-[30px] transition-all duration-500 ${
              isFinalizing && !hasFinalResults
                ? 'bg-[#fbf7f1] p-2 sm:p-3'
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
              className={`mx-auto transition-all duration-300 ${
                cardView === 'new'
                  ? 'max-w-6xl'
                  : 'mobile-landscape-results-grid grid max-w-6xl grid-cols-1 gap-3 sm:gap-5 xl:grid-cols-3'
              } ${isFinalizing && !hasFinalResults ? 'scale-[0.995] opacity-80' : 'opacity-100'}`}
            >
              {cardView === 'new' ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.25fr)] lg:items-start lg:gap-5">
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
                  <div
                    ref={resultRowsScrollRef}
                    className="grid grid-cols-1 gap-3 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pr-1 xl:max-h-[720px]"
                    onScroll={handleResultsListScroll}
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
                        />
                      </MotionDiv>
                    ))}
                  </div>
                </div>
              ) : (
                orderedVisibleResults.map((visibleItem, index) => (
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
                    />
                  </MotionDiv>
                ))
              )}
            </div>
          </div>
        </div>
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

      {hasFinalResults && !isRetryViewVisible ? (
        <div className="rounded-2xl border border-[#e7dac8] bg-[#fbf7f1] px-4 py-4 shadow-[0_14px_38px_-34px_rgba(120,87,63,0.18)] sm:flex sm:items-center sm:justify-between sm:gap-5 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e5dacb] bg-white text-slate-500">
              <RotateCcw className="h-4 w-4" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">Need a better fit?</p>
              <p className="text-sm leading-6 text-slate-600">
                Tell Focamai what felt off and it will prepare a better search.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-full border border-[#dcccc0] bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-[#cbb9a3] hover:bg-[#fdfaf6] hover:text-slate-900 sm:mt-0 sm:w-auto"
            onClick={handleOpenRetryView}
          >
            Improve picks
          </button>
        </div>
      ) : null}

      {isRetryViewVisible ? (
        <div ref={retryViewRef} className="rounded-[28px] border border-[#e7dac8] bg-white/94 p-5 shadow-[0_24px_64px_-50px_rgba(120,87,63,0.22)]">
          <button
            type="button"
            className="mb-5 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
            onClick={() => setShowRetryView(false)}
          >
            <span aria-hidden="true">←</span> Back to results
          </button>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e6d8c5] bg-white/90 px-3 py-1 text-sm text-[#80573f]">
              <Sparkles className="h-4 w-4" />
              Improve these picks
            </div>
            <p className="text-xl font-medium text-slate-900">
              What felt off?
            </p>
            <p className="text-sm leading-6 text-slate-600">
              Say what was wrong, missing, too broad, or worth keeping. Focamai will turn it into a better search.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-2" aria-label="Quick correction options">
              {RETRY_CORRECTION_CHIPS.map((chipLabel) => (
                <button
                  key={chipLabel}
                  type="button"
                  className="rounded-full border border-[#e5dacb] bg-white px-3 py-2 text-sm text-slate-600 transition hover:border-[#cbb9a3] hover:text-slate-900"
                  onClick={() => handleCorrectionChipClick(chipLabel)}
                >
                  {chipLabel}
                </button>
              ))}
            </div>

            <div className="rounded-[22px] border border-[#e5dacb] bg-white p-1 shadow-[0_14px_38px_-32px_rgba(120,87,63,0.16)]">
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
                      canRequestRetryAdvice,
                    onSubmit: handleRetryAdviceSubmit,
                  })
                }
                disabled={!isRetryReady || isRetrying || isGeneratingRetryAdvice}
                className="min-h-32 resize-none rounded-[28px] border-0 bg-transparent px-5 py-4 text-base leading-7 shadow-none placeholder:text-slate-400 focus-visible:ring-0"
                placeholder="Example: Too expensive, wrong style, missing one-hand folding..."
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!isRetryReady || isRetrying || isGeneratingRetryAdvice || !canRequestRetryAdvice}
                className="h-12 rounded-[22px] bg-primary px-6 text-sm text-primary-foreground shadow-[0_16px_36px_-26px_rgba(15,97,117,0.34)] hover:bg-primary/90"
                onClick={handleRetryAdviceSubmit}
              >
                {isGeneratingRetryAdvice ? 'Preparing next search...' : 'Prepare next search'}
              </Button>
            </div>

            {retryAdvice ? (
              <div className="space-y-3 rounded-2xl border border-[#e7dac8] bg-white/90 p-4 shadow-[0_14px_34px_-28px_rgba(120,87,63,0.18)]">
                <div className="space-y-2">
                  {retryAdvice.rationale ? (
                    <p className="text-sm leading-6 text-slate-700">
                      {retryAdvice.rationale}
                    </p>
                  ) : null}
                  {suggestedRetryQuery.trim() ? (
                    <div className="space-y-3 rounded-[20px] border border-[#e5dacb] bg-white p-4">
                      <label
                        htmlFor="results-retry-suggested-query"
                        className="text-sm font-medium text-slate-900"
                      >
                        Next search
                      </label>
                      <Textarea
                        id="results-retry-suggested-query"
                        aria-label="Next search"
                        value={visibleSuggestedQuery}
                        onChange={(event) => {
                          setHasEditedSuggestedQuery(true)
                          setEditableSuggestedQuery(event.target.value)
                        }}
                        className="min-h-20 resize-none rounded-[18px] border-[#e5dacb] bg-[#fdfaf6] px-4 py-3 text-base font-medium leading-6 text-slate-900 shadow-none focus-visible:border-primary/50 focus-visible:ring-[4px] focus-visible:ring-[rgba(15,97,117,0.08)]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="h-11 rounded-full bg-primary px-5 text-sm text-primary-foreground shadow-[0_18px_38px_-24px_rgba(15,97,117,0.42)] hover:bg-primary/90"
                          disabled={!visibleSuggestedQuery.trim()}
                          onClick={handleSearchSuggestedQuery}
                        >
                          Search again
                        </Button>
                      </div>
                    </div>
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
      {hasFinalResults && !isRetryViewVisible ? (
        <div className="pointer-events-none fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-50 sm:right-6 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
          <button
            type="button"
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[#dcccc0] bg-white/95 px-4 py-3 text-left shadow-[0_12px_28px_-20px_rgba(15,23,42,0.18)] backdrop-blur transition-colors hover:border-[#cbb9a3] hover:bg-[#fdfaf6]"
            onClick={handleRetryFabClick}
          >
            <RotateCcw className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="flex flex-col">
              <span className="text-sm text-slate-500">Not quite right?</span>
              <span className="text-sm font-medium text-slate-800">Find better options</span>
            </span>
          </button>
        </div>
      ) : null}
    </section>
  )
}

export default ResultsSection
