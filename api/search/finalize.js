// TEMP STUB — restore after mobile endpoint test
// import { handleFinalizeSelection } from '../../backend/server.js'
// import { runPostRoute } from '../_node-bridge.js'

export async function POST(request) {
  return new Response(JSON.stringify({ message: 'tested' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
