import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import { validateSearchInput } from '../../../shared/search-input.js'

export const RESULT_CARD_COUNT = 6
export const RESULT_CARD_SLOTS = Array.from({ length: RESULT_CARD_COUNT }, (_, index) => index)
export const MAX_REFINEMENT_RETRIES = 2

function roundTiming(value) {
  return Math.round(value * 10) / 10
}

function parseServerTimingHeader(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return {}
  }

  return Object.fromEntries(
    headerValue
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [namePart, ...params] = entry.split(';').map((part) => part.trim())
        const durationParam = params.find((part) => part.startsWith('dur='))
        const duration = durationParam ? Number(durationParam.slice(4)) : null

        return [namePart, Number.isFinite(duration) ? duration : null]
      })
      .filter(([, duration]) => Number.isFinite(duration)),
  )
}

function createFallbackRefinementPrompt(productQuery) {
  return {
    prompt: `What should we optimize for with this ${productQuery}?`,
    helperText: 'Add any context that will help Focamai narrow the shortlist more intelligently.',
    followUpPlaceholder:
      'Examples: for a small apartment, for daily commuting, needs to feel premium, under $200, easy to clean, for a child, or should last a long time.',
  }
}

async function readJsonResponse(response, requestStartedAt) {
  const responseReceivedAt = performance.now()
  const rawBody = await response.text()
  const responseParsedAt = performance.now()
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

  return {
    ...payload,
    timing: {
      client: {
        roundTripMs: roundTiming(responseReceivedAt - requestStartedAt),
        responseReadMs: roundTiming(responseParsedAt - responseReceivedAt),
        totalMs: roundTiming(responseParsedAt - requestStartedAt),
      },
      server: parseServerTimingHeader(response.headers?.get?.('server-timing') || ''),
    },
  }
}

async function fetchDiscoveryResults(query) {
  const searchParams = new URLSearchParams({ query })
  const requestStartedAt = performance.now()
  const response = await fetch(`/api/search/discover?${searchParams.toString()}`)
  return readJsonResponse(response, requestStartedAt)
}

async function fetchRefinementPrompt(query) {
  const searchParams = new URLSearchParams({ query })
  const requestStartedAt = performance.now()
  const response = await fetch(`/api/search/refine?${searchParams.toString()}`)
  return readJsonResponse(response, requestStartedAt)
}

async function finalizeGuidedSearch({
  query,
  discoveryToken,
  followUpNotes,
  rejectionFeedback,
  retryCount,
  excludedCandidateIds,
}) {
  const requestStartedAt = performance.now()
  const response = await fetch('/api/search/finalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      discoveryToken,
      followUpNotes,
      rejectionFeedback,
      retryCount,
      excludedCandidateIds,
    }),
  })

  return readJsonResponse(response, requestStartedAt)
}

function mergeFinalizeResults(results, sourceCandidatePool) {
  if (!Array.isArray(results) || !sourceCandidatePool?.candidates) {
    return Array.isArray(results) ? results : []
  }

  const candidateById = new Map(
    sourceCandidatePool.candidates.map((candidate) => [String(candidate.id), candidate]),
  )

  return results.map((result) => {
    const sourceCandidate = candidateById.get(String(result.id))

    if (!sourceCandidate) {
      return result
    }

    return {
      ...result,
      image: sourceCandidate.image || result.image,
      link: sourceCandidate.link || result.link,
    }
  })
}

export function useGuidedSearch() {
  const [productQuery, setProductQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [hasStartedSearch, setHasStartedSearch] = useState(false)
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [discoveryToken, setDiscoveryToken] = useState('')
  const [candidatePool, setCandidatePool] = useState(null)
  const [previewResults, setPreviewResults] = useState([])
  const [results, setResults] = useState([])
  const [previousResults, setPreviousResults] = useState([])
  const [refinementPrompt, setRefinementPrompt] = useState(null)
  const [followUpNotes, setFollowUpNotes] = useState('')
  const [retryFeedback, setRetryFeedback] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [selectionState, setSelectionState] = useState(null)
  const [requestTiming, setRequestTiming] = useState({
    discover: null,
    finalize: null,
    refine: null,
  })
  const [showPreviewResults, setShowPreviewResults] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const activeSearchIdRef = useRef(0)

  const finalizeMutation = useMutation({
    mutationFn: finalizeGuidedSearch,
    onMutate: () => {
      setErrorMessage('')
    },
    onSuccess: (payload, variables) => {
      setCandidatePool(variables.originalCandidatePool || null)
      setPreviousResults(
        variables.retryCount > 0 && Array.isArray(variables.previousResults)
          ? variables.previousResults
          : [],
      )
      setResults(mergeFinalizeResults(payload.results, variables.originalCandidatePool))
      setRequestTiming((current) => ({
        ...current,
        finalize: payload.timing || null,
      }))
      setRetryFeedback('')
      setRetryCount(payload.retryCount ?? variables.retryCount ?? 0)
      setSelectionState(payload.selection || null)
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
    setDiscoveryToken('')
    setCandidatePool(null)
    setPreviewResults([])
    setResults([])
    setPreviousResults([])
    setFollowUpNotes('')
    setRetryFeedback('')
    setRetryCount(0)
    setSelectionState(null)
    setRequestTiming({
      discover: null,
      finalize: null,
      refine: null,
    })
    setShowPreviewResults(false)
    setRefinementPrompt(null)
  }

  function resetToNewSearch() {
    activeSearchIdRef.current += 1
    finalizeMutation.reset()
    setProductQuery('')
    setSelectedProduct(null)
    setErrorMessage('')
    setHasStartedSearch(false)
    setSubmittedQuery('')
    setDiscoveryToken('')
    setCandidatePool(null)
    setPreviewResults([])
    setResults([])
    setRefinementPrompt(null)
    setFollowUpNotes('')
    setRetryFeedback('')
    setRetryCount(0)
    setSelectionState(null)
    setRequestTiming({
      discover: null,
      finalize: null,
      refine: null,
    })
    setPreviousResults([])
    setShowPreviewResults(false)
    setIsDiscovering(false)
    setIsGeneratingPrompt(false)
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

        if (!payload.discoveryToken) {
          setCandidatePool(null)
          setPreviewResults([])
          setErrorMessage(
            'Guided discovery is missing its session token. Restart the backend server and start the search again.',
          )
          return
        }

        setDiscoveryToken(payload.discoveryToken || '')
        setCandidatePool(payload.candidatePool || null)
        setPreviewResults(payload.previewResults || [])
        setRequestTiming((current) => ({
          ...current,
          discover: payload.timing || null,
        }))
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
        setRequestTiming((current) => ({
          ...current,
          refine: payload.timing || null,
        }))
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
    if (!candidatePool || !submittedQuery) {
      return
    }

    if (!discoveryToken) {
      setErrorMessage('Search session is missing. Please start the search again.')
      return
    }

    finalizeMutation.mutate({
      query: submittedQuery,
      discoveryToken,
      originalCandidatePool: candidatePool,
      followUpNotes,
      rejectionFeedback: '',
      retryCount: 0,
      excludedCandidateIds: [],
      previousResults: [],
    })
  }

  function handleShowProductsNow() {
    setShowPreviewResults(true)
  }

  function handleRetryWithFeedback() {
    if (!candidatePool || !submittedQuery || !retryFeedback.trim() || retryCount >= MAX_REFINEMENT_RETRIES) {
      return
    }

    if (!discoveryToken) {
      setErrorMessage('Search session is missing. Please start the search again.')
      return
    }

    finalizeMutation.mutate({
      query: submittedQuery,
      discoveryToken,
      originalCandidatePool: candidatePool,
      followUpNotes,
      rejectionFeedback: retryFeedback.trim(),
      retryCount: retryCount + 1,
      excludedCandidateIds: results.map((result) => result.id),
      previousResults: results,
    })
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
    previousResults,
    productQuery,
    requestTiming,
    refinementPrompt,
    selectionState,
    retryCount,
    retryFeedback,
    selectedProduct,
    showPreviewResults,
    submittedQuery,
    beginGuidedSearch,
    handleFinalizeRefinement,
    handleRetryWithFeedback,
    handleShowProductsNow,
    resetToNewSearch,
    setRetryFeedback,
    setFollowUpNotes,
    setProductQuery,
    setSelectedProduct,
  }
}
