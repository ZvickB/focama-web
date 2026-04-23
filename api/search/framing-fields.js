import { handleQueryFramingFields } from '../../backend/server.js'
import { runGetRoute } from '../_node-bridge.js'

export async function GET(request) {
  return runGetRoute(request, handleQueryFramingFields, { includeRequest: true })
}
