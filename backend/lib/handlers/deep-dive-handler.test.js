import { afterEach, describe, expect, it } from 'vitest'

import { handleDeepDive } from './deep-dive-handler.js'

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

function createJsonRequest(body = '', headers = {}) {
  return {
    headers,
    on(eventName, callback) {
      if (eventName === 'data' && body) {
        callback(body)
      }
      if (eventName === 'end') {
        callback()
      }
    },
  }
}

describe('deep dive handler', () => {
  afterEach(() => {
    delete process.env.DEEP_DIVE_ENABLED
  })

  it('short-circuits when the feature flag is disabled', async () => {
    process.env.DEEP_DIVE_ENABLED = 'false'
    const response = createResponseRecorder()

    await handleDeepDive(createJsonRequest(), response)

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      status: 'unavailable',
      error: 'Price comparison is not enabled yet.',
    })
  })

  it('requires a bearer token when enabled', async () => {
    process.env.DEEP_DIVE_ENABLED = 'true'
    const response = createResponseRecorder()

    await handleDeepDive(createJsonRequest(), response)

    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body)).toEqual({
      status: 'gated',
      error: 'Sign in to compare prices.',
    })
  })
})
