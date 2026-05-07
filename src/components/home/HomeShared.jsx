import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import { resolveAmazonDomainForRequest } from '@/components/home/useGuidedSearch.js'

const RESULT_CARD_FADE_DELAYS_MS = [0, 260, 620, 1040, 1520, 2140]
import {
  ArrowUpRight,
  ChevronDown,
  Clock3,
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
    <div className={`relative overflow-hidden rounded-full bg-[#eadfd2]/80 ${className}`}>
      <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
    </div>
  )
}

const MotionDiv = motion.div

export function ResultSkeleton({ className = '' }) {
  return (
    <div
      className={`h-full overflow-hidden rounded-[24px] border border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,247,242,0.95))] shadow-[0_24px_80px_-50px_rgba(120,87,63,0.28)] sm:rounded-[28px] ${className}`}
    >
      <div className="relative h-44 overflow-hidden bg-[linear-gradient(180deg,rgba(243,236,228,0.92),rgba(248,244,239,0.82))] sm:h-56">
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

export function ProductDetailModal({ item, isEnrichmentSettled = false, onClose, onRetailerClick }) {
  const fitReason = item?.fit_reason || item?.fitReason || ''
  const caveat = item?.caveat || ''
  const featureBullets = Array.isArray(item?.feature_bullets) ? item.feature_bullets.slice(0, 5) : []
  const enrichmentReady = Boolean(fitReason)
  const { selectedAmazonDomain, resolvedAmazonDomain } = useAmazonStore()
  const retailerLabel = resolveAmazonRetailerLabel(item?.subtitle, selectedAmazonDomain, resolvedAmazonDomain)
  const outerRef = useRef(null)
  const contentRef = useRef(null)
  const [showScrollHint, setShowScrollHint] = useState(true)

  useEffect(() => {
    const el = contentRef.current
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
        transition={{ duration: 0.24 }}
        className="fixed inset-0 z-50 flex items-end bg-[rgba(51,39,30,0.34)] backdrop-blur-[2px] lg:items-center lg:justify-center"
        onClick={onClose}
      >
      <MotionDiv
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        ref={outerRef}
        className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-[32px] border border-[#ece1d5] bg-[linear-gradient(180deg,rgba(255,255,255,0.995),rgba(250,246,241,0.97))] shadow-[0_40px_120px_-48px_rgba(70,51,38,0.44)] lg:max-h-[88vh] lg:max-w-4xl lg:rounded-[32px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex justify-end border-b border-[#f0e7dc] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(251,247,242,0.96))] px-4 py-2 shadow-[0_12px_28px_-24px_rgba(120,87,63,0.28)] sm:px-5 sm:py-2.5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-[-10px] h-[10px]"
            style={{
              background:
                'linear-gradient(180deg, rgba(251,247,242,0.78) 0%, rgba(251,247,242,0.3) 52%, rgba(251,247,242,0) 100%)',
            }}
          />
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 rounded-full p-0 text-slate-500 hover:bg-[#f5eee6] hover:text-slate-700 sm:h-9 sm:w-9"
            onClick={onClose}
          >
            <X className="h-4 w-4 sm:h-[1.05rem] sm:w-[1.05rem]" />
          </Button>
        </div>

        <div
          ref={contentRef}
          className="grid flex-1 gap-6 overflow-y-auto px-4 pb-0 sm:gap-8 sm:px-6 lg:min-h-0 lg:grid-cols-[2fr_3fr] lg:gap-8 lg:overflow-hidden lg:px-8"
          style={{ scrollbarGutter: 'stable' }}
        >
          {/* Left — image only; sticky on desktop so it never scrolls away */}
          <div className="overflow-hidden rounded-[24px] border border-[#eee5da] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,246,240,0.94))] shadow-[0_22px_70px_-34px_rgba(120,87,63,0.24)] lg:h-full">
            <div
              className="flex h-60 items-center justify-center p-4 sm:h-[300px] sm:p-6 lg:h-full"
              style={{
                background:
                  'radial-gradient(circle at 18% 12%, rgba(229,155,38,0.12), transparent 32%), radial-gradient(circle at 84% 0%, rgba(15,97,117,0.08), transparent 28%), linear-gradient(180deg, rgba(250,246,240,0.86), rgba(255,255,255,0.92))',
              }}
            >
              <div className="flex h-full w-full items-center justify-center rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,246,240,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_22px_44px_-34px_rgba(120,87,63,0.24)] sm:p-4">
                <img
                  src={item.image}
                  alt={item.title}
                  className="h-full w-full rounded-[24px] object-contain mix-blend-multiply"
                />
              </div>
            </div>
          </div>

          {/* Right — info; scrolls independently on desktop */}
          <div
            className="flex flex-col gap-4 pr-2 sm:pr-3 lg:min-h-0 lg:overflow-y-auto lg:pr-4"
            style={{ scrollbarGutter: 'stable' }}
          >
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
                          : 'text-[#d4c5b2]'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-slate-500">
                  {item.rating.toFixed(1)} · {item.reviewCount} reviews
                </span>
                {item.badgeLabel ? (
                  <span className="rounded-full border border-[#e6d8c5] bg-[linear-gradient(180deg,rgba(250,245,239,0.98),rgba(255,255,255,0.96))] px-2.5 py-0.5 text-xs font-medium text-[#80573f]">
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
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b18c6f]" />
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
                className="space-y-3 rounded-2xl border border-[#e7dac8] bg-[linear-gradient(180deg,rgba(250,246,240,0.96),rgba(255,255,255,0.96))] p-4 shadow-[0_18px_42px_-32px_rgba(120,87,63,0.38)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#80573f]">
                  Why we picked it
                </p>
                <p className="text-sm leading-6 text-slate-700">{fitReason}</p>
                {caveat ? (
                  <p className="border-t border-[#e9dfd2] pt-2.5 text-sm leading-6 text-slate-500">
                    <span className="font-medium text-slate-600">Worth knowing: </span>
                    {caveat}
                  </p>
                ) : null}
              </MotionDiv>
            ) : isEnrichmentSettled ? (
              <div className="rounded-2xl border border-[#e8ddcf] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,246,240,0.84))] p-4 text-sm leading-6 text-slate-500">
                Extra analysis wasn&apos;t available for this pick right now.
              </div>
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

            {/* CTA */}
            <div className="sticky bottom-0 space-y-2 border-t border-[#eadfd2] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,246,240,0.94))] pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shadow-[0_-14px_30px_-26px_rgba(120,87,63,0.28)]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-[-18px] h-[18px]"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(250,246,240,0) 0%, rgba(250,246,240,0.78) 62%, rgba(250,246,240,0.94) 100%)',
                }}
              />
              {showScrollHint ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-0 z-10 flex -translate-x-1/2 -translate-y-[60%] justify-center lg:hidden"
                >
                  <div className="rounded-full border border-stone-200/80 bg-white p-1 shadow-sm">
                    <ChevronDown className="h-5 w-5 animate-bounce text-[#9f7f66]" />
                  </div>
                </div>
              ) : null}
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
                  className="h-12 w-full gap-2 rounded-2xl bg-[#ede3d6] text-slate-500"
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
