import {
  handleLiveSearch,
  isLegacyRouteExplicitlyEnabled,
  sendLegacyRouteOptInRequired,
} from '../backend/server.js'
import { createResponseRecorder } from './_response-recorder.js'

export async function GET(request) {
  const requestUrl = new URL(request.url)

  if (!isLegacyRouteExplicitlyEnabled(requestUrl)) {
    const response = createResponseRecorder()
    sendLegacyRouteOptInRequired(response)

    return new Response(response.body, {
      status: response.statusCode,
      headers: response.headers,
    })
  }

  const response = createResponseRecorder()

  await handleLiveSearch(requestUrl, response, request)

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
