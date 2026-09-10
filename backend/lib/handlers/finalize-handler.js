import { buildInternalErrorPayload, sendJson, readJsonBody } from '../http.js'
import {
  RANKING_PREFERENCES,
  isActiveRankingPreference,
  normalizeRankingPreference,
} from '../../../shared/ranking-preference.js'
import {
  DEFAULT_FINALIZE_MODEL,
  DEFAULT_SELECTOR_MODEL,
  lockWinnersAndBadges,
} from '../ai-selector.js'
import { createFinalizeFastContract, toFinalizeFastCard } from '../layered-contracts.js'
import { DEFAULT_RATE_LIMIT_CONFIG, getClientIpAddress, takeRateLimitToken } from '../rate-limit.js'
import { reportBackendError } from '../observability.js'
import {
  sanitizeStringList,
  truncateText,
} from '../text-sanitizers.js'
import { lacksKnownPositivePrice } from '../result-filter.js'
import { getEnv, validateSearchInput, validateSuggestedSearchQuery } from '../search-data.js'
import { writeSearchSnapshot } from '../search-pipeline.js'
import {
  readProductDetailsCacheEntries,
  recordSearchDiagnosticEvent,
  writeProductDetailsCacheEntries,
} from '../search-storage.js'
import { fetchAmazonProductDetailsByAsin } from '../product-details-provider.js'
import {
  resolveDiscoveryContext,
} from './discovery-handler.js'
import { resolveFinalizeRequestContext } from './finalize-context.js'
import {
  filterNonNewConditionCandidates,
  sanitizeFinalizeCandidate,
} from './finalize-candidate.js'
import { filterCandidatesByProvableConstraints } from '../provable-constraint-guard.js'
import { composePreferenceShortlist } from '../ranking-preference-policy.js'
import {
  FINALIZE_BODY_LIMIT_BYTES,
  FINALIZE_MAX_CANDIDATES,
  FINALIZE_MAX_NOTE_LENGTH,
  FINALIZE_MAX_PRIORITIES,
  FINALIZE_MAX_PRIORITY_LENGTH,
  FINALIZE_MAX_REJECTION_FEEDBACK_LENGTH,
  FINALIZE_MAX_RETRY_COUNT,
  LIVE_RESULT_FILTER_CONFIG,
  RATE_LIMIT_WAIT_MESSAGE,
  RECENT_FINALIZATIONS_MAX,
  recentFinalizations,
  getRequestedAmazonDomain,
  logSearchFlowEvent,
  nowMs,
  roundTimingDuration,
  runInBackground,
} from '../server-helpers.js'
import {
  runMiniEnrichmentAsync,
  runDeepDiveEligibilityAsync,
  mergeProductDetailsIntoCandidatePool,
} from './enrichment-handler.js'
import { hasExplicitBrandRequest, selectDistinctCandidates, summarizeBrandVariety } from '../product-identity.js'

const FINALIZE_REQUEST_MODE_DEFAULT = 'guided_finalize'

function recordFinalizeDiagnosticEvent(body = {}, event = {}) {
  const searchId = truncateText(body?.searchId, 120)

  if (!searchId) {
    return
  }

  void recordSearchDiagnosticEvent({
    searchId,
    sessionId: truncateText(body?.sessionId, 120),
    platform: 'web',
    provider: 'rainforest',
    ...event,
  })
}

export function recordRecentFinalization({ query, details, results, strategy, model, timestamp }) {
  recentFinalizations.unshift({
    query,
    details: details || '',
    picks: results.map((r, i) => ({
      rank: i + 1,
      id: r.id ?? null,
      title: r.title || '—',
      price: r.price ?? null,
      rating: r.rating ?? null,
      reviewCount: r.reviewCount ?? null,
      badge: r.badge ?? null,
    })),
    strategy: strategy || null,
    model: model || null,
    timestamp,
  })
  if (recentFinalizations.length > RECENT_FINALIZATIONS_MAX) {
    recentFinalizations.length = RECENT_FINALIZATIONS_MAX
  }
}

export function hasContextAddedFinalizeSignals({
  priorities = [],
  followUpNotes = '',
  rejectionFeedback = '',
  retryCount = 0,
  excludedCandidateIds = [],
} = {}) {
  return (
    priorities.length > 0 ||
    Boolean(followUpNotes) ||
    Boolean(rejectionFeedback) ||
    retryCount > 0 ||
    excludedCandidateIds.length > 0
  )
}

export function hasPrimeDeliveryRequirement(...values) {
  const combined = values
    .map((value) => (typeof value === 'string' ? value : ''))
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  if (!combined) {
    return false
  }

  return /\b(amazon\s+prime|prime\s+(eligible|delivery|shipping|only|required|preferred|items?|products?)|with\s+prime|has\s+prime|must\s+have\s+prime)\b/.test(combined)
}

function sanitizeExcludedCandidateIds(values) {
  return sanitizeStringList(values, {
    maxItems: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
    maxItemLength: 200,
  })
}

function sanitizeFinalizeDiscoveryContext(body) {
  const query = typeof body?.query === 'string' ? body.query : ''
  const discoveryToken = truncateText(body?.discoveryToken, 300)
  const amazonDomain = getRequestedAmazonDomain(body?.amazonDomain)
  const { error, isValid, normalizedQuery } = validateSearchInput(query, '')

  if (!isValid) {
    return {
      error,
      isValid: false,
    }
  }

  if (!discoveryToken) {
    return {
      error: 'Your search session expired. Start a new search.',
      isValid: false,
    }
  }

  return {
    amazonDomain,
    discoveryToken,
    isValid: true,
    normalizedQuery,
    requestMode: truncateText(body?.requestMode, 80) || FINALIZE_REQUEST_MODE_DEFAULT,
  }
}

function sanitizeFinalizeCandidatePool(candidatePool) {
  if (!candidatePool || typeof candidatePool !== 'object' || Array.isArray(candidatePool)) {
    return {
      error: 'A candidate pool is required to finalize the search.',
      isValid: false,
    }
  }

  if (!Array.isArray(candidatePool.candidates)) {
    return {
      error: 'A candidate pool with a candidates array is required to finalize the search.',
      isValid: false,
    }
  }

  if (candidatePool.candidates.length === 0) {
    return {
      error: 'Candidate pool must include at least one candidate.',
      isValid: false,
    }
  }

  if (candidatePool.candidates.length > FINALIZE_MAX_CANDIDATES) {
    return {
      error: `Candidate pool cannot include more than ${FINALIZE_MAX_CANDIDATES} candidates.`,
      isValid: false,
    }
  }

  const candidates = []

  for (const [index, candidate] of candidatePool.candidates.entries()) {
    const sanitized = sanitizeFinalizeCandidate(candidate, index)

    if (!sanitized.isValid) {
      return sanitized
    }

    if (lacksKnownPositivePrice(sanitized.candidate)) {
      continue
    }

    candidates.push(sanitized.candidate)
  }

  if (candidates.length === 0) {
    return {
      error: 'Candidate pool must include at least one eligible candidate.',
      isValid: false,
    }
  }

  return {
    isValid: true,
    candidatePool: {
      query: truncateText(candidatePool.query, 200),
      details: truncateText(candidatePool.details, 500),
      combinedSearchText: truncateText(candidatePool.combinedSearchText, 400),
      searchState: truncateText(candidatePool.searchState, 200),
      similarQueries: sanitizeStringList(candidatePool.similarQueries, { maxItems: 8, maxItemLength: 120 }),
      candidates,
    },
  }
}

function resolveFinalizeCandidatePool(cachedEntry) {
  if (!cachedEntry?.candidatePool?.candidates?.length) {
    return {
      error: 'The guided search context expired. Please start the search again.',
      isValid: false,
      statusCode: 409,
    }
  }

  const sanitizedCandidatePool = sanitizeFinalizeCandidatePool(cachedEntry.candidatePool)

  if (!sanitizedCandidatePool.isValid) {
    return {
      error: 'The cached guided discovery data was invalid. Please start the search again.',
      isValid: false,
      statusCode: 500,
    }
  }

  return {
    candidatePool: sanitizedCandidatePool.candidatePool,
    cachedEntry,
    isValid: true,
  }
}

function buildFinalizeFastResponseContract({
  query = '',
  discoveryToken = '',
  latestUserContext = '',
  results = [],
  selectedCandidateIds = [],
  model = '',
  strategy = '',
} = {}) {
  return createFinalizeFastContract({
    query,
    discoveryToken,
    latestUserContext,
    selectedCandidateIds,
    shortlist: results.slice(0, LIVE_RESULT_FILTER_CONFIG.finalResultLimit),
    model,
    strategy,
    generatedAt: new Date().toISOString(),
  })
}

export async function handleFinalizeSelection(request, response) {
  const requestStartedAt = nowMs()
  let body

  try {
    const bodyReadStartedAt = nowMs()
    body = await readJsonBody(request, { maxBytes: FINALIZE_BODY_LIMIT_BYTES })
    body.bodyReadDuration = nowMs() - bodyReadStartedAt
  } catch (error) {
    logSearchFlowEvent('guided_finalize_invalid_body', {
      route: '/api/search/finalize',
      error: error instanceof Error ? error.message : 'Invalid request body.',
    })
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid request body.' })
    return
  }

  const supportSearchId = truncateText(body?.searchId, 120) || null
  const openAiApiKey = getEnv('OPENAI_API_KEY')
  const claudeApiKey = getEnv('CLAUDE_API_KEY')
  const rankingPreference = normalizeRankingPreference(body?.rankingPreference)

  if (!openAiApiKey && !claudeApiKey) {
    logSearchFlowEvent('guided_finalize_configuration_error', {
      route: '/api/search/finalize',
      searchId: supportSearchId,
    })
    recordFinalizeDiagnosticEvent(body, {
      stage: 'backend_response_sent',
      status: 'failed',
      finalStatus: 'provider_error',
      errorMessage: 'No shortlist AI provider is configured.',
    })
    sendJson(response, 500, {
      error: 'OPENAI_API_KEY and CLAUDE_API_KEY are both missing from the root .env file.',
    })
    return
  }

  const clientIpAddress = getClientIpAddress(request.headers || {})
  const rateLimit = await takeRateLimitToken(clientIpAddress, DEFAULT_RATE_LIMIT_CONFIG)

  if (!rateLimit.allowed) {
    logSearchFlowEvent('guided_finalize_rate_limited', {
      route: '/api/search/finalize',
      searchId: supportSearchId,
      clientIpAddress,
    })
    recordFinalizeDiagnosticEvent(body, {
      stage: 'backend_response_sent',
      status: 'rate_limited',
      finalStatus: 'frontend_error',
      errorMessage: 'Finalize rate limit reached.',
    })
    sendJson(response, 429, {
      error: `Too many finalize requests from this connection. ${RATE_LIMIT_WAIT_MESSAGE}`,
    })
    return
  }

  logSearchFlowEvent('guided_finalize_request_received', {
    route: '/api/search/finalize',
    searchId: supportSearchId,
    bodyKeys: Object.keys(body || {}),
    hasQuery: typeof body?.query === 'string',
    hasDiscoveryToken: typeof body?.discoveryToken === 'string',
    queryLength: typeof body?.query === 'string' ? body.query.length : 0,
    tokenLength: typeof body?.discoveryToken === 'string' ? body.discoveryToken.length : 0,
    requestMode: typeof body?.requestMode === 'string' ? body.requestMode : null,
    rankingPreference,
    bodyReadDuration: body?.bodyReadDuration,
  })
  recordFinalizeDiagnosticEvent(body, {
    stage: 'backend_received',
    status: 'finalize_started',
    query: typeof body?.query === 'string' ? body.query : '',
    amazonDomain: getRequestedAmazonDomain(body?.amazonDomain),
    retryCount: Number.isFinite(Number(body?.retryCount)) ? Number(body.retryCount) : 0,
  })

  const cacheLookupStartedAt = nowMs()
  const finalizeContext = await resolveFinalizeRequestContext({
    body,
    resolveCandidatePool: resolveFinalizeCandidatePool,
    resolveDiscoveryContext,
    sanitizeDiscoveryContext: sanitizeFinalizeDiscoveryContext,
  })
  const cacheLookupDuration = nowMs() - cacheLookupStartedAt
  const sanitizedDiscoveryContext = finalizeContext.discoveryContext

  if (!sanitizedDiscoveryContext.isValid) {
    logSearchFlowEvent('guided_finalize_invalid', {
      route: '/api/search/finalize',
      searchId: supportSearchId,
      query: typeof body?.query === 'string' ? body.query : '',
      error: sanitizedDiscoveryContext.error,
    })
    recordFinalizeDiagnosticEvent(body, {
      stage: 'backend_response_sent',
      status: 'failed',
      query: typeof body?.query === 'string' ? body.query : '',
      amazonDomain: getRequestedAmazonDomain(body?.amazonDomain),
      finalStatus: 'frontend_error',
      errorMessage: sanitizedDiscoveryContext.error,
      durationMs: roundTimingDuration(nowMs() - requestStartedAt),
    })
    sendJson(response, 400, { error: sanitizedDiscoveryContext.error })
    return
  }

  const resolvedDiscoveryContext = finalizeContext.resolvedDiscoveryContext

  if (!resolvedDiscoveryContext.isValid) {
    logSearchFlowEvent('guided_finalize_missing_discovery_context', {
      route: '/api/search/finalize',
      searchId: supportSearchId,
      query: sanitizedDiscoveryContext.normalizedQuery,
      error: resolvedDiscoveryContext.error,
    })
    recordFinalizeDiagnosticEvent(body, {
      stage: 'backend_response_sent',
      status: 'failed',
      query: sanitizedDiscoveryContext.normalizedQuery,
      amazonDomain: sanitizedDiscoveryContext.amazonDomain,
      finalStatus: 'frontend_error',
      errorMessage: resolvedDiscoveryContext.error,
      durationMs: roundTimingDuration(nowMs() - requestStartedAt),
    })
    sendJson(response, resolvedDiscoveryContext.statusCode, { error: resolvedDiscoveryContext.error })
    return
  }

  const resolvedCandidatePool = finalizeContext.reason === 'invalid_candidate_pool'
    ? finalizeContext.resolvedCandidatePool
    : { candidatePool: finalizeContext.candidatePool, isValid: true }

  if (!resolvedCandidatePool.isValid) {
    logSearchFlowEvent('guided_finalize_missing_discovery_context', {
      route: '/api/search/finalize',
      searchId: supportSearchId,
      query: sanitizedDiscoveryContext.normalizedQuery,
      error: resolvedCandidatePool.error,
    })
    recordFinalizeDiagnosticEvent(body, {
      stage: 'backend_response_sent',
      status: 'failed',
      query: sanitizedDiscoveryContext.normalizedQuery,
      amazonDomain: sanitizedDiscoveryContext.amazonDomain,
      finalStatus: 'empty',
      errorMessage: resolvedCandidatePool.error,
      durationMs: roundTimingDuration(nowMs() - requestStartedAt),
    })
    sendJson(response, resolvedCandidatePool.statusCode, { error: resolvedCandidatePool.error })
    return
  }

  const candidatePool = resolvedCandidatePool.candidatePool
  const priorities = sanitizeStringList(body?.priorities, {
    maxItems: FINALIZE_MAX_PRIORITIES,
    maxItemLength: FINALIZE_MAX_PRIORITY_LENGTH,
  })
  const followUpNotes = truncateText(body?.followUpNotes, FINALIZE_MAX_NOTE_LENGTH)
  const rejectionFeedback = truncateText(
    body?.rejectionFeedback,
    FINALIZE_MAX_REJECTION_FEEDBACK_LENGTH,
  )
  const excludedCandidateIds = sanitizeExcludedCandidateIds(body?.excludedCandidateIds)
  const retryCount = Number.isFinite(Number(body?.retryCount))
    ? Math.max(0, Math.min(FINALIZE_MAX_RETRY_COUNT, Number(body.retryCount)))
    : 0
  const requestMode = sanitizedDiscoveryContext.requestMode
  const detailParts = []
  const hasContextSignals = hasContextAddedFinalizeSignals({
    priorities,
    followUpNotes,
    rejectionFeedback,
    retryCount,
    excludedCandidateIds,
  })
  if (priorities.length > 0) {
    detailParts.push(`Priorities: ${priorities.join(', ')}`)
  }

  if (followUpNotes) {
    detailParts.push(`Notes: ${followUpNotes}`)
  }

  if (rejectionFeedback) {
    detailParts.push(`Retry feedback: ${rejectionFeedback}`)
  }

  if (excludedCandidateIds.length > 0) {
    detailParts.push(`Excluded previous picks: ${excludedCandidateIds.join(', ')}`)
  }

  const refinedDetails = detailParts.join('. ')
  const exclusionSet = new Set(excludedCandidateIds.map((value) => String(value)))
  const candidatesAfterExclusions =
    exclusionSet.size > 0
      ? candidatePool.candidates.filter((candidate) => !exclusionSet.has(String(candidate.id)))
      : candidatePool.candidates
  const conditionEligibleCandidates = filterNonNewConditionCandidates({
    candidates: candidatesAfterExclusions,
    productQuery: sanitizedDiscoveryContext.normalizedQuery,
    userContext: refinedDetails,
  }).candidates
  const provableConstraintValidation = filterCandidatesByProvableConstraints({
    candidates: conditionEligibleCandidates,
    productQuery: sanitizedDiscoveryContext.normalizedQuery,
    userContext: [candidatePool.details, refinedDetails].filter(Boolean).join('. '),
  })
  const hasPrimeRequirement = hasPrimeDeliveryRequirement(
    sanitizedDiscoveryContext.normalizedQuery,
    followUpNotes,
    rejectionFeedback,
    priorities.join(' '),
  )
  const primeEligibleCandidates = hasPrimeRequirement
    ? provableConstraintValidation.candidates.filter((candidate) => candidate.isPrime)
    : []
  const eligibleCandidates = primeEligibleCandidates.length > 0
    ? primeEligibleCandidates
    : provableConstraintValidation.candidates
  const constraintValidation = {
    ...provableConstraintValidation.constraints,
    rejectedCount: provableConstraintValidation.rejections.length,
    rejections: provableConstraintValidation.rejections,
  }

  const nextCandidatePool = {
    ...candidatePool,
    details: refinedDetails,
    candidates: eligibleCandidates,
  }
  const tokenUsageByStage = {
    finalize: null,
  }

  if (retryCount > 0 && nextCandidatePool.candidates.length === 0) {
    const retryExhaustedDetails = excludedCandidateIds.length > 0
      ? 'No new candidates remained after excluding the previously rejected picks.'
      : constraintValidation.rejectedCount > 0
        ? 'No candidates remained after applying the shopper requirements to the refined search.'
        : 'No candidates remained for the refined search.'
    const finalizeFast = buildFinalizeFastResponseContract({
      query: sanitizedDiscoveryContext.normalizedQuery,
      discoveryToken: sanitizedDiscoveryContext.discoveryToken,
      latestUserContext: refinedDetails,
      results: [],
      selectedCandidateIds: [],
      model: '',
      strategy: 'retry_exhausted',
    })

    logSearchFlowEvent('guided_finalize_retry_exhausted', {
      route: '/api/search/finalize',
      searchId: supportSearchId,
      query: sanitizedDiscoveryContext.normalizedQuery,
      candidateCount: 0,
      constraintValidation,
      retryCount,
      requestMode,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })
    sendJson(response, 200, {
      finalizeFast,
      requestMode,
      retryCount,
      results: finalizeFast.shortlist,
      selection: {
        layer: finalizeFast.layer,
        mode: 'retry_exhausted',
        model: null,
        rankingPreference,
        requestMode,
        shortlistLocked: finalizeFast.shortlistLocked,
        selectedCandidateIds: finalizeFast.selectedCandidateIds,
        constraintValidation,
        details: retryExhaustedDetails,
      },
    }, {
      serverTiming: [
        { name: 'body', duration: body.bodyReadDuration || 0 },
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'total', duration: nowMs() - requestStartedAt },
      ],
    })
    recordFinalizeDiagnosticEvent(body, {
      stage: 'backend_response_sent',
      status: 'retry_exhausted',
      query: sanitizedDiscoveryContext.normalizedQuery,
      amazonDomain: sanitizedDiscoveryContext.amazonDomain,
      durationMs: roundTimingDuration(nowMs() - requestStartedAt),
      finalStatus: 'empty',
      resultCountAfterInternalFilters: 0,
      retryCount,
      metadata: {
        constraintActiveCount: constraintValidation.activeCount,
        constraintRejectedCount: constraintValidation.rejectedCount,
      },
    })
    return
  }

  try {
    const selectorStartedAt = nowMs()
    const usesPreferencePolicy = isActiveRankingPreference(rankingPreference)
    const selectorResult = await lockWinnersAndBadges({
      candidatePool: nextCandidatePool,
      finalResultLimit: Math.min(
        12,
        Math.max(LIVE_RESULT_FILTER_CONFIG.finalResultLimit, nextCandidatePool.candidates.length),
      ),
      openAiApiKey,
      claudeApiKey,
      model: getEnv('OPENAI_SELECTOR_MODEL') || DEFAULT_SELECTOR_MODEL,
      rankingPreference: usesPreferencePolicy ? RANKING_PREFERENCES.BALANCED : rankingPreference,
      allowOptionalAlternatives: true,
    })
    const selectorDuration = nowMs() - selectorStartedAt
    tokenUsageByStage.finalize = selectorResult.usage || null

    const candidateById = new Map(
      nextCandidatePool.candidates.map((c) => [String(c.id), c]),
    )
    const seenSelectorIds = new Set()
    const fitFrontierIds = selectorResult.lockedIds
      .filter((id) => {
        const normalizedId = String(id)
        if (seenSelectorIds.has(normalizedId)) return false
        seenSelectorIds.add(normalizedId)
        return candidateById.has(normalizedId)
      })
    const composition = usesPreferencePolicy
      ? composePreferenceShortlist({
        candidatePool: nextCandidatePool,
        fitFrontierIds,
        finalResultLimit: LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
        rankingPreference,
      })
      : { ids: fitFrontierIds, policy: 'balanced' }
    const reportedCoreIds = Array.isArray(selectorResult.coreIds)
      ? selectorResult.coreIds
      : selectorResult.lockedIds
    const selectorCoreIds = new Set(
      reportedCoreIds
        .map((id) => String(id))
        .filter((id) => candidateById.has(id)),
    )
    const selectorCandidates = composition.ids
      .map((id) => {
        const normalizedId = String(id)
        const candidate = candidateById.get(normalizedId)
        if (!candidate) return null

        const haikuBrand = String(selectorResult.brandById?.[normalizedId] || '').trim()
        return haikuBrand ? { ...candidate, haikuBrand } : candidate
      })
      .filter(Boolean)
    const selectorCoreCandidates = selectorCandidates.filter((candidate) =>
      selectorCoreIds.has(String(candidate.id)),
    )

    const targetResultCount = Math.min(
      LIVE_RESULT_FILTER_CONFIG.finalResultLimit,
      nextCandidatePool.candidates.length,
    )
    const specificBrand = selectorResult.specificBrand || hasExplicitBrandRequest(
      nextCandidatePool.query,
      [...nextCandidatePool.candidates, ...selectorCandidates],
    )
    const maxPerBrand = specificBrand ? undefined : 2
    let brandCapOverflowCount = 0
    const onBrandOverflow = () => {
      brandCapOverflowCount += 1
    }
    const selectorResults = selectorCandidates.map((candidate) => toFinalizeFastCard(candidate))
    const selectorAlternativeIds = new Set(
      (Array.isArray(selectorResult.alternativeIds) ? selectorResult.alternativeIds : [])
        .map((id) => String(id)),
    )

    const suggestedQuery = String(selectorResult.suggestedQuery || '').trim()
    const { isValid: hasValidSuggestedQuery, normalizedQuery: normalizedSuggestedQuery } =
      suggestedQuery ? validateSuggestedSearchQuery(suggestedQuery) : { isValid: false, normalizedQuery: '' }
    const needsBetterSearch =
      retryCount === 0 &&
      selectorCoreCandidates.length < 4 &&
      hasValidSuggestedQuery &&
      normalizedSuggestedQuery.toLowerCase() !== sanitizedDiscoveryContext.normalizedQuery.toLowerCase()

    let selectedCandidates = []
    let selectionStrategy = 'haiku_lock_empty'
    let flowPath = 'haiku_lock_empty'
    let miniEnrichmentStatus = 'skipped'

    if (needsBetterSearch) {
      selectedCandidates = selectDistinctCandidates({
        preferredCandidates: selectorCoreCandidates,
        limit: targetResultCount,
        maxPerBrand,
        onBrandOverflow,
      })
      selectionStrategy = 'haiku_lock_partial_recovery'
      flowPath = 'haiku_lock_partial_recovery'
      miniEnrichmentStatus = 'running_async'
    } else if (selectorResults.length > 0) {
      selectedCandidates = selectDistinctCandidates({
        preferredCandidates: selectorCandidates,
        limit: targetResultCount,
        maxPerBrand,
        onBrandOverflow,
      })
      const didPromoteReserve = selectedCandidates.some((candidate) =>
        selectorAlternativeIds.has(String(candidate.id)),
      )
      if (selectedCandidates.length >= targetResultCount) {
        selectionStrategy = usesPreferencePolicy
          ? `haiku_fit_frontier_${composition.policy}${didPromoteReserve ? '_reserve_promoted' : ''}`
          : didPromoteReserve ? 'haiku_lock_reserve_promoted' : 'haiku_lock'
        flowPath = usesPreferencePolicy
          ? didPromoteReserve ? 'haiku_fit_frontier_policy_reserve_promoted' : 'haiku_fit_frontier_policy'
          : didPromoteReserve ? 'haiku_lock_reserve_promoted' : 'haiku_lock'
      } else {
        selectionStrategy = usesPreferencePolicy ? `haiku_fit_frontier_${composition.policy}_partial` : 'haiku_lock_partial'
        flowPath = usesPreferencePolicy ? 'haiku_fit_frontier_policy_partial' : 'haiku_lock_partial'
      }

      miniEnrichmentStatus = 'running_async'
    }

    const results = selectedCandidates.map((candidate) => toFinalizeFastCard(candidate))
    const brandVariety = {
      ...summarizeBrandVariety(selectedCandidates, { specificBrand }),
      brandCapOverflowCount,
    }

    const selectedCandidateIds = results.map((item) => item.id)
    const usedAiSelection = true

    if (process.env.NODE_ENV !== 'production') {
      recordRecentFinalization({
        query: sanitizedDiscoveryContext.normalizedQuery,
        details: refinedDetails || sanitizedDiscoveryContext.latestUserContext || '',
        results,
        strategy: selectionStrategy,
        model: usedAiSelection ? selectorResult.model : null,
        timestamp: new Date().toISOString(),
      })
    }

    const finalizeFast = buildFinalizeFastResponseContract({
      query: sanitizedDiscoveryContext.normalizedQuery,
      discoveryToken: sanitizedDiscoveryContext.discoveryToken,
      latestUserContext: refinedDetails,
      results,
      selectedCandidateIds,
      model: usedAiSelection ? selectorResult.model : '',
      strategy: selectionStrategy,
    })
    const persistenceStartedAt = nowMs()
    let persistenceDuration = 0

    try {
      await writeSearchSnapshot({
        productQuery: sanitizedDiscoveryContext.normalizedQuery,
        details: '',
        candidatePool: nextCandidatePool,
        discoveryToken: sanitizedDiscoveryContext.discoveryToken,
        results,
        selection: {
          ...(resolvedDiscoveryContext.cachedEntry?.selection &&
          typeof resolvedDiscoveryContext.cachedEntry.selection === 'object' &&
          !Array.isArray(resolvedDiscoveryContext.cachedEntry.selection)
            ? resolvedDiscoveryContext.cachedEntry.selection
            : {}),
          mode: usedAiSelection ? 'ai' : 'rules_fallback',
          strategy: selectionStrategy,
          model: usedAiSelection ? selectorResult.model : null,
          selectorProvider: selectorResult.provider || null,
          selectorFallbackUsed: Boolean(selectorResult.fallbackUsed),
          primarySelectorModel: selectorResult.primaryModel || selectorResult.model || null,
          selectedCandidateIds: finalizeFast.selectedCandidateIds,
          rankingPreference,
          brandVariety,
          constraintValidation,
          finalizedAt: new Date().toISOString(),
        },
        source: 'guided_finalize_selection',
        scope: resolvedDiscoveryContext.discoveryScope,
      })
      persistenceDuration = nowMs() - persistenceStartedAt
    } catch (error) {
      persistenceDuration = nowMs() - persistenceStartedAt
      logSearchFlowEvent('guided_finalize_persistence_failed', {
        route: '/api/search/finalize',
        searchId: supportSearchId,
        query: sanitizedDiscoveryContext.normalizedQuery,
        persistenceMs: roundTimingDuration(persistenceDuration),
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }

    const totalDuration = nowMs() - requestStartedAt

    logSearchFlowEvent('guided_finalize_completed', {
      route: '/api/search/finalize',
      searchId: supportSearchId,
      query: sanitizedDiscoveryContext.normalizedQuery,
      candidateCount: nextCandidatePool.candidates.length,
      candidateCountBeforeConstraints: conditionEligibleCandidates.length,
      finalCount: results.length,
      retryCount,
      metadata: brandVariety,
      constraintValidation,
      requestMode,
      cacheMs: roundTimingDuration(cacheLookupDuration),
      selectorMs: roundTimingDuration(selectorDuration),
      haikuMs: roundTimingDuration(selectorDuration),
      persistenceMs: roundTimingDuration(persistenceDuration),
      productDetailsMs: null,
      totalMs: roundTimingDuration(totalDuration),
      selectorUsage: selectorResult.usage || null,
      haikuUsage: selectorResult.usage || null,
      selectorProvider: selectorResult.provider || null,
      selectorFallbackUsed: Boolean(selectorResult.fallbackUsed),
      primarySelectorModel: selectorResult.primaryModel || selectorResult.model || null,
      rankingOwner: usedAiSelection
        ? 'ai_guarded_frontier'
        : 'deterministic_fallback',
      selectionMode: usedAiSelection ? 'ai' : 'rules_fallback',
      selectionStrategy,
      flowPath,
      finalizeModel: selectorResult.model,
      finalizeModelPath: hasContextSignals ? 'context_added' : 'baseline',
      rankingPreference,
    })

    sendJson(response, 200, {
      debug: {
        finalizeFastLayer: finalizeFast.layer,
        flowPath,
        finalizeModel: selectorResult.model,
        selectorProvider: selectorResult.provider || null,
        selectorFallbackUsed: Boolean(selectorResult.fallbackUsed),
        primarySelectorModel: selectorResult.primaryModel || selectorResult.model || null,
        finalizeModelPath: hasContextSignals ? 'context_added' : 'baseline',
        requestMode,
        miniEnrichmentStatus,
        stageLatencyMs: {
          body: roundTimingDuration(body.bodyReadDuration || 0),
          cache: roundTimingDuration(cacheLookupDuration),
          selector: roundTimingDuration(selectorDuration),
          haiku: roundTimingDuration(selectorDuration),
          persistence: roundTimingDuration(persistenceDuration),
          productDetails: null,
          total: roundTimingDuration(totalDuration),
        },
        tokenUsageByStage,
      },
      finalizeFast,
      requestMode,
      retryCount,
      results,
      selection: {
        layer: finalizeFast.layer,
        mode: usedAiSelection ? 'ai' : 'rules_fallback',
        strategy: selectionStrategy,
        model: usedAiSelection ? selectorResult.model : null,
        selectorProvider: selectorResult.provider || null,
        selectorFallbackUsed: Boolean(selectorResult.fallbackUsed),
        primarySelectorModel: selectorResult.primaryModel || selectorResult.model || null,
        modelPath: hasContextSignals ? 'context_added' : 'baseline',
        specificBrand,
        rankingPreference,
        candidateRecovery: needsBetterSearch
          ? {
            goodCandidateCount: selectedCandidates.length,
            suggestedQuery: normalizedSuggestedQuery,
          }
          : null,
        requestMode,
        shortlistLocked: finalizeFast.shortlistLocked,
        usage: usedAiSelection ? selectorResult.usage || null : null,
        selectedCandidateIds: finalizeFast.selectedCandidateIds,
        constraintValidation,
        details: selectionStrategy === 'haiku_lock_partial_recovery'
          ? 'Fewer than four strong matches were found. The remaining candidates were not used to pad the shortlist.'
          : selectionStrategy === 'haiku_lock'
          ? 'The AI selector locked the shortlist. Product details and mini enrichment are running async.'
          : selectionStrategy.includes('reserve_promoted')
            ? 'The AI selector locked the shortlist and AI-ranked reserves that passed server-owned constraint checks replaced removed picks. Product details and mini enrichment are running async.'
            : selectionStrategy.includes('partial')
              ? 'Only AI-ranked picks that passed server-owned constraint checks were returned; the shortlist was not padded from the raw candidate pool.'
              : 'The AI selector returned no picks that passed server-owned constraint checks, so the shortlist was not padded from the raw candidate pool.',
        flowPath,
        miniEnrichmentStatus,
      },
      usage: {
        selector: selectorResult.usage || null,
        haiku: selectorResult.usage || null,
      },
    }, {
      serverTiming: [
        { name: 'body', duration: body.bodyReadDuration || 0 },
        { name: 'cache', duration: cacheLookupDuration },
        { name: 'haiku', duration: selectorDuration },
        { name: 'persistence', duration: persistenceDuration },
        { name: 'total', duration: totalDuration },
      ],
    })
    recordFinalizeDiagnosticEvent(body, {
      stage: 'backend_response_sent',
      status: 'success',
      query: sanitizedDiscoveryContext.normalizedQuery,
      amazonDomain: sanitizedDiscoveryContext.amazonDomain,
      durationMs: roundTimingDuration(totalDuration),
      finalStatus: 'success',
      resultCountAfterInternalFilters: results.length,
      retryCount,
      metadata: {
        ...brandVariety,
        constraintActiveCount: constraintValidation.activeCount,
        constraintRejectedCount: constraintValidation.rejectedCount,
      },
    })

    // Fire off product details and mini enrichment async; do not block the response.
    if (usedAiSelection && selectedCandidateIds.length > 0) {
      const miniModel = getEnv('OPENAI_FINALIZE_MODEL') || DEFAULT_FINALIZE_MODEL
      const rainforestApiKey = getEnv('RAINFOREST_API_KEY')

      runInBackground((async () => {
        try {
          const productDetailsStartedAt = nowMs()
          const productDetailsById = await fetchAmazonProductDetailsByAsin({
            asins: selectedCandidateIds,
            rainforestApiKey,
            amazonDomain: sanitizedDiscoveryContext.amazonDomain,
            readCache: readProductDetailsCacheEntries,
            writeCache: writeProductDetailsCacheEntries,
          })
          const productDetailsDuration = nowMs() - productDetailsStartedAt
          const enrichedCandidatePool = mergeProductDetailsIntoCandidatePool(nextCandidatePool, productDetailsById)

          await runMiniEnrichmentAsync({
            lockedIds: selectedCandidateIds,
            candidatePool: enrichedCandidatePool,
            apiKey: openAiApiKey,
            model: miniModel,
            normalizedQuery: sanitizedDiscoveryContext.normalizedQuery,
            discoveryToken: sanitizedDiscoveryContext.discoveryToken,
            discoveryScope: resolvedDiscoveryContext.discoveryScope,
            rankingPreference,
          })

          try {
            await runDeepDiveEligibilityAsync({
              lockedIds: selectedCandidateIds,
              candidatePool: enrichedCandidatePool,
              normalizedQuery: sanitizedDiscoveryContext.normalizedQuery,
              discoveryToken: sanitizedDiscoveryContext.discoveryToken,
              discoveryScope: resolvedDiscoveryContext.discoveryScope,
            })
          } catch (error) {
            logSearchFlowEvent('deep_dive_eligibility_failed', {
              searchId: supportSearchId,
              query: sanitizedDiscoveryContext.normalizedQuery,
              error: error instanceof Error ? error.message : 'Unknown error',
              mode: 'async',
            })
            reportBackendError(error, {
              label: 'deep_dive_eligibility_async',
              query: sanitizedDiscoveryContext.normalizedQuery,
              route: '/api/search/finalize',
              searchId: supportSearchId,
              source: 'guided_finalize_background',
            })
          }

          logSearchFlowEvent('mini_enrichment_background_completed', {
            searchId: supportSearchId,
            query: sanitizedDiscoveryContext.normalizedQuery,
            productDetailsMs: roundTimingDuration(productDetailsDuration),
            mode: 'async',
          })
        } catch (error) {
          logSearchFlowEvent('mini_enrichment_failed', {
            searchId: supportSearchId,
            query: sanitizedDiscoveryContext.normalizedQuery,
            error: error instanceof Error ? error.message : 'Unknown error',
            mode: 'async',
          })
          reportBackendError(error, {
            label: 'mini_enrichment_async',
            query: sanitizedDiscoveryContext.normalizedQuery,
            route: '/api/search/finalize',
            searchId: supportSearchId,
            source: 'guided_finalize_background',
          })
        }
      })(), {
        label: 'guided_finalize_async_enrichment',
        query: sanitizedDiscoveryContext.normalizedQuery,
        route: '/api/search/finalize',
        searchId: supportSearchId,
      })
    }
  } catch (error) {
    logSearchFlowEvent('guided_finalize_failed', {
      route: '/api/search/finalize',
      searchId: supportSearchId,
      query: sanitizedDiscoveryContext.normalizedQuery,
      candidateCount: nextCandidatePool.candidates.length,
      candidateCountBeforeConstraints: conditionEligibleCandidates.length,
      constraintValidation,
      retryCount,
      requestMode,
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    reportBackendError(error, {
      candidateCount: nextCandidatePool.candidates.length,
      query: sanitizedDiscoveryContext.normalizedQuery,
      requestMode,
      retryCount,
      route: '/api/search/finalize',
      searchId: supportSearchId,
      source: 'guided_finalize',
      totalMs: roundTimingDuration(nowMs() - requestStartedAt),
    })
    recordFinalizeDiagnosticEvent(body, {
      stage: 'backend_response_sent',
      status: 'failed',
      query: sanitizedDiscoveryContext.normalizedQuery,
      amazonDomain: sanitizedDiscoveryContext.amazonDomain,
      durationMs: roundTimingDuration(nowMs() - requestStartedAt),
      finalStatus: 'provider_error',
      errorType: error?.name || 'Error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      retryCount,
    })
    sendJson(response, 500, buildInternalErrorPayload('Unable to finalize the product selection.', error))
  }
}
