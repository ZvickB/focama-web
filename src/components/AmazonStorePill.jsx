import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { AMAZON_MARKETPLACE_AUTO } from '@/contexts/amazonStoreConstants.js'
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import {
  AMAZON_MARKETPLACES,
  getAmazonDomainFromCountryCode,
} from '../../shared/amazon-marketplaces.js'

function countryCodeToFlag(code) {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('')
}

// variant='header' — smaller, subtler trigger; used in the site header
// variant='default' — standard full-size pill (fallback)
export function AmazonStorePill({ variant = 'default' }) {
  const {
    selectedAmazonDomain,
    setSelectedAmazonDomain,
    setResolvedAmazonDomain,
  } = useAmazonStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isMoreRegionsOpen, setIsMoreRegionsOpen] = useState(false)
  const [detectedCountryCode, setDetectedCountryCode] = useState(null)
  const containerRef = useRef(null)
  const popoverId = useId()

  useEffect(() => {
    if (window.__FOCAMAI_DISABLE_GEO_FETCH__) return undefined
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

    if (browserTimeZone === 'America/Toronto' || browserTimeZone === 'America/Montreal') {
      setDetectedCountryCode('CA')
      setResolvedAmazonDomain(getAmazonDomainFromCountryCode('CA'))
      return undefined
    }

    fetch('/api/geo')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.countryCode) {
          setDetectedCountryCode(data.countryCode)
          setResolvedAmazonDomain(getAmazonDomainFromCountryCode(data.countryCode))
        }
      })
      .catch(() => {
        setResolvedAmazonDomain('')
      })
  }, [setResolvedAmazonDomain])

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

  const isAuto = selectedAmazonDomain === AMAZON_MARKETPLACE_AUTO
  const selectedMarketplace = AMAZON_MARKETPLACES.find((m) => m.domain === selectedAmazonDomain)

  let pillFlag, pillLabel
  if (isAuto) {
    pillFlag = detectedCountryCode ? countryCodeToFlag(detectedCountryCode) : '🌐'
    pillLabel = detectedCountryCode ?? 'Auto'
  } else {
    pillFlag = selectedMarketplace ? countryCodeToFlag(selectedMarketplace.countryCode) : '🌐'
    pillLabel = selectedMarketplace?.countryCode ?? 'Auto'
  }

  function handleSelect(domain) {
    setSelectedAmazonDomain(domain)
    setIsOpen(false)
  }

  const primaryMarketplaceDomains = ['amazon.com', 'amazon.ca', 'amazon.co.uk']
  const primaryMarketplaces = primaryMarketplaceDomains
    .map((domain) => AMAZON_MARKETPLACES.find((marketplace) => marketplace.domain === domain))
    .filter(Boolean)
  const additionalMarketplaces = AMAZON_MARKETPLACES.filter(
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
        <span aria-hidden="true" className="text-base">
          {countryCodeToFlag(marketplace.countryCode)}
        </span>
        <span className="flex-1">{marketplace.label}</span>
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
      ? 'inline-flex items-center gap-1 rounded-full border border-stone-200/50 px-2.5 py-1 text-[12px] text-slate-400 transition hover:border-stone-200 hover:bg-white/70 hover:text-slate-600'
      : 'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-2 text-sm text-slate-600 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50'

  const chevronClass =
    variant === 'header' ? 'h-3 w-3 text-slate-300 transition-transform duration-150' : 'h-3.5 w-3.5 text-slate-400 transition-transform duration-150'

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        aria-label="Change Amazon store"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? popoverId : undefined}
        className={triggerClass}
      >
        <span aria-hidden="true">{pillFlag}</span>
        <span>{pillLabel}</span>
        <ChevronDown className={`${chevronClass} ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen ? (
        <div
          id={popoverId}
          role="listbox"
          aria-label="Amazon store options"
          onKeyDown={handlePopoverKeyDown}
          className="absolute right-0 top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-[20px] border border-stone-200 bg-white py-1.5 shadow-[0_8px_32px_-8px_rgba(15,23,42,0.18)]"
        >
          <div className="max-h-72 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleSelect(AMAZON_MARKETPLACE_AUTO)}
              role="option"
              aria-selected={isAuto}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-stone-50 ${
                isAuto ? 'text-primary' : 'text-slate-700'
              }`}
            >
              <span aria-hidden="true" className="text-base">
                🌐
              </span>
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
                  type="button"
                  onClick={() => setIsMoreRegionsOpen((open) => !open)}
                  aria-expanded={isMoreRegionsOpen}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-stone-50"
                >
                  <span aria-hidden="true" className="text-base">
                    🌍
                  </span>
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
        </div>
      ) : null}
    </div>
  )
}
