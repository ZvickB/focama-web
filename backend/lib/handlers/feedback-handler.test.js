import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageMocks = vi.hoisted(() => ({
  recordTesterFeedback: vi.fn(),
}))

vi.mock('../search-storage.js', () => storageMocks)

import { createFeedbackHandler } from './feedback-handler.js'

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

function createJsonRequest(body) {
  return {
    headers: {},
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
  return createFeedbackHandler({
    bodyLimitBytes: 1024,
    maxEmailLength: 40,
    maxFreeTextLength: 24,
    maxPageLength: 12,
    maxQueryLength: 18,
    maxSearchIdLength: 10,
    maxSelectedProductIdLength: 10,
    maxSessionIdLength: 10,
    maxStageLength: 12,
    ...overrides,
  })
}

describe('feedback handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMocks.recordTesterFeedback.mockResolvedValue(undefined)
  })

  it('stores sanitized tester feedback without going through the full server', async () => {
    const handler = createHandler()
    const response = createResponseRecorder()

    await handler(
      createJsonRequest(JSON.stringify({
        sessionId: ' session-123456 ',
        searchId: ' search-123456 ',
        page: '/search/results/extra',
        stageReached: 'finalized-with-extra',
        wasSimple: 'YES',
        foundWhatYouWanted: 'partly',
        enjoyedExperience: 'maybe',
        freeText: '  I liked it, but wanted clearer tradeoffs sooner.  ',
        email: ' TESTER@EXAMPLE.COM ',
        queryText: 'travel stroller with accessories',
        resultsSeen: true,
        finalized: true,
        selectedProductId: ' product-123456 ',
        metadata: {
          source: 'fab',
          nested: { value: 'stored as JSON' },
        },
      })),
      response,
    )

    expect(response.statusCode).toBe(202)
    expect(JSON.parse(response.body)).toEqual({ ok: true })
    expect(storageMocks.recordTesterFeedback).toHaveBeenCalledWith({
      email: 'tester@example.com',
      finalized: true,
      foundWhatYouWanted: 'partly',
      freeText: 'I liked it, but wanted c',
      enjoyedExperience: '',
      metadata: {
        source: 'fab',
        nested: '{"value":"stored as JSON"}',
      },
      page: '/search/resu',
      queryText: 'travel stroller wi',
      resultsSeen: true,
      searchId: 'search-123',
      selectedProductId: 'product-12',
      sessionId: 'session-12',
      stageReached: 'finalized-wi',
      wasSimple: 'yes',
    })
  })

  it('rejects invalid email before writing feedback', async () => {
    const handler = createHandler()
    const response = createResponseRecorder()

    await handler(
      createJsonRequest(JSON.stringify({
        wasSimple: 'yes',
        email: 'not an email',
      })),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Enter a valid email address or leave it blank.',
    })
    expect(storageMocks.recordTesterFeedback).not.toHaveBeenCalled()
  })

  it('rejects submissions with context but no actual feedback answer', async () => {
    const handler = createHandler()
    const response = createResponseRecorder()

    await handler(
      createJsonRequest(JSON.stringify({
        sessionId: 'session-1',
        searchId: 'search-1',
        page: '/',
        stageReached: 'home',
        metadata: { source: 'fab' },
      })),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Add at least one answer before sending feedback.',
    })
    expect(storageMocks.recordTesterFeedback).not.toHaveBeenCalled()
  })
})
