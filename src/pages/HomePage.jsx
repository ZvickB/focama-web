import { useEffect, useState } from 'react'
import {
  ArrowUpRight,
  Clock3,
  Search,
  ShieldCheck,
  Star,
  Wand2,
  X,
} from 'lucide-react'
import ProductCard from '@/components/ProductCard.jsx'
import Textarea from '@/components/Textarea.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Button } from '@/components/ui/button.jsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.jsx'
import logo from '@/assets/logo_master_version.svg'
import { validateSearchInput } from '../../shared/search-input.js'

const starterPrompts = [
  {
    label: 'Lego for a creative 9-year-old',
    query: 'lego',
    details: 'For a 9 year old boy who enjoys imagination and building stories.',
  },
  {
    label: 'Comfortable office chair for long learning sessions',
    query: 'chair',
    details: 'For long study sessions at a desk with comfort and posture support as the main priority.',
  },
  {
    label: 'Travel stroller for easy airport use',
    query: 'stroller',
    details: 'For airport travel with a child, where easy folding and carrying matter more than extra accessories.',
  },
]

const RESULT_CARD_COUNT = 4
const RESULT_CARD_SLOTS = Array.from({ length: RESULT_CARD_COUNT }, (_, index) => index)

function ResultSkeleton() {
  function SkeletonBlock({ className }) {
    return (
      <div className={`relative overflow-hidden rounded-full bg-stone-200/80 ${className}`}>
        <div className="absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/75 to-transparent animate-shimmer" />
      </div>
    )
  }

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
              Raw search results now fill this preview while retailer links come later
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

async function fetchSearchResults({ query, details }) {
  const searchParams = new URLSearchParams()

  searchParams.set('query', query)

  if (details) {
    searchParams.set('details', details)
  }

  const response = await fetch(`/api/search?${searchParams.toString()}`)
  const rawBody = await response.text()
  let payload = {}

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody)
    } catch {
      throw new Error('The search function returned an invalid response. Check the local server or Vercel function logs.')
    }
  } else {
    throw new Error('The search function returned an empty response. Check the local server or Vercel function logs.')
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Search failed.')
  }

  return payload.results || []
}

function HomePage() {
  const [productQuery, setProductQuery] = useState(starterPrompts[0].query)
  const [details, setDetails] = useState(starterPrompts[0].details)
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [submittedDetails, setSubmittedDetails] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  async function runSearch(nextQuery, nextDetails) {
    const { error, isValid, normalizedDetails, normalizedQuery } = validateSearchInput(nextQuery, nextDetails)

    if (!isValid) {
      setErrorMessage(error)
      return
    }

    setIsLoading(true)
    setSelectedProduct(null)
    setErrorMessage('')
    setHasSearched(true)

    try {
      const nextResults = await fetchSearchResults({
        query: normalizedQuery,
        details: normalizedDetails,
      })

      setResults(nextResults)
      setSubmittedQuery(normalizedQuery)
      setSubmittedDetails(normalizedDetails)
    } catch (error) {
      setResults([])
      setErrorMessage(error instanceof Error ? error.message : 'Search failed.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    runSearch(productQuery, details)
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-6">
        <section className="rounded-[28px] border border-white/70 bg-white/72 p-4 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px] sm:p-5 lg:p-8">
          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-8">
            <div className="max-w-3xl space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Focama
                </p>
                <p className="mt-1 text-sm text-slate-600">Distraction-light buying guidance</p>
              </div>
              <Badge variant="secondary" className="rounded-full px-4 py-1 text-sm">
                Focused shopping, not endless browsing
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                  Search once. Get {RESULT_CARD_COUNT} calm, useful picks.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-lg">
                  Focama is designed to help users describe what they need, see a short curated set
                  of options, and move toward a retailer without the usual noise.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-stone-200 bg-stone-50/80 p-4">
                  <Search className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm font-medium text-slate-900">Two-part search</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Product plus context for a more relevant shortlist.
                  </p>
                </div>
                <div className="rounded-3xl border border-stone-200 bg-stone-50/80 p-4">
                  <Wand2 className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm font-medium text-slate-900">Curated results</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {RESULT_CARD_COUNT} AI-picked cards from a cleaned shopping candidate pool.
                  </p>
                </div>
                <div className="rounded-3xl border border-stone-200 bg-stone-50/80 p-4">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm font-medium text-slate-900">Low-distraction flow</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    A calmer way to get to the product you already meant to buy.
                  </p>
                </div>
              </div>
            </div>

            <Card className="w-full rounded-[28px] border-stone-200/80 bg-[#f8f3eb] shadow-none sm:rounded-[32px] lg:max-w-xl">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className="rounded-full bg-primary px-3 py-1 text-primary-foreground hover:bg-primary">
                    Search builder
                  </Badge>
                  <span className="text-sm text-slate-500">Live search route</span>
                </div>
                <CardTitle className="text-2xl text-slate-900">Describe what you need</CardTitle>
                <CardDescription className="text-base leading-7 text-slate-600">
                  The backend now cleans the shopping results first, then uses AI to choose the
                  final cards from that candidate pool.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  productQuery={productQuery}
                  audience={details}
                  onAudienceChange={setProductQuery}
                  onDetailsChange={setDetails}
                  onSubmit={handleSubmit}
                  disabled={isLoading}
                />
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr] lg:gap-6">
          <Card className="order-2 rounded-[28px] border-white/70 bg-white/72 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px] lg:order-1">
            <CardHeader className="flex flex-col gap-4">
              <div className="space-y-2">
                <Badge variant="outline" className="rounded-full bg-stone-50 px-3 py-1">
                  Recommended picks
                </Badge>
                <CardTitle className="text-2xl text-slate-900 sm:text-3xl">
                  {isLoading
                    ? 'Curating your options...'
                    : hasSearched
                      ? `Top results for "${submittedQuery}"`
                      : 'Your focused picks will appear here'}
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  {isLoading
                    ? 'Cleaning candidates and preparing AI-picked cards.'
                    : hasSearched
                      ? submittedDetails
                      : 'Enter a product topic and context, then press Get product picks to test the full AI selection flow.'}
                </CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Tap a card for details
                </div>
                <p className="max-w-md text-sm leading-6 text-slate-500 sm:text-right">
                  These cards now come from a cleaned candidate pool with AI making the final
                  selection. Retailer links still come later.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {errorMessage ? (
                <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              {isLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-4 flex items-center gap-3 rounded-full border border-stone-200/80 bg-stone-50/90 px-4 py-2.5 text-sm text-slate-600 sm:mb-5"
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inset-0 rounded-full bg-primary/25 animate-soft-pulse" />
                    <span className="relative mt-[1px] h-2.5 w-2.5 rounded-full bg-primary/70" />
                  </span>
                  <span>Searching products, cleaning candidates, and preparing the cards...</span>
                  <span className="hidden h-px flex-1 rounded-full bg-gradient-to-r from-primary/35 via-primary/10 to-transparent animate-soft-pulse sm:block" />
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3">
                {isLoading
                  ? RESULT_CARD_SLOTS.map((index) => (
                      <div key={index}>
                        <ResultSkeleton />
                      </div>
                    ))
                  : results.map((item) => (
                      <div key={item.id}>
                        <ProductCard {...item} onSelect={() => setSelectedProduct(item)} />
                      </div>
                    ))}
              </div>
            </CardContent>
          </Card>

          <div className="order-1 space-y-4 lg:order-2 lg:space-y-6">
            <Card className="rounded-[28px] border-white/70 bg-white/72 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px]">
              <CardHeader>
                <div className="flex items-center gap-2 text-slate-700">
                  <Clock3 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-xl">Starting prompts</CardTitle>
                </div>
                <CardDescription className="leading-7 text-slate-600">
                  Quick examples for the current AI-assisted search flow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {starterPrompts.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-left text-sm text-slate-700 transition hover:border-primary/30 hover:bg-white"
                    onClick={() => {
                      setProductQuery(item.query)
                      setDetails(item.details)
                      runSearch(item.query, item.details)
                    }}
                  >
                    <span>{item.label}</span>
                    <Search className="h-4 w-4 text-slate-400" />
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-white/70 bg-[#16343a] text-white shadow-[0_30px_120px_-60px_rgba(8,47,73,0.7)] sm:rounded-[32px]">
              <CardHeader>
                <CardTitle className="text-xl">What the live version will add</CardTitle>
                <CardDescription className="leading-7 text-white/70">
                  The live product flow is getting more opinionated with each backend pass.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-6 text-white/80">
                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-4 w-4 text-amber-300" />
                  Amazon, Walmart, or other retailer destinations
                </div>
                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-4 w-4 text-amber-300" />
                  Better retailer links and richer product detail
                </div>
                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-4 w-4 text-amber-300" />
                  Real outbound links and history persistence
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-white/70 bg-white/72 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[32px]">
              <CardHeader>
                <div className="flex items-center gap-2 text-slate-700">
                  <Search className="h-4 w-4 text-primary" />
                  <CardTitle className="text-xl">Current search topics</CardTitle>
                </div>
                <CardDescription className="leading-7 text-slate-600">
                  The UI stays the same while the results now come from the backend route.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
                <p>Lego gifts for imaginative 9-year-olds</p>
                <p>Simple focus-friendly desk accessories</p>
                <p>Travel stroller recommendations for airport use</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
      {selectedProduct ? (
        <ProductDetailModal item={selectedProduct} onClose={() => setSelectedProduct(null)} />
      ) : null}
    </main>
  )
}

export default HomePage
