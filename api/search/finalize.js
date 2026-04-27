import { handleFinalizeSelection } from '../../backend/server.js'
import { runPostRoute } from '../_node-bridge.js'

export async function POST(request) {
  return runPostRoute(request, handleFinalizeSelection)
}
