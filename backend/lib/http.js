import { getEnv } from './search-data.js'

export const ALLOWED_ORIGIN =
  getEnv('ALLOWED_ORIGIN') ||
  (process.env.NODE_ENV === 'production' ? 'https://focama.vercel.app' : 'http://localhost:5173')

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
  const responseHeaders = {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    Vary: 'Origin',
  }

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
