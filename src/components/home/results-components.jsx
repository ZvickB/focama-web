import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'

import logo from '@/assets/logo_master_version.svg'
import {
  formatRatingsReviewsText,
  getShortReason,
  hasPendingReason,
} from '@/components/home/results-helpers.js'
import { formatDisplayPrice } from '@/lib/formatDisplayPrice.js'
import { getProductDisplayTitle } from '@/lib/productTitle.js'
import { getDeliverySignal } from '@/components/home/primeEligibility.js'

export function BreathingDots({ className = '' }) {
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
          className={`h-2 w-2 rounded-full animate-soft-pulse ${dot.className}`}
          style={{ animationDelay: dot.delay }}
        />
      ))}
    </span>
  )
}

export function DeliverySignalPill({ signal, className = '' }) {
  if (!signal) {
    return null
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border border-[#cfe1de] bg-[#f5fbf9] px-2 py-0.5 text-[11px] font-semibold leading-4 text-primary ${className}`}
      title={signal.title}
    >
      {signal.label}
    </span>
  )
}

export function ProductImage({ className = '', image, moderation, title }) {
  const [imgError, setImgError] = useState(false)

  if (moderation?.outcome === 'hide_image') {
    return (
      <div className={`flex items-center justify-center bg-[#fbf7f1] px-2 ${className}`}>
        <span className="text-center text-[11px] font-medium leading-4 text-slate-500">Image hidden</span>
      </div>
    )
  }

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

export function RankedPickRow({
  hasFinalResults,
  isActive,
  isEnrichmentSettled,
  item,
  onActivate,
  onOpenDetails,
  onRetailerClick,
  retailerLabel,
}) {
  const displayPrice = formatDisplayPrice(item.price)
  const displayTitle = getProductDisplayTitle(item.title)
  const shortReason = getShortReason(item, { hasFinalResults, isEnrichmentSettled })
  const isReasonPending = hasPendingReason({ hasFinalResults, isEnrichmentSettled, item })
  const deliverySignal = getDeliverySignal(item)

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-white/96 transition duration-200 hover:border-[#d8c9b6] hover:bg-white ${
        isActive
          ? 'border-primary/35 bg-[#fbf7f1] shadow-[0_18px_44px_-34px_rgba(15,97,117,0.28)]'
          : 'border-[#eadfce]'
      }`}
    >
      {isActive ? <div className="absolute bottom-0 left-0 top-0 w-1 bg-primary" /> : null}
      <button
        type="button"
        className="flex w-full gap-3 p-3 text-left sm:p-4"
        onClick={onOpenDetails}
        onFocus={onActivate}
        onMouseEnter={onActivate}
      >
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-[#eee5da] bg-[#fbf7f1]">
          <ProductImage className="h-full w-full rounded-xl" image={item.image} moderation={item.moderation} title={displayTitle || item.title} />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-900">{displayTitle || item.title}</p>
          {isReasonPending ? (
            <BreathingDots className="py-2" />
          ) : shortReason ? (
            <p className="line-clamp-2 text-sm leading-5 text-slate-600">{shortReason}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="font-semibold text-primary">{displayPrice}</span>
            <span>{formatRatingsReviewsText(item)}</span>
            <DeliverySignalPill signal={deliverySignal} />
          </div>
        </div>
      </button>
      <div className="flex items-center justify-between border-t border-[#f0e7da] bg-[#fbf7f1]/70 px-4 py-2">
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
            {retailerLabel ? `View on ${retailerLabel}` : 'View site'}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  )
}

export function SelectedResultPanel({ hasFinalResults, isEnrichmentSettled, item, onOpenDetails }) {
  if (!item) {
    return null
  }

  const displayPrice = formatDisplayPrice(item.price)
  const displayTitle = getProductDisplayTitle(item.title)
  const shortReason = getShortReason(item, {
    hasFinalResults,
    isEnrichmentSettled,
  })
  const isReasonPending = hasPendingReason({ hasFinalResults, isEnrichmentSettled, item })
  const deliverySignal = getDeliverySignal(item)

  return (
    <button
      type="button"
      aria-label={`Open selected result details: ${displayTitle || item.title}`}
      className="group sticky top-24 hidden overflow-visible rounded-[28px] bg-white/95 text-left shadow-[0_24px_68px_-54px_rgba(120,87,63,0.24)] lg:block"
      onClick={onOpenDetails}
    >
      <div className="aspect-square overflow-visible rounded-[28px] bg-[#fbf7f1]">
        <ProductImage
          className="h-full w-full rounded-[28px]"
          image={item.image}
          moderation={item.moderation}
          title={displayTitle || item.title}
        />
      </div>
      <div className="space-y-3 p-4">
        <div className="space-y-2">
          <p className="text-lg font-semibold leading-6 text-slate-950">
            {displayTitle || item.title}
          </p>
          {isReasonPending ? (
            <BreathingDots className="py-2" />
          ) : shortReason ? (
            <p className="text-sm leading-6 text-slate-600">{shortReason}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#f0e7da] pt-3 text-sm">
          <span className="font-semibold text-primary">{displayPrice}</span>
          <span className="text-slate-500">{formatRatingsReviewsText(item)}</span>
          <DeliverySignalPill signal={deliverySignal} />
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition group-hover:text-primary/80">
          View details
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  )
}
