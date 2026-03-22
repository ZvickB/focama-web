import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Check,
  Clock3,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
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
import { validateSearchInput } from '../../shared/search-input.js'

const RESULT_CARD_COUNT = 4
const RESULT_CARD_SLOTS = Array.from({ length: RESULT_CARD_COUNT }, (_, index) => index)

function SkeletonBlock({ className }) {
  return (
    <div className={`relative overflow-hidden rounded-full bg-stone-200/80 ${className}`}>
      <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
    </div>
  )
}

function ResultSkeleton() {
  return (
    <div className="h-full overflow-hidden rounded-[24px] border border-stone-200/80 bg-white/85 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] sm:rounded-[28px]">
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

function ProductDetailModal({ item, onClose }) {
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
              <div className="flex items-center gap-3">
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

function createFallbackRefinementPrompt(productQuery) {
  return {
    prompt: `What should we optimize for with this ${productQuery}? Pick any that matter.`,
    helperText: 'Choose multiple priorities if you want, then add anything else in your own words.',
    suggestedPriorities: ['price', 'comfort', 'quality', 'durability', 'style', 'ease of use'],
    followUpPlaceholder:
      'Examples: for a small apartment, for daily commuting, needs to feel premium, under $200, easy to clean, for a child, or should last a long time.',
  }
}

async function readJsonResponse(response) {
  const rawBody = await response.text()
  let payload = {}

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody)
    } catch {
      throw new Error('The server returned an invalid response. Check the local server or Vercel logs.')
    }
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.')
  }

  return payload
}

async function fetchDiscoveryResults(query) {
  const searchParams = new URLSearchParams({ query })
  const response = await fetch(`/api/search/discover?${searchParams.toString()}`)
  return readJsonResponse(response)
}

async function fetchRefinementPrompt(query) {
  const searchParams = new URLSearchParams({ query })
  const response = await fetch(`/api/search/refine?${searchParams.toString()}`)
  return readJsonResponse(response)
}

async function finalizeGuidedSearch({ candidatePool, priorities, followUpNotes }) {
  const response = await fetch('/api/search/finalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      candidatePool,
      priorities,
      followUpNotes,
    }),
  })

  return readJsonResponse(response)
}

function HomePage() {
  const [productQuery, setProductQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [hasStartedSearch, setHasStartedSearch] = useState(false)
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [candidatePool, setCandidatePool] = useState(null)
  const [previewResults, setPreviewResults] = useState([])
  const [results, setResults] = useState([])
  const [selectionMeta, setSelectionMeta] = useState(null)
  const [refinementPrompt, setRefinementPrompt] = useState(null)
  const [selectedPriorities, setSelectedPriorities] = useState([])
  const [followUpNotes, setFollowUpNotes] = useState('')
  const [showPreviewResults, setShowPreviewResults] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const activeSearchIdRef = useRef(0)

  const finalizeMutation = useMutation({
    mutationFn: finalizeGuidedSearch,
    onMutate: () => {
      setErrorMessage('')
    },
    onSuccess: (payload) => {
      setCandidatePool(payload.candidatePool || null)
      setResults(payload.results || [])
      setSelectionMeta(payload.selection || null)
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to finalize the search.')
    },
  })

  const isFinalizing = finalizeMutation.isPending
  const isLoading = isDiscovering || isGeneratingPrompt || isFinalizing
  const hasFinalResults = results.length > 0
  const displayedResults = hasFinalResults ? results : showPreviewResults ? previewResults : []

  function togglePriority(priority) {
    setSelectedPriorities((currentValue) =>
      currentValue.includes(priority)
        ? currentValue.filter((item) => item !== priority)
        : [...currentValue, priority],
    )
  }

  function resetGuidedState(nextSubmittedQuery) {
    setHasStartedSearch(true)
    setSubmittedQuery(nextSubmittedQuery)
    setSelectedProduct(null)
    setErrorMessage('')
    setCandidatePool(null)
    setPreviewResults([])
    setResults([])
    setSelectionMeta(null)
    setSelectedPriorities([])
    setFollowUpNotes('')
    setShowPreviewResults(false)
    setRefinementPrompt(createFallbackRefinementPrompt(nextSubmittedQuery))
  }

  function beginGuidedSearch(event) {
    event.preventDefault()

    const { error, isValid, normalizedQuery } = validateSearchInput(productQuery, '')

    if (!isValid) {
      setErrorMessage(error)
      return
    }

    const nextSearchId = activeSearchIdRef.current + 1
    activeSearchIdRef.current = nextSearchId

    resetGuidedState(normalizedQuery)
    setIsDiscovering(true)
    setIsGeneratingPrompt(true)

    fetchDiscoveryResults(normalizedQuery)
      .then((payload) => {
        if (activeSearchIdRef.current !== nextSearchId) {
          return
        }

        setCandidatePool(payload.candidatePool || null)
        setPreviewResults(payload.previewResults || [])
      })
      .catch((error) => {
        if (activeSearchIdRef.current !== nextSearchId) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : 'Unable to start the search.')
      })
      .finally(() => {
        if (activeSearchIdRef.current === nextSearchId) {
          setIsDiscovering(false)
        }
      })

    fetchRefinementPrompt(normalizedQuery)
      .then((payload) => {
        if (activeSearchIdRef.current !== nextSearchId) {
          return
        }

        setRefinementPrompt(payload)
      })
      .catch(() => {
        if (activeSearchIdRef.current === nextSearchId) {
          setRefinementPrompt(createFallbackRefinementPrompt(normalizedQuery))
        }
      })
      .finally(() => {
        if (activeSearchIdRef.current === nextSearchId) {
          setIsGeneratingPrompt(false)
        }
      })
  }

  function handleFinalizeRefinement() {
    if (!candidatePool) {
      return
    }

    finalizeMutation.mutate({
      candidatePool,
      priorities: selectedPriorities,
      followUpNotes,
    })
  }

  function handleShowProductsNow() {
    setShowPreviewResults(true)
  }

  return (
    <main className="relative px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-4 sm:gap-6 xl:grid-cols-[minmax(360px,460px),minmax(0,1fr)] xl:items-start">
        <section className="rounded-[28px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px] sm:p-5 lg:p-8">
          <div className="space-y-5">
            <div className="space-y-3 xl:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Focama
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Start with the product. We&apos;ll help you think through the rest.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-lg">
                Tell Focama what you&apos;re shopping for. While products load in the background,
                the AI will help you narrow what matters most.
              </p>
            </div>

            <Card className="rounded-[28px] border-stone-200/80 bg-[#f8f3eb] shadow-none sm:rounded-[32px]">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Badge className="rounded-full bg-primary px-3 py-1 text-primary-foreground hover:bg-primary">
                    Guided search
                  </Badge>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Search first, refine while it loads
                  </div>
                </div>
                <CardTitle className="text-2xl text-slate-900">What are you shopping for?</CardTitle>
                <CardDescription className="text-base leading-7 text-slate-600">
                  Start with the product. After that, Focama will ask a more useful follow-up than
                  a blank details box.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <form className="space-y-4" onSubmit={beginGuidedSearch}>
                  <div className="space-y-2">
                    <Label htmlFor="product-query" className="text-slate-700">
                      Product topic
                    </Label>
                    <Input
                      id="product-query"
                      value={productQuery}
                      onChange={(event) => setProductQuery(event.target.value)}
                      placeholder='Example: "office chair", "lego", or "travel stroller"'
                      className="h-12 rounded-2xl border-stone-200 bg-white/90 px-4 text-base placeholder:text-slate-400"
                      disabled={isLoading}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="h-12 w-full gap-2 rounded-2xl bg-primary text-base text-primary-foreground hover:bg-primary/90"
                  >
                    {isLoading ? 'Starting your search...' : 'Start search'}
                    {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </form>

                {hasStartedSearch ? (
                  <Card className="rounded-[24px] border-stone-200/80 bg-white/80 shadow-none">
                    <CardHeader className="space-y-3 pb-3">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <CardTitle className="text-lg">AI refinement</CardTitle>
                      </div>
                      <CardDescription className="leading-7 text-slate-600">
                        {refinementPrompt?.prompt || 'Thinking through what matters most for this search.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm leading-6 text-slate-600">
                        {refinementPrompt?.helperText ||
                          'Pick any priorities that matter, then add your own notes if useful.'}
                      </p>

                      <div className="space-y-2 rounded-2xl border border-stone-200/80 bg-stone-50/80 px-4 py-4">
                        <Button
                          type="button"
                          disabled={!candidatePool || isFinalizing}
                          className="h-11 w-full rounded-2xl bg-accent text-accent-foreground hover:bg-accent/90"
                          onClick={handleShowProductsNow}
                        >
                          Show products now
                        </Button>
                        <p className="text-xs leading-5 text-slate-500">
                          Skip AI refinement and view the current product set.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {(refinementPrompt?.suggestedPriorities || []).map((priority) => {
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
                          className="min-h-36 rounded-3xl border-stone-200 bg-white/90 px-4 py-3 text-base leading-7 placeholder:text-slate-400"
                          placeholder={
                            refinementPrompt?.followUpPlaceholder ||
                            'Examples: for a small apartment, for daily commuting, needs to feel premium, under $200, easy to clean, for a child, or should last a long time.'
                          }
                          disabled={isFinalizing}
                        />
                      </div>

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

                      <Button
                        type="button"
                        disabled={!candidatePool || isFinalizing}
                        className="h-12 w-full gap-2 rounded-2xl bg-primary text-base text-primary-foreground hover:bg-primary/90"
                        onClick={handleFinalizeRefinement}
                      >
                        {isFinalizing ? 'Applying your priorities...' : 'Show focused picks'}
                        {isFinalizing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="xl:sticky xl:top-6">
          <Card className="rounded-[28px] border-white/70 bg-white/72 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px] xl:flex xl:max-h-[calc(100vh-7rem)] xl:min-h-0 xl:flex-col xl:overflow-hidden">
            <CardHeader className="flex flex-col gap-4">
              <div className="space-y-2">
                <Badge variant="outline" className="rounded-full bg-stone-50 px-3 py-1">
                  Results
                </Badge>
                <CardTitle className="text-2xl text-slate-900 sm:text-3xl">
                  {isFinalizing
                    ? 'Finalizing your picks...'
                    : hasStartedSearch
                      ? `Focused picks for "${submittedQuery}"`
                      : 'Ready when you are'}
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  {hasFinalResults
                    ? 'These picks were finalized after your guided refinement.'
                    : hasStartedSearch
                      ? 'Products can load while the AI helps you think through what matters.'
                      : 'Start with one product topic, then refine the shortlist with AI guidance.'}
                </CardDescription>
              </div>
              {displayedResults.length > 0 || isLoading ? (
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Tap a card for details
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
              {errorMessage ? (
                <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              {isLoading && displayedResults.length === 0 ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-4 flex items-center gap-3 rounded-full border border-stone-200/80 bg-stone-50/90 px-4 py-2.5 text-sm text-slate-600 sm:mb-5"
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inset-0 rounded-full bg-primary/25 animate-soft-pulse" />
                    <span className="relative mt-[1px] h-2.5 w-2.5 rounded-full bg-primary/70" />
                  </span>
                  <span>Starting the search and preparing your guided follow-up...</span>
                  <span className="hidden h-px flex-1 rounded-full bg-gradient-to-r from-primary/35 via-primary/10 to-transparent animate-soft-pulse sm:block" />
                </div>
              ) : null}

              {selectionMeta && !isFinalizing ? (
                <div className="mb-4 rounded-3xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 text-sm text-slate-600 sm:mb-5">
                  <span className="font-medium text-slate-800">Selection path:</span> AI Help.
                  {selectionMeta.mode === 'ai'
                    ? ' The AI-picked set came from the cleaned candidate pool.'
                    : ' Rules-only fallback was used because the AI request failed.'}
                </div>
              ) : null}

              {isLoading && displayedResults.length === 0 ? (
                <div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
                  {RESULT_CARD_SLOTS.map((index) => (
                    <div key={index}>
                      <ResultSkeleton />
                    </div>
                  ))}
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
                      Use the guidance on the left for a more focused final set, or choose to show
                      the current products right away.
                    </p>
                    <div className="mx-auto max-w-sm space-y-2 pt-2">
                      <Button
                        type="button"
                        disabled={!candidatePool}
                        className="h-11 w-full rounded-2xl bg-accent text-accent-foreground hover:bg-accent/90"
                        onClick={handleShowProductsNow}
                      >
                        Show products now
                      </Button>
                      <p className="text-xs leading-5 text-slate-500">
                        Skip AI refinement and view the current product set.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {displayedResults.length > 0 ? (
                <div className="space-y-4">
                  {!hasFinalResults ? (
                    <div className="rounded-3xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 text-sm text-slate-600">
                      Preview products are ready. Use the AI refinement on the left to turn this
                      into a more focused final set.
                    </div>
                  ) : null}

                  <div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
                    {displayedResults.map((item) => (
                      <div key={item.id}>
                        <ProductCard {...item} onSelect={() => setSelectedProduct(item)} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {!isLoading && displayedResults.length === 0 && !errorMessage ? (
                <div className="rounded-[28px] border border-dashed border-stone-200 bg-stone-50/70 px-6 py-12 text-center sm:px-8">
                  <div className="mx-auto max-w-xl space-y-3">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                      <Clock3 className="h-4 w-4 text-slate-500" />
                    </div>
                    <p className="text-lg font-medium text-slate-900">
                      Your shortlist will appear here.
                    </p>
                    <p className="text-sm leading-6 text-slate-600 sm:text-base">
                      Start with the product. Then Focama can help you think through cost,
                      comfort, quality, style, or whatever else matters before finalizing the picks.
                    </p>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </div>
      {selectedProduct ? (
        <ProductDetailModal item={selectedProduct} onClose={() => setSelectedProduct(null)} />
      ) : null}
    </main>
  )
}

export default HomePage
