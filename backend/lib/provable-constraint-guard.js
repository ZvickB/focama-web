const EXCLUDABLE_TERMS = [
  { key: 'accessory', query: /\baccessor(?:y|ies)\b/i, candidate: /\baccessor(?:y|ies)\b/i, scope: 'title' },
  { key: 'attachment', query: /\battachments?\b/i, candidate: /\battachments?\b/i, scope: 'title' },
  { key: 'book', query: /\b(?:books?|cookbooks?|manuals?|guides?)\b/i, candidate: /\b(?:books?|cookbooks?|manuals?|guides?)\b/i, scope: 'title' },
  { key: 'case', query: /\bcases?\b/i, candidate: /\bcases?\b/i, scope: 'title' },
  { key: 'cover', query: /\bcovers?\b/i, candidate: /\bcovers?\b/i, scope: 'title' },
  { key: 'liner', query: /\bliners?\b/i, candidate: /\bliners?\b/i, scope: 'title' },
  { key: 'part', query: /\bparts?\b/i, candidate: /\bparts?\b/i, scope: 'title' },
  { key: 'refill', query: /\brefills?\b/i, candidate: /\brefills?\b/i, scope: 'title' },
  { key: 'replacement', query: /\breplacements?\b/i, candidate: /\breplacements?\b/i, scope: 'title' },
  { key: 'vacuum', query: /\bvacuums?\b/i, candidate: /\bvacuums?\b/i, scope: 'title' },
  { key: 'charger', query: /\bchargers?\b/i, candidate: /\bchargers?\b/i, scope: 'title' },
  { key: 'cable', query: /\bcables?\b/i, candidate: /\bcables?\b/i, scope: 'title' },
  { key: 'adapter', query: /\badapters?\b/i, candidate: /\badapters?\b/i, scope: 'title' },
  { key: 'wool', query: /\bwool\b/i, candidate: /\bwool\b/i, scope: 'all' },
  { key: 'fleece', query: /\bfleece\b/i, candidate: /\bfleece\b/i, scope: 'all' },
  { key: 'chicken', query: /\bchicken\b/i, candidate: /\bchicken\b/i, scope: 'all' },
  { key: 'gluten', query: /\bgluten\b/i, candidate: /\bgluten\b/i, scope: 'all' },
  { key: 'dairy', query: /\bdairy\b/i, candidate: /\bdairy\b/i, scope: 'all' },
  { key: 'latex', query: /\blatex\b/i, candidate: /\blatex\b/i, scope: 'all' },
  { key: 'leather', query: /\bleather\b/i, candidate: /\bleather\b/i, scope: 'all' },
]

const MODEL_ANCHOR_STOP_WORDS = new Set([
  'a', 'an', 'and', 'best', 'budget', 'for', 'from', 'in', 'model', 'new', 'of', 'on', 'the', 'with',
])

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function candidatePrice(candidate) {
  if (
    candidate?.numericPrice !== null &&
    candidate?.numericPrice !== undefined &&
    Number.isFinite(Number(candidate.numericPrice))
  ) {
    return Number(candidate.numericPrice)
  }
  const match = String(candidate?.price || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function collectPriceMatches(text, pattern, inclusive, matches) {
  for (const match of text.matchAll(pattern)) {
    const amount = Number(match[1])
    if (Number.isFinite(amount) && amount > 0) matches.push({ amount, inclusive })
  }
}

export function extractPriceCeiling(...values) {
  const text = normalizeWhitespace(values.filter(Boolean).join(' '))
  if (!text) return null

  const matches = []
  collectPriceMatches(
    text,
    /\b(?:under|below|less than)\s*(?:usd|cad)?\s*\$\s*(\d+(?:\.\d{1,2})?)/gi,
    false,
    matches,
  )
  collectPriceMatches(
    text,
    /\b(?:budget|price|priced|cost|spend|spending)\b[^.!?]{0,28}\b(?:under|below|less than)\s*(?:usd|cad)?\s*\$?\s*(\d+(?:\.\d{1,2})?)/gi,
    false,
    matches,
  )
  collectPriceMatches(
    text,
    /\b(?:no more than|at most|up to|max(?:imum)?(?: spend| budget| price)?(?: is| of)?)\s*(?:usd|cad)?\s*\$\s*(\d+(?:\.\d{1,2})?)/gi,
    true,
    matches,
  )
  collectPriceMatches(
    text,
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:or less|maximum|max)\b/gi,
    true,
    matches,
  )

  if (matches.length === 0) return null
  if (new Set(matches.map((match) => match.amount)).size > 1) return null
  return matches.reduce((tightest, match) => {
    if (match.amount < tightest.amount) return match
    if (match.amount === tightest.amount && !match.inclusive) return match
    return tightest
  })
}

function exclusionClauses(...values) {
  return normalizeWhitespace(values.filter(Boolean).join(' '))
    .split(/[,.;!?]+/)
    .map((clause) => clause.trim())
    .filter(Boolean)
}

export function extractExplicitExclusions(...values) {
  const clauses = exclusionClauses(...values)
  const exclusions = []

  for (const term of EXCLUDABLE_TERMS) {
    const excluded = clauses.some((clause) => {
      if (!term.query.test(clause)) return false
      if (new RegExp(`\\b${term.key}[ -]?free\\b`, 'i').test(clause)) return true
      if (/\bnot\s+just\b/i.test(clause)) return false

      const queryPattern = term.query.source
      const directNegation = new RegExp(
        `\\b(?:not|without|avoid|excluding?|exclude)\\b(?:\\s+(?:a|an|any|the))?(?:\\s+[a-z0-9-]+){0,3}\\s+(?:${queryPattern})`,
        'i',
      )
      const directNo = new RegExp(
        `\\bno\\b(?!\\s+more\\s+than)(?:\\s+(?:a|an|any|the))?(?:\\s+[a-z0-9-]+){0,3}\\s+(?:${queryPattern})`,
        'i',
      )
      return directNegation.test(clause) || directNo.test(clause)
    })
    if (excluded) exclusions.push(term)
  }

  return exclusions
}

function tokens(value) {
  return String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []
}

export function extractRequiredYearModel(productQuery = '') {
  const queryTokens = tokens(productQuery)
  const yearIndex = queryTokens.findLastIndex((token) => /^(?:19|20)\d{2}$/.test(token))
  if (yearIndex < 2 || yearIndex !== queryTokens.length - 1) return null

  const anchorTokens = queryTokens
    .slice(Math.max(0, yearIndex - 4), yearIndex)
    .filter((token) => !MODEL_ANCHOR_STOP_WORDS.has(token))
    .slice(-3)

  if (anchorTokens.length < 2) return null
  return { year: queryTokens[yearIndex], anchorTokens }
}

export function extractProvableConstraints({ productQuery = '', userContext = '' } = {}) {
  const priceCeiling = extractPriceCeiling(productQuery, userContext)
  const exclusions = extractExplicitExclusions(productQuery, userContext)
  const requiredYearModel = extractRequiredYearModel(productQuery)

  return {
    priceCeiling,
    exclusions,
    requiredYearModel,
    activeCount: Number(Boolean(priceCeiling)) + exclusions.length + Number(Boolean(requiredYearModel)),
  }
}

export function evaluateProvableConstraints(candidate, constraints) {
  const failures = []
  const price = candidatePrice(candidate)

  if (constraints?.priceCeiling) {
    const { amount, inclusive } = constraints.priceCeiling
    if (price === null) {
      failures.push({ reason: 'price_missing_for_ceiling', constraint: `price_${inclusive ? 'at_most' : 'under'}_${amount}` })
    } else if (inclusive ? price > amount : price >= amount) {
      failures.push({ reason: 'price_above_ceiling', constraint: `price_${inclusive ? 'at_most' : 'under'}_${amount}` })
    }
  }

  const titleEvidence = normalizeWhitespace(candidate?.title)
  const allEvidence = normalizeWhitespace([
    candidate?.title,
    candidate?.description,
    ...(Array.isArray(candidate?.attributes) ? candidate.attributes : []),
    ...(Array.isArray(candidate?.extensions) ? candidate.extensions : []),
  ].filter(Boolean).join(' '))

  for (const exclusion of constraints?.exclusions || []) {
    const evidence = exclusion.scope === 'all' ? allEvidence : titleEvidence
    if (exclusion.candidate.test(evidence)) {
      failures.push({ reason: 'explicit_exclusion_match', constraint: `exclude_${exclusion.key}` })
    }
  }

  if (constraints?.requiredYearModel) {
    const titleTokens = new Set(tokens(`${candidate?.title || ''} ${candidate?.brandName || candidate?.brand || ''}`))
    const requiredTokens = [
      ...constraints.requiredYearModel.anchorTokens,
      constraints.requiredYearModel.year,
    ]
    if (!requiredTokens.every((token) => titleTokens.has(token))) {
      failures.push({
        reason: 'required_year_model_missing',
        constraint: `require_${requiredTokens.join('_')}`,
      })
    }
  }

  return failures
}

export function filterCandidatesByProvableConstraints({
  candidates = [],
  productQuery = '',
  userContext = '',
} = {}) {
  const source = Array.isArray(candidates) ? candidates : []
  const constraints = extractProvableConstraints({ productQuery, userContext })
  if (constraints.activeCount === 0) {
    return {
      candidates: source,
      constraints: { activeCount: 0, excludedTerms: [], priceCeiling: null, requiredYearModel: null },
      rejections: [],
    }
  }

  const accepted = []
  const rejections = []

  for (const candidate of source) {
    const failures = evaluateProvableConstraints(candidate, constraints)
    if (failures.length === 0) {
      accepted.push(candidate)
      continue
    }
    rejections.push({ id: String(candidate?.id || ''), failures })
  }

  return {
    candidates: accepted,
    constraints: {
      activeCount: constraints.activeCount,
      excludedTerms: constraints.exclusions.map((exclusion) => exclusion.key),
      priceCeiling: constraints.priceCeiling,
      requiredYearModel: constraints.requiredYearModel,
    },
    rejections,
  }
}
