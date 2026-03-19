export const MAX_PRODUCT_QUERY_LENGTH = 80
export const MAX_DETAILS_LENGTH = 280

function normalizeInput(value) {
  return value.trim().replace(/\s+/g, ' ')
}

function hasEnoughLetters(value) {
  const letters = value.match(/[a-z]/gi) || []
  return letters.length >= 3
}

function hasWordLikeStructure(value) {
  return /[a-z]{2,}/i.test(value)
}

function looksLikeObviousGibberish(value) {
  const lettersOnly = value.replace(/[^a-z]/gi, '')

  if (lettersOnly.length < 4) {
    return false
  }

  return !/[aeiouy]/i.test(lettersOnly)
}

export function validateSearchInput(productQuery, details = '') {
  const normalizedQuery = normalizeInput(productQuery)
  const normalizedDetails = normalizeInput(details)

  if (!normalizedQuery) {
    return {
      isValid: false,
      error: 'Please enter a product topic first.',
      normalizedQuery,
      normalizedDetails,
    }
  }

  if (normalizedQuery.length > MAX_PRODUCT_QUERY_LENGTH) {
    return {
      isValid: false,
      error: `Keep the product topic under ${MAX_PRODUCT_QUERY_LENGTH} characters.`,
      normalizedQuery,
      normalizedDetails,
    }
  }

  if (normalizedDetails.length > MAX_DETAILS_LENGTH) {
    return {
      isValid: false,
      error: `Keep the extra context under ${MAX_DETAILS_LENGTH} characters.`,
      normalizedQuery,
      normalizedDetails,
    }
  }

  if (!hasEnoughLetters(normalizedQuery) || !hasWordLikeStructure(normalizedQuery)) {
    return {
      isValid: false,
      error: 'Try a real product topic, like "lego", "desk lamp", or "travel stroller".',
      normalizedQuery,
      normalizedDetails,
    }
  }

  if (looksLikeObviousGibberish(normalizedQuery)) {
    return {
      isValid: false,
      error: 'Try a real product topic, like "lego", "desk lamp", or "travel stroller".',
      normalizedQuery,
      normalizedDetails,
    }
  }

  return {
    isValid: true,
    error: '',
    normalizedQuery,
    normalizedDetails,
  }
}
