import { getEnv } from './search-data.js'

const DEFAULT_ALLOWED_ORIGINS =
  process.env.NODE_ENV === 'production'
    ? ['https://focamai.com', 'https://www.focamai.com', 'https://focama.vercel.app']
    : ['http://localhost:5173']

function parseAllowedOrigins(value) {
  if (typeof value !== 'string') {
    return []
  }

  return value
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export const ALLOWED_ORIGINS = (() => {
  const configuredOrigins = parseAllowedOrigins(getEnv('ALLOWED_ORIGIN'))
  return Array.from(new Set([...configuredOrigins, ...DEFAULT_ALLOWED_ORIGINS]))
})()

export const ALLOWED_ORIGIN = ALLOWED_ORIGINS.length === 1 ? ALLOWED_ORIGINS[0] : '*'

export function resolveCorsOrigin(requestOrigin = '') {
  const normalizedOrigin =
    typeof requestOrigin === 'string' ? requestOrigin.trim().replace(/\/+$/, '') : ''

  if (ALLOWED_ORIGINS.includes('*')) {
    return '*'
  }

  if (normalizedOrigin && ALLOWED_ORIGINS.includes(normalizedOrigin)) {
    return normalizedOrigin
  }

  return ALLOWED_ORIGIN
}

export function attachCorsOrigin(response, requestOrigin = '') {
  if (response && typeof response === 'object') {
    response.__focamaiRequestOrigin = requestOrigin
  }
}

export function buildInternalErrorPayload(message, error) {
  const payload = { error: message }

  if (process.env.NODE_ENV !== 'production') {
    payload.details = error instanceof Error ? error.message : 'Unknown error'
  }

  return payload
}

function roundTimingDuration(value) {
  return Math.round(value * 10) / 10
}

function formatServerTiming(metrics = []) {
  return metrics
    .filter((metric) => metric && metric.name && Number.isFinite(metric.duration))
    .map((metric) => `${metric.name};dur=${roundTimingDuration(metric.duration)}`)
    .join(', ')
}

export function sendJson(response, statusCode, payload, headers = {}) {
  const serverTiming = formatServerTiming(headers.serverTiming)
  const requestOrigin =
    typeof headers.requestOrigin === 'string'
      ? headers.requestOrigin
      : response?.__focamaiRequestOrigin || ''
  const responseHeaders = {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': resolveCorsOrigin(requestOrigin),
    Vary: 'Origin',
  }

  delete responseHeaders.requestOrigin
  delete responseHeaders.serverTiming

  if (serverTiming) {
    responseHeaders['Server-Timing'] = serverTiming
  }

  response.writeHead(statusCode, responseHeaders)
  response.end(JSON.stringify(payload))
}

export function readRequestBody(request, { maxBytes = Infinity } = {}) {
  return new Promise((resolve, reject) => {
    let body = ''
    let byteLength = 0
    let aborted = false

    request.on('data', (chunk) => {
      if (aborted) {
        return
      }

      const chunkText = typeof chunk === 'string' ? chunk : String(chunk)
      byteLength += Buffer.byteLength(chunkText)

      if (byteLength > maxBytes) {
        aborted = true
        reject(new Error('Request body is too large.'))
        return
      }

      body += chunkText
    })

    request.on('end', () => {
      if (aborted) {
        return
      }

      resolve(body)
    })

    request.on('error', reject)
  })
}

export async function readJsonBody(request, options) {
  const rawBody = await readRequestBody(request, options)

  if (!rawBody.trim()) {
    return {}
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}
