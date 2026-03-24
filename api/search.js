import { handleLiveSearch } from '../backend/server.js'
import { createResponseRecorder } from './_response-recorder.js'

export async function GET(request) {
  const response = createResponseRecorder()

  await handleLiveSearch(new URL(request.url), response, request)

  response.headers = {
    ...response.headers,
    'X-Focama-Route-Status': 'legacy_combined_search',
    'X-Focama-Route-Recommended': '/api/search/discover -> /api/search/refine -> /api/search/finalize',
  }

  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  })
}
