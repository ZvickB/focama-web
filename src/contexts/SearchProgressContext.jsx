import { createContext, useContext, useState } from 'react'

const SearchProgressContext = createContext(null)

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

const noop = () => {}
const fallback = { progress: { hasStartedSearch: false, hasDiscoveryResults: false, hasFinalResults: false }, setProgress: noop }

export function useSearchProgress() {
  return useContext(SearchProgressContext) ?? fallback
}
