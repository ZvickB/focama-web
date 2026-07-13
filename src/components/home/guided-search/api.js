import { AMAZON_MARKETPLACE_AUTO } from '@/contexts/amazonStoreConstants.js'
import {
  appendAmazonDomain,
  FINALIZE_REQUEST_MODE_DEFAULT,
  parseServerTimingHeader,
  roundTiming,
} from '@/components/home/guided-search/constants.js'
import { fetchBackend } from '@/lib/backendUrl.js'

function shouldSendDiagnosticId(value) {
  return value && value !== 'analytics-disabled'
}

export async function readJsonResponse(response, requestStartedAt) {
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

export async function fetchDiscoveryResults(query, amazonDomain = AMAZON_MARKETPLACE_AUTO, signal, options = {}) {
  const searchParams = new URLSearchParams({ query })
  appendAmazonDomain(searchParams, amazonDomain)
  if (options.cacheMode === 'refresh') {
    searchParams.set('cacheMode', 'refresh')
  }
  if (shouldSendDiagnosticId(options.searchId)) {
    searchParams.set('searchId', options.searchId)
  }
  if (shouldSendDiagnosticId(options.sessionId)) {
    searchParams.set('sessionId', options.sessionId)
  }
  if (shouldSendDiagnosticId(options.searchId)) {
    searchParams.set('platform', 'web')
  }
  const requestStartedAt = performance.now()
  const response = await fetchBackend(`/api/search/rainforest-discover?${searchParams.toString()}`, {
    signal,
  })
  return readJsonResponse(response, requestStartedAt)
}

export async function fetchRefinementPrompt(query, signal) {
  const searchParams = new URLSearchParams({ query })
  const requestStartedAt = performance.now()
  const response = await fetchBackend(`/api/search/refine?${searchParams.toString()}`, {
    signal,
  })
  return readJsonResponse(response, requestStartedAt)
}

export async function fetchRetryAdvice({
  query,
  followUpNotes,
  rejectionFeedback,
  shortlist,
}) {
  const requestStartedAt = performance.now()
  const response = await fetchBackend('/api/search/retry-advice', {
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

export async function finalizeGuidedSearch({
  query,
  amazonDomain,
  discoveryToken,
  followUpNotes,
  rejectionFeedback,
  retryCount,
  rankingPreference,
  excludedCandidateIds,
  searchId,
  supportSearchId,
  sessionId,
  requestMode = FINALIZE_REQUEST_MODE_DEFAULT,
  signal,
}) {
  const requestStartedAt = performance.now()
  const response = await fetchBackend('/api/search/finalize', {
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
      rankingPreference,
      excludedCandidateIds,
      ...(shouldSendDiagnosticId(supportSearchId || searchId) ? { searchId: supportSearchId || searchId } : {}),
      ...(shouldSendDiagnosticId(sessionId) ? { sessionId } : {}),
      requestMode,
    }),
  })

  return readJsonResponse(response, requestStartedAt)
}

export async function fetchEnrichment({ token, query, amazonDomain }) {
  const searchParams = new URLSearchParams({ token, query })
  appendAmazonDomain(searchParams, amazonDomain)
  const requestStartedAt = performance.now()
  const response = await fetchBackend(`/api/search/enrichment?${searchParams.toString()}`)
  return readJsonResponse(response, requestStartedAt)
}

export async function fetchProductDetails({ asin, amazonDomain }) {
  const searchParams = new URLSearchParams({ asin })
  appendAmazonDomain(searchParams, amazonDomain)
  const requestStartedAt = performance.now()
  const response = await fetchBackend(`/api/search/product-details?${searchParams.toString()}`)
  return readJsonResponse(response, requestStartedAt)
}

export async function fetchQueryQualitySuggestion({ token, query, amazonDomain }) {
  const searchParams = new URLSearchParams({ token, query })
  appendAmazonDomain(searchParams, amazonDomain)
  const requestStartedAt = performance.now()
  const response = await fetchBackend(`/api/search/query-quality?${searchParams.toString()}`)
  return readJsonResponse(response, requestStartedAt)
}

export async function fetchProductDeepDive({
  amazonDomain,
  candidateId,
  crossMarketFallback = false,
  discoveryToken,
  includeSynthesis = true,
  query,
  token,
}) {
  const requestStartedAt = performance.now()
  const response = await fetchBackend('/api/product/deep-dive', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      amazonDomain,
      candidateId,
      crossMarketFallback,
      discoveryToken,
      includeSynthesis,
      query,
    }),
  })

  return readJsonResponse(response, requestStartedAt)
}
