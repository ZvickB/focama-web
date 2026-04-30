import Anthropic from '@anthropic-ai/sdk'
import { toFinalizeFastCard } from './layered-contracts.js'

export const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses'
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini'
export const DEFAULT_REFINEMENT_MODEL = DEFAULT_OPENAI_MODEL
export const DEFAULT_FINALIZE_MODEL = DEFAULT_OPENAI_MODEL
export const DEFAULT_CONTEXT_FINALIZE_MODEL = 'gpt-5.4-nano'
export const CANDIDATE_AWARE_PRIOR_VERSION = 1
export const PRE_RANK_ARTIFACT_VERSION = CANDIDATE_AWARE_PRIOR_VERSION
const ARTIFACT_RERANK_CANDIDATE_LIMIT = 12
const DESCRIPTION_BOILERPLATE_TOKENS = new Set([
  'at',
  'buy',
  'discover',
  'explore',
  'find',
  'for',
  'from',
  'on',
  'shop',
])

function normalizeOpenAiUsage(payload) {
  if (!payload?.usage || typeof payload.usage !== 'object' || Array.isArray(payload.usage)) {
    return null
  }

  const inputTokens = Number(payload.usage.input_tokens)
  const outputTokens = Number(payload.usage.output_tokens)
  const totalTokens = Number(payload.usage.total_tokens)
  const reasoningTokens = Number(payload.usage.output_tokens_details?.reasoning_tokens)

  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
    reasoningTokens: Number.isFinite(reasoningTokens) ? reasoningTokens : 0,
  }
}

function getResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text
  }

  const output = Array.isArray(payload?.output) ? payload.output : []
  const chunks = []

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : []

    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        chunks.push(part.text)
      }
    }
  }

  return chunks.join('\n').trim()
}

function truncateText(value, maxLength) {
  const normalized = typeof value === 'string' ? value.trim() : ''

  if (!normalized) {
    return ''
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized
}

function normalizeComparableText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getComparableTokens(value) {
  return normalizeComparableText(value)
    .split(' ')
    .filter(Boolean)
}

function isLowValueDescription(value) {
  const normalized = String(value || '').trim()

  if (!normalized) {
    return true
  }

  return (
    /serpapi search route|live product result returned/i.test(normalized) ||
    /^a shopping option we found for ".+"\.$/i.test(normalized) ||
    /^(\d{1,3}%\s*off|low price|limited time deal|sale|deal|save\s+\d{1,3}%|save\s+\$\d+)[!.]*$/i.test(
      normalized,
    )
  )
}

function isBoilerplateQueryDescription(description, candidate, candidatePoolQuery) {
  const normalizedDescription = String(description || '').trim()

  if (!/^(shop|buy|find|discover|explore)\b/i.test(normalizedDescription)) {
    return false
  }

  const descriptionTokens = getComparableTokens(normalizedDescription)
    .filter((token) => !DESCRIPTION_BOILERPLATE_TOKENS.has(token))

  if (descriptionTokens.length === 0) {
    return true
  }

  const knownTokens = new Set([
    ...getComparableTokens(candidate.title),
    ...getComparableTokens(candidate.source),
    ...getComparableTokens(candidatePoolQuery),
  ])
  const unknownTokenCount = descriptionTokens.filter((token) => !knownTokens.has(token)).length

  return unknownTokenCount <= 1
}

function isReasonRedundant(reason, candidate) {
  const normalizedReason = normalizeComparableText(reason)

  if (!normalizedReason) {
    return true
  }

  const normalizedSource = normalizeComparableText(candidate.source)
  const normalizedPrice = normalizeComparableText(candidate.price)
  const normalizedTitle = normalizeComparableText(candidate.title)

  if (normalizedSource && normalizedReason === `available from ${normalizedSource}`) {
    return true
  }

  if (normalizedPrice && normalizedReason.includes(normalizedPrice)) {
    return true
  }

  if (normalizedTitle && normalizedReason === normalizedTitle) {
    return true
  }

  if (/^(free|fast|same day|next day|2 day|two day)\s+(delivery|shipping)\b/.test(normalizedReason)) {
    return true
  }

  if (/^(delivery|shipping)\s+(available|included)\b/.test(normalizedReason)) {
    return true
  }

  return false
}

function getCandidateSummaryReasons(candidate) {
  const reasons = Array.isArray(candidate.reasons) ? candidate.reasons : []
  const seenReasons = []

  return reasons
    .filter((reason) => !isReasonRedundant(reason, candidate))
    .map((reason) => truncateText(reason, 100))
    .filter(Boolean)
    .filter((reason) => {
      const normalizedReason = normalizeComparableText(reason)

      if (!normalizedReason) {
        return false
      }

      const isNearDuplicate = seenReasons.some(
        (existingReason) =>
          existingReason === normalizedReason ||
          existingReason.includes(normalizedReason) ||
          normalizedReason.includes(existingReason),
      )

      if (isNearDuplicate) {
        return false
      }

      seenReasons.push(normalizedReason)
      return true
    })
    .slice(0, 2)
}

function getCandidateSummaryDescription(candidate, candidatePoolQuery) {
  if (isLowValueDescription(candidate.description)) {
    return ''
  }

  if (isBoilerplateQueryDescription(candidate.description, candidate, candidatePoolQuery)) {
    return ''
  }

  return truncateText(candidate.description, 160)
}

function buildCandidateSummary(candidatePool) {
  return candidatePool.candidates.map((candidate, index) => ({
    id: candidate.id,
    rank: index + 1,
    title: candidate.title,
    description: getCandidateSummaryDescription(candidate, candidatePool.query),
    duplicateFamilyKey: candidate.duplicateFamilyKey || '',
    source: candidate.source,
    price: candidate.price,
    rating: candidate.rating,
    reviewCount: candidate.reviewCount,
    attributes: Array.isArray(candidate.attributes) ? candidate.attributes.slice(0, 6) : [],
    reasons: getCandidateSummaryReasons(candidate),
    trustScore:
      candidate.trustSignals && typeof candidate.trustSignals === 'object' && !Array.isArray(candidate.trustSignals)
        ? Number.isFinite(Number(candidate.trustSignals.score))
          ? Number(candidate.trustSignals.score)
          : 0
        : null,
  }))
}

function buildSelectionPrompt({ candidatePool, finalResultLimit }) {
  const desiredCount = Math.min(finalResultLimit, candidatePool.candidates.length)

  return [
    'Choose the best final products for this shopping request.',
    '1. The user\'s follow-up context is the dominant selection signal — weight it above all other factors. If a candidate violates a hard constraint stated in the context (e.g. exceeds a stated budget), exclude it unless no better option exists. When no candidate fully satisfies the constraint, prefer the closest match — for a budget constraint, prefer the cheapest available option over a more expensive one, even if the cheaper option has lower ratings.',
    '2. Relevance to the product query.',
    '3. Quality and trust using rating and review count.',
    '4. Prefer diversity across style, merchant, or use case when helpful, and avoid near-duplicates unless they are meaningfully different.',
    '5. For each pick, write one short fit reason (1-2 sentences) directed at the user explaining why this product fits their need. Write for the user, not as internal analysis. Do not comment on the search pool, data quality, or missing options.',
    `Return up to ${desiredCount} picks. If there are at least ${desiredCount} strong candidates, return exactly ${desiredCount}.`,
    'Only choose from the provided candidate ids.',
    '',
    `Product query: ${candidatePool.query}`,
    `Extra context: ${candidatePool.details || 'None provided.'}`,
    '',
    'Candidates:',
    JSON.stringify(buildCandidateSummary(candidatePool)),
  ].join('\n')
}

function buildSelectionSchema() {
  return {
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidate_id: {
              type: 'string',
            },
            rationale: {
              type: 'string',
            },
          },
          required: ['candidate_id', 'rationale'],
          additionalProperties: false,
        },
      },
    },
    required: ['picks'],
    additionalProperties: false,
  }
}

function buildCandidateAwarePriorPrompt(candidatePool) {
  return [
    'Create a reusable candidate-aware shopping prior from this candidate pool.',
    'This is not the final shortlist.',
    'Rank every candidate from strongest to weakest baseline fit before any future follow-up context.',
    'Use product-query relevance, quality/trust, and overall shopping usefulness as the baseline ranking signals.',
    'For each candidate, write one short baseline fit note and one short baseline caution.',
    'Keep the notes concise because another step may use this prior later.',
    '',
    `Product query: ${candidatePool.query}`,
    '',
    'Candidates:',
    JSON.stringify(buildCandidateSummary(candidatePool)),
  ].join('\n')
}

function buildCandidateAwarePriorSchema() {
  return {
    type: 'object',
    properties: {
      ranked_candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidate_id: {
              type: 'string',
            },
            baseline_fit: {
              type: 'string',
            },
            baseline_caution: {
              type: 'string',
            },
          },
          required: ['candidate_id', 'baseline_fit', 'baseline_caution'],
          additionalProperties: false,
        },
      },
    },
    required: ['ranked_candidates'],
    additionalProperties: false,
  }
}

function buildPriorRerankPrompt({
  priorCandidates,
  candidatePool,
  finalResultLimit,
}) {
  const desiredCount = Math.min(finalResultLimit, priorCandidates.length)

  return [
    'Choose the best final products with help from this reusable candidate-aware prior.',
    '1. The user\'s follow-up context is the dominant selection signal — weight it above all other factors. If a candidate violates a hard constraint stated in the context (e.g. exceeds a stated budget), exclude it unless no better option exists. When no candidate fully satisfies the constraint, prefer the closest match — for a budget constraint, prefer the cheapest available option over a more expensive one, even if the cheaper option has lower ratings.',
    '2. Retry feedback and exclusions are high-priority intent signals.',
    '3. Use the baseline ranking and notes as helpful prior context, not as a hard rule.',
    '4. Preserve diversity only when it still fits the stated intent well.',
    '5. Return only the selected candidate ids plus one short intent-fit reason (1-2 sentences) for each pick, directed at the user. Do not comment on the search pool, data quality, or missing options.',
    `Return up to ${desiredCount} picks. If there are at least ${desiredCount} strong candidates, return exactly ${desiredCount}.`,
    '',
    `Product query: ${candidatePool.query}`,
    `Extra context: ${candidatePool.details || 'None provided.'}`,
    '',
    'Reusable candidate-aware prior:',
    JSON.stringify(priorCandidates),
  ].join('\n')
}

function buildPriorRerankSchema() {
  return {
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidate_id: {
              type: 'string',
            },
            rationale: {
              type: 'string',
            },
          },
          required: ['candidate_id', 'rationale'],
          additionalProperties: false,
        },
      },
    },
    required: ['picks'],
    additionalProperties: false,
  }
}

function buildUiResult(candidate) {
  return toFinalizeFastCard(candidate)
}

async function requestStructuredSelection(
  {
    prompt,
    schema,
    responseName,
    apiKey,
    model,
  },
  fetchImpl,
) {
  const response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: {
        effort: 'low',
      },
      input: [
        {
          role: 'system',
          content:
            'You are selecting product recommendations for a calm shopping app. Return only the structured output.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: responseName,
          strict: true,
          schema,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI selection request failed: ${errorText.slice(0, 300)}`)
  }

  const payload = await response.json()
  const responseText = getResponseText(payload)
  const usage = normalizeOpenAiUsage(payload)

  if (!responseText) {
    throw new Error('OpenAI selection returned no structured output.')
  }

  return {
    parsed: JSON.parse(responseText),
    usage,
  }
}

function createFallbackBaselineFit(candidate) {
  const summaryReason = getCandidateSummaryReasons(candidate)[0]

  if (summaryReason) {
    return summaryReason
  }

  if (candidate.source) {
    return `Strong baseline option from ${candidate.source}.`
  }

  return 'Strong baseline option for this query.'
}

function createFallbackBaselineCaution(candidate) {
  if (candidate.price) {
    return `Check whether ${candidate.price} fits the budget.`
  }

  return 'Double-check the tradeoffs against your exact needs.'
}

function mapCandidateAwarePrior(rankedCandidates, candidatePool, model) {
  const candidateById = new Map(candidatePool.candidates.map((candidate) => [String(candidate.id), candidate]))
  const seen = new Set()
  const artifactCandidates = []

  for (const entry of rankedCandidates) {
    const candidateId = String(entry?.candidate_id || '')

    if (!candidateId || seen.has(candidateId)) {
      continue
    }

    const candidate = candidateById.get(candidateId)

    if (!candidate) {
      continue
    }

    artifactCandidates.push({
      candidateId,

      title: candidate.title,
      source: candidate.source,
      price: candidate.price,
      rating: candidate.rating,
      reviewCount: candidate.reviewCount,
      attributes: Array.isArray(candidate.attributes) ? candidate.attributes.slice(0, 6) : [],
      trustScore:
        candidate.trustSignals && typeof candidate.trustSignals === 'object' && !Array.isArray(candidate.trustSignals)
          ? Number.isFinite(Number(candidate.trustSignals.score))
            ? Number(candidate.trustSignals.score)
            : 0
          : null,
      baselineFit: truncateText(entry?.baseline_fit, 160) || createFallbackBaselineFit(candidate),
      baselineCaution: truncateText(entry?.baseline_caution, 160) || createFallbackBaselineCaution(candidate),
    })
    seen.add(candidateId)
  }

  for (const candidate of candidatePool.candidates) {
    const candidateId = String(candidate.id)

    if (seen.has(candidateId)) {
      continue
    }

    artifactCandidates.push({
      candidateId,

      title: candidate.title,
      source: candidate.source,
      price: candidate.price,
      rating: candidate.rating,
      reviewCount: candidate.reviewCount,
      attributes: Array.isArray(candidate.attributes) ? candidate.attributes.slice(0, 6) : [],
      trustScore:
        candidate.trustSignals && typeof candidate.trustSignals === 'object' && !Array.isArray(candidate.trustSignals)
          ? Number.isFinite(Number(candidate.trustSignals.score))
            ? Number(candidate.trustSignals.score)
            : 0
          : null,
      baselineFit: createFallbackBaselineFit(candidate),
      baselineCaution: createFallbackBaselineCaution(candidate),
    })
  }

  return {
    version: CANDIDATE_AWARE_PRIOR_VERSION,
    layer: 'candidate_aware_prior',
    generatedAt: new Date().toISOString(),
    model,
    query: candidatePool.query,
    details: candidatePool.details || '',
    discoveryToken: candidatePool.discoveryToken || '',
    candidateCount: candidatePool.candidates.length,
    rankedCandidates: artifactCandidates,
  }
}

function getReusablePriorEntries(candidateAwarePrior, candidates) {
  if (
    !candidateAwarePrior ||
    typeof candidateAwarePrior !== 'object' ||
    Array.isArray(candidateAwarePrior) ||
    candidateAwarePrior.version !== CANDIDATE_AWARE_PRIOR_VERSION ||
    !Array.isArray(candidateAwarePrior.rankedCandidates)
  ) {
    return []
  }

  const candidateById = new Map(candidates.map((candidate) => [String(candidate.id), candidate]))
  const reusableEntries = []

  for (const entry of candidateAwarePrior.rankedCandidates) {
    const candidateId = String(entry?.candidateId || entry?.candidate_id || '')

    if (!candidateId) {
      continue
    }

    const candidate = candidateById.get(candidateId)

    if (!candidate) {
      continue
    }

    reusableEntries.push({
      candidate,
      candidateId,
      baselineCaution: truncateText(entry?.baselineCaution || entry?.baseline_caution, 160),
      baselineFit: truncateText(entry?.baselineFit || entry?.baseline_fit, 160),
      rank: Number.isFinite(Number(entry?.rank))
        ? Number(entry.rank)
        : reusableEntries.length + 1,
      reusableSummary: {
        candidate_id: candidateId,
        rank: Number.isFinite(Number(entry?.rank))
          ? Number(entry.rank)
          : reusableEntries.length + 1,
        title: candidate.title,
        source: candidate.source,
        price: candidate.price,
        rating: candidate.rating,
        reviewCount: candidate.reviewCount,
        attributes: Array.isArray(entry?.attributes)
          ? entry.attributes.slice(0, 6)
          : Array.isArray(candidate.attributes)
            ? candidate.attributes.slice(0, 6)
            : [],
        baseline_fit: truncateText(entry?.baselineFit || entry?.baseline_fit, 160),
        baseline_caution: truncateText(entry?.baselineCaution || entry?.baseline_caution, 160),
        trustScore:
          Number.isFinite(Number(entry?.trustScore))
            ? Number(entry.trustScore)
            : candidate.trustSignals && typeof candidate.trustSignals === 'object' && !Array.isArray(candidate.trustSignals)
              ? Number.isFinite(Number(candidate.trustSignals.score))
                ? Number(candidate.trustSignals.score)
                : 0
              : null,
      },
    })
  }

  return reusableEntries.sort((left, right) => left.rank - right.rank)
}

function mapSelectionPicksToResults(picks, candidates, finalResultLimit) {
  const candidateById = new Map(candidates.map((candidate) => [String(candidate.id), candidate]))
  const seen = new Set()
  const selected = []

  for (const pick of picks) {
    const candidateId = String(pick?.candidate_id || '')

    if (!candidateId || seen.has(candidateId)) {
      continue
    }

    const candidate = candidateById.get(candidateId)

    if (!candidate) {
      continue
    }

    selected.push({
      candidateId,
      rationale: pick?.rationale?.trim() || '',
      candidate,
    })
    seen.add(candidateId)

    if (selected.length >= finalResultLimit) {
      break
    }
  }

  return {
    selectedCandidateIds: selected.map((entry) => entry.candidateId),
    results: selected.map((entry) => buildUiResult(entry.candidate)),
  }
}

function mapPriorRerankPicksToResults(picks, reusableEntries, finalResultLimit) {
  const entryById = new Map(reusableEntries.map((entry) => [entry.candidateId, entry]))
  const seen = new Set()
  const selected = []

  for (const pick of picks) {
    const candidateId = String(pick?.candidate_id || '')

    if (!candidateId || seen.has(candidateId)) {
      continue
    }

    const entry = entryById.get(candidateId)

    if (!entry) {
      continue
    }

    selected.push({
      candidateId,
      rationale: truncateText(pick?.rationale, 300) || entry.baselineFit,
      entry,
    })
    seen.add(candidateId)

    if (selected.length >= finalResultLimit) {
      break
    }
  }

  return {
    selectedCandidateIds: selected.map((entry) => entry.candidateId),
    results: selected.map(({ entry, rationale }) => buildUiResult(entry.candidate, rationale)),
  }
}

function buildNanoLockAndBadgesPrompt({ candidatePool, finalResultLimit }) {
  const desiredCount = Math.min(finalResultLimit, candidatePool.candidates.length)

  return [
    'Choose the best final products.',
    '1. The user\'s follow-up context is the dominant selection signal — weight it above all other factors. If a candidate violates a hard constraint stated in the context (e.g. exceeds a stated budget), exclude it unless no better option exists. When no candidate fully satisfies the constraint, prefer the closest match — for a budget constraint, prefer the cheapest available option over a more expensive one, even if the cheaper option has lower ratings.',
    '2. Relevance to the product query.',
    '3. Quality and trust using rating and review count.',
    '4. Prefer diversity across style, merchant, or use case when helpful.',
    `Return exactly ${desiredCount} picks from the candidates below.`,
    'Only choose from the provided candidate ids.',
    '',
    `Product query: ${candidatePool.query}`,
    `Extra context: ${candidatePool.details || 'None provided.'}`,
    '',
    'Candidates:',
    JSON.stringify(buildCandidateSummary(candidatePool)),
  ].join('\n')
}

function buildNanoLockAndBadgesSchema() {
  return {
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidate_id: { type: 'string' },
          },
          required: ['candidate_id'],
          additionalProperties: false,
        },
      },
    },
    required: ['picks'],
    additionalProperties: false,
  }
}

function buildMiniEnrichmentPrompt({ lockedCandidates, query, details }) {
  return [
    'Write a short explanation for each of these selected products. Write like a trusted assistant, not a salesperson.',
    'The shortlist is already decided. Do not change the order or swap any product.',
    'For each product, write two separate fields:',
    '1. fit_reason: One or two sentences explaining why it was picked for this specific need. Be specific to the user context. Avoid superlatives, hype phrases, and generic positives.',
    '2. caveat: One honest drawback or caveat — practical (e.g. exceeds budget, heavier than alternatives) or contextual (e.g. better if X matters more than Y). Do not skip this even if the pick is strong.',
    'Use feature bullets and any richer product description when they are provided. Prefer concrete product attributes over generic praise.',
    'If richer product detail is missing, fall back to the basic title/price/rating context and do not invent attributes.',
    '',
    `Product query: ${query}`,
    `User context: ${details || 'None provided.'}`,
    '',
    'Selected products (preserve this exact order and these exact candidate_ids):',
    JSON.stringify(lockedCandidates),
  ].join('\n')
}

function buildMiniEnrichmentSchema() {
  return {
    type: 'object',
    properties: {
      enriched: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            candidate_id: { type: 'string' },
            fit_reason: { type: 'string' },
            caveat: { type: 'string' },
          },
          required: ['candidate_id', 'fit_reason', 'caveat'],
          additionalProperties: false,
        },
      },
    },
    required: ['enriched'],
    additionalProperties: false,
  }
}

async function runOneShotSelection(
  { candidatePool, finalResultLimit, apiKey, model },
  fetchImpl,
) {
  const { parsed, usage } = await requestStructuredSelection(
    {
      prompt: buildSelectionPrompt({ candidatePool, finalResultLimit }),
      schema: buildSelectionSchema(),
      responseName: 'product_selection',
      apiKey,
      model,
    },
    fetchImpl,
  )
  const picks = Array.isArray(parsed?.picks) ? parsed.picks : []
  const mapped = mapSelectionPicksToResults(picks, candidatePool.candidates, finalResultLimit)

  return {
    ...mapped,
    strategy: 'single_pass',
    usage,
  }
}

export async function createCandidateAwarePrior(
  {
    candidatePool,
    apiKey,
    model = DEFAULT_OPENAI_MODEL,
  },
  fetchImpl = fetch,
) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing from the root .env file.')
  }

  const candidates = Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : []

  if (candidates.length === 0) {
    const prior = {
      version: CANDIDATE_AWARE_PRIOR_VERSION,
      layer: 'candidate_aware_prior',
      generatedAt: new Date().toISOString(),
      model,
      query: candidatePool?.query || '',
      details: candidatePool?.details || '',
      candidateCount: 0,
      rankedCandidates: [],
    }

    return {
      model,
      prior,
      artifact: prior,
      usage: null,
      strategy: 'candidate_aware_prior',
    }
  }

  const { parsed, usage } = await requestStructuredSelection(
    {
      prompt: buildCandidateAwarePriorPrompt(candidatePool),
      schema: buildCandidateAwarePriorSchema(),
      responseName: 'candidate_aware_prior',
      apiKey,
      model,
    },
    fetchImpl,
  )

  const prior = mapCandidateAwarePrior(parsed?.ranked_candidates || [], candidatePool, model)

  return {
    model,
    prior,
    artifact: prior,
    usage,
    strategy: 'candidate_aware_prior',
  }
}

export const createPreRankArtifact = createCandidateAwarePrior

export async function nanoLockWinnersAndBadges(
  {
    candidatePool,
    finalResultLimit,
    apiKey,
    model = DEFAULT_CONTEXT_FINALIZE_MODEL,
  },
  fetchImpl = fetch,
) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing from the root .env file.')
  }

  const candidates = Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : []

  if (candidates.length === 0) {
    return { model, lockedIds: [], usage: null }
  }

  const { parsed, usage } = await requestStructuredSelection(
    {
      prompt: buildNanoLockAndBadgesPrompt({ candidatePool, finalResultLimit }),
      schema: buildNanoLockAndBadgesSchema(),
      responseName: 'nano_lock_and_badges',
      apiKey,
      model,
    },
    fetchImpl,
  )

  const picks = Array.isArray(parsed?.picks) ? parsed.picks : []
  const candidateById = new Map(candidates.map((candidate) => [String(candidate.id), candidate]))
  const seen = new Set()
  const lockedIds = []

  for (const pick of picks) {
    const candidateId = String(pick?.candidate_id || '')

    if (!candidateId || seen.has(candidateId) || !candidateById.has(candidateId)) {
      continue
    }

    lockedIds.push(candidateId)
    seen.add(candidateId)

    if (lockedIds.length >= finalResultLimit) {
      break
    }
  }

  return { model, lockedIds, usage }
}

export async function haikuLockWinnersAndBadges(
  {
    candidatePool,
    finalResultLimit,
    apiKey,
  },
) {
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY is missing from the root .env file.')
  }

  const candidates = Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : []

  if (candidates.length === 0) {
    return { model: 'claude-haiku-4-5-20251001', lockedIds: [], usage: null }
  }

  const desiredCount = Math.min(finalResultLimit, candidates.length)
  const prompt = buildNanoLockAndBadgesPrompt({ candidatePool, finalResultLimit })
    + '\n\nRespond with valid JSON only: {"picks":[{"candidate_id":"..."},...]}. No explanation.'

  const anthropic = new Anthropic({ apiKey })
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content?.[0]?.type === 'text' ? message.content[0].text.trim() : ''
  const candidateById = new Map(candidates.map((c) => [String(c.id), c]))
  const seen = new Set()
  const lockedIds = []

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    const picks = Array.isArray(parsed?.picks) ? parsed.picks : []

    for (const pick of picks) {
      const id = String(pick?.candidate_id || '')
      if (!id || seen.has(id) || !candidateById.has(id)) continue
      lockedIds.push(id)
      seen.add(id)
      if (lockedIds.length >= desiredCount) break
    }
  } catch {
    // return empty if parse fails
  }

  return {
    model: 'claude-haiku-4-5-20251001',
    lockedIds,
    usage: {
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
    },
  }
}

export async function miniEnrichSelectedCandidates(
  {
    lockedIds,
    candidatePool,
    apiKey,
    model = DEFAULT_OPENAI_MODEL,
  },
  fetchImpl = fetch,
) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing from the root .env file.')
  }

  if (!Array.isArray(lockedIds) || lockedIds.length === 0) {
    return { model, enriched: [], enrichedIds: [], usage: null, preservedOrder: true }
  }

  const candidateById = new Map(
    (Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : []).map((candidate) => [
      String(candidate.id),
      candidate,
    ]),
  )

  const lockedCandidates = lockedIds
    .map((id) => candidateById.get(String(id)))
    .filter(Boolean)
    .map((candidate) => ({
      candidate_id: String(candidate.id),
      title: candidate.title,
      source: candidate.source,
      price: candidate.price,
      rating: candidate.rating,
      reviewCount: candidate.reviewCount,
      feature_bullets: Array.isArray(candidate.feature_bullets) ? candidate.feature_bullets.slice(0, 10) : [],
      product_description: truncateText(candidate.productDescription, 3000),
    }))
  const lockedCandidateById = new Map(
    lockedCandidates.map((candidate) => [String(candidate.candidate_id), candidate]),
  )

  const { parsed, usage } = await requestStructuredSelection(
    {
      prompt: buildMiniEnrichmentPrompt({
        lockedCandidates,
        query: candidatePool.query,
        details: candidatePool.details || '',
      }),
      schema: buildMiniEnrichmentSchema(),
      responseName: 'mini_enrichment',
      apiKey,
      model,
    },
    fetchImpl,
  )

  const rawEnriched = Array.isArray(parsed?.enriched) ? parsed.enriched : []
  const enriched = rawEnriched.map((entry) => {
    const candidateId = String(entry?.candidate_id || '')
    const lockedCandidate = lockedCandidateById.get(candidateId)

    return {
      ...entry,
      feature_bullets: Array.isArray(lockedCandidate?.feature_bullets) ? lockedCandidate.feature_bullets : [],
    }
  })
  const enrichedIds = enriched.map((entry) => String(entry?.candidate_id || ''))
  const enrichedLockedIds = enrichedIds.filter((id) => lockedIds.includes(id))
  const preservedOrder = lockedIds.join(',') === enrichedLockedIds.join(',')

  return { model, enriched, enrichedIds, usage, preservedOrder }
}

