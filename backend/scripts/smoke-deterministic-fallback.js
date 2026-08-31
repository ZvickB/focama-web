/**
 * Paid, opt-in quality smoke test for the deterministic shortlist fallback.
 *
 * Usage: npm run test:smoke:fallback-quality
 *
 * Replays 20 captured Rainforest responses through the production filtering
 * code, compares the actual deterministic fallback with the production Haiku
 * shortlist, and asks an independent OpenAI model to judge randomized A/B
 * shortlists. It does not call Rainforest, Supabase, or write application data.
 */
import fs from 'node:fs'
import path from 'node:path'

import { haikuLockWinnersAndBadges } from '../lib/ai-selector.js'
import { selectDistinctCandidates } from '../lib/product-identity.js'
import { getFilteredSearchArtifacts } from '../lib/result-filter.js'

const CASES = [
  {
    id: 'travel-stroller-lightweight',
    query: 'travel stroller',
    details: 'Under 15 lb with a compact fold suitable for airport travel.',
    fixture: 'travel_stroller_under_15_lb_compact_fold_suitable_for_airpor_2026-08-03T23-04-11-816Z.json',
  },
  {
    id: 'headphones-commute-calls',
    query: 'wireless headphones',
    details: 'For commuting and work calls; comfortable with strong noise cancelling.',
    fixture: 'wireless_headphones_for_commuting_and_work_calls_comfortable_2026-08-03T23-04-21-986Z.json',
  },
  {
    id: 'pour-over-grinder',
    query: 'coffee grinder',
    details: 'For pour-over coffee; consistent grind, easy to clean, under $150.',
    fixture: 'coffee_grinder_for_pour_over_coffee_consistent_grind_easy_to_2026-08-03T23-04-27-018Z.json',
  },
  {
    id: 'bedroom-air-purifier',
    query: 'air purifier',
    details: 'For a bedroom with allergies; quiet enough to sleep.',
    fixture: 'air_purifier_for_a_bedroom_with_allergies_quiet_enough_to_sl_2026-07-12T17-40-37-736Z.json',
  },
  {
    id: 'beginner-cordless-drill',
    query: 'cordless drill',
    details: 'For basic apartment and home projects; easy for a beginner to use.',
    fixture: 'cordless_drill_for_basic_apartment_and_home_projects_easy_fo_2026-07-12T17-40-03-599Z.json',
  },
  {
    id: 'night-driving-dash-cam',
    query: 'dash cam',
    details: 'For night driving; dependable video quality and simple operation.',
    fixture: 'dash_cam_for_night_driving_need_dependable_video_quality_and_2026-07-12T17-29-22-381Z.json',
  },
  {
    id: 'mac-travel-hard-drive',
    query: 'external hard drive',
    details: 'For Mac backups and travel; reliable USB connection.',
    fixture: 'external_hard_drive_for_mac_backups_and_travel_reliable_usb__2026-07-12T17-50-05-497Z.json',
  },
  {
    id: 'chicken-free-dog-food',
    query: 'dog food',
    details: 'For an adult dog with a sensitive stomach; must be chicken-free.',
    fixture: 'dog_food_for_an_adult_dog_with_a_sensitive_stomach_chicken_f_2026-07-12T17-50-43-407Z.json',
  },
  {
    id: 'ergonomic-office-chair',
    query: 'office chair',
    details: 'For long workdays; needs lower-back support and breathable material.',
    fixture: 'office_chair_for_long_workdays_at_a_desk_need_lower_back_sup_2026-07-12T17-39-57-650Z.json',
  },
  {
    id: 'beginner-knife-set',
    query: 'kitchen knife set',
    details: 'For a beginner home cook; durable for everyday use.',
    fixture: 'kitchen_knife_set_for_a_beginner_home_cook_durable_everyday__2026-07-12T17-29-34-960Z.json',
  },
  {
    id: 'newborn-car-seat',
    query: 'infant car seat',
    details: 'For a newborn; strong safety record and easy installation.',
    fixture: 'infant_car_seat_for_a_newborn_strong_safety_record_easy_inst_2026-07-12T17-49-53-105Z.json',
  },
  {
    id: 'travel-usb-c-charger',
    query: 'USB-C charger',
    details: 'For charging a laptop and phone while travelling; compact and powerful enough for both.',
    fixture: 'usb_c_charger_for_charging_a_laptop_and_phone_while_travelin_2026-07-12T17-40-42-072Z.json',
  },
  {
    id: 'pet-hair-robot-vacuum',
    query: 'robot vacuum',
    details: 'For pet hair in a small apartment; simple maintenance.',
    fixture: 'robot_vacuum_for_pet_hair_in_a_small_apartment_simple_mainte_2026-07-12T18-29-58-303Z.json',
  },
  {
    id: 'iphone-16-pro-max-case',
    query: 'protective phone case',
    details: 'Must fit an Apple iPhone 16 Pro Max and support MagSafe.',
    fixture: 'i_need_a_protective_case_for_an_apple_iphone_16_pro_max_that_2026-08-03T20-52-34-693Z.json',
  },
  {
    id: 'dyson-v15-filter',
    query: 'replacement filters',
    details: 'For a Dyson V15 Detect vacuum; filters only, not a vacuum.',
    fixture: 'i_want_replacement_filters_for_a_dyson_v15_detect_vacuum_not_2026-08-03T20-52-53-569Z.json',
  },
  {
    id: '15-inch-laptop-sleeve',
    query: '15 inch laptop sleeve',
    details: 'Must fit a 15-inch laptop.',
    fixture: '15_inch_laptop_sleeve_2026-07-05T18-39-07-291Z.json',
  },
  {
    id: '12-pack-aa-batteries',
    query: 'AA batteries',
    details: 'Exactly a 12-pack.',
    fixture: '12_pack_aa_batteries_2026-07-05T18-38-38-604Z.json',
  },
  {
    id: 'air-fryer-under-100',
    query: 'air fryer',
    details: 'Must stay under $100.',
    fixture: 'air_fryer_must_stay_under_100_2026-07-05T17-33-00-336Z.json',
  },
  {
    id: 'blender-under-80',
    query: 'blender',
    details: 'Must cost no more than $80.',
    fixture: 'blender_no_more_than_80_2026-07-05T17-32-31-021Z.json',
  },
  {
    id: 'bose-noise-cancelling',
    query: 'Bose noise cancelling headphones',
    details: 'Bose over-ear noise-cancelling headphones, not accessories.',
    fixture: 'bose_noise_cancelling_headphones_2026-07-29T19-51-05-221Z.json',
  },
]

const PASS_THRESHOLDS = Object.freeze({
  acceptableCases: 16,
  noCriticalMismatchCases: 18,
  averageOverallFit: 3.5,
  scoreRetention: 0.75,
})

const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY
const openAiApiKey = process.env.OPENAI_API_KEY
const judgeModel = process.env.FALLBACK_JUDGE_MODEL || 'gpt-5.6-terra'
const samplesDirectory = path.resolve('temp-data/rainforest-samples')

if (!claudeApiKey || !openAiApiKey) {
  throw new Error('CLAUDE_API_KEY (or ANTHROPIC_API_KEY) and OPENAI_API_KEY are required.')
}

function normalizeFixtureItem(item) {
  const numericPrice = Number.isFinite(Number(item.price?.value)) ? Number(item.price.value) : null
  const delivery = typeof item.delivery?.tagline === 'string' ? item.delivery.tagline : ''

  return {
    product_id: item.asin || null,
    title: item.title || '',
    brand: item.brand || '',
    category: item.category || '',
    categories: Array.isArray(item.categories) ? item.categories : [],
    categories_flat: item.categories_flat || '',
    extracted_price: numericPrice,
    price: item.price?.raw || (numericPrice === null ? null : `$${numericPrice}`),
    rating: item.rating ?? null,
    reviews: item.ratings_total ?? null,
    thumbnail: item.image || null,
    product_link: item.link || '',
    snippet: item.description || item.brand || '',
    extensions: [],
    multiple_sources: false,
    isPrime: Boolean(item.is_prime || item.is_prime_eligible || /\bprime\b/i.test(delivery)),
    delivery,
    tag: '',
    source: '',
    store: 'Amazon',
    position: item.position || null,
  }
}

function buildCandidatePool(testCase) {
  const payload = JSON.parse(fs.readFileSync(path.join(samplesDirectory, testCase.fixture), 'utf8'))
  const normalizedPayload = {
    shopping_results: (payload.search_results || []).map(normalizeFixtureItem),
    search_information: { shopping_results_state: '' },
    related_searches: Array.isArray(payload.related_searches) ? payload.related_searches : [],
  }

  return getFilteredSearchArtifacts(normalizedPayload, {
    productQuery: testCase.query,
    details: testCase.details,
    candidatePoolSize: 30,
    finalResultLimit: 6,
    minimumScore: 0,
    diversifyPoolMultiplier: 2,
    diversifyBySource: false,
    skipHardFilter: true,
  }).candidatePool
}

function materializeShortlist(candidatePool, preferredIds = [], useBrandCap = false) {
  const candidateById = new Map(candidatePool.candidates.map((candidate) => [String(candidate.id), candidate]))
  const preferredCandidates = preferredIds.map((id) => candidateById.get(String(id))).filter(Boolean)

  return selectDistinctCandidates({
    preferredCandidates,
    fallbackCandidates: candidatePool.candidates,
    limit: Math.min(6, candidatePool.candidates.length),
    ...(useBrandCap ? { maxPerBrand: 2 } : {}),
  })
}

function candidateForJudge(candidate, index) {
  return {
    rank: index + 1,
    title: candidate.title,
    brand: candidate.brandName || '',
    price: candidate.price || '',
    rating: candidate.rating ?? null,
    reviewCount: candidate.reviewCount ?? null,
    description: String(candidate.description || '').slice(0, 220),
    attributes: Array.isArray(candidate.attributes) ? candidate.attributes.slice(0, 8) : [],
  }
}

function judgeSchema() {
  const shortlistProperties = {
    type: 'object',
    additionalProperties: false,
    properties: {
      overallFit: { type: 'integer', minimum: 1, maximum: 5 },
      firstPickFit: { type: 'integer', minimum: 1, maximum: 5 },
      usefulVariety: { type: 'integer', minimum: 1, maximum: 5 },
      criticalMismatchCount: { type: 'integer', minimum: 0, maximum: 6 },
      acceptableEmergencyFallback: { type: 'boolean' },
    },
    required: ['overallFit', 'firstPickFit', 'usefulVariety', 'criticalMismatchCount', 'acceptableEmergencyFallback'],
  }

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      shortlistA: shortlistProperties,
      shortlistB: shortlistProperties,
      preferred: { type: 'string', enum: ['A', 'B', 'tie'] },
      rationale: { type: 'string', maxLength: 500 },
    },
    required: ['shortlistA', 'shortlistB', 'preferred', 'rationale'],
  }
}

function responseText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || '')
    .join('')
}

async function judgeCase({ testCase, candidatePool, deterministic, haiku }) {
  const fallbackIsA = CASES.findIndex((entry) => entry.id === testCase.id) % 2 === 0
  const shortlistA = fallbackIsA ? deterministic : haiku
  const shortlistB = fallbackIsA ? haiku : deterministic
  const prompt = [
    'Blindly evaluate two shopping shortlists using only the supplied listing evidence.',
    'Treat every explicit shopper detail as a hard requirement. A critical mismatch is a wrong product type, accessory mismatch, incompatible model/size, prohibited ingredient, exceeded hard budget, wrong quantity, used/refurbished condition, or another clear violation.',
    'Score overallFit, firstPickFit, and usefulVariety from 1 (poor) to 5 (excellent).',
    'acceptableEmergencyFallback means a user could safely receive this shortlist during a rare AI outage: it is relevant, has no dangerous/deceptive mismatch, and contains at least a few credible choices. It need not be the better shortlist.',
    'Do not infer unlisted capabilities. A missing proof of a hard requirement should lower the score; count it as critical only when the listing evidence clearly conflicts.',
    '',
    `Product query: ${testCase.query}`,
    `Shopper details: ${testCase.details}`,
    `Candidate pool size before selection: ${candidatePool.candidates.length}`,
    `Shortlist A: ${JSON.stringify(shortlistA.map(candidateForJudge))}`,
    `Shortlist B: ${JSON.stringify(shortlistB.map(candidateForJudge))}`,
  ].join('\n')

  const startedAt = performance.now()
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: judgeModel,
      store: false,
      reasoning: { effort: 'low' },
      input: [
        { role: 'system', content: 'You are a strict, impartial ecommerce relevance evaluator. Return only the requested schema.' },
        { role: 'user', content: prompt },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'fallback_shortlist_evaluation',
          strict: true,
          schema: judgeSchema(),
        },
      },
    }),
  })
  const payload = await response.json()

  if (!response.ok) {
    throw new Error(`Judge failed (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`)
  }

  const parsed = JSON.parse(responseText(payload))
  return {
    fallback: fallbackIsA ? parsed.shortlistA : parsed.shortlistB,
    haiku: fallbackIsA ? parsed.shortlistB : parsed.shortlistA,
    preferred: parsed.preferred === 'tie'
      ? 'tie'
      : (parsed.preferred === (fallbackIsA ? 'A' : 'B') ? 'fallback' : 'haiku'),
    rationale: parsed.rationale,
    judgeMs: Math.round(performance.now() - startedAt),
    judgeUsage: payload.usage || null,
  }
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length)
  let cursor = 0

  async function worker() {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(values[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker))
  return results
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

const evaluatedCases = await mapWithConcurrency(CASES, 3, async (testCase, index) => {
  const candidatePool = buildCandidatePool(testCase)
  if (candidatePool.candidates.length === 0) throw new Error(`${testCase.id} produced no candidates.`)

  const fallback = materializeShortlist(candidatePool)
  const haikuStartedAt = performance.now()
  const haikuResult = await haikuLockWinnersAndBadges({
    candidatePool,
    finalResultLimit: 6,
    apiKey: claudeApiKey,
  })
  const haikuMs = Math.round(performance.now() - haikuStartedAt)
  const haiku = materializeShortlist(candidatePool, haikuResult.lockedIds, !haikuResult.specificBrand)
  const judgment = await judgeCase({ testCase, candidatePool, deterministic: fallback, haiku })

  const result = {
    id: testCase.id,
    query: testCase.query,
    details: testCase.details,
    candidateCount: candidatePool.candidates.length,
    fallbackTitles: fallback.map((candidate) => candidate.title),
    haikuTitles: haiku.map((candidate) => candidate.title),
    haikuMs,
    haikuUsage: haikuResult.usage,
    ...judgment,
  }
  console.log(`[${index + 1}/${CASES.length}] ${testCase.id}: fallback ${judgment.fallback.overallFit}/5, Haiku ${judgment.haiku.overallFit}/5, preferred ${judgment.preferred}`)
  return result
})

const fallbackScores = evaluatedCases.map((entry) => entry.fallback.overallFit)
const haikuScores = evaluatedCases.map((entry) => entry.haiku.overallFit)
const fallbackAverage = average(fallbackScores)
const haikuAverage = average(haikuScores)
const acceptableCases = evaluatedCases.filter((entry) => entry.fallback.acceptableEmergencyFallback).length
const noCriticalMismatchCases = evaluatedCases.filter((entry) => entry.fallback.criticalMismatchCount === 0).length
const scoreRetention = haikuAverage > 0 ? fallbackAverage / haikuAverage : 0
const preferredCounts = Object.fromEntries(['fallback', 'haiku', 'tie'].map((value) => [
  value,
  evaluatedCases.filter((entry) => entry.preferred === value).length,
]))
const checks = {
  acceptableCases: acceptableCases >= PASS_THRESHOLDS.acceptableCases,
  noCriticalMismatchCases: noCriticalMismatchCases >= PASS_THRESHOLDS.noCriticalMismatchCases,
  averageOverallFit: fallbackAverage >= PASS_THRESHOLDS.averageOverallFit,
  scoreRetention: scoreRetention >= PASS_THRESHOLDS.scoreRetention,
}
const passed = Object.values(checks).every(Boolean)
const summary = {
  passed,
  thresholds: PASS_THRESHOLDS,
  checks,
  fallback: {
    acceptableCases,
    noCriticalMismatchCases,
    averageOverallFit: Number(fallbackAverage.toFixed(2)),
  },
  haiku: { averageOverallFit: Number(haikuAverage.toFixed(2)) },
  fallbackScoreRetention: Number(scoreRetention.toFixed(3)),
  preferredCounts,
  averageHaikuMs: Math.round(average(evaluatedCases.map((entry) => entry.haikuMs))),
  averageJudgeMs: Math.round(average(evaluatedCases.map((entry) => entry.judgeMs))),
}
const output = {
  generatedAt: new Date().toISOString(),
  methodology: '20 captured Rainforest pools; production filters; actual fallback and Haiku selection; randomized blind OpenAI judge',
  judgeModel,
  summary,
  cases: evaluatedCases,
}
const outputPath = path.resolve('temp-data', `fallback-quality-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)

console.log('\nFallback quality smoke summary')
console.log(JSON.stringify(summary, null, 2))
console.log(`Full results: ${outputPath}`)
process.exitCode = passed ? 0 : 1
