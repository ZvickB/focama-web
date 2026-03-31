export const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses'
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini'
export const PRE_RANK_ARTIFACT_VERSION = 1
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
    '1. Fit to the extra context/details. This is the main decision signal.',
    '2. Relevance to the product query.',
    '3. Quality and trust using rating and review count.',
    '4. Prefer diversity across style, merchant, or use case when helpful, and avoid near-duplicates unless they are meaningfully different.',
    '6. For each pick, write one short fit reason that explains why it belongs in this shortlist.',
    '7. Be honest about tradeoffs. Each pick should include one short drawback or caution.',
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
            drawback: {
              type: 'string',
            },
          },
          required: ['candidate_id', 'rationale', 'drawback'],
          additionalProperties: false,
        },
      },
    },
    required: ['picks'],
    additionalProperties: false,
  }
}

function buildPreRankPrompt(candidatePool) {
  return [
    'Create a reusable preranked shopping artifact from this candidate pool.',
    'This is not the final shortlist.',
    'Rank every candidate from strongest to weakest baseline fit before any future follow-up context.',
    'Use product-query relevance, quality/trust, and overall shopping usefulness as the baseline ranking signals.',
    'For each candidate, write one short baseline fit note and one short baseline caution.',
    'Keep the notes concise because another step may reuse this artifact later.',
    '',
    `Product query: ${candidatePool.query}`,
    '',
    'Candidates:',
    JSON.stringify(buildCandidateSummary(candidatePool)),
  ].join('\n')
}

function buildPreRankSchema() {
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

function buildArtifactRerankPrompt({ artifactCandidates, candidatePool, finalResultLimit }) {
  const desiredCount = Math.min(finalResultLimit, artifactCandidates.length)

  return [
    'Choose the best final products from this reusable preranked artifact.',
    '1. Intent match to the extra context/details is the strongest signal and should outweigh the baseline prerank when they disagree.',
    '2. Retry feedback and exclusions are high-priority intent signals.',
    '3. Use the prerank and baseline notes as helpful prior context, not as a hard rule.',
    '4. Preserve diversity only when it still fits the stated intent well.',
    '5. Return only the selected candidate ids plus one short intent-fit reason for each pick.',
    `Return up to ${desiredCount} picks. If there are at least ${desiredCount} strong candidates, return exactly ${desiredCount}.`,
    '',
    `Product query: ${candidatePool.query}`,
    `Extra context: ${candidatePool.details || 'None provided.'}`,
    '',
    'Reusable preranked candidates:',
    JSON.stringify(artifactCandidates),
  ].join('\n')
}

function buildArtifactRerankSchema() {
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

function buildUiResult(candidate, rationale) {
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
    badgeLabel: '',
  }
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

function mapPreRankArtifact(rankedCandidates, candidatePool, model) {
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
      rank: artifactCandidates.length + 1,
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
      rank: artifactCandidates.length + 1,
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
    version: PRE_RANK_ARTIFACT_VERSION,
    generatedAt: new Date().toISOString(),
    model,
    query: candidatePool.query,
    details: candidatePool.details || '',
    candidateCount: candidatePool.candidates.length,
    rankedCandidates: artifactCandidates,
  }
}

function getReusableArtifactEntries(preRankArtifact, candidates) {
  if (
    !preRankArtifact ||
    typeof preRankArtifact !== 'object' ||
    Array.isArray(preRankArtifact) ||
    preRankArtifact.version !== PRE_RANK_ARTIFACT_VERSION ||
    !Array.isArray(preRankArtifact.rankedCandidates)
  ) {
    return []
  }

  const candidateById = new Map(candidates.map((candidate) => [String(candidate.id), candidate]))
  const reusableEntries = []

  for (const entry of preRankArtifact.rankedCandidates) {
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
      rank: Number.isFinite(Number(entry?.rank)) ? Number(entry.rank) : reusableEntries.length + 1,
      reusableSummary: {
        candidate_id: candidateId,
        prewarm_rank: Number.isFinite(Number(entry?.rank)) ? Number(entry.rank) : reusableEntries.length + 1,
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

function materializeReusableArtifactResults({ reusableEntries, finalResultLimit }) {
  const selectedEntries = reusableEntries.slice(0, finalResultLimit)

  return {
    selectedCandidateIds: selectedEntries.map((entry) => entry.candidateId),
    results: selectedEntries.map((entry) => ({
      ...buildUiResult(entry.candidate, entry.baselineFit || ''),
      drawbacks: entry.baselineCaution ? [entry.baselineCaution] : [],
    })),
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
      candidate,
    })
    seen.add(candidateId)

    if (selected.length >= finalResultLimit) {
      break
    }
  }

  return {
    selectedCandidateIds: selected.map((entry) => entry.candidateId),
    results: selected.map((entry) => ({
      ...buildUiResult(entry.candidate, entry.rationale),
      drawbacks: entry.drawback ? [entry.drawback] : [],
    })),
  }
}

function mapArtifactRerankPicksToResults(picks, reusableEntries, finalResultLimit) {
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
      rationale: truncateText(pick?.rationale, 160) || entry.baselineFit,
      entry,
    })
    seen.add(candidateId)

    if (selected.length >= finalResultLimit) {
      break
    }
  }

  return {
    selectedCandidateIds: selected.map((entry) => entry.candidateId),
    results: selected.map(({ entry, rationale }) => ({
      ...buildUiResult(entry.candidate, rationale),
      drawbacks: entry.baselineCaution ? [entry.baselineCaution] : [],
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

export async function createPreRankArtifact(
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
    return {
      model,
      artifact: {
        version: PRE_RANK_ARTIFACT_VERSION,
        generatedAt: new Date().toISOString(),
        model,
        query: candidatePool?.query || '',
        details: candidatePool?.details || '',
        candidateCount: 0,
        rankedCandidates: [],
      },
      usage: null,
      strategy: 'prerank_single_pass',
    }
  }

  const { parsed, usage } = await requestStructuredSelection(
    {
      prompt: buildPreRankPrompt(candidatePool),
      schema: buildPreRankSchema(),
      responseName: 'product_prerank_artifact',
      apiKey,
      model,
    },
    fetchImpl,
  )

  return {
    model,
    artifact: mapPreRankArtifact(parsed?.ranked_candidates || [], candidatePool, model),
    usage,
    strategy: 'prerank_single_pass',
  }
}

export function materializePreRankArtifactResults({ preRankArtifact, candidatePool, finalResultLimit }) {
  const reusableEntries = getReusableArtifactEntries(
    preRankArtifact,
    Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : [],
  )

  if (reusableEntries.length === 0) {
    return {
      selectedCandidateIds: [],
      results: [],
      debug: {
        artifactCandidateCount: 0,
        intentMatchRerankUsed: false,
        preRankArtifactReused: false,
        preRankReuseReason: 'artifact_missing_or_invalid',
      },
    }
  }

  const mapped = materializeReusableArtifactResults({
    reusableEntries,
    finalResultLimit,
  })

  return {
    ...mapped,
    debug: {
      artifactCandidateCount: reusableEntries.length,
      intentMatchRerankUsed: false,
      preRankArtifactReused: true,
      preRankReuseReason: 'artifact_direct',
    },
  }
}

export async function selectAiResults(
  {
    candidatePool,
    finalResultLimit,
    apiKey,
    model = DEFAULT_OPENAI_MODEL,
    preRankArtifact = null,
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
      debug: {
        artifactCandidateCount: 0,
        intentMatchRerankUsed: false,
        preRankArtifactReused: false,
        preRankReuseReason: 'no_candidates',
      },
    }
  }

  const reusableEntries = getReusableArtifactEntries(preRankArtifact, candidates)

  if (reusableEntries.length > 0) {
    const artifactCandidates = reusableEntries
      .slice(0, Math.max(finalResultLimit, Math.min(reusableEntries.length, ARTIFACT_RERANK_CANDIDATE_LIMIT)))
      .map((entry) => entry.reusableSummary)

    const { parsed, usage } = await requestStructuredSelection(
      {
        prompt: buildArtifactRerankPrompt({
          artifactCandidates,
          candidatePool,
          finalResultLimit,
        }),
        schema: buildArtifactRerankSchema(),
        responseName: 'artifact_intent_rerank',
        apiKey,
        model,
      },
      fetchImpl,
    )
    const picks = Array.isArray(parsed?.picks) ? parsed.picks : []
    const mapped = mapArtifactRerankPicksToResults(picks, reusableEntries, finalResultLimit)

    if (mapped.results.length > 0) {
      return {
        model,
        selectedCandidateIds: mapped.selectedCandidateIds,
        results: mapped.results,
        usage,
        strategy: 'artifact_intent_rerank',
        debug: {
          artifactCandidateCount: reusableEntries.length,
          intentMatchRerankUsed: true,
          preRankArtifactReused: true,
          preRankReuseReason: 'artifact_intent_rerank',
        },
      }
    }
  }

  const selection = await runOneShotSelection({ candidatePool, finalResultLimit, apiKey, model }, fetchImpl)

  return {
    model,
    selectedCandidateIds: selection.selectedCandidateIds,
    results: selection.results,
    usage: selection.usage,
    strategy: selection.strategy,
    debug: {
      artifactCandidateCount: reusableEntries.length,
      intentMatchRerankUsed: false,
      preRankArtifactReused: false,
      preRankReuseReason: reusableEntries.length > 0 ? 'artifact_rerank_empty_fallback' : 'artifact_missing_or_invalid',
    },
  }
}
