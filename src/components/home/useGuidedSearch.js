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
import { useAmazonStore } from '@/contexts/useAmazonStore.js'
import { historyStore } from '@/lib/history/historyStore.js'
import { MAX_PRODUCT_QUERY_LENGTH, validateSearchInput } from '../../../shared/search-input.js'

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

function resolvePollInterval(overrideKey, fallbackMs) {
  if (typeof window === 'undefined') return fallbackMs
  const override = window[overrideKey]
  return typeof override === 'number' && Number.isFinite(override) && override > 0
    ? override
    : fallbackMs
}

const FINALIZE_REQUEST_MODE_DEFAULT = 'guided_finalize'
const FINALIZE_REQUEST_MODE_EMPTY_NOTES = 'guided_empty_notes'
const FINALIZE_REQUEST_MODE_REFINED = 'guided_refined'

const HARD_CONSTRAINT_PATTERNS = [
  {
    category: 'jewish_kosher',
    terms: [
      'kosher',
      'kosher certified',
      'hechsher',
      'hechser',
      'pareve',
      'parve',
      'cholov yisroel',
      'chalav yisrael',
      'cholov israel',
      'pas yisroel',
      'pat yisrael',
      'bishul yisroel',
      'bishul yisrael',
      'shabbos',
      'shabbat',
      'passover',
      'pesach',
      'kitniyot',
      'kitniyos',
      'gebrochts',
      'non gebrochts',
      'mevushal',
      'havdalah',
      'havdala',
      'blech',
      'plata',
      'shabbos lamp',
      'shabbat lamp',
      'hot plate',
    ],
  },
  {
    category: 'dietary_allergy',
    terms: [
      'vegan',
      'vegetarian',
      'dairy free',
      'non dairy',
      'no dairy',
      'gluten free',
      'nut free',
      'peanut free',
      'tree nut free',
      'soy free',
      'egg free',
      'sesame free',
      'sugar free',
      'low sugar',
      'caffeine free',
      'allergy',
      'allergen',
      'safe for allergy',
    ],
  },
  {
    category: 'safety_material',
    terms: [
      'hypoallergenic',
      'fragrance free',
      'latex free',
      'bpa free',
      'phthalate free',
      'paraben free',
      'non toxic',
      'lead free',
      'pfas free',
      'food safe',
      'baby safe',
      'toddler safe',
      'sensitive skin',
    ],
  },
  {
    category: 'compatibility_exclusion',
    terms: [
      'compatible with',
      'fits',
      'replacement for',
      'works with',
      'free of',
      'voltage',
      'wattage',
    ],
  },
]


const HARD_CONSTRAINT_COMPACT_TERMS = new Set(
  HARD_CONSTRAINT_PATTERNS.flatMap(({ terms }) =>
    terms
      .filter((term) => /\s/.test(term))
      .map((term) => term.replace(/\s+/g, '')),
  ),
)

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

function normalizeConstraintText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[-/_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function detectHardConstraint(text) {
  const normalizedText = normalizeConstraintText(text)

  if (!normalizedText) {
    return {
      category: '',
      matchedTerm: '',
      shouldRefresh: false,
    }
  }

  const paddedText = ` ${normalizedText} `
  const compactText = normalizedText.replace(/\s+/g, '')

  for (const { category, terms } of HARD_CONSTRAINT_PATTERNS) {
    for (const term of terms) {
      const normalizedTerm = normalizeConstraintText(term)
      const compactTerm = normalizedTerm.replace(/\s+/g, '')

      if (
        paddedText.includes(` ${normalizedTerm} `) ||
        (HARD_CONSTRAINT_COMPACT_TERMS.has(compactTerm) && compactText.includes(compactTerm))
      ) {
        return {
          category,
          matchedTerm: normalizedTerm,
          shouldRefresh: true,
        }
      }
    }
  }

  if (/\bno\s+\w{2,40}\b/.test(normalizedText)) {
    return {
      category: 'compatibility_exclusion',
      matchedTerm: 'no',
      shouldRefresh: true,
    }
  }

  return {
    category: '',
    matchedTerm: '',
    shouldRefresh: false,
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

async function fetchDiscoveryResults(query, amazonDomain = AMAZON_MARKETPLACE_AUTO, signal, options = {}) {
  const searchParams = new URLSearchParams({ query })
  appendAmazonDomain(searchParams, amazonDomain)
  if (options.cacheMode === 'refresh') {
    searchParams.set('cacheMode', 'refresh')
  }
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

async function fetchProductDetails({ asin, amazonDomain }) {
  const searchParams = new URLSearchParams({ asin })
  appendAmazonDomain(searchParams, amazonDomain)
  const requestStartedAt = performance.now()
  const response = await fetch(`${BACKEND_URL}/api/search/product-details?${searchParams.toString()}`)
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
      isPrime: Boolean(result.isPrime || entry?.isPrime || entry?.is_prime),
      delivery: entry?.delivery || result.delivery || '',
      productDescription: entry?.productDescription || entry?.product_description || result.productDescription || '',
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

function mergeProductDetailsIntoResults(results, productId, details) {
  if (!Array.isArray(results) || !productId || !details?.ready) {
    return results
  }

  return results.map((result) => {
    if (String(result.id) !== String(productId)) {
      return result
    }

    const featureBullets = Array.isArray(details.feature_bullets)
      ? details.feature_bullets
      : Array.isArray(details.featureBullets)
        ? details.featureBullets
        : []

    return {
      ...result,
      isPrime: Boolean(result.isPrime || details.isPrime || details.is_prime),
      delivery: details.delivery || result.delivery || '',
      productDescription: details.productDescription || details.product_description || result.productDescription || '',
      feature_bullets: featureBullets.length > 0
        ? featureBullets
        : Array.isArray(result.feature_bullets)
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
      isPrime: Boolean(result.isPrime || sourceCandidate.isPrime),
      productDescription: sourceCandidate.productDescription || result.productDescription || '',
    }
  })
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
            recordSearchDebugEvent('enrichment', 'success', {
              activeSearchId: searchId,
              amazonDomain,
              query,
              token,
              resultCount: Array.isArray(payload.entries) ? payload.entries.length : 0,
            })
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
          recordSearchDebugEvent('enrichment', 'success', {
            activeSearchId: searchId,
            amazonDomain,
            query,
            token,
            resultCount: Array.isArray(payload.entries) ? payload.entries.length : 0,
          })
          setIsEnrichmentSettled(true)

          if (shouldContinueDetailHydrationRef.current) {
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
      })
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

      setRetryAdvice(payload)
      setSuggestedRetryQuery(payload.suggestedQuery || '')
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

    fetchDiscoveryResults(normalizedQuery, nextAmazonDomain, discoveryAbortController.signal, { cacheMode })
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
          setErrorMessage(createExpiredSessionMessage())
          return
        }

        const responseAmazonDomain = payload.amazonDomain || nextAmazonDomain
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
        { cacheMode: 'refresh' },
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
