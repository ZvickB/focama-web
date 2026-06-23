/**
 * Spike: Capture full Immersive Product response to see what data is available.
 * Fetches Google Shopping for a few products, then Immersive for the top result.
 * Saves the full raw Immersive payloads for inspection.
 *
 * Usage: node backend/scripts/spike-immersive-data-sample.js
 */

import { resolve } from 'node:path'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'

// ── env bootstrap ──
const ENV_PATH = resolve(process.cwd(), '.env')
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
if (!SERPAPI_KEY) { console.error('Missing SERPAPI_API_KEY'); process.exit(1) }

const PRODUCTS = [
  { query: 'Apple AirPods 4 with Active Noise Cancellation', market: 'CA' },
  { query: 'Samsung T7 Shield 1TB black', market: 'CA' },
  { query: 'Sony WH-1000XM5 headphones black', market: 'US' },
  { query: 'Dyson V15 Detect cordless vacuum', market: 'US' },
  { query: 'KitchenAid Artisan stand mixer 5 quart', market: 'US' },
]

async function fetchSerpApi(params) {
  const url = new URL('https://serpapi.com/search.json')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('api_key', SERPAPI_KEY)
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  return res.json()
}

async function run() {
  console.log('Fetching Immersive Product data samples...\n')
  const samples = []

  for (const product of PRODUCTS) {
    console.log(`\n=== ${product.query} (${product.market}) ===`)

    // Step 1: Google Shopping search
    const shopData = await fetchSerpApi({
      engine: 'google_shopping',
      q: product.query,
      gl: product.market.toLowerCase(),
      hl: 'en',
    })

    const shopResults = shopData?.shopping_results || []
    console.log(`  Shopping results: ${shopResults.length}`)

    // Find first result with immersive URL
    const withImmersive = shopResults.find((r) => r?.serpapi_immersive_product_api)
    if (!withImmersive) {
      console.log('  No immersive URL found — skipping')
      samples.push({ product, shopping: { resultCount: shopResults.length }, immersive: null, error: 'no_immersive_url' })
      continue
    }

    console.log(`  Top match: "${withImmersive.title}" — ${withImmersive.source}`)
    console.log(`  Immersive URL found, fetching...`)

    // Step 2: Immersive Product (full response)
    const immersiveUrl = new URL(withImmersive.serpapi_immersive_product_api)
    immersiveUrl.searchParams.set('api_key', SERPAPI_KEY)
    immersiveUrl.searchParams.set('more_stores', 'true')
    const immersiveRes = await fetch(immersiveUrl, { signal: AbortSignal.timeout(20000) })
    const immersiveData = await immersiveRes.json()

    const pr = immersiveData?.product_results || {}
    const availableFields = Object.keys(pr)

    console.log(`  Immersive response keys: [${availableFields.join(', ')}]`)
    console.log(`  Stores: ${(pr.stores || []).length}`)
    console.log(`  Top insights: ${(pr.top_insights || []).length}`)
    console.log(`  Critic ratings: ${(pr.critic_ratings || []).length}`)
    console.log(`  User reviews: ${(pr.user_reviews || []).length}`)
    console.log(`  Videos: ${(pr.videos || []).length}`)
    console.log(`  Ratings breakdown: ${pr.ratings ? 'yes' : 'no'}`)
    console.log(`  About/specs: ${pr.about_the_product ? 'yes' : 'no'}`)
    console.log(`  Variants: ${(pr.variants || []).length}`)
    console.log(`  Thumbnails: ${(pr.thumbnails || []).length}`)

    // Show a sample of top_insights
    if (pr.top_insights?.length) {
      console.log('\n  Sample top insights:')
      for (const insight of pr.top_insights.slice(0, 3)) {
        console.log(`    • ${insight.text || insight.title || JSON.stringify(insight)}`)
      }
    }

    // Show critic ratings
    if (pr.critic_ratings?.length) {
      console.log('\n  Critic ratings:')
      for (const cr of pr.critic_ratings.slice(0, 5)) {
        console.log(`    • ${cr.name || cr.source}: ${cr.rating} — ${cr.link || ''}`)
      }
    }

    // Show store sample
    if (pr.stores?.length) {
      console.log('\n  Store offers (first 5):')
      for (const s of pr.stores.slice(0, 5)) {
        console.log(`    • ${s.name || s.retailer}: $${s.extracted_price ?? s.price} — ${s.link || ''}`)
      }
    }

    samples.push({
      product,
      shopping: {
        resultCount: shopResults.length,
        topMatch: { title: withImmersive.title, source: withImmersive.source, price: withImmersive.extracted_price },
      },
      immersive: {
        availableFields,
        storeCount: (pr.stores || []).length,
        topInsightsCount: (pr.top_insights || []).length,
        criticRatingsCount: (pr.critic_ratings || []).length,
        userReviewsCount: (pr.user_reviews || []).length,
        videosCount: (pr.videos || []).length,
        hasRatings: !!pr.ratings,
        hasAbout: !!pr.about_the_product,
        variantsCount: (pr.variants || []).length,
        thumbnailsCount: (pr.thumbnails || []).length,
        // Include actual data for inspection
        topInsights: pr.top_insights || [],
        criticRatings: pr.critic_ratings || [],
        userReviews: (pr.user_reviews || []).slice(0, 5),
        stores: (pr.stores || []).slice(0, 8),
        aboutTheProduct: pr.about_the_product || null,
        ratings: pr.ratings || null,
        variants: pr.variants || [],
        title: pr.title || '',
        brand: pr.brand || '',
        rating: pr.rating || null,
        reviews: pr.reviews || null,
      },
    })

    // Pause between calls
    await new Promise((r) => setTimeout(r, 1000))
  }

  // Save
  const outputDir = resolve(process.cwd(), 'temp-data', 'price-intel-reviews')
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })
  const outPath = resolve(outputDir, 'immersive-data-samples.json')
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), samples }, null, 2))
  console.log(`\n\nSaved to ${outPath}`)
  console.log(`SerpApi calls used: ${PRODUCTS.length * 2} (${PRODUCTS.length} Shopping + ${PRODUCTS.length} Immersive)`)
}

run().catch((err) => { console.error('Failed:', err); process.exit(1) })
