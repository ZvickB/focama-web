import express from 'express'
import helmet from 'helmet'
import multer from 'multer'
import { attachCorsOrigin, buildInternalErrorPayload, resolveCorsOrigin, sendJson } from './lib/http.js'
import { initObservability, registerProcessErrorHandlers, reportBackendError } from './lib/observability.js'
import {
  handleAnalyticsDashboard,
  handleAccountDeletion,
  handleAnalyticsTrack,
  handleCachedSearch,
  handleCachePoolInspect,
  handleConnectivityDiagnostic,
  handleDeepDive,
  handleEnrichmentPoll,
  handleEnrichmentStream,
  handleFeedbackSubmission,
  handleFinalizeSelection,
  handleFinalizeHistory,
  handleHealth,
  handleInternalPriceWatchCheck,
  handleProductDetails,
  handleQueryQualityPoll,
  handleRainforestDiscoverySearch,
  handleRefinementPrompt,
  handleRetryAdvice,
  handleSearchDebug,
  handleSearchDiagnosticEvent,
  handleSupabaseHealth,
} from './server.js'

const PORT = Number(process.env.PORT || 8787)

initObservability()
registerProcessErrorHandlers()

const app = express()
app.use(helmet())

// CORS preflight — must come before routes
app.use((req, res, next) => {
  attachCorsOrigin(res, req.headers.origin)

  if (req.method === 'OPTIONS') {
    res.set({
      'Access-Control-Allow-Origin': resolveCorsOrigin(req.headers.origin),
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      Vary: 'Origin',
    })
    res.sendStatus(204)
    return
  }
  next()
})

// Build a URL object the same way the native server does
function getRequestUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers.host || 'localhost'
  return new URL(req.url, `${proto}://${host}`)
}

// Prewarm ping — wakes the Render dyno before the first real request
app.get('/api/ping', (req, res) => {
  res.set('Access-Control-Allow-Origin', resolveCorsOrigin(req.headers.origin))
  res.json({ ok: true })
})

// Search routes
app.get('/api/search/rainforest-discover', async (req, res) => {
  await handleRainforestDiscoverySearch(getRequestUrl(req), res, req)
})

app.get('/api/search/refine', async (req, res) => {
  await handleRefinementPrompt(getRequestUrl(req), res, req)
})


app.get('/api/search/debug', async (req, res) => {
  await handleSearchDebug(getRequestUrl(req), res)
})

app.get('/api/search/cache', async (req, res) => {
  await handleCachedSearch(getRequestUrl(req), res)
})

app.get('/api/search/product-details', async (req, res) => {
  await handleProductDetails(getRequestUrl(req), res)
})

// handleEnrichmentPoll takes (request, response) and constructs its own URL internally
app.get('/api/search/enrichment', async (req, res) => {
  await handleEnrichmentPoll(req, res)
})

app.get('/api/search/query-quality', async (req, res) => {
  await handleQueryQualityPoll(req, res)
})

app.get('/api/search/enrichment-stream', async (req, res) => {
  await handleEnrichmentStream(req, res)
})

app.post('/api/search/retry-advice', async (req, res) => {
  await handleRetryAdvice(req, res)
})

app.post('/api/search/finalize', async (req, res) => {
  await handleFinalizeSelection(req, res)
})

app.post('/api/product/deep-dive', async (req, res) => {
  await handleDeepDive(req, res)
})

// Analytics
app.post('/api/analytics/track', async (req, res) => {
  await handleAnalyticsTrack(req, res)
})

app.get('/api/analytics/dashboard', async (req, res) => {
  await handleAnalyticsDashboard(req, res)
})

app.get('/api/analytics/cache-pool', async (req, res) => {
  await handleCachePoolInspect(req, res)
})

app.get('/api/analytics/finalize-history', async (req, res) => {
  handleFinalizeHistory(req, res)
})

app.post('/api/search/diagnostics/event', async (req, res) => {
  await handleSearchDiagnosticEvent(req, res)
})

app.post('/api/feedback', async (req, res) => {
  await handleFeedbackSubmission(req, res)
})

app.post('/api/internal/check-price-watches', async (req, res) => {
  await handleInternalPriceWatchCheck(req, res)
})

app.delete('/api/account', async (req, res) => {
  await handleAccountDeletion(req, res)
})

// Voice transcription
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

app.post('/api/transcribe', audioUpload.single('audio'), async (req, res) => {
  attachCorsOrigin(res, req.headers.origin)

  if (!req.file) {
    res.status(400).json({ error: 'No audio file received.' })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Transcription not configured.' })
    return
  }

  try {
    const formData = new FormData()
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/m4a' })
    formData.append('file', blob, req.file.originalname || 'recording.m4a')
    formData.append('model', 'whisper-1')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!whisperRes.ok) {
      const errorBody = await whisperRes.text()
      console.error('[transcribe] Whisper API error', { status: whisperRes.status, body: errorBody.slice(0, 200) })
      res.status(502).json({ error: 'Transcription failed.' })
      return
    }

    const { text } = await whisperRes.json()
    res.json({ text: text?.trim() ?? '' })
  } catch (error) {
    reportBackendError(error, { method: 'POST', route: '/api/transcribe', source: 'express_server' })
    res.status(500).json({ error: 'Transcription failed.' })
  }
})

// Health
app.get('/api/health/supabase', async (req, res) => {
  await handleSupabaseHealth(res)
})

app.get('/api/health', (req, res) => {
  handleHealth(res)
})

app.get('/api/diagnostics/connectivity', (req, res) => {
  handleConnectivityDiagnostic(res)
})

app.use((error, req, res, next) => {
  reportBackendError(error, {
    method: req.method,
    route: req.path,
    source: 'express_server',
  })

  if (res.headersSent) {
    next(error)
    return
  }

  attachCorsOrigin(res, req.headers.origin)
  sendJson(res, 500, buildInternalErrorPayload('Something went wrong on the server.', error))
})

app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`)
})
