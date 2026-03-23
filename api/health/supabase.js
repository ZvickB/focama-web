import { handleSupabaseHealth } from '../../backend/server.js'
import { createResponseRecorder } from '../_response-recorder.js'

export async function GET() {
  const response = createResponseRecorder()

  await handleSupabaseHealth(response)

  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  })
}
