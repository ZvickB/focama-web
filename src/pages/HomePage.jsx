import { useEffect, useMemo, useState } from 'react'
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

const mockCatalog = {
  lego: [
    {
      id: 1,
      title: 'Story Builder Brick Set',
      subtitle: 'Creative favorite',
      price: '$24.99',
      rating: 4.8,
      reviewCount: 2143,
      description:
        'A flexible brick set with moving pieces, mini scenes, and enough parts for open-ended imaginative play.',
      reasons: ['Strong imaginative play value', 'Well-rated for ages 8-10', 'Balanced price for a gift'],
      image:
        'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 2,
      title: 'Junior Adventure Vehicle Kit',
      subtitle: 'Best value',
      price: '$17.49',
      rating: 4.5,
      reviewCount: 987,
      description:
        'Easy-to-build off-road vehicle set with bright colors and a strong balance between price and play time.',
      reasons: ['Lower price point', 'Quick win for younger builders', 'Simple set with broad appeal'],
      image:
        'https://images.unsplash.com/photo-1608889825103-eb5ed706fc64?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 3,
      title: 'Galaxy Explorer Build Pack',
      subtitle: 'Premium pick',
      price: '$39.95',
      rating: 4.9,
      reviewCount: 3588,
      description:
        'A larger build with space-themed pieces, hidden compartments, and a display-worthy finished result.',
      reasons: ['Best premium option', 'Excellent reviews volume', 'Feels more special as a present'],
      image:
        'https://images.unsplash.com/photo-1518331647614-7a1f04cd34cf?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 4,
      title: 'Mini City Creator Box',
      subtitle: 'Compact option',
      price: '$12.99',
      rating: 4.4,
      reviewCount: 641,
      description:
        'A compact set for smaller budgets that still gives enough variety for building scenes and little stories.',
      reasons: ['Budget-friendly', 'Compact box size', 'Still supports creative storytelling'],
      image:
        'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=900&q=80',
    },
  ],
  chair: [
    {
      id: 5,
      title: 'Daily Focus Desk Timer',
      subtitle: 'Simple utility',
      price: '$18.99',
      rating: 4.6,
      reviewCount: 1210,
      description:
        'A clean visual timer that helps structure work blocks without needing a distracting phone nearby.',
      reasons: ['Clear use case', 'Simple daily utility', 'Good ratings for routine use'],
      image:
        'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 6,
      title: 'Soft Light Reading Lamp',
      subtitle: 'Calm setup',
      price: '$29.50',
      rating: 4.7,
      reviewCount: 902,
      description:
        'Warm desk lighting with adjustable brightness, useful when you want a less harsh late-night setup.',
      reasons: ['Calmer lighting setup', 'Useful at home or office', 'Mid-range price point'],
      image:
        'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 7,
      title: 'Travel Storage Organizer',
      subtitle: 'Practical pick',
      price: '$21.00',
      rating: 4.3,
      reviewCount: 554,
      description:
        'Keeps smaller items separated and easy to grab without browsing through a larger pile or bag.',
      reasons: ['Practical organizer', 'Compact to carry', 'Solid budget pick'],
      image:
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 8,
      title: 'Minimal Water Bottle',
      subtitle: 'Everyday option',
      price: '$14.25',
      rating: 4.5,
      reviewCount: 1994,
      description:
        'A straightforward insulated bottle with a clean shape and durable finish for regular daily use.',
      reasons: ['Everyday utility', 'Large review count', 'Simple low-friction purchase'],
      image:
        'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=80',
    },
  ],
  stroller: [
    {
      id: 9,
      title: 'Fold-Quick Travel Stroller',
      subtitle: 'Airport favorite',
      price: '$149.00',
      rating: 4.7,
      reviewCount: 1218,
      description:
        'A compact stroller option built around faster folds, lighter carrying, and smoother airport transitions.',
      reasons: ['Compact folded shape', 'Good travel use case', 'Strong ratings volume'],
      image:
        'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 10,
      title: 'Carry-Friendly City Stroller',
      subtitle: 'Best value',
      price: '$119.50',
      rating: 4.4,
      reviewCount: 684,
      description:
        'A simpler travel stroller with enough convenience for airport use without pushing into premium pricing.',
      reasons: ['Lower cost option', 'Lighter to carry', 'Good balance of features'],
      image:
        'https://images.unsplash.com/photo-1544126592-807ade215a0b?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 11,
      title: 'Comfort Canopy Travel Stroller',
      subtitle: 'Balanced pick',
      price: '$179.00',
      rating: 4.6,
      reviewCount: 932,
      description:
        'A travel-oriented stroller with a nicer canopy and seat comfort for families who expect longer days out.',
      reasons: ['Better comfort tradeoff', 'Good mid-premium tier', 'Useful if travel days are long'],
      image:
        'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 12,
      title: 'One-Hand Fold Compact',
      subtitle: 'Convenience pick',
      price: '$139.00',
      rating: 4.5,
      reviewCount: 777,
      description:
        'A compact stroller focused on one-hand folding and quick transitions when bags and boarding are involved.',
      reasons: ['Helpful one-hand usability', 'Travel-friendly shape', 'Solid review base'],
      image:
        'https://images.unsplash.com/photo-1522771930-78848d9293e8?auto=format&fit=crop&w=900&q=80',
    },
  ],
  default: [
    {
      id: 13,
      title: 'Portable White Noise Machine',
      subtitle: 'Practical favorite',
      price: '$27.00',
      rating: 4.7,
      reviewCount: 1634,
      description:
        'A small sound machine that works well for travel, bedtime routines, or blocking light ambient noise.',
      reasons: ['Useful in several settings', 'Feels giftable without being flashy', 'Strong review count'],
      image:
        'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 14,
      title: 'Compact Desktop Fan',
      subtitle: 'Simple comfort pick',
      price: '$19.99',
      rating: 4.4,
      reviewCount: 882,
      description:
        'A compact fan that adds everyday comfort without taking over a desk or nightstand setup.',
      reasons: ['Small footprint', 'Easy utility purchase', 'Good mid-range option'],
      image:
        'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 15,
      title: 'Everyday Backpack Organizer',
      subtitle: 'Order-first option',
      price: '$23.50',
      rating: 4.3,
      reviewCount: 706,
      description:
        'An insert that helps divide a backpack or tote into simpler grab-and-go sections.',
      reasons: ['Practical for daily routines', 'Easy way to reduce clutter', 'Lower-cost choice'],
      image:
        'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=80',
    },
    {
      id: 16,
      title: 'Soft Glow Bedside Clock',
      subtitle: 'Calm premium pick',
      price: '$34.00',
      rating: 4.8,
      reviewCount: 1291,
      description:
        'A minimal bedside clock with low-glare lighting and a cleaner nighttime presence.',
      reasons: ['Feels more considered', 'Warm visual tone', 'Strong ratings signal'],
      image:
        'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80',
    },
  ],
}

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

function ResultSkeleton() {
  return (
    <div className="h-full overflow-hidden rounded-[24px] border border-stone-200/80 bg-white/85 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] sm:rounded-[28px]">
      <div className="h-44 animate-pulse bg-stone-200 sm:h-56" />
      <div className="space-y-4 p-5 sm:p-6">
        <div className="h-5 w-24 animate-pulse rounded-full bg-stone-200" />
        <div className="h-7 w-3/4 animate-pulse rounded-full bg-stone-200" />
        <div className="h-4 w-1/2 animate-pulse rounded-full bg-stone-200" />
        <div className="space-y-2 pt-2">
          <div className="h-4 w-full animate-pulse rounded-full bg-stone-200" />
          <div className="h-4 w-full animate-pulse rounded-full bg-stone-200" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-stone-200" />
        </div>
        <div className="h-11 w-full animate-pulse rounded-2xl bg-stone-200" />
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
              Focused preview before live marketplace links are wired in
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
                  Product links are still mocked while retailer integration is being wired up.
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

function HomePage() {
  const [productQuery, setProductQuery] = useState('')
  const [details, setDetails] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submittedQuery, setSubmittedQuery] = useState('lego')
  const [selectedProduct, setSelectedProduct] = useState(null)

  const results = useMemo(() => {
    const key = submittedQuery.trim().toLowerCase()
    return mockCatalog[key] ?? mockCatalog.default
  }, [submittedQuery])

  function handleSubmit(event) {
    event.preventDefault()
    setIsLoading(true)
    setSelectedProduct(null)

    window.setTimeout(() => {
      setSubmittedQuery(productQuery || 'default')
      setIsLoading(false)
    }, 1000)
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
                  Search once. Get four calm, useful picks.
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
                    Different price points and good ratings instead of endless pages.
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
                  <span className="text-sm text-slate-500">Mocked product flow</span>
                </div>
                <CardTitle className="text-2xl text-slate-900">Describe what you need</CardTitle>
                <CardDescription className="text-base leading-7 text-slate-600">
                  For now this uses mocked results so the product-search experience can be refined
                  before retailer APIs and ranking logic are connected.
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
                  {isLoading ? 'Curating your options...' : `Top results for "${submittedQuery}"`}
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  {isLoading
                    ? 'Showing skeleton cards for one second so the loading state is visible during the UI pass.'
                    : details}
                </CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Tap a card for details
                </div>
                <p className="max-w-md text-sm leading-6 text-slate-500 sm:text-right">
                  Results are mocked right now and will later be replaced by live retailer data.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3">
                {isLoading
                  ? Array.from({ length: 4 }).map((_, index) => (
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
                  Quick examples to kick off the search flow.
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
                      setSubmittedQuery(item.query)
                      setSelectedProduct(null)
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
                  This frontend slice is ready for API wiring next.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-6 text-white/80">
                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-4 w-4 text-amber-300" />
                  Walmart or other retailer results feed
                </div>
                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-4 w-4 text-amber-300" />
                  AI reranking with diversity and relevance
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
                  <CardTitle className="text-xl">Current mock topics</CardTitle>
                </div>
                <CardDescription className="leading-7 text-slate-600">
                  The current mocked catalog is enough to demonstrate the flow while the backend is
                  still being decided.
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
