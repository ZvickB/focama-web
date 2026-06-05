export const LAYERED_CONTRACT_VERSION = 1
export const LAYERED_CONTRACTS = Object.freeze({
  queryFraming: Object.freeze({
    key: 'query_framing',
    version: LAYERED_CONTRACT_VERSION,
    status: 'planned',
    owner: 'query_only',
  }),
  finalizeFast: Object.freeze({
    key: 'finalize_fast',
    version: LAYERED_CONTRACT_VERSION,
    status: 'planned_with_current_overlap',
    owner: 'latest_user_context',
  }),
  enrichment: Object.freeze({
    key: 'enrichment',
    version: LAYERED_CONTRACT_VERSION,
    status: 'planned',
    owner: 'locked_shortlist',
  }),
})

const QUERY_FRAMING_AXIS_LIMIT = 4
const QUERY_FRAMING_HINT_LIMIT = 4
const FINALIZE_REASON_LIMIT = 1

function truncateText(value, maxLength) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''

  if (!normalizedValue) {
    return ''
  }

  return normalizedValue.slice(0, maxLength)
}

function compactStringArray(values, { maxItems, maxLength }) {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .map((value) => truncateText(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

export function createQueryFramingContract({
  query = '',
  categoryHint = '',
  framingSummary = '',
  tradeoffAxes = [],
  refinementHints = [],
  generatedAt = null,
} = {}) {
  return {
    version: LAYERED_CONTRACTS.queryFraming.version,
    layer: LAYERED_CONTRACTS.queryFraming.key,
    query: truncateText(query, 200),
    categoryHint: truncateText(categoryHint, 80),
    framingSummary: truncateText(framingSummary, 160),
    tradeoffAxes: compactStringArray(tradeoffAxes, {
      maxItems: QUERY_FRAMING_AXIS_LIMIT,
      maxLength: 80,
    }),
    refinementHints: compactStringArray(refinementHints, {
      maxItems: QUERY_FRAMING_HINT_LIMIT,
      maxLength: 120,
    }),
    generatedAt: generatedAt || null,
  }
}

export function toFinalizeFastCard(candidate) {
  return {
    id: truncateText(candidate?.id, 200),
    title: truncateText(candidate?.title, 300),
    subtitle: truncateText(candidate?.subtitle || candidate?.source, 160),
    price: truncateText(candidate?.price, 80),
    rating: Number.isFinite(Number(candidate?.rating)) ? Number(candidate.rating) : null,
    reviewCount: Number.isFinite(Number(candidate?.reviewCount)) ? Number(candidate.reviewCount) : null,
    isPrime: Boolean(candidate?.isPrime),
    description: truncateText(candidate?.description, 1200),
    feature_bullets: compactStringArray(candidate?.feature_bullets, {
      maxItems: 10,
      maxLength: 320,
    }),
    image: truncateText(candidate?.image, 1000),
    link: truncateText(candidate?.link, 1000),
    badgeLabel: '',
  }
}

export function createFinalizeFastContract({
  query = '',
  discoveryToken = '',
  latestUserContext = '',
  selectedCandidateIds = [],
  shortlist = [],
  model = '',
  strategy = '',
  generatedAt = null,
} = {}) {
  return {
    version: LAYERED_CONTRACTS.finalizeFast.version,
    layer: LAYERED_CONTRACTS.finalizeFast.key,
    query: truncateText(query, 200),
    discoveryToken: truncateText(discoveryToken, 300),
    latestUserContext: truncateText(latestUserContext, 500),
    shortlistLocked: true,
    selectedCandidateIds: compactStringArray(selectedCandidateIds, {
      maxItems: shortlist.length || 6,
      maxLength: 200,
    }),
    shortlist: Array.isArray(shortlist) ? shortlist.map((entry) => toFinalizeFastCard(entry)) : [],
    model: truncateText(model, 80),
    strategy: truncateText(strategy, 80),
    generatedAt: generatedAt || null,
  }
}

export function createEnrichmentContract({
  query = '',
  shortlistIds = [],
  generatedAt = null,
  model = '',
  entries = [],
} = {}) {
  return {
    version: LAYERED_CONTRACTS.enrichment.version,
    layer: LAYERED_CONTRACTS.enrichment.key,
    query: truncateText(query, 200),
    shortlistIds: compactStringArray(shortlistIds, {
      maxItems: 6,
      maxLength: 200,
    }),
    generatedAt: generatedAt || null,
    model: truncateText(model, 80),
    entries: Array.isArray(entries)
      ? entries.map((entry) => ({
          candidateId: truncateText(entry?.candidateId, 200),
          fitReason: truncateText(entry?.fitReason, 400),
          caveat: truncateText(entry?.caveat, 400),
          featureBullets: compactStringArray(entry?.featureBullets, {
            maxItems: 10,
            maxLength: 320,
          }),
        }))
      : [],
  }
}
