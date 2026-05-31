import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowUpRight, CheckCircle2, ChevronDown, Info, Star, X } from 'lucide-react'

import logo from '@/assets/logo_master_version.svg'
import { resolveAmazonDomainForRequest } from '@/components/home/useGuidedSearch.js'
import { Button } from '@/components/ui/button.jsx'
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import { formatDisplayPrice } from '@/lib/formatDisplayPrice.js'
import { getUserFacingDescription } from '@/components/home/homeContentUtils.js'
import { getProductDisplayTitle } from '@/lib/productTitle.js'

const MotionDiv = motion.div
const FOCUSABLE_MODAL_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function resolveAmazonRetailerLabel(subtitle, selectedAmazonDomain, resolvedAmazonDomain) {
  if (subtitle !== 'Amazon') return subtitle
  const domain = resolveAmazonDomainForRequest(selectedAmazonDomain, resolvedAmazonDomain)
  if (!domain || !domain.startsWith('amazon.')) return 'Amazon.com'
  return domain.replace(/^amazon\./, 'Amazon.')
}

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

function ProductFacts({ displayPrice, item, retailerLabel }) {
  const ratingValue = getRatingValue(item.rating)
  const facts = [
    ['Shortlist rank', item.badgeLabel || 'Selected pick'],
    ['Source', retailerLabel || item.subtitle || 'Retailer'],
    ['Price', displayPrice],
    ['Rating', ratingValue ? `${ratingValue.toFixed(1)} stars` : 'No rating'],
    ['Reviews', formatReviewCount(item.reviewCount)],
  ]

  return (
    <section className="rounded-2xl border border-[#eadfce] bg-white/92 p-4 shadow-[0_14px_36px_-30px_rgba(120,87,63,0.2)]">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#80573f]">
        At a glance
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
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
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inset-0 rounded-full bg-primary/25 animate-soft-pulse" />
          <span className="relative h-2 w-2 rounded-full bg-primary/60" />
        </span>
        <span className="relative inline-block overflow-hidden rounded-full px-0.5">
          <span className="relative z-10">Checking why this fits your search...</span>
          <span className="pointer-events-none absolute inset-y-0 left-[-40%] w-[40%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/80 to-transparent animate-shimmer" />
        </span>
      </div>
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
            <p className="text-xs font-medium text-slate-400">Current price</p>
            <p className="text-lg font-semibold leading-6 text-primary">{displayPrice}</p>
            <p className="text-xs leading-5 text-slate-400">
              {retailerLabel || item.subtitle || 'Retailer'} - availability may change
            </p>
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

export function ProductDetailModal({ item, isEnrichmentSettled = false, onClose, onRetailerClick }) {
  const fitReason = item?.fit_reason || item?.fitReason || ''
  const caveat = item?.caveat || ''
  const featureBullets = Array.isArray(item?.feature_bullets) ? item.feature_bullets : []
  const { selectedAmazonDomain, resolvedAmazonDomain } = useAmazonStore()
  const retailerLabel = resolveAmazonRetailerLabel(item?.subtitle, selectedAmazonDomain, resolvedAmazonDomain)
  const [bulletsExpanded, setBulletsExpanded] = useState(false)
  const [fullTitleExpanded, setFullTitleExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const dialogRef = useRef(null)
  const previouslyFocusedElementRef = useRef(null)

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
    }, 0)

    return () => {
      window.clearTimeout(resetTimer)
    }
  }, [item?.id])

  if (!item) {
    return null
  }

  const userFacingDescription = getUserFacingDescription(item.description)
  const displayPrice = formatDisplayPrice(item.price)
  const rawTitle = String(item.title || '').replace(/\s+/g, ' ').trim()
  const displayTitle = getProductDisplayTitle(rawTitle)
  const hasCleanedTitle = Boolean(rawTitle && displayTitle && rawTitle !== displayTitle)
  const fullTitleLabel =
    retailerLabel && retailerLabel.toLowerCase().startsWith('amazon')
      ? 'Full Amazon title'
      : 'Full source title'
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
            {imgError ? (
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
            <div className="space-y-1">
              {item.subtitle ? (
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-slate-400">
                  {item.subtitle}
                </p>
              ) : null}
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

            <ProductFacts displayPrice={displayPrice} item={item} retailerLabel={retailerLabel} />

            <ReasoningPanel
              caveat={caveat}
              fitReason={fitReason}
              isEnrichmentSettled={isEnrichmentSettled}
            />

            <ProductNotes
              bulletsExpanded={bulletsExpanded}
              displayedBullets={displayedBullets}
              featureBullets={featureBullets}
              itemId={item.id}
              onExpand={() => setBulletsExpanded(true)}
              shouldCollapseBullets={shouldCollapseBullets}
              userFacingDescription={userFacingDescription}
            />

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
