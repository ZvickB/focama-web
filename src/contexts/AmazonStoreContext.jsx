import { createContext, useContext, useState } from 'react'

export const AMAZON_MARKETPLACE_AUTO = 'auto'

const AmazonStoreContext = createContext(null)

const fallback = {
  selectedAmazonDomain: AMAZON_MARKETPLACE_AUTO,
  setSelectedAmazonDomain: () => {},
}

export function AmazonStoreProvider({ children }) {
  const [selectedAmazonDomain, setSelectedAmazonDomain] = useState(AMAZON_MARKETPLACE_AUTO)

  return (
    <AmazonStoreContext.Provider value={{ selectedAmazonDomain, setSelectedAmazonDomain }}>
      {children}
    </AmazonStoreContext.Provider>
  )
}

export function useAmazonStore() {
  return useContext(AmazonStoreContext) ?? fallback
}
