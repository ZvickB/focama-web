/**
 * Paid, opt-in evaluation of partial-shortlist recovery using exact Rainforest
 * candidate pools already stored in Supabase.
 *
 * Usage: npm run test:smoke:recovery-quality
 *
 * Supabase access is read-only. This script never calls Rainforest. A recovery
 * second pass reuses the stored pool as an explicit proxy; it validates query
 * and selection behavior but cannot predict fresh-provider recall.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { haikuLockWinnersAndBadges } from '../lib/ai-selector.js'
import { filterNonNewConditionCandidates } from '../lib/handlers/finalize-candidate.js'
import { hasExplicitBrandRequest, selectDistinctCandidates } from '../lib/product-identity.js'
import { filterCandidatesByProvableConstraints } from '../lib/provable-constraint-guard.js'
import { getSupabaseAdminClient } from '../lib/storage/supabase-client.js'
import { validateSuggestedSearchQuery } from '../lib/search-data.js'
import { CASES, summarizeDeterministicChecks } from './smoke-haiku-reserve-quality.js'

const PASS_THRESHOLDS = Object.freeze({
  recoveryOfferRecall: 0.8,
  surfacedSuggestionPreservation: 1,
  surfacedSuggestionValidity: 1,
  secondPassNoWorse: 1,
})

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function candidateForJudge(candidate, rank) {
  return {
    id: String(candidate?.id || `rank-${rank + 1}`),
    rank: rank + 1,
    title: normalizeText(candidate?.title),
    brand: normalizeText(candidate?.brandName || candidate?.brand),
    price: normalizeText(candidate?.price),
    rating: Number.isFinite(Number(candidate?.rating)) ? Number(candidate.rating) : null,
    reviewCount: Number.isFinite(Number(candidate?.reviewCount)) ? Number(candidate.reviewCount) : null,
    description: normalizeText(candidate?.description).slice(0, 220),
    attributes: Array.isArray(candidate?.attributes)
      ? candidate.attributes.map(normalizeText).filter(Boolean).slice(0, 8)
      : [],
    condition: normalizeText(candidate?.condition).slice(0, 80),
  }
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  const inputTokens = Number(usage.inputTokens ?? usage.input_tokens ?? 0)
  const outputTokens = Number(usage.outputTokens ?? usage.output_tokens ?? 0)
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number(usage.total_tokens) || inputTokens + outputTokens,
  }
}

function sumUsage(entries, key) {
  return entries.reduce((total, entry) => {
    const usage = normalizeUsage(entry[key]) || { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    total.inputTokens += usage.inputTokens
    total.outputTokens += usage.outputTokens
    total.totalTokens += usage.totalTokens
    return total
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 })
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function passRate(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator
}

function responseText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  return (payload?.output || [])
    .flatMap((item) => item?.content || [])
    .map((part) => part?.text || '')
    .join('')
}

function shortlistAssessmentSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      overallFit: { type: 'integer', minimum: 1, maximum: 5 },
      suitablePickCount: { type: 'integer', minimum: 0, maximum: 6 },
      criticalMismatchCount: { type: 'integer', minimum: 0, maximum: 6 },
    },
    required: ['overallFit', 'suitablePickCount', 'criticalMismatchCount'],
  }
}

function recoveryJudgeSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      firstShortlist: shortlistAssessmentSchema(),
      shouldOfferRecovery: { type: 'boolean' },
      suggestionAssessment: {
        type: 'string',
        enum: ['pass', 'missing_requirement', 'introduced_conflict', 'invalid', 'not_provided', 'not_needed'],
      },
      missingRequirements: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string', maxLength: 100 },
      },
      introducedConflicts: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string', maxLength: 100 },
      },
      secondPass: {
        type: 'object',
        additionalProperties: false,
        properties: {
          comparison: { type: 'string', enum: ['better', 'same', 'worse', 'not_run'] },
          overallFit: { type: 'integer', minimum: 0, maximum: 5 },
          suitablePickCount: { type: 'integer', minimum: 0, maximum: 6 },
          criticalMismatchCount: { type: 'integer', minimum: 0, maximum: 6 },
        },
        required: ['comparison', 'overallFit', 'suitablePickCount', 'criticalMismatchCount'],
      },
      rationale: { type: 'string', maxLength: 600 },
    },
    required: [
      'firstShortlist',
      'shouldOfferRecovery',
      'suggestionAssessment',
      'missingRequirements',
      'introducedConflicts',
      'secondPass',
      'rationale',
    ],
  }
}

async function judgeRecoveryCase({
  testCase,
  firstResults,
  suggestedQuery,
  actualRecoveryTriggered,
  secondResults,
  openAiApiKey,
  judgeModel,
}) {
  const prompt = [
    'Evaluate a shopping partial-shortlist recovery using only the supplied listing evidence.',
    'Treat every explicit detail in the original query and shopper details as a hard requirement.',
    'Set shouldOfferRecovery=true when fewer than four first-shortlist products credibly satisfy every hard requirement.',
    'A suggested query passes only if it is a normal self-contained shopping phrase that preserves every explicit hard requirement and introduces no conflicting requirement.',
    'Do not require the suggestion to repeat soft adjectives that do not affect eligibility.',
    'The second pass, when present, reuses the same stored candidate pool. Judge whether its displayed products are better, the same, or worse than the first shortlist; do not assume it represents fresh marketplace recall.',
    'When no second pass was run, use comparison=not_run and set its three numeric fields to 0.',
    '',
    `Original query: ${testCase.query}`,
    `Shopper details: ${testCase.details || 'None'}`,
    `First shortlist: ${JSON.stringify(firstResults.map(candidateForJudge))}`,
    `Recovery surfaced by production rules: ${actualRecoveryTriggered}`,
    `Suggested query: ${suggestedQuery || 'None'}`,
    `Same-pool second-pass shortlist: ${secondResults.length > 0 ? JSON.stringify(secondResults.map(candidateForJudge)) : 'Not run'}`,
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
          name: 'partial_shortlist_recovery_evaluation',
          strict: true,
          schema: recoveryJudgeSchema(),
        },
      },
    }),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`Recovery judge failed (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`)
  }

  return {
    judgment: JSON.parse(responseText(payload)),
    judgeMs: Math.round(performance.now() - startedAt),
    judgeUsage: normalizeUsage(payload.usage),
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

function applyProductionPoolGuards({ candidates, query, details }) {
  const conditionEligible = filterNonNewConditionCandidates({
    candidates,
    productQuery: query,
    userContext: details,
  }).candidates
  return filterCandidatesByProvableConstraints({
    candidates: conditionEligible,
    productQuery: query,
    userContext: details,
  })
}

async function loadCasesFromSupabase(testCases) {
  const supabase = getSupabaseAdminClient()
  if (!supabase) throw new Error('Supabase server configuration is required for this read-only evaluation.')

  const { data, error } = await supabase
    .from('search_cache')
    .select('cache_key, product_query, candidate_pool, cached_at, source')
    .in('cache_key', testCases.map((testCase) => testCase.cacheKey))

  if (error) throw error
  const rowsByKey = new Map((data || []).map((row) => [row.cache_key, row]))

  return testCases.map((testCase) => {
    const row = rowsByKey.get(testCase.cacheKey)
    if (!row) throw new Error(`Supabase candidate pool not found for ${testCase.id}.`)
    const rawCandidates = Array.isArray(row.candidate_pool?.candidates)
      ? row.candidate_pool.candidates
      : []
    if (rawCandidates.length === 0) {
      throw new Error(`Supabase candidate pool is empty for ${testCase.id}.`)
    }

    const query = normalizeText(row.product_query || row.candidate_pool?.query)
    const details = normalizeText(row.candidate_pool?.details)
    const guarded = applyProductionPoolGuards({ candidates: rawCandidates, query, details })

    return {
      ...testCase,
      query,
      details,
      cachedAt: row.cached_at,
      source: row.source,
      rawCandidates,
      firstPool: {
        ...row.candidate_pool,
        query,
        details,
        candidates: guarded.candidates,
      },
      firstConstraintValidation: {
        ...guarded.constraints,
        rejectedCount: guarded.rejections.length,
        rejections: guarded.rejections,
      },
    }
  })
}

function candidatesByIds(candidatePool, ids) {
  const byId = new Map((candidatePool?.candidates || []).map((candidate) => [String(candidate.id), candidate]))
  return (ids || []).map((id) => byId.get(String(id))).filter(Boolean)
}

function materialize(candidatePool, ids, specificBrand) {
  const candidates = candidatesByIds(candidatePool, ids)
  const brandIsSpecific = Boolean(specificBrand) || hasExplicitBrandRequest(
    candidatePool?.query,
    candidatePool?.candidates,
  )
  return selectDistinctCandidates({
    preferredCandidates: candidates,
    limit: Math.min(6, candidatePool?.candidates?.length || 0),
    ...(brandIsSpecific ? {} : { maxPerBrand: 2 }),
  })
}

async function runHaiku(candidatePool, claudeApiKey) {
  const startedAt = performance.now()
  const selection = await haikuLockWinnersAndBadges({
    candidatePool,
    finalResultLimit: Math.min(12, Math.max(6, candidatePool.candidates.length)),
    apiKey: claudeApiKey,
    allowOptionalAlternatives: true,
  })
  return {
    selection,
    durationMs: Math.round(performance.now() - startedAt),
  }
}

export function summarizeRecoveryEvaluation(cases) {
  const actualRecoveryCases = cases.filter((entry) => entry.actualRecoveryTriggered)
  const shouldOfferCases = cases.filter((entry) => entry.judgment.shouldOfferRecovery)
  const secondPassCases = cases.filter((entry) => entry.judgment.secondPass.comparison !== 'not_run')
  const validSuggestionCases = actualRecoveryCases.filter((entry) => entry.suggestionValidation.isValid)
  const preservingSuggestionCases = actualRecoveryCases.filter(
    (entry) => entry.judgment.suggestionAssessment === 'pass',
  )
  const recoveredWhenNeeded = shouldOfferCases.filter((entry) => entry.actualRecoveryTriggered)
  const secondNoWorseCases = secondPassCases.filter(
    (entry) => entry.judgment.secondPass.comparison !== 'worse',
  )

  const rates = {
    recoveryOfferRecall: passRate(recoveredWhenNeeded.length, shouldOfferCases.length),
    surfacedSuggestionPreservation: passRate(
      preservingSuggestionCases.length,
      actualRecoveryCases.length,
    ),
    surfacedSuggestionValidity: passRate(validSuggestionCases.length, actualRecoveryCases.length),
    secondPassNoWorse: passRate(secondNoWorseCases.length, secondPassCases.length),
  }
  const checks = Object.fromEntries(
    Object.entries(PASS_THRESHOLDS).map(([key, threshold]) => [key, rates[key] >= threshold]),
  )

  return {
    passed: Object.values(checks).every(Boolean),
    caseCount: cases.length,
    thresholds: PASS_THRESHOLDS,
    checks,
    counts: {
      actualRecovery: actualRecoveryCases.length,
      judgeSaysRecoveryNeeded: shouldOfferCases.length,
      missedRecovery: shouldOfferCases.length - recoveredWhenNeeded.length,
      validSuggestions: validSuggestionCases.length,
      preservingSuggestions: preservingSuggestionCases.length,
      secondPasses: secondPassCases.length,
      secondPassBetter: secondPassCases.filter((entry) => entry.judgment.secondPass.comparison === 'better').length,
      secondPassSame: secondPassCases.filter((entry) => entry.judgment.secondPass.comparison === 'same').length,
      secondPassWorse: secondPassCases.filter((entry) => entry.judgment.secondPass.comparison === 'worse').length,
    },
    rates: Object.fromEntries(
      Object.entries(rates).map(([key, value]) => [key, Number(value.toFixed(2))]),
    ),
    averageFirstHaikuMs: Math.round(average(cases.map((entry) => entry.firstHaikuMs))),
    averageSecondHaikuMs: secondPassCases.length > 0
      ? Math.round(average(secondPassCases.map((entry) => entry.secondHaikuMs)))
      : 0,
    averageJudgeMs: Math.round(average(cases.map((entry) => entry.judgeMs))),
    firstHaikuUsage: sumUsage(cases, 'firstHaikuUsage'),
    secondHaikuUsage: sumUsage(cases, 'secondHaikuUsage'),
    judgeUsage: sumUsage(cases, 'judgeUsage'),
  }
}

export async function runRecoveryQualityEvaluation({
  cases = CASES,
  claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
  openAiApiKey = process.env.OPENAI_API_KEY,
  judgeModel = process.env.RECOVERY_JUDGE_MODEL || 'gpt-5.6-terra',
  concurrency = Number.parseInt(process.env.RECOVERY_SMOKE_CONCURRENCY || '2', 10),
} = {}) {
  if (!claudeApiKey || !openAiApiKey) {
    throw new Error('CLAUDE_API_KEY (or ANTHROPIC_API_KEY) and OPENAI_API_KEY are required.')
  }

  const requestedLimit = Number.parseInt(process.env.RECOVERY_SMOKE_LIMIT || '', 10)
  const selectedCases = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? cases.slice(0, requestedLimit)
    : cases
  const loadedCases = await loadCasesFromSupabase(selectedCases)
  const evaluatedCases = await mapWithConcurrency(
    loadedCases,
    Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 2,
    async (testCase, index) => {
      const firstRun = await runHaiku(testCase.firstPool, claudeApiKey)
      const firstCoreCandidates = candidatesByIds(testCase.firstPool, firstRun.selection.coreIds)
      const suggestedQuery = normalizeText(firstRun.selection.suggestedQuery)
      const suggestionValidation = validateSuggestedSearchQuery(suggestedQuery)
      const actualRecoveryTriggered =
        firstCoreCandidates.length < 4 &&
        suggestionValidation.isValid &&
        suggestionValidation.normalizedQuery.toLowerCase() !== testCase.query.toLowerCase()
      const firstResults = actualRecoveryTriggered
        ? materialize(testCase.firstPool, firstRun.selection.coreIds, firstRun.selection.specificBrand)
        : materialize(testCase.firstPool, firstRun.selection.lockedIds, firstRun.selection.specificBrand)

      let secondPool = null
      let secondRun = null
      let secondResults = []
      let secondConstraintValidation = null

      if (actualRecoveryTriggered) {
        const secondGuarded = applyProductionPoolGuards({
          candidates: testCase.rawCandidates,
          query: suggestionValidation.normalizedQuery,
          details: testCase.details,
        })
        secondPool = {
          ...testCase.firstPool,
          query: suggestionValidation.normalizedQuery,
          details: testCase.details,
          candidates: secondGuarded.candidates,
        }
        secondConstraintValidation = {
          ...secondGuarded.constraints,
          rejectedCount: secondGuarded.rejections.length,
          rejections: secondGuarded.rejections,
        }
        secondRun = await runHaiku(secondPool, claudeApiKey)
        secondResults = materialize(
          secondPool,
          secondRun.selection.lockedIds,
          secondRun.selection.specificBrand,
        )
      }

      const judged = await judgeRecoveryCase({
        testCase,
        firstResults,
        suggestedQuery,
        actualRecoveryTriggered,
        secondResults,
        openAiApiKey,
        judgeModel,
      })
      const result = {
        id: testCase.id,
        query: testCase.query,
        details: testCase.details,
        cacheKey: testCase.cacheKey,
        cachedAt: testCase.cachedAt,
        source: testCase.source,
        rawCandidateCount: testCase.rawCandidates.length,
        firstCandidateCount: testCase.firstPool.candidates.length,
        firstConstraintValidation: testCase.firstConstraintValidation,
        firstCoreCountBeforeComposition: firstCoreCandidates.length,
        firstCoreIds: firstRun.selection.coreIds || [],
        firstReserveIds: firstRun.selection.alternativeIds || [],
        firstDisplayedIds: firstResults.map((candidate) => String(candidate.id)),
        firstDisplayedCandidates: firstResults.map(candidateForJudge),
        firstChecks: summarizeDeterministicChecks(firstResults, testCase.checks),
        suggestedQuery,
        suggestionValidation: {
          isValid: Boolean(suggestionValidation.isValid),
          normalizedQuery: suggestionValidation.normalizedQuery || '',
          error: suggestionValidation.error || '',
        },
        actualRecoveryTriggered,
        secondPassProxy: actualRecoveryTriggered
          ? 'same_stored_pool_refiltered_for_refined_query'
          : 'not_run',
        secondCandidateCount: secondPool?.candidates.length || 0,
        secondConstraintValidation,
        secondDisplayedIds: secondResults.map((candidate) => String(candidate.id)),
        secondDisplayedCandidates: secondResults.map(candidateForJudge),
        secondChecks: summarizeDeterministicChecks(secondResults, testCase.checks),
        firstHaikuMs: firstRun.durationMs,
        secondHaikuMs: secondRun?.durationMs || 0,
        judgeMs: judged.judgeMs,
        firstHaikuUsage: normalizeUsage(firstRun.selection.usage),
        secondHaikuUsage: normalizeUsage(secondRun?.selection.usage),
        judgeUsage: judged.judgeUsage,
        judgment: judged.judgment,
      }
      console.log(
        `[${index + 1}/${loadedCases.length}] ${testCase.id}: ` +
        `recovery ${actualRecoveryTriggered ? 'shown' : 'not shown'}, ` +
        `judge ${judged.judgment.shouldOfferRecovery ? 'wanted' : 'did not want'}, ` +
        `suggestion ${judged.judgment.suggestionAssessment}, ` +
        `second ${judged.judgment.secondPass.comparison}`,
      )
      return result
    },
  )

  return {
    generatedAt: new Date().toISOString(),
    methodology: 'Exact stored Supabase Rainforest pools; current production first-finalize recovery rules; same-pool second-pass proxy only when recovery surfaces; independent OpenAI assessment',
    limitations: [
      'No Rainforest call was made, so the second-pass pool does not contain newly discovered products.',
      'No stored production recovery events existed in the latest 1,000 selection rows checked before this run.',
      'The independent judge is an AI evaluation, not ground-truth user behavior.',
    ],
    supabaseAccess: 'read_only',
    rainforestCalls: 0,
    supabaseWrites: 0,
    judgeModel,
    summary: summarizeRecoveryEvaluation(evaluatedCases),
    cases: evaluatedCases,
  }
}

async function main() {
  const output = await runRecoveryQualityEvaluation()
  const outputPath = path.resolve(
    'temp-data',
    `haiku-recovery-quality-smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)

  console.log('\nHaiku recovery quality smoke summary')
  console.log(JSON.stringify(output.summary, null, 2))
  console.log(`Full results: ${outputPath}`)
  process.exitCode = output.summary.passed ? 0 : 1
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) await main()
