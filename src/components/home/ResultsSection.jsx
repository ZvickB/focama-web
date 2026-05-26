import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  ArrowUpRight,
  ChevronDown,
  Clock3,
  RotateCcw,
  Sparkles,
} from 'lucide-react'

import ProductCard from '@/components/ProductCard.jsx'
import logo from '@/assets/logo_master_version.svg'
import { getUserFacingDescription, getUserFacingReasons } from '@/components/home/homeContentUtils.js'
import { RESULT_CARD_SLOTS } from '@/components/home/useGuidedSearch.js'
import { ResultSkeleton } from '@/components/home/ResultSkeleton.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Button } from '@/components/ui/button.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'
import { formatDisplayPrice } from '@/lib/formatDisplayPrice.js'

const RESULT_CARD_FADE_DELAYS_MS = [0, 260, 620, 1040, 1520, 2140]
const RETRY_CORRECTION_CHIPS = [
  'Wrong brand',
  'Wrong product type',
  'Missing dietary need',
  'Too expensive',
  'Wrong size/count',
  'Not available',
]
const CONSTRAINT_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'any',
  'asked',
  'brand',
  'but',
  'for',
  'from',
  'i',
  'just',
  'keep',
  'me',
  'need',
  'needs',
  'of',
  'or',
  'show',
  'the',
  'this',
  'to',
  'want',
  'wanted',
  'with',
])
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

function normalizeConstraintTag(value) {
  return String(value || '')
    .replace(/\b(i asked for|asked for|needs to be|need to be|needs|need|keep|don't show|do not show)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function addConstraintTag(tags, value) {
  const normalized = normalizeConstraintTag(value)

  if (!normalized || normalized.length < 3) {
    return
  }

  const comparable = normalized.toLowerCase()

  if (tags.some((tag) => tag.toLowerCase() === comparable)) {
    return
  }

  tags.push(normalized)
}

function deriveConstraintTags({ followUpNotes, retryFeedback, suggestedRetryQuery, submittedQuery }) {
  const source = String(suggestedRetryQuery || '').trim()
  const tags = []

  if (source) {
    const lowerSource = source.toLowerCase()
    const chocolateMatch = lowerSource.match(/\b(white|dark|milk)\s+chocolate\s+chips?\b/)
    const underMatch = source.match(/\bunder\s+\$?\d+[\w\s-]*/i)
    const words = source
      .split(/\s+/)
      .map((word) => word.replace(/[^\w$-]/g, ''))
      .filter(Boolean)

    if (words[0] && !CONSTRAINT_STOP_WORDS.has(words[0].toLowerCase())) {
      addConstraintTag(tags, words[0])
    }

    if (lowerSource.includes('dairy-free') || lowerSource.includes('dairy free') || lowerSource.includes('non dairy')) {
      addConstraintTag(tags, 'dairy-free')
    }

    if (chocolateMatch) {
      addConstraintTag(tags, chocolateMatch[0])
    }

    if (underMatch) {
      addConstraintTag(tags, underMatch[0])
    }

    if (tags.length === 0 && words.length > 0) {
      addConstraintTag(tags, words.slice(0, Math.min(words.length, 3)).join(' '))
    }
  }

  if (tags.length < 3) {
    const fallbackParts = [submittedQuery, followUpNotes, retryFeedback]
      .flatMap((value) => String(value || '').split(/[.,;\n]+/))
      .map(normalizeConstraintTag)
      .filter(Boolean)

    fallbackParts.forEach((part) => {
      if (tags.length >= 4) {
        return
      }

      const meaningfulWords = part
        .split(/\s+/)
        .filter((word) => !CONSTRAINT_STOP_WORDS.has(word.toLowerCase()))

      addConstraintTag(tags, meaningfulWords.length > 0 ? meaningfulWords.join(' ') : part)
    })
  }

  return tags.slice(0, 4)
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
  index,
  isEnrichmentSettled,
  item,
  onOpenDetails,
  onRetailerClick,
}) {
  const displayPrice = formatDisplayPrice(item.price)
  const shortReason = getShortReason(item, { hasFinalResults, isEnrichmentSettled })

  return (
    <div
      className="group relative overflow-hidden rounded-[22px] border border-[#eadfce] bg-white/94 transition duration-200 hover:border-[#d8c9b6] hover:bg-[#fffdfb]"
    >
      <button
        type="button"
        className="flex w-full gap-3 p-3 text-left sm:p-4"
        onClick={onOpenDetails}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e6d8c5] bg-[#fbf6f0] text-xs font-semibold text-[#80573f]">
          {index + 1}
        </div>
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[16px] border border-[#eee5da] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,246,240,0.92))] p-1.5">
          <ProductImage className="h-full w-full rounded-[12px]" image={item.image} title={item.title} />
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
      <div className="flex items-center justify-between border-t border-[#f0e7da] bg-[#fdfaf6]/70 px-4 py-2">
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
  followUpNotes = '',
  retryFeedback,
  showFinalResultBadges,
  showPreviewResults,
  suggestedRetryQuery,
  submittedQuery,
}) {
  const retryViewRef = useRef(null)
  const [showRetryView, setShowRetryView] = useState(false)
  const [selectedCorrectionChips, setSelectedCorrectionChips] = useState([])
  const [isEditingSuggestedQuery, setIsEditingSuggestedQuery] = useState(false)
  const [editableSuggestedQuery, setEditableSuggestedQuery] = useState('')
  const [editableSuggestedQuerySource, setEditableSuggestedQuerySource] = useState('')
  const [retryViewQuery, setRetryViewQuery] = useState('')
  const isEditingCurrentSuggestion =
    isEditingSuggestedQuery && editableSuggestedQuerySource === suggestedRetryQuery.trim()
  const isRetryViewVisible = hasFinalResults && showRetryView && retryViewQuery === submittedQuery

  const shouldShowBadgeLabels = !hasFinalResults || showFinalResultBadges
  const orderedResults = displayedResults
  const hasExplicitBadges = shouldShowBadgeLabels && displayedResults.some((item) => item.badgeLabel)
  const hasDisplayedResults = orderedResults.length > 0
  const shouldShowResultsIntro = !hasDisplayedResults || hasFinalResults
  const orderedPreviousResults = previousResults
  const hasSelectedCorrectionChips = selectedCorrectionChips.length > 0
  const canRequestRetryAdvice = Boolean(retryFeedback.trim() || hasSelectedCorrectionChips)
  const visibleConstraintTags = deriveConstraintTags({
    followUpNotes,
    retryFeedback,
    suggestedRetryQuery,
    submittedQuery,
  })

  function handleCorrectionChipToggle(chipLabel) {
    setSelectedCorrectionChips((current) => {
      const next = current.includes(chipLabel)
        ? current.filter((label) => label !== chipLabel)
        : [...current, chipLabel]

      return next
    })
    onRetryFeedbackChange(retryFeedback)
  }

  function buildRetryFeedbackPayload() {
    const feedbackParts = []

    if (selectedCorrectionChips.length > 0) {
      feedbackParts.push(`Correction type: ${selectedCorrectionChips.join(', ')}`)
    }

    if (retryFeedback.trim()) {
      feedbackParts.push(retryFeedback.trim())
    }

    return feedbackParts.join('\n')
  }

  function handleRetryAdviceSubmit() {
    onRetryAdviceRequest({ rejectionFeedback: buildRetryFeedbackPayload() })
  }

  function handleEditSuggestedQuery() {
    const normalizedSuggestion = suggestedRetryQuery.trim()
    setEditableSuggestedQuery(normalizedSuggestion)
    setEditableSuggestedQuerySource(normalizedSuggestion)
    setIsEditingSuggestedQuery(true)
  }

  function handleSearchSuggestedQuery() {
    const queryToSearch = (isEditingCurrentSuggestion ? editableSuggestedQuery : suggestedRetryQuery).trim()
    setShowRetryView(false)
    setSelectedCorrectionChips([])
    setIsEditingSuggestedQuery(false)
    setEditableSuggestedQuery('')
    setEditableSuggestedQuerySource('')
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
    setSelectedCorrectionChips([])
    setIsEditingSuggestedQuery(false)
    setEditableSuggestedQuery('')
    setEditableSuggestedQuerySource('')
    setShowRetryView(true)
  }

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
          Hi there, thanks so much for testing Focamai — it&apos;s times like this that your testing shines. Don&apos;t worry, this error is being sent to us to fix ASAP. Thanks again!
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
              className={`mx-auto grid max-w-4xl grid-cols-1 gap-3 transition-all duration-300 ${
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
                    <RankedPickRow
                      hasFinalResults={hasFinalResults}
                      index={index}
                      isEnrichmentSettled={isEnrichmentSettled}
                      item={visibleItem}
                      onOpenDetails={() =>
                        onSelectProduct(visibleItem, {
                          position: index,
                          resultSet: hasFinalResults ? 'final' : 'preview',
                        })
                      }
                      onRetailerClick={() =>
                        onRetailerClick(visibleItem, {
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
            onClick={handleOpenRetryView}
          >
            Not seeing what you had in mind? Tell us what to correct
          </Button>
        </div>
      ) : null}

      {isRetryViewVisible ? (
        <div ref={retryViewRef} className="rounded-[36px] border border-[#e7dac8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,246,240,0.9))] p-5 shadow-[0_28px_120px_-72px_rgba(120,87,63,0.3)]">
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
              What should Focamai keep or change?
            </p>
            <p className="text-sm leading-6 text-slate-600">
              Add what was missing, what should stay, or what should be replaced.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-2" aria-label="Quick correction options">
              {RETRY_CORRECTION_CHIPS.map((chipLabel) => {
                const isSelected = selectedCorrectionChips.includes(chipLabel)

                return (
                  <button
                    key={chipLabel}
                    type="button"
                    className={`rounded-full border px-3 py-2 text-sm transition ${
                      isSelected
                        ? 'border-primary/35 bg-primary/10 text-primary'
                        : 'border-[#e5dacb] bg-white text-slate-600 hover:border-[#cbb9a3] hover:text-slate-900'
                    }`}
                    aria-pressed={isSelected}
                    onClick={() => handleCorrectionChipToggle(chipLabel)}
                  >
                    {chipLabel}
                  </button>
                )
              })}
            </div>

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
                      canRequestRetryAdvice,
                    onSubmit: handleRetryAdviceSubmit,
                  })
                }
                disabled={!isRetryReady || isRetrying || isGeneratingRetryAdvice}
                className="min-h-32 resize-none rounded-[28px] border-0 bg-transparent px-5 py-4 text-base leading-7 shadow-none placeholder:text-slate-400 focus-visible:ring-0"
                placeholder="Example: Keep Yupik and white chocolate chips. Needs to be dairy-free. Don't show dark chocolate."
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!isRetryReady || isRetrying || isGeneratingRetryAdvice || !canRequestRetryAdvice}
                className="h-12 rounded-[24px] bg-primary px-6 text-sm text-primary-foreground shadow-[0_22px_48px_-26px_rgba(15,97,117,0.42)] hover:bg-primary/90"
                onClick={handleRetryAdviceSubmit}
              >
                {isGeneratingRetryAdvice ? 'Finding a better search...' : 'Suggest a better search'}
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
                    <div className="space-y-3 rounded-[20px] border border-[#e5dacb] bg-white p-4">
                      <p className="text-sm font-medium text-slate-900">Try this search instead:</p>
                      {isEditingCurrentSuggestion ? (
                        <Textarea
                          aria-label="Edit suggested search"
                          value={editableSuggestedQuery}
                          onChange={(event) => setEditableSuggestedQuery(event.target.value)}
                          className="min-h-20 resize-none rounded-[18px] border-[#e5dacb] bg-white px-4 py-3 text-base leading-6 text-slate-900 shadow-none focus-visible:border-primary/50 focus-visible:ring-[4px] focus-visible:ring-[rgba(15,97,117,0.08)]"
                        />
                      ) : (
                        <p className="rounded-[18px] bg-[#f8f3ed] px-4 py-3 text-base font-medium leading-6 text-slate-900">
                          {suggestedRetryQuery}
                        </p>
                      )}
                      {visibleConstraintTags.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                          <span>Keeping:</span>
                          {visibleConstraintTags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-[#e5dacb] bg-white px-2.5 py-1 text-slate-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="h-11 rounded-full bg-primary px-5 text-sm text-primary-foreground shadow-[0_18px_38px_-24px_rgba(15,97,117,0.42)] hover:bg-primary/90"
                          onClick={handleSearchSuggestedQuery}
                        >
                          Search this
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 rounded-full border-[#dcccc0] bg-white px-5 text-sm text-slate-600 hover:border-[#cbb9a3] hover:bg-[#fdfaf6] hover:text-slate-900"
                          onClick={handleEditSuggestedQuery}
                        >
                          Edit first
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
      {hasFinalResults && !isRetryViewVisible ? (
        <div className="pointer-events-none fixed right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-50 sm:right-6 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
          <button
            type="button"
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[#dcccc0] bg-white/95 px-4 py-3 text-left shadow-[0_16px_38px_-20px_rgba(15,23,42,0.22)] backdrop-blur hover:border-[#cbb9a3] hover:bg-[#fdfaf6] transition-colors"
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
