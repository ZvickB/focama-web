import { useState } from 'react'
import { AMAZON_MARKETPLACE_AUTO } from './amazonStoreConstants.js'
import { AmazonStoreContext } from './useAmazonStore.js'

export function AmazonStoreProvider({ children }) {
  const [selectedAmazonDomain, setSelectedAmazonDomain] = useState(AMAZON_MARKETPLACE_AUTO)
  const [resolvedAmazonDomain, setResolvedAmazonDomain] = useState('')

  return (
    <AmazonStoreContext.Provider
      value={{
        selectedAmazonDomain,
        resolvedAmazonDomain,
        setSelectedAmazonDomain,
        setResolvedAmazonDomain,
      }}
    >
      {children}
    </AmazonStoreContext.Provider>
  )
}
