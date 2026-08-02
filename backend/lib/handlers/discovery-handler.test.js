import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  beginOpenAiQueryModeration: vi.fn(),
  fetchRainforestArtifacts: vi.fn(),
  getEnv: vi.fn(),
  getValidatedSearchRequest: vi.fn(),
  moderateQuery: vi.fn(),
  readCachedSearchSnapshot: vi.fn(),
  recordSearchCacheEvent: vi.fn(),
  startQueryQualityReview: vi.fn(),
  takeRateLimitToken: vi.fn(),
  writeSearchSnapshot: vi.fn(),
}))

vi.mock('../content-moderation.js', () => ({
  beginOpenAiQueryModeration: mocks.beginOpenAiQueryModeration,
  moderateProductList: (products) => products || [],
  moderateQuery: mocks.moderateQuery,
  MODERATION_OUTCOMES: { ALLOW: 'allow', HIDE_IMAGE: 'hide_image', BLOCK: 'block' },
}))

vi.mock('../rate-limit.js', () => ({
  DEFAULT_RATE_LIMIT_CONFIG: { limit: 15, windowMs: 10_000 },
  getClientIpAddress: (headers) => headers['x-forwarded-for'] || 'anonymous',
  getCountryCode: () => 'US',
  takeRateLimitToken: mocks.takeRateLimitToken,
}))

vi.mock('../search-pipeline.js', () => ({
  getValidatedSearchRequest: mocks.getValidatedSearchRequest,
  readCachedSearchSnapshot: mocks.readCachedSearchSnapshot,
  recordSearchCacheEvent: mocks.recordSearchCacheEvent,
  writeSearchSnapshot: mocks.writeSearchSnapshot,
}))

vi.mock('../search-storage.js', () => ({
  recordSearchDiagnosticEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../search-data.js', () => ({
  buildCacheKey: (query, details, scope) => `${scope}:${query}|${details}`,
  getEnv: mocks.getEnv,
}))

vi.mock('../rainforest-pipeline.js', () => ({
  fetchRainforestArtifacts: mocks.fetchRainforestArtifacts,
}))

vi.mock('../server-helpers.js', () => ({
  CACHE_SCOPE_LIVE_SEARCH: 'live',
  CACHE_SCOPE_RAINFOREST: 'rainforest',
  LIVE_RESULT_FILTER_CONFIG: { finalResultLimit: 6 },
  RATE_LIMIT_WAIT_MESSAGE: 'Try again shortly.',
  getAmazonMarketplaceScope: (scope, domain) => `${scope}:${domain}`,
  logSearchFlowEvent: vi.fn(),
  nowMs: () => Date.now(),
  resolveAmazonDomain: () => 'amazon.com',
  roundTimingDuration: (value) => value,
  runInBackground: vi.fn(),
}))

vi.mock('../discovery-context.js', () => ({
  getDiscoverySessionScope: (token) => `session:${token}`,
  resolveDiscoveryContext: vi.fn(),
}))

vi.mock('./query-quality-handler.js', () => ({
  startQueryQualityReview: mocks.startQueryQualityReview,
}))

vi.mock('../observability.js', () => ({
  reportBackendError: vi.fn(),
}))

import { handleRainforestDiscoverySearch } from './discovery-handler.js'

function createDeferred() {
  let resolve
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

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

function createCachedSnapshot() {
  const candidates = Array.from({ length: 6 }, (_, index) => ({
    id: `candidate-${index + 1}`,
    title: `Candidate ${index + 1}`,
  }))
  return {
    cachedEntry: {
      candidatePool: { candidates },
      results: candidates,
      selection: { mode: 'discovery_preview' },
      source: 'guided_discovery',
    },
    normalizedCachedResults: candidates,
  }
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('discovery handler query moderation ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getEnv.mockImplementation((name) => ({
      OPENAI_API_KEY: 'openai-key',
      RAINFOREST_API_KEY: 'rainforest-key',
    })[name] || '')
    mocks.getValidatedSearchRequest.mockReturnValue({
      error: '',
      isValid: true,
      normalizedQuery: 'coded brand',
    })
    mocks.moderateQuery.mockReturnValue({ outcome: 'allow' })
    mocks.readCachedSearchSnapshot.mockResolvedValue({
      cachedEntry: null,
      normalizedCachedResults: [],
    })
    mocks.recordSearchCacheEvent.mockResolvedValue(undefined)
    mocks.takeRateLimitToken.mockResolvedValue({ allowed: true })
    mocks.writeSearchSnapshot.mockResolvedValue({
      cachedAt: '2026-07-03T12:00:00.000Z',
      expiresAt: '2026-07-03T18:00:00.000Z',
    })
  })

  it('starts provider work in parallel but does not persist or reveal blocked results', async () => {
    const moderation = createDeferred()
    const provider = createDeferred()
    mocks.beginOpenAiQueryModeration.mockReturnValue({
      promise: moderation.promise,
      synchronous: false,
    })
    mocks.fetchRainforestArtifacts.mockReturnValue(provider.promise)
    const response = createResponseRecorder()

    const handling = handleRainforestDiscoverySearch(
      new URL('http://localhost/api/search/rainforest-discover?query=coded%20brand'),
      response,
      { headers: { 'x-forwarded-for': '203.0.113.30' } },
    )
    await flushAsyncWork()

    expect(mocks.fetchRainforestArtifacts).toHaveBeenCalledTimes(1)
    expect(mocks.writeSearchSnapshot).not.toHaveBeenCalled()
    expect(response.statusCode).toBe(0)

    moderation.resolve({
      outcome: 'block',
      categories: ['sexual'],
      durationMs: 18,
      penaltyApplied: true,
    })
    await handling

    expect(response.statusCode).toBe(400)
    expect(mocks.writeSearchSnapshot).not.toHaveBeenCalled()
    expect(mocks.recordSearchCacheEvent).not.toHaveBeenCalled()
    expect(mocks.startQueryQualityReview).not.toHaveBeenCalled()
    provider.resolve({ artifacts: null, error: null, diagnostics: null })
    await flushAsyncWork()
  })

  it('waits before cache or provider work for a penalized client', async () => {
    const moderation = createDeferred()
    mocks.beginOpenAiQueryModeration.mockReturnValue({
      promise: moderation.promise,
      synchronous: true,
    })
    mocks.getValidatedSearchRequest.mockReturnValue({
      error: '',
      isValid: true,
      normalizedQuery: 'office chair',
    })
    mocks.readCachedSearchSnapshot.mockResolvedValue(createCachedSnapshot())
    const response = createResponseRecorder()

    const handling = handleRainforestDiscoverySearch(
      new URL('http://localhost/api/search/rainforest-discover?query=office%20chair'),
      response,
      { headers: { 'x-forwarded-for': '203.0.113.30' } },
    )
    await flushAsyncWork()

    expect(mocks.readCachedSearchSnapshot).not.toHaveBeenCalled()
    expect(mocks.fetchRainforestArtifacts).not.toHaveBeenCalled()

    moderation.resolve({
      outcome: 'allow',
      categories: [],
      durationMs: 12,
      failedOpen: false,
    })
    await handling

    expect(mocks.readCachedSearchSnapshot).toHaveBeenCalledTimes(1)
    expect(mocks.fetchRainforestArtifacts).not.toHaveBeenCalled()
    expect(response.statusCode).toBe(200)
  })

  it('does not start an AI query-quality review when cached discovery has a brand correction', async () => {
    mocks.beginOpenAiQueryModeration.mockReturnValue({
      promise: Promise.resolve({ outcome: 'allow', categories: [], durationMs: 1 }),
      synchronous: false,
    })
    const cached = createCachedSnapshot()
    cached.cachedEntry.candidatePool.searchCorrection = {
      originalQuery: 'hellmans mayonaise',
      suggestedQuery: "Hellmann's mayonnaise",
      source: 'brand_correction',
    }
    mocks.readCachedSearchSnapshot.mockResolvedValue(cached)
    const response = createResponseRecorder()

    await handleRainforestDiscoverySearch(
      new URL('http://localhost/api/search/rainforest-discover?query=hellmans%20mayonaise'),
      response,
      { headers: { 'x-forwarded-for': '203.0.113.30' } },
    )

    expect(response.statusCode).toBe(200)
    expect(mocks.startQueryQualityReview).not.toHaveBeenCalled()
  })
})
