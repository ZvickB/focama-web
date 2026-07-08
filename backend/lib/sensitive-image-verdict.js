import { createHash } from 'node:crypto'

export const SENSITIVE_IMAGE_DECISION_VERSION = 'sightengine-people-face-v1'

export function normalizeSensitiveImageUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (url.protocol !== 'https:') return ''
    url.hostname = url.hostname.toLowerCase()
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

export function hashSensitiveImageUrl(value) {
  const imageUrl = normalizeSensitiveImageUrl(value)
  return imageUrl ? createHash('sha256').update(imageUrl).digest('hex') : ''
}

export function isCurrentSensitiveImageVerdict(verdict) {
  return Boolean(
    verdict &&
    verdict.decisionVersion === SENSITIVE_IMAGE_DECISION_VERSION &&
    (verdict.verdict === 'show' || verdict.verdict === 'hide'),
  )
}
