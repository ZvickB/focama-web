import { trackAnalytics } from '@/lib/analytics.js'
import {
  ACTIVITY_EVENT_SCHEMA_VERSION,
  toActivityEventType,
} from '../../../shared/activity-events.js'

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
  return Boolean(ids.deviceId && ids.searchId && ids.sessionId)
}

function getIdentityFields(ids = {}) {
  return {
    deviceId: ids.deviceId,
    platform: 'web',
    ...(ids.accessToken ? { analyticsAccessToken: ids.accessToken } : {}),
  }
}

export function trackSearchAnalyticsEvent(name, eventData = {}, ids = {}) {
  if (!hasAnalyticsIds(ids)) {
    return
  }

  trackAnalytics({
    eventType: 'search_event',
    searchId: ids.searchId,
    sessionId: ids.sessionId,
    ...getIdentityFields(ids),
    name,
    eventData,
  })
}

export function trackActivityEvent(name, eventData = {}, ids = {}) {
  if (!hasAnalyticsIds(ids)) {
    return
  }

  const eventType = toActivityEventType(name)

  if (!eventType) {
    return
  }

  trackAnalytics({
    eventType: 'search_event',
    searchId: ids.searchId,
    sessionId: ids.sessionId,
    ...getIdentityFields(ids),
    name: eventType,
    eventData: {
      schemaVersion: ACTIVITY_EVENT_SCHEMA_VERSION,
      ...eventData,
    },
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
    ...getIdentityFields(ids),
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
    ...getIdentityFields(ids),
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
    ...getIdentityFields(ids),
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
