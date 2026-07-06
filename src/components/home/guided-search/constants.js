import { AMAZON_MARKETPLACE_AUTO } from '@/contexts/amazonStoreConstants.js'

export const RESULT_CARD_COUNT = 6
export const RESULT_CARD_SLOTS = Array.from({ length: RESULT_CARD_COUNT }, (_, index) => index)
export const MAX_REFINEMENT_RETRIES = 2
export const FINAL_RESULT_BADGE_REVEAL_DELAY_MS = 240
export const ENRICHMENT_POLL_INTERVAL_MS = 1500
export const ENRICHMENT_POLL_TIMEOUT_MS = 30000
export const QUERY_QUALITY_POLL_INTERVAL_MS = 1500
export const QUERY_QUALITY_POLL_TIMEOUT_MS = 20000

export function resolvePollInterval(overrideKey, fallbackMs) {
  if (typeof window === 'undefined') return fallbackMs
  const override = window[overrideKey]
  return typeof override === 'number' && Number.isFinite(override) && override > 0
    ? override
    : fallbackMs
}

export const FINALIZE_REQUEST_MODE_DEFAULT = 'guided_finalize'
export const FINALIZE_REQUEST_MODE_EMPTY_NOTES = 'guided_empty_notes'
export const FINALIZE_REQUEST_MODE_REFINED = 'guided_refined'

export const HARD_CONSTRAINT_PATTERNS = [
  {
    category: 'jewish_kosher',
    terms: [
      'kosher',
      'kosher certified',
      'hechsher',
      'hechser',
      'pareve',
      'parve',
      'cholov yisroel',
      'chalav yisrael',
      'cholov israel',
      'pas yisroel',
      'pat yisrael',
      'bishul yisroel',
      'bishul yisrael',
      'shabbos',
      'shabbat',
      'passover',
      'pesach',
      'kitniyot',
      'kitniyos',
      'gebrochts',
      'non gebrochts',
      'mevushal',
      'havdalah',
      'havdala',
      'blech',
      'plata',
      'shabbos lamp',
      'shabbat lamp',
      'hot plate',
    ],
  },
  {
    category: 'dietary_allergy',
    terms: [
      'vegan',
      'vegetarian',
      'dairy free',
      'non dairy',
      'no dairy',
      'gluten free',
      'nut free',
      'peanut free',
      'tree nut free',
      'soy free',
      'egg free',
      'sesame free',
      'sugar free',
      'low sugar',
      'caffeine free',
      'allergy',
      'allergen',
      'safe for allergy',
    ],
  },
  {
    category: 'safety_material',
    terms: [
      'hypoallergenic',
      'fragrance free',
      'latex free',
      'bpa free',
      'phthalate free',
      'paraben free',
      'non toxic',
      'lead free',
      'pfas free',
      'food safe',
      'baby safe',
      'toddler safe',
      'sensitive skin',
    ],
  },
  {
    category: 'compatibility_exclusion',
    terms: [
      'compatible with',
      'fits',
      'replacement for',
      'works with',
      'free of',
      'voltage',
      'wattage',
    ],
  },
]


export const HARD_CONSTRAINT_COMPACT_TERMS = new Set(
  HARD_CONSTRAINT_PATTERNS.flatMap(({ terms }) =>
    terms
      .filter((term) => /\s/.test(term))
      .map((term) => term.replace(/\s+/g, '')),
  ),
)

export function roundTiming(value) {
  return Math.round(value * 10) / 10
}

export function parseServerTimingHeader(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return {}
  }

  return Object.fromEntries(
    headerValue
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [namePart, ...params] = entry.split(';').map((part) => part.trim())
        const durationParam = params.find((part) => part.startsWith('dur='))
        const duration = durationParam ? Number(durationParam.slice(4)) : null

        return [namePart, Number.isFinite(duration) ? duration : null]
      })
      .filter(([, duration]) => Number.isFinite(duration)),
  )
}

export function createFallbackRefinementPrompt(productQuery) {
  return {
    prompt: `What should we optimize for with this ${productQuery}?`,
    alternatePrompt: 'Is there a budget, size, or must-have feature you do not want to compromise on?',
    helperText:
      'Use this step for natural-language details like budget, size, comfort, style, or where you plan to use it.',
    followUpPlaceholder:
      'Example: I want something lightweight for daily travel, under $200, and easy to clean.',
  }
}
export function createExpiredSessionMessage() {
  return 'Your search session expired. Start a new search.'
}

export function appendAmazonDomain(searchParams, amazonDomain) {
  if (amazonDomain && amazonDomain !== AMAZON_MARKETPLACE_AUTO) {
    searchParams.set('amazonDomain', amazonDomain)
  }
}

export function normalizeConstraintText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[-/_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function detectHardConstraint(text) {
  const normalizedText = normalizeConstraintText(text)

  if (!normalizedText) {
    return {
      category: '',
      matchedTerm: '',
      shouldRefresh: false,
    }
  }

  const paddedText = ` ${normalizedText} `
  const compactText = normalizedText.replace(/\s+/g, '')

  for (const { category, terms } of HARD_CONSTRAINT_PATTERNS) {
    for (const term of terms) {
      const normalizedTerm = normalizeConstraintText(term)
      const compactTerm = normalizedTerm.replace(/\s+/g, '')

      if (
        paddedText.includes(` ${normalizedTerm} `) ||
        (HARD_CONSTRAINT_COMPACT_TERMS.has(compactTerm) && compactText.includes(compactTerm))
      ) {
        return {
          category,
          matchedTerm: normalizedTerm,
          shouldRefresh: true,
        }
      }
    }
  }

  if (/\bno\s+\w{2,40}\b/.test(normalizedText)) {
    return {
      category: 'compatibility_exclusion',
      matchedTerm: 'no',
      shouldRefresh: true,
    }
  }

  return {
    category: '',
    matchedTerm: '',
    shouldRefresh: false,
  }
}

export function resolveAmazonDomainForRequest(selectedAmazonDomain, resolvedAmazonDomain) {
  if (selectedAmazonDomain && selectedAmazonDomain !== AMAZON_MARKETPLACE_AUTO) {
    return selectedAmazonDomain
  }

  if (resolvedAmazonDomain && resolvedAmazonDomain !== AMAZON_MARKETPLACE_AUTO) {
    return resolvedAmazonDomain
  }

  return AMAZON_MARKETPLACE_AUTO
}
