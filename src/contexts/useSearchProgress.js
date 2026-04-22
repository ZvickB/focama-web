import { useSearchProgressValue } from '@/contexts/searchProgressContext.js'

const noop = () => {}
const fallback = {
  progress: {
    hasStartedSearch: false,
    hasDiscoveryResults: false,
    hasFinalResults: false,
  },
  setProgress: noop,
}

export function useSearchProgress() {
  return useSearchProgressValue() ?? fallback
}
