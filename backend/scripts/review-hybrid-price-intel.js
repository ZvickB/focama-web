import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sourcePath = resolve(process.cwd(), 'temp-data', 'price-intel-reviews', 'serper-live-review-2026-06-22.json')
const source = JSON.parse(readFileSync(sourcePath, 'utf8'))

process.env.HYBRID_PRICE_INTEL_MODE = 'shadow'
process.env.PRICE_INTEL_SURFACE_PERCENT = '0'
process.env.PRICE_INTEL_ALLOWED_DOMAINS_CA = process.env.PRICE_INTEL_ALLOWED_DOMAINS_CA ||
  'bestbuy.ca,walmart.ca,staples.ca,londondrugs.com,visions.ca'
process.env.PRICE_INTEL_ALLOWLIST_VERSION = process.env.PRICE_INTEL_ALLOWLIST_VERSION || 'live-review-1'
process.env.SERPAPI_PRICE_INTEL_DAILY_CALLS = process.env.SERPAPI_PRICE_INTEL_DAILY_CALLS || '32'
process.env.SERPAPI_PRICE_INTEL_CALLS_PER_MINUTE = '32'
process.env.RATE_LIMIT_STORAGE = 'memory'
process.env.PRICE_CHECK_THRESHOLD = '100'
process.env.PRICE_MATCH_MIN_SAVINGS = '8'
process.env.PRICE_MATCH_MIN_PERCENT = '0.08'
process.env.PRICE_MATCH_MAX_PERCENT = '0.60'
process.env.PRICE_MATCH_CONFIDENCE = '0.85'
process.env.SERPER_PRICE_INTEL_MAX_OFFERS = '3'

const { runHybridPriceIntelligence, resetHybridPriceIntelligenceState } = await import('../lib/price-comparison/serper-price-intelligence.js')

const results = []
for (const [index, run] of source.runs.entries()) {
  resetHybridPriceIntelligenceState()
  const candidateId = String(run?.source?.id || `review-${index + 1}`)
  const candidate = {
    id: candidateId,
    title: run?.source?.title || run?.query || '',
    numericPrice: Number(run?.source?.numericPrice),
    price: run?.source?.price || '',
    source: 'Amazon',
    link: run?.source?.url || '',
  }
  const enrichment = {
    candidate_id: candidateId,
    source_title: run?.source?.title || '',
    display_title: run?.source?.title || '',
    match_identifier: run?.identity || {},
  }
  const prefetch = {
    candidateId,
    candidate,
    market: 'CA',
    amazonDomain: 'amazon.ca',
    allowedDomains: process.env.PRICE_INTEL_ALLOWED_DOMAINS_CA.split(',').map((value) => value.trim()).filter(Boolean),
    promise: Promise.resolve({ ok: true, offers: Array.isArray(run?.rawOffers) ? run.rawOffers : [], cache: 'fixture' }),
  }

  const startedAt = Date.now()
  const outcome = await runHybridPriceIntelligence({
    prefetches: [prefetch],
    enrichmentEntries: [enrichment],
    discoveryToken: `hybrid-live-review-${index + 1}`,
  })
  results.push({
    query: run?.query || '',
    source: run?.source || {},
    verified: outcome.shadowResults,
    completed: outcome.completed,
    durationMs: Date.now() - startedAt,
  })
}

const report = {
  generatedAt: new Date().toISOString(),
  sourceReview: sourcePath,
  mode: 'shadow',
  marketplace: 'amazon.ca / CAD',
  summary: {
    completedQueries: results.filter((entry) => entry.completed).length,
    failedQueries: results.filter((entry) => !entry.completed).length,
    verifiedComparisons: results.reduce((count, entry) => count + entry.verified.length, 0),
  },
  results,
}

if (process.argv.includes('--write')) {
  const outputPath = resolve(process.cwd(), 'temp-data', 'price-intel-reviews', 'hybrid-live-review-latest.json')
  writeFileSync(outputPath, JSON.stringify(report, null, 2))
  console.log(`Wrote ${outputPath}`)
} else {
  console.log(JSON.stringify(report, null, 2))
}
