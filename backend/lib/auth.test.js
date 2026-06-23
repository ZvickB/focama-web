import { describe, expect, it } from 'vitest'

import { getUserEntitlements } from './auth.js'

describe('auth entitlements', () => {
  it('treats subscriber app metadata as Deep Dive unlimited access', () => {
    const entitlements = getUserEntitlements({
      app_metadata: { subscriber: true },
      email: 'person@example.com',
      id: 'user-1',
    }, {})

    expect(entitlements.deepDiveUnlimited).toBe(true)
    expect(entitlements.isSubscriber).toBe(true)
  })

  it('treats subscriber user metadata as Deep Dive unlimited access', () => {
    const entitlements = getUserEntitlements({
      user_metadata: { is_subscriber: 'true' },
      email: 'person@example.com',
      id: 'user-1',
    }, {})

    expect(entitlements.deepDiveUnlimited).toBe(true)
  })

  it('supports temporary subscriber email allowlists', () => {
    const entitlements = getUserEntitlements({
      email: 'Tester@Example.com',
      id: 'user-1',
    }, {
      DEEP_DIVE_SUBSCRIBER_EMAILS: 'tester@example.com,other@example.com',
    })

    expect(entitlements.deepDiveUnlimited).toBe(true)
  })
})
