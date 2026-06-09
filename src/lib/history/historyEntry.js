const QUERY_KEY_SEPARATOR = '\u0001'

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `history-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function normalizeHistoryText(value) {
  return String(value ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

export function makeQueryKey(query, followUp = '') {
  return [
    normalizeHistoryText(query),
    normalizeHistoryText(followUp),
  ].join(QUERY_KEY_SEPARATOR)
}

export function createHistoryEntry({
  amazonDomain = '',
  followUp = '',
  id,
  query,
  results = [],
  createdAt,
  updatedAt,
} = {}) {
  const displayQuery = String(query ?? '').trim()
  const displayFollowUp = String(followUp ?? '').trim()
  const now = new Date().toISOString()

  return {
    id: id || randomId(),
    queryKey: makeQueryKey(displayQuery, displayFollowUp),
    query: displayQuery,
    followUp: displayFollowUp,
    amazonDomain: String(amazonDomain ?? '').trim(),
    results: Array.isArray(results) ? results : [],
    createdAt: createdAt || now,
    updatedAt: updatedAt || now,
  }
}
