import { randomUUID } from 'node:crypto'

import { runPostRoute } from '../_node-bridge.js'

async function handleFinalizeProbe(request, response) {
  let rawBody = ''

  request.on('data', (chunk) => {
    rawBody += chunk
  })

  request.on('end', () => {
    let parsedBody = {}

    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      parsedBody = { invalidJson: true }
    }

    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'x-request-id': randomUUID(),
    })
    response.end(
      JSON.stringify({
        ok: true,
        echoedQuery: typeof parsedBody?.query === 'string' ? parsedBody.query : '',
        hasDiscoveryToken: Boolean(parsedBody?.discoveryToken),
        requestMode: typeof parsedBody?.requestMode === 'string' ? parsedBody.requestMode : '',
        route: '/api/search/finalize-probe',
      }),
    )
  })
}

export async function POST(request) {
  return runPostRoute(request, handleFinalizeProbe)
}
