import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { validateSearchInput } from '../../../shared/search-input.js'

export const RESULT_CARD_COUNT = 6
export const RESULT_CARD_SLOTS = Array.from({ length: RESULT_CARD_COUNT }, (_, index) => index)

function createFallbackRefinementPrompt(productQuery) {
  return {
    prompt: `What should we optimize for with this ${productQuery}?`,
    helperText: 'Add any context that will help Focama narrow the shortlist more intelligently.',
    followUpPlaceholder:
      'Examples: for a small apartment, for daily commuting, needs to feel premium, under $200, easy to clean, for a child, or should last a long time.',
  }
}

async function readJsonResponse(response) {
  const rawBody = await response.text()
  let payload = {}

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody)
    } catch {
      throw new Error('The server returned an invalid response. Check the local server or Vercel logs.')
    }
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.')
  }

  return payload
}

async function fetchDiscoveryResults(query) {
  const searchParams = new URLSearchParams({ query })
  const response = await fetch(`/api/search/discover?${searchParams.toString()}`)
  return readJsonResponse(response)
}

async function fetchRefinementPrompt(query) {
  const searchParams = new URLSearchParams({ query })
  const response = await fetch(`/api/search/refine?${searchParams.toString()}`)
  return readJsonResponse(response)
}

async function finalizeGuidedSearch({ candidatePool, followUpNotes }) {
  const response = await fetch('/api/search/finalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      candidatePool,
      followUpNotes,
    }),
  })

  return readJsonResponse(response)
}

export function useGuidedSearch() {
  const [productQuery, setProductQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [hasStartedSearch, setHasStartedSearch] = useState(false)
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [candidatePool, setCandidatePool] = useState(null)
  const [previewResults, setPreviewResults] = useState([])
  const [results, setResults] = useState([])
  const [refinementPrompt, setRefinementPrompt] = useState(null)
  const [followUpNotes, setFollowUpNotes] = useState('')
  const [showPreviewResults, setShowPreviewResults] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const activeSearchIdRef = useRef(0)

  const finalizeMutation = useMutation({
    mutationFn: finalizeGuidedSearch,
    onMutate: () => {
      setErrorMessage('')
    },
    onSuccess: (payload) => {
      setCandidatePool(payload.candidatePool || null)
      setResults(payload.results || [])
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to finalize the search.')
    },
  })

  const isFinalizing = finalizeMutation.isPending
  const isLoading = isDiscovering || isGeneratingPrompt || isFinalizing
  const hasFinalResults = results.length > 0
  const displayedResults = hasFinalResults ? results : showPreviewResults ? previewResults : []

  function resetGuidedState(nextSubmittedQuery) {
    setHasStartedSearch(true)
    setSubmittedQuery(nextSubmittedQuery)
    setSelectedProduct(null)
    setErrorMessage('')
    setCandidatePool(null)
    setPreviewResults([])
    setResults([])
    setFollowUpNotes('')
    setShowPreviewResults(false)
    setRefinementPrompt(createFallbackRefinementPrompt(nextSubmittedQuery))
  }

  function beginGuidedSearch(event) {
    event.preventDefault()

    const { error, isValid, normalizedQuery } = validateSearchInput(productQuery, '')

    if (!isValid) {
      setErrorMessage(error)
      return
    }

    const nextSearchId = activeSearchIdRef.current + 1
    activeSearchIdRef.current = nextSearchId

    resetGuidedState(normalizedQuery)
    setIsDiscovering(true)
    setIsGeneratingPrompt(true)

    fetchDiscoveryResults(normalizedQuery)
      .then((payload) => {
        if (activeSearchIdRef.current !== nextSearchId) {
          return
        }

        setCandidatePool(payload.candidatePool || null)
        setPreviewResults(payload.previewResults || [])
      })
      .catch((error) => {
        if (activeSearchIdRef.current !== nextSearchId) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : 'Unable to start the search.')
      })
      .finally(() => {
        if (activeSearchIdRef.current === nextSearchId) {
          setIsDiscovering(false)
        }
      })

    fetchRefinementPrompt(normalizedQuery)
      .then((payload) => {
        if (activeSearchIdRef.current !== nextSearchId) {
          return
        }

        setRefinementPrompt(payload)
      })
      .catch(() => {
        if (activeSearchIdRef.current === nextSearchId) {
          setRefinementPrompt(createFallbackRefinementPrompt(normalizedQuery))
        }
      })
      .finally(() => {
        if (activeSearchIdRef.current === nextSearchId) {
          setIsGeneratingPrompt(false)
        }
      })
  }

  function handleFinalizeRefinement() {
    if (!candidatePool) {
      return
    }

    finalizeMutation.mutate({
      candidatePool,
      followUpNotes,
    })
  }

  function handleShowProductsNow() {
    setShowPreviewResults(true)
  }

  return {
    candidatePool,
    displayedResults,
    errorMessage,
    followUpNotes,
    hasFinalResults,
    hasStartedSearch,
    isDiscovering,
    isFinalizing,
    isGeneratingPrompt,
    isLoading,
    productQuery,
    refinementPrompt,
    selectedProduct,
    showPreviewResults,
    submittedQuery,
    beginGuidedSearch,
    handleFinalizeRefinement,
    handleShowProductsNow,
    setFollowUpNotes,
    setProductQuery,
    setSelectedProduct,
  }
}
