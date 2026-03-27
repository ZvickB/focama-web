import { handleSupabaseHealth } from '../../backend/server.js'
import { createResponseRecorder } from '../_response-recorder.js'

function toWebResponse(response) {
  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  })
}

export async function GET() {
  const response = createResponseRecorder()

  await handleSupabaseHealth(response)

  return toWebResponse(response)
}
