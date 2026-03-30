import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import {
  createAnalyticsSearchId,
  getOrCreateAnalyticsSessionId,
  trackAnalytics,
} from '@/lib/analytics.js'
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
    helperText: 'Answer in natural language so Focamai can understand what you really want.',
    followUpPlaceholder:
      'Example: I want something lightweight for daily travel, under $200, and easy to clean.',
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

function buildResultAnalyticsItems(results) {
  if (!Array.isArray(results)) {
    return []
  }

  return results.map((item, index) => ({
    resultKey: String(item.id),
    position: index,
    provider: item.subtitle || '',
    badgeType: item.badgeLabel || '',
    isBestPick: index === 0 || item.badgeLabel === 'Best match',
  }))
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
  const analyticsSearchIdRef = useRef('')
  const analyticsSessionIdRef = useRef('')
  const hasTrackedRefinementViewRef = useRef(false)
  const hasTrackedPreviewImpressionsRef = useRef(false)

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

      const searchId = analyticsSearchIdRef.current
      const sessionId = analyticsSessionIdRef.current
      const finalizedResults = mergeFinalizeResults(payload.results, variables.originalCandidatePool)
      const resultSet = variables.retryCount > 0 ? 'retry' : 'final'

      if (searchId && sessionId) {
        trackAnalytics({
          eventType: 'search_run_upsert',
          searchId,
          sessionId,
          productQuery: variables.query,
          details: variables.followUpNotes || '',
          enteredAiRefinement: true,
          usedShowProductsNow: showPreviewResults,
          completedFinalize: true,
          retryRound: payload.retryCount ?? variables.retryCount ?? 0,
          bestResultKey: finalizedResults[0]?.id ? String(finalizedResults[0].id) : '',
        })
        trackAnalytics({
          eventType: 'search_event',
          searchId,
          sessionId,
          name: 'final_results_shown',
          eventData: {
            resultCount: finalizedResults.length,
            resultSet,
            retryRound: payload.retryCount ?? variables.retryCount ?? 0,
          },
        })

        const impressionItems = buildResultAnalyticsItems(finalizedResults)

        if (impressionItems.length > 0) {
          trackAnalytics({
            eventType: 'result_impressions',
            searchId,
            sessionId,
            resultSet,
            items: impressionItems,
          })
        }
      }
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
    hasTrackedRefinementViewRef.current = false
    hasTrackedPreviewImpressionsRef.current = false
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
    analyticsSearchIdRef.current = ''
    hasTrackedRefinementViewRef.current = false
    hasTrackedPreviewImpressionsRef.current = false
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
    const analyticsSearchId = createAnalyticsSearchId()
    const analyticsSessionId = getOrCreateAnalyticsSessionId()
    analyticsSearchIdRef.current = analyticsSearchId
    analyticsSessionIdRef.current = analyticsSessionId

    resetGuidedState(normalizedQuery)
    setIsDiscovering(true)
    setIsGeneratingPrompt(true)

    trackAnalytics({
      eventType: 'search_run_upsert',
      searchId: analyticsSearchId,
      sessionId: analyticsSessionId,
      productQuery: normalizedQuery,
      details: '',
      enteredAiRefinement: false,
      usedShowProductsNow: false,
      completedFinalize: false,
      retryRound: 0,
    })
    trackAnalytics({
      eventType: 'search_event',
      searchId: analyticsSearchId,
      sessionId: analyticsSessionId,
      name: 'search_started',
      eventData: {
        query: normalizedQuery,
      },
    })

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

        trackAnalytics({
          eventType: 'search_event',
          searchId: analyticsSearchId,
          sessionId: analyticsSessionId,
          name: 'discovery_loaded',
          eventData: {
            candidateCount: Array.isArray(payload.candidatePool?.candidates)
              ? payload.candidatePool.candidates.length
              : 0,
            previewCount: Array.isArray(payload.previewResults) ? payload.previewResults.length : 0,
            source: payload.source || 'live',
          },
        })
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

        if (!hasTrackedRefinementViewRef.current) {
          hasTrackedRefinementViewRef.current = true
          trackAnalytics({
            eventType: 'search_event',
            searchId: analyticsSearchId,
            sessionId: analyticsSessionId,
            name: 'refine_viewed',
            eventData: {
              usedFallback: false,
            },
          })
        }
      })
      .catch(() => {
        if (activeSearchIdRef.current === nextSearchId) {
          setRefinementPrompt(createFallbackRefinementPrompt(normalizedQuery))

          if (!hasTrackedRefinementViewRef.current) {
            hasTrackedRefinementViewRef.current = true
            trackAnalytics({
              eventType: 'search_event',
              searchId: analyticsSearchId,
              sessionId: analyticsSessionId,
              name: 'refine_viewed',
              eventData: {
                usedFallback: true,
              },
            })
          }
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

    if (analyticsSearchIdRef.current && analyticsSessionIdRef.current) {
      trackAnalytics({
        eventType: 'search_run_upsert',
        searchId: analyticsSearchIdRef.current,
        sessionId: analyticsSessionIdRef.current,
        productQuery: submittedQuery,
        details: followUpNotes,
        enteredAiRefinement: true,
        usedShowProductsNow: showPreviewResults,
        completedFinalize: false,
        retryRound: 0,
      })
      trackAnalytics({
        eventType: 'search_event',
        searchId: analyticsSearchIdRef.current,
        sessionId: analyticsSessionIdRef.current,
        name: 'ai_followup_submitted',
        eventData: {
          noteLength: followUpNotes.trim().length,
        },
      })
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

    if (!analyticsSearchIdRef.current || !analyticsSessionIdRef.current) {
      return
    }

    trackAnalytics({
      eventType: 'search_run_upsert',
      searchId: analyticsSearchIdRef.current,
      sessionId: analyticsSessionIdRef.current,
      productQuery: submittedQuery,
      details: followUpNotes,
      enteredAiRefinement: false,
      usedShowProductsNow: true,
      completedFinalize: false,
      retryRound: 0,
    })
    trackAnalytics({
      eventType: 'search_event',
      searchId: analyticsSearchIdRef.current,
      sessionId: analyticsSessionIdRef.current,
      name: 'show_products_now_clicked',
      eventData: {
        previewCount: previewResults.length,
      },
    })

    if (!hasTrackedPreviewImpressionsRef.current) {
      hasTrackedPreviewImpressionsRef.current = true
      const impressionItems = buildResultAnalyticsItems(previewResults)

      if (impressionItems.length > 0) {
        trackAnalytics({
          eventType: 'result_impressions',
          searchId: analyticsSearchIdRef.current,
          sessionId: analyticsSessionIdRef.current,
          resultSet: 'preview',
          items: impressionItems,
        })
      }
    }
  }

  function handleRetryWithFeedback() {
    if (!candidatePool || !submittedQuery || !retryFeedback.trim() || retryCount >= MAX_REFINEMENT_RETRIES) {
      return
    }

    if (!discoveryToken) {
      setErrorMessage('Search session is missing. Please start the search again.')
      return
    }

    if (analyticsSearchIdRef.current && analyticsSessionIdRef.current) {
      trackAnalytics({
        eventType: 'search_event',
        searchId: analyticsSearchIdRef.current,
        sessionId: analyticsSessionIdRef.current,
        name: 'retry_started',
        eventData: {
          retryRound: retryCount + 1,
          feedbackLength: retryFeedback.trim().length,
        },
      })
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

  function handleSelectProduct(item, { position = 0, resultSet = 'final' } = {}) {
    setSelectedProduct({
      ...item,
      analyticsMeta: {
        badgeType: item.badgeLabel || '',
        isBestPick: position === 0 || item.badgeLabel === 'Best match',
        position,
        provider: item.subtitle || '',
        resultKey: String(item.id),
        resultSet,
      },
    })

    if (!analyticsSearchIdRef.current || !analyticsSessionIdRef.current) {
      return
    }

    trackAnalytics({
      eventType: 'result_click',
      searchId: analyticsSearchIdRef.current,
      sessionId: analyticsSessionIdRef.current,
      resultSet,
      resultKey: String(item.id),
      position,
      provider: item.subtitle || '',
      badgeType: item.badgeLabel || '',
      isBestPick: position === 0 || item.badgeLabel === 'Best match',
      clickTarget: 'card',
      retailerUrl: item.link || '',
    })
  }

  function handleRetailerClick(item, { position = 0, resultSet = 'final' } = {}) {
    if (!analyticsSearchIdRef.current || !analyticsSessionIdRef.current) {
      return
    }

    trackAnalytics({
      eventType: 'result_click',
      searchId: analyticsSearchIdRef.current,
      sessionId: analyticsSessionIdRef.current,
      resultSet,
      resultKey: String(item.id),
      position,
      provider: item.subtitle || '',
      badgeType: item.badgeLabel || '',
      isBestPick: position === 0 || item.badgeLabel === 'Best match',
      clickTarget: 'retailer',
      retailerUrl: item.link || '',
    })
  }

  return {
    candidatePool,
    displayedResults,
    errorMessage,
    followUpNotes,
    hasFinalResults,
    hasStartedSearch,
    handleRetailerClick,
    handleSelectProduct,
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
