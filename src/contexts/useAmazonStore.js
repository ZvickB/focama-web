import { createContext, useContext } from 'react'

import { AMAZON_MARKETPLACE_AUTO } from './amazonStoreConstants.js'

export const AmazonStoreContext = createContext(null)

const fallback = {
  clearMarketplacePreference: () => {},
  detectedCountryCode: null,
  hasAskedMarketplacePreference: false,
  markMarketplacePromptHandled: () => {},
  selectedAmazonDomain: AMAZON_MARKETPLACE_AUTO,
  resolvedAmazonDomain: '',
  setSelectedAmazonDomain: () => {},
  setResolvedAmazonDomain: () => {},
}

export function useAmazonStore() {
  return useContext(AmazonStoreContext) ?? fallback
}
