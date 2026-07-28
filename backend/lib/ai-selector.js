import Anthropic from '@anthropic-ai/sdk'
import {
  RANKING_PREFERENCES,
  normalizeRankingPreference,
} from '../../shared/ranking-preference.js'

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

function parseNumericPrice(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const match = String(value || '').replace(/,/g, '').match(/[0-9]+(?:\.[0-9]+)?/)
  return match ? Number(match[0]) : null
}

const DEEP_DIVE_MODEL_TOKEN = /\b[A-Z]{1,5}[-\s]?\d{2,5}[A-Z0-9]{0,5}\b/
const WEAK_DEEP_DIVE_TITLE = /\b(?:refill|replacement|spare|adapter|cable|cord|charger|case|cover|skin|protector|tips?|hooks?|pack of|count|ct\.?|bundle)\b/i
const CONSUMABLE_DEEP_DIVE_TITLE = /\b(?:protein powder|supplement|vitamin|snack|coffee|tea|soap|shampoo|detergent|paper towels?|toilet paper|wipes|diapers?|batteries?)\b/i

function deterministicDeepDivePrefilter(candidate) {
  const title = String(candidate?.title || '')
  const price = parseNumericPrice(candidate?.numericPrice ?? candidate?.price)
  const reviewCount = Number(candidate?.reviewCount)
  const hasMeaningfulPrice = Number.isFinite(price) && price >= 75
  const hasBrand = Boolean(candidate?.brand || candidate?.match_identifier?.brand || candidate?.matchIdentifier?.brand)
  const hasModelSignal = Boolean(
    candidate?.match_identifier?.model_number ||
    candidate?.matchIdentifier?.model_number ||
    candidate?.matchIdentifier?.modelNumber ||
    DEEP_DIVE_MODEL_TOKEN.test(title),
  )
  const hasReviewSignal = Number.isFinite(reviewCount) && reviewCount >= 50

  if (!hasMeaningfulPrice) {
    return { passed: false, reason: 'low_value' }
  }

  if (WEAK_DEEP_DIVE_TITLE.test(title) || CONSUMABLE_DEEP_DIVE_TITLE.test(title)) {
    return {
      passed: false,
      reason: WEAK_DEEP_DIVE_TITLE.test(title) ? 'accessory_or_replacement' : 'variant_pack_size_risk',
    }
  }

  if (!hasBrand && !hasModelSignal && !hasReviewSignal) {
    return { passed: false, reason: 'weak_identity' }
  }

  return { passed: true, reason: 'prefilter_passed' }
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

function buildIndexedCandidateSummary(candidatePool) {
  return candidatePool.candidates.map((candidate, index) => ({
    index: index + 1,
    brandName: candidate.brandName || '',
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

function buildRankingStrategyLines(rankingPreference) {
  const preference = normalizeRankingPreference(rankingPreference)

  if (preference === RANKING_PREFERENCES.PRICE) {
    return {
      steps: [
        '3. Maintain a basic quality floor between similar-fit candidates.',
        '   Quality confidence includes rating, review count, clear product type, normal consumer relevance,',
        '   and trustScore when available. Reject products with weak fit, weak ratings, or very thin review history',
        '   unless the pool has no better eligible alternatives.',
        '4. After fit and the basic quality floor are satisfied, favor the lowest-priced credible options.',
        '   Prefer real savings for the category, not simply the cheapest item if it looks flimsy, irrelevant,',
        '   under-reviewed, or likely to disappoint the shopper.',
        '5. Keep the strongest contextual fit as the best-overall pick when it is clearly better for the shopper.',
        '   Use the remaining shortlist to surface lower-priced credible alternatives after',
        '   eligibility, fit, quality floor, and price credibility are satisfied.',
      ],
      summary:
        'Within the eligible set, final order priority: (1) inferred shopper intent and exact product fit, (2) basic quality floor, (3) lowest-priced credible value, (4) useful shortlist variety, (5) amazonPosition.',
    }
  }

  if (preference === RANKING_PREFERENCES.BRAND) {
    return {
      steps: [
        '3. Use quality confidence as the next priority between similar-fit candidates.',
        '   Quality confidence includes rating, review count, clear product type, normal consumer relevance,',
        '   and trustScore when available. trustScore is an internal supporting signal where higher means stronger',
        '   basic marketplace confidence; use it only as a tiebreaker, not as proof of fit.',
        '4. Fill the shortlist with recognized category brands whenever they are credible and fit the shopper intent.',
        '   If fewer than the requested number of credible known-brand candidates exist, fill the remaining slots',
        '   with the best fitting credible non-brand alternatives.',
        '   Do not let brand familiarity override product fit, explicit user constraints, weak ratings, or very thin review history.',
        '5. Consider price and useful shortlist variety after fit, quality confidence, and brand coverage.',
        '   Prefer reasonable value for the category and avoid six copies of the same choice.',
      ],
      summary:
        'Within the eligible set, final order priority: (1) inferred shopper intent and exact product fit, (2) quality confidence, (3) recognized category brand among similarly credible candidates, (4) price/value and useful shortlist variety, (5) amazonPosition.',
    }
  }

  if (preference === RANKING_PREFERENCES.RANGE) {
    return {
      steps: [
        '3. Use quality confidence as the next priority between similar-fit candidates.',
        '   Quality confidence includes rating, review count, recognized category brand, clear product type,',
        '   normal consumer relevance, and trustScore when available.',
        '   trustScore is an internal supporting signal where higher means stronger basic marketplace confidence;',
        '   use it only as a tiebreaker, not as proof of fit.',
        '4. Keep the strongest overall fit as pick #1. For picks #2-6, deliberately cover useful differences',
        '   where quality and fit are comparable, including both price tiers and product formats, features, or use cases.',
        '5. Consider price and value within that range. Prefer reasonable value for the category,',
        '   not simply the cheapest or most expensive item.',
      ],
      summary:
        'Within the eligible set, final order priority: (1) inferred shopper intent and exact product fit for the hero pick, (2) quality confidence, (3) useful shortlist range across picks #2-6 where fit is comparable, (4) price/value, (5) amazonPosition.',
    }
  }

  return {
    steps: [
      '3. Use quality confidence as the next priority between similar-fit candidates.',
      '   Quality confidence includes rating, review count, recognized category brand, clear product type,',
      '   normal consumer relevance, and trustScore when available.',
      '   trustScore is an internal supporting signal where higher means stronger basic marketplace confidence;',
      '   use it only as a tiebreaker, not as proof of fit.',
      '   A recognized brand is a positive signal only when the product also fits the shopper intent.',
      '   Do not let brand familiarity override product fit, explicit user constraints, weak ratings, or very thin review history.',
      '4. Consider price and value after fit and quality confidence. Prefer reasonable value for the category,',
      '   not simply the cheapest or most expensive item.',
      '5. Build a useful shortlist, not six copies of the same choice. After fit and quality are satisfied,',
      '   include sensible variety across price ranges, formats, or use cases.',
    ],
    summary:
      'Within the eligible set, final order priority: (1) inferred shopper intent and exact product fit, (2) quality confidence including rating, review count, trustScore, and recognized category brand, (3) price/value, (4) useful shortlist variety, (5) amazonPosition.',
  }
}

function buildMiniPreferenceGuidance(rankingPreference) {
  const preference = normalizeRankingPreference(rankingPreference)

  if (preference === RANKING_PREFERENCES.PRICE) {
    return 'The shopper has an account preference for lower-priced credible picks. Explain value plainly, and call out any quality or review-history tradeoff honestly.'
  }

  if (preference === RANKING_PREFERENCES.LOWEST_PRICE) {
    return 'The shopper chose the lowest prices among options that fit their search. State the price advantage plainly and call out any meaningful quality, feature, or review-history tradeoff honestly.'
  }

  if (preference === RANKING_PREFERENCES.BRAND) {
    return 'The shopper has an account preference for known brands. Mention brand confidence only when it is relevant, and keep caveats honest if a familiar brand has tradeoffs.'
  }

  if (preference === RANKING_PREFERENCES.RANGE) {
    return 'The shopper has an account preference for a wider range of options. Explain why later picks are meaningfully different alternatives rather than weaker copies of the first pick.'
  }

  return ''
}

function buildNanoLockAndBadgesPrompt({
  candidatePool,
  finalResultLimit,
  rankingPreference = RANKING_PREFERENCES.BALANCED,
  allowOptionalAlternatives = false,
}) {
  const desiredCount = Math.min(finalResultLimit, candidatePool.candidates.length)
  const preference = normalizeRankingPreference(rankingPreference)

  if (preference === RANKING_PREFERENCES.LOWEST_PRICE) {
    return [
      'Lowest prices selected.',
      '',
      'Return all candidates that match the search and stated requirements. Exclude only clear mismatches, accessories, duplicates, or products that violate a requirement.',
      '',
      'Reference matching candidates only by the provided index numbers. Mark every returned candidate with role "core" and confidence "high".',
      '',
      `Product query: ${candidatePool.query}`,
      `User context: ${candidatePool.details || 'None provided.'}`,
      '',
      'Candidates:',
      JSON.stringify(buildIndexedCandidateSummary(candidatePool)),
    ].join('\n')
  }

  const rankingStrategy = buildRankingStrategyLines(rankingPreference)

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
    ...rankingStrategy.steps,
    '6. Use amazonPosition as a secondary tiebreaker only - a lower number means Amazon ranked',
    '   it higher for this query, which is a real signal, but does not override fit, quality, or value.',
    '',
    'Eligibility rules (apply before ranking):',
    '1. User context defines eligibility. Treat explicit user context as requirements, not soft preferences. This includes quantity, package format, budget, compatibility, size, material, style, diet/allergy/safety needs, exclusions, "must have" features, and similar purchase requirements.',
    '2. First identify candidates that appear to satisfy the explicit user context. Select final picks from those eligible candidates whenever possible.',
    '3. A lower-rated eligible candidate beats a higher-rated ineligible candidate. Ratings, review count, trust score, price, and marketplace strength are only tie-breakers after eligibility and product relevance.',
    '4. If fewer than the requested number of eligible candidates exist, fill the remaining slots with the closest acceptable alternatives. Prefer alternatives that violate the fewest or least important user-context requirements and still clearly match the original product query.',
    '5. Match the Product query exactly before optimizing quality. Do not reward a high rating if the item is the wrong product type, accessory-only, bundle mismatch, refill/part, or irrelevant variant.',
    '6. If the query names a brand/model, treat it as a strong preference and fill matching eligible slots first. Only use other brands/models when matching candidates are weak, duplicated, unavailable, or clearly worse for the user context.',
    '7. Choose genuinely different products. Never count a colorway, finish, seller, or cosmetic variant of the same model as another recommendation. Different models, generations, capacities, widths, feature tiers, or use cases are valid alternatives. Use duplicateFamilyKey, title similarity, source, and attributes to spot duplicates.',
    '8. Build the best set, not just the top individual scores. Add diversity across use case, price tier, or style only after eligibility, relevance, and quality are satisfied.',
    rankingStrategy.summary,
    allowOptionalAlternatives
      ? `Return exactly 6 strongest core picks first with role "core" and confidence "high". You may then add up to ${Math.max(0, desiredCount - 6)} alternatives with role "alternative" only when they are genuinely credible, fitting substitutes; every alternative must also have confidence "high". Do not pad alternatives with weaker, wrong-type, or merely cheap products.`
      : `Return exactly ${desiredCount} high-confidence picks unless fewer than 4 candidates genuinely fit the product query and user context. Only in that case, return the 0-3 credible picks and do not pad with close-but-wrong alternatives. When returning fewer than 4 picks, provide a concise improved search phrase that combines the product query with the user context; otherwise return an empty suggested_query.`,
    'Reference candidates only by the provided index numbers. Preserve your chosen order from best overall fit to weakest acceptable fit.',
    '',
    `Product query: ${candidatePool.query}`,
    `User context (top priority): ${candidatePool.details || 'None provided.'}`,
    '',
    'Candidates:',
    JSON.stringify(buildIndexedCandidateSummary(candidatePool)),
  ].join('\n')
}

function buildHaikuShortlistTool(candidateCount) {
  const validIndices = Array.from({ length: candidateCount }, (_entry, index) => index + 1)

  return {
    name: 'submit_shortlist',
    description: 'Submit the final ordered shopping shortlist using only the candidate index numbers provided.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        picks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer', enum: validIndices },
              role: { type: 'string', enum: ['core', 'alternative'] },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
            required: ['index', 'role', 'confidence'],
            additionalProperties: false,
          },
        },
        suggested_query: { type: 'string', maxLength: 200 },
      },
      required: ['picks', 'suggested_query'],
      additionalProperties: false,
    },
  }
}

function buildMiniEnrichmentPrompt({
  lockedCandidates,
  query,
  details,
  rankingPreference = RANKING_PREFERENCES.BALANCED,
}) {
  const preferenceGuidance = buildMiniPreferenceGuidance(rankingPreference)

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
    'Also write exactly 3 distinct improvement suggestions for a shopper who may later reject these picks.',
    'Infer plausible tradeoffs or missing priorities from the search and selected products, but do not claim to know why the shopper is unhappy.',
    'Each suggestion needs a short chip label plus a fuller first-person feedback sentence the shopper could send to improve the next search.',
    'Keep each label to 1-3 words and 30 characters or fewer. Keep each feedback sentence to 180 characters or fewer.',
    'Do not repeat a requirement the shopper already clearly specified unless the selected products visibly compromise it.',
    'Keep the three suggestions distinct. Do not recommend a retailer, make unsupported product claims, or change the requested product type.',
    ...(preferenceGuidance ? [preferenceGuidance] : []),
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
      improve_picks_suggestions: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 30 },
            feedback: { type: 'string', minLength: 1, maxLength: 180 },
          },
          required: ['label', 'feedback'],
          additionalProperties: false,
        },
      },
    },
    required: ['enriched', 'improve_picks_suggestions'],
    additionalProperties: false,
  }
}

function normalizeImprovePicksSuggestions(value) {
  if (!Array.isArray(value)) return []

  const seenLabels = new Set()

  return value
    .map((entry) => {
      const label = String(entry?.label || '').replace(/\s+/g, ' ').trim().slice(0, 30)
      const feedback = String(entry?.feedback || '').replace(/\s+/g, ' ').trim().slice(0, 180)
      const normalizedLabel = label.toLocaleLowerCase()

      if (!label || !feedback || seenLabels.has(normalizedLabel)) return null

      seenLabels.add(normalizedLabel)
      return { label, feedback }
    })
    .filter(Boolean)
    .slice(0, 3)
}

export async function haikuLockWinnersAndBadges(
  {
    candidatePool,
    finalResultLimit,
    apiKey,
    rankingPreference = RANKING_PREFERENCES.BALANCED,
    allowOptionalAlternatives = false,
  },
) {
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY is missing from the root .env file.')
  }

  const candidates = Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : []

  if (candidates.length === 0) {
    return { model: DEFAULT_HAIKU_MODEL, lockedIds: [], suggestedQuery: '', usage: null }
  }

  const desiredCount = Math.min(finalResultLimit, candidates.length)
  const preference = normalizeRankingPreference(rankingPreference)
  const prompt = buildNanoLockAndBadgesPrompt({
    candidatePool,
    finalResultLimit,
    rankingPreference,
    allowOptionalAlternatives,
  })
  const shortlistTool = buildHaikuShortlistTool(candidates.length)

  const anthropic = new Anthropic({ apiKey })
  const message = await anthropic.messages.create({
    model: DEFAULT_HAIKU_MODEL,
    max_tokens: preference === RANKING_PREFERENCES.LOWEST_PRICE ? 512 : 256,
    temperature: 0,
    system:
      'You are a careful shopping ranker. Follow user constraints exactly and respond only through the submit_shortlist tool.',
    tools: [shortlistTool],
    tool_choice: { type: 'tool', name: shortlistTool.name },
    messages: [{ role: 'user', content: prompt }],
  })

  const toolUseBlock = message.content?.find(
    (block) => block?.type === 'tool_use' && block?.name === shortlistTool.name,
  )
  const picks = Array.isArray(toolUseBlock?.input?.picks) ? toolUseBlock.input.picks : []
  const suggestedQuery = String(toolUseBlock?.input?.suggested_query || '').trim().slice(0, 200)
  const seen = new Set()
  const lockedIds = []
  const coreIds = []
  const alternativeIds = []
  const rejectedIndices = []

  console.log('[haiku-lock] tool picks count:', picks.length, 'desired:', desiredCount)

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
    if (pick?.role === 'alternative') {
      if (pick?.confidence !== 'high') {
        rejectedIndices.push({ index, reason: 'alternative_not_high_confidence' })
        continue
      }
      lockedIds.push(id)
      alternativeIds.push(id)
    } else {
      lockedIds.push(id)
      coreIds.push(id)
    }
    seen.add(index)
    if (preference !== RANKING_PREFERENCES.LOWEST_PRICE && lockedIds.length >= desiredCount) break
  }

  if (rejectedIndices.length > 0) {
    console.log('[haiku-lock] rejected indices:', JSON.stringify(rejectedIndices))
  }
  console.log('[haiku-lock] locked:', lockedIds.length, '/', desiredCount, JSON.stringify(lockedIds))

  return {
    model: DEFAULT_HAIKU_MODEL,
    lockedIds,
    coreIds,
    alternativeIds,
    suggestedQuery,
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
    rankingPreference = RANKING_PREFERENCES.BALANCED,
  },
  fetchImpl = fetch,
) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing from the root .env file.')
  }

  if (!Array.isArray(lockedIds) || lockedIds.length === 0) {
    return {
      model,
      enriched: [],
      enrichedIds: [],
      improvePicksSuggestions: [],
      usage: null,
      preservedOrder: true,
    }
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
        rankingPreference,
      }),
      schema: buildMiniEnrichmentSchema(),
      responseName: 'mini_enrichment',
      apiKey,
      model,
    },
    fetchImpl,
  )

  const rawEnriched = Array.isArray(parsed?.enriched) ? parsed.enriched : []
  const improvePicksSuggestions = normalizeImprovePicksSuggestions(parsed?.improve_picks_suggestions)
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

  return { model, enriched, enrichedIds, improvePicksSuggestions, usage, preservedOrder }
}

export async function assessDeepDiveEligibility({ lockedIds, candidatePool }) {
  const model = 'deterministic-prefilter'

  if (!Array.isArray(lockedIds) || lockedIds.length === 0) {
    return { model, decisions: [], usage: null }
  }

  const candidateById = new Map(
    (Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : []).map((candidate) => [
      String(candidate.id),
      candidate,
    ]),
  )
  const decisions = []

  for (const id of lockedIds) {
    const candidate = candidateById.get(String(id))
    if (!candidate) continue

    const prefilter = deterministicDeepDivePrefilter(candidate)
    decisions.push(
      prefilter.passed
        ? {
            candidate_id: String(candidate.id),
            recommendation: 'show',
            mode: 'offers',
            confidence: 'high',
            reason: 'prefilter_passed',
          }
        : {
            candidate_id: String(candidate.id),
            recommendation: 'hide',
            mode: 'hide',
            confidence: 'high',
            reason: prefilter.reason === 'low_value' ? 'generic_low_value' : prefilter.reason,
          },
    )
  }

  return { model, decisions, usage: null }
}
