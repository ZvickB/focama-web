import { handleLiveSearch } from '../backend/server.js'

function createResponseRecorder() {
  return {
    body: '',
    headers: {},
    statusCode: 200,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = headers
    },
    end(body = '') {
      this.body = body
    },
  }
}

export async function GET(request) {
  const response = createResponseRecorder()

  await handleLiveSearch(new URL(request.url), response)

  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  })
}
