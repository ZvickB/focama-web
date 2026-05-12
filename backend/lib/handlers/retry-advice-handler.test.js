import { beforeEach, describe, expect, it, vi } from 'vitest'

const retryAdviceMocks = vi.hoisted(() => ({
  generateRetryAdvice: vi.fn(),
}))

const rateLimitMocks = vi.hoisted(() => ({
  takeRateLimitToken: vi.fn(),
}))

const searchDataMocks = vi.hoisted(() => ({
  getEnv: vi.fn(),
}))

vi.mock('../retry-advice.js', () => retryAdviceMocks)

vi.mock('../rate-limit.js', async () => {
  const actual = await vi.importActual('../rate-limit.js')

  return {
    ...actual,
    takeRateLimitToken: rateLimitMocks.takeRateLimitToken,
  }
})

vi.mock('../search-data.js', async () => {
  const actual = await vi.importActual('../search-data.js')

  return {
    ...actual,
    getEnv: searchDataMocks.getEnv,
  }
})

import { createRetryAdviceHandler } from './retry-advice-handler.js'

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
      if (eventName === 'data' && body !== undefined && body !== null && body !== '') {
        callback(body)
      }

      if (eventName === 'end') {
        callback()
      }
    },
  }
}

function createHandler(overrides = {}) {
  let currentTime = 1000
  const nowMs = vi.fn(() => {
    currentTime += 5
    return currentTime
  })

  return createRetryAdviceHandler({
    getRefinementModel: () => 'test-refinement-model',
    logSearchFlowEvent: vi.fn(),
    nowMs,
    reportBackendError: vi.fn(),
    rateLimitConfig: { maxRequests: 15, windowMs: 10_000 },
    bodyLimitBytes: 1024,
    maxNoteLength: 20,
    maxRejectionFeedbackLength: 30,
    maxShortlistItems: 2,
    maxShortlistTitleLength: 12,
    rateLimitWaitMessage: 'Please wait about 10 seconds and try again.',
    ...overrides,
  })
}

describe('retry advice handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchDataMocks.getEnv.mockImplementation((name) => (name === 'OPENAI_API_KEY' ? 'openai-key' : ''))
    rateLimitMocks.takeRateLimitToken.mockResolvedValue({ allowed: true })
    retryAdviceMocks.generateRetryAdvice.mockResolvedValue({
      recommendation: 'new_search',
      suggestedQuery: 'compact travel stroller',
      rationale: 'A narrower search should better match daily city travel.',
      usage: { totalTokens: 42 },
    })
  })

  it('sanitizes request context before generating retry advice', async () => {
    const logSearchFlowEvent = vi.fn()
    const handler = createHandler({ logSearchFlowEvent })
    const response = createResponseRecorder()

    await handler(
      createJsonRequest(
        JSON.stringify({
          query: '  travel   stroller  ',
          followUpNotes: ` ${'note '.repeat(10)} `,
          rejectionFeedback: ` ${'too bulky '.repeat(8)} `,
          shortlist: [
            { title: '  Full size stroller  ' },
            { title: 'Compact stroller' },
            { title: 'Dropped stroller' },
          ],
        }),
        { 'x-forwarded-for': '203.0.113.10' },
      ),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      recommendation: 'new_search',
      suggestedQuery: 'compact travel stroller',
      rationale: 'A narrower search should better match daily city travel.',
      query: 'travel stroller',
    })
    expect(response.headers['Server-Timing']).toContain('openai;dur=')
    expect(rateLimitMocks.takeRateLimitToken).toHaveBeenCalledWith(
      '203.0.113.10',
      { maxRequests: 15, windowMs: 10_000 },
    )
    expect(retryAdviceMocks.generateRetryAdvice).toHaveBeenCalledWith({
      productQuery: 'travel stroller',
      followUpNotes: 'note note note note ',
      rejectionFeedback: 'too bulky too bulky too bulky ',
      shortlist: [
        { title: 'Full size st' },
        { title: 'Compact stro' },
      ],
      apiKey: 'openai-key',
      model: 'test-refinement-model',
    })
    expect(logSearchFlowEvent).toHaveBeenCalledWith(
      'retry_advice_completed',
      expect.objectContaining({
        query: 'travel stroller',
        recommendation: 'new_search',
        suggestedQueryLength: 'compact travel stroller'.length,
      }),
    )
  })

  it('rejects empty rejection feedback before calling OpenAI', async () => {
    const handler = createHandler()
    const response = createResponseRecorder()

    await handler(
      createJsonRequest(JSON.stringify({
        query: 'travel stroller',
        rejectionFeedback: '   ',
      })),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Tell us what felt off before trying again.',
    })
    expect(retryAdviceMocks.generateRetryAdvice).not.toHaveBeenCalled()
  })

  it('reports OpenAI failures with route context', async () => {
    const reportBackendError = vi.fn()
    const handler = createHandler({ reportBackendError })
    const response = createResponseRecorder()
    const error = new Error('OpenAI retry_advice failed: bad gateway')
    retryAdviceMocks.generateRetryAdvice.mockRejectedValue(error)

    await handler(
      createJsonRequest(JSON.stringify({
        query: 'travel stroller',
        rejectionFeedback: 'too bulky',
      })),
      response,
    )

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Unable to suggest a better search direction.',
      details: 'OpenAI retry_advice failed: bad gateway',
    })
    expect(reportBackendError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        query: 'travel stroller',
        route: '/api/search/retry-advice',
        source: 'retry_advice',
      }),
    )
  })
})
