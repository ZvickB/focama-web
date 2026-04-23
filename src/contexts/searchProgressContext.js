import { createContext, useContext } from 'react'

export const SearchProgressContext = createContext(null)

export function useSearchProgressValue() {
  return useContext(SearchProgressContext)
}
