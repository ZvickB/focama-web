/**
 * Paid, opt-in benchmark for blocking AI payload size.
 *
 * Usage: node --env-file=.env backend/scripts/benchmark-ai-payloads.js
 * Uses captured Rainforest fixtures. It calls Anthropic and OpenAI, but does
 * not write application data or change production configuration.
 */
import fs from 'node:fs'

import Anthropic from '@anthropic-ai/sdk'

import {
  DEFAULT_HAIKU_MODEL,
  OPENAI_RESPONSES_ENDPOINT,
  haikuLockWinnersAndBadges,
} from '../lib/ai-selector.js'
import { generateRefinementPrompt } from '../lib/refinement-assistant.js'

const FIXTURES = [
  ['travel stroller', 'under 15 lb, compact fold suitable for airport travel', 'temp-data/rainforest-samples/travel_stroller_under_15_lb_compact_fold_suitable_for_airpor_2026-08-03T23-04-11-816Z.json'],
  ['wireless headphones', 'for commuting and work calls; comfortable with strong noise cancelling', 'temp-data/rainforest-samples/wireless_headphones_for_commuting_and_work_calls_comfortable_2026-08-03T23-04-21-986Z.json'],
  ['coffee grinder', 'for pour-over coffee; consistent grind, easy to clean, under $150', 'temp-data/rainforest-samples/coffee_grinder_for_pour_over_coffee_consistent_grind_easy_to_2026-08-03T23-04-27-018Z.json'],
]
const REFINEMENT_QUERIES = [
  'office chair',
  'travel stroller',
  'wireless headphones',
  'coffee grinder',
  'toddler rain boots',
]
const compactHaikuFirst = process.env.BENCHMARK_COMPACT_HAIKU_FIRST === '1'
const singleRefinementFirst = process.env.BENCHMARK_SINGLE_REFINEMENT_FIRST === '1'
const skipHaiku = process.env.BENCHMARK_SKIP_HAIKU === '1'
const skipRefinement = process.env.BENCHMARK_SKIP_REFINEMENT === '1'
const openAiApiKey = process.env.OPENAI_API_KEY
const claudeApiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY

if (!openAiApiKey || !claudeApiKey) {
  throw new Error('OPENAI_API_KEY and CLAUDE_API_KEY (or ANTHROPIC_API_KEY) are required.')
}

function createCandidatePool([query, details, file]) {
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  const candidates = (payload.search_results || []).map((item, index) => ({
    id: item.asin || String(index + 1),
    title: item.title || '',
    description: item.description || item.brand || '',
    brandName: item.brand || '',
    amazonPosition: item.position || index + 1,
    price: item.price?.raw || item.prices?.[0]?.raw || '',
    numericPrice: item.price?.value ?? item.prices?.[0]?.value ?? null,
    rating: item.rating ?? null,
    reviewCount: item.ratings_total ?? null,
    source: 'amazon',
    isPrime: item.is_prime === true,
    attributes: [],
    reasons: [],
    duplicateFamilyKey: '',
    trustSignals: { score: 0 },
  })).filter((candidate) => candidate.title && candidate.price).slice(0, 30)

  return { query, details, candidates }
}

function shortlistTool(candidateCount) {
  return {
    name: 'submit_shortlist',
    strict: true,
    description: 'Submit the final ordered shortlist using only the supplied candidate indexes.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        picks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              index: { type: 'integer', enum: Array.from({ length: candidateCount }, (_, index) => index + 1) },
              brand: { type: 'string', maxLength: 80 },
              role: { type: 'string', enum: ['core', 'alternative'] },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
            required: ['index', 'brand', 'role', 'confidence'],
          },
        },
        suggested_query: { type: 'string', maxLength: 200 },
        specific_brand: { type: 'boolean' },
      },
      required: ['picks', 'suggested_query', 'specific_brand'],
    },
  }
}

function compactHaikuPrompt(pool) {
  const candidates = pool.candidates.map((candidate, index) => ({
    index: index + 1,
    title: candidate.title.slice(0, 220),
    brand: candidate.brandName,
    price: candidate.numericPrice ?? candidate.price,
    rating: candidate.rating,
    reviews: candidate.reviewCount,
    position: candidate.amazonPosition,
    prime: candidate.isPrime,
  }))

  return [
    'Choose up to 6 high-confidence products for this shopper.',
    'Apply explicit query/context requirements first, including product type, compatibility, budget, size, features, exclusions, and new condition unless another condition is requested.',
    'Then rank by concrete fit, quality confidence, value, useful non-cosmetic variety, and Amazon position as a final tiebreaker.',
    'Exclude accessories, wrong product types, clear mismatches, and duplicate models. A lower-rated eligible item beats an ineligible higher-rated item.',
    'If a brand/model is explicitly requested, prefer matching candidates. Otherwise vary brands when credible alternatives exist.',
    'Return exactly 6 high-confidence picks unless fewer than 4 genuinely fit. Only then return the credible 0-3 and a concise improved suggested_query; otherwise suggested_query must be empty.',
    'Use role core for normal picks. Return each maker in brand and set specific_brand only when the shopper clearly requested one.',
    `Product query: ${pool.query}`,
    `User context: ${pool.details || 'None provided.'}`,
    `Candidates: ${JSON.stringify(candidates)}`,
  ].join('\n')
}

async function runCurrentHaiku(pool) {
  const startedAt = performance.now()
  const result = await haikuLockWinnersAndBadges({
    candidatePool: pool,
    finalResultLimit: 6,
    apiKey: claudeApiKey,
  })
  return {
    ms: Math.round(performance.now() - startedAt),
    inputTokens: result.usage?.inputTokens || 0,
    outputTokens: result.usage?.outputTokens || 0,
    ids: result.lockedIds,
  }
}

async function runCompactHaiku(pool) {
  const tool = shortlistTool(pool.candidates.length)
  const startedAt = performance.now()
  const message = await new Anthropic({ apiKey: claudeApiKey }).messages.create({
    model: DEFAULT_HAIKU_MODEL,
    max_tokens: 256,
    temperature: 0,
    system: 'You are a careful shopping ranker. Follow requirements exactly and respond only through the submit_shortlist tool.',
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: compactHaikuPrompt(pool) }],
  })
  const toolUse = message.content.find((item) => item.type === 'tool_use' && item.name === tool.name)
  const seen = new Set()
  const ids = (Array.isArray(toolUse?.input?.picks) ? toolUse.input.picks : [])
    .map((pick) => Number(pick?.index))
    .filter((index) => Number.isInteger(index) && index >= 1 && index <= pool.candidates.length)
    .filter((index) => {
      if (seen.has(index)) return false
      seen.add(index)
      return true
    })
    .slice(0, 6)
    .map((index) => String(pool.candidates[index - 1].id))

  return {
    ms: Math.round(performance.now() - startedAt),
    inputTokens: message.usage?.input_tokens || 0,
    outputTokens: message.usage?.output_tokens || 0,
    ids,
  }
}

function singleQuestionSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      prompt: { type: 'string', maxLength: 140 },
      refinement_suggestions: {
        type: 'array',
        minItems: 4,
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 30 },
            prompt: { type: 'string', minLength: 1 },
          },
          required: ['label', 'prompt'],
        },
      },
    },
    required: ['prompt', 'refinement_suggestions'],
  }
}

function singleQuestionInput(productQuery) {
  return [
    'Write one short multiple-choice follow-up question for a shopping search before product results exist.',
    'Ask about the single decision factor most likely to change product ranking. Stay query-only and do not assume brands or merchants.',
    'Return exactly four mutually exclusive answers that directly and grammatically answer the question.',
    'The first three answers must be concrete choices of the same type; the fourth must be neutral, such as No preference or Not sure.',
    'Each label must be 1-4 words and at most 30 characters. Each prompt must be one short first-person sentence.',
    'Do not ask yes/no questions or use generic labels such as Quality, Best option, or Top rated.',
    `Product request: ${productQuery}`,
  ].join('\n')
}

function getResponseText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  return (payload?.output || []).flatMap((item) => item?.content || []).map((part) => part?.text || '').join('')
}

async function runCurrentRefinement(query) {
  const startedAt = performance.now()
  const result = await generateRefinementPrompt({
    productQuery: query,
    openAiApiKey,
    model: 'gpt-5.6-luna',
  })
  return {
    ms: Math.round(performance.now() - startedAt),
    inputTokens: result.usage?.inputTokens || 0,
    outputTokens: result.usage?.outputTokens || 0,
    prompt: result.prompt,
    labels: result.answerOptions.map((item) => item.label),
  }
}

async function runSingleRefinement(query) {
  const startedAt = performance.now()
  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiApiKey}` },
    body: JSON.stringify({
      model: 'gpt-5.6-luna',
      store: false,
      reasoning: { effort: 'low' },
      input: [
        { role: 'system', content: 'You help shoppers clarify what matters before choosing products. Return only structured output.' },
        { role: 'user', content: singleQuestionInput(query) },
      ],
      text: { format: { type: 'json_schema', name: 'single_question', strict: true, schema: singleQuestionSchema() } },
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(`OpenAI single-question benchmark failed: ${response.status}`)
  const parsed = JSON.parse(getResponseText(payload))
  return {
    ms: Math.round(performance.now() - startedAt),
    inputTokens: payload.usage?.input_tokens || 0,
    outputTokens: payload.usage?.output_tokens || 0,
    prompt: parsed.prompt,
    labels: parsed.refinement_suggestions.map((item) => item.label),
  }
}

function overlap(left, right) {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const shared = [...leftSet].filter((value) => rightSet.has(value)).length
  return shared / Math.max(1, new Set([...leftSet, ...rightSet]).size)
}

function summarize(records, field) {
  const values = records.map((record) => Number(record[field])).filter(Number.isFinite)
  return Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length))
}

const haikuRecords = []
for (const fixture of skipHaiku ? [] : FIXTURES) {
  const pool = createCandidatePool(fixture)
  let firstCurrent
  let firstCompact
  let secondCompact
  let secondCurrent

  if (compactHaikuFirst) {
    firstCompact = await runCompactHaiku(pool)
    firstCurrent = await runCurrentHaiku(pool)
    secondCurrent = await runCurrentHaiku(pool)
    secondCompact = await runCompactHaiku(pool)
  } else {
    firstCurrent = await runCurrentHaiku(pool)
    firstCompact = await runCompactHaiku(pool)
    secondCompact = await runCompactHaiku(pool)
    secondCurrent = await runCurrentHaiku(pool)
  }
  haikuRecords.push(
    { query: pool.query, variant: 'current', ...firstCurrent },
    { query: pool.query, variant: 'compact', ...firstCompact },
    { query: pool.query, variant: 'compact', ...secondCompact },
    { query: pool.query, variant: 'current', ...secondCurrent },
  )
  console.log(JSON.stringify({
    stage: 'haiku_case',
    query: pool.query,
    candidates: pool.candidates.length,
    current: [firstCurrent, secondCurrent].map(({ ms, inputTokens, outputTokens, ids }) => ({ ms, inputTokens, outputTokens, ids })),
    compact: [firstCompact, secondCompact].map(({ ms, inputTokens, outputTokens, ids }) => ({ ms, inputTokens, outputTokens, ids })),
    crossVariantOverlap: [overlap(firstCurrent.ids, firstCompact.ids), overlap(secondCurrent.ids, secondCompact.ids)],
  }))
}

const refinementRecords = []
for (const query of skipRefinement ? [] : REFINEMENT_QUERIES) {
  let current
  let single

  if (singleRefinementFirst) {
    single = await runSingleRefinement(query)
    current = await runCurrentRefinement(query)
  } else {
    current = await runCurrentRefinement(query)
    single = await runSingleRefinement(query)
  }
  refinementRecords.push(
    { query, variant: 'current', ...current },
    { query, variant: 'single', ...single },
  )
  console.log(JSON.stringify({ stage: 'refinement_case', query, current, single }))
}

const currentHaiku = haikuRecords.filter((record) => record.variant === 'current')
const compactHaiku = haikuRecords.filter((record) => record.variant === 'compact')
const currentRefinement = refinementRecords.filter((record) => record.variant === 'current')
const singleRefinement = refinementRecords.filter((record) => record.variant === 'single')

console.log(JSON.stringify({
  stage: 'summary',
  haiku: {
    current: { meanMs: summarize(currentHaiku, 'ms'), meanInputTokens: summarize(currentHaiku, 'inputTokens'), meanOutputTokens: summarize(currentHaiku, 'outputTokens') },
    compact: { meanMs: summarize(compactHaiku, 'ms'), meanInputTokens: summarize(compactHaiku, 'inputTokens'), meanOutputTokens: summarize(compactHaiku, 'outputTokens') },
  },
  refinement: {
    current: { meanMs: summarize(currentRefinement, 'ms'), meanInputTokens: summarize(currentRefinement, 'inputTokens'), meanOutputTokens: summarize(currentRefinement, 'outputTokens') },
    single: { meanMs: summarize(singleRefinement, 'ms'), meanInputTokens: summarize(singleRefinement, 'inputTokens'), meanOutputTokens: summarize(singleRefinement, 'outputTokens') },
  },
}))
