/**
 * Paid, opt-in smoke test for shortlist selection.
 *
 * Usage: node --env-file=.env backend/scripts/smoke-haiku-luna.js
 * Uses captured Rainforest results, so it charges only the Anthropic/OpenAI
 * selection calls. It never changes application configuration or data.
 */
import fs from 'node:fs'

import Anthropic from '@anthropic-ai/sdk'

import { selectDistinctCandidates } from '../lib/product-identity.js'

const FIXTURES = [
  ['travel stroller', 'under 15 lb, compact fold suitable for airport travel', 'temp-data/rainforest-samples/travel_stroller_under_15_lb_compact_fold_suitable_for_airpor_2026-08-03T23-04-11-816Z.json'],
  ['wireless headphones', 'for commuting and work calls; comfortable with strong noise cancelling', 'temp-data/rainforest-samples/wireless_headphones_for_commuting_and_work_calls_comfortable_2026-08-03T23-04-21-986Z.json'],
  ['coffee grinder', 'for pour-over coffee; consistent grind, easy to clean, under $150', 'temp-data/rainforest-samples/coffee_grinder_for_pour_over_coffee_consistent_grind_easy_to_2026-08-03T23-04-27-018Z.json'],
]

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
    rating: item.rating ?? null,
    reviewCount: item.ratings_total ?? null,
    source: 'amazon',
    attributes: [],
    duplicateFamilyKey: '',
    trustSignals: { score: 0 },
  })).filter((candidate) => candidate.title && candidate.price).slice(0, 30)

  return { query, details, candidates }
}

function schema(candidateCount) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      picks: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: { index: { type: 'integer', enum: Array.from({ length: candidateCount }, (_, index) => index + 1) } },
          required: ['index'],
        },
      },
    },
    required: ['picks'],
  }
}

function prompt(pool) {
  const candidates = pool.candidates.map((candidate, index) => ({
    index: index + 1, title: candidate.title, brand: candidate.brandName,
    price: candidate.price, rating: candidate.rating, reviewCount: candidate.reviewCount,
    amazonPosition: candidate.amazonPosition, description: candidate.description.slice(0, 140),
  }))
  return [
    'Rank up to 6 products for a real shopper. Prioritize exact product and mandatory user context, then concrete listing evidence, quality/reviews, value, and useful non-cosmetic variety.',
    'Exclude accessories, wrong product types, duplicates, and unsuitable conditions. Return only ordered candidate indexes.',
    `Query: ${pool.query}`,
    `Context: ${pool.details}`,
    `Candidates: ${JSON.stringify(candidates)}`,
  ].join('\n')
}

function finalPicks(pool, indices) {
  const preferredCandidates = indices.map((index) => pool.candidates[index - 1]).filter(Boolean)
  return selectDistinctCandidates({ preferredCandidates, fallbackCandidates: pool.candidates, limit: 6 })
    .map((candidate) => candidate.title)
}

function responseText(payload) {
  return payload.output_text || payload.output?.flatMap((item) => item.content || []).map((part) => part.text || '').join('') || ''
}

function estimateHaikuCost(usage) {
  return ((Number(usage.input_tokens || 0) * 1) + (Number(usage.output_tokens || 0) * 5)) / 1_000_000
}

function estimateLunaCost(usage) {
  const input = Number(usage.input_tokens || 0)
  const cached = Number(usage.input_tokens_details?.cached_tokens || 0)
  const output = Number(usage.output_tokens || 0)
  return (((input - cached) * 0.2) + (cached * 0.02) + (output * 1.2)) / 1_000_000
}

async function selectWithLuna(pool) {
  const startedAt = performance.now()
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiApiKey}` },
    body: JSON.stringify({
      model: 'gpt-5.6-luna', store: false, reasoning: { effort: 'low' },
      input: [{ role: 'system', content: 'Return only the strict JSON schema.' }, { role: 'user', content: prompt(pool) }],
      text: { format: { type: 'json_schema', name: 'shortlist', strict: true, schema: schema(pool.candidates.length) } },
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(`Luna request failed: ${response.status}`)
  return { indices: JSON.parse(responseText(payload)).picks.map((pick) => pick.index), ms: Math.round(performance.now() - startedAt), usage: payload.usage }
}

async function selectWithHaiku(pool) {
  const startedAt = performance.now()
  const tool = { name: 'shortlist', strict: true, input_schema: schema(pool.candidates.length) }
  const response = await new Anthropic({ apiKey: claudeApiKey }).messages.create({
    model: 'claude-haiku-4-5-20251001', max_tokens: 128, temperature: 0,
    system: 'Return only through the shortlist tool.', tools: [tool], tool_choice: { type: 'tool', name: 'shortlist' },
    messages: [{ role: 'user', content: prompt(pool) }],
  })
  const toolUse = response.content.find((item) => item.type === 'tool_use')
  return { indices: toolUse.input.picks.map((pick) => pick.index), ms: Math.round(performance.now() - startedAt), usage: response.usage }
}

for (const fixture of FIXTURES) {
  const pool = createCandidatePool(fixture)
  const [haiku, luna] = await Promise.all([selectWithHaiku(pool), selectWithLuna(pool)])
  console.log(JSON.stringify({
    query: pool.query,
    candidates: pool.candidates.length,
    haiku: { ms: haiku.ms, inputTokens: haiku.usage.input_tokens, outputTokens: haiku.usage.output_tokens, estimatedCostUsd: estimateHaikuCost(haiku.usage), picks: finalPicks(pool, haiku.indices) },
    luna: { ms: luna.ms, inputTokens: luna.usage.input_tokens, outputTokens: luna.usage.output_tokens, estimatedCostUsd: estimateLunaCost(luna.usage), picks: finalPicks(pool, luna.indices) },
  }, null, 2))
}
