// Shared semantic event names for the operational Activity dashboard.
// Web emits these now; mobile can adopt the same names later without sharing UI code.
export const ACTIVITY_EVENT_SCHEMA_VERSION = 1

export const ACTIVITY_EVENT_NAMES = Object.freeze({
  ERROR_REPORTED: 'error_reported',
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  IMPROVE_PICKS_STARTED: 'improve_picks_started',
  PAYMENT_COMPLETED: 'payment_completed',
  PRODUCT_OPENED: 'product_opened',
  QUESTIONS_COMPLETED: 'questions_completed',
  RECOMMENDATIONS_SHOWN: 'recommendations_shown',
  RETAILER_CLICKED: 'retailer_clicked',
  SEARCH_STARTED: 'search_started',
})

const ACTIVITY_EVENT_VALUES = new Set(Object.values(ACTIVITY_EVENT_NAMES))

export function isActivityEventName(value) {
  return ACTIVITY_EVENT_VALUES.has(value)
}

export function toActivityEventType(name) {
  return isActivityEventName(name) ? `activity.${name}` : ''
}
