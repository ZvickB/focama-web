import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import { resolveAmazonDomainForRequest } from '@/components/home/useGuidedSearch.js'

const RESULT_CARD_FADE_DELAYS_MS = [0, 260, 620, 1040, 1520, 2140]
import {
  ArrowUpRight,
  ChevronDown,
  Clock3,
  Search,
  Sparkles,
  Star,
  X,
} from 'lucide-react'

import ProductCard from '@/components/ProductCard.jsx'
import { RESULT_CARD_SLOTS } from '@/components/home/useGuidedSearch.js'
import { Badge } from '@/components/ui/badge.jsx'
import { Button } from '@/components/ui/button.jsx'
import logo from '@/assets/logo_master_version.svg'
import { formatDisplayPrice } from '@/lib/formatDisplayPrice.js'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'

function handleRetryFeedbackKeyDown(event, { canSubmit, onSubmit }) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) {
    return
  }

  event.preventDefault()

  if (canSubmit) {
    onSubmit()
  }
}

function getUserFacingDescription(description) {
  const normalizedDescription = String(description || '').trim()

  if (!normalizedDescription) {
    return ''
  }

  if (/serpapi search route|live product result returned/i.test(normalizedDescription)) {
    return ''
  }

  return normalizedDescription
}

function SkeletonBlock({ className }) {
  return (
    <div className={`relative overflow-hidden rounded-full bg-stone-200/80 ${className}`}>
      <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
    </div>
  )
}

const MotionDiv = motion.div

export function ResultSkeleton({ className = '' }) {
  return (
    <div
      className={`h-full overflow-hidden rounded-[24px] border border-stone-200/80 bg-white/85 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] sm:rounded-[28px] ${className}`}
    >
      <div className="relative h-44 overflow-hidden bg-stone-200/90 sm:h-56">
        <img
          src={logo}
          alt=""
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.14] sm:h-24 sm:w-24"
        />
        <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <SkeletonBlock className="h-5 w-24" />
        <SkeletonBlock className="h-7 w-3/4" />
        <SkeletonBlock className="h-4 w-1/2" />
        <div className="space-y-2 pt-2">
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-2/3" />
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-stone-200/80">
          <div className="h-11 w-full" />
          <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
        </div>
      </div>
    </div>
  )
}

function resolveAmazonRetailerLabel(subtitle, selectedAmazonDomain, resolvedAmazonDomain) {
  if (subtitle !== 'Amazon') return subtitle
  const domain = resolveAmazonDomainForRequest(selectedAmazonDomain, resolvedAmazonDomain)
  if (!domain || !domain.startsWith('amazon.')) return 'Amazon.com'
  return domain.replace(/^amazon\./, 'Amazon.')
}

export function ProductDetailModal({ item, onClose, onRetailerClick }) {
  const fitReason = item?.fit_reason || item?.fitReason || ''
  const caveat = item?.caveat || ''
  const featureBullets = Array.isArray(item?.feature_bullets) ? item.feature_bullets.slice(0, 5) : []
  const enrichmentReady = Boolean(fitReason)
  const { selectedAmazonDomain, resolvedAmazonDomain } = useAmazonStore()
  const retailerLabel = resolveAmazonRetailerLabel(item?.subtitle, selectedAmazonDomain, resolvedAmazonDomain)
  const outerRef = useRef(null)
  const [showScrollHint, setShowScrollHint] = useState(true)

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    function handleScroll() {
      if (el.scrollTop > 40) setShowScrollHint(false)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  if (!item) {
    return null
  }

  const userFacingDescription = getUserFacingDescription(item.description)
  const displayPrice = formatDisplayPrice(item.price)

  return (
    <MotionDiv
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-end bg-slate-950/45 lg:items-center lg:justify-center"
      onClick={onClose}
    >
      <MotionDiv
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        ref={outerRef}
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-[32px] bg-[#fcf8f1] shadow-2xl lg:flex lg:max-h-[88vh] lg:max-w-4xl lg:flex-col lg:overflow-hidden lg:rounded-[32px]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Minimal close bar — just the X, no title text */}
        <div className="sticky top-0 z-10 flex justify-end bg-[#fcf8f1]/80 px-4 py-3 backdrop-blur sm:px-5">
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-9 rounded-full p-0 text-slate-500 hover:bg-stone-100 hover:text-slate-700"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-6 px-4 pb-4 sm:gap-8 sm:px-6 sm:pb-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[2fr_3fr] lg:gap-8 lg:overflow-hidden lg:px-8 lg:pb-0">
          {/* Left — image only; sticky on desktop so it never scrolls away */}
          <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_16px_60px_-30px_rgba(15,23,42,0.35)] lg:h-full">
            <div className="flex h-60 items-center justify-center bg-stone-50 p-4 sm:h-[300px] sm:p-6 lg:h-full">
              <img
                src={item.image}
                alt={item.title}
                className="h-full w-full object-contain"
              />
            </div>
          </div>

          {/* Right — info; scrolls independently on desktop */}
          <div className="flex flex-col gap-4 lg:overflow-y-auto lg:pb-8">
            {/* Title block */}
            <div className="space-y-1.5">
              {item.subtitle ? (
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-400">
                  {item.subtitle}
                </p>
              ) : null}
              <h2 className="text-xl font-semibold leading-snug tracking-tight text-slate-900 sm:text-2xl">
                {item.title}
              </h2>
              <p className="text-2xl font-semibold text-primary">{displayPrice}</p>
              <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className={`h-3.5 w-3.5 ${
                        index < Math.round(item.rating)
                          ? 'fill-current text-amber-500'
                          : 'text-stone-300'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-slate-500">
                  {item.rating.toFixed(1)} · {item.reviewCount} reviews
                </span>
                {item.badgeLabel ? (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {item.badgeLabel}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Feature bullets — always visible immediately while AI loads */}
            {featureBullets.length > 0 ? (
              <ul className="space-y-1.5">
                {featureBullets.map((bullet, index) => (
                  <li
                    key={`${item.id}-feature-bullet-${index}`}
                    className="flex items-start gap-2 text-sm leading-6 text-slate-600"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-400" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : userFacingDescription ? (
              <p className="text-sm leading-6 text-slate-600">{userFacingDescription}</p>
            ) : null}

            {/* AI analysis — small ambient indicator while loading, prominent section when ready */}
            {enrichmentReady ? (
              <MotionDiv
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-3 rounded-2xl bg-primary/5 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
                  Why we picked it
                </p>
                <p className="text-sm leading-6 text-slate-700">{fitReason}</p>
                {caveat ? (
                  <p className="border-t border-stone-200/80 pt-2.5 text-sm leading-6 text-slate-500">
                    <span className="font-medium text-slate-600">Worth knowing: </span>
                    {caveat}
                  </p>
                ) : null}
              </MotionDiv>
            ) : (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inset-0 rounded-full bg-primary/25 animate-soft-pulse" />
                  <span className="relative h-2 w-2 rounded-full bg-primary/60" />
                </span>
                <span className="relative inline-block overflow-hidden rounded-full px-0.5 text-slate-500">
                  <span className="relative z-10">Analyzing your pick…</span>
                  <span className="pointer-events-none absolute inset-y-0 left-[-40%] w-[40%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/80 to-transparent animate-shimmer" />
                </span>
              </div>
            )}

            {/* Scroll hint — mobile only, disappears after first scroll */}
            {showScrollHint ? (
              <div aria-hidden="true" className="flex justify-center pb-1 lg:hidden">
                <ChevronDown className="h-5 w-5 animate-bounce text-slate-300" />
              </div>
            ) : null}

            {/* CTA */}
            <div className="sticky bottom-0 space-y-2 border-t border-stone-200/80 bg-[#fcf8f1]/95 py-4 backdrop-blur">
              {item.link ? (
                <Button
                  asChild
                  className="h-12 w-full gap-2 rounded-2xl bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <a href={item.link} target="_blank" rel="noreferrer" onClick={onRetailerClick}>
                    {retailerLabel ? `View on ${retailerLabel}` : 'View on retailer site'}
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled
                  className="h-12 w-full gap-2 rounded-2xl bg-stone-200 text-slate-500"
                >
                  Retailer link unavailable
                </Button>
              )}
              <p className="text-center text-xs leading-5 text-slate-400">
                Prices and availability can change after you leave Focamai.
              </p>
              <button
                type="button"
                className="w-full py-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
                onClick={onClose}
              >
                Back to results
              </button>
            </div>
          </div>
        </div>
      </MotionDiv>
    </MotionDiv>
  )
}

export function ResultsSection({
  displayedResults,
  errorMessage,
  hasFinalResults,
  hasStartedSearch,
  isFinalizing,
  isLoading,
  isRetryReady,
  isRetrying,
  isGeneratingRetryAdvice,
  onRetailerClick,
  onSelectProduct,
  onRetryAdviceRequest,
  onRetryFeedbackChange,
  onSearchSuggestedQuery,
  onSuggestedRetryQueryChange,
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
          <Badge variant="outline" className="w-fit rounded-full bg-stone-50 px-3 py-1">
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
            className="flex items-center gap-3 rounded-full border border-stone-200/80 bg-stone-50/90 px-4 py-2.5 text-sm text-slate-600"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 rounded-full bg-primary/25 animate-soft-pulse" />
              <span className="relative mt-[1px] h-2.5 w-2.5 rounded-full bg-primary/70" />
            </span>
            <span>Starting your search and getting the first options ready...</span>
          </div>

          <div>
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 sm:gap-5">
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
        <div className="rounded-[28px] border border-dashed border-stone-200 bg-stone-50/70 px-6 py-12 text-center sm:px-8">
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
          className="rounded-[24px] border border-stone-200/80 bg-stone-50/90 px-4 py-4 text-left text-slate-600 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.35)] transition-all duration-300 sm:px-5"
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
                ? 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),rgba(248,250,252,0.72)_46%,rgba(241,245,249,0.55)_100%)] p-2 sm:p-3'
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
              className={`mx-auto grid max-w-6xl grid-cols-1 gap-3 transition-all duration-300 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3 ${
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
                    transition={{ duration: 0.9, delay: (RESULT_CARD_FADE_DELAYS_MS[index] ?? index * 900) / 1000, ease: [0.22, 1, 0.36, 1] }}
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
        <details className="group rounded-[28px] border border-stone-200/80 bg-stone-50/70 px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">Previous picks</p>
              <p className="text-sm leading-6 text-slate-600">
                These were the picks you rejected before the latest retry.
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="mt-4 grid max-w-6xl grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 sm:gap-5">
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
        <div className="rounded-[28px] border border-dashed border-stone-200 bg-stone-50/70 px-6 py-8 text-center sm:px-8">
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
            className="h-11 rounded-full border-stone-300 bg-white px-6 text-sm text-slate-600 hover:border-stone-400 hover:bg-stone-50 hover:text-slate-900"
            onClick={() => setShowRetryView(true)}
          >
            Not quite what you needed?
          </Button>
        </div>
      ) : null}

      {isRetryViewVisible ? (
        <div className="rounded-[36px] border border-stone-200/80 bg-white/80 p-5 shadow-[0_28px_120px_-72px_rgba(15,23,42,0.45)]">
          <button
            type="button"
            className="mb-5 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
            onClick={() => setShowRetryView(false)}
          >
            <span aria-hidden="true">←</span> Back to results
          </button>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 px-3 py-1 text-sm text-primary">
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
            <div className="rounded-[30px] border border-stone-200 bg-[#fffdf9] p-1">
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
                className="h-12 rounded-[24px] bg-primary px-6 text-sm text-primary-foreground shadow-[0_18px_40px_-24px_rgba(37,99,235,0.7)] hover:bg-primary/90"
                onClick={onRetryAdviceRequest}
              >
                {isGeneratingRetryAdvice ? 'Finding a better search...' : 'Get a suggestion'}
              </Button>
            </div>

            {retryAdvice ? (
              <div className="space-y-3 rounded-[24px] border border-primary/15 bg-primary/5 p-4">
                <div className="space-y-2">
                  {retryAdvice.rationale ? (
                    <p className="text-sm leading-6 text-slate-700">
                      {retryAdvice.rationale}
                    </p>
                  ) : null}
                  <Label htmlFor="retry-suggested-query" className="text-xs font-medium text-slate-500">
                    Try this search — edit if needed:
                  </Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="retry-suggested-query"
                      value={suggestedRetryQuery}
                      onChange={(event) => onSuggestedRetryQueryChange(event.target.value)}
                      className="h-11 min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-primary/50"
                    />
                    <Button
                      type="button"
                      disabled={!suggestedRetryQuery.trim()}
                      className="h-11 shrink-0 rounded-2xl bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90"
                      onClick={() => onSearchSuggestedQuery(suggestedRetryQuery)}
                    >
                      Use this search
                      <Search className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}


      {!hasStartedSearch && !errorMessage ? null : !isLoading && displayedResults.length === 0 && !errorMessage ? (
        <div className="rounded-[28px] border border-dashed border-stone-200 bg-stone-50/70 px-6 py-12 text-center sm:px-8">
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
