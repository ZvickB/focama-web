/**
 * Paid, opt-in selector comparison using the exact stored Supabase pools from
 * the reserve-quality evaluation. Supabase access is read-only and Rainforest
 * is never called.
 *
 * Usage: node --env-file=.env backend/scripts/benchmark-selector-models.js
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import Anthropic from '@anthropic-ai/sdk'

import {
  buildHaikuShortlistTool,
  buildNanoLockAndBadgesPrompt,
  haikuLockWinnersAndBadges,
} from '../lib/ai-selector.js'
import {
  CASES,
  loadCasesFromSupabase,
  materializeEligibleShortlist,
  summarizeDeterministicChecks,
} from './smoke-haiku-reserve-quality.js'

const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses'
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const TERRA_MODEL = 'gpt-5.6-terra'
const SONNET_MODEL = 'claude-sonnet-5'
const JUDGE_MODEL = process.env.SELECTOR_BENCHMARK_JUDGE_MODEL || 'gpt-5.6-sol'
const OUTPUT_PATH = path.resolve(
  process.cwd(),
  process.env.SELECTOR_BENCHMARK_OUTPUT || 'temp-data/selector-model-comparison-2026-09-10.json',
)

const SELECTORS = Object.freeze([
  { key: 'haiku', provider: 'anthropic', model: HAIKU_MODEL },
  { key: 'terra', provider: 'openai', model: TERRA_MODEL },
  { key: 'sonnet', provider: 'anthropic', model: SONNET_MODEL },
])
const requestedOrder = String(process.env.SELECTOR_BENCHMARK_ORDER || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)
const RUN_ORDER = requestedOrder.length === SELECTORS.length &&
  new Set(requestedOrder).size === SELECTORS.length &&
  requestedOrder.every((key) => SELECTORS.some((selector) => selector.key === key))
  ? requestedOrder.map((key) => SELECTORS.find((selector) => selector.key === key))
  : SELECTORS

function responseText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  return (payload?.output || [])
    .flatMap((item) => item?.content || [])
    .map((part) => part?.text || '')
    .join('')
}

function percentile(values, fraction) {
  if (values.length === 0) return 0
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)]
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

function usageFromOpenAi(payload) {
  const usage = payload?.usage || {}
  return {
    inputTokens: Number(usage.input_tokens || 0),
    outputTokens: Number(usage.output_tokens || 0),
    reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens || 0),
  }
}

function normalizeSelection({ candidates, input, model, usage }) {
  const picks = Array.isArray(input?.picks) ? input.picks : []
  const seen = new Set()
  const lockedIds = []
  const coreIds = []
  const alternativeIds = []
  const brandById = {}
  const rejectedIndices = []

  for (const pick of picks) {
    const index = Number(pick?.index)
    if (!Number.isInteger(index) || index < 1 || index > candidates.length) {
      rejectedIndices.push({ index: pick?.index ?? null, reason: 'not_in_pool' })
      continue
    }
    if (seen.has(index)) {
      rejectedIndices.push({ index, reason: 'duplicate' })
      continue
    }

    const id = String(candidates[index - 1].id)
    if (pick?.confidence !== 'high') {
      rejectedIndices.push({ index, reason: 'not_high_confidence' })
      continue
    }

    lockedIds.push(id)
    if (pick?.role === 'alternative') alternativeIds.push(id)
    else coreIds.push(id)

    const brand = String(pick?.brand || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (brand) brandById[id] = brand
    seen.add(index)
  }

  return {
    model,
    lockedIds,
    coreIds,
    alternativeIds,
    brandById,
    suggestedQuery: String(input?.suggested_query || '').trim().slice(0, 220),
    specificBrand: input?.specific_brand === true,
    rejectedIndices,
    usage,
  }
}

async function runTerra({ candidatePool, finalResultLimit, apiKey }) {
  const prompt = buildNanoLockAndBadgesPrompt({
    candidatePool,
    finalResultLimit,
    allowOptionalAlternatives: true,
  })
  const schema = buildHaikuShortlistTool(candidatePool.candidates.length).input_schema
  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(45_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TERRA_MODEL,
      store: false,
      max_output_tokens: 4096,
      reasoning: { effort: 'low' },
      input: [
        {
          role: 'system',
          content:
            'You are a careful shopping ranker. Follow user constraints exactly and return only the requested structured output.',
        },
        { role: 'user', content: prompt },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'submit_shortlist',
          strict: true,
          schema,
        },
      },
    }),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`Terra failed (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`)
  }

  return normalizeSelection({
    candidates: candidatePool.candidates,
    input: JSON.parse(responseText(payload)),
    model: TERRA_MODEL,
    usage: usageFromOpenAi(payload),
  })
}

async function runSonnet({ candidatePool, finalResultLimit, apiKey }) {
  const prompt = buildNanoLockAndBadgesPrompt({
    candidatePool,
    finalResultLimit,
    allowOptionalAlternatives: true,
  })
  const shortlistTool = buildHaikuShortlistTool(candidatePool.candidates.length)
  const anthropic = new Anthropic({ apiKey })
  const message = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 4096,
    output_config: { effort: 'low' },
    system:
      'You are a careful shopping ranker. Follow user constraints exactly and respond only through the submit_shortlist tool. Thinking adds latency and should be used only when it materially improves selection quality.',
    tools: [shortlistTool],
    tool_choice: { type: 'tool', name: shortlistTool.name },
    messages: [{ role: 'user', content: prompt }],
  })
  const toolUseBlock = message.content?.find(
    (block) => block?.type === 'tool_use' && block?.name === shortlistTool.name,
  )
  if (!toolUseBlock) throw new Error('Sonnet returned no shortlist tool call.')

  return normalizeSelection({
    candidates: candidatePool.candidates,
    input: toolUseBlock.input,
    model: SONNET_MODEL,
    usage: {
      inputTokens: Number(message.usage?.input_tokens || 0),
      outputTokens: Number(message.usage?.output_tokens || 0),
    },
  })
}

async function runSelector({ selector, candidatePool, claudeApiKey, openAiApiKey }) {
  const args = {
    candidatePool,
    finalResultLimit: Math.min(12, Math.max(6, candidatePool.candidates.length)),
    allowOptionalAlternatives: true,
  }

  if (selector.key === 'haiku') {
    return haikuLockWinnersAndBadges({ ...args, apiKey: claudeApiKey })
  }
  if (selector.key === 'terra') {
    return runTerra({ ...args, apiKey: openAiApiKey })
  }
  return runSonnet({ ...args, apiKey: claudeApiKey })
}

function candidateForJudge(candidate, rank) {
  return {
    rank: rank + 1,
    title: candidate?.title || '',
    brand: candidate?.brandName || candidate?.brand || '',
    price: candidate?.price || '',
    rating: candidate?.rating ?? null,
    reviewCount: candidate?.reviewCount ?? null,
    description: String(candidate?.description || '').slice(0, 220),
    attributes: Array.isArray(candidate?.attributes) ? candidate.attributes.slice(0, 8) : [],
    condition: String(candidate?.condition || '').slice(0, 80),
  }
}

function shortlistJudgmentSchema(maxItems = 6) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      overallFit: { type: 'integer', minimum: 1, maximum: 5 },
      criticalMismatchCount: { type: 'integer', minimum: 0, maximum: maxItems },
      suitablePickCount: { type: 'integer', minimum: 0, maximum: maxItems },
      rationale: { type: 'string', maxLength: 400 },
    },
    required: ['overallFit', 'criticalMismatchCount', 'suitablePickCount', 'rationale'],
  }
}

function comparisonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      shortlistA: shortlistJudgmentSchema(),
      shortlistB: shortlistJudgmentSchema(),
      shortlistC: shortlistJudgmentSchema(),
      preferred: { type: 'string', enum: ['A', 'B', 'C', 'tie'] },
    },
    required: ['shortlistA', 'shortlistB', 'shortlistC', 'preferred'],
  }
}

async function judgeCase({ testCase, selections, index, openAiApiKey }) {
  const offset = index % SELECTORS.length
  const blinded = SELECTORS.map((_selector, position) => SELECTORS[(position + offset) % SELECTORS.length])
  const labels = ['A', 'B', 'C']
  const prompt = [
    'Blindly evaluate three shopping shortlists using only the supplied listing evidence.',
    'Treat every explicit shopper detail as a hard requirement. A critical mismatch is a wrong product type, incompatible size/model, exceeded hard budget, explicit exclusion, wrong quantity, used/refurbished condition when not requested, or another clear violation.',
    'Do not penalize a shortlist merely for returning fewer than six when omitted options would violate or lack evidence for hard requirements.',
    'Score overallFit from 1 (poor) to 5 (excellent). suitablePickCount is the number of listings that credibly satisfy the request.',
    'Choose preferred based on requirement satisfaction first, then strength and usefulness of the credible picks. Use tie only when no shortlist is meaningfully better.',
    '',
    `Product query: ${testCase.query}`,
    `Shopper details: ${testCase.details}`,
    ...blinded.map((selector, position) => {
      const shortlist = selections[selector.key].shortlist
      return `Shortlist ${labels[position]}: ${JSON.stringify(shortlist.map(candidateForJudge))}`
    }),
  ].join('\n')

  const startedAt = performance.now()
  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(45_000),
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      store: false,
      reasoning: { effort: 'low' },
      input: [
        {
          role: 'system',
          content: 'You are a strict, impartial ecommerce relevance evaluator. Return only the requested schema.',
        },
        { role: 'user', content: prompt },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'selector_model_comparison',
          strict: true,
          schema: comparisonSchema(),
        },
      },
    }),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`Judge failed (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`)
  }

  const parsed = JSON.parse(responseText(payload))
  const judgments = {}
  for (const [position, selector] of blinded.entries()) {
    judgments[selector.key] = parsed[`shortlist${labels[position]}`]
  }
  const preferred = parsed.preferred === 'tie'
    ? 'tie'
    : blinded[labels.indexOf(parsed.preferred)]?.key || 'tie'

  return {
    model: JUDGE_MODEL,
    latencyMs: Math.round(performance.now() - startedAt),
    usage: usageFromOpenAi(payload),
    preferred,
    judgments,
  }
}

function summarize(cases) {
  const selectors = {}
  for (const selector of SELECTORS) {
    const entries = cases.map((testCase) => testCase.selections[selector.key])
    const latencies = entries.map((entry) => entry.latencyMs)
    selectors[selector.key] = {
      model: selector.model,
      meanLatencyMs: Math.round(average(latencies)),
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      averageOverallFit: Number(average(entries.map((entry) => entry.judgment.overallFit)).toFixed(2)),
      noCriticalMismatchCases: entries.filter((entry) => entry.judgment.criticalMismatchCount === 0).length,
      deterministicPassCases: entries.filter((entry) =>
        entry.deterministicChecks.every((check) => check.failures.length === 0),
      ).length,
      averageSuitablePickCount: Number(
        average(entries.map((entry) => entry.judgment.suitablePickCount)).toFixed(2),
      ),
      averageShownCount: Number(average(entries.map((entry) => entry.shownCount)).toFixed(2)),
      preferredCases: cases.filter((testCase) => testCase.judge.preferred === selector.key).length,
      usage: entries.reduce(
        (total, entry) => ({
          inputTokens: total.inputTokens + Number(entry.usage?.inputTokens || 0),
          outputTokens: total.outputTokens + Number(entry.usage?.outputTokens || 0),
          reasoningTokens: total.reasoningTokens + Number(entry.usage?.reasoningTokens || 0),
        }),
        { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
      ),
    }
  }

  return {
    caseCount: cases.length,
    selectors,
    ties: cases.filter((testCase) => testCase.judge.preferred === 'tie').length,
    judge: {
      model: JUDGE_MODEL,
      meanLatencyMs: Math.round(average(cases.map((testCase) => testCase.judge.latencyMs))),
    },
  }
}

export async function runSelectorModelBenchmark({
  cases = CASES,
  claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
  openAiApiKey = process.env.OPENAI_API_KEY,
} = {}) {
  if (!claudeApiKey || !openAiApiKey) {
    throw new Error('CLAUDE_API_KEY (or ANTHROPIC_API_KEY) and OPENAI_API_KEY are required.')
  }

  const requestedLimit = Number.parseInt(process.env.SELECTOR_BENCHMARK_LIMIT || '', 10)
  const selectedCases = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? cases.slice(0, requestedLimit)
    : cases
  const loadedCases = await loadCasesFromSupabase(selectedCases)
  const results = []

  for (const [index, testCase] of loadedCases.entries()) {
    const selections = {}
    for (const selector of RUN_ORDER) {
      const startedAt = performance.now()
      const selection = await runSelector({
        selector,
        candidatePool: testCase.candidatePool,
        claudeApiKey,
        openAiApiKey,
      })
      const shortlist = materializeEligibleShortlist(testCase.candidatePool, selection)
      selections[selector.key] = {
        model: selection.model,
        latencyMs: Math.round(performance.now() - startedAt),
        shortlist,
        shownCount: shortlist.length,
        ids: shortlist.map((candidate) => String(candidate.id)),
        coreIds: selection.coreIds || [],
        alternativeIds: selection.alternativeIds || [],
        suggestedQuery: selection.suggestedQuery || '',
        rejectedIndices: selection.rejectedIndices || [],
        deterministicChecks: summarizeDeterministicChecks(shortlist, testCase.checks),
        usage: selection.usage || null,
      }
      console.log(
        `[${index + 1}/${loadedCases.length}] ${testCase.id} ${selector.key}: ` +
        `${selections[selector.key].latencyMs}ms, ${shortlist.length} shown`,
      )
    }

    const judge = await judgeCase({ testCase, selections, index, openAiApiKey })
    for (const selector of SELECTORS) {
      selections[selector.key].judgment = judge.judgments[selector.key]
      delete selections[selector.key].shortlist
    }
    console.log(
      `[${index + 1}/${loadedCases.length}] ${testCase.id} judge: preferred ${judge.preferred}; ` +
      SELECTORS.map((selector) =>
        `${selector.key} ${judge.judgments[selector.key].overallFit}/5 ` +
        `(${judge.judgments[selector.key].criticalMismatchCount} critical)`,
      ).join(', '),
    )
    results.push({
      id: testCase.id,
      query: testCase.query,
      details: testCase.details,
      candidateCount: testCase.candidatePool.candidates.length,
      selections,
      judge: {
        model: judge.model,
        latencyMs: judge.latencyMs,
        usage: judge.usage,
        preferred: judge.preferred,
      },
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    methodology:
      `Exact stored Supabase Rainforest candidate pools; current deterministic prefilter; identical selector prompt and shortlist contract; sequential model calls in ${RUN_ORDER.map((selector) => selector.key).join(' -> ')} order; blind rotating GPT-5.6 Sol judge; no Rainforest calls or Supabase writes`,
    supabaseAccess: 'read_only',
    summary: summarize(results),
    cases: results,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSelectorModelBenchmark()
    .then((report) => {
      fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
      fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`)
      console.log(JSON.stringify(report.summary, null, 2))
      console.log(`Wrote ${OUTPUT_PATH}`)
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
