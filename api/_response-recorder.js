export function createResponseRecorder() {
  return {
    body: '',
    ended: false,
    headers: {},
    statusCode: 200,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = headers
    },
    end(body = '') {
      this.ended = true
      this.body = body
    },
  }
}
