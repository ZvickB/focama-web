import { useEffect, useId } from 'react'
import {
  ArrowUpRight,
  Check,
  Clock3,
  LoaderCircle,
  Search,
  Sparkles,
  Star,
  WandSparkles,
  X,
} from 'lucide-react'

import ProductCard from '@/components/ProductCard.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Button } from '@/components/ui/button.jsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.jsx'
import { Input } from '@/components/ui/input.jsx'
import { Label } from '@/components/ui/label.jsx'
import { Textarea } from '@/components/ui/textarea.jsx'
import logo from '@/assets/logo_master_version.svg'
import { RESULT_CARD_SLOTS } from '@/components/home/useGuidedSearch.js'

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

export function ProductDetailModal({ item, onClose }) {
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
            <p className="text-sm text-slate-600">
              AI-picked product details with tradeoffs while retailer links come later
            </p>
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
              <p className="text-base leading-7 text-slate-600">{item.description}</p>
            </div>

            <Card className="rounded-[28px] border-stone-200/80 bg-white/80 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-slate-900">Why this pick stands out</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                {item.reasons.map((reason) => (
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
                <Button
                  type="button"
                  className="h-12 w-full gap-2 rounded-2xl bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  Retailer links coming next
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
                <p className="text-xs leading-5 text-slate-500">
                  This first backend slice only proves the raw search pipeline.
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

export function SearchForm({
  accentBadge,
  ctaLabel = 'Start search',
  helperText,
  heroTitle,
  isLoading,
  onSubmit,
  productQuery,
  setProductQuery,
  showTrustRow = true,
  suggestions = [],
}) {
  const inputId = useId()

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {accentBadge ? (
          <Badge className="rounded-full bg-white/80 px-3 py-1 text-slate-700 hover:bg-white/80">
            {accentBadge}
          </Badge>
        ) : null}
        <div className="space-y-3">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            {heroTitle}
          </h1>
          <p className="max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">{helperText}</p>
        </div>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="rounded-[28px] border border-white/70 bg-white/78 p-3 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor={inputId} className="sr-only">
                Product topic
              </Label>
              <Input
                id={inputId}
                aria-label="Product topic"
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder='Try "office chair", "lego set", or "travel stroller"'
                className="h-14 rounded-2xl border-stone-200 bg-white/90 px-4 text-base placeholder:text-slate-400"
                disabled={isLoading}
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="h-14 gap-2 rounded-2xl bg-primary px-6 text-base text-primary-foreground hover:bg-primary/90"
            >
              {isLoading ? 'Starting your search...' : ctaLabel}
              {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </form>

      {suggestions.length ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full border border-white/75 bg-white/70 px-3 py-2 text-sm text-slate-600 transition hover:bg-white hover:text-slate-900"
              onClick={() => setProductQuery(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {showTrustRow ? (
        <div className="flex flex-wrap gap-3 text-sm text-slate-600">
          <span className="rounded-full bg-white/70 px-3 py-2">No endless filters</span>
          <span className="rounded-full bg-white/70 px-3 py-2">Tradeoffs, not clutter</span>
          <span className="rounded-full bg-white/70 px-3 py-2">Focused shortlist of 6 picks</span>
        </div>
      ) : null}
    </div>
  )
}

export function RefinementCard({
  candidatePool,
  followUpNotes,
  isFinalizing,
  onFinalize,
  onShowNow,
  prompt,
  selectedPriorities,
  setFollowUpNotes,
  tone = 'default',
  togglePriority,
}) {
  const cardClassName =
    tone === 'concierge'
      ? 'rounded-[32px] border-stone-200/80 bg-[#fffaf2] shadow-[0_24px_80px_-52px_rgba(15,23,42,0.3)]'
      : 'rounded-[28px] border-stone-200/80 bg-white/82 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.24)]'

  return (
    <Card className={cardClassName}>
      <CardHeader className="space-y-3">
        <div className="flex items-center gap-2 text-slate-700">
          <WandSparkles className="h-4 w-4 text-primary" />
          <CardTitle className="text-xl">AI refinement</CardTitle>
        </div>
        <CardDescription className="leading-7 text-slate-600">
          {prompt?.prompt || 'Thinking through what matters most for this search.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-stone-200/80 bg-stone-50/80 px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            {candidatePool ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
            )}
            <span>
              {candidatePool
                ? 'Products are ready. Apply your priorities when you are.'
                : 'Focama is already gathering products in the background.'}
            </span>
          </div>
        </div>

        <p className="text-sm leading-6 text-slate-600">
          {prompt?.helperText || 'Pick any priorities that matter, then add your own notes if useful.'}
        </p>

        <div className="flex flex-wrap gap-2">
          {(prompt?.suggestedPriorities || []).map((priority) => {
            const isSelected = selectedPriorities.includes(priority)

            return (
              <button
                key={priority}
                type="button"
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-stone-200 bg-stone-50 text-slate-700 hover:border-primary/30 hover:bg-white'
                }`}
                onClick={() => togglePriority(priority)}
              >
                {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                {priority}
              </button>
            )
          })}
        </div>

        <div className="space-y-2">
          <Label htmlFor="follow-up-notes" className="text-slate-700">
            Anything else?
          </Label>
          <Textarea
            id="follow-up-notes"
            value={followUpNotes}
            onChange={(event) => setFollowUpNotes(event.target.value)}
            className="min-h-32 rounded-3xl border-stone-200 bg-white/90 px-4 py-3 text-base leading-7 placeholder:text-slate-400"
            placeholder={
              prompt?.followUpPlaceholder ||
              'Examples: under $200, easy to clean, small space, premium feel, or should last a long time.'
            }
            disabled={isFinalizing}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Button
            type="button"
            disabled={!candidatePool || isFinalizing}
            className="h-12 gap-2 rounded-2xl bg-primary text-base text-primary-foreground hover:bg-primary/90"
            onClick={onFinalize}
          >
            {isFinalizing ? 'Applying your priorities...' : 'Show focused picks'}
            {isFinalizing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!candidatePool || isFinalizing}
            className="h-12 rounded-2xl border-stone-300 bg-white text-slate-700"
            onClick={onShowNow}
          >
            Show products now
          </Button>
        </div>
        <p className="text-xs leading-5 text-slate-500">
          Skip AI refinement and view the current product set.
        </p>
      </CardContent>
    </Card>
  )
}

export function ResultsSection({
  displayedResults,
  errorMessage,
  hasFinalResults,
  hasStartedSearch,
  isLoading,
  onSelectProduct,
  selectionMeta,
  showPreviewResults,
  submittedQuery,
  variant = 'default',
}) {
  const quietLoading = variant === 'flow' || variant === 'hero' || variant === 'concierge'
  const isOpenVariant = variant === 'open'

  return (
    <section className="space-y-5">
      {isOpenVariant && !hasStartedSearch ? null : (
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
                : 'Once you start, Focama narrows the strongest options and shows clear tradeoffs instead of a noisy marketplace wall.'}
          </p>
        </div>
      )}

      {errorMessage ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {selectionMeta && !isLoading ? (
        <div className="rounded-3xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 text-sm text-slate-600">
          <span className="font-medium text-slate-800">Selection path:</span> AI Help.
          {selectionMeta.mode === 'ai'
            ? ' The AI-picked set came from the cleaned candidate pool.'
            : ' Rules-only fallback was used because the AI request failed.'}
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
            <span>
              {quietLoading
                ? 'Gathering options while the refinement step leads the way.'
                : 'Starting the search and preparing your guided follow-up...'}
            </span>
          </div>

          <div className={quietLoading ? 'max-h-[340px] overflow-hidden' : ''}>
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 sm:gap-5">
              {RESULT_CARD_SLOTS.map((index) => (
                <div key={index}>
                  <ResultSkeleton className={quietLoading ? 'opacity-90' : ''} />
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
              We&apos;re gathering options while you refine what matters.
            </p>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              The six product cards will settle here as soon as you refine the shortlist or choose
              to skip ahead.
            </p>
          </div>
        </div>
      ) : null}

      {displayedResults.length > 0 ? (
        <div className="space-y-4">
          {!hasFinalResults ? (
            <div className="rounded-3xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 text-sm text-slate-600">
              Preview products are ready. Use the AI refinement to turn this into a more focused
              final set.
            </div>
          ) : null}

          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 sm:gap-5">
            {displayedResults.map((item) => (
              <div key={item.id}>
                <ProductCard {...item} onSelect={() => onSelectProduct(item)} />
              </div>
            ))}
          </div>
        </div>
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
                Start with the product, then let Focama ask the more useful follow-up instead of
                making you fill out a long form up front.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">Start simple</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Enter the product first instead of filling out a long form up front.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">Think it through</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  The AI helps narrow what matters like comfort, price, quality, or style.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-4">
                <p className="text-sm font-medium text-slate-900">See six focused picks</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Products appear after the refinement step, or you can skip and show them now.
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
            <p className="text-lg font-medium text-slate-900">Your shortlist will appear here.</p>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              Start with the product, then Focama helps you think through cost, comfort, quality,
              style, or whatever else matters before finalizing the picks.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
