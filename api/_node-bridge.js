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

function createJsonErrorResponse(error) {
  const payload = {
    error: 'Internal server error.',
  }

  if (process.env.NODE_ENV !== 'production' && error instanceof Error && error.message) {
    payload.details = error.message
  }

  return new Response(JSON.stringify(payload), {
    status: 500,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

export async function runGetRoute(request, handler, { includeRequest = false } = {}) {
  const response = createResponseRecorder()
  const requestUrl = new URL(request.url)

  try {
    if (includeRequest) {
      await handler(requestUrl, response, request)
    } else {
      await handler(requestUrl, response)
    }
  } catch (error) {
    return createJsonErrorResponse(error)
  }

  if (!response.ended) {
    return createJsonErrorResponse(new Error('Route handler completed without sending a response.'))
  }

  return toWebResponse(response)
}

export async function runPostRoute(request, handler) {
  const response = createResponseRecorder()
  const rawBody = await request.text()

  try {
    await handler(buildNodeLikeRequest(request, rawBody), response)
  } catch (error) {
    return createJsonErrorResponse(error)
  }

  if (!response.ended) {
    return createJsonErrorResponse(new Error('Route handler completed without sending a response.'))
  }

  return toWebResponse(response)
}
