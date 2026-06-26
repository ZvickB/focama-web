/**
 * Keepa Product API spike
 *
 * Purpose: see what product data Keepa returns for a given ASIN,
 * specifically whether we get feature bullet points, description,
 * price, and images — the same data we currently pay Rainforest
 * ~$0.008/call to fetch for modal enrichment.
 *
 * Usage:
 *   KEEPA_API_KEY=xxx node backend/spikes/keepa-product-spike.js [ASIN] [domain]
 *
 * Keepa API docs: https://keepa.com/#!discuss/t/product-request/110
 *
 * Token cost (from Keepa pricing page):
 *   - Product request without offers: 1 token
 *   - Product request with offers:    varies by marketplace
 *   - 1 token ≈ $0.002 on the Individual plan ($0.19/100 tokens at lowest tier)
 *   Compare: Rainforest product detail ≈ $0.008/call
 *
 * Key parameters:
 *   domain  — marketplace ID (1=com, 6=ca, 3=co.uk, etc.)
 *   stats   — include price statistics (current, avg, etc.)
 *   offers  — include buybox/seller offers (costs more tokens)
 */

const KEEPA_BASE = 'https://api.keepa.com'

// Keepa uses numeric domain IDs, not amazon_domain strings
const DOMAIN_MAP = {
  'amazon.com': 1,
  'amazon.co.uk': 3,
  'amazon.de': 4,
  'amazon.fr': 5,
  'amazon.ca': 6,
  'amazon.it': 8,
  'amazon.es': 9,
  'amazon.com.au': 10,
  'amazon.com.mx': 11,
}

async function fetchKeepaProduct(asin, amazonDomain = 'amazon.com') {
  const apiKey = process.env.KEEPA_API_KEY
  if (!apiKey) {
    console.error('Missing KEEPA_API_KEY env var')
    process.exit(1)
  }

  const domainId = DOMAIN_MAP[amazonDomain] || 1

  const url = new URL(`${KEEPA_BASE}/product`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('domain', domainId)
  url.searchParams.set('asin', asin)
  // stats=1 gives current/avg price stats; stats=180 gives 180-day stats
  url.searchParams.set('stats', '180')
  // buyBoxSellerIdHistory for buybox price info (no extra token cost)
  // offers=20 would fetch live seller offers but costs more tokens — skip for spike

  console.log(`\n--- Keepa Product Request ---`)
  console.log(`ASIN:   ${asin}`)
  console.log(`Domain: ${amazonDomain} (keepa domain ID: ${domainId})`)
  console.log(`URL:    ${url.toString().replace(apiKey, 'REDACTED')}\n`)

  const start = Date.now()
  const res = await fetch(url)
  const elapsed = Date.now() - start

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`)
    process.exit(1)
  }

  const data = await res.json()

  // --- Token usage ---
  console.log(`=== API Response Metadata ===`)
  console.log(`Status:          ${res.status}`)
  console.log(`Latency:         ${elapsed}ms`)
  console.log(`Tokens left:     ${data.tokensLeft}`)
  console.log(`Refill in:       ${data.refillIn}ms`)
  console.log(`Refill rate:     ${data.refillRate} tokens/min`)
  console.log(`Token flow:      ${data.tokenFlowReduction ?? 'n/a'}`)
  console.log(`Products found:  ${data.products?.length ?? 0}`)

  if (!data.products || data.products.length === 0) {
    console.log('\nNo product data returned.')
    return
  }

  const product = data.products[0]

  // --- Core fields ---
  console.log(`\n=== Product Core ===`)
  console.log(`Title:           ${product.title ?? '(none)'}`)
  console.log(`ASIN:            ${product.asin ?? '(none)'}`)
  console.log(`Brand:           ${product.brand ?? '(none)'}`)
  console.log(`Manufacturer:    ${product.manufacturer ?? '(none)'}`)
  console.log(`Product group:   ${product.productGroup ?? '(none)'}`)
  console.log(`Category tree:   ${(product.categoryTree ?? []).map(c => c.name).join(' > ') || '(none)'}`)
  console.log(`Parent ASIN:     ${product.parentAsin ?? '(none)'}`)
  console.log(`Variation ASINs: ${(product.variationCSV ?? []).length / 2} variations`)
  console.log(`EAN list:        ${(product.eanList ?? []).join(', ') || '(none)'}`)
  console.log(`UPC list:        ${(product.upcList ?? []).join(', ') || '(none)'}`)
  console.log(`Part number:     ${product.partNumber ?? '(none)'}`)
  console.log(`Model:           ${product.model ?? '(none)'}`)
  console.log(`Color:           ${product.color ?? '(none)'}`)
  console.log(`Size:            ${product.size ?? '(none)'}`)

  // --- Features / bullet points (THE KEY QUESTION) ---
  console.log(`\n=== Features / Bullet Points ===`)
  if (product.features && product.features.length > 0) {
    product.features.forEach((f, i) => console.log(`  ${i + 1}. ${f}`))
  } else {
    console.log('  (none returned)')
  }

  // --- Description ---
  console.log(`\n=== Description ===`)
  console.log(product.description
    ? product.description.slice(0, 500) + (product.description.length > 500 ? '...' : '')
    : '  (none returned)')

  // --- Price data ---
  console.log(`\n=== Price Data (from stats) ===`)
  const stats = product.stats
  if (stats) {
    // stats.current is an array indexed by price type:
    //   0=Amazon, 1=New 3rd-party, 2=Used, 3=Sales rank, ...
    //   see https://keepa.com/#!discuss/t/product-request/110
    const priceTypes = ['Amazon', 'New 3rd-party', 'Used', 'Sales Rank',
      'List Price', 'Collectible', 'Refurbished', 'New FBM Shipping',
      'Lightning Deal', 'Warehouse', 'New FBA', 'Count New', 'Count Used',
      'Count Refurbished', 'Count Collectible', 'Extra Info Availability',
      'Rating', 'Count Reviews', 'Buy Box Shipping', 'Used Shipping',
      'Collectible Shipping', 'Refurbished Shipping', 'eBay New Shipping',
      'eBay Used Shipping', 'Trade-In', 'Rental', 'Buy Box Used',
      'Buy Box Used Shipping', 'Prime Excl', 'Prime Excl Shipping']

    console.log(`  Current prices (Keepa price = value/100 for currency):`)
    if (stats.current) {
      stats.current.forEach((val, i) => {
        if (val != null && val > 0 && i < priceTypes.length) {
          const label = priceTypes[i] || `Type ${i}`
          // Keepa stores prices as integers (cents)
          const display = i === 3 ? val : `$${(val / 100).toFixed(2)}`
          console.log(`    ${label}: ${display}`)
        }
      })
    }

    console.log(`\n  Average prices (180-day):`)
    if (stats.avg) {
      stats.avg.forEach((val, i) => {
        if (val != null && val > 0 && i < priceTypes.length) {
          const label = priceTypes[i] || `Type ${i}`
          const display = i === 3 ? val : `$${(val / 100).toFixed(2)}`
          console.log(`    ${label}: ${display}`)
        }
      })
    }
  } else {
    console.log('  (no stats returned)')
  }

  // --- Images ---
  console.log(`\n=== Images ===`)
  if (product.imagesCSV) {
    const images = product.imagesCSV.split(',')
    console.log(`  Count: ${images.length}`)
    // Keepa image URLs: prepend https://images-na.ssl-images-amazon.com/images/I/
    images.slice(0, 3).forEach((img, i) => {
      console.log(`  ${i + 1}. https://images-na.ssl-images-amazon.com/images/I/${img}`)
    })
    if (images.length > 3) console.log(`  ... and ${images.length - 3} more`)
  } else {
    console.log('  (none returned)')
  }

  // --- Review / rating ---
  console.log(`\n=== Reviews ===`)
  console.log(`  Rating:       ${product.stats?.current?.[16] != null ? (product.stats.current[16] / 10).toFixed(1) : '(none)'}`)
  console.log(`  Review count: ${product.stats?.current?.[17] ?? '(none)'}`)

  // --- Prime ---
  console.log(`\n=== Availability ===`)
  console.log(`  Is SNS:       ${product.isSNS ?? '(n/a)'}`)
  console.log(`  Is add-on:    ${product.isAddonItem ?? '(n/a)'}`)
  console.log(`  Availability: ${product.availabilityAmazon ?? '(n/a)'}`)

  // --- Raw dump of top-level keys for discovery ---
  console.log(`\n=== All top-level keys in product response ===`)
  console.log(Object.keys(product).sort().join(', '))

  // --- Full raw dump to file for inspection ---
  const fs = await import('fs')
  const outPath = `backend/spikes/keepa-response-${asin}.json`
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2))
  console.log(`\nFull response written to: ${outPath}`)
}

// --- Run ---
const asin = process.argv[2] || 'B0D5CTSB95'  // default: a popular product
const domain = process.argv[3] || 'amazon.com'
fetchKeepaProduct(asin, domain).catch(err => {
  console.error('Spike failed:', err)
  process.exit(1)
})
