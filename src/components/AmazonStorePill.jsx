import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Globe2 } from 'lucide-react'

import { AMAZON_MARKETPLACE_AUTO } from '@/contexts/amazonStoreConstants.js'
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import {
  ACTIVE_AMAZON_MARKETPLACES,
  getAmazonDomainFromCountryCode,
  normalizeActiveAmazonDomain,
} from '../../shared/amazon-marketplaces.js'

// variant='header' — smaller, subtler trigger; used in the site header
// variant='default' — standard full-size pill (fallback)
export function AmazonStorePill({ align = 'responsive', variant = 'default' }) {
  const {
    detectedCountryCode,
    resolvedAmazonDomain,
    selectedAmazonDomain,
    setSelectedAmazonDomain,
  } = useAmazonStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isMoreRegionsOpen, setIsMoreRegionsOpen] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const containerRef = useRef(null)
  const scrollAreaRef = useRef(null)
  const moreRegionsButtonRef = useRef(null)
  const popoverId = useId()

  const updateScrollCue = useCallback(() => {
    const el = scrollAreaRef.current
    if (!el) return
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1)
  }, [])

  useEffect(() => {
    function handleOpenRequest() {
      setIsOpen(true)
    }
    window.addEventListener('focamai:open-store-picker', handleOpenRequest)
    return () => window.removeEventListener('focamai:open-store-picker', handleOpenRequest)
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined
    function handleOutsideClick(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleOutsideClick)
    return () => document.removeEventListener('pointerdown', handleOutsideClick)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) updateScrollCue()
  }, [isOpen, updateScrollCue])

  useEffect(() => {
    if (!isMoreRegionsOpen) return
    moreRegionsButtonRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    updateScrollCue()
  }, [isMoreRegionsOpen, updateScrollCue])

  const isAuto = selectedAmazonDomain === AMAZON_MARKETPLACE_AUTO
  const selectedMarketplace = ACTIVE_AMAZON_MARKETPLACES.find((m) => m.domain === selectedAmazonDomain)

  const activeAmazonDomain = isAuto
    ? resolvedAmazonDomain || 'amazon.com'
    : selectedMarketplace?.domain || 'amazon.com'
  const pillLabel = `Shop on ${activeAmazonDomain.replace(/^amazon/i, 'Amazon')}`

  function handleSelect(domain) {
    setSelectedAmazonDomain(domain)
    setIsOpen(false)
  }

  // Promote the shopper's detected marketplace into the primary group so their
  // own store never hides behind "More regions".
  const detectedAmazonDomain = detectedCountryCode
    ? normalizeActiveAmazonDomain(getAmazonDomainFromCountryCode(detectedCountryCode))
    : ''
  const primaryMarketplaceDomains = ['amazon.com', 'amazon.ca', 'amazon.co.uk']
  if (detectedAmazonDomain && !primaryMarketplaceDomains.includes(detectedAmazonDomain)) {
    primaryMarketplaceDomains.push(detectedAmazonDomain)
  }
  const primaryMarketplaces = primaryMarketplaceDomains
    .map((domain) => ACTIVE_AMAZON_MARKETPLACES.find((marketplace) => marketplace.domain === domain))
    .filter(Boolean)
  const additionalMarketplaces = ACTIVE_AMAZON_MARKETPLACES.filter(
    (marketplace) => !primaryMarketplaceDomains.includes(marketplace.domain),
  )

  function renderMarketplaceOption(marketplace) {
    const isSelected = !isAuto && selectedAmazonDomain === marketplace.domain

    return (
      <button
        key={marketplace.countryCode}
        type="button"
        onClick={() => handleSelect(marketplace.domain)}
        role="option"
        aria-selected={isSelected}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-stone-50 ${
          isSelected ? 'text-primary' : 'text-slate-700'
        }`}
      >
        <span className="flex-1">
          <span className="block font-medium">{marketplace.domain.replace(/^amazon/i, 'Amazon')}</span>
          <span className="block text-xs text-slate-400">{marketplace.label}</span>
        </span>
        {isSelected ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
      </button>
    )
  }

  function handleTriggerKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setIsOpen(true)
      return
    }
    if (event.key === 'Escape') setIsOpen(false)
  }

  function handlePopoverKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
    }
  }

  const triggerClass =
    variant === 'header'
      ? 'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stone-300 bg-white/80 px-3 py-1.5 text-[12px] font-medium text-slate-600 shadow-sm transition hover:border-stone-400 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
      : 'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-2 text-sm text-slate-600 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50'

  const chevronClass =
    variant === 'header' ? 'h-3 w-3 text-slate-300 transition-transform duration-150' : 'h-3.5 w-3.5 text-slate-400 transition-transform duration-150'
  const popoverAlignmentClass =
    align === 'end' ? 'right-0' : 'left-0 lg:left-auto lg:right-0'

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        aria-label={`Change Amazon region. Current store: ${activeAmazonDomain}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? popoverId : undefined}
        className={triggerClass}
      >
        <span>{pillLabel}</span>
        <ChevronDown className={`${chevronClass} ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen ? (
        <div
          id={popoverId}
          role="listbox"
          aria-label="Amazon store options"
          onKeyDown={handlePopoverKeyDown}
          className={`absolute top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-[20px] border border-stone-200 bg-white py-1.5 shadow-[0_8px_32px_-8px_rgba(15,23,42,0.18)] ${popoverAlignmentClass}`}
        >
          <div className="relative">
          <div
            ref={scrollAreaRef}
            onScroll={updateScrollCue}
            className="max-h-[min(24rem,60vh)] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => handleSelect(AMAZON_MARKETPLACE_AUTO)}
              role="option"
              aria-selected={isAuto}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-stone-50 ${
                isAuto ? 'text-primary' : 'text-slate-700'
              }`}
            >
              <Globe2 aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="flex-1">
                <span className="block font-medium">Auto</span>
                <span className="block text-xs text-slate-400">
                  {detectedCountryCode ? `Detected: ${detectedCountryCode}` : 'Based on your connection'}
                </span>
              </span>
              {isAuto ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
            </button>

            <div className="my-1 border-t border-stone-100" />

            {primaryMarketplaces.map(renderMarketplaceOption)}

            {additionalMarketplaces.length ? (
              <>
                <div className="my-1 border-t border-stone-100" />
                <button
                  ref={moreRegionsButtonRef}
                  type="button"
                  onClick={() => setIsMoreRegionsOpen((open) => !open)}
                  aria-expanded={isMoreRegionsOpen}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-stone-50"
                >
                  <Globe2 aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="flex-1 font-medium">More regions</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${
                      isMoreRegionsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isMoreRegionsOpen ? additionalMarketplaces.map(renderMarketplaceOption) : null}
              </>
            ) : null}
          </div>
          {canScrollDown ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-[20px] bg-gradient-to-t from-white to-transparent"
            />
          ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
