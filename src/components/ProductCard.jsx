import { useState } from 'react'
import { ChevronRight, Star } from 'lucide-react'
import {
  Card,
  CardContent,
} from '@/components/ui/card.jsx'
import { getUserFacingDescription, getUserFacingReasons } from '@/components/home/homeContentUtils.js'
import { getDeliverySignal } from '@/components/home/primeEligibility.js'
import logo from '@/assets/logo_master_version.svg'
import { formatDisplayPrice } from '@/lib/formatDisplayPrice.js'
import { getProductDisplayTitle } from '@/lib/productTitle.js'

function formatRatingsReviewsText(rating, reviewCount) {
  const ratingValue = Number(rating)
  const reviewCountValue = Number(reviewCount)
  const hasRating = Number.isFinite(ratingValue) && ratingValue > 0
  const hasReviews = Number.isFinite(reviewCountValue) && reviewCountValue > 0

  if (hasRating && hasReviews) {
    return `${ratingValue.toFixed(1)} stars · ${reviewCountValue.toLocaleString()} reviews`
  }

  if (hasRating) return `${ratingValue.toFixed(1)} stars`
  if (hasReviews) return `${reviewCountValue.toLocaleString()} reviews`
  return 'No rating'
}

function ProductBadge({ label }) {
  if (!label) {
    return null
  }

  const isPrimary = label === 'Best match'

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10">
      <div
        className={`inline-flex max-w-[min(220px,calc(100vw-4rem))] items-center gap-2 rounded-[20px] border px-3 py-2 text-xs font-medium leading-4 tracking-[0.01em] shadow-[0_14px_34px_-20px_rgba(15,23,42,0.45)] backdrop-blur ${
          isPrimary
            ? 'border-primary/60 bg-[linear-gradient(135deg,rgba(15,97,117,0.98),rgba(47,127,138,0.98))] text-primary-foreground'
            : 'border-[#e6d8c5] bg-[linear-gradient(180deg,rgba(251,246,240,0.98),rgba(255,255,255,0.96))] text-[#80573f]'
        }`}
        style={{ fontFamily: '"Instrument Sans", sans-serif', fontWeight: 500 }}
      >
        <span className="whitespace-normal break-words">{label}</span>
      </div>
    </div>
  )
}

function ProductCard({
  badgeLabel = '',
  description,
  delivery = '',
  image,
  isPrime = false,
  isPrimeEligible = false,
  is_prime = false,
  link,
  onRetailerClick,
  onSelect,
  price,
  primeEligible = false,
  rating,
  reasons = [],
  retailerLabel,
  reviewCount,
  subtitle,
  title,
}) {
  const [imgError, setImgError] = useState(false)
  const primaryReason = getUserFacingReasons(reasons)[0] || ''
  const userFacingDescription = getUserFacingDescription(description)
  const displayPrice = formatDisplayPrice(price)
  const displayTitle = getProductDisplayTitle(title)
  const deliverySignal = getDeliverySignal({
    delivery,
    isPrime,
    isPrimeEligible,
    is_prime,
    primeEligible,
  })

  return (
    <Card
      className="group relative h-full overflow-hidden rounded-[24px] border border-[#eadfce] bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(251,247,242,0.97))] shadow-[0_26px_80px_-50px_rgba(120,87,63,0.28)] transition duration-300 hover:-translate-y-1 hover:border-[#dbcbb8] hover:shadow-[0_36px_92px_-44px_rgba(120,87,63,0.34)]"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect?.()
        }
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,rgba(229,155,38,0),rgba(229,155,38,0.68),rgba(15,97,117,0.52),rgba(15,97,117,0))] opacity-70 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="relative overflow-hidden border-b border-[#f0e7da] bg-[linear-gradient(180deg,rgba(251,246,240,0.92),rgba(248,244,238,0.68))]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.1) 52%, rgba(15,97,117,0.06) 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-80"
          style={{
            background:
              'radial-gradient(circle at 20% 10%, rgba(229,155,38,0.12), transparent 34%), radial-gradient(circle at 82% 0%, rgba(15,97,117,0.1), transparent 30%)',
          }}
        />
        <ProductBadge label={badgeLabel} />
        {imgError ? (
          <div className="flex aspect-square w-full items-center justify-center bg-stone-200/55">
            <img
              src={logo}
              alt=""
              aria-hidden="true"
              className="h-20 w-20 object-contain opacity-[0.14] sm:h-24 sm:w-24"
            />
          </div>
        ) : (
          <div className="m-3 rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,246,240,0.98))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_38px_-28px_rgba(120,87,63,0.28)] sm:m-4">
            <img
              className="aspect-square w-full object-contain rounded-[20px] p-4 mix-blend-multiply transition duration-500 group-hover:scale-[1.025]"
              src={image}
              alt={displayTitle || title}
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
            />
          </div>
        )}
      </div>
      <CardContent className="space-y-3.5 p-4 sm:p-5">
        <div className="space-y-2.5">
          {/* TODO (multi-retailer): restore retailer badge here — show subtitle as a pill above the title */}
          <p className="line-clamp-2 text-[15px] leading-6 text-slate-900 sm:text-base">
            {displayTitle || title}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-primary">{displayPrice}</p>
            {deliverySignal ? (
              <span
                className="inline-flex items-center rounded-full border border-[#cfe1de] bg-[#f5fbf9] px-2 py-0.5 text-[11px] font-semibold leading-4 text-primary"
                title={deliverySignal.title}
              >
                {deliverySignal.label}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-amber-600">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star
                key={index}
                className={`h-4 w-4 ${
                  index < Math.round(rating) ? 'fill-current text-amber-500' : 'text-stone-300'
                }`}
              />
            ))}
          </div>
          <span className="font-medium text-slate-700">{formatRatingsReviewsText(rating, reviewCount)}</span>
        </div>
        {userFacingDescription ? (
          <p className="line-clamp-2 text-sm leading-6 text-slate-600">
            {userFacingDescription}
          </p>
        ) : null}
        {primaryReason ? (
          <div className="rounded-[20px] border border-[#efe5d8] bg-[linear-gradient(180deg,rgba(250,246,240,0.84),rgba(255,255,255,0.94))] px-3.5 py-3 text-sm leading-6 text-slate-600">
            <span className="mr-1 font-medium text-[#7a5a44]">Why it stands out:</span>
            {primaryReason}
          </div>
        ) : null}
      </CardContent>
      <CardContent className="flex items-center justify-between gap-3 border-t border-[#f0e7da] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,246,240,0.78))] px-4 py-3 text-sm font-medium text-slate-500 sm:px-5">
        <span>
          <span className="sm:hidden">Tap for details</span>
          <span className="hidden sm:inline">Click for details</span>
        </span>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 inline-flex items-center gap-1 rounded-full border border-[#e8dbc9] bg-white/95 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-[0_12px_28px_-24px_rgba(120,87,63,0.34)] transition hover:border-[#d7cab8] hover:bg-[#fdfaf6] hover:text-slate-900"
            onClick={(event) => {
              event.stopPropagation()
              onRetailerClick?.()
            }}
          >
            {retailerLabel
              ? `View on ${retailerLabel}`
              : subtitle
                ? `View on ${subtitle}`
                : 'View site'}
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </a>
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </CardContent>
    </Card>
  )
}

export default ProductCard
