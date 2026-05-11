import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

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
      this.body = body
    },
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.resetModules()
})

describe('http helpers', () => {
  it('reflects the matched allowed origin for multi-origin production responses', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOWED_ORIGIN = 'https://focamai.com,https://www.focamai.com'

    const { attachCorsOrigin, sendJson } = await import('./http.js')
    const response = createResponseRecorder()

    attachCorsOrigin(response, 'https://www.focamai.com')
    sendJson(response, 200, { ok: true })

    expect(response.statusCode).toBe(200)
    expect(response.headers['Access-Control-Allow-Origin']).toBe('https://www.focamai.com')
    expect(response.headers.Vary).toBe('Origin')
    expect(JSON.parse(response.body)).toEqual({ ok: true })
  })

  it('omits internal error details from production 500 payloads', async () => {
    process.env.NODE_ENV = 'production'

    const { buildInternalErrorPayload } = await import('./http.js')

    expect(buildInternalErrorPayload('Unable to finalize the product selection.', new Error('provider timeout'))).toEqual({
      error: 'Unable to finalize the product selection.',
    })
  })

  it('keeps internal error details outside production', async () => {
    process.env.NODE_ENV = 'test'

    const { buildInternalErrorPayload } = await import('./http.js')

    expect(buildInternalErrorPayload('Unable to finalize the product selection.', new Error('provider timeout'))).toEqual({
      error: 'Unable to finalize the product selection.',
      details: 'provider timeout',
    })
  })
})
