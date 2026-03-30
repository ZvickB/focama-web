export const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses'
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini'
export const ALLOWED_RESULT_BADGES = [
  'Best match',
  'Best value',
  'Best budget pick',
  'Best premium pick',
  'Best for durability',
  'Best for comfort',
  'Best for small spaces',
  'Best for beginners',
  'Best lightweight option',
  'Best all-rounder',
]
const REQUIRED_PRIMARY_BADGE = 'Best match'
const MAX_BADGED_RESULTS = 3
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
    'Prioritize:',
    '1. Fit to the extra context/details. This is the main decision signal.',
    '2. Relevance to the product query.',
    '3. Quality and trust using rating and review count.',
    '4. Diversity across style, merchant, or use case when helpful.',
    '5. Avoid near-duplicates unless they are meaningfully different.',
    '6. For each pick, write one short fit reason that explains why it belongs in this shortlist.',
    '7. Be honest about tradeoffs. Each pick should include one short drawback or caution.',
    `8. Badge strategy: exactly one pick must use "${REQUIRED_PRIMARY_BADGE}". You may assign up to ${MAX_BADGED_RESULTS - 1} additional unique badges from the allowed list when they are genuinely helpful. Never assign more than ${MAX_BADGED_RESULTS} badges total.`,
    `Return up to ${desiredCount} picks. If there are at least ${desiredCount} strong candidates, return exactly ${desiredCount}.`,
    'Only choose from the provided candidate ids.',
    `Allowed badge labels: ${ALLOWED_RESULT_BADGES.join(', ')}.`,
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
            drawback: {
              type: 'string',
            },
            badge_label: {
              anyOf: [
                {
                  type: 'string',
                  enum: ALLOWED_RESULT_BADGES,
                },
                {
                  type: 'null',
                },
              ],
            },
          },
          required: ['candidate_id', 'rationale', 'drawback', 'badge_label'],
          additionalProperties: false,
        },
      },
    },
    required: ['picks'],
    additionalProperties: false,
  }
}

function buildUiResult(candidate, rationale, badge = null) {
  return {
    id: candidate.id,
    title: candidate.title,
    subtitle: candidate.source,
    price: candidate.price,
    rating: candidate.rating,
    reviewCount: candidate.reviewCount,
    description: candidate.description,
    reasons: rationale ? [`AI fit: ${rationale}`] : candidate.reasons.slice(0, 1),
    drawbacks: [],
    image: candidate.image,
    link: candidate.link,
    badgeLabel: badge?.label || '',
  }
}

function normalizeBadgeAssignments(selected) {
  const normalized = []
  const usedLabels = new Set()
  let hasBestMatch = false

  for (const entry of selected) {
    if (normalized.length >= MAX_BADGED_RESULTS) {
      break
    }

    const label = typeof entry.badgeLabel === 'string' ? entry.badgeLabel.trim() : ''

    if (!label || !ALLOWED_RESULT_BADGES.includes(label) || usedLabels.has(label)) {
      continue
    }

    normalized.push({
      candidateId: entry.candidateId,
      label,
    })
    usedLabels.add(label)

    if (label === REQUIRED_PRIMARY_BADGE) {
      hasBestMatch = true
    }
  }

  if (!hasBestMatch && selected.length > 0) {
    const fallbackIndex = normalized.findIndex((entry) => entry.candidateId === selected[0].candidateId)

    if (fallbackIndex >= 0) {
      normalized[fallbackIndex] = {
        ...normalized[fallbackIndex],
        label: REQUIRED_PRIMARY_BADGE,
      }
    } else {
      normalized.unshift({
        candidateId: selected[0].candidateId,
        label: REQUIRED_PRIMARY_BADGE,
      })
    }
  }

  const deduped = []
  const seenLabels = new Set()

  for (const entry of normalized) {
    if (deduped.length >= MAX_BADGED_RESULTS || seenLabels.has(entry.label)) {
      continue
    }

    deduped.push(entry)
    seenLabels.add(entry.label)
  }

  return deduped.slice(0, MAX_BADGED_RESULTS)
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
      drawback: pick?.drawback?.trim() || '',
      badgeLabel: typeof pick?.badge_label === 'string' ? pick.badge_label : '',
      candidate,
    })
    seen.add(candidateId)

    if (selected.length >= finalResultLimit) {
      break
    }
  }

  const badgeAssignments = normalizeBadgeAssignments(selected)
  const badgeByCandidateId = new Map(
    badgeAssignments.map((entry) => [
      entry.candidateId,
      {
        label: entry.label,
      },
    ]),
  )

  return {
    selectedCandidateIds: selected.map((entry) => entry.candidateId),
    results: selected.map((entry) => ({
      ...buildUiResult(entry.candidate, entry.rationale, badgeByCandidateId.get(entry.candidateId)),
      drawbacks: entry.drawback ? [entry.drawback] : [],
    })),
  }
}

async function runOneShotSelection({ candidatePool, finalResultLimit, apiKey, model }, fetchImpl) {
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

export async function selectAiResults(
  {
    candidatePool,
    finalResultLimit,
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
    return {
      model,
      selectedCandidateIds: [],
      results: [],
      usage: null,
    }
  }

  const selection = await runOneShotSelection({ candidatePool, finalResultLimit, apiKey, model }, fetchImpl)

  return {
    model,
    selectedCandidateIds: selection.selectedCandidateIds,
    results: selection.results,
    usage: selection.usage,
    strategy: selection.strategy,
  }
}
