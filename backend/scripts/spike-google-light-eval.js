/**
 * Spike: Google Light vs Serper Shopping vs SerpApi Google Shopping
 *
 * Research-only script — no production changes.
 * Runs the same product queries through three sources and compares:
 *   1. Serper Shopping (current discovery layer)
 *   2. SerpApi Google Shopping (current verification layer)
 *   3. SerpApi Google Light (candidate under evaluation)
 *
 * Measures: latency, result count, URL quality, retailer coverage,
 * structured data availability, direct-link frequency.
 *
 * Usage: node backend/scripts/spike-google-light-eval.js
 */

import { resolve } from 'node:path'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'

// ── env bootstrap ──
const ENV_PATH = resolve(process.cwd(), '.env')
import { readFileSync } from 'node:fs'
try {
  const envContents = readFileSync(ENV_PATH, 'utf8')
  envContents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const sep = trimmed.indexOf('=')
    if (sep === -1) return
    const key = trimmed.slice(0, sep).trim()
    const val = trimmed.slice(sep + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  })
} catch { /* no .env is fine */ }

const SERPAPI_KEY = process.env.SERPAPI_API_KEY
const SERPER_KEY = process.env.SERPER_API_KEY

if (!SERPAPI_KEY) { console.error('Missing SERPAPI_API_KEY'); process.exit(1) }
if (!SERPER_KEY) { console.error('Missing SERPER_API_KEY'); process.exit(1) }

// ── test products ──
// 8 CA products from live review + 12 US products for breadth
const TEST_PRODUCTS = [
  // Canadian (from 2026-06-22 live review)
  { query: 'Apple AirPods 4 with Active Noise Cancellation', market: 'CA', price: 209, asin: 'B0DGJJKWW7' },
  { query: 'Sony WH-1000XM5 headphones black', market: 'CA', price: 298, asin: 'B09XS7JWHH' },
  { query: 'Nintendo Switch OLED white', market: 'CA', price: 489, asin: 'B098RKWHHZ' },
  { query: 'Dyson V8 cordless vacuum', market: 'CA', price: 599.99, asin: 'B0CT9552BL' },
  { query: 'Ninja AF101 air fryer 4 quart', market: 'CA', price: 129.29, asin: 'B07FDJMC9Q' },
  { query: 'Samsung T7 Shield 1TB black', market: 'CA', price: 389.98, asin: 'B09VLK9W3S' },
  { query: 'Logitech MX Keys S keyboard', market: 'CA', price: 169.99, asin: 'B0BKW3LB2B' },
  { query: 'Bose QuietComfort headphones black', market: 'CA', price: 479, asin: 'B0CCZ26B5V' },
  // US products for breadth
  { query: 'Apple AirPods Pro 2nd generation', market: 'US', price: 249, asin: 'B0D1XD1ZV3' },
  { query: 'Samsung Galaxy S24 Ultra 256GB', market: 'US', price: 1299.99, asin: 'B0CMDL6GFC' },
  { query: 'Sony PlayStation 5 Slim', market: 'US', price: 449.99, asin: 'B0CL61F39H' },
  { query: 'Dyson V15 Detect cordless vacuum', market: 'US', price: 749.99, asin: 'B0CX3FJKX1' },
  { query: 'KitchenAid Artisan stand mixer 5 quart', market: 'US', price: 449.99, asin: 'B00005UP2P' },
  { query: 'LG C4 65 inch OLED TV', market: 'US', price: 1796.99, asin: 'B0CVS1JG8V' },
  { query: 'Bose QuietComfort Ultra earbuds', market: 'US', price: 299, asin: 'B0CD2FSRDD' },
  { query: 'iRobot Roomba j7+', market: 'US', price: 599.99, asin: 'B0B55DBS2P' },
  { query: 'Canon EOS R6 Mark II body', market: 'US', price: 2499, asin: 'B0BMN4GFCP' },
  { query: 'Vitamix E310 Explorian blender', market: 'US', price: 349.95, asin: 'B0758JHZM3' },
  { query: 'Herman Miller Aeron chair size B', market: 'US', price: 1395, asin: 'B01N0ZSG5O' },
  { query: 'Breville Barista Express espresso machine', market: 'US', price: 749.95, asin: 'B00CH9QWOU' },
]

// ── API callers ──

async function fetchSerperShopping(query, market) {
  const start = Date.now()
  const res = await fetch('https://google.serper.dev/shopping', {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: market.toLowerCase(), hl: 'en', num: 20 }),
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json()
  const latencyMs = Date.now() - start
  const results = Array.isArray(data?.shopping) ? data.shopping : []
  return { engine: 'serper_shopping', latencyMs, raw: data, results: results.map(normalizeSerperResult) }
}

function normalizeSerperResult(r) {
  return {
    title: r?.title || '',
    price: parsePrice(r?.price),
    retailer: r?.source || '',
    url: r?.link || '',
    productId: r?.productId || null,
    position: r?.position ?? null,
  }
}

async function fetchSerpApiShopping(query, market) {
  const start = Date.now()
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google_shopping')
  url.searchParams.set('q', query)
  url.searchParams.set('gl', market.toLowerCase())
  url.searchParams.set('hl', 'en')
  url.searchParams.set('api_key', SERPAPI_KEY)
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  const data = await res.json()
  const latencyMs = Date.now() - start
  const results = Array.isArray(data?.shopping_results) ? data.shopping_results : []
  return { engine: 'serpapi_shopping', latencyMs, raw: data, results: results.map(normalizeSerpApiShoppingResult) }
}

function normalizeSerpApiShoppingResult(r) {
  return {
    title: r?.title || '',
    price: r?.extracted_price ?? parsePrice(r?.price),
    retailer: r?.source || '',
    url: r?.link || r?.product_link || '',
    productId: r?.product_id || null,
    position: r?.position ?? null,
    immersiveUrl: r?.serpapi_immersive_product_api || null,
  }
}

async function fetchGoogleLight(query, market) {
  const start = Date.now()
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google_light')
  url.searchParams.set('q', query)
  url.searchParams.set('gl', market.toLowerCase())
  url.searchParams.set('hl', 'en')
  url.searchParams.set('api_key', SERPAPI_KEY)
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  const data = await res.json()
  const latencyMs = Date.now() - start
  const organicResults = Array.isArray(data?.organic_results) ? data.organic_results : []
  // Also capture any shopping results if they exist (unlikely but let's see)
  const shoppingResults = Array.isArray(data?.shopping_results) ? data.shopping_results : []
  const inlineShop = Array.isArray(data?.inline_shopping) ? data.inline_shopping : []
  return {
    engine: 'google_light',
    latencyMs,
    raw: data,
    organicResults: organicResults.map(normalizeGoogleLightOrganic),
    shoppingResults: shoppingResults.length,
    inlineShoppingResults: inlineShop.length,
    hasShoppingData: shoppingResults.length > 0 || inlineShop.length > 0,
    responseKeys: Object.keys(data || {}),
  }
}

function normalizeGoogleLightOrganic(r) {
  return {
    title: r?.title || '',
    url: r?.link || '',
    displayedLink: r?.displayed_link || '',
    snippet: r?.snippet || '',
    position: r?.position ?? null,
  }
}

function parsePrice(raw) {
  if (typeof raw === 'number') return raw
  const text = String(raw || '').replace(/,/g, '')
  const match = text.match(/[0-9]+(?:\.[0-9]+)?/)
  return match ? Number(match[0]) : null
}

// ── URL analysis helpers ──

function classifyUrl(url) {
  if (!url) return 'missing'
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host.includes('google.com') || host.includes('google.ca')) return 'google_redirect'
    if (host.includes('amazon.')) return 'amazon'
    if (host.includes('ebay.')) return 'ebay'
    if (host.includes('walmart.')) return 'walmart'
    if (host.includes('bestbuy.')) return 'bestbuy'
    if (host.includes('costco.')) return 'costco'
    if (host.includes('target.')) return 'target'
    if (host.includes('newegg.')) return 'newegg'
    return 'other_direct'
  } catch {
    return 'invalid'
  }
}

function extractDomain(url) {
  try { return new URL(url).hostname.toLowerCase() } catch { return '' }
}

const KNOWN_RETAILERS = [
  'walmart', 'bestbuy', 'costco', 'target', 'newegg', 'staples',
  'londondrugs', 'thesource', 'canadacomputers', 'memoryexpress',
  'bhphotovideo', 'adorama', 'macys', 'nordstrom', 'homedepot', 'lowes',
]

function isKnownRetailerUrl(url) {
  const domain = extractDomain(url)
  return KNOWN_RETAILERS.some((r) => domain.includes(r))
}

// ── Main ──

async function runSpike() {
  console.log(`\n=== Google Light Evaluation Spike ===`)
  console.log(`Products: ${TEST_PRODUCTS.length} (${TEST_PRODUCTS.filter(p => p.market === 'CA').length} CA, ${TEST_PRODUCTS.filter(p => p.market === 'US').length} US)`)
  console.log(`SerpApi key: ${SERPAPI_KEY ? 'present' : 'MISSING'}`)
  console.log(`Serper key: ${SERPER_KEY ? 'present' : 'MISSING'}\n`)

  const results = []
  let serpApiCallCount = 0

  for (let i = 0; i < TEST_PRODUCTS.length; i++) {
    const product = TEST_PRODUCTS[i]
    console.log(`[${i + 1}/${TEST_PRODUCTS.length}] ${product.query} (${product.market}) — $${product.price}`)

    const entry = { product, serper: null, serpApiShopping: null, googleLight: null, errors: [] }

    // Run all three in parallel
    const [serperResult, serpApiResult, lightResult] = await Promise.allSettled([
      fetchSerperShopping(product.query, product.market),
      fetchSerpApiShopping(product.query, product.market),
      fetchGoogleLight(product.query, product.market),
    ])

    if (serperResult.status === 'fulfilled') {
      entry.serper = serperResult.value
      console.log(`  Serper:         ${entry.serper.results.length} results, ${entry.serper.latencyMs}ms`)
    } else {
      entry.errors.push({ engine: 'serper', error: serperResult.reason?.message || 'unknown' })
      console.log(`  Serper:         ERROR — ${serperResult.reason?.message}`)
    }

    if (serpApiResult.status === 'fulfilled') {
      entry.serpApiShopping = serpApiResult.value
      serpApiCallCount++
      console.log(`  SerpApi Shop:   ${entry.serpApiShopping.results.length} results, ${entry.serpApiShopping.latencyMs}ms`)
    } else {
      entry.errors.push({ engine: 'serpapi_shopping', error: serpApiResult.reason?.message || 'unknown' })
      console.log(`  SerpApi Shop:   ERROR — ${serpApiResult.reason?.message}`)
    }

    if (lightResult.status === 'fulfilled') {
      entry.googleLight = lightResult.value
      serpApiCallCount++
      console.log(`  Google Light:   ${entry.googleLight.organicResults.length} organic, shop:${entry.googleLight.shoppingResults} inline:${entry.googleLight.inlineShoppingResults}, ${entry.googleLight.latencyMs}ms`)
      console.log(`    Response keys: [${entry.googleLight.responseKeys.join(', ')}]`)
    } else {
      entry.errors.push({ engine: 'google_light', error: lightResult.reason?.message || 'unknown' })
      console.log(`  Google Light:   ERROR — ${lightResult.reason?.message}`)
    }

    results.push(entry)

    // Brief pause between products to be polite
    if (i < TEST_PRODUCTS.length - 1) {
      await new Promise((r) => setTimeout(r, 800))
    }
  }

  // ── Analysis ──
  console.log(`\n\n${'='.repeat(60)}`)
  console.log(`ANALYSIS`)
  console.log(`${'='.repeat(60)}\n`)

  const analysis = analyzeResults(results)
  printAnalysis(analysis)

  // ── Save raw results ──
  const outputDir = resolve(process.cwd(), 'temp-data', 'price-intel-reviews')
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  // Strip raw responses for the summary (they're huge)
  const summaryResults = results.map((entry) => ({
    product: entry.product,
    errors: entry.errors,
    serper: entry.serper ? {
      engine: entry.serper.engine,
      latencyMs: entry.serper.latencyMs,
      resultCount: entry.serper.results.length,
      results: entry.serper.results,
    } : null,
    serpApiShopping: entry.serpApiShopping ? {
      engine: entry.serpApiShopping.engine,
      latencyMs: entry.serpApiShopping.latencyMs,
      resultCount: entry.serpApiShopping.results.length,
      results: entry.serpApiShopping.results,
    } : null,
    googleLight: entry.googleLight ? {
      engine: entry.googleLight.engine,
      latencyMs: entry.googleLight.latencyMs,
      organicResultCount: entry.googleLight.organicResults.length,
      organicResults: entry.googleLight.organicResults,
      shoppingResults: entry.googleLight.shoppingResults,
      inlineShoppingResults: entry.googleLight.inlineShoppingResults,
      hasShoppingData: entry.googleLight.hasShoppingData,
      responseKeys: entry.googleLight.responseKeys,
    } : null,
  }))

  const outputPath = resolve(outputDir, 'google-light-spike-results.json')
  writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), serpApiCallsUsed: serpApiCallCount, analysis, runs: summaryResults }, null, 2))
  console.log(`\nResults saved to ${outputPath}`)
  console.log(`SerpApi calls used: ${serpApiCallCount}`)
}

function analyzeResults(results) {
  const a = {
    totalProducts: results.length,
    byMarket: { CA: { count: 0 }, US: { count: 0 } },
    serper: { avgLatency: 0, avgResults: 0, urlTypes: {}, directRetailerUrls: 0, totalUrls: 0, knownRetailers: 0, errors: 0 },
    serpApiShopping: { avgLatency: 0, avgResults: 0, urlTypes: {}, directRetailerUrls: 0, totalUrls: 0, knownRetailers: 0, errors: 0, withImmersive: 0 },
    googleLight: { avgLatency: 0, avgOrganicResults: 0, urlTypes: {}, directRetailerUrls: 0, totalUrls: 0, knownRetailers: 0, errors: 0, hasShoppingData: 0, responseKeyFreqs: {} },
  }

  const serperLatencies = []
  const serpApiLatencies = []
  const lightLatencies = []
  const serperCounts = []
  const serpApiCounts = []
  const lightCounts = []

  for (const entry of results) {
    a.byMarket[entry.product.market].count++

    // Serper
    if (entry.serper) {
      serperLatencies.push(entry.serper.latencyMs)
      serperCounts.push(entry.serper.results.length)
      for (const r of entry.serper.results) {
        a.serper.totalUrls++
        const urlType = classifyUrl(r.url)
        a.serper.urlTypes[urlType] = (a.serper.urlTypes[urlType] || 0) + 1
        if (urlType !== 'google_redirect' && urlType !== 'missing' && urlType !== 'invalid') {
          a.serper.directRetailerUrls++
        }
        if (isKnownRetailerUrl(r.url)) a.serper.knownRetailers++
      }
    } else {
      a.serper.errors++
    }

    // SerpApi Shopping
    if (entry.serpApiShopping) {
      serpApiLatencies.push(entry.serpApiShopping.latencyMs)
      serpApiCounts.push(entry.serpApiShopping.results.length)
      for (const r of entry.serpApiShopping.results) {
        a.serpApiShopping.totalUrls++
        const urlType = classifyUrl(r.url)
        a.serpApiShopping.urlTypes[urlType] = (a.serpApiShopping.urlTypes[urlType] || 0) + 1
        if (urlType !== 'google_redirect' && urlType !== 'missing' && urlType !== 'invalid') {
          a.serpApiShopping.directRetailerUrls++
        }
        if (isKnownRetailerUrl(r.url)) a.serpApiShopping.knownRetailers++
        if (r.immersiveUrl) a.serpApiShopping.withImmersive++
      }
    } else {
      a.serpApiShopping.errors++
    }

    // Google Light
    if (entry.googleLight) {
      lightLatencies.push(entry.googleLight.latencyMs)
      lightCounts.push(entry.googleLight.organicResults.length)
      if (entry.googleLight.hasShoppingData) a.googleLight.hasShoppingData++
      for (const key of entry.googleLight.responseKeys) {
        a.googleLight.responseKeyFreqs[key] = (a.googleLight.responseKeyFreqs[key] || 0) + 1
      }
      for (const r of entry.googleLight.organicResults) {
        a.googleLight.totalUrls++
        const urlType = classifyUrl(r.url)
        a.googleLight.urlTypes[urlType] = (a.googleLight.urlTypes[urlType] || 0) + 1
        if (urlType !== 'google_redirect' && urlType !== 'missing' && urlType !== 'invalid') {
          a.googleLight.directRetailerUrls++
        }
        if (isKnownRetailerUrl(r.url)) a.googleLight.knownRetailers++
      }
    } else {
      a.googleLight.errors++
    }
  }

  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0
  a.serper.avgLatency = avg(serperLatencies)
  a.serper.avgResults = +(serperCounts.reduce((s, v) => s + v, 0) / Math.max(serperCounts.length, 1)).toFixed(1)
  a.serpApiShopping.avgLatency = avg(serpApiLatencies)
  a.serpApiShopping.avgResults = +(serpApiCounts.reduce((s, v) => s + v, 0) / Math.max(serpApiCounts.length, 1)).toFixed(1)
  a.googleLight.avgLatency = avg(lightLatencies)
  a.googleLight.avgOrganicResults = +(lightCounts.reduce((s, v) => s + v, 0) / Math.max(lightCounts.length, 1)).toFixed(1)

  // Per-product comparison for the three known problem cases
  a.problemCases = results
    .filter((e) => ['B0DGJJKWW7', 'B098RKWHHZ', 'B09VLK9W3S'].includes(e.product.asin))
    .map((e) => ({
      query: e.product.query,
      asin: e.product.asin,
      serperDirectUrls: e.serper?.results.filter((r) => classifyUrl(r.url) !== 'google_redirect').length ?? 0,
      serperTotalUrls: e.serper?.results.length ?? 0,
      serpApiDirectUrls: e.serpApiShopping?.results.filter((r) => classifyUrl(r.url) !== 'google_redirect').length ?? 0,
      serpApiTotalUrls: e.serpApiShopping?.results.length ?? 0,
      lightRetailerUrls: e.googleLight?.organicResults.filter((r) => isKnownRetailerUrl(r.url)).length ?? 0,
      lightTotalOrganicUrls: e.googleLight?.organicResults.length ?? 0,
      lightHasShoppingData: e.googleLight?.hasShoppingData ?? false,
    }))

  return a
}

function printAnalysis(a) {
  console.log(`Products tested: ${a.totalProducts} (CA: ${a.byMarket.CA.count}, US: ${a.byMarket.US.count})\n`)

  console.log('--- Serper Shopping (current discovery) ---')
  console.log(`  Avg latency:        ${a.serper.avgLatency}ms`)
  console.log(`  Avg results/query:  ${a.serper.avgResults}`)
  console.log(`  URL types:          ${JSON.stringify(a.serper.urlTypes)}`)
  console.log(`  Direct retailer:    ${a.serper.directRetailerUrls}/${a.serper.totalUrls} (${pct(a.serper.directRetailerUrls, a.serper.totalUrls)})`)
  console.log(`  Known retailers:    ${a.serper.knownRetailers}/${a.serper.totalUrls} (${pct(a.serper.knownRetailers, a.serper.totalUrls)})`)
  console.log(`  Errors:             ${a.serper.errors}`)

  console.log('\n--- SerpApi Google Shopping (current verification) ---')
  console.log(`  Avg latency:        ${a.serpApiShopping.avgLatency}ms`)
  console.log(`  Avg results/query:  ${a.serpApiShopping.avgResults}`)
  console.log(`  URL types:          ${JSON.stringify(a.serpApiShopping.urlTypes)}`)
  console.log(`  Direct retailer:    ${a.serpApiShopping.directRetailerUrls}/${a.serpApiShopping.totalUrls} (${pct(a.serpApiShopping.directRetailerUrls, a.serpApiShopping.totalUrls)})`)
  console.log(`  Known retailers:    ${a.serpApiShopping.knownRetailers}/${a.serpApiShopping.totalUrls} (${pct(a.serpApiShopping.knownRetailerUrls, a.serpApiShopping.totalUrls)})`)
  console.log(`  With immersive:     ${a.serpApiShopping.withImmersive}/${a.serpApiShopping.totalUrls}`)
  console.log(`  Errors:             ${a.serpApiShopping.errors}`)

  console.log('\n--- SerpApi Google Light (candidate) ---')
  console.log(`  Avg latency:        ${a.googleLight.avgLatency}ms`)
  console.log(`  Avg organic/query:  ${a.googleLight.avgOrganicResults}`)
  console.log(`  URL types:          ${JSON.stringify(a.googleLight.urlTypes)}`)
  console.log(`  Direct retailer:    ${a.googleLight.directRetailerUrls}/${a.googleLight.totalUrls} (${pct(a.googleLight.directRetailerUrls, a.googleLight.totalUrls)})`)
  console.log(`  Known retailers:    ${a.googleLight.knownRetailers}/${a.googleLight.totalUrls} (${pct(a.googleLight.knownRetailers, a.googleLight.totalUrls)})`)
  console.log(`  Has shopping data:  ${a.googleLight.hasShoppingData}/${a.totalProducts}`)
  console.log(`  Response keys:      ${JSON.stringify(a.googleLight.responseKeyFreqs)}`)
  console.log(`  Errors:             ${a.googleLight.errors}`)

  if (a.problemCases.length > 0) {
    console.log('\n--- Problem Cases (AirPods ANC, Nintendo OLED, Samsung T7) ---')
    for (const pc of a.problemCases) {
      console.log(`\n  ${pc.query} (${pc.asin}):`)
      console.log(`    Serper:     ${pc.serperDirectUrls}/${pc.serperTotalUrls} direct URLs`)
      console.log(`    SerpApi:    ${pc.serpApiDirectUrls}/${pc.serpApiTotalUrls} direct URLs`)
      console.log(`    Light:      ${pc.lightRetailerUrls}/${pc.lightTotalOrganicUrls} known retailer URLs, shopping: ${pc.lightHasShoppingData}`)
    }
  }
}

function pct(n, d) {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '0%'
}

runSpike().catch((err) => { console.error('Spike failed:', err); process.exit(1) })
