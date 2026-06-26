/**
 * Oxylabs vs Rainforest — feasibility test
 *
 * Tests two Oxylabs Amazon scraper calls and compares the results against
 * existing Rainforest samples saved in temp-data/.
 *
 * Run: node backend/scripts/test-oxylabs.js
 * Requires: OXYLABS_USERNAME and OXYLABS_PASSWORD in .env
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises'
import * as fs from 'node:fs'
import { join } from 'node:path'

// Load .env manually (no dotenv dependency required)
const envPath = join(process.cwd(), '.env')
const envRaw = fs.readFileSync(envPath, 'utf8')
const env = Object.fromEntries(
  envRaw
    .split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => {
      const idx = line.indexOf('=')
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
)

const USERNAME = env.OXYLABS_USERNAME
const PASSWORD = env.OXYLABS_PASSWORD

if (!USERNAME || !PASSWORD) {
  console.error('Missing OXYLABS_USERNAME or OXYLABS_PASSWORD in .env')
  process.exit(1)
}

const OXYLABS_ENDPOINT = 'https://realtime.oxylabs.io/v1/queries'
const OUTPUT_DIR = join(process.cwd(), 'temp-data', 'oxylabs-samples')

const authHeader = 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')

// ─── Oxylabs call ────────────────────────────────────────────────────────────

async function oxyRequest(body) {
  const start = Date.now()
  const res = await fetch(OXYLABS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  const elapsed = Date.now() - start
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Oxylabs ${res.status}: ${text}`)
  }
  const data = await res.json()
  return { data, elapsed }
}

// ─── Save helper ─────────────────────────────────────────────────────────────

async function save(filename, data) {
  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(join(OUTPUT_DIR, filename), JSON.stringify(data, null, 2))
  console.log(`  Saved → temp-data/oxylabs-samples/${filename}`)
}

// ─── Comparison helpers ───────────────────────────────────────────────────────

function present(val) {
  if (val === null || val === undefined || val === '' || val === 'MISSING') return false
  if (Array.isArray(val) && val.length === 0) return false
  return true
}

function compareFields(label, rfField, oxyField) {
  const rfOk = present(rfField)
  const oxyOk = present(oxyField)
  const status = oxyOk ? '✓' : rfOk ? '✗ MISSING in Oxylabs' : '– (both missing)'
  console.log(`  ${status.padEnd(25)} ${label}`)
  if (oxyOk && rfOk) {
    // show a short preview of both values side by side
    const rfPreview = JSON.stringify(rfField).slice(0, 80)
    const oxyPreview = JSON.stringify(oxyField).slice(0, 80)
    if (rfPreview !== oxyPreview) {
      console.log(`    RF:  ${rfPreview}`)
      console.log(`    OXY: ${oxyPreview}`)
    }
  }
}

// ─── TEST 1: amazon_search ────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════')
console.log('TEST 1 — amazon_search: "office chair"')
console.log('════════════════════════════════════════')

let searchResult
try {
  console.log('Calling Oxylabs...')
  const { data, elapsed } = await oxyRequest({
    source: 'amazon_search',
    domain: 'com',
    query: 'office chair',
    parse: true,
    pages: 1,
  })
  console.log(`  Response time: ${elapsed}ms`)
  searchResult = data
  await save('office_chair_search.json', data)
} catch (err) {
  console.error('  Search call failed:', err.message)
  process.exit(1)
}

// Load matching Rainforest sample
const rfSearch = JSON.parse(
  await readFile(join(process.cwd(), 'temp-data', 'rainforest-samples', 'office_chair.json'), 'utf8')
)

const oxyResults = searchResult?.results?.[0]?.content?.results?.organic ?? []
const rfResults = rfSearch?.search_results ?? []

console.log(`\n  Rainforest results: ${rfResults.length}`)
console.log(`  Oxylabs results:    ${oxyResults.length}`)

if (oxyResults.length > 0) {
  const oxyFirst = oxyResults[0]
  const rfFirst = rfResults[0]

  console.log('\n  Field comparison — first result:')
  compareFields('title',        rfFirst?.title,              oxyFirst?.title)
  compareFields('asin',         rfFirst?.asin,               oxyFirst?.asin)
  compareFields('price',        rfFirst?.price?.value,       oxyFirst?.price)
  compareFields('rating',       rfFirst?.rating,             oxyFirst?.rating)
  compareFields('ratings_total',rfFirst?.ratings_total,      oxyFirst?.ratings_count)
  compareFields('image',        rfFirst?.image,              oxyFirst?.url_image)
  compareFields('link',         rfFirst?.link,               oxyFirst?.url)
  compareFields('recent_sales', rfFirst?.recent_sales,       oxyFirst?.sales_volume)
  compareFields('is_prime',     rfFirst?.is_prime,           oxyFirst?.is_prime)
  compareFields('amazons_choice',rfFirst?.amazons_choice,    oxyFirst?.is_amazons_choice ?? oxyFirst?.amazons_choice)

  console.log('\n  All keys on first Oxylabs search result:')
  console.log(' ', Object.keys(oxyFirst).join(', '))
}

// Grab first ASIN from Oxylabs results for product test
const testAsin = oxyResults?.[0]?.asin ?? 'B0C4JTPPYY'
console.log(`\n  Using ASIN for product test: ${testAsin}`)

// ─── TEST 2: amazon_product ───────────────────────────────────────────────────

// We always test the desk lamp ASIN we have a Rainforest product sample for,
// AND the first ASIN from the search if it's different.
const asinsToTest = [...new Set(['B0C4JTPPYY', testAsin])]

for (const asin of asinsToTest) {
  console.log('\n════════════════════════════════════════')
  console.log(`TEST 2 — amazon_product: ${asin}`)
  console.log('════════════════════════════════════════')

  let productResult
  try {
    console.log('Calling Oxylabs...')
    const { data, elapsed } = await oxyRequest({
      source: 'amazon_product',
      domain: 'com',
      query: asin,
      parse: true,
    })
    console.log(`  Response time: ${elapsed}ms`)
    productResult = data
    await save(`product_${asin}.json`, data)
  } catch (err) {
    console.error(`  Product call failed for ${asin}:`, err.message)
    continue
  }

  const oxyProduct = productResult?.results?.[0]?.content ?? {}

  // Only do field comparison against Rainforest if we have the matching sample
  if (asin === 'B0C4JTPPYY') {
    const rfProductRaw = JSON.parse(
      await readFile(
        join(process.cwd(), 'temp-data', 'rainforest-product-samples', 'B0C4JTPPYY.json'),
        'utf8'
      )
    )
    const rfProduct = rfProductRaw?.product ?? {}

    console.log('\n  Field comparison vs Rainforest product sample:')
    compareFields('title',          rfProduct?.title,                    oxyProduct?.title)
    compareFields('brand',          rfProduct?.brand,                    oxyProduct?.brand)
    compareFields('asin',           rfProduct?.asin,                     oxyProduct?.asin)
    compareFields('price',          rfProduct?.buybox_winner?.price,     oxyProduct?.price)
    compareFields('rating',         rfProduct?.rating,                   oxyProduct?.rating)
    compareFields('ratings_total',  rfProduct?.ratings_total,            oxyProduct?.ratings_count)
    compareFields('main_image',     rfProduct?.main_image?.link,         oxyProduct?.images?.[0] ?? oxyProduct?.url_image)
    compareFields('feature_bullets',rfProduct?.feature_bullets,          oxyProduct?.feature_bullets ?? oxyProduct?.bullets)
    compareFields('specifications', rfProduct?.specifications,           oxyProduct?.product_details ?? oxyProduct?.specifications)
    compareFields('categories',     rfProduct?.categories,               oxyProduct?.categories)
    compareFields('description',    rfProduct?.description,              oxyProduct?.description)

    console.log('\n  All keys on Oxylabs product content:')
    console.log(' ', Object.keys(oxyProduct).join(', '))
  } else {
    console.log('\n  No Rainforest sample for this ASIN — raw Oxylabs keys:')
    console.log(' ', Object.keys(oxyProduct).join(', '))
    if (oxyProduct?.feature_bullets || oxyProduct?.bullets) {
      const bullets = oxyProduct.feature_bullets ?? oxyProduct.bullets
      console.log(`\n  Feature bullets (${Array.isArray(bullets) ? bullets.length : 'N/A'}):`)
      if (Array.isArray(bullets)) bullets.slice(0, 3).forEach(b => console.log(`    • ${b}`))
    }
  }
}

console.log('\n════════════════════════════════════════')
console.log('Done. Check temp-data/oxylabs-samples/ for raw responses.')
console.log('════════════════════════════════════════\n')
