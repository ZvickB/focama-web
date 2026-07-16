import { describe, expect, it } from 'vitest'
import { buildActivityDashboard } from './analytics-storage.js'

describe('Activity dashboard data', () => {
  it('summarizes operational widget data without changing the analytics reports', () => {
    const now = new Date().toISOString()
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const runs = [
      {
        account_id: 'account-1',
        completed_finalize: true,
        created_at: now,
        device_id: 'device-1',
        platform: 'web',
        product_query: 'travel stroller',
        search_id: 'search-1',
        session_id: 'session-1',
      },
      {
        account_id: null,
        completed_finalize: false,
        created_at: yesterday,
        device_id: 'device-2',
        platform: 'web',
        product_query: 'desk lamp',
        search_id: 'search-2',
        session_id: 'session-2',
      },
    ]

    const activity = buildActivityDashboard({
      clicks: [{ click_target: 'retailer', created_at: now, search_id: 'search-1' }],
      events: [
        { created_at: now, event_type: 'activity.recommendations_shown', search_id: 'search-1' },
        { created_at: now, event_type: 'activity.improve_picks_started', search_id: 'search-1' },
      ],
      runs,
      searchDiagnostics: {
        recentFailures: [{ error: 'Timed out', query: 'desk lamp', searchId: 'search-2' }],
        summary: { failures: 1 },
      },
    })

    expect(activity.usersToday).toEqual({ accounts: 1, devices: 1, searches: 1 })
    expect(activity.retailerActivity).toMatchObject({ clickoutsToday: 1, searchesToday: 1 })
    expect(activity.possibleConfusion.improvePicksToday).toBe(1)
    expect(activity.recentJourneys[0]).toMatchObject({ query: 'travel stroller', status: 'Recommendations shown' })
    expect(activity.errors).toMatchObject({ count: 1 })
  })
})
