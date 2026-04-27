import express from 'express'
import { getEnv } from './lib/search-data.js'
import {
  handleAnalyticsTrack,
  handleCachedSearch,
  handleDiscoverySearch,
  handleEnrichmentPoll,
  handleFinalizeSelection,
  handleLiveSearch,
  handleNanoMiniSplitFinalize,
  handleQueryFramingFields,
  handleRainforestDiscoverySearch,
  handleRefinementPrompt,
  handleRetryAdvice,
  handleSearchDebug,
  handleSupabaseHealth,
} from './server.js'

const PORT = Number(process.env.PORT || 8787)
const ALLOWED_ORIGIN =
  getEnv('ALLOWED_ORIGIN') ||
  (process.env.NODE_ENV === 'production' ? 'https://focama.vercel.app' : 'http://localhost:5173')

const app = express()

// CORS preflight — must come before routes
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.set({
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
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
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.json({ ok: true })
})

// Search routes
app.get('/api/search/discover', async (req, res) => {
  await handleDiscoverySearch(getRequestUrl(req), res, req)
})

app.get('/api/search/rainforest-discover', async (req, res) => {
  await handleRainforestDiscoverySearch(getRequestUrl(req), res, req)
})

app.get('/api/search/refine', async (req, res) => {
  await handleRefinementPrompt(getRequestUrl(req), res)
})

app.get('/api/search/framing-fields', async (req, res) => {
  await handleQueryFramingFields(getRequestUrl(req), res, req)
})

app.get('/api/search/debug', async (req, res) => {
  await handleSearchDebug(getRequestUrl(req), res)
})

app.get('/api/search/live', async (req, res) => {
  await handleLiveSearch(getRequestUrl(req), res, req)
})

app.get('/api/search/cache', async (req, res) => {
  await handleCachedSearch(getRequestUrl(req), res)
})

// handleEnrichmentPoll takes (request, response) and constructs its own URL internally
app.get('/api/search/enrichment', async (req, res) => {
  await handleEnrichmentPoll(req, res)
})

app.post('/api/search/retry-advice', async (req, res) => {
  await handleRetryAdvice(req, res)
})

app.post('/api/search/finalize', async (req, res) => {
  await handleFinalizeSelection(req, res)
})

app.post('/api/search/finalize-nano-mini-split', async (req, res) => {
  await handleNanoMiniSplitFinalize(req, res)
})

// Analytics
app.post('/api/analytics/track', async (req, res) => {
  await handleAnalyticsTrack(req, res)
})

// Health
app.get('/api/health/supabase', async (req, res) => {
  await handleSupabaseHealth(res)
})

app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`)
})
