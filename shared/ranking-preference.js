export const RANKING_PREFERENCES = Object.freeze({
  BALANCED: 'balanced',
  PRICE: 'price',
  BRAND: 'brand',
  RANGE: 'range',
})

export const RANKING_PREFERENCE_VALUES = Object.freeze(Object.values(RANKING_PREFERENCES))

export const RANKING_PREFERENCE_LABELS = Object.freeze({
  [RANKING_PREFERENCES.BALANCED]: 'Balanced',
  [RANKING_PREFERENCES.PRICE]: 'Lowest price',
  [RANKING_PREFERENCES.BRAND]: 'Known brands',
  [RANKING_PREFERENCES.RANGE]: 'Range of options',
})

export const RANKING_PREFERENCE_ACTIVE_LABELS = Object.freeze({
  [RANKING_PREFERENCES.PRICE]: 'Prioritizing lowest price',
  [RANKING_PREFERENCES.BRAND]: 'Prioritizing known brands',
  [RANKING_PREFERENCES.RANGE]: 'Showing a wider range',
})

export function normalizeRankingPreference(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return RANKING_PREFERENCE_VALUES.includes(normalized)
    ? normalized
    : RANKING_PREFERENCES.BALANCED
}

export function isActiveRankingPreference(value) {
  return normalizeRankingPreference(value) !== RANKING_PREFERENCES.BALANCED
}
