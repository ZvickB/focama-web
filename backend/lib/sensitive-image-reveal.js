import { readSensitiveImageVerdicts } from './storage/sensitive-image-verdict-storage.js'
import { isOperationTimeoutError, runWithTimeout } from './operation-timeout.js'

const DEFAULT_SENSITIVE_IMAGE_VERDICT_TIMEOUT_MS = 500

function getVerdictTimeoutMs(env) {
  const configured = Number(env.SENSITIVE_IMAGE_VERDICT_TIMEOUT_MS)

  if (!Number.isFinite(configured)) {
    return DEFAULT_SENSITIVE_IMAGE_VERDICT_TIMEOUT_MS
  }

  return Math.min(10_000, Math.max(50, Math.round(configured)))
}

export function isSensitiveImageRevealEnabled(env = process.env) {
  return String(env.SENSITIVE_IMAGE_REVEAL_ENABLED || '').trim().toLowerCase() === 'true'
}

export async function applyCachedSensitiveImageVerdicts(products, {
  env = process.env,
  onStorageOutcome = () => {},
} = {}) {
  if (!Array.isArray(products) || !products.length || !isSensitiveImageRevealEnabled(env)) {
    onStorageOutcome({ durationMs: 0, outcome: 'skipped' })
    return Array.isArray(products) ? products : []
  }

  const hashes = products
    .filter((product) => product?.moderation?.outcome === 'hide_image')
    .map((product) => product?.moderation?.imageUrlHash)
    .filter(Boolean)
  if (!hashes.length) {
    onStorageOutcome({ durationMs: 0, outcome: 'skipped' })
    return products
  }

  const startedAt = performance.now()
  let verdicts

  try {
    verdicts = await runWithTimeout(
      () => readSensitiveImageVerdicts(hashes),
      {
        label: 'Sensitive image verdict read',
        timeoutMs: getVerdictTimeoutMs(env),
      },
    )
    onStorageOutcome({ durationMs: performance.now() - startedAt, outcome: 'ok' })
  } catch (error) {
    const outcome = isOperationTimeoutError(error) ? 'timeout' : 'error'
    const durationMs = performance.now() - startedAt
    onStorageOutcome({ durationMs, error, outcome })
    console.warn('[sensitive-image-verdict-cache]', JSON.stringify({
      event: 'fallback',
      outcome,
      durationMs: Math.round(durationMs * 10) / 10,
    }))
    return products
  }
  let revealCount = 0
  const nextProducts = products.map((product) => {
    if (product?.moderation?.outcome !== 'hide_image') return product
    const verdict = verdicts.get(product?.moderation?.imageUrlHash)
    if (verdict?.verdict !== 'show' || !verdict.imageUrl) return product
    revealCount += 1
    return {
      ...product,
      image: verdict.imageUrl,
      ...(Object.hasOwn(product, 'thumbnail') ? { thumbnail: verdict.imageUrl } : {}),
      ...(Object.hasOwn(product, 'thumbnail_hd') ? { thumbnail_hd: verdict.imageUrl } : {}),
    }
  })

  console.info('[sensitive-image-verdict-cache]', JSON.stringify({
    event: 'read',
    requested: new Set(hashes).size,
    hits: verdicts.size,
    reveals: revealCount,
  }))
  return nextProducts
}

export async function applyCachedSensitiveImageVerdictsToGroups(groups, options = {}) {
  const normalizedGroups = (Array.isArray(groups) ? groups : []).map((group) =>
    Array.isArray(group) ? group : [],
  )
  const lengths = normalizedGroups.map((group) => group.length)
  const revealed = await applyCachedSensitiveImageVerdicts(normalizedGroups.flat(), options)
  let offset = 0
  return lengths.map((length) => {
    const group = revealed.slice(offset, offset + length)
    offset += length
    return group
  })
}
