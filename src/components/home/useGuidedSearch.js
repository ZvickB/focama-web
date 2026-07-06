import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

import {
  createAnalyticsSearchId,
  getOrCreateAnalyticsSessionId,
} from '@/lib/analytics.js'
import { enrichFinalResultsForDisplay } from '@/components/home/resultPresentation.js'
import { recordSearchDebugEvent } from '@/components/home/searchDebugEvents.js'
import {
  buildQuerySuggestionAnalyticsData,
  buildResultAnalyticsItems,
  trackResultClickAnalytics,
  trackResultImpressionsAnalytics,
  trackSearchAnalyticsEvent,
  trackSearchRunAnalytics,
} from '@/components/home/searchAnalytics.js'
import { AMAZON_MARKETPLACE_AUTO } from '@/contexts/amazonStoreConstants.js'
import {
  appendAmazonDomain,
  createExpiredSessionMessage,
  createFallbackRefinementPrompt,
  detectHardConstraint,
  ENRICHMENT_POLL_INTERVAL_MS,
  ENRICHMENT_POLL_TIMEOUT_MS,
  FINAL_RESULT_BADGE_REVEAL_DELAY_MS,
  FINALIZE_REQUEST_MODE_DEFAULT,
  FINALIZE_REQUEST_MODE_EMPTY_NOTES,
  FINALIZE_REQUEST_MODE_REFINED,
  QUERY_QUALITY_POLL_INTERVAL_MS,
  QUERY_QUALITY_POLL_TIMEOUT_MS,
  resolveAmazonDomainForRequest,
  resolvePollInterval,
  RESULT_CARD_COUNT,
  RESULT_CARD_SLOTS,
} from '@/components/home/guided-search/constants.js'
import {
  fetchDiscoveryResults,
  fetchEnrichment,
  fetchProductDetails,
  fetchQueryQualitySuggestion,
  fetchRefinementPrompt,
  fetchRetryAdvice,
  finalizeGuidedSearch,
} from '@/components/home/guided-search/api.js'
import {
  entriesNeedFeatureBulletHydration,
  mergeFinalizeResults,
  mergeDeepDiveEligibilityIntoResults,
  mergeEnrichmentIntoResults,
  mergeProductDetailsIntoResults,
  resolveSelectedProductForDisplay,
} from '@/components/home/guided-search/result-merge.js'
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import { historyStore } from '@/lib/history/historyStore.js'
import { clearFlowSnapshot, readFlowSnapshot, saveFlowSnapshot } from '@/lib/search/searchFlowSnapshot.js'
import {
  buildSearchDebugInfoText,
  reportSearchDiagnosticEvent,
  runSearchFailureDiagnostics,
} from '@/lib/searchDiagnostics.js'
import { MAX_PRODUCT_QUERY_LENGTH, validateSearchInput } from '../../../shared/search-input.js'

export { AMAZON_MARKETPLACE_AUTO }
export { RESULT_CARD_COUNT, RESULT_CARD_SLOTS }
export { detectHardConstraint, resolveAmazonDomainForRequest }
export { resolveSelectedProductForDisplay }

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ''

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
  const [failureDiagnostics, setFailureDiagnostics] = useState(null)
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
  const [isRefreshingConstraintDiscovery, setIsRefreshingConstraintDiscovery] = useState(false)
  const [isEnrichmentReady, setIsEnrichmentReady] = useState(false)
  const [isEnrichmentSettled, setIsEnrichmentSettled] = useState(false)
  const [querySuggestion, setQuerySuggestion] = useState(null)
  const [isCheckingQueryQuality, setIsCheckingQueryQuality] = useState(false)
  const [isApplyingQuerySuggestion, setIsApplyingQuerySuggestion] = useState(false)
  const activeSearchIdRef = useRef(0)
  const enrichmentPollRef = useRef({ source: null, timerId: null, searchId: 0 })
  const previewDetailsRequestRef = useRef(new Set())
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
  const constraintRefreshSearchIdRef = useRef(0)
  const constraintRefreshResultRef = useRef(null)

  function invalidateRetryAdviceRequests() {
    retryAdviceRequestIdRef.current += 1
  }

  function getAnalyticsIds(explicitIds = {}) {
    return {
      searchId: explicitIds.searchId || analyticsSearchIdRef.current,
      sessionId: explicitIds.sessionId || analyticsSessionIdRef.current,
    }
  }

  function trackSearchEvent(name, eventData = {}, explicitIds = {}) {
    trackSearchAnalyticsEvent(name, eventData, getAnalyticsIds(explicitIds))
  }

  function trackSearchRun(eventData = {}, explicitIds = {}) {
    trackSearchRunAnalytics(eventData, getAnalyticsIds(explicitIds))
  }

  function trackResultImpressions(eventData = {}, explicitIds = {}) {
    trackResultImpressionsAnalytics(eventData, getAnalyticsIds(explicitIds))
  }

  function trackResultClick(eventData = {}, explicitIds = {}) {
    trackResultClickAnalytics(eventData, getAnalyticsIds(explicitIds))
  }

  function recordDiagnostic(stage, data = {}, explicitIds = {}) {
    const ids = getAnalyticsIds(explicitIds)

    if (!ids.searchId) {
      return
    }

    reportSearchDiagnosticEvent({
      searchId: ids.searchId,
      sessionId: ids.sessionId,
      stage,
      amazonDomain: data.amazonDomain ?? submittedAmazonDomain,
      query: data.query ?? submittedQuery,
      retryCount,
      ...data,
    })
  }

  function createFailureDiagnostics({
    amazonDomain = submittedAmazonDomain,
    durationMs = null,
    error,
    fallbackUsed = false,
    query = submittedQuery,
    searchStatus = 'frontend_error',
    supportSearchId = analyticsSearchIdRef.current,
  } = {}) {
    const safeError = {
      errorType: error?.name || 'Error',
      errorMessage: error instanceof Error ? error.message : String(error || 'Unknown error'),
    }

    return {
      amazonDomain,
      apiBaseHost: '',
      backendHealth: null,
      connectivity: null,
      durationMs,
      fallbackUsed,
      query,
      reportedFilterType: '',
      retryCount,
      searchId: supportSearchId,
      searchStatus,
      time: new Date().toISOString(),
      ...safeError,
    }
  }

  function setFailureFromError(options = {}) {
    const nextDiagnostics = createFailureDiagnostics(options)

    setFailureDiagnostics(nextDiagnostics)

    const { searchId, query, amazonDomain, errorType, errorMessage, searchStatus } = nextDiagnostics
    recordDiagnostic('frontend_error', {
      amazonDomain,
      errorMessage,
      errorType,
      finalStatus: searchStatus,
      query,
      status: 'failed',
    }, { searchId, sessionId: analyticsSessionIdRef.current })

    void runSearchFailureDiagnostics({
      amazonDomain,
      error: options.error,
      query,
      retryCount,
      searchId,
      sessionId: analyticsSessionIdRef.current,
    }).then((diagnostics) => {
      setFailureDiagnostics((current) => {
        if (!current || current.searchId !== searchId) {
          return current
        }

        const backendReachable = diagnostics.backendHealth?.ok === true
        const connectivityOk = diagnostics.connectivity?.ok === true
        const searchStatusWithNetwork =
          !backendReachable && !connectivityOk
            ? 'network_blocked_possible'
            : current.searchStatus

        return {
          ...current,
          ...diagnostics,
          searchStatus: searchStatusWithNetwork,
        }
      })
    })
  }

  async function copyFailureDebugInfo() {
    if (!failureDiagnostics) {
      return false
    }

    const text = buildSearchDebugInfoText(failureDiagnostics)

    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  function updateReportedFilterType(nextValue) {
    setFailureDiagnostics((current) => {
      if (!current) {
        return current
      }

      const reportedFilterType = String(nextValue || '').trim()
      recordDiagnostic('connectivity_diagnostic_success', {
        amazonDomain: current.amazonDomain,
        query: current.query,
        reportedFilterType,
        status: 'filter_reported',
      }, { searchId: current.searchId, sessionId: analyticsSessionIdRef.current })

      return {
        ...current,
        reportedFilterType,
      }
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
    recordSearchDebugEvent('finalize', 'session-expired', {
      activeSearchId: activeSearchIdRef.current,
      amazonDomain: submittedAmazonDomain,
      errorMessage: message,
      hasDiscoveryToken: Boolean(discoveryToken),
      sessionExpired: true,
    })
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
    setFailureFromError({
      amazonDomain: submittedAmazonDomain,
      error: new Error(message),
      query: submittedQuery,
      searchStatus: 'frontend_error',
      supportSearchId: analyticsSearchIdRef.current,
    })
    setErrorMessage(message)
  }

  function startEnrichmentStream({ token, query, searchId, amazonDomain }) {
    if (window.__FOCAMAI_DISABLE_ENRICHMENT_POLLING__) return
    stopEnrichmentPolling()
    enrichmentPollRef.current.searchId = searchId
    shouldContinueDetailHydrationRef.current = false
    const startedAt = performance.now()
    recordSearchDebugEvent('enrichment', 'started', {
      activeSearchId: searchId,
      amazonDomain,
      query,
      token,
    })

    function schedulePoll({ recordFallback = false } = {}) {
      if (recordFallback) {
        recordSearchDebugEvent('enrichment', 'fallback', {
          activeSearchId: searchId,
          amazonDomain,
          query,
          token,
        })
      }

      enrichmentPollRef.current.timerId = window.setTimeout(async () => {
        if (enrichmentPollRef.current.searchId !== searchId) {
          return
        }

        if (performance.now() - startedAt > ENRICHMENT_POLL_TIMEOUT_MS) {
          recordSearchDebugEvent('enrichment', 'timed-out', {
            activeSearchId: searchId,
            amazonDomain,
            query,
            token,
          })
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
            const hasDeepDiveEligibility = Array.isArray(payload.deepDiveEligibility?.decisions)
            if (hasDeepDiveEligibility) {
              setResults((current) => mergeDeepDiveEligibilityIntoResults(current, payload.deepDiveEligibility))
            }
            recordSearchDebugEvent('enrichment', 'success', {
              activeSearchId: searchId,
              amazonDomain,
              query,
              token,
              resultCount: Array.isArray(payload.entries) ? payload.entries.length : 0,
            })
            setIsEnrichmentSettled(true)

            if (shouldContinueDetailHydrationRef.current || !hasDeepDiveEligibility) {
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
      }, resolvePollInterval('__FOCAMAI_ENRICHMENT_POLL_INTERVAL_MS__', ENRICHMENT_POLL_INTERVAL_MS))
    }

    if (typeof EventSource !== 'function') {
      schedulePoll({ recordFallback: true })
      return
    }

    const searchParams = new URLSearchParams({ token, query })
    appendAmazonDomain(searchParams, amazonDomain)
    const source = new EventSource(`${BACKEND_URL}/api/search/enrichment-stream?${searchParams.toString()}`)
    enrichmentPollRef.current.source = source
    let hasFallenBackToPolling = false

    source.onmessage = (event) => {
      if (enrichmentPollRef.current.searchId !== searchId) {
        recordSearchDebugEvent('enrichment', 'stale', {
          activeSearchId: searchId,
          amazonDomain,
          query,
          stale: true,
          token,
        })
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
          const hasDeepDiveEligibility = Array.isArray(payload.deepDiveEligibility?.decisions)
          if (hasDeepDiveEligibility) {
            setResults((current) => mergeDeepDiveEligibilityIntoResults(current, payload.deepDiveEligibility))
          }
          recordSearchDebugEvent('enrichment', 'success', {
            activeSearchId: searchId,
            amazonDomain,
            query,
            token,
            resultCount: Array.isArray(payload.entries) ? payload.entries.length : 0,
          })
          setIsEnrichmentSettled(true)

          if (shouldContinueDetailHydrationRef.current || !hasDeepDiveEligibility) {
            if (enrichmentPollRef.current.source) {
              enrichmentPollRef.current.source.close()
              enrichmentPollRef.current.source = null
            }
            schedulePoll({ recordFallback: true })
            return
          }

          stopEnrichmentPolling()
        }
      } catch (error) {
        recordSearchDebugEvent('enrichment', 'parse-error', {
          activeSearchId: searchId,
          amazonDomain,
          error,
          query,
          token,
        })
        stopEnrichmentPolling()
        setIsEnrichmentSettled(true)
      }
    }

    source.onerror = () => {
      if (hasFallenBackToPolling || enrichmentPollRef.current.searchId !== searchId) {
        if (enrichmentPollRef.current.searchId !== searchId) {
          recordSearchDebugEvent('enrichment', 'stale', {
            activeSearchId: searchId,
            amazonDomain,
            query,
            stale: true,
            token,
          })
        }
        return
      }

      hasFallenBackToPolling = true

      if (enrichmentPollRef.current.source) {
        enrichmentPollRef.current.source.close()
        enrichmentPollRef.current.source = null
      }

      schedulePoll({ recordFallback: true })
    }
  }

  function startQueryQualityPolling({ token, query, searchId, amazonDomain }) {
    if (window.__FOCAMAI_DISABLE_QUERY_QUALITY_POLLING__) return
    stopQueryQualityPolling({ clearSuggestion: true })

    if (!token || !query) {
      return
    }

    const startedAt = performance.now()
    recordSearchDebugEvent('query-quality', 'started', {
      activeSearchId: searchId,
      amazonDomain,
      query,
      token,
    })
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
        recordSearchDebugEvent('query-quality', 'stale', {
          activeSearchId: searchId,
          amazonDomain,
          query,
          stale: true,
          token,
        })
        return
      }

      if (performance.now() - startedAt > QUERY_QUALITY_POLL_TIMEOUT_MS) {
        recordSearchDebugEvent('query-quality', 'timed-out', {
          activeSearchId: searchId,
          amazonDomain,
          query,
          token,
        })
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
          recordSearchDebugEvent('query-quality', 'stale', {
            activeSearchId: searchId,
            amazonDomain,
            query,
            stale: true,
            token,
          })
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
            recordSearchDebugEvent('query-quality', 'suggested', {
              activeSearchId: searchId,
              amazonDomain,
              query,
              token,
            })
          } else {
            recordSearchDebugEvent('query-quality', 'quiet', {
              activeSearchId: searchId,
              amazonDomain,
              query,
              token,
            })
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
          resolvePollInterval(
            '__FOCAMAI_QUERY_QUALITY_POLL_INTERVAL_MS__',
            QUERY_QUALITY_POLL_INTERVAL_MS,
          ),
        )
      }
    }

    void poll()
  }

  function applyFinalizePayload(payload, variables) {
    if ((variables?.searchId || 0) !== activeSearchIdRef.current) {
      recordSearchDebugEvent('finalize', 'stale', {
        activeSearchId: variables?.searchId,
        amazonDomain: variables?.amazonDomain,
        query: variables?.query,
        resultCount: Array.isArray(payload?.results) ? payload.results.length : 0,
        stale: true,
        token: variables?.discoveryToken,
      })
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
    if (finalizedResults.length > 0) {
      void historyStore.save({
        amazonDomain: variables.amazonDomain || submittedAmazonDomain,
        followUp: variables.followUpNotes || '',
        query: variables.query,
        results: finalizedResults,
      }).catch(() => {})
    }
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
    recordSearchDebugEvent('finalize', 'success', {
      activeSearchId: variables?.searchId,
      amazonDomain: variables.amazonDomain,
      query: variables.query,
      resultCount: finalizedResults.length,
      token: variables.discoveryToken,
    })

    const resultSet = variables.retryCount > 0 ? 'retry' : 'final'

    trackSearchRun({
      productQuery: variables.query,
      details: variables.followUpNotes || '',
      enteredAiRefinement: Boolean(variables.followUpNotes),
      usedShowProductsNow: showPreviewResults,
      completedFinalize: true,
      retryRound: payload.retryCount ?? variables.retryCount ?? 0,
      bestResultKey: finalizedResults[0]?.id ? String(finalizedResults[0].id) : '',
    })
    trackSearchEvent('final_results_shown', {
      resultCount: finalizedResults.length,
      resultSet,
      retryRound: payload.retryCount ?? variables.retryCount ?? 0,
      requestMode: variables.requestMode || FINALIZE_REQUEST_MODE_DEFAULT,
      usedPrewarm: Boolean(
        payload.selection?.reusedCandidateAwarePrior || payload.selection?.reusedPreRankArtifact,
      ),
      usedIntentMatchRerank: Boolean(payload.selection?.usedIntentMatchRerank),
      flowPath: payload.selection?.flowPath || '',
    })

    trackResultImpressions({
      resultSet,
      items: buildResultAnalyticsItems(finalizedResults),
    })
  }

  function handleFinalizeError(error, variables) {
    if ((variables?.searchId || 0) !== activeSearchIdRef.current) {
      recordSearchDebugEvent('finalize', 'stale', {
        activeSearchId: variables?.searchId,
        amazonDomain: variables?.amazonDomain,
        error,
        query: variables?.query,
        stale: true,
        token: variables?.discoveryToken,
      })
      return
    }

    if (error?.name === 'AbortError') {
      recordSearchDebugEvent('finalize', 'aborted', {
        aborted: true,
        activeSearchId: variables?.searchId,
        amazonDomain: variables?.amazonDomain,
        error,
        query: variables?.query,
        token: variables?.discoveryToken,
      })
      return
    }

    const message = error instanceof Error ? error.message : 'Unable to finalize the search.'

    if (/session expired|start a new search/i.test(message)) {
      expireSearchSession(message)
      return
    }

    recordSearchDebugEvent('finalize', 'fail', {
      activeSearchId: variables?.searchId,
      amazonDomain: variables?.amazonDomain,
      error,
      query: variables?.query,
      token: variables?.discoveryToken,
    })
    setFailureFromError({
      amazonDomain: variables?.amazonDomain,
      error,
      query: variables?.query,
      searchStatus: 'frontend_error',
      supportSearchId: analyticsSearchIdRef.current,
    })
    setErrorMessage(message)
  }

  function startFinalizeMutation(variables) {
    cancelFinalizeRequest()
    const abortController = new AbortController()
    finalizeAbortControllerRef.current = abortController
    recordSearchDebugEvent('finalize', 'started', {
      activeSearchId: activeSearchIdRef.current,
      amazonDomain: variables.amazonDomain,
      candidateCount: Array.isArray(variables.originalCandidatePool?.candidates)
        ? variables.originalCandidatePool.candidates.length
        : 0,
      query: variables.query,
      token: variables.discoveryToken,
    })
    finalizeMutation.mutate({
      ...variables,
      searchId: activeSearchIdRef.current,
      supportSearchId: analyticsSearchIdRef.current,
      sessionId: analyticsSessionIdRef.current,
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
        retryFeedback.trim() !== snapshot.visibleFeedback ||
        finalResultsKey !== snapshot.resultsKey
      ) {
        recordSearchDebugEvent('retry-advice', 'stale', {
          activeSearchId: snapshot?.searchId,
          amazonDomain: submittedAmazonDomain,
          query: snapshot?.query,
          resultCount: results.length,
          stale: true,
        })
        return
      }

      const safeSuggestedQuery = String(payload.suggestedQuery || '').trim()
      setRetryAdvice(payload.recommendation === 'none' ? null : payload)
      setSuggestedRetryQuery(safeSuggestedQuery)
      recordSearchDebugEvent('retry-advice', 'success', {
        activeSearchId: snapshot.searchId,
        amazonDomain: submittedAmazonDomain,
        query: snapshot.query,
        resultCount: results.length,
      })
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
        retryFeedback.trim() !== snapshot.visibleFeedback ||
        finalResultsKey !== snapshot.resultsKey
      ) {
        recordSearchDebugEvent('retry-advice', 'stale', {
          activeSearchId: snapshot?.searchId,
          amazonDomain: submittedAmazonDomain,
          error,
          query: snapshot?.query,
          resultCount: results.length,
          stale: true,
        })
        return
      }

      recordSearchDebugEvent('retry-advice', 'fail', {
        activeSearchId: snapshot.searchId,
        amazonDomain: submittedAmazonDomain,
        error,
        query: snapshot.query,
        resultCount: results.length,
      })
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

  useEffect(() => {
    if (!discoveryToken || !submittedQuery) {
      return
    }

    const baseSnapshot = {
      amazonDomain: submittedAmazonDomain,
      candidatePool,
      discoveryToken,
      productQuery,
      refinementPrompt,
      submittedQuery,
    }

    if (results.length > 0) {
      saveFlowSnapshot({ ...baseSnapshot, results, phase: 'results' })
      return
    }

    if (refinementPrompt) {
      saveFlowSnapshot({ ...baseSnapshot, phase: 'refine' })
    }
  }, [candidatePool, discoveryToken, productQuery, refinementPrompt, results, submittedAmazonDomain, submittedQuery])

  useEffect(() => {
    const snapshot = readFlowSnapshot()

    if (!snapshot) {
      return
    }

    setHasStartedSearch(true)
    setSubmittedQuery(snapshot.submittedQuery)
    setSubmittedAmazonDomain(snapshot.amazonDomain || '')
    setProductQuery(snapshot.productQuery || snapshot.submittedQuery || '')
    setDiscoveryToken(snapshot.discoveryToken)
    setCandidatePool(snapshot.candidatePool || null)

    if (snapshot.refinementPrompt) {
      setRefinementPrompt(snapshot.refinementPrompt)
    }

    if (snapshot.phase === 'results' && Array.isArray(snapshot.results) && snapshot.results.length > 0) {
      setResults(snapshot.results)
      setIsEnrichmentSettled(snapshot.results.some((item) => Boolean(item?.fit_reason || item?.fitReason)))
    }

    analyticsSearchIdRef.current = createAnalyticsSearchId()
    analyticsSessionIdRef.current = getOrCreateAnalyticsSessionId()
    setAnalyticsSearchId(analyticsSearchIdRef.current)
    setAnalyticsSessionId(analyticsSessionIdRef.current)
  }, [])

  const isFinalizing = finalizeMutation.isPending || isRefreshingConstraintDiscovery
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
    nextSubmittedQuery = '',
    nextSubmittedAmazonDomain = '',
    {
      clearAnalyticsForIdle = false,
      hasStartedSearchValue = true,
      preserveFollowUpNotes = false,
      resetLoadingState = false,
      resetMutationState = false,
      resetProductQuery = false,
    } = {},
  ) {
    cancelDiscoveryRequest()
    stopEnrichmentPolling()
    stopQueryQualityPolling({ clearSuggestion: true })
    cancelFinalizeRequest()
    cancelRefinementRequest()
    invalidateRetryAdviceRequests()
    constraintRefreshSearchIdRef.current = 0
    constraintRefreshResultRef.current = null
    previewDetailsRequestRef.current.clear()
    clearFlowSnapshot()

    if (resetMutationState) {
      finalizeMutation.reset()
      retryAdviceMutation.reset()
    }

    if (resetProductQuery) {
      setProductQuery('')
    }

    setHasStartedSearch(hasStartedSearchValue)
    setSubmittedQuery(nextSubmittedQuery)
    setSubmittedAmazonDomain(nextSubmittedAmazonDomain)
    setSelectedProductState(null)
    setErrorMessage('')
    setFailureDiagnostics(null)
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

    if (resetLoadingState) {
      setIsDiscovering(false)
      setIsGeneratingPrompt(false)
      setIsRefreshingConstraintDiscovery(false)
    }

    if (clearAnalyticsForIdle) {
      analyticsSearchIdRef.current = ''
      // Keep the session ref warm for async-safe reuse; only the exposed idle state is cleared.
      setAnalyticsSearchId('')
      setAnalyticsSessionId('')
    }

    hasTrackedRefinementViewRef.current = false
    hasTrackedPreviewImpressionsRef.current = false
  }

  function resetToNewSearch() {
    activeSearchIdRef.current += 1
    resetGuidedState('', '', {
      clearAnalyticsForIdle: true,
      hasStartedSearchValue: false,
      resetLoadingState: true,
      resetMutationState: true,
      resetProductQuery: true,
    })
  }

  function startGuidedSearch(
    normalizedQuery,
    {
      preserveFollowUpNotes = false,
      reuseAnalytics = false,
      cacheMode = 'default',
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
    recordSearchDebugEvent('startGuidedSearch', 'started', {
      activeSearchId: nextSearchId,
      amazonDomain: nextAmazonDomain,
      cacheMode,
      query: normalizedQuery,
    })
    recordDiagnostic('frontend_search_started', {
      amazonDomain: nextAmazonDomain,
      query: normalizedQuery,
      status: 'started',
    }, { searchId: analyticsSearchId, sessionId: analyticsSessionId })

    trackSearchRun({
      productQuery: normalizedQuery,
      details: preserveFollowUpNotes ? followUpNotes : '',
      enteredAiRefinement: preserveFollowUpNotes ? Boolean(followUpNotes.trim()) : false,
      usedShowProductsNow: false,
      completedFinalize: false,
      retryRound: 0,
    }, { searchId: analyticsSearchId, sessionId: analyticsSessionId })
    trackSearchEvent(searchEventName, {
      query: normalizedQuery,
      amazonDomain: nextAmazonDomain,
    }, { searchId: analyticsSearchId, sessionId: analyticsSessionId })

    cancelDiscoveryRequest()
    const discoveryAbortController = new AbortController()
    discoveryAbortControllerRef.current = discoveryAbortController
    recordDiagnostic('backend_request_started', {
      amazonDomain: nextAmazonDomain,
      query: normalizedQuery,
      status: 'started',
    }, { searchId: analyticsSearchId, sessionId: analyticsSessionId })

    fetchDiscoveryResults(normalizedQuery, nextAmazonDomain, discoveryAbortController.signal, {
      cacheMode,
      searchId: analyticsSearchId,
      sessionId: analyticsSessionId,
    })
      .then((payload) => {
        if (activeSearchIdRef.current !== nextSearchId) {
          recordSearchDebugEvent('discovery', 'stale', {
            activeSearchId: nextSearchId,
            amazonDomain: nextAmazonDomain,
            candidateCount: Array.isArray(payload?.candidatePool?.candidates)
              ? payload.candidatePool.candidates.length
              : 0,
            previewCount: Array.isArray(payload?.previewResults) ? payload.previewResults.length : 0,
            query: normalizedQuery,
            stale: true,
            token: payload?.discoveryToken,
          })
          return
        }

        if (!payload.discoveryToken) {
          recordSearchDebugEvent('discovery', 'missing-token', {
            activeSearchId: nextSearchId,
            amazonDomain: nextAmazonDomain,
            candidateCount: Array.isArray(payload.candidatePool?.candidates)
              ? payload.candidatePool.candidates.length
              : 0,
            previewCount: Array.isArray(payload.previewResults) ? payload.previewResults.length : 0,
            query: normalizedQuery,
            token: payload.discoveryToken,
          })
          setCandidatePool(null)
          setPreviewResults([])
          setFailureFromError({
            amazonDomain: nextAmazonDomain,
            error: new Error(createExpiredSessionMessage()),
            query: normalizedQuery,
            searchStatus: 'frontend_error',
            supportSearchId: analyticsSearchId,
          })
          setErrorMessage(createExpiredSessionMessage())
          return
        }

        const responseAmazonDomain = payload.amazonDomain || nextAmazonDomain
        recordDiagnostic('frontend_response_received', {
          amazonDomain: responseAmazonDomain,
          cachedOrFallbackUsed: payload.source === 'cache' || Boolean(payload.fallbackFrom),
          durationMs: payload.timing?.client?.totalMs,
          query: normalizedQuery,
          resultCountAfterInternalFilters: Array.isArray(payload.previewResults) ? payload.previewResults.length : 0,
          status: 'success',
        }, { searchId: analyticsSearchId, sessionId: analyticsSessionId })
        recordSearchDebugEvent('discovery', 'success', {
          activeSearchId: nextSearchId,
          amazonDomain: responseAmazonDomain,
          candidateCount: Array.isArray(payload.candidatePool?.candidates)
            ? payload.candidatePool.candidates.length
            : 0,
          previewCount: Array.isArray(payload.previewResults) ? payload.previewResults.length : 0,
          query: normalizedQuery,
          token: payload.discoveryToken,
        })

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

        trackSearchEvent('discovery_loaded', {
          candidateCount: Array.isArray(payload.candidatePool?.candidates)
            ? payload.candidatePool.candidates.length
            : 0,
          previewCount: Array.isArray(payload.previewResults) ? payload.previewResults.length : 0,
          source: payload.source || 'live',
        }, { searchId: analyticsSearchId, sessionId: analyticsSessionId })
        recordDiagnostic('frontend_display_success', {
          amazonDomain: responseAmazonDomain,
          cachedOrFallbackUsed: payload.source === 'cache' || Boolean(payload.fallbackFrom),
          finalStatus: 'success',
          query: normalizedQuery,
          resultCountAfterInternalFilters: Array.isArray(payload.previewResults) ? payload.previewResults.length : 0,
          status: 'success',
        }, { searchId: analyticsSearchId, sessionId: analyticsSessionId })
      })
      .catch((error) => {
        if (activeSearchIdRef.current !== nextSearchId) {
          recordSearchDebugEvent('discovery', 'stale', {
            activeSearchId: nextSearchId,
            amazonDomain: nextAmazonDomain,
            error,
            query: normalizedQuery,
            stale: true,
          })
          return
        }

        if (error?.name === 'AbortError') {
          recordSearchDebugEvent('discovery', 'aborted', {
            aborted: true,
            activeSearchId: nextSearchId,
            amazonDomain: nextAmazonDomain,
            error,
            query: normalizedQuery,
          })
          return
        }

        recordSearchDebugEvent('discovery', 'fail', {
          activeSearchId: nextSearchId,
          amazonDomain: nextAmazonDomain,
          error,
          query: normalizedQuery,
        })
        setFailureFromError({
          amazonDomain: nextAmazonDomain,
          error,
          query: normalizedQuery,
          searchStatus: 'frontend_error',
          supportSearchId: analyticsSearchId,
        })
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
          recordSearchDebugEvent('refinement', 'stale', {
            activeSearchId: nextSearchId,
            amazonDomain: nextAmazonDomain,
            query: normalizedQuery,
            stale: true,
          })
          return
        }

        recordSearchDebugEvent('refinement', 'success', {
          activeSearchId: nextSearchId,
          amazonDomain: nextAmazonDomain,
          query: normalizedQuery,
        })
        setRefinementPrompt(payload)
        setRequestTiming((current) => ({
          ...current,
          refine: payload.timing || null,
        }))

        if (!hasTrackedRefinementViewRef.current) {
          hasTrackedRefinementViewRef.current = true
          trackSearchEvent('refine_viewed', {
            usedFallback: false,
          }, { searchId: analyticsSearchId, sessionId: analyticsSessionId })
        }
      })
      .catch((error) => {
        if (activeSearchIdRef.current !== nextSearchId) {
          recordSearchDebugEvent('refinement', 'stale', {
            activeSearchId: nextSearchId,
            amazonDomain: nextAmazonDomain,
            error,
            query: normalizedQuery,
            stale: true,
          })
          return
        }

        if (error?.name === 'AbortError') {
          recordSearchDebugEvent('refinement', 'aborted', {
            aborted: true,
            activeSearchId: nextSearchId,
            amazonDomain: nextAmazonDomain,
            error,
            query: normalizedQuery,
          })
          return
        }

        recordSearchDebugEvent('refinement', 'fallback', {
          activeSearchId: nextSearchId,
          amazonDomain: nextAmazonDomain,
          error,
          query: normalizedQuery,
        })
        setRefinementPrompt(createFallbackRefinementPrompt(normalizedQuery))

        if (!hasTrackedRefinementViewRef.current) {
          hasTrackedRefinementViewRef.current = true
          trackSearchEvent('refine_viewed', {
            usedFallback: true,
          }, { searchId: analyticsSearchId, sessionId: analyticsSessionId })
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

  function retryFailedSearch() {
    const normalizedQuery = submittedQuery.trim()

    if (!normalizedQuery) {
      resetToNewSearch()
      return
    }

    recordDiagnostic('frontend_retry_requested', {
      amazonDomain: submittedAmazonDomain,
      query: normalizedQuery,
      status: 'retrying',
    })
    startGuidedSearch(normalizedQuery, {
      cacheMode: 'refresh',
      preserveFollowUpNotes: true,
      searchEventName: 'failure_retry_started',
    })
  }

  async function refreshDiscoveryForHardConstraints({
    amazonDomain,
    constraintMatch,
    originalCandidatePool,
    searchId,
    submittedQuery: nextSubmittedQuery,
  }) {
    const combined = `${nextSubmittedQuery} ${constraintMatch.matchedTerm}`.replace(/\s+/g, ' ').trim()
    const constraintRefreshQuery = combined.length <= MAX_PRODUCT_QUERY_LENGTH ? combined : constraintMatch.matchedTerm

    constraintRefreshSearchIdRef.current = searchId
    setIsRefreshingConstraintDiscovery(true)
    setErrorMessage('')
    recordSearchDebugEvent('constraint-refresh', 'started', {
      activeSearchId: searchId,
      amazonDomain,
      constraintCategory: constraintMatch.category,
      matchedTerm: constraintMatch.matchedTerm,
      query: constraintRefreshQuery,
    })

    try {
      const payload = await fetchDiscoveryResults(
        constraintRefreshQuery,
        amazonDomain,
        undefined,
        {
          cacheMode: 'refresh',
          searchId: analyticsSearchIdRef.current,
          sessionId: analyticsSessionIdRef.current,
        },
      )

      if (activeSearchIdRef.current !== searchId) {
        recordSearchDebugEvent('constraint-refresh', 'stale', {
          activeSearchId: searchId,
          amazonDomain,
          constraintCategory: constraintMatch.category,
          matchedTerm: constraintMatch.matchedTerm,
          query: constraintRefreshQuery,
          stale: true,
          token: payload?.discoveryToken,
        })
        return null
      }

      if (!payload.discoveryToken) {
        throw new Error(createExpiredSessionMessage())
      }

      const refreshedAmazonDomain = payload.amazonDomain || amazonDomain
      const refreshedCandidatePool = payload.candidatePool || originalCandidatePool
      const refreshedDiscovery = {
        amazonDomain: refreshedAmazonDomain,
        candidatePool: refreshedCandidatePool,
        discoveryToken: payload.discoveryToken,
        query: constraintRefreshQuery,
        searchId,
      }

      setDiscoveryToken(payload.discoveryToken || '')
      setSubmittedAmazonDomain(refreshedAmazonDomain)
      setCandidatePool(refreshedCandidatePool || null)
      setPreviewResults(payload.previewResults || [])
      stopQueryQualityPolling({ clearSuggestion: true })
      setRequestTiming((current) => ({
        ...current,
        discover: payload.timing || current.discover,
      }))

      recordSearchDebugEvent('constraint-refresh', 'success', {
        activeSearchId: searchId,
        amazonDomain: refreshedAmazonDomain,
        candidateCount: Array.isArray(refreshedCandidatePool?.candidates)
          ? refreshedCandidatePool.candidates.length
          : 0,
        constraintCategory: constraintMatch.category,
        matchedTerm: constraintMatch.matchedTerm,
        previewCount: Array.isArray(payload.previewResults) ? payload.previewResults.length : 0,
        query: constraintRefreshQuery,
        token: payload.discoveryToken,
      })
      constraintRefreshResultRef.current = refreshedDiscovery

      return refreshedDiscovery
    } catch (error) {
      if (activeSearchIdRef.current !== searchId) {
        recordSearchDebugEvent('constraint-refresh', 'stale', {
          activeSearchId: searchId,
          amazonDomain,
          constraintCategory: constraintMatch.category,
          error,
          matchedTerm: constraintMatch.matchedTerm,
          query: constraintRefreshQuery,
          stale: true,
        })
        return null
      }

      recordSearchDebugEvent('constraint-refresh', 'fail', {
        activeSearchId: searchId,
        amazonDomain,
        constraintCategory: constraintMatch.category,
        error,
        matchedTerm: constraintMatch.matchedTerm,
        query: constraintRefreshQuery,
      })
      setFailureFromError({
        amazonDomain,
        error,
        query: constraintRefreshQuery,
        searchStatus: 'frontend_error',
        supportSearchId: analyticsSearchIdRef.current,
      })
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh the search with your constraints.')
      return null
    } finally {
      if (activeSearchIdRef.current === searchId) {
        setIsRefreshingConstraintDiscovery(false)
      }
    }
  }

  async function handleFinalizeRefinement() {
    if (!candidatePool || !submittedQuery) {
      return
    }

    if (isFinalizing) {
      return
    }

    if (!discoveryToken) {
      expireSearchSession()
      return
    }

    const normalizedFollowUpNotes = followUpNotes.trim()

    if (analyticsSearchIdRef.current && analyticsSessionIdRef.current) {
      trackSearchRun({
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
      let finalizeQuery = submittedQuery
      let finalizeAmazonDomain = submittedAmazonDomain
      let finalizeDiscoveryToken = discoveryToken
      let finalizeCandidatePool = candidatePool
      const constraintMatch = detectHardConstraint(normalizedFollowUpNotes)

      if (
        constraintMatch.shouldRefresh &&
        constraintRefreshSearchIdRef.current !== activeSearchIdRef.current
      ) {
        const refreshedDiscovery = await refreshDiscoveryForHardConstraints({
          amazonDomain: submittedAmazonDomain,
          constraintMatch,
          followUpNotes: normalizedFollowUpNotes,
          originalCandidatePool: candidatePool,
          searchId: activeSearchIdRef.current,
          submittedQuery,
        })

        if (!refreshedDiscovery) {
          return
        }

        finalizeQuery = refreshedDiscovery.query
        finalizeAmazonDomain = refreshedDiscovery.amazonDomain
        finalizeDiscoveryToken = refreshedDiscovery.discoveryToken
        finalizeCandidatePool = refreshedDiscovery.candidatePool
      } else if (constraintMatch.shouldRefresh) {
        const refreshedDiscovery = constraintRefreshResultRef.current

        if (refreshedDiscovery?.searchId === activeSearchIdRef.current) {
          finalizeQuery = refreshedDiscovery.query
          finalizeAmazonDomain = refreshedDiscovery.amazonDomain
          finalizeDiscoveryToken = refreshedDiscovery.discoveryToken
          finalizeCandidatePool = refreshedDiscovery.candidatePool
        }
      }

      const nextFinalizeRequest = {
        query: finalizeQuery,
        amazonDomain: finalizeAmazonDomain,
        discoveryToken: finalizeDiscoveryToken,
        originalCandidatePool: finalizeCandidatePool,
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

    trackSearchRun({
      productQuery: submittedQuery,
      details: followUpNotes,
      enteredAiRefinement: false,
      usedShowProductsNow: true,
      completedFinalize: false,
      retryRound: 0,
    })
    trackSearchEvent('show_products_now_clicked', {
      previewCount: previewResults.length,
    })

    if (!hasTrackedPreviewImpressionsRef.current) {
      hasTrackedPreviewImpressionsRef.current = true
      trackResultImpressions({
        resultSet: 'preview',
        items: buildResultAnalyticsItems(previewResults),
      })
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

  function handleRetryAdviceRequest({ rejectionFeedback } = {}) {
    const normalizedVisibleFeedback = retryFeedback.trim()
    const normalizedFeedback = String(rejectionFeedback ?? normalizedVisibleFeedback).trim()

    if (!submittedQuery || !normalizedFeedback || !hasFinalResults || retryAdviceMutation.isPending) {
      return
    }

    const requestId = retryAdviceRequestIdRef.current + 1
    retryAdviceRequestIdRef.current = requestId

    recordSearchDebugEvent('retry-advice', 'started', {
      activeSearchId: activeSearchIdRef.current,
      amazonDomain: submittedAmazonDomain,
      query: submittedQuery,
      resultCount: results.length,
    })
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
        visibleFeedback: normalizedVisibleFeedback,
        resultsKey: finalResultsKey,
      },
    })
  }

  function handleTryRetrySuggestion(query) {
    const nextQuery = String(query || suggestedRetryQuery || '').trim()

    if (!nextQuery) {
      return false
    }

    const { error, isValid, normalizedQuery } = validateSearchInput(nextQuery, '')

    if (!isValid) {
      setErrorMessage(error)
      return false
    }

    trackSearchEvent('retry_advice_accepted', {
      suggestedQueryLength: normalizedQuery.length,
    })
    setProductQuery(normalizedQuery)
    startGuidedSearch(normalizedQuery, {
      cacheMode: 'refresh',
      searchEventName: 'retry_advice_search_started',
    })
    return true
  }

  function updateRetryFeedback(nextValue) {
    invalidateRetryAdviceRequests()
    setRetryFeedback(nextValue)
    setRetryAdvice(null)
    setSuggestedRetryQuery('')
  }

  async function hydratePreviewProductDetails(item) {
    const productId = String(item?.id || '').trim()

    if (
      !productId ||
      previewDetailsRequestRef.current.has(productId) ||
      (Array.isArray(item?.feature_bullets) && item.feature_bullets.length > 0) ||
      String(item?.productDescription || '').trim()
    ) {
      return
    }

    previewDetailsRequestRef.current.add(productId)
    recordSearchDebugEvent('product-details', 'started', {
      activeSearchId: activeSearchIdRef.current,
      amazonDomain: submittedAmazonDomain,
      productId,
      query: submittedQuery,
    })

    try {
      const payload = await fetchProductDetails({
        asin: productId,
        amazonDomain: submittedAmazonDomain,
      })

      if (!payload.ready) {
        recordSearchDebugEvent('product-details', 'empty', {
          activeSearchId: activeSearchIdRef.current,
          amazonDomain: submittedAmazonDomain,
          productId,
          query: submittedQuery,
        })
        return
      }

      setPreviewResults((current) => mergeProductDetailsIntoResults(current, productId, payload))
      recordSearchDebugEvent('product-details', 'success', {
        activeSearchId: activeSearchIdRef.current,
        amazonDomain: submittedAmazonDomain,
        productId,
        query: submittedQuery,
      })
    } catch (error) {
      recordSearchDebugEvent('product-details', 'failed', {
        activeSearchId: activeSearchIdRef.current,
        amazonDomain: submittedAmazonDomain,
        error,
        productId,
        query: submittedQuery,
      })
    } finally {
      previewDetailsRequestRef.current.delete(productId)
    }
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

    trackResultClick({
      resultSet,
      resultKey: String(item.id),
      position,
      provider: item.subtitle || '',
      badgeType: item.badgeLabel || '',
      isBestPick: position === 0 || item.badgeLabel === 'Best match',
      clickTarget: 'card',
      retailerUrl: item.link || '',
    })

    if (resultSet === 'preview') {
      void hydratePreviewProductDetails(item)
    }
  }

  function handleRetailerClick(item, { position = 0, resultSet = 'final' } = {}) {
    trackResultClick({
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
    actions: {
      beginGuidedSearch,
      finalizeRefinement: handleFinalizeRefinement,
      resetToNewSearch,
      retryFailedSearch,
      selectProduct: handleSelectProduct,
      showProductsNow: handleShowProductsNow,
      trackRetailerClick: handleRetailerClick,
    },
    analytics: {
      searchId: analyticsSearchId,
      sessionId: analyticsSessionId,
    },
    marketplace: {
      detectedCountryCode,
      hasAskedPreference: hasAskedMarketplacePreference,
      markPromptHandled: markMarketplacePromptHandled,
      resolvedAmazonDomain,
      selectedAmazonDomain,
      setSelectedAmazonDomain,
    },
    query: {
      followUpNotes,
      productQuery,
      refinementPrompt,
      setFollowUpNotes,
      setProductQuery,
      submittedQuery,
    },
    querySuggestion: {
      isApplying: isApplyingQuerySuggestion,
      isChecking: isCheckingQueryQuality,
      reject: handleRejectQuerySuggestion,
      suggestion: querySuggestion,
      trySuggestedSearch: handleTryQuerySuggestion,
    },
    results: {
      candidatePool,
      discoveryToken,
      displayed: displayedResults,
      hasFinalResults,
      previous: previousResults,
      selectedProduct: selectedProductForDisplay,
      selectionState,
      setSelectedProduct: setSelectedProductState,
      showFinalBadges: showFinalResultBadges,
      showPreview: showPreviewResults,
    },
    retry: {
      advice: retryAdvice,
      count: retryCount,
      feedback: retryFeedback,
      isGeneratingAdvice: retryAdviceMutation.isPending,
      requestAdvice: handleRetryAdviceRequest,
      setFeedback: updateRetryFeedback,
      setSuggestedQuery: setSuggestedRetryQuery,
      suggestedQuery: suggestedRetryQuery,
      trySuggestion: handleTryRetrySuggestion,
    },
    diagnostics: {
      copyDebugInfo: copyFailureDebugInfo,
      failure: failureDiagnostics,
      setReportedFilterType: updateReportedFilterType,
    },
    status: {
      errorMessage,
      hasStartedSearch,
      isDiscovering,
      isEnrichmentReady,
      isEnrichmentSettled,
      isFinalizing,
      isGeneratingPrompt,
      isLoading,
      requestTiming,
    },
  }
}
