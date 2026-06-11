import { useCallback, useEffect, useState } from 'react'
import { AMAZON_MARKETPLACE_AUTO } from './amazonStoreConstants.js'
import { AmazonStoreContext } from './useAmazonStore.js'
import {
  AFFILIATE_SUPPORTED_AMAZON_MARKETPLACES,
  normalizeAffiliateSupportedAmazonDomain,
} from '../../shared/amazon-marketplaces.js'

const MARKETPLACE_STORAGE_KEYS = {
  preference: 'focamai_marketplace',
  // Reserved for the future marketplace prompt UI. It will be set to "true"
  // once the user answers or dismisses the prompt.
  asked: 'focamai_marketplace_asked',
}

function readStoredMarketplacePreference() {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(MARKETPLACE_STORAGE_KEYS.preference)

  if (storedValue === AMAZON_MARKETPLACE_AUTO) {
    return AMAZON_MARKETPLACE_AUTO
  }

  const normalizedDomain = normalizeAffiliateSupportedAmazonDomain(storedValue)
  return normalizedDomain || null
}

function readStoredMarketplaceAskedState() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(MARKETPLACE_STORAGE_KEYS.asked) === 'true'
}

function getConfidentMarketplaceFromCountryCode(countryCode = '') {
  if (typeof countryCode !== 'string') {
    return null
  }

  const normalizedCountryCode = countryCode.trim().toUpperCase()
  const marketplace = AFFILIATE_SUPPORTED_AMAZON_MARKETPLACES.find(
    ({ countryCode: marketplaceCountryCode }) => marketplaceCountryCode === normalizedCountryCode,
  )

  if (!marketplace) {
    return null
  }

  return {
    countryCode: normalizedCountryCode,
    domain: marketplace.domain,
  }
}

function normalizeMarketplaceSelection(value) {
  if (value === AMAZON_MARKETPLACE_AUTO) {
    return AMAZON_MARKETPLACE_AUTO
  }

  return normalizeAffiliateSupportedAmazonDomain(value) || AMAZON_MARKETPLACE_AUTO
}

export function AmazonStoreProvider({ children }) {
  const [selectedAmazonDomainState, setSelectedAmazonDomainState] = useState(
    () => readStoredMarketplacePreference() ?? AMAZON_MARKETPLACE_AUTO,
  )
  const [resolvedAmazonDomain, setResolvedAmazonDomain] = useState('')
  const [detectedCountryCode, setDetectedCountryCode] = useState(null)
  const [hasStoredMarketplacePreference, setHasStoredMarketplacePreference] = useState(
    () => readStoredMarketplacePreference() !== null,
  )
  const [hasAskedMarketplacePreference, setHasAskedMarketplacePreference] = useState(
    () => readStoredMarketplaceAskedState(),
  )

  const markMarketplacePromptHandled = useCallback(() => {
    setHasAskedMarketplacePreference(true)

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MARKETPLACE_STORAGE_KEYS.asked, 'true')
    }
  }, [])

  const setSelectedAmazonDomain = useCallback((nextValue) => {
    const normalizedValue = normalizeMarketplaceSelection(nextValue)

    setSelectedAmazonDomainState(normalizedValue)
    setHasStoredMarketplacePreference(true)
    setHasAskedMarketplacePreference(true)

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MARKETPLACE_STORAGE_KEYS.preference, normalizedValue)
      window.localStorage.setItem(MARKETPLACE_STORAGE_KEYS.asked, 'true')
    }

    if (normalizedValue === AMAZON_MARKETPLACE_AUTO) {
      setResolvedAmazonDomain('')
      setDetectedCountryCode(null)
    }
  }, [])

  const clearMarketplacePreference = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(MARKETPLACE_STORAGE_KEYS.preference)
      window.localStorage.removeItem(MARKETPLACE_STORAGE_KEYS.asked)
    }

    setSelectedAmazonDomainState(AMAZON_MARKETPLACE_AUTO)
    setResolvedAmazonDomain('')
    setDetectedCountryCode(null)
    setHasStoredMarketplacePreference(false)
    setHasAskedMarketplacePreference(false)
  }, [])

  useEffect(() => {
    if (hasStoredMarketplacePreference || typeof window === 'undefined') {
      return undefined
    }

    if (window.__FOCAMAI_DISABLE_GEO_FETCH__) {
      return undefined
    }

    let isCancelled = false

    function persistDetectedMarketplace(countryCode, domain) {
      if (isCancelled) {
        return
      }

      setDetectedCountryCode(countryCode)
      setResolvedAmazonDomain(domain)
      window.localStorage.setItem(MARKETPLACE_STORAGE_KEYS.preference, domain)
      setHasStoredMarketplacePreference(true)
    }

    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

    if (browserTimeZone === 'America/Toronto' || browserTimeZone === 'America/Montreal') {
      persistDetectedMarketplace('CA', 'amazon.ca')
      return () => {
        isCancelled = true
      }
    }

    fetch('/api/geo')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isCancelled) {
          return
        }

        const confidentMarketplace = getConfidentMarketplaceFromCountryCode(data?.countryCode)

        if (confidentMarketplace) {
          persistDetectedMarketplace(confidentMarketplace.countryCode, confidentMarketplace.domain)
          return
        }

        if (typeof data?.countryCode === 'string') {
          setDetectedCountryCode(data.countryCode.trim().toUpperCase())
        }
        setResolvedAmazonDomain('')
      })
      .catch(() => {
        if (isCancelled) {
          return
        }

        setResolvedAmazonDomain('')
      })

    return () => {
      isCancelled = true
    }
  }, [hasStoredMarketplacePreference])

  return (
    <AmazonStoreContext.Provider
      value={{
        clearMarketplacePreference,
        detectedCountryCode,
        hasAskedMarketplacePreference,
        markMarketplacePromptHandled,
        selectedAmazonDomain: selectedAmazonDomainState,
        resolvedAmazonDomain,
        setSelectedAmazonDomain,
        setResolvedAmazonDomain,
      }}
    >
      {children}
    </AmazonStoreContext.Provider>
  )
}
