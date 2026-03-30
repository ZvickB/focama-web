import { useEffect } from 'react'
import {
  ArrowUpRight,
  ChevronDown,
  Clock3,
  Sparkles,
  Star,
  X,
} from 'lucide-react'

import ProductCard from '@/components/ProductCard.jsx'
import { MAX_REFINEMENT_RETRIES, RESULT_CARD_SLOTS } from '@/components/home/useGuidedSearch.js'
import { Badge } from '@/components/ui/badge.jsx'
import { Button } from '@/components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import logo from '@/assets/logo_master_version.svg'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'

const BADGE_DISPLAY_PRIORITY = new Map([
  ['Best match', 0],
  ['Best value', 1],
  ['Best budget pick', 1],
  ['Best premium pick', 1],
  ['Best for durability', 1],
  ['Best for comfort', 1],
  ['Best for small spaces', 1],
  ['Best for beginners', 1],
  ['Best lightweight option', 1],
  ['Best all-rounder', 1],
])

function handleRetryFeedbackKeyDown(event, { canSubmit, onSubmit }) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) {
    return
  }

  event.preventDefault()

  if (canSubmit) {
    onSubmit()
  }
}

function getUserFacingReasons(reasons = []) {
  return reasons.filter((reason) => {
    const normalizedReason = String(reason || '').trim()

    if (!normalizedReason) {
      return false
    }

    return !/serpapi search route|live product result returned/i.test(normalizedReason)
  })
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

export function ProductDetailModal({ item, onClose, onRetailerClick }) {
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

  const userFacingReasons = getUserFacingReasons(item.reasons)
  const userFacingDescription = getUserFacingDescription(item.description)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-slate-950/45 lg:items-center lg:justify-center"
      onClick={onClose}
    >
      <div
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-[32px] bg-[#fcf8f1] shadow-2xl lg:max-h-[88vh] lg:max-w-4xl lg:rounded-[32px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200/80 bg-[#fcf8f1]/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Product details
            </p>
            <p className="text-sm text-slate-600">A closer look at this recommendation.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-10 w-10 rounded-full p-0 text-slate-600 hover:bg-stone-100"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:p-8">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
              <img src={item.image} alt={item.title} className="h-72 w-full object-cover sm:h-[420px]" />
            </div>
            <Badge className="rounded-full bg-white px-3 py-1 text-slate-700 hover:bg-white">
              {item.subtitle}
            </Badge>
          </div>

          <div className="space-y-5">
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {item.title}
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                {item.badgeLabel ? (
                  <Badge className="rounded-full bg-primary px-3 py-1 text-primary-foreground hover:bg-primary">
                    {item.badgeLabel}
                  </Badge>
                ) : null}
                <p className="text-2xl font-semibold text-primary">{item.price}</p>
                <div className="flex items-center gap-1 text-sm text-amber-600">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className={`h-4 w-4 ${
                        index < Math.round(item.rating)
                          ? 'fill-current text-amber-500'
                          : 'text-stone-300'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-slate-500">
                  {item.rating.toFixed(1)} ({item.reviewCount} reviews)
                </span>
              </div>
              {userFacingDescription ? (
                <p className="text-base leading-7 text-slate-600">{userFacingDescription}</p>
              ) : null}
            </div>

            <Card className="rounded-[28px] border-stone-200/80 bg-white/80 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-slate-900">Why this pick stands out</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                {userFacingReasons.map((reason) => (
                  <div key={reason} className="flex items-start gap-3">
                    <Star className="mt-1 h-4 w-4 text-amber-500" />
                    <span>{reason}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {item.drawbacks?.length ? (
              <Card className="rounded-[28px] border-stone-200/80 bg-white/80 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-slate-900">Possible drawbacks</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                  {item.drawbacks.map((drawback) => (
                    <div key={drawback} className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-stone-400" />
                      <span>{drawback}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <div className="sticky bottom-0 flex flex-col gap-3 border-t border-stone-200/80 bg-[#fcf8f1]/95 py-4 backdrop-blur sm:flex-row">
              <div className="flex-1 space-y-2">
                {item.link ? (
                  <Button
                    asChild
                    className="h-12 w-full gap-2 rounded-2xl bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    <a href={item.link} target="_blank" rel="noreferrer" onClick={onRetailerClick}>
                      View on retailer site
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled
                    className="h-12 w-full gap-2 rounded-2xl bg-stone-200 text-slate-500 hover:bg-stone-200"
                  >
                    Retailer link unavailable
                  </Button>
                )}
                <p className="text-xs leading-5 text-slate-500">
                  Prices and availability can change after you leave Focamai.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-2xl border-stone-300 bg-white text-slate-700"
                onClick={onClose}
              >
                Back to results
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  onRetailerClick,
  onSelectProduct,
  onRetryFeedbackChange,
  onRetryWithFeedback,
  previousResults = [],
  selectionState,
  retryCount,
  retryFeedback,
  showPreviewResults,
  submittedQuery,
}) {
  const orderedResults = displayedResults
    .map((item, index) => ({
      item,
      index,
      priority: BADGE_DISPLAY_PRIORITY.get(item.badgeLabel || '') ?? 2,
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority
      }

      return left.index - right.index
    })
    .map((entry) => entry.item)
  const hasExplicitBadges = displayedResults.some((item) => item.badgeLabel)
  const hasDisplayedResults = orderedResults.length > 0
  const shouldShowResultsIntro = !hasDisplayedResults || hasFinalResults
  const orderedPreviousResults = previousResults
    .map((item, index) => ({
      item,
      index,
      priority: BADGE_DISPLAY_PRIORITY.get(item.badgeLabel || '') ?? 2,
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority
      }

      return left.index - right.index
    })
    .map((entry) => entry.item)

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
              ? 'These picks were finalized after your guided refinement. You now have six focused options.'
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
            {orderedResults.map((item, index) => (
              <div key={item.id}>
                <ProductCard
                  {...item}
                  badgeLabel={item.badgeLabel || (!hasExplicitBadges && index === 0 ? 'Best match' : '')}
                  onRetailerClick={() =>
                    onRetailerClick(item, {
                      position: index,
                      resultSet: hasFinalResults ? 'final' : 'preview',
                    })
                  }
                  onSelect={() =>
                    onSelectProduct(item, {
                      position: index,
                      resultSet: hasFinalResults ? 'final' : 'preview',
                    })
                  }
                />
              </div>
            ))}
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
            <p className="text-lg font-medium text-slate-900">No new picks were left after that feedback.</p>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              The earlier shortlist is still available above, or you can start a new search with a
              different direction.
            </p>
          </div>
        </div>
      ) : null}

      {hasFinalResults ? (
        <Card className="rounded-[28px] border-stone-200/80 bg-white/80 shadow-none">
          <CardHeader className="space-y-2 pb-3">
            <CardTitle className="text-lg text-slate-900">
              Didn&apos;t find anything you like? Tell us why.
            </CardTitle>
            <p className="text-sm leading-6 text-slate-600">
              We&apos;ll use your feedback for a more deliberate second pass instead of showing endless
              extra results.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="results-retry-feedback" className="text-slate-700">
                What felt off about these picks?
              </Label>
              <Textarea
                id="results-retry-feedback"
                value={retryFeedback}
                onChange={(event) => onRetryFeedbackChange(event.target.value)}
                onKeyDown={(event) =>
                  handleRetryFeedbackKeyDown(event, {
                    canSubmit: isRetryReady && !isRetrying && Boolean(retryFeedback.trim()),
                    onSubmit: onRetryWithFeedback,
                  })
                }
                disabled={!isRetryReady || isRetrying}
                className="min-h-28 resize-none rounded-[24px] border-stone-200 bg-[#fffdf9] px-4 py-3 text-sm leading-6 placeholder:text-slate-400"
                placeholder="Examples: too expensive, too bulky, wrong style, not for the right use case, or not premium enough."
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-500">
                {retryCount >= MAX_REFINEMENT_RETRIES
                  ? 'You can start a new search if this needs a different direction.'
                  : `Retry ${retryCount + 1} of ${MAX_REFINEMENT_RETRIES}. Each retry needs a reason, so this stays focused.`}
              </p>
              <Button
                type="button"
                disabled={!isRetryReady || isRetrying || !retryFeedback.trim()}
                className="h-11 rounded-2xl bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90"
                onClick={onRetryWithFeedback}
              >
                {isRetrying ? 'Refreshing your picks...' : 'Try again with this feedback'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!hasStartedSearch && !errorMessage ? (
        <div className="rounded-[28px] border border-dashed border-stone-200 bg-stone-50/70 px-6 py-12 text-center sm:px-8">
          <div className="mx-auto max-w-2xl space-y-5 text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Guided search
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                Search first, refine while it loads.
              </h2>
              <p className="text-base leading-7 text-slate-600">
                Start with the product, then let Focamai ask the more useful follow-up instead of
                making you fill out a long form up front.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">Start with the product search</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Use the kind of search you&apos;d normally type into Google, like a product plus
                  the main use case.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">Refine in plain language</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  The next step is where budget, comfort, size, quality, or style help narrow that
                  initial product search.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">See six focused picks</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  You can view the cleaned shortlist right away, or let Focamai narrow it first.
                </p>
              </div>
            </div>
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
