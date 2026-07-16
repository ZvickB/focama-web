import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_EVENT_NAMES,
  ACTIVITY_EVENT_SCHEMA_VERSION,
  isActivityEventName,
  toActivityEventType,
} from './activity-events.js'

describe('Activity event contract', () => {
  it('keeps the shared operational event names stable', () => {
    expect(ACTIVITY_EVENT_SCHEMA_VERSION).toBe(1)
    expect(Object.values(ACTIVITY_EVENT_NAMES)).toEqual([
      'error_reported',
      'feedback_submitted',
      'improve_picks_started',
      'payment_completed',
      'product_opened',
      'questions_completed',
      'recommendations_shown',
      'retailer_clicked',
      'search_started',
    ])
  })

  it('only creates stored event types for registered names', () => {
    expect(isActivityEventName(ACTIVITY_EVENT_NAMES.SEARCH_STARTED)).toBe(true)
    expect(toActivityEventType(ACTIVITY_EVENT_NAMES.SEARCH_STARTED)).toBe('activity.search_started')
    expect(toActivityEventType('made_up_event')).toBe('')
  })
})
