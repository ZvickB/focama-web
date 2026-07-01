import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowUpRight, Bell, CheckCircle2, ChevronDown, Info, LoaderCircle, SearchCheck, Star, X } from 'lucide-react'

import logo from '@/assets/logo_master_version.svg'
import { Button } from '@/components/ui/button.jsx'
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import { useAuth } from '@/contexts/useAuth.js'
import { fetchProductDeepDive } from '@/components/home/guided-search/api.js'
import { formatDisplayPrice } from '@/lib/formatDisplayPrice.js'
import { getUserFacingDescription } from '@/components/home/homeContentUtils.js'
import { getProductDisplayTitle } from '@/lib/productTitle.js'
import { getRetailerDisplayName } from '@/lib/retailerLabel.js'
import { getDeliverySignal } from '@/components/home/primeEligibility.js'
import { useWatches } from '@/components/watch/useWatches.js'

const MotionDiv = motion.div
const FOCUSABLE_MODAL_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getRatingValue(rating) {
  if (rating === null || rating === undefined || rating === '' || typeof rating === 'boolean') {
    return null
  }

  const ratingValue = Number(rating)
  return Number.isFinite(ratingValue) ? ratingValue : null
}

function formatReviewCount(reviewCount) {
  const reviewCountValue = Number(reviewCount)

  if (!Number.isFinite(reviewCountValue) || reviewCountValue <= 0) {
    return 'No reviews'
  }

  return `${reviewCountValue.toLocaleString()} reviews`
}

function formatRatingsReviewsFact(rating, reviewCount) {
  const ratingValue = getRatingValue(rating)
  const reviewText = formatReviewCount(reviewCount)

  if (ratingValue && reviewText !== 'No reviews') {
    return `${ratingValue.toFixed(1)} stars · ${reviewText}`
  }

  if (ratingValue) return `${ratingValue.toFixed(1)} stars`
  return reviewText
}

function BreathingDots({ className = '' }) {
  const dots = [
    { className: 'bg-primary', delay: '0ms' },
    { className: 'bg-accent', delay: '220ms' },
    { className: 'bg-primary', delay: '440ms' },
  ]

  return (
    <span
      role="status"
      aria-label="Recommendation details loading"
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      {dots.map((dot, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full animate-soft-pulse ${dot.className}`}
          style={{ animationDelay: dot.delay }}
        />
      ))}
    </span>
  )
}

function ProductFacts({ displayPrice, item }) {
  const deliverySignal = getDeliverySignal(item)
  const facts = [
    ['Price', displayPrice],
    ['Ratings/reviews', formatRatingsReviewsFact(item.rating, item.reviewCount)],
    deliverySignal ? ['Delivery', deliverySignal.value] : null,
  ].filter(Boolean)

  return (
    <section className="rounded-2xl border border-[#eadfce] bg-white/92 p-4 shadow-[0_14px_36px_-30px_rgba(120,87,63,0.2)]">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#80573f]">
        At a glance
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl bg-[#fbf7f1] px-3 py-2">
            <dt className="text-xs font-medium text-slate-400">{label}</dt>
            <dd className="mt-0.5 truncate font-semibold text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function ReasoningPanel({
  caveat,
  fitReason,
  isEnrichmentSettled,
}) {
  if (fitReason) {
    return (
      <MotionDiv
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-3 rounded-2xl border border-[#d9e6e8] bg-white/94 p-4 shadow-[0_14px_36px_-30px_rgba(15,97,117,0.18)]"
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary">
          <CheckCircle2 className="h-4 w-4" />
          Why this pick
        </div>
        <p className="text-sm leading-6 text-slate-700">{fitReason}</p>
        {caveat ? (
          <div className="border-t border-[#d9e6e8] pt-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#80573f]">
              <Info className="h-4 w-4" />
              Worth knowing
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{caveat}</p>
          </div>
        ) : null}
      </MotionDiv>
    )
  }

  if (isEnrichmentSettled) {
    return (
      <div className="rounded-2xl border border-[#e8ddcf] bg-white/88 p-4 text-sm leading-6 text-slate-500">
        Extra analysis wasn&apos;t available for this pick right now.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#e8ddcf] bg-white/88 p-4 text-sm text-slate-500">
      <BreathingDots />
    </div>
  )
}

function ProductNotes({
  bulletsExpanded,
  displayedBullets,
  featureBullets,
  itemId,
  onExpand,
  shouldCollapseBullets,
  userFacingDescription,
}) {
  if (featureBullets.length > 0) {
    return (
      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
          Product notes
        </p>
        <ul className="space-y-1.5">
          {displayedBullets.map((bullet, index) => (
            <li
              key={`${itemId}-feature-bullet-${index}`}
              className="flex items-start gap-2 text-sm leading-6 text-slate-600"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b18c6f]" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
        {shouldCollapseBullets && !bulletsExpanded ? (
          <button
            type="button"
            className="py-1 text-sm text-slate-500 transition-colors hover:text-slate-700"
            onClick={onExpand}
          >
            Show all details
          </button>
        ) : null}
      </section>
    )
  }

  if (!userFacingDescription) {
    return null
  }

  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
        Product notes
      </p>
      <p className="text-sm leading-6 text-slate-600">{userFacingDescription}</p>
    </section>
  )
}

function formatDeepDiveMoney(value, currency = 'USD') {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return ''
  }

  return new Intl.NumberFormat(currency === 'CAD' ? 'en-CA' : 'en-US', {
    currency: currency === 'CAD' ? 'CAD' : 'USD',
    style: 'currency',
  }).format(numericValue)
}

function parsePositivePrice(value) {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null
  }

  const numericValue = Number(String(value).replace(/[^0-9.]/g, ''))
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null
}

function parseReviewSignal(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  const dashSplit = text.match(/^(.+?)\s*—\s*(.+)$/)

  if (dashSplit) {
    return { label: dashSplit[1].trim(), detail: dashSplit[2].trim() }
  }

  const parenSplit = text.match(/^(.+?)\s*\((.+)\)$/)

  return {
    detail: parenSplit ? parenSplit[2].trim() : '',
    label: (parenSplit ? parenSplit[1] : text).trim(),
  }
}

function DeepDiveSourceNote({ product }) {
  const dimensions = Array.isArray(product?.variantDimensions) ? product.variantDimensions : []
  const specific = dimensions
    .filter((d) => d.yourPick)
    .map((d) => `your pick is ${d.yourPick} — reviews may include other ${d.dimension}s`)
  const unmatched = dimensions
    .filter((d) => !d.yourPick && d.optionCount > 1)
    .map((d) => `${d.dimension} (${d.optionCount} options)`)

  if (specific.length === 0 && unmatched.length === 0) {
    return (
      <p className="text-xs leading-5 text-slate-400">
        Reviews and prices are from Google Shopping for this product family. Check the store page before buying.
      </p>
    )
  }

  return (
    <div className="space-y-1 text-xs leading-5 text-slate-400">
      <p>Reviews and prices are from Google Shopping for this product family:</p>
      <ul className="list-disc pl-4 space-y-0.5">
        {specific.map((note) => (
          <li key={note} className="capitalize">{note}</li>
        ))}
        {unmatched.length > 0 ? (
          <li>This product comes in multiple {unmatched.join(', ')} — reviews cover all of them</li>
        ) : null}
      </ul>
    </div>
  )
}

function RetailerDecisionBar({ displayPrice, item, onClose, onRetailerClick, retailerLabel }) {
  return (
    <div className="border-t border-[#eadfd2] bg-white/94 px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="order-2 flex items-center gap-1.5 py-1 text-sm text-slate-500 transition-colors hover:text-slate-700 sm:order-1"
          onClick={onClose}
        >
          <span aria-hidden="true">{'<-'}</span>
          Back to results
        </button>

        <div className="order-1 flex flex-col gap-3 sm:order-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="min-w-0 text-left sm:text-right">
            <p className="text-lg font-semibold leading-6 text-primary">{displayPrice}</p>
            {item.link ? (
              <p className="text-xs leading-5 text-slate-400">
                As an Amazon Associate, Focamai may earn from qualifying purchases.
              </p>
            ) : null}
          </div>
          {item.link ? (
          <Button
            asChild
            className="h-12 w-full gap-2 rounded-2xl bg-accent px-5 text-accent-foreground shadow-[0_14px_32px_-24px_rgba(229,155,38,0.38)] hover:bg-accent/90 sm:w-auto"
          >
            <a href={item.link} target="_blank" rel="noreferrer" onClick={onRetailerClick}>
              {`View on ${retailerLabel || item.subtitle || 'retailer'}`}
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
          ) : (
            <Button
              type="button"
              disabled
              className="h-12 w-full gap-2 rounded-2xl bg-[#ede3d6] text-slate-500 sm:w-auto"
            >
              Retailer link unavailable
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProductDetailModal({
  amazonDomain = '',
  discoveryToken = '',
  item,
  isEnrichmentSettled = false,
  searchQuery = '',
  showRecommendationAnalysis = true,
  onClose,
  onRetailerClick,
}) {
  const fitReason = item?.fit_reason || item?.fitReason || ''
  const caveat = item?.caveat || ''
  const featureBullets = Array.isArray(item?.feature_bullets) ? item.feature_bullets : []
  const { selectedAmazonDomain, resolvedAmazonDomain } = useAmazonStore()
  const retailerLabel = getRetailerDisplayName({
    subtitle: item?.subtitle,
    selectedAmazonDomain,
    resolvedAmazonDomain,
  })
  const [bulletsExpanded, setBulletsExpanded] = useState(false)
  const [fullTitleExpanded, setFullTitleExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const isImageHidden = item?.moderation?.outcome === 'hide_image'
  const [activeView, setActiveView] = useState('product')
  const [deepDive, setDeepDive] = useState(null)
  const [deepDiveError, setDeepDiveError] = useState('')
  const [deepDiveLoading, setDeepDiveLoading] = useState(false)
  const [showingUsFallback, setShowingUsFallback] = useState(false)
  const [watchMessage, setWatchMessage] = useState('')
  const [watchSaving, setWatchSaving] = useState(false)
  const { session, user } = useAuth()
  const {
    create: createWatch,
    watches,
  } = useWatches({ enabled: Boolean(user && showRecommendationAnalysis) })
  const dialogRef = useRef(null)
  const previouslyFocusedElementRef = useRef(null)

  const ddOffers = Array.isArray(deepDive?.offers) ? deepDive.offers : []
  const ddReviews = deepDive?.reviews || {}
  const ddLimitedMessage = deepDive?.limitedData?.message || ''
  const ddIsGated = deepDive?.status === 'gated'
  const ddIsAmbiguous = Boolean(deepDive?.ambiguous)
  const ddHasLoaded = Boolean(deepDive || deepDiveError)
  const isCanadianMarket = /amazon\.ca/i.test(amazonDomain)
  const canOfferUsFallback = isCanadianMarket && ddHasLoaded && !ddIsGated && !ddLimitedMessage && !deepDiveLoading && ddOffers.length === 0 && !showingUsFallback
  const deepDiveEligibility = item?.deepDiveEligibility || null
  const canShowDeepDiveButton =
    showRecommendationAnalysis &&
    ['show', 'maybe'].includes(deepDiveEligibility?.recommendation)
  const deepDiveButtonLabel = ddHasLoaded
    ? 'Back to Deep Dive'
    : deepDiveEligibility?.recommendation === 'maybe' || deepDiveEligibility?.mode === 'reviews_only'
      ? 'Check reviews and other stores'
      : 'Deep dive — store prices and reviews'
  const asin = String(item?.asin || item?.product_id || item?.id || '').trim()
  const watchPrice = parsePositivePrice(
    item?.numericPrice ?? item?.extracted_price ?? item?.price_value ?? item?.price,
  )
  const existingWatch = watches.find((watch) =>
    watch.asin === asin && watch.amazonDomain === (amazonDomain || 'amazon.com')
  )
  const canCreateWatch = Boolean(showRecommendationAnalysis && asin && watchPrice)

  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll(FOCUSABLE_MODAL_SELECTOR),
      ).filter(
        (element) =>
          element instanceof HTMLElement &&
          !element.hasAttribute('disabled') &&
          element.getAttribute('aria-hidden') !== 'true' &&
          element.offsetParent !== null,
      )

      if (focusableElements.length === 0) {
        event.preventDefault()
        dialogRef.current.focus({ preventScroll: true })
        return
      }

      const firstFocusableElement = focusableElements[0]
      const lastFocusableElement = focusableElements[focusableElements.length - 1]

      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault()
        firstFocusableElement.focus()
        return
      }

      if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault()
        lastFocusableElement.focus()
        return
      }

      if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault()
        firstFocusableElement.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.setTimeout(() => {
      dialogRef.current?.focus({ preventScroll: true })
    }, 0)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocusedElementRef.current instanceof HTMLElement) {
        previouslyFocusedElementRef.current.focus({ preventScroll: true })
      }
    }
  }, [onClose])

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setBulletsExpanded(false)
      setFullTitleExpanded(false)
      setImgError(false)
      setActiveView('product')
      setDeepDive(null)
      setDeepDiveError('')
      setDeepDiveLoading(false)
      setShowingUsFallback(false)
      setWatchMessage('')
      setWatchSaving(false)
    }, 0)

    return () => {
      window.clearTimeout(resetTimer)
    }
  }, [item?.id])

  async function fetchDeepDive() {
    if (!session?.access_token || !discoveryToken || !searchQuery || !item?.id) return

    setDeepDiveError('')
    setDeepDiveLoading(true)

    try {
      const payload = await fetchProductDeepDive({
        amazonDomain,
        candidateId: item.id,
        discoveryToken,
        query: searchQuery,
        token: session.access_token,
      })
      setDeepDive(payload)
    } catch (error) {
      setDeepDiveError(error instanceof Error ? error.message : 'Deep Dive was limited this time.')
    } finally {
      setDeepDiveLoading(false)
    }
  }

  function handleDeepDiveClick() {
    if (!user || !session?.access_token) {
      window.dispatchEvent(new CustomEvent('focamai:open-auth'))
      return
    }

    if (!discoveryToken || !searchQuery || !item?.id) {
      setDeepDiveError('Deep Dive needs a finalized search session before it can run.')
      setActiveView('deepdive')
      return
    }

    setActiveView('deepdive')
    if (!deepDive) fetchDeepDive()
  }

  async function handleWatchPriceClick() {
    if (!user) {
      window.dispatchEvent(new CustomEvent('focamai:open-auth'))
      return
    }

    if (existingWatch) {
      setWatchMessage('Already watching this product.')
      return
    }

    if (!canCreateWatch) {
      setWatchMessage('This product needs a current Amazon price before Focamai can watch it.')
      return
    }

    setWatchMessage('')
    setWatchSaving(true)

    try {
      await createWatch({
        amazonDomain: amazonDomain || 'amazon.com',
        asin,
        baselinePrice: watchPrice,
        imageUrl: item.image || '',
        productTitle: displayTitle || item.title || asin,
        productUrl: item.link || '',
        targetPrice: null,
        thresholdPct: 5,
      })
      setWatchMessage('Watching this price.')
    } catch (error) {
      setWatchMessage(error?.message || 'Unable to add this watch right now.')
    } finally {
      setWatchSaving(false)
    }
  }

  async function handleUsFallbackClick() {
    if (!session?.access_token || !item?.id) return

    setDeepDiveLoading(true)
    setShowingUsFallback(true)

    try {
      const payload = await fetchProductDeepDive({
        amazonDomain: 'amazon.com',
        candidateId: item.id,
        crossMarketFallback: true,
        discoveryToken,
        query: searchQuery,
        token: session.access_token,
      })
      setDeepDive((prev) => ({
        ...prev,
        offers: Array.isArray(payload?.offers) ? payload.offers : [],
        ambiguous: prev?.ambiguous || payload?.ambiguous,
      }))
    } catch {
      setDeepDiveError('Could not load US retailer prices.')
    } finally {
      setDeepDiveLoading(false)
    }
  }

  if (!item) {
    return null
  }

  const userFacingDescription = getUserFacingDescription(item.productDescription || item.description)
  const displayPrice = formatDisplayPrice(item.price)
  const rawTitle = String(item.title || '').replace(/\s+/g, ' ').trim()
  const displayTitle = getProductDisplayTitle(rawTitle)
  const hasCleanedTitle = Boolean(rawTitle && displayTitle && rawTitle !== displayTitle)
  const fullTitleLabel = 'Full source title'
  const shouldCollapseBullets = featureBullets.length >= 5
  const displayedBullets =
    shouldCollapseBullets && !bulletsExpanded ? featureBullets.slice(0, 3) : featureBullets

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[#ece1d5] bg-white shadow-[0_30px_90px_-54px_rgba(70,51,38,0.36)] lg:max-h-[88vh] lg:max-w-4xl lg:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex justify-end border-b border-[#f0e7dc] bg-white/96 px-4 py-2 shadow-[0_10px_24px_-22px_rgba(120,87,63,0.22)] sm:px-5 sm:py-2.5">
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
            aria-label="Close product details"
            className="h-8 w-8 rounded-full p-0 text-slate-500 hover:bg-[#f5eee6] hover:text-slate-700 sm:h-9 sm:w-9"
            onClick={onClose}
          >
            <X className="h-4 w-4 sm:h-[1.05rem] sm:w-[1.05rem]" />
          </Button>
        </div>

        <div
          className="relative grid flex-1 gap-6 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:gap-8 sm:px-6 lg:min-h-0 lg:grid-cols-[2fr_3fr] lg:gap-8 lg:overflow-hidden lg:px-8"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div
            className="flex min-h-[16rem] overflow-hidden rounded-2xl border border-[#eee5da] bg-[#fbf7f1] shadow-[0_16px_48px_-34px_rgba(120,87,63,0.18)] sm:min-h-[20rem] lg:col-start-1 lg:min-h-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(250,246,240,0.92), rgba(255,255,255,0.96))',
            }}
          >
            {isImageHidden ? (
              <div className="flex h-full w-full items-center justify-center bg-[#fbf7f1] px-6">
                <p className="text-center text-sm font-medium text-slate-500">Image hidden for sensitive content</p>
              </div>
            ) : imgError || !item.image ? (
              <div className="flex h-full w-full items-center justify-center bg-stone-200/55">
                <img
                  src={logo}
                  alt=""
                  aria-hidden="true"
                  className="h-20 w-20 object-contain opacity-[0.14] sm:h-24 sm:w-24"
                />
              </div>
            ) : (
              <img
                src={item.image}
                alt={displayTitle || item.title}
                className="h-full w-full object-contain mix-blend-multiply"
                onError={() => setImgError(true)}
              />
            )}
          </div>

          <div
            className="relative flex flex-col gap-4 pr-2 sm:pr-3 lg:col-start-2 lg:min-h-0 lg:overflow-y-auto lg:pr-4"
            style={{ scrollbarGutter: 'stable' }}
          >
            {activeView === 'deepdive' ? (
              <>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
                    onClick={() => setActiveView('product')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to product
                  </button>
                  {ddHasLoaded && !deepDiveLoading ? (
                    <button
                      type="button"
                      className="ml-auto text-xs text-slate-400 transition-colors hover:text-slate-600"
                      onClick={fetchDeepDive}
                    >
                      Refresh
                    </button>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-[#eee5da] bg-[#fbf7f1] px-3 py-2.5">
                  <p className="text-sm font-semibold text-slate-900 line-clamp-1">{displayTitle || item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{displayPrice} on {retailerLabel || 'Amazon'}</p>
                </div>

                {deepDiveLoading ? (
                  <div
                    className="relative overflow-hidden rounded-2xl border border-[#d9e6e8] bg-[#f6fbfa] px-4 py-3 text-sm text-slate-600"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -translate-x-full bg-gradient-to-r from-transparent via-white/80 to-transparent animate-shimmer" />
                    <div className="relative flex items-center gap-3">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary/70 animate-soft-pulse" />
                      <span>Checking store offers and review signals...</span>
                    </div>
                    <div className="relative mt-3 grid grid-cols-[1fr_3rem] gap-3">
                      <div className="h-2 rounded-full bg-[#dcebea]" />
                      <div className="h-2 rounded-full bg-[#e9dfd1]" />
                    </div>
                  </div>
                ) : null}

                {deepDiveError ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    {deepDiveError}
                  </div>
                ) : null}

                {ddIsGated ? (
                  <div className="rounded-2xl border border-[#e5dacb] bg-[#fbf7f1] px-4 py-3 text-sm leading-6 text-slate-700">
                    {deepDive.error || 'More Deep Dives will be available soon.'}
                  </div>
                ) : null}

                {ddLimitedMessage && !ddIsGated ? (
                  <div className="rounded-2xl border border-[#e5dacb] bg-[#fbf7f1] px-4 py-3 text-sm leading-6 text-slate-600">
                    <p className="font-semibold text-slate-800">Store offers limited</p>
                    <p className="mt-1">{ddLimitedMessage}</p>
                  </div>
                ) : null}

                {ddIsAmbiguous && ddHasLoaded && !ddIsGated ? (
                  <p className="text-xs leading-5 text-amber-700">
                    Google Shopping returned multiple similar products. The reviews and offers below may cover a different color, size, or edition of this product — not just the exact one you picked.
                  </p>
                ) : null}

                {canOfferUsFallback ? (
                  <div className="rounded-2xl border border-[#e5dacb] bg-[#fbf7f1] px-4 py-3">
                    <p className="text-sm leading-6 text-slate-700">No cheaper prices from Canadian retailers.</p>
                    <button
                      type="button"
                      className="mt-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                      onClick={handleUsFallbackClick}
                    >
                      Show US retailer prices instead
                    </button>
                  </div>
                ) : null}

                {ddOffers.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {showingUsFallback ? 'US store offers (USD)' : 'Store offers'}
                    </p>
                    <div className="space-y-2">
                      {ddOffers.map((offer, index) => (
                        <div
                          key={`${offer.retailer}-${offer.url}-${index}`}
                          className="rounded-2xl border border-[#edf3f3] bg-[#f8fcfb] p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{offer.retailer}</p>
                              {offer.savingsVsAmazon?.amount ? (
                                <p className="mt-0.5 text-xs font-medium text-primary">
                                  Saves {formatDeepDiveMoney(offer.savingsVsAmazon.amount, offer.currency)}
                                </p>
                              ) : null}
                              {Array.isArray(offer.caveats) && offer.caveats.length > 0 ? (
                                <p className="mt-0.5 text-xs leading-5 text-amber-700">
                                  {offer.caveats[0]}
                                </p>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold text-primary">
                                {formatDeepDiveMoney(offer.knownTotal || offer.price, offer.currency)}
                              </p>
                              {offer.shipping ? (
                                <p className="text-xs text-slate-400">{offer.shipping}</p>
                              ) : null}
                              <a
                                href={offer.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                              >
                                Visit
                                <ArrowUpRight className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {ddReviews.summary ? (
                  <div className="space-y-2 border-t border-[#edf3f3] pt-4">
                    <p className="text-sm font-semibold text-slate-900">What reviewers say</p>
                    <p className="text-sm leading-6 text-slate-600">{ddReviews.summary}</p>
                    {Array.isArray(ddReviews.sources) && ddReviews.sources.length > 0 ? (
                      <p className="text-xs leading-5 text-slate-400">
                        Sources: {ddReviews.sources.join(', ')}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {Array.isArray(ddReviews.topInsights) && ddReviews.topInsights.length > 0 ? (
                  <div className="space-y-3 border-t border-[#edf3f3] pt-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Review signals</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">
                        Themes Google surfaced from available product reviews.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ddReviews.topInsights.slice(0, 6).map((insight, index) => (
                        <div
                          key={`${insight.text}-${index}`}
                          className="rounded-2xl border border-[#d9e6e8] bg-[#f8fcfb] px-3 py-2.5"
                        >
                          <p className="text-sm font-semibold leading-5 text-slate-800">
                            {parseReviewSignal(insight.text).label}
                          </p>
                          {parseReviewSignal(insight.text).detail ? (
                            <p className="mt-0.5 text-xs leading-5 text-slate-500">
                              {parseReviewSignal(insight.text).detail}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {Array.isArray(ddReviews.criticRatings) && ddReviews.criticRatings.length > 0 ? (
                  <div className="space-y-2 border-t border-[#edf3f3] pt-4">
                    <p className="text-sm font-semibold text-slate-900">Critic ratings</p>
                    <div className="space-y-1">
                      {ddReviews.criticRatings.slice(0, 4).map((rating, index) => (
                        <p key={`${rating.source}-${index}`} className="text-sm leading-6 text-slate-600">
                          <span className="font-medium text-slate-800">{rating.source || 'Review source'}</span>
                          {rating.rating ? `: ${rating.rating}` : ''}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}

                {Array.isArray(ddReviews.userReviews) && ddReviews.userReviews.length > 0 ? (
                  <div className="space-y-3 border-t border-[#edf3f3] pt-4">
                    <p className="text-sm font-semibold text-slate-900">Buyer reviews</p>
                    <div className="space-y-2">
                      {ddReviews.userReviews.slice(0, 4).map((review, index) => (
                        <div
                          key={`${review.source}-${review.date}-${index}`}
                          className="rounded-2xl border border-[#edf3f3] bg-[#f8fcfb] px-3 py-2.5"
                        >
                          {review.rating ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-amber-600">
                                {'★'.repeat(Math.min(Math.max(Math.round(Number(review.rating)), 0), 5))}
                                {'☆'.repeat(5 - Math.min(Math.max(Math.round(Number(review.rating)), 0), 5))}
                              </span>
                              <span className="text-xs text-slate-400">
                                {[review.source, review.date].filter(Boolean).join(' · ')}
                              </span>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400">
                              {[review.source, review.date].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          <p className="mt-1 text-sm leading-6 text-slate-600 line-clamp-3">{review.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {ddHasLoaded && !ddIsGated && !ddLimitedMessage ? (
                  <div className="border-t border-[#edf3f3] pt-3">
                    <DeepDiveSourceNote product={deepDive?.product} />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <h2
                    id="product-detail-title"
                    className="text-xl font-semibold leading-snug tracking-tight text-slate-900 sm:text-2xl"
                  >
                    {displayTitle || item.title}
                  </h2>
                  {hasCleanedTitle ? (
                    <div className="max-w-full">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full py-0 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700"
                        aria-expanded={fullTitleExpanded}
                        onClick={() => setFullTitleExpanded((currentValue) => !currentValue)}
                      >
                        {fullTitleExpanded ? 'Hide full title' : fullTitleLabel}
                        <ChevronDown
                          className={`h-3 w-3 transition-transform duration-200 ${
                            fullTitleExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {fullTitleExpanded ? (
                        <p className="mt-0.5 text-xs leading-5 text-slate-500">{rawTitle}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          className={`h-3.5 w-3.5 ${
                            index < Math.round(getRatingValue(item.rating) || 0)
                              ? 'fill-current text-amber-500'
                              : 'text-[#d4c5b2]'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-slate-500">
                      {getRatingValue(item.rating)?.toFixed(1) || 'No rating'} - {formatReviewCount(item.reviewCount)}
                    </span>
                    {item.badgeLabel ? (
                      <span className="rounded-full border border-[#e6d8c5] bg-white/90 px-2.5 py-0.5 text-xs font-medium text-[#80573f]">
                        {item.badgeLabel}
                      </span>
                    ) : null}
                  </div>
                </div>

                <ProductFacts displayPrice={displayPrice} item={item} />

                {showRecommendationAnalysis ? (
                  <ReasoningPanel
                    caveat={caveat}
                    fitReason={fitReason}
                    isEnrichmentSettled={isEnrichmentSettled}
                  />
                ) : null}

                <ProductNotes
                  bulletsExpanded={bulletsExpanded}
                  displayedBullets={displayedBullets}
                  featureBullets={featureBullets}
                  itemId={item.id}
                  onExpand={() => setBulletsExpanded(true)}
                  shouldCollapseBullets={shouldCollapseBullets}
                  userFacingDescription={userFacingDescription}
                />

                {canShowDeepDiveButton ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#cfe1de] bg-white px-4 py-3 text-sm font-semibold text-primary shadow-[0_8px_24px_-18px_rgba(15,97,117,0.14)] transition hover:bg-[#f5fbf9]"
                    onClick={handleDeepDiveClick}
                  >
                    <SearchCheck className="h-4 w-4" />
                    {deepDiveButtonLabel}
                  </button>
                ) : null}

                {showRecommendationAnalysis ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={watchSaving || Boolean(user && existingWatch)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#eadfce] bg-white px-4 py-3 text-sm font-semibold text-[#80573f] shadow-[0_8px_24px_-18px_rgba(120,87,63,0.14)] transition hover:bg-[#fbf7f1] disabled:pointer-events-none disabled:opacity-60"
                      onClick={handleWatchPriceClick}
                    >
                      {watchSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                      {user && existingWatch ? 'Price watch added' : 'Watch price'}
                    </button>
                    {watchMessage ? (
                      <p className="text-center text-xs leading-5 text-slate-500">{watchMessage}</p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
        <RetailerDecisionBar
          displayPrice={displayPrice}
          item={item}
          onClose={onClose}
          onRetailerClick={onRetailerClick}
          retailerLabel={retailerLabel}
        />
      </MotionDiv>
    </MotionDiv>
  )
}

export default ProductDetailModal
