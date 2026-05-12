import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import {
  createAnalyticsSearchId,
  getOrCreateAnalyticsSessionId,
  trackAnalytics,
} from '@/lib/analytics.js'
import { enrichFinalResultsForDisplay } from '@/components/home/resultPresentation.js'
import { AMAZON_MARKETPLACE_AUTO } from '@/contexts/amazonStoreConstants.js'
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import { validateSearchInput } from '../../../shared/search-input.js'

export { AMAZON_MARKETPLACE_AUTO }
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''
export const RESULT_CARD_COUNT = 6
export const RESULT_CARD_SLOTS = Array.from({ length: RESULT_CARD_COUNT }, (_, index) => index)
export const MAX_REFINEMENT_RETRIES = 2
const FINAL_RESULT_BADGE_REVEAL_DELAY_MS = 240
const ENRICHMENT_POLL_INTERVAL_MS = 1500
const ENRICHMENT_POLL_TIMEOUT_MS = 30000
const QUERY_QUALITY_POLL_INTERVAL_MS = 1500
const QUERY_QUALITY_POLL_TIMEOUT_MS = 20000
const FINALIZE_REQUEST_MODE_DEFAULT = 'guided_finalize'
const FINALIZE_REQUEST_MODE_EMPTY_NOTES = 'guided_empty_notes'
const FINALIZE_REQUEST_MODE_REFINED = 'guided_refined'

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
    helperText:
      'Use this step for natural-language details like budget, size, comfort, style, or where you plan to use it.',
    followUpPlaceholder:
      'Example: I want something lightweight for daily travel, under $200, and easy to clean.',
  }
}

function createExpiredSessionMessage() {
  return 'Your search session expired. Start a new search.'
}

function appendAmazonDomain(searchParams, amazonDomain) {
  if (amazonDomain && amazonDomain !== AMAZON_MARKETPLACE_AUTO) {
    searchParams.set('amazonDomain', amazonDomain)
  }
}

export function resolveAmazonDomainForRequest(selectedAmazonDomain, resolvedAmazonDomain) {
  if (selectedAmazonDomain && selectedAmazonDomain !== AMAZON_MARKETPLACE_AUTO) {
    return selectedAmazonDomain
  }

  if (resolvedAmazonDomain && resolvedAmazonDomain !== AMAZON_MARKETPLACE_AUTO) {
    return resolvedAmazonDomain
  }

  return AMAZON_MARKETPLACE_AUTO
}

async function readJsonResponse(response, requestStartedAt) {
  const responseReceivedAt = performance.now()
  const rawBody = await response.text()
  const responseParsedAt = performance.now()
  const requestId = response.headers?.get?.('x-request-id') || ''
  const contentType = response.headers?.get?.('content-type') || ''
  let payload = {}

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody)
    } catch {
      const bodyPreview = rawBody.trim().slice(0, 120)
      const receivedHtml = contentType.includes('text/html') || /^<!doctype html/i.test(bodyPreview)

      throw new Error(
        receivedHtml
          ? 'The server returned HTML instead of JSON. This usually means the deployment route or rewrite handled the API request incorrectly.'
          : 'The server returned an invalid response. Check the local server or Vercel logs.',
      )
    }
  }

  if (!response.ok) {
    const baseMessage = payload.error || 'Request failed.'
    throw new Error(requestId ? `${baseMessage} (request ${requestId})` : baseMessage)
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

async function fetchDiscoveryResults(query, amazonDomain = AMAZON_MARKETPLACE_AUTO, signal) {
  const searchParams = new URLSearchParams({ query })
  appendAmazonDomain(searchParams, amazonDomain)
  const requestStartedAt = performance.now()
  const response = await fetch(`${BACKEND_URL}/api/search/rainforest-discover?${searchParams.toString()}`, {
    signal,
  })
  return readJsonResponse(response, requestStartedAt)
}

async function fetchRefinementPrompt(query, signal) {
  const searchParams = new URLSearchParams({ query })
  const requestStartedAt = performance.now()
  const response = await fetch(`${BACKEND_URL}/api/search/refine?${searchParams.toString()}`, {
    signal,
  })
  return readJsonResponse(response, requestStartedAt)
}

async function fetchRetryAdvice({
  query,
  followUpNotes,
  rejectionFeedback,
  shortlist,
}) {
  const requestStartedAt = performance.now()
  const response = await fetch(`${BACKEND_URL}/api/search/retry-advice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      followUpNotes,
      rejectionFeedback,
      shortlist,
    }),
  })

  return readJsonResponse(response, requestStartedAt)
}

async function finalizeGuidedSearch({
  query,
  amazonDomain,
  discoveryToken,
  followUpNotes,
  rejectionFeedback,
  retryCount,
  excludedCandidateIds,
  requestMode = FINALIZE_REQUEST_MODE_DEFAULT,
  signal,
}) {
  const requestStartedAt = performance.now()
  const response = await fetch(`${BACKEND_URL}/api/search/finalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      query,
      amazonDomain,
      discoveryToken,
      followUpNotes,
      rejectionFeedback,
      retryCount,
      excludedCandidateIds,
      requestMode,
    }),
  })

  return readJsonResponse(response, requestStartedAt)
}

async function fetchEnrichment({ token, query, amazonDomain }) {
  const searchParams = new URLSearchParams({ token, query })
  appendAmazonDomain(searchParams, amazonDomain)
  const requestStartedAt = performance.now()
  const response = await fetch(`${BACKEND_URL}/api/search/enrichment?${searchParams.toString()}`)
  return readJsonResponse(response, requestStartedAt)
}

async function fetchQueryQualitySuggestion({ token, query, amazonDomain }) {
  const searchParams = new URLSearchParams({ token, query })
  appendAmazonDomain(searchParams, amazonDomain)
  const requestStartedAt = performance.now()
  const response = await fetch(`${BACKEND_URL}/api/search/query-quality?${searchParams.toString()}`)
  return readJsonResponse(response, requestStartedAt)
}

function mergeEnrichmentIntoResults(results, enrichmentEntries) {
  if (!Array.isArray(results) || !Array.isArray(enrichmentEntries) || enrichmentEntries.length === 0) {
    return results
  }

  const enrichmentById = new Map(
    enrichmentEntries.map((entry) => [
      String(entry?.candidate_id || entry?.candidateId || ''),
      entry,
    ]),
  )

  return results.map((result) => {
    const entry = enrichmentById.get(String(result.id))

    if (!entry) {
      return result
    }

    return {
      ...result,
      fit_reason: entry?.fit_reason || entry?.fitReason || '',
      caveat: entry?.caveat || '',
      feature_bullets: Array.isArray(entry?.feature_bullets)
        ? entry.feature_bullets
        : Array.isArray(entry?.featureBullets)
          ? entry.featureBullets
          : Array.isArray(result?.feature_bullets)
            ? result.feature_bullets
            : [],
    }
  })
}

function entriesNeedFeatureBulletHydration(enrichmentEntries) {
  if (!Array.isArray(enrichmentEntries) || enrichmentEntries.length === 0) {
    return false
  }

  return enrichmentEntries.some((entry) => {
    const featureBullets = Array.isArray(entry?.feature_bullets)
      ? entry.feature_bullets
      : Array.isArray(entry?.featureBullets)
        ? entry.featureBullets
        : []

    return featureBullets.length === 0
  })
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

function buildQuerySuggestionAnalyticsData(suggestion = {}) {
  const originalQuery = String(suggestion.originalQuery || suggestion.query || '')
  const suggestedQuery = String(suggestion.suggestedQuery || '')

  return {
    originalQueryLength: originalQuery.length,
    suggestedQueryLength: suggestedQuery.length,
    classification: suggestion.classification || '',
    confidence: suggestion.confidence || '',
  }
}

function findResultById(results, id) {
  if (!Array.isArray(results) || !id) {
    return null
  }

  return results.find((item) => String(item.id) === String(id)) || null
}

export function resolveSelectedProductForDisplay({
  previousResults = [],
  previewResults = [],
  results = [],
  selectedProduct,
}) {
  if (!selectedProduct) {
    return null
  }

  const selectedProductResultSet = selectedProduct.analyticsMeta?.resultSet || 'final'
  const selectedProductLiveSource =
    selectedProductResultSet === 'previous'
      ? previousResults
      : selectedProductResultSet === 'preview'
        ? previewResults
        : results
  const liveSelectedProduct =
    selectedProduct.id
      ? findResultById(selectedProductLiveSource, selectedProduct.id) ||
        findResultById(results, selectedProduct.id) ||
        findResultById(previousResults, selectedProduct.id) ||
        findResultById(previewResults, selectedProduct.id)
      : null

  if (!liveSelectedProduct) {
    return selectedProduct
  }

  return {
    ...liveSelectedProduct,
    analyticsMeta: selectedProduct.analyticsMeta,
  }
}

export function useGuidedSearch() {
  const [productQuery, setProductQuery] = useState('')
  const {
    detectedCountryCode,
    hasAskedMarketplacePreference,
    markMarketplacePromptHandled,
    selectedAmazonDomain,
    resolvedAmazonDomain,
    setSelectedAmazonDomain,
  } = useAmazonStore()
  const [submittedAmazonDomain, setSubmittedAmazonDomain] = useState('')
  const [selectedProductState, setSelectedProductState] = useState(null)
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
  const [retryAdvice, setRetryAdvice] = useState(null)
  const [suggestedRetryQuery, setSuggestedRetryQuery] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [selectionState, setSelectionState] = useState(null)
  const [analyticsSearchId, setAnalyticsSearchId] = useState('')
  const [analyticsSessionId, setAnalyticsSessionId] = useState('')
  const [requestTiming, setRequestTiming] = useState({
    discover: null,
    finalize: null,
    refine: null,
  })
  const [revealedBadgeResultsKey, setRevealedBadgeResultsKey] = useState('')
  const [showPreviewResults, setShowPreviewResults] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [isEnrichmentReady, setIsEnrichmentReady] = useState(false)
  const [isEnrichmentSettled, setIsEnrichmentSettled] = useState(false)
  const [querySuggestion, setQuerySuggestion] = useState(null)
  const [isCheckingQueryQuality, setIsCheckingQueryQuality] = useState(false)
  const [isApplyingQuerySuggestion, setIsApplyingQuerySuggestion] = useState(false)
  const activeSearchIdRef = useRef(0)
  const enrichmentPollRef = useRef({ source: null, timerId: null, searchId: 0 })
  const queryQualityPollRef = useRef({
    timerId: null,
    searchId: 0,
    token: '',
    query: '',
    amazonDomain: '',
  })
  const shouldContinueDetailHydrationRef = useRef(false)
  const discoveryAbortControllerRef = useRef(null)
  const finalizeAbortControllerRef = useRef(null)
  const refineAbortControllerRef = useRef(null)
  const analyticsSearchIdRef = useRef('')
  const analyticsSessionIdRef = useRef('')
  const retryAdviceRequestIdRef = useRef(0)
  const hasTrackedRefinementViewRef = useRef(false)
  const hasTrackedPreviewImpressionsRef = useRef(false)
  const startGuidedSearchRef = useRef(null)

  function invalidateRetryAdviceRequests() {
    retryAdviceRequestIdRef.current += 1
  }

  function trackSearchEvent(name, eventData = {}) {
    if (!analyticsSearchIdRef.current || !analyticsSessionIdRef.current) {
      return
    }

    trackAnalytics({
      eventType: 'search_event',
      searchId: analyticsSearchIdRef.current,
      sessionId: analyticsSessionIdRef.current,
      name,
      eventData,
    })
  }

  function stopEnrichmentPolling() {
    if (enrichmentPollRef.current.source) {
      enrichmentPollRef.current.source.close()
      enrichmentPollRef.current.source = null
    }

    if (enrichmentPollRef.current.timerId !== null) {
      window.clearTimeout(enrichmentPollRef.current.timerId)
      enrichmentPollRef.current.timerId = null
    }

    enrichmentPollRef.current.searchId = 0
    shouldContinueDetailHydrationRef.current = false
  }

  function stopQueryQualityPolling({ clearSuggestion = false } = {}) {
    if (queryQualityPollRef.current.timerId !== null) {
      window.clearTimeout(queryQualityPollRef.current.timerId)
      queryQualityPollRef.current.timerId = null
    }

    queryQualityPollRef.current = {
      timerId: null,
      searchId: 0,
      token: '',
      query: '',
      amazonDomain: '',
    }
    setIsCheckingQueryQuality(false)

    if (clearSuggestion) {
      setQuerySuggestion(null)
      setIsApplyingQuerySuggestion(false)
    }
  }

  function cancelDiscoveryRequest() {
    if (discoveryAbortControllerRef.current) {
      discoveryAbortControllerRef.current.abort()
      discoveryAbortControllerRef.current = null
    }
  }

  function cancelFinalizeRequest() {
    if (finalizeAbortControllerRef.current) {
      finalizeAbortControllerRef.current.abort()
      finalizeAbortControllerRef.current = null
    }
  }

  function cancelRefinementRequest() {
    if (refineAbortControllerRef.current) {
      refineAbortControllerRef.current.abort()
      refineAbortControllerRef.current = null
    }
  }

  function expireSearchSession(message = createExpiredSessionMessage()) {
    stopEnrichmentPolling()
    stopQueryQualityPolling({ clearSuggestion: true })
    cancelFinalizeRequest()
    finalizeMutation.reset()
    setDiscoveryToken('')
    setCandidatePool(null)
    setResults([])
    setPreviousResults([])
    setSelectionState(null)
    setIsEnrichmentReady(false)
    setIsEnrichmentSettled(false)
    setErrorMessage(message)
  }

  function startEnrichmentStream({ token, query, searchId, amazonDomain }) {
    if (window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__) return
    stopEnrichmentPolling()
    enrichmentPollRef.current.searchId = searchId
    shouldContinueDetailHydrationRef.current = false
    const startedAt = performance.now()

    function schedulePoll() {
      enrichmentPollRef.current.timerId = window.setTimeout(async () => {
        if (enrichmentPollRef.current.searchId !== searchId) {
          return
        }

        if (performance.now() - startedAt > ENRICHMENT_POLL_TIMEOUT_MS) {
          stopEnrichmentPolling()
          setIsEnrichmentSettled(true)
          return
        }

        try {
          const payload = await fetchEnrichment({ token, query, amazonDomain })

          if (enrichmentPollRef.current.searchId !== searchId) {
            return
          }

          if (payload.ready) {
            if (Array.isArray(payload.entries) && payload.entries.length > 0) {
              setResults((current) => mergeEnrichmentIntoResults(current, payload.entries))
              setIsEnrichmentReady(true)
              shouldContinueDetailHydrationRef.current = entriesNeedFeatureBulletHydration(payload.entries)
            }
            setIsEnrichmentSettled(true)

            if (shouldContinueDetailHydrationRef.current) {
              schedulePoll()
              return
            }

            stopEnrichmentPolling()
            return
          }
        } catch {
          // Poll silently — enrichment is best-effort
        }

        if (enrichmentPollRef.current.searchId === searchId) {
          schedulePoll()
        }
      }, ENRICHMENT_POLL_INTERVAL_MS)
    }

    if (typeof EventSource !== 'function') {
      schedulePoll()
      return
    }

    const searchParams = new URLSearchParams({ token, query })
    appendAmazonDomain(searchParams, amazonDomain)
    const source = new EventSource(`${BACKEND_URL}/api/search/enrichment-stream?${searchParams.toString()}`)
    enrichmentPollRef.current.source = source
    let hasFallenBackToPolling = false

    source.onmessage = (event) => {
      if (enrichmentPollRef.current.searchId !== searchId) {
        return
      }

      try {
        const payload = JSON.parse(event.data)

        if (payload.ready) {
          if (Array.isArray(payload.entries) && payload.entries.length > 0) {
            setResults((current) => mergeEnrichmentIntoResults(current, payload.entries))
            setIsEnrichmentReady(true)
            shouldContinueDetailHydrationRef.current = entriesNeedFeatureBulletHydration(payload.entries)
          }
          setIsEnrichmentSettled(true)

          if (shouldContinueDetailHydrationRef.current) {
            if (enrichmentPollRef.current.source) {
              enrichmentPollRef.current.source.close()
              enrichmentPollRef.current.source = null
            }
            schedulePoll()
            return
          }

          stopEnrichmentPolling()
        }
      } catch {
        stopEnrichmentPolling()
        setIsEnrichmentSettled(true)
      }
    }

    source.onerror = () => {
      if (hasFallenBackToPolling || enrichmentPollRef.current.searchId !== searchId) {
        return
      }

      hasFallenBackToPolling = true

      if (enrichmentPollRef.current.source) {
        enrichmentPollRef.current.source.close()
        enrichmentPollRef.current.source = null
      }

      schedulePoll()
    }
  }

  function startQueryQualityPolling({ token, query, searchId, amazonDomain }) {
    if (window.__FOCAMAI_DISABLE_QUERY_QUALITY_POLLING__) return
    stopQueryQualityPolling({ clearSuggestion: true })

    if (!token || !query) {
      return
    }

    const startedAt = performance.now()
    queryQualityPollRef.current = {
      timerId: null,
      searchId,
      token,
      query,
      amazonDomain,
    }
    setIsCheckingQueryQuality(true)

    async function poll() {
      const currentPoll = queryQualityPollRef.current

      if (
        currentPoll.searchId !== searchId ||
        currentPoll.token !== token ||
        currentPoll.query !== query ||
        currentPoll.amazonDomain !== amazonDomain
      ) {
        return
      }

      if (performance.now() - startedAt > QUERY_QUALITY_POLL_TIMEOUT_MS) {
        stopQueryQualityPolling()
        return
      }

      try {
        const payload = await fetchQueryQualitySuggestion({ token, query, amazonDomain })
        const latestPoll = queryQualityPollRef.current

        if (
          latestPoll.searchId !== searchId ||
          latestPoll.token !== token ||
          latestPoll.query !== query ||
          latestPoll.amazonDomain !== amazonDomain ||
          activeSearchIdRef.current !== searchId
        ) {
          return
        }

        if (payload.ready) {
          if (payload.shouldSuggest && payload.suggestedQuery) {
            const nextSuggestion = {
              originalQuery: payload.originalQuery || query,
              suggestedQuery: payload.suggestedQuery,
              reason: payload.reason || '',
              classification: payload.classification || '',
              confidence: payload.confidence || '',
              token,
              query,
              amazonDomain,
              searchId,
            }

            setQuerySuggestion(nextSuggestion)
            trackSearchEvent(
              'query_quality_suggestion_shown',
              buildQuerySuggestionAnalyticsData(nextSuggestion),
            )
          }

          stopQueryQualityPolling()
          return
        }
      } catch {
        // Query-quality recovery is optional; keep the original results uninterrupted.
      }

      if (queryQualityPollRef.current.searchId === searchId) {
        queryQualityPollRef.current.timerId = window.setTimeout(
          poll,
          QUERY_QUALITY_POLL_INTERVAL_MS,
        )
      }
    }

    void poll()
  }

  function applyFinalizePayload(payload, variables) {
    if ((variables?.searchId || 0) !== activeSearchIdRef.current) {
      return
    }

    const finalizedResults = enrichFinalResultsForDisplay(
      mergeFinalizeResults(payload.results, variables.originalCandidatePool),
    )
    const hasInlineEnrichment = finalizedResults.some(
      (item) => Boolean(item?.fit_reason || item?.fitReason),
    )
    const previousDisplayResults =
      variables.retryCount > 0 && Array.isArray(variables.previousResults)
        ? enrichFinalResultsForDisplay(variables.previousResults)
        : []

    setCandidatePool(variables.originalCandidatePool || null)
    setPreviousResults(previousDisplayResults)
    setResults(finalizedResults)
    setRevealedBadgeResultsKey('')
    setIsEnrichmentReady(hasInlineEnrichment)
    setIsEnrichmentSettled(hasInlineEnrichment)

    const token = variables.discoveryToken
    const query = variables.query
    const pollSearchId = activeSearchIdRef.current

    if (!hasInlineEnrichment && token && query && finalizedResults.length > 0) {
      startEnrichmentStream({
        token,
        query,
        searchId: pollSearchId,
        amazonDomain: submittedAmazonDomain,
      })
    }
    setRequestTiming((current) => ({
      ...current,
      finalize: payload.timing || null,
    }))
    invalidateRetryAdviceRequests()
    setRetryFeedback('')
    setRetryAdvice(null)
    setSuggestedRetryQuery('')
    setRetryCount(payload.retryCount ?? variables.retryCount ?? 0)
    setSelectionState(payload.selection || null)

    const searchId = analyticsSearchIdRef.current
    const sessionId = analyticsSessionIdRef.current
    const resultSet = variables.retryCount > 0 ? 'retry' : 'final'

    if (searchId && sessionId) {
      trackAnalytics({
        eventType: 'search_run_upsert',
        searchId,
        sessionId,
        productQuery: variables.query,
        details: variables.followUpNotes || '',
        enteredAiRefinement: Boolean(variables.followUpNotes),
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
          requestMode: variables.requestMode || FINALIZE_REQUEST_MODE_DEFAULT,
          usedPrewarm: Boolean(
            payload.selection?.reusedCandidateAwarePrior || payload.selection?.reusedPreRankArtifact,
          ),
          usedIntentMatchRerank: Boolean(payload.selection?.usedIntentMatchRerank),
          flowPath: payload.selection?.flowPath || '',
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
  }

  function handleFinalizeError(error, variables) {
    if ((variables?.searchId || 0) !== activeSearchIdRef.current) {
      return
    }

    if (error?.name === 'AbortError') {
      return
    }

    const message = error instanceof Error ? error.message : 'Unable to finalize the search.'

    if (/session expired|start a new search/i.test(message)) {
      expireSearchSession(message)
      return
    }

    setErrorMessage(message)
  }

  function startFinalizeMutation(variables) {
    cancelFinalizeRequest()
    const abortController = new AbortController()
    finalizeAbortControllerRef.current = abortController
    finalizeMutation.mutate({
      ...variables,
      searchId: activeSearchIdRef.current,
      signal: abortController.signal,
    })
  }

  const finalizeMutation = useMutation({
    mutationFn: finalizeGuidedSearch,
    onMutate: () => {
      setErrorMessage('')
    },
    onSuccess: applyFinalizePayload,
    onError: handleFinalizeError,
    onSettled: (_data, _error, variables) => {
      if ((variables?.searchId || 0) === activeSearchIdRef.current) {
        finalizeAbortControllerRef.current = null
      }
    },
  })
  const retryAdviceMutation = useMutation({
    mutationFn: fetchRetryAdvice,
    onMutate: () => {
      setErrorMessage('')
    },
    onSuccess: (payload, variables) => {
      const snapshot = variables?.snapshot

      if (
        !snapshot ||
        retryAdviceRequestIdRef.current !== snapshot.requestId ||
        activeSearchIdRef.current !== snapshot.searchId ||
        submittedQuery !== snapshot.query ||
        followUpNotes !== snapshot.followUpNotes ||
        retryFeedback.trim() !== snapshot.rejectionFeedback ||
        finalResultsKey !== snapshot.resultsKey
      ) {
        return
      }

      setRetryAdvice(payload)
      setSuggestedRetryQuery(payload.suggestedQuery || '')
      trackSearchEvent('retry_advice_shown', {
        adviceRecommendationInternal: payload.recommendation || '',
        userFacingAction: 'new_search',
        suggestedQueryLength: String(payload.suggestedQuery || '').length,
      })
    },
    onError: (error, variables) => {
      const snapshot = variables?.snapshot

      if (
        !snapshot ||
        retryAdviceRequestIdRef.current !== snapshot.requestId ||
        activeSearchIdRef.current !== snapshot.searchId ||
        submittedQuery !== snapshot.query ||
        followUpNotes !== snapshot.followUpNotes ||
        retryFeedback.trim() !== snapshot.rejectionFeedback ||
        finalResultsKey !== snapshot.resultsKey
      ) {
        return
      }

      setErrorMessage(error instanceof Error ? error.message : 'Unable to suggest a better search direction.')
    },
  })

  const finalResultsKey = results.map((item) => String(item.id)).join('|')
  const showFinalResultBadges = results.length > 0 && revealedBadgeResultsKey === finalResultsKey

  useEffect(() => {
    if (results.length === 0) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setRevealedBadgeResultsKey(finalResultsKey)
    }, FINAL_RESULT_BADGE_REVEAL_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [finalResultsKey, results.length])

  useEffect(() => () => {
    cancelDiscoveryRequest()
    cancelFinalizeRequest()
    cancelRefinementRequest()
    stopEnrichmentPolling()
    stopQueryQualityPolling()
  }, [])

  const isFinalizing = finalizeMutation.isPending
  const isLoading = isDiscovering || isGeneratingPrompt || isFinalizing
  const hasFinalResults = results.length > 0
  const displayedResults = hasFinalResults ? results : showPreviewResults ? previewResults : []
  const selectedProductForDisplay = resolveSelectedProductForDisplay({
    previousResults,
    previewResults,
    results,
    selectedProduct: selectedProductState,
  })

  function resetGuidedState(
    nextSubmittedQuery,
    nextSubmittedAmazonDomain = '',
    { preserveFollowUpNotes = false } = {},
  ) {
    cancelDiscoveryRequest()
    stopEnrichmentPolling()
    stopQueryQualityPolling({ clearSuggestion: true })
    cancelFinalizeRequest()
    cancelRefinementRequest()
    invalidateRetryAdviceRequests()
    setHasStartedSearch(true)
    setSubmittedQuery(nextSubmittedQuery)
    setSubmittedAmazonDomain(nextSubmittedAmazonDomain)
    setSelectedProductState(null)
    setErrorMessage('')
    setDiscoveryToken('')
    setCandidatePool(null)
    setPreviewResults([])
    setResults([])
    setPreviousResults([])
    setFollowUpNotes((current) => (preserveFollowUpNotes ? current : ''))
    setRetryFeedback('')
    setRetryAdvice(null)
    setSuggestedRetryQuery('')
    setRetryCount(0)
    setSelectionState(null)
    setRequestTiming({
      discover: null,
      finalize: null,
      refine: null,
    })
    setRevealedBadgeResultsKey('')
    setShowPreviewResults(false)
    setRefinementPrompt(null)
    setIsEnrichmentReady(false)
    setIsEnrichmentSettled(false)
    setQuerySuggestion(null)
    setIsApplyingQuerySuggestion(false)
    hasTrackedRefinementViewRef.current = false
    hasTrackedPreviewImpressionsRef.current = false
  }

  function resetToNewSearch() {
    activeSearchIdRef.current += 1
    invalidateRetryAdviceRequests()
    cancelDiscoveryRequest()
    cancelFinalizeRequest()
    cancelRefinementRequest()
    stopEnrichmentPolling()
    stopQueryQualityPolling({ clearSuggestion: true })
    finalizeMutation.reset()
    retryAdviceMutation.reset()
    setProductQuery('')
    setSelectedProductState(null)
    setErrorMessage('')
    setHasStartedSearch(false)
    setSubmittedQuery('')
    setSubmittedAmazonDomain('')
    setDiscoveryToken('')
    setCandidatePool(null)
    setPreviewResults([])
    setResults([])
    setRefinementPrompt(null)
    setFollowUpNotes('')
    setRetryFeedback('')
    setRetryAdvice(null)
    setSuggestedRetryQuery('')
    setRetryCount(0)
    setSelectionState(null)
    setRequestTiming({
      discover: null,
      finalize: null,
      refine: null,
    })
    setRevealedBadgeResultsKey('')
    setPreviousResults([])
    setShowPreviewResults(false)
    setIsDiscovering(false)
    setIsGeneratingPrompt(false)
    setIsEnrichmentReady(false)
    setIsEnrichmentSettled(false)
    setQuerySuggestion(null)
    setIsApplyingQuerySuggestion(false)
    analyticsSearchIdRef.current = ''
    setAnalyticsSearchId('')
    setAnalyticsSessionId('')
    hasTrackedRefinementViewRef.current = false
    hasTrackedPreviewImpressionsRef.current = false
  }

  function startGuidedSearch(
    normalizedQuery,
    {
      preserveFollowUpNotes = false,
      reuseAnalytics = false,
      searchEventName = 'search_started',
    } = {},
  ) {
    const nextSearchId = activeSearchIdRef.current + 1
    activeSearchIdRef.current = nextSearchId
    const nextAmazonDomain = resolveAmazonDomainForRequest(selectedAmazonDomain, resolvedAmazonDomain)
    const analyticsSearchId =
      reuseAnalytics && analyticsSearchIdRef.current
        ? analyticsSearchIdRef.current
        : createAnalyticsSearchId()
    const analyticsSessionId =
      reuseAnalytics && analyticsSessionIdRef.current
        ? analyticsSessionIdRef.current
        : getOrCreateAnalyticsSessionId()

    analyticsSearchIdRef.current = analyticsSearchId
    analyticsSessionIdRef.current = analyticsSessionId
    setAnalyticsSearchId(analyticsSearchId)
    setAnalyticsSessionId(analyticsSessionId)

    resetGuidedState(normalizedQuery, nextAmazonDomain, { preserveFollowUpNotes })
    setIsDiscovering(true)
    setIsGeneratingPrompt(true)

    trackAnalytics({
      eventType: 'search_run_upsert',
      searchId: analyticsSearchId,
      sessionId: analyticsSessionId,
      productQuery: normalizedQuery,
      details: preserveFollowUpNotes ? followUpNotes : '',
      enteredAiRefinement: preserveFollowUpNotes ? Boolean(followUpNotes.trim()) : false,
      usedShowProductsNow: false,
      completedFinalize: false,
      retryRound: 0,
    })
    trackAnalytics({
      eventType: 'search_event',
      searchId: analyticsSearchId,
      sessionId: analyticsSessionId,
      name: searchEventName,
      eventData: {
        query: normalizedQuery,
        amazonDomain: nextAmazonDomain,
      },
    })

    cancelDiscoveryRequest()
    const discoveryAbortController = new AbortController()
    discoveryAbortControllerRef.current = discoveryAbortController

    fetchDiscoveryResults(normalizedQuery, nextAmazonDomain, discoveryAbortController.signal)
      .then((payload) => {
        if (activeSearchIdRef.current !== nextSearchId) {
          return
        }

        if (!payload.discoveryToken) {
          setCandidatePool(null)
          setPreviewResults([])
          setErrorMessage(createExpiredSessionMessage())
          return
        }

        const responseAmazonDomain = payload.amazonDomain || nextAmazonDomain

        setDiscoveryToken(payload.discoveryToken || '')
        setSubmittedAmazonDomain(responseAmazonDomain)
        setCandidatePool(payload.candidatePool || null)
        setPreviewResults(payload.previewResults || [])
        startQueryQualityPolling({
          token: payload.discoveryToken,
          query: normalizedQuery,
          searchId: nextSearchId,
          amazonDomain: responseAmazonDomain,
        })
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
        if (activeSearchIdRef.current !== nextSearchId || error?.name === 'AbortError') {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : 'Unable to start the search.')
      })
      .finally(() => {
        if (discoveryAbortControllerRef.current === discoveryAbortController) {
          discoveryAbortControllerRef.current = null
        }

        if (activeSearchIdRef.current === nextSearchId) {
          setIsDiscovering(false)
        }
      })

    cancelRefinementRequest()
    const refineAbortController = new AbortController()
    refineAbortControllerRef.current = refineAbortController

    fetchRefinementPrompt(normalizedQuery, refineAbortController.signal)
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
      .catch((error) => {
        if (activeSearchIdRef.current !== nextSearchId || error?.name === 'AbortError') {
          return
        }

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
      })
      .finally(() => {
        if (refineAbortControllerRef.current === refineAbortController) {
          refineAbortControllerRef.current = null
        }

        if (activeSearchIdRef.current === nextSearchId) {
          setIsGeneratingPrompt(false)
        }
      })
  }

  useEffect(() => {
    startGuidedSearchRef.current = startGuidedSearch
  })

  useEffect(() => {
    if (!hasStartedSearch || !submittedQuery) {
      return
    }

    const nextAmazonDomain = resolveAmazonDomainForRequest(selectedAmazonDomain, resolvedAmazonDomain)

    if (!nextAmazonDomain || nextAmazonDomain === submittedAmazonDomain) {
      return
    }

    startGuidedSearchRef.current?.(submittedQuery, {
      preserveFollowUpNotes: true,
      reuseAnalytics: true,
      searchEventName: 'marketplace_search_restarted',
    })
  }, [
    hasStartedSearch,
    resolvedAmazonDomain,
    selectedAmazonDomain,
    submittedAmazonDomain,
    submittedQuery,
  ])

  function beginGuidedSearch(event) {
    event.preventDefault()

    const { error, isValid, normalizedQuery } = validateSearchInput(productQuery, '')

    if (!isValid) {
      setErrorMessage(error)
      return
    }

    startGuidedSearch(normalizedQuery)
  }

  function handleFinalizeRefinement() {
    if (!candidatePool || !submittedQuery) {
      return
    }

    if (!discoveryToken) {
      expireSearchSession()
      return
    }

    const normalizedFollowUpNotes = followUpNotes.trim()

    if (analyticsSearchIdRef.current && analyticsSessionIdRef.current) {
      trackAnalytics({
        eventType: 'search_run_upsert',
        searchId: analyticsSearchIdRef.current,
        sessionId: analyticsSessionIdRef.current,
        productQuery: submittedQuery,
        details: followUpNotes,
        enteredAiRefinement: Boolean(normalizedFollowUpNotes),
        usedShowProductsNow: showPreviewResults,
        completedFinalize: false,
        retryRound: 0,
      })
      trackSearchEvent('ai_followup_submitted', {
        noteLength: normalizedFollowUpNotes.length,
      })
    }

    if (normalizedFollowUpNotes) {
      const nextFinalizeRequest = {
        query: submittedQuery,
        amazonDomain: submittedAmazonDomain,
        discoveryToken,
        originalCandidatePool: candidatePool,
        followUpNotes,
        rejectionFeedback: '',
        retryCount: 0,
        excludedCandidateIds: [],
        previousResults: [],
        requestMode: FINALIZE_REQUEST_MODE_REFINED,
      }

      startFinalizeMutation(nextFinalizeRequest)
      return
    }

    const nextFinalizeRequest = {
      query: submittedQuery,
      amazonDomain: submittedAmazonDomain,
      discoveryToken,
      originalCandidatePool: candidatePool,
      followUpNotes: '',
      rejectionFeedback: '',
      retryCount: 0,
      excludedCandidateIds: [],
      previousResults: [],
      requestMode: FINALIZE_REQUEST_MODE_EMPTY_NOTES,
    }

    startFinalizeMutation(nextFinalizeRequest)
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

  function handleRejectQuerySuggestion() {
    if (querySuggestion) {
      trackSearchEvent(
        'query_quality_suggestion_rejected',
        buildQuerySuggestionAnalyticsData(querySuggestion),
      )
    }

    setQuerySuggestion(null)
    setIsApplyingQuerySuggestion(false)
  }

  function handleTryQuerySuggestion() {
    const nextQuery = String(querySuggestion?.suggestedQuery || '').trim()

    if (!nextQuery) {
      setQuerySuggestion(null)
      setIsApplyingQuerySuggestion(false)
      return
    }

    const { error, isValid, normalizedQuery } = validateSearchInput(nextQuery, '')

    if (!isValid) {
      setErrorMessage(error)
      setQuerySuggestion(null)
      setIsApplyingQuerySuggestion(false)
      return
    }

    trackSearchEvent(
      'query_quality_suggestion_accepted',
      buildQuerySuggestionAnalyticsData(querySuggestion),
    )
    setIsApplyingQuerySuggestion(true)
    setProductQuery(normalizedQuery)
    setQuerySuggestion(null)
    startGuidedSearch(normalizedQuery)
  }

  function handleRetryAdviceRequest() {
    if (!submittedQuery || !retryFeedback.trim() || !hasFinalResults || retryAdviceMutation.isPending) {
      return
    }

    const normalizedFeedback = retryFeedback.trim()
    const requestId = retryAdviceRequestIdRef.current + 1
    retryAdviceRequestIdRef.current = requestId

    trackSearchEvent('retry_advice_started', {
      feedbackLength: normalizedFeedback.length,
      resultCount: results.length,
    })

    retryAdviceMutation.mutate({
      query: submittedQuery,
      followUpNotes,
      rejectionFeedback: normalizedFeedback,
      shortlist: results.map((result) => ({
        title: result.title || '',
      })),
      snapshot: {
        requestId,
        searchId: activeSearchIdRef.current,
        query: submittedQuery,
        followUpNotes,
        rejectionFeedback: normalizedFeedback,
        resultsKey: finalResultsKey,
      },
    })
  }

  function updateRetryFeedback(nextValue) {
    invalidateRetryAdviceRequests()
    setRetryFeedback(nextValue)
    setRetryAdvice(null)
    setSuggestedRetryQuery('')
  }

  function handleSelectProduct(item, { position = 0, resultSet = 'final' } = {}) {
    setSelectedProductState({
      id: item.id,
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
    analyticsSearchId,
    analyticsSessionId,
    candidatePool,
    detectedCountryCode,
    displayedResults,
    errorMessage,
    followUpNotes,
    hasFinalResults,
    hasAskedMarketplacePreference,
    hasStartedSearch,
    handleRetailerClick,
    handleSelectProduct,
    isDiscovering,
    isEnrichmentReady,
    isEnrichmentSettled,
    isFinalizing,
    isApplyingQuerySuggestion,
    isCheckingQueryQuality,
    isGeneratingRetryAdvice: retryAdviceMutation.isPending,
    isGeneratingPrompt,
    isLoading,
    previousResults,
    productQuery,
    querySuggestion,
    requestTiming,
    refinementPrompt,
    resolvedAmazonDomain,
    retryAdvice,
    markMarketplacePromptHandled,
    selectedAmazonDomain,
    selectionState,
    retryCount,
    retryFeedback,
    suggestedRetryQuery,
    selectedProduct: selectedProductForDisplay,
    showFinalResultBadges,
    showPreviewResults,
    submittedQuery,
    beginGuidedSearch,
    handleFinalizeRefinement,
    handleRejectQuerySuggestion,
    handleRetryAdviceRequest,
    handleShowProductsNow,
    handleTryQuerySuggestion,
    resetToNewSearch,
    setRetryFeedback: updateRetryFeedback,
    setFollowUpNotes,
    setSelectedAmazonDomain,
    setProductQuery,
    setSuggestedRetryQuery,
    setSelectedProduct: setSelectedProductState,
  }
}
