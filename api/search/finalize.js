import { handleFinalizeSelection } from '../../backend/server.js'
import { createResponseRecorder } from '../_response-recorder.js'

function createNodeLikeRequest(request, rawBody) {
  return {
    headers: Object.fromEntries(request.headers.entries()),
    on(eventName, callback) {
      if (eventName === 'data') {
        if (rawBody) {
          callback(rawBody)
        }
      }

      if (eventName === 'end') {
        callback()
      }
    },
  }
}

export async function POST(request) {
  const response = createResponseRecorder()
  const rawBody = await request.text()

  await handleFinalizeSelection(createNodeLikeRequest(request, rawBody), response)

  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  })
}
