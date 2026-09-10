/**
 * Paid, opt-in quality evaluation for Haiku's primary/reserve shortlist contract.
 *
 * Usage: npm run test:smoke:reserve-quality
 *
 * Reads ten exact historical Rainforest candidate pools from Supabase, runs the
 * current production Haiku selector, materializes results only from its eligible
 * primary/reserve frontier, and asks an independent OpenAI model to compare the
 * new result with the historical stored shortlist. Supabase access is read-only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { haikuLockWinnersAndBadges } from '../lib/ai-selector.js'
import { filterNonNewConditionCandidates } from '../lib/handlers/finalize-candidate.js'
import { hasExplicitBrandRequest, selectDistinctCandidates } from '../lib/product-identity.js'
import { filterCandidatesByProvableConstraints } from '../lib/provable-constraint-guard.js'
import { getSupabaseAdminClient } from '../lib/storage/supabase-client.js'

export const CASES = [
  {
    id: 'travel-stroller-under-200',
    cacheKey: 'guided_discovery_session:mtg26z3b.a57fe4d3-aa13-4302-9982-c03e9d95509c:travel stroller',
    checks: { maxPrice: 200 },
  },
  {
    id: 'curtain-rod-112-inch-wall-mount',
    cacheKey: 'guided_discovery_session:e8fe0d87-401f-47b3-bf11-b2860c074505:cuirtion rod chrome 112 inch',
    checks: {
      minimumSupportedInches: 112,
      requiredPatterns: [{ label: 'silver_or_chrome', pattern: '\\b(?:silver|chrome)\\b' }],
      forbiddenPatterns: [{ label: 'tension_or_shower_rod', pattern: '\\b(?:tension|shower|spring rod|no drill)\\b' }],
    },
  },
  {
    id: 'office-chair-under-300',
    cacheKey: 'guided_discovery_session:ded90a74-5607-4eff-bd97-dbbac462858e:office chair',
    checks: { maxPrice: 300 },
  },
  {
    id: 'red-coffee-maker-under-100',
    cacheKey: 'guided_discovery_session:7d19b6bf-9b15-4538-94fc-5189e47e5c80:red coffee maker under $100 programmable 12-cup or single-serve carafe',
    checks: {
      maxPrice: 100,
      requiredPatterns: [
        { label: 'red', pattern: '\\bred\\b' },
        { label: 'requested_brewer_format', pattern: '(?:\\bprogrammable\\b[\\s\\S]*\\b(?:12[ -]?cup|carafe)\\b|\\b(?:12[ -]?cup|carafe)\\b[\\s\\S]*\\bprogrammable\\b|\\bsingle[ -]?serve\\b[\\s\\S]*\\bcarafe\\b|\\bcarafe\\b[\\s\\S]*\\bsingle[ -]?serve\\b)' },
      ],
    },
  },
  {
    id: 'family-size-air-fryer',
    cacheKey: 'guided_discovery_session:0956ef5b-4e7b-4492-b3c3-acee6b17ce25:air fryer',
    checks: {
      requiredPatterns: [{ label: 'air_fryer', pattern: '\\bair\\s*fryer\\b' }],
      forbiddenPatterns: [{ label: 'accessory_or_book', pattern: '\\b(?:air fryer (?:paper )?liners?|air fryer accessor(?:y|ies)|cookbooks?|recipes? books?)\\b' }],
    },
  },
  {
    id: 'camera-under-30',
    cacheKey: 'guided_discovery_session:6c952719-294b-46af-b461-38df6fbb6d7e:budget compact digital camera under $30 durable beginner point-and-shoot',
    checks: {
      maxPrice: 30,
      requiredPatterns: [{ label: 'camera', pattern: '\\bcamera\\b' }],
      forbiddenPatterns: [{ label: 'camera_accessory', pattern: '\\b(?:case|tripod|replacement batter(?:y|ies)|screen protector)\\b' }],
    },
  },
  {
    id: 'mini-briefcase-under-20',
    cacheKey: 'guided_discovery_session:38e8f1ca-62f0-4fb0-b5ee-283ad1fd0e55:teenage girl mini briefcase',
    checks: {
      maxPrice: 20,
      requiredPatterns: [{ label: 'briefcase_or_laptop_bag', pattern: '\\b(?:briefcase|laptop bag|messenger bag)\\b' }],
    },
  },
  {
    id: 'mens-dress-pants-under-100',
    cacheKey: 'guided_discovery_session:816e473f-40d3-4507-b53e-e762a169bd4d:men dress pant',
    checks: {
      maxPrice: 100,
      requiredPatterns: [{ label: 'mens_pants', pattern: "\\bmen(?:'s|s)?\\b[\\s\\S]*\\b(?:pants?|trousers)\\b" }],
    },
  },
  {
    id: 'moto-g-play-2024-phone-not-case',
    cacheKey: 'guided_discovery_session:c30c3bd3-5ada-4282-a198-76e9d6b31aaa:moto g play 2024',
    checks: {
      requiredPatterns: [{ label: 'moto_g_play_2024', pattern: '\\bmoto(?:rola)?\\s+g\\s+play\\b[\\s\\S]*\\b2024\\b' }],
      forbiddenPatterns: [{ label: 'phone_accessory', pattern: '\\b(?:case|cover|screen protector|charger|cable)\\b' }],
    },
  },
  {
    id: 'light-blue-yarn-weight-4-or-5-no-wool',
    cacheKey: 'guided_discovery_session:9f5268c1-2d28-424c-b90d-7674f165fb05:light blue yarn with fleck',
    checks: {
      requiredPatterns: [
        { label: 'light_blue', pattern: '\\blight blue\\b' },
        { label: 'weight_4_or_5', pattern: '(?:\\b(?:weight|size|#)\\s*[45]\\b|\\b[45]\\s*(?:medium|worsted|bulky)\\b|\\b(?:medium|worsted|bulky)\\s*\\(?[45]\\b)' },
      ],
      forbiddenPatterns: [{ label: 'wool_or_fleece', pattern: '\\b(?:wool|fleece)\\b' }],
    },
  },
]

const PASS_THRESHOLDS = Object.freeze({
  averageOverallFit: 4,
  deterministicPassRate: 0.9,
  noCriticalMismatchRate: 0.9,
  reserveCriticalMismatchCount: 0,
})

function normalizedEvidence(candidate) {
  return [
    candidate?.title,
    candidate?.description,
    ...(Array.isArray(candidate?.attributes) ? candidate.attributes : []),
    ...(Array.isArray(candidate?.extensions) ? candidate.extensions : []),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function numericPrice(candidate) {
  if (Number.isFinite(Number(candidate?.numericPrice))) return Number(candidate.numericPrice)
  const match = String(candidate?.price || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function supportedInches(evidence) {
  const values = []
  const normalized = String(evidence || '')
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|in\b|")/gi,
    /(?:inches?|in\b)\s*(\d+(?:\.\d+)?)/gi,
  ]

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const value = Number(match[1])
      if (Number.isFinite(value)) values.push(value)
    }
  }

  return values.length > 0 ? Math.max(...values) : null
}

export function evaluateCandidateChecks(candidate, checks = {}) {
  const evidence = normalizedEvidence(candidate)
  const failures = []

  if (Number.isFinite(checks.maxPrice)) {
    const price = numericPrice(candidate)
    if (price === null) failures.push('price_missing')
    else if (price > checks.maxPrice) failures.push(`price_above_${checks.maxPrice}`)
  }

  if (Number.isFinite(checks.minimumSupportedInches)) {
    const maximumInches = supportedInches(evidence)
    if (maximumInches === null) failures.push('supported_length_missing')
    else if (maximumInches < checks.minimumSupportedInches) {
      failures.push(`supported_length_below_${checks.minimumSupportedInches}`)
    }
  }

  for (const requirement of checks.requiredPatterns || []) {
    if (!new RegExp(requirement.pattern, 'i').test(evidence)) {
      failures.push(`missing_${requirement.label}`)
    }
  }

  for (const exclusion of checks.forbiddenPatterns || []) {
    if (new RegExp(exclusion.pattern, 'i').test(evidence)) {
      failures.push(`forbidden_${exclusion.label}`)
    }
  }

  return failures
}

export function summarizeDeterministicChecks(candidates, checks) {
  return candidates.map((candidate, index) => ({
    rank: index + 1,
    id: String(candidate?.id || ''),
    failures: evaluateCandidateChecks(candidate, checks),
  }))
}

export function materializeEligibleShortlist(candidatePool, haikuResult) {
  const candidateById = new Map(
    (candidatePool?.candidates || []).map((candidate) => [String(candidate.id), candidate]),
  )
  const frontier = (haikuResult?.lockedIds || [])
    .map((id) => candidateById.get(String(id)))
    .filter(Boolean)
  const specificBrand = Boolean(haikuResult?.specificBrand) || hasExplicitBrandRequest(
    candidatePool?.query,
    candidatePool?.candidates,
  )

  return selectDistinctCandidates({
    preferredCandidates: frontier,
    limit: Math.min(6, candidatePool?.candidates?.length || 0),
    ...(specificBrand ? {} : { maxPerBrand: 2 }),
  })
}

function candidateForJudge(candidate, index, role = '') {
  return {
    id: String(candidate?.id || `rank-${index + 1}`),
    rank: index + 1,
    role,
    title: candidate?.title || '',
    brand: candidate?.brandName || candidate?.brand || '',
    price: candidate?.price || '',
    rating: candidate?.rating ?? null,
    reviewCount: candidate?.reviewCount ?? null,
    description: String(candidate?.description || '').slice(0, 220),
    attributes: Array.isArray(candidate?.attributes) ? candidate.attributes.slice(0, 8) : [],
    delivery: String(candidate?.delivery || '').slice(0, 120),
    condition: String(candidate?.condition || '').slice(0, 80),
  }
}

function shortlistSchema(maxItems = 6) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      overallFit: { type: 'integer', minimum: 1, maximum: 5 },
      criticalMismatchCount: { type: 'integer', minimum: 0, maximum: maxItems },
      suitablePickCount: { type: 'integer', minimum: 0, maximum: maxItems },
    },
    required: ['overallFit', 'criticalMismatchCount', 'suitablePickCount'],
  }
}

function judgeSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      shortlistA: shortlistSchema(),
      shortlistB: shortlistSchema(),
      reserves: {
        type: 'object',
        additionalProperties: false,
        properties: {
          credibleCount: { type: 'integer', minimum: 0, maximum: 6 },
          criticalMismatchCount: { type: 'integer', minimum: 0, maximum: 6 },
        },
        required: ['credibleCount', 'criticalMismatchCount'],
      },
      preferred: { type: 'string', enum: ['A', 'B', 'tie'] },
      rationale: { type: 'string', maxLength: 500 },
    },
    required: ['shortlistA', 'shortlistB', 'reserves', 'preferred', 'rationale'],
  }
}

function responseText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || '')
    .join('')
}

async function judgeCase({ testCase, stored, current, reserves, index, openAiApiKey, judgeModel }) {
  const storedIsA = index % 2 === 0
  const shortlistA = storedIsA ? stored : current
  const shortlistB = storedIsA ? current : stored
  const prompt = [
    'Blindly evaluate two shopping shortlists using only the supplied listing evidence.',
    'Treat every explicit shopper detail as a hard requirement. A critical mismatch is a wrong product type, incompatible size/model, exceeded hard budget, explicit exclusion, wrong quantity, used/refurbished condition when not requested, or another clear violation.',
    'Do not penalize a shortlist merely for returning fewer than six when the omitted options would violate or lack evidence for hard requirements.',
    'Score overallFit from 1 (poor) to 5 (excellent). suitablePickCount is the number of listings that credibly satisfy the request.',
    'Evaluate the reserve list separately. A credible reserve must satisfy the same explicit requirements as a displayed pick. Missing proof should make a reserve non-credible; count a critical mismatch only when evidence clearly conflicts.',
    '',
    `Product query: ${testCase.query}`,
    `Shopper details: ${testCase.details}`,
    `Shortlist A: ${JSON.stringify(shortlistA.map((candidate, rank) => candidateForJudge(candidate, rank)))}`,
    `Shortlist B: ${JSON.stringify(shortlistB.map((candidate, rank) => candidateForJudge(candidate, rank)))}`,
    `Current ranked reserves not displayed: ${JSON.stringify(reserves.map((candidate, rank) => candidateForJudge(candidate, rank, 'reserve')))}`,
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
          name: 'haiku_reserve_shortlist_evaluation',
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
    current: storedIsA ? parsed.shortlistB : parsed.shortlistA,
    stored: storedIsA ? parsed.shortlistA : parsed.shortlistB,
    reserves: parsed.reserves,
    preferred: parsed.preferred === 'tie'
      ? 'tie'
      : parsed.preferred === (storedIsA ? 'A' : 'B') ? 'stored' : 'current',
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

function sumUsage(entries, key) {
  return entries.reduce((totals, entry) => {
    const usage = entry[key] || {}
    const inputTokens = Number(usage.inputTokens ?? usage.input_tokens ?? 0)
    const outputTokens = Number(usage.outputTokens ?? usage.output_tokens ?? 0)
    totals.inputTokens += inputTokens
    totals.outputTokens += outputTokens
    totals.totalTokens += Number(usage.total_tokens ?? inputTokens + outputTokens)
    return totals
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 })
}

export async function loadCasesFromSupabase(testCases) {
  const supabase = getSupabaseAdminClient()
  if (!supabase) throw new Error('Supabase server configuration is required for this read-only evaluation.')

  const { data, error } = await supabase
    .from('search_cache')
    .select('cache_key, product_query, candidate_pool, results, selection, cached_at, source')
    .in('cache_key', testCases.map((testCase) => testCase.cacheKey))

  if (error) throw error

  const rowsByKey = new Map((data || []).map((row) => [row.cache_key, row]))
  return testCases.map((testCase) => {
    const row = rowsByKey.get(testCase.cacheKey)
    if (!row) throw new Error(`Supabase candidate pool not found for ${testCase.id}.`)
    if (!Array.isArray(row.candidate_pool?.candidates) || row.candidate_pool.candidates.length === 0) {
      throw new Error(`Supabase candidate pool is empty for ${testCase.id}.`)
    }

    const query = String(row.product_query || row.candidate_pool.query || '').trim()
    const details = String(row.candidate_pool.details || '').trim()
    const conditionEligibleCandidates = filterNonNewConditionCandidates({
      candidates: row.candidate_pool.candidates,
      productQuery: query,
      userContext: details,
    }).candidates
    const provableConstraintValidation = filterCandidatesByProvableConstraints({
      candidates: conditionEligibleCandidates,
      productQuery: query,
      userContext: details,
    })

    return {
      ...testCase,
      query,
      details,
      cachedAt: row.cached_at,
      source: row.source,
      storedResults: Array.isArray(row.results) ? row.results : [],
      storedSelection: row.selection || null,
      provableConstraintValidation: {
        ...provableConstraintValidation.constraints,
        rejectedCount: provableConstraintValidation.rejections.length,
        rejections: provableConstraintValidation.rejections,
      },
      candidatePool: {
        ...row.candidate_pool,
        query,
        details,
        candidates: provableConstraintValidation.candidates,
      },
    }
  })
}

export async function runReserveQualityEvaluation({
  cases = CASES,
  claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
  openAiApiKey = process.env.OPENAI_API_KEY,
  judgeModel = process.env.RESERVE_JUDGE_MODEL || 'gpt-5.6-terra',
  concurrency = Number.parseInt(process.env.RESERVE_SMOKE_CONCURRENCY || '2', 10),
} = {}) {
  if (!claudeApiKey || !openAiApiKey) {
    throw new Error('CLAUDE_API_KEY (or ANTHROPIC_API_KEY) and OPENAI_API_KEY are required.')
  }

  const requestedLimit = Number.parseInt(process.env.RESERVE_SMOKE_LIMIT || '', 10)
  const selectedCases = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? cases.slice(0, requestedLimit)
    : cases
  const loadedCases = await loadCasesFromSupabase(selectedCases)

  const evaluatedCases = await mapWithConcurrency(
    loadedCases,
    Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 2,
    async (testCase, index) => {
      const candidatePool = testCase.candidatePool
      const haikuStartedAt = performance.now()
      const haikuResult = await haikuLockWinnersAndBadges({
        candidatePool,
        finalResultLimit: Math.min(12, Math.max(6, candidatePool.candidates.length)),
        apiKey: claudeApiKey,
        allowOptionalAlternatives: true,
      })
      const haikuMs = Math.round(performance.now() - haikuStartedAt)
      const current = materializeEligibleShortlist(candidatePool, haikuResult)
      const candidateById = new Map(candidatePool.candidates.map((candidate) => [String(candidate.id), candidate]))
      const displayedIds = new Set(current.map((candidate) => String(candidate.id)))
      const reserves = (haikuResult.alternativeIds || [])
        .map((id) => candidateById.get(String(id)))
        .filter((candidate) => candidate && !displayedIds.has(String(candidate.id)))
      const alternativeIds = new Set((haikuResult.alternativeIds || []).map((id) => String(id)))
      const promotedReserveIds = current
        .filter((candidate) => alternativeIds.has(String(candidate.id)))
        .map((candidate) => String(candidate.id))
      const currentChecks = summarizeDeterministicChecks(current, testCase.checks)
      const reserveChecks = summarizeDeterministicChecks(reserves, testCase.checks)
      const judgment = await judgeCase({
        testCase,
        stored: testCase.storedResults,
        current,
        reserves,
        index,
        openAiApiKey,
        judgeModel,
      })

      const result = {
        id: testCase.id,
        query: testCase.query,
        details: testCase.details,
        cacheKey: testCase.cacheKey,
        cachedAt: testCase.cachedAt,
        candidateCount: candidatePool.candidates.length,
        storedStrategy: testCase.storedSelection?.strategy || null,
        provableConstraintValidation: testCase.provableConstraintValidation,
        storedIds: testCase.storedResults.map((candidate) => String(candidate.id || '')),
        currentIds: current.map((candidate) => String(candidate.id || '')),
        currentCandidates: current.map((candidate, rank) => candidateForJudge(candidate, rank)),
        coreIds: haikuResult.coreIds || [],
        alternativeIds: haikuResult.alternativeIds || [],
        reserveCandidates: reserves.map((candidate, rank) => candidateForJudge(candidate, rank, 'reserve')),
        promotedReserveIds,
        currentChecks,
        reserveChecks,
        rejectedIndices: haikuResult.rejectedIndices || [],
        haikuMs,
        haikuUsage: haikuResult.usage,
        ...judgment,
      }
      console.log(
        `[${index + 1}/${loadedCases.length}] ${testCase.id}: current ${judgment.current.overallFit}/5, ` +
        `${judgment.current.criticalMismatchCount} critical, ${current.length} shown, ${reserves.length} unused reserves, ` +
        `preferred ${judgment.preferred}`,
      )
      return result
    },
  )

  const deterministicPassCases = evaluatedCases.filter((entry) =>
    entry.currentChecks.every((check) => check.failures.length === 0),
  ).length
  const noCriticalMismatchCases = evaluatedCases.filter((entry) =>
    entry.current.criticalMismatchCount === 0,
  ).length
  const reserveCriticalMismatchCount = evaluatedCases.reduce(
    (sum, entry) => sum + entry.reserves.criticalMismatchCount,
    0,
  )
  const currentAverage = average(evaluatedCases.map((entry) => entry.current.overallFit))
  const storedAverage = average(evaluatedCases.map((entry) => entry.stored.overallFit))
  const deterministicPassRate = deterministicPassCases / Math.max(evaluatedCases.length, 1)
  const noCriticalMismatchRate = noCriticalMismatchCases / Math.max(evaluatedCases.length, 1)
  const preferredCounts = Object.fromEntries(['current', 'stored', 'tie'].map((value) => [
    value,
    evaluatedCases.filter((entry) => entry.preferred === value).length,
  ]))
  const checks = {
    averageOverallFit: currentAverage >= PASS_THRESHOLDS.averageOverallFit,
    deterministicPassRate: deterministicPassRate >= PASS_THRESHOLDS.deterministicPassRate,
    noCriticalMismatchRate: noCriticalMismatchRate >= PASS_THRESHOLDS.noCriticalMismatchRate,
    reserveCriticalMismatchCount:
      reserveCriticalMismatchCount <= PASS_THRESHOLDS.reserveCriticalMismatchCount,
  }
  const summary = {
    passed: Object.values(checks).every(Boolean),
    caseCount: evaluatedCases.length,
    thresholds: PASS_THRESHOLDS,
    checks,
    current: {
      averageOverallFit: Number(currentAverage.toFixed(2)),
      deterministicPassCases,
      noCriticalMismatchCases,
      averageResultCount: Number(average(evaluatedCases.map((entry) => entry.currentIds.length)).toFixed(2)),
    },
    stored: { averageOverallFit: Number(storedAverage.toFixed(2)) },
    reserves: {
      criticalMismatchCount: reserveCriticalMismatchCount,
      averageUnusedCount: Number(average(evaluatedCases.map((entry) => entry.reserveChecks.length)).toFixed(2)),
      promotedCount: evaluatedCases.reduce((sum, entry) => sum + entry.promotedReserveIds.length, 0),
    },
    preferredCounts,
    averageHaikuMs: Math.round(average(evaluatedCases.map((entry) => entry.haikuMs))),
    averageJudgeMs: Math.round(average(evaluatedCases.map((entry) => entry.judgeMs))),
    haikuUsage: sumUsage(evaluatedCases, 'haikuUsage'),
    judgeUsage: sumUsage(evaluatedCases, 'judgeUsage'),
  }

  return {
    generatedAt: new Date().toISOString(),
    methodology: 'Exact stored Supabase Rainforest pools; current production Haiku primary/reserve contract; no raw candidate-order padding; randomized blind OpenAI comparison with historical stored shortlist',
    supabaseAccess: 'read_only',
    judgeModel,
    summary,
    cases: evaluatedCases,
  }
}

async function main() {
  const output = await runReserveQualityEvaluation()
  const outputPath = path.resolve(
    'temp-data',
    `haiku-reserve-quality-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)

  console.log('\nHaiku reserve quality smoke summary')
  console.log(JSON.stringify(output.summary, null, 2))
  console.log(`Full results: ${outputPath}`)
  process.exitCode = output.summary.passed ? 0 : 1
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) await main()
