import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowUpRight, ChevronDown, Star, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import logo from '@/assets/logo_master_version.svg'
import { resolveAmazonDomainForRequest } from '@/components/home/useGuidedSearch.js'
import { Button } from '@/components/ui/button.jsx'
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import { formatDisplayPrice } from '@/lib/formatDisplayPrice.js'
import { getUserFacingDescription } from '@/components/home/homeContentUtils.js'

const MotionDiv = motion.div

function resolveAmazonRetailerLabel(subtitle, selectedAmazonDomain, resolvedAmazonDomain) {
  if (subtitle !== 'Amazon') return subtitle
  const domain = resolveAmazonDomainForRequest(selectedAmazonDomain, resolvedAmazonDomain)
  if (!domain || !domain.startsWith('amazon.')) return 'Amazon.com'
  return domain.replace(/^amazon\./, 'Amazon.')
}

function RetailerActions({ className = '', item, onRetailerClick, retailerLabel }) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {item.link ? (
        <>
          <Button
            asChild
            className="h-12 w-full gap-2 rounded-2xl bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <a href={item.link} target="_blank" rel="noreferrer" onClick={onRetailerClick}>
              {retailerLabel ? `View on ${retailerLabel}` : 'View on retailer site'}
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
        </>
      ) : (
        <Button
          type="button"
          disabled
          className="h-12 w-full gap-2 rounded-2xl bg-[#ede3d6] text-slate-500"
        >
          Retailer link unavailable
        </Button>
      )}
    </div>
  )
}

export function ProductDetailModal({ item, isEnrichmentSettled = false, onClose, onRetailerClick }) {
  const fitReason = item?.fit_reason || item?.fitReason || ''
  const caveat = item?.caveat || ''
  const featureBullets = Array.isArray(item?.feature_bullets) ? item.feature_bullets : []
  const enrichmentReady = Boolean(fitReason)
  const { selectedAmazonDomain, resolvedAmazonDomain } = useAmazonStore()
  const retailerLabel = resolveAmazonRetailerLabel(item?.subtitle, selectedAmazonDomain, resolvedAmazonDomain)
  const contentRef = useRef(null)
  const rightColumnRef = useRef(null)
  const [showScrollHint, setShowScrollHint] = useState(true)
  const [bulletsExpanded, setBulletsExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    function handleScroll(el) {
      if (el.scrollTop > 40) setShowScrollHint(false)
    }

    const mobile = contentRef.current
    const desktop = rightColumnRef.current
    const onMobile = () => handleScroll(mobile)
    const onDesktop = () => handleScroll(desktop)

    mobile?.addEventListener('scroll', onMobile, { passive: true })
    desktop?.addEventListener('scroll', onDesktop, { passive: true })
    return () => {
      mobile?.removeEventListener('scroll', onMobile)
      desktop?.removeEventListener('scroll', onDesktop)
    }
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

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setBulletsExpanded(false)
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
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
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
          className="relative grid flex-1 gap-6 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:gap-8 sm:px-6 lg:min-h-0 lg:grid-cols-[2fr_3fr] lg:grid-rows-[minmax(0,1fr)_auto] lg:gap-8 lg:overflow-hidden lg:px-8"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div
            className="flex min-h-[16rem] overflow-hidden rounded-[24px] border border-[#eee5da] shadow-[0_22px_70px_-34px_rgba(120,87,63,0.24)] sm:min-h-[20rem] lg:col-start-1 lg:row-start-1 lg:min-h-0"
            style={{
              background:
                'radial-gradient(circle at 18% 12%, rgba(229,155,38,0.12), transparent 32%), radial-gradient(circle at 84% 0%, rgba(15,97,117,0.08), transparent 28%), linear-gradient(180deg, rgba(250,246,240,0.86), rgba(255,255,255,0.92))',
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
                alt={item.title}
                className="h-full w-full object-contain mix-blend-multiply"
                onError={() => setImgError(true)}
              />
            )}
          </div>

          <div
            ref={rightColumnRef}
            className="relative flex flex-col gap-4 pr-2 sm:pr-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto lg:pr-4"
            style={{ scrollbarGutter: 'stable' }}
          >
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

            {featureBullets.length > 0 ? (
              <div className="space-y-2">
                <ul className="space-y-1.5">
                  {displayedBullets.map((bullet, index) => (
                    <li
                      key={`${item.id}-feature-bullet-${index}`}
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
                    onClick={() => setBulletsExpanded(true)}
                  >
                    Show all details
                  </button>
                ) : null}
              </div>
            ) : userFacingDescription ? (
              <p className="text-sm leading-6 text-slate-600">{userFacingDescription}</p>
            ) : null}

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

          {showScrollHint ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-[calc(100%-1.25rem)] z-10 flex -translate-x-1/2 justify-center"
            >
              <div className="rounded-full border border-stone-200/80 bg-white p-1 shadow-sm">
                <ChevronDown className="h-5 w-5 animate-bounce text-[#9f7f66]" />
              </div>
            </div>
          ) : null}
          </div>

          <RetailerActions
            className="lg:col-start-1 lg:row-start-2"
            item={item}
            onRetailerClick={onRetailerClick}
            retailerLabel={retailerLabel}
          />
        </div>
        <div className="border-t border-[#eadfd2] px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <button
              type="button"
              className="flex items-center gap-1.5 py-1 text-sm text-slate-500 transition-colors hover:text-slate-700"
              onClick={onClose}
            >
              <span aria-hidden="true">←</span>
              Back to results
            </button>
            <div className="flex flex-col items-end gap-0.5 text-right">
              {item.link ? (
                <p className="text-xs leading-5 text-slate-400">
                  As an Amazon Associate I earn from qualifying purchases.
                </p>
              ) : null}
              <p className="text-xs leading-5 text-slate-400">
                Prices and availability may change after you leave Focamai.
              </p>
            </div>
          </div>
        </div>
      </MotionDiv>
    </MotionDiv>
  )
}

export default ProductDetailModal
