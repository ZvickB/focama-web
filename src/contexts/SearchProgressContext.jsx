import { useState } from 'react'
import { SearchProgressContext } from '@/contexts/searchProgressContext.js'

export function SearchProgressProvider({ children }) {
  const [progress, setProgress] = useState({
    hasStartedSearch: false,
    hasDiscoveryResults: false,
    hasFinalResults: false,
  })

  return (
    <SearchProgressContext.Provider value={{ progress, setProgress }}>
      {children}
    </SearchProgressContext.Provider>
  )
}
