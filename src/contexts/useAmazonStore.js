import { createContext, useContext } from 'react'

import { AMAZON_MARKETPLACE_AUTO } from './amazonStoreConstants.js'

export const AmazonStoreContext = createContext(null)

const fallback = {
  selectedAmazonDomain: AMAZON_MARKETPLACE_AUTO,
  setSelectedAmazonDomain: () => {},
}

export function useAmazonStore() {
  return useContext(AmazonStoreContext) ?? fallback
}
