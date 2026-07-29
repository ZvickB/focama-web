import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  verifySupabaseBearerToken: vi.fn(),
}))
const storageMocks = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(),
  readAnalyticsDashboardData: vi.fn(),
  readCachePoolEntries: vi.fn(),
  recordAnalyticsResultClick: vi.fn(),
  recordAnalyticsResultImpressions: vi.fn(),
  recordAnalyticsSearchEvent: vi.fn(),
  upsertAnalyticsSearchRun: vi.fn(),
}))

vi.mock('../auth.js', () => authMocks)
vi.mock('../search-storage.js', () => storageMocks)

import { handleAnalyticsTrack, handleMobileAnalyticsTrack } from './analytics-handler.js'

function createResponseRecorder() {
  return {
    body: '',
    headers: {},
    statusCode: 0,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = headers
    },
    end(body = '') {
      this.body += body
    },
  }
}

function createJsonRequest(body, headers = {}) {
  return {
    headers,
    on(eventName, callback) {
      if (eventName === 'data') callback(body)
      if (eventName === 'end') callback()
    },
  }
}

describe('analytics tracking identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.verifySupabaseBearerToken.mockResolvedValue({
      ok: true,
      user: { id: 'account-123' },
    })
    storageMocks.upsertAnalyticsSearchRun.mockResolvedValue(undefined)
  })

  it('uses the verified account and records browser device, session, and platform fields', async () => {
    const response = createResponseRecorder()

    await handleAnalyticsTrack(
      createJsonRequest(JSON.stringify({
        deviceId: 'device-123',
        eventType: 'search_run_upsert',
        platform: 'web',
        productQuery: 'travel stroller',
        searchId: 'search-123',
        sessionId: 'session-123',
      }), { authorization: 'Bearer verified-token' }),
      response,
    )

    expect(response.statusCode).toBe(202)
    expect(storageMocks.upsertAnalyticsSearchRun).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account-123',
      deviceId: 'device-123',
      platform: 'web',
      searchId: 'search-123',
      sessionId: 'session-123',
    }))
    expect(authMocks.verifySupabaseBearerToken).toHaveBeenCalledWith({ authorization: 'Bearer verified-token' })
  })

  it('uses the verified account for a signed-in mobile analytics event', async () => {
    const response = createResponseRecorder()

    await handleMobileAnalyticsTrack(
      createJsonRequest(JSON.stringify({
        event: 'search_started',
        payload: { query: 'travel stroller' },
        searchId: 'search-123',
        sessionId: 'session-123',
      }), { authorization: 'Bearer verified-token' }),
      response,
    )

    expect(response.statusCode).toBe(202)
    expect(storageMocks.upsertAnalyticsSearchRun).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account-123',
      platform: 'mobile',
      searchId: 'search-123',
      sessionId: 'session-123',
    }))
    expect(authMocks.verifySupabaseBearerToken).toHaveBeenCalledWith({ authorization: 'Bearer verified-token' })
  })
})
