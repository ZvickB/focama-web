import { createResponseRecorder } from './_response-recorder.js'

function buildNodeLikeRequest(request, rawBody = '') {
  return {
    headers: Object.fromEntries(request.headers.entries()),
    on(eventName, callback) {
      if (eventName === 'data' && rawBody) {
        callback(rawBody)
      }

      if (eventName === 'end') {
        callback()
      }
    },
  }
}

function toWebResponse(response) {
  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  })
}

export async function runGetRoute(request, handler, { includeRequest = false } = {}) {
  const response = createResponseRecorder()
  const requestUrl = new URL(request.url)

  if (includeRequest) {
    await handler(requestUrl, response, request)
  } else {
    await handler(requestUrl, response)
  }

  return toWebResponse(response)
}

export async function runPostRoute(request, handler) {
  const response = createResponseRecorder()
  const rawBody = await request.text()

  await handler(buildNodeLikeRequest(request, rawBody), response)

  return toWebResponse(response)
}
