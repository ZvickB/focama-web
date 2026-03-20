export const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses'
export const DEFAULT_OPENAI_MODEL = 'gpt-5-mini'

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

function buildCandidateSummary(candidatePool) {
  return candidatePool.candidates.map((candidate, index) => ({
    id: candidate.id,
    rank: index + 1,
    title: candidate.title,
    description: candidate.description,
    source: candidate.source,
    price: candidate.price,
    numericPrice: candidate.numericPrice,
    rating: candidate.rating,
    reviewCount: candidate.reviewCount,
    delivery: candidate.delivery,
    tag: candidate.tag,
    extensions: candidate.extensions,
    multipleSources: candidate.multipleSources,
    matchSignals: candidate.matchSignals,
    reasons: candidate.reasons,
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
    '6. Be honest about tradeoffs. Each pick should include one short drawback or caution.',
    `Return up to ${desiredCount} picks. If there are at least ${desiredCount} strong candidates, return exactly ${desiredCount}.`,
    'Only choose from the provided candidate ids.',
    '',
    `Product query: ${candidatePool.query}`,
    `Extra context: ${candidatePool.details || 'None provided.'}`,
    `Search state: ${candidatePool.searchState || 'Unknown'}`,
    `Similar queries: ${
      Array.isArray(candidatePool.similarQueries) && candidatePool.similarQueries.length > 0
        ? candidatePool.similarQueries.join(', ')
        : 'None'
    }`,
    '',
    'Candidates:',
    JSON.stringify(buildCandidateSummary(candidatePool), null, 2),
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

function buildUiResult(candidate, rationale) {
  return {
    id: candidate.id,
    title: candidate.title,
    subtitle: candidate.source,
    price: candidate.price,
    rating: candidate.rating,
    reviewCount: candidate.reviewCount,
    description: candidate.description,
    reasons: rationale ? [`AI fit: ${rationale}`, ...candidate.reasons] : candidate.reasons,
    drawbacks: [],
    image: candidate.image,
    link: candidate.link,
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
    }
  }

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
          content: buildSelectionPrompt({ candidatePool, finalResultLimit }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'product_selection',
          strict: true,
          schema: buildSelectionSchema(),
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

  if (!responseText) {
    throw new Error('OpenAI selection returned no structured output.')
  }

  const parsed = JSON.parse(responseText)
  const picks = Array.isArray(parsed?.picks) ? parsed.picks : []
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
    model,
    selectedCandidateIds: selected.map((entry) => entry.candidateId),
    results: selected.map((entry) => ({
      ...buildUiResult(entry.candidate, entry.rationale),
      drawbacks: entry.drawback ? [entry.drawback] : [],
    })),
  }
}
