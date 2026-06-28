import { describe, expect, it, vi } from 'vitest'

import { createInternalPriceWatchHandler } from './price-watch-handler.js'

function createResponseRecorder() {
  return {
    body: '',
    headers: {},
    statusCode: 0,
    end(body = '') {
      this.body += body
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode
      this.headers = {
        ...this.headers,
        ...headers,
      }
    },
  }
}

function createRequest(token = '') {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }
}

describe('createInternalPriceWatchHandler', () => {
  it('rejects requests without the internal bearer token', async () => {
    const runJob = vi.fn()
    const response = createResponseRecorder()
    const handler = createInternalPriceWatchHandler({
      getToken: () => 'secret-token',
      runJob,
    })

    await handler(createRequest(), response)

    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body)).toEqual({ error: 'Unauthorized.' })
    expect(runJob).not.toHaveBeenCalled()
  })

  it('runs the job and returns a public summary for authorized requests', async () => {
    const runJob = vi.fn(async () => ({
      checkedAt: '2026-06-26T12:00:00.000Z',
      checkedWatches: 3,
      emailEnabled: true,
      emailsFailed: 0,
      emailsSent: 1,
      skippedWatches: 1,
      wouldNotify: [{ id: 'watch-1' }, { id: 'watch-2' }],
    }))
    const response = createResponseRecorder()
    const handler = createInternalPriceWatchHandler({
      getToken: () => 'secret-token',
      runJob,
    })

    await handler(createRequest('secret-token'), response)

    expect(response.statusCode).toBe(202)
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      summary: {
        checkedAt: '2026-06-26T12:00:00.000Z',
        checkedWatches: 3,
        emailEnabled: true,
        emailsFailed: 0,
        emailsSent: 1,
        skippedWatches: 1,
        wouldNotifyCount: 2,
      },
    })
  })

  it('rejects overlapping authorized runs', async () => {
    let resolveRun
    const runJob = vi.fn(() => new Promise((resolve) => {
      resolveRun = resolve
    }))
    const handler = createInternalPriceWatchHandler({
      getToken: () => 'secret-token',
      runJob,
    })
    const firstResponse = createResponseRecorder()
    const secondResponse = createResponseRecorder()
    const firstRun = handler(createRequest('secret-token'), firstResponse)

    await handler(createRequest('secret-token'), secondResponse)
    resolveRun({
      checkedWatches: 0,
      wouldNotify: [],
    })
    await firstRun

    expect(secondResponse.statusCode).toBe(409)
    expect(JSON.parse(secondResponse.body)).toEqual({
      error: 'Price Watch check is already running.',
    })
  })
})
