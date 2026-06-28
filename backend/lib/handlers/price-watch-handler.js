import { runPriceWatchCheck } from '../../jobs/check-price-watches.js'
import { sendJson } from '../http.js'
import { getEnv } from '../search-data.js'

let priceWatchRunInProgress = false

function getAuthorizationToken(request) {
  const authorization = request?.headers?.authorization || request?.headers?.Authorization || ''
  const match = String(authorization).match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function isAuthorizedInternalRequest(request, expectedToken) {
  if (!expectedToken) {
    return false
  }

  return getAuthorizationToken(request) === expectedToken
}

function publicSummary(summary = {}) {
  return {
    checkedAt: summary.checkedAt || '',
    checkedWatches: Number(summary.checkedWatches || 0),
    emailEnabled: Boolean(summary.emailEnabled),
    emailsFailed: Number(summary.emailsFailed || 0),
    emailsSent: Number(summary.emailsSent || 0),
    skippedWatches: Number(summary.skippedWatches || 0),
    wouldNotifyCount: Array.isArray(summary.wouldNotify) ? summary.wouldNotify.length : 0,
  }
}

export function createInternalPriceWatchHandler({
  getToken = () => getEnv('PRICE_WATCH_INTERNAL_TOKEN'),
  logger = console,
  runJob = runPriceWatchCheck,
} = {}) {
  return async function handleInternalPriceWatchCheck(request, response) {
    const expectedToken = getToken()

    if (!isAuthorizedInternalRequest(request, expectedToken)) {
      sendJson(response, 401, { error: 'Unauthorized.' })
      return
    }

    if (priceWatchRunInProgress) {
      sendJson(response, 409, { error: 'Price Watch check is already running.' })
      return
    }

    priceWatchRunInProgress = true

    try {
      const summary = await runJob()
      sendJson(response, 202, {
        ok: true,
        summary: publicSummary(summary),
      })
    } catch (error) {
      logger.error('[price-watch] internal check failed', error)
      sendJson(response, 500, {
        error: 'Unable to run Price Watch check.',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      priceWatchRunInProgress = false
    }
  }
}
