import { getUserFacingDescription, getUserFacingReasons } from '@/components/home/homeContentUtils.js'

export function handleRetryFeedbackKeyDown(event, { canSubmit, onSubmit }) {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) {
    return
  }

  event.preventDefault()

  if (canSubmit) {
    onSubmit()
  }
}

export function getRatingValue(rating) {
  if (rating === null || rating === undefined || rating === '' || typeof rating === 'boolean') {
    return null
  }

  const ratingValue = Number(rating)

  return Number.isFinite(ratingValue) ? ratingValue : null
}

export function formatReviewCount(reviewCount) {
  const reviewCountValue = Number(reviewCount)

  if (!Number.isFinite(reviewCountValue) || reviewCountValue <= 0) {
    return ''
  }

  return `${reviewCountValue.toLocaleString()} reviews`
}

export function formatRatingsReviewsText(item) {
  const ratingValue = getRatingValue(item?.rating)
  const reviewText = formatReviewCount(item?.reviewCount)

  if (ratingValue && reviewText) return `${ratingValue.toFixed(1)} stars · ${reviewText}`
  if (ratingValue) return `${ratingValue.toFixed(1)} stars`
  return reviewText || 'No rating'
}

export function getFeatureBullets(item) {
  return Array.isArray(item?.feature_bullets)
    ? item.feature_bullets.map((bullet) => String(bullet || '').trim()).filter(Boolean)
    : []
}

export function hasPendingReason({ hasFinalResults, isEnrichmentSettled, item }) {
  const fitReason = String(item?.fit_reason || item?.fitReason || '').trim()
  const caveat = String(item?.caveat || '').trim()
  const primaryReason = getUserFacingReasons(item?.reasons || [])[0] || ''
  const description = getUserFacingDescription(item?.productDescription || item?.description)
  const featureBullets = getFeatureBullets(item)

  return (
    hasFinalResults &&
    !isEnrichmentSettled &&
    !fitReason &&
    !primaryReason &&
    !description &&
    !caveat &&
    !featureBullets[0]
  )
}

export function getShortReason(item, { hasFinalResults }) {
  const fitReason = String(item?.fit_reason || item?.fitReason || '').trim()
  const caveat = String(item?.caveat || '').trim()
  const primaryReason = getUserFacingReasons(item?.reasons || [])[0] || ''
  const description = getUserFacingDescription(item?.productDescription || item?.description)
  const featureBullets = getFeatureBullets(item)

  if (fitReason) return fitReason
  if (primaryReason) return primaryReason
  if (description) return description
  if (caveat) return caveat
  if (featureBullets[0]) return featureBullets[0]

  return hasFinalResults ? 'Open details for product facts and retailer info.' : ''
}
