import { readSensitiveImageVerdicts } from './storage/sensitive-image-verdict-storage.js'

export function isSensitiveImageRevealEnabled(env = process.env) {
  return String(env.SENSITIVE_IMAGE_REVEAL_ENABLED || '').trim().toLowerCase() === 'true'
}

export async function applyCachedSensitiveImageVerdicts(products, { env = process.env } = {}) {
  if (!Array.isArray(products) || !products.length || !isSensitiveImageRevealEnabled(env)) {
    return Array.isArray(products) ? products : []
  }

  const hashes = products
    .filter((product) => product?.moderation?.outcome === 'hide_image')
    .map((product) => product?.moderation?.imageUrlHash)
    .filter(Boolean)
  if (!hashes.length) return products

  const verdicts = await readSensitiveImageVerdicts(hashes)
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
