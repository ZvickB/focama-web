import { handleDiscoverySearch } from '../../backend/server.js'
import { createResponseRecorder } from '../_response-recorder.js'

export async function GET(request) {
  const response = createResponseRecorder()

  await handleDiscoverySearch(new URL(request.url), response, request)

  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  })
}
