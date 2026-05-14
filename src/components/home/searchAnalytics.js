import { trackAnalytics } from '@/lib/analytics.js'

export function buildResultAnalyticsItems(results) {
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

export function buildQuerySuggestionAnalyticsData(suggestion = {}) {
  const originalQuery = String(suggestion.originalQuery || suggestion.query || '')
  const suggestedQuery = String(suggestion.suggestedQuery || '')

  return {
    originalQueryLength: originalQuery.length,
    suggestedQueryLength: suggestedQuery.length,
    classification: suggestion.classification || '',
    confidence: suggestion.confidence || '',
  }
}

function hasAnalyticsIds(ids = {}) {
  return Boolean(ids.searchId && ids.sessionId)
}

export function trackSearchAnalyticsEvent(name, eventData = {}, ids = {}) {
  if (!hasAnalyticsIds(ids)) {
    return
  }

  trackAnalytics({
    eventType: 'search_event',
    searchId: ids.searchId,
    sessionId: ids.sessionId,
    name,
    eventData,
  })
}

export function trackSearchRunAnalytics({
  bestResultKey,
  completedFinalize = false,
  details = '',
  enteredAiRefinement = false,
  productQuery = '',
  retryRound = 0,
  usedShowProductsNow = false,
} = {}, ids = {}) {
  if (!hasAnalyticsIds(ids)) {
    return
  }

  trackAnalytics({
    eventType: 'search_run_upsert',
    searchId: ids.searchId,
    sessionId: ids.sessionId,
    productQuery,
    details,
    enteredAiRefinement,
    usedShowProductsNow,
    completedFinalize,
    retryRound,
    ...(bestResultKey !== undefined ? { bestResultKey } : {}),
  })
}

export function trackResultImpressionsAnalytics({ items = [], resultSet = 'final' } = {}, ids = {}) {
  if (!Array.isArray(items) || items.length === 0 || !hasAnalyticsIds(ids)) {
    return
  }

  trackAnalytics({
    eventType: 'result_impressions',
    searchId: ids.searchId,
    sessionId: ids.sessionId,
    resultSet,
    items,
  })
}

export function trackResultClickAnalytics({
  badgeType = '',
  clickTarget = 'card',
  isBestPick = false,
  position = 0,
  provider = '',
  resultKey = '',
  resultSet = 'final',
  retailerUrl = '',
} = {}, ids = {}) {
  if (!hasAnalyticsIds(ids)) {
    return
  }

  trackAnalytics({
    eventType: 'result_click',
    searchId: ids.searchId,
    sessionId: ids.sessionId,
    resultSet,
    resultKey,
    position,
    provider,
    badgeType,
    isBestPick,
    clickTarget,
    retailerUrl,
  })
}
