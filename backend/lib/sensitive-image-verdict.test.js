import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { applyProductModeration } from './content-moderation.js'
import { applyCachedSensitiveImageVerdicts, isSensitiveImageRevealEnabled } from './sensitive-image-reveal.js'
import {
  hashSensitiveImageUrl,
  normalizeSensitiveImageUrl,
  SENSITIVE_IMAGE_DECISION_VERSION,
} from './sensitive-image-verdict.js'
import {
  resetSensitiveImageVerdictMemory,
  writeSensitiveImageVerdict,
} from './storage/sensitive-image-verdict-storage.js'

const IMAGE_URL = 'https://M.MEDIA-AMAZON.COM/images/I/example.jpg#fragment'

describe('sensitive image verdict cache', () => {
  let originalStorageMode

  beforeAll(() => {
    originalStorageMode = process.env.SENSITIVE_IMAGE_VERDICT_STORAGE
    process.env.SENSITIVE_IMAGE_VERDICT_STORAGE = 'memory'
  })

  afterAll(() => {
    if (originalStorageMode === undefined) delete process.env.SENSITIVE_IMAGE_VERDICT_STORAGE
    else process.env.SENSITIVE_IMAGE_VERDICT_STORAGE = originalStorageMode
  })

  beforeEach(() => {
    resetSensitiveImageVerdictMemory()
  })

  it('normalizes conservatively and hashes deterministically', () => {
    expect(normalizeSensitiveImageUrl(IMAGE_URL)).toBe('https://m.media-amazon.com/images/I/example.jpg')
    expect(hashSensitiveImageUrl(IMAGE_URL)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashSensitiveImageUrl(IMAGE_URL)).toBe(
      hashSensitiveImageUrl('https://m.media-amazon.com/images/I/example.jpg'),
    )
  })

  it('retains the server-safe hash when a cached hidden product is moderated again', () => {
    const first = applyProductModeration({ title: "Women's Swimsuit", image: IMAGE_URL })
    const second = applyProductModeration(first)
    expect(first.image).toBe('')
    expect(second.moderation.imageUrlHash).toBe(first.moderation.imageUrlHash)
    expect(second.moderation).not.toHaveProperty('imageUrl')
  })

  it('keeps reveal behavior disabled unless separately enabled', () => {
    expect(isSensitiveImageRevealEnabled({})).toBe(false)
    expect(isSensitiveImageRevealEnabled({ SENSITIVE_IMAGE_REVEAL_ENABLED: 'true' })).toBe(true)
  })

  it('reveals only a successful current show verdict', async () => {
    const product = applyProductModeration({ title: "Women's Swimsuit", image: IMAGE_URL })
    await writeSensitiveImageVerdict({
      imageUrl: IMAGE_URL,
      imageUrlHash: product.moderation.imageUrlHash,
      verdict: 'show',
      reasons: ['no_person_or_face_detected'],
      decisionVersion: SENSITIVE_IMAGE_DECISION_VERSION,
    })

    const disabled = await applyCachedSensitiveImageVerdicts([product], { env: {} })
    const enabled = await applyCachedSensitiveImageVerdicts([product], {
      env: { SENSITIVE_IMAGE_REVEAL_ENABLED: 'true' },
    })
    expect(disabled[0].image).toBe('')
    expect(enabled[0].image).toBe('https://m.media-amazon.com/images/I/example.jpg')
  })

  it('keeps missing and hide verdicts hidden', async () => {
    const product = applyProductModeration({ title: "Women's Swimsuit", image: IMAGE_URL })
    const missing = await applyCachedSensitiveImageVerdicts([product], {
      env: { SENSITIVE_IMAGE_REVEAL_ENABLED: 'true' },
    })
    expect(missing[0].image).toBe('')

    await writeSensitiveImageVerdict({
      imageUrl: IMAGE_URL,
      imageUrlHash: product.moderation.imageUrlHash,
      verdict: 'hide',
      reasons: ['person_present_or_uncertain'],
    })
    const hidden = await applyCachedSensitiveImageVerdicts([product], {
      env: { SENSITIVE_IMAGE_REVEAL_ENABLED: 'true' },
    })
    expect(hidden[0].image).toBe('')
  })
})
