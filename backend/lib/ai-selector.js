import Anthropic from '@anthropic-ai/sdk'

export const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses'
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini'
export const DEFAULT_NANO_MODEL = 'gpt-5.4-nano'
export const DEFAULT_HAIKU_MODEL = 'claude-haiku-4-5-20251001'
export const DEFAULT_REFINEMENT_MODEL = DEFAULT_OPENAI_MODEL
export const DEFAULT_FINALIZE_MODEL = DEFAULT_OPENAI_MODEL
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
  return candidatePool.candidates.map((candidate) => ({
    id: candidate.id,
    amazonPosition: candidate.amazonPosition ?? null,
    title: candidate.title,
    description: getCandidateSummaryDescription(candidate, candidatePool.query),
    duplicateFamilyKey: candidate.duplicateFamilyKey || '',
    source: candidate.source,
    price: candidate.price,
    rating: candidate.rating,
    reviewCount: candidate.reviewCount,
    isPrime: Boolean(candidate.isPrime),
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
            'You are a trusted shopping assistant helping a real person make a purchase decision. Return only the structured output.',
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

function buildNanoLockAndBadgesPrompt({ candidatePool, finalResultLimit }) {
  const desiredCount = Math.min(finalResultLimit, candidatePool.candidates.length)

  return [
    'Select the final shopping shortlist for a real purchase decision.',
    '',
    'Ranking approach - apply in this order:',
    '1. Read the product query and infer what a shopper using those exact words most likely needs.',
    '   Examples: "travel stroller" -> compact fold, low weight, transit/airline friendly.',
    '   "jogging stroller" -> all-terrain wheels, stability, jogging-safe frame.',
    '   "standing desk" -> height-adjustable, motor quality, surface size.',
    '   "beginner guitar" -> playability, low action, starter-friendly.',
    '2. Use each candidate\'s title as the primary fit signal - weight, fold type, terrain,',
    '   size, and use-case claims appear there. Rank #1 as the strongest concrete example',
    '   of the inferred use case. Do not default to highest-rated when fit signals differ.',
    '3. Use rating and review count as quality tiebreakers between similar-fit candidates.',
    '4. Use amazonPosition as a secondary tiebreaker only - a lower number means Amazon ranked',
    '   it higher for this query, which is a real signal, but does not override fit or quality.',
    '',
    'Eligibility rules (apply before ranking):',
    '1. User context defines eligibility. Treat explicit user context as requirements, not soft preferences. This includes quantity, package format, budget, compatibility, size, material, style, diet/allergy/safety needs, exclusions, "must have" features, and similar purchase requirements.',
    '2. First identify candidates that appear to satisfy the explicit user context. Select final picks from those eligible candidates whenever possible.',
    '3. A lower-rated eligible candidate beats a higher-rated ineligible candidate. Ratings, review count, trust score, price, and marketplace strength are only tie-breakers after eligibility and product relevance.',
    '4. If fewer than the requested number of eligible candidates exist, fill the remaining slots with the closest acceptable alternatives. Prefer alternatives that violate the fewest or least important user-context requirements and still clearly match the original product query.',
    '5. Match the Product query exactly before optimizing quality. Do not reward a high rating if the item is the wrong product type, accessory-only, bundle mismatch, refill/part, or irrelevant variant.',
    '6. If the query names a brand/model, treat it as a strong preference and fill matching eligible slots first. Only use other brands/models when matching candidates are weak, duplicated, unavailable, or clearly worse for the user context.',
    '7. Avoid near-duplicate results. Do not pick multiple sizes/colors/sellers of the same product unless that variety is genuinely useful. Use duplicateFamilyKey, title similarity, source, and attributes to spot duplicates.',
    '8. Build the best set, not just the top individual scores. Add diversity across use case, price tier, or style only after eligibility, relevance, and quality are satisfied.',
    'Within the eligible set, final order priority: (1) fit for inferred use case from title, (2) rating and review count, (3) amazonPosition.',
    `Return exactly ${desiredCount} picks from the candidates below.`,
    'Only choose from the provided candidate ids. Preserve your chosen order from best overall fit to weakest acceptable fit.',
    '',
    `Product query: ${candidatePool.query}`,
    `User context (top priority): ${candidatePool.details || 'None provided.'}`,
    '',
    'Candidates:',
    JSON.stringify(buildCandidateSummary(candidatePool)),
  ].join('\n')
}

function buildMiniEnrichmentPrompt({ lockedCandidates, query, details }) {
  return [
    'Write a short explanation for each of these selected products. Write like a trusted assistant, not a salesperson.',
    'The shortlist is already decided. Do not change the order or swap any product.',
    'The selected products are ordered from best overall fit to weakest acceptable fit.',
    'Write the first product as the confident hero recommendation: explain why it is the strongest match for the shopper\'s actual need while still keeping the caveat honest.',
    'For every later product, write it as an alternative to the first product. Explain what kind of shopper would prefer it over the hero, such as a different budget, size, feature tradeoff, style, or use case. Do not merely repeat why it is generally good.',
    'For each product, write two separate fields:',
    '1. fit_reason: One or two sentences explaining why it was picked for this specific need. Lead with what the product actually does for the use case — not with a quote of the user\'s preference. Do not open with "Because you mentioned…" or "Given that you said…". If user context shaped the pick, weave it in naturally, but the sentence should read like a recommendation, not a justification. Avoid superlatives, hype phrases, and generic positives.',
    '2. caveat: One honest drawback or caveat — practical (e.g. exceeds budget, heavier than alternatives) or contextual (e.g. better if X matters more than Y). If the product conflicts with something the user stated (e.g. a different material, higher price), flag it here, not in fit_reason. Do not skip this even if the pick is strong.',
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
    return { model: DEFAULT_HAIKU_MODEL, lockedIds: [], usage: null }
  }

  const desiredCount = Math.min(finalResultLimit, candidates.length)
  const prompt = buildNanoLockAndBadgesPrompt({ candidatePool, finalResultLimit })
    + '\n\nRespond with valid JSON only: {"picks":[{"candidate_id":"..."},...]}. No explanation.'

  const anthropic = new Anthropic({ apiKey })
  const message = await anthropic.messages.create({
    model: DEFAULT_HAIKU_MODEL,
    max_tokens: 256,
    temperature: 0,
    system:
      'You are a careful shopping ranker. Follow user constraints exactly and return only the requested JSON.',
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content?.[0]?.type === 'text' ? message.content[0].text.trim() : ''
  const candidateById = new Map(candidates.map((c) => [String(c.id), c]))
  const seen = new Set()
  const lockedIds = []
  const rejectedIds = []

  console.log('[haiku-lock] raw response:', text)

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    const picks = Array.isArray(parsed?.picks) ? parsed.picks : []

    console.log('[haiku-lock] parsed picks count:', picks.length, 'desired:', desiredCount)

    for (const pick of picks) {
      const id = String(pick?.candidate_id || '')
      if (!id) {
        rejectedIds.push({ id, reason: 'empty' })
        continue
      }
      if (seen.has(id)) {
        rejectedIds.push({ id, reason: 'duplicate' })
        continue
      }
      if (!candidateById.has(id)) {
        rejectedIds.push({ id, reason: 'not_in_pool' })
        continue
      }
      lockedIds.push(id)
      seen.add(id)
      if (lockedIds.length >= desiredCount) break
    }
  } catch (err) {
    console.log('[haiku-lock] parse error:', err?.message)
  }

  if (rejectedIds.length > 0) {
    console.log('[haiku-lock] rejected ids:', JSON.stringify(rejectedIds))
  }
  console.log('[haiku-lock] locked:', lockedIds.length, '/', desiredCount, JSON.stringify(lockedIds))

  return {
    model: DEFAULT_HAIKU_MODEL,
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

